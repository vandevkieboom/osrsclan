// Polls RuneProfile's public clan-activities feed (the same endpoint
// src/page/activity-page.tsx calls directly from the browser) and posts any
// activity newer than the last one we've seen to a Discord webhook. Run on a
// schedule by .github/workflows/post-activity.yml — Vercel's Hobby plan cron
// only fires once a day, too slow for a "near real-time" activity feed, so
// this runs outside Vercel instead.
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL (or POSTGRES_URL) environment variable is not set",
  );
}

const webhookUrl = process.env.DISCORD_ACTIVITY_WEBHOOK_URL;
if (!webhookUrl) {
  console.log("DISCORD_ACTIVITY_WEBHOOK_URL not set, skipping this run.");
  process.exit(0);
}

const sql = neon(connectionString);

const CLAN = "Time Served";
const POLL_LIMIT = 50;
// Mirrors ACTIVITY_TYPES in src/page/activity-page.tsx (minus the "all" filter option).
const ALL_TYPES = [
  "level_up",
  "new_item_obtained",
  "valuable_drop",
  "combat_achievement_tier_reached",
  "achievement_diary_tier_completed",
  "quest_completed",
  "xp_milestone",
  "maxed",
].join(",");

// Same as ACCOUNT_ICONS in activity-page.tsx.
const ACCOUNT_ICONS = {
  ironman: "https://oldschool.runescape.wiki/images/Ironman_chat_badge.png",
  hardcore_ironman: "https://oldschool.runescape.wiki/images/Hardcore_ironman_chat_badge.png",
  ultimate_ironman: "https://oldschool.runescape.wiki/images/Ultimate_ironman_chat_badge.png",
  group_ironman: "https://oldschool.runescape.wiki/images/Group_ironman_chat_badge.png",
  hardcore_group_ironman: "https://oldschool.runescape.wiki/images/Hardcore_group_ironman_chat_badge.png",
};

const CA_TIERS = {
  1: "Easy",
  2: "Medium",
  3: "Hard",
  4: "Elite",
  5: "Master",
  6: "Grandmaster",
};

// Same per-type accent colors as HIGHLIGHT_COLORS in activity-page.tsx —
// the left bar Discord renders from `color` should match the site's own
// per-type colors, not an independent palette.
const HIGHLIGHT_COLORS = {
  new_item_obtained: 0x5b9bd5,
  valuable_drop: 0xd4b158,
  achievement_diary_tier_completed: 0x5fbf6a,
  level_up: 0xe8574a,
  xp_milestone: 0xe8574a,
};
const DEFAULT_COLOR = 0xf0e8e6;

function skillDisplayName(name) {
  const lower = name.toLowerCase();
  if (lower === "runecraft") return "Runecrafting";
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function skillIconUrl(skillName) {
  const key = skillName.toLowerCase() === "runecraft" ? "runecrafting" : skillName.toLowerCase();
  return `https://cdn.jsdelivr.net/gh/wise-old-man/wise-old-man@master/app/public/img/metrics/${key}.png`;
}

function itemIconUrl(itemId) {
  return `https://static.runelite.net/cache/item/icon/${itemId}.png`;
}

function capitalizeFirst(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatXp(xp) {
  if (xp >= 1_000_000_000) return `${+(xp / 1_000_000_000).toFixed(1)}B`;
  if (xp >= 1_000_000) return `${+(xp / 1_000_000).toFixed(1)}M`;
  if (xp >= 1_000) return `${+(xp / 1_000).toFixed(1)}K`;
  return xp.toLocaleString();
}

// Builds a Discord embed for one RuneProfile activity, mirroring the
// per-type descriptions in activity-page.tsx's ActivityRow.
function buildEmbed(activity) {
  const { type, data, enriched, createdAt, account } = activity;
  const username = account.username;
  const accountIcon = ACCOUNT_ICONS[account.accountType?.key?.toLowerCase()] ?? null;
  const profileUrl = `https://timeserved.vercel.app/profile?${new URLSearchParams({ rsn: username })}`;
  const color = HIGHLIGHT_COLORS[type] ?? DEFAULT_COLOR;

  let thumbnail = null;
  let description;

  if (type === "level_up") {
    thumbnail = skillIconUrl(data.name ?? "");
    description =
      data.level !== undefined
        ? `reached level **${data.level}** in **${skillDisplayName(data.name ?? "")}**`
        : `leveled up **${skillDisplayName(data.name ?? "")}**`;
  } else if (type === "valuable_drop") {
    if (data.itemId) thumbnail = itemIconUrl(data.itemId);
    const label =
      data.value !== undefined ? `${formatXp(data.value)} gp` : String(enriched?.itemName ?? "Unknown item");
    description = `received a valuable drop worth **${label}**`;
  } else if (type === "new_item_obtained") {
    if (data.itemId) thumbnail = itemIconUrl(data.itemId);
    description = `added **${String(enriched?.itemName ?? "an item")}** to their collection log`;
  } else if (type === "quest_completed") {
    description = `completed **${String(enriched?.questName ?? "a quest")}**`;
  } else if (type === "achievement_diary_tier_completed") {
    const area = enriched?.areaName ? String(enriched.areaName) : null;
    const tier = enriched?.tierName ? String(enriched.tierName) : null;
    description = `completed the **${[tier, area, "Achievement Diary"].filter(Boolean).join(" ")}**`;
  } else if (type === "combat_achievement_tier_reached") {
    const tierName = data.tierId !== undefined ? (CA_TIERS[data.tierId] ?? `Tier ${data.tierId}`) : "a";
    description = `reached **${tierName}** combat achievement tier`;
  } else if (type === "maxed") {
    description = "achieved **max level in all skills**";
  } else if (type === "xp_milestone") {
    thumbnail = skillIconUrl(data.name ?? "overall");
    const xpStr = data.xp !== undefined ? `${formatXp(data.xp)} XP` : "an XP milestone";
    description = `reached **${xpStr}** in **${skillDisplayName(data.name ?? "Overall")}**`;
  } else {
    description = type.replace(/_/g, " ");
  }

  return {
    // `author` puts the account-type badge + name in a header row once, and
    // links to their site profile — Discord always renders a linked
    // name/title in its fixed blue, but since the name isn't repeated
    // anywhere else (see `description` below), there's no duplicate to
    // clash with a plain white version.
    author: { name: username, icon_url: accountIcon ?? undefined, url: profileUrl },
    description: capitalizeFirst(description),
    color,
    thumbnail: thumbnail ? { url: thumbnail } : undefined,
    timestamp: createdAt,
  };
}

async function postEmbeds(embeds) {
  // Discord accepts up to 10 embeds per message; batch and pace requests to
  // stay well under the per-webhook rate limit.
  for (let i = 0; i < embeds.length; i += 10) {
    const batch = embeds.slice(i, i + 10);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: batch }),
    });
    if (!res.ok) {
      throw new Error(`Discord webhook returned ${res.status}: ${await res.text()}`);
    }
    if (i + 10 < embeds.length) await new Promise((r) => setTimeout(r, 750));
  }
}

async function main() {
  const stateRows = await sql`SELECT last_posted_at FROM activity_poller_state WHERE id = 1`;
  const lastPostedAt = new Date(stateRows[0]?.last_posted_at ?? 0);

  const params = new URLSearchParams({
    limit: String(POLL_LIMIT),
    activityTypes: ALL_TYPES,
    direction: "next",
    cursor: "",
  });
  const res = await fetch(
    `https://api.runeprofile.com/v1/clans/${encodeURIComponent(CLAN)}/activities?${params}`,
  );
  if (!res.ok) {
    throw new Error(`RuneProfile activities fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const activities = data.activities ?? [];

  const fresh = activities
    .filter((a) => new Date(a.createdAt) > lastPostedAt)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (fresh.length === 0) {
    console.log("No new activity since", lastPostedAt.toISOString());
    return;
  }

  if (fresh.length === POLL_LIMIT) {
    console.warn(
      `Fetched activities filled the ${POLL_LIMIT}-item page limit — some activity between polls may have been missed.`,
    );
  }

  await postEmbeds(fresh.map(buildEmbed));

  const newest = fresh[fresh.length - 1].createdAt;
  await sql`UPDATE activity_poller_state SET last_posted_at = ${newest} WHERE id = 1`;
  console.log(`Posted ${fresh.length} activities, advanced cursor to ${newest}`);
}

await main();
