import { sql } from "./db.js";

// Polls RuneProfile's public clan-activities feed (the same endpoint
// src/page/activity-page.tsx calls directly from the browser) and posts any
// activity newer than the last one we've seen to a Discord webhook. Called
// from the `activity-post` resource in runeprofile-proxy.ts, itself invoked
// on a schedule by an external cron service (see README) rather than
// Vercel's own cron, which on the Hobby plan only fires once a day.

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
const ACCOUNT_ICONS: Record<string, string> = {
  ironman: "https://oldschool.runescape.wiki/images/Ironman_chat_badge.png",
  hardcore_ironman: "https://oldschool.runescape.wiki/images/Hardcore_ironman_chat_badge.png",
  ultimate_ironman: "https://oldschool.runescape.wiki/images/Ultimate_ironman_chat_badge.png",
  group_ironman: "https://oldschool.runescape.wiki/images/Group_ironman_chat_badge.png",
  hardcore_group_ironman: "https://oldschool.runescape.wiki/images/Hardcore_group_ironman_chat_badge.png",
};

const CA_TIERS: Record<number, string> = {
  1: "Easy",
  2: "Medium",
  3: "Hard",
  4: "Elite",
  5: "Master",
  6: "Grandmaster",
};

// Same per-type accent colors as HIGHLIGHT_COLORS in activity-page.tsx — the
// left bar Discord renders from `color` should match the site's own
// per-type colors, not an independent palette.
const HIGHLIGHT_COLORS: Record<string, number> = {
  new_item_obtained: 0x5b9bd5,
  valuable_drop: 0xd4b158,
  achievement_diary_tier_completed: 0x5fbf6a,
  level_up: 0xe8574a,
  xp_milestone: 0xe8574a,
};
const DEFAULT_COLOR = 0xf0e8e6;

export interface RuneProfileActivity {
  type: string;
  data: {
    name?: string;
    level?: number;
    itemId?: number;
    value?: number;
    tierId?: number;
    xp?: number;
  };
  enriched?: Record<string, string | number | boolean | null | undefined>;
  createdAt: string;
  account: {
    username: string;
    accountType: { key: string };
  };
}

interface DiscordEmbed {
  author: { name: string; icon_url?: string; url: string };
  description: string;
  color: number;
  thumbnail?: { url: string };
  timestamp: string;
}

function skillDisplayName(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "runecraft") return "Runecrafting";
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function skillIconUrl(skillName: string): string {
  const key = skillName.toLowerCase() === "runecraft" ? "runecrafting" : skillName.toLowerCase();
  return `https://cdn.jsdelivr.net/gh/wise-old-man/wise-old-man@master/app/public/img/metrics/${key}.png`;
}

function itemIconUrl(itemId: number): string {
  return `https://static.runelite.net/cache/item/icon/${itemId}.png`;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatXp(xp: number): string {
  if (xp >= 1_000_000_000) return `${+(xp / 1_000_000_000).toFixed(1)}B`;
  if (xp >= 1_000_000) return `${+(xp / 1_000_000).toFixed(1)}M`;
  if (xp >= 1_000) return `${+(xp / 1_000).toFixed(1)}K`;
  return xp.toLocaleString();
}

// Builds a Discord embed for one RuneProfile activity, mirroring the
// per-type descriptions in activity-page.tsx's ActivityRow.
function buildEmbed(activity: RuneProfileActivity): DiscordEmbed {
  const { type, data, enriched, createdAt, account } = activity;
  const username = account.username;
  const accountIcon = ACCOUNT_ICONS[account.accountType?.key?.toLowerCase()];
  const profileUrl = `https://timeserved.vercel.app/profile?${new URLSearchParams({ rsn: username })}`;
  const color = HIGHLIGHT_COLORS[type] ?? DEFAULT_COLOR;

  let thumbnail: string | null = null;
  let description: string;

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
    author: { name: username, icon_url: accountIcon, url: profileUrl },
    description: capitalizeFirst(description),
    color,
    thumbnail: thumbnail ? { url: thumbnail } : undefined,
    timestamp: createdAt,
  };
}

async function postEmbeds(webhookUrl: string, embeds: DiscordEmbed[]) {
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

export async function postNewActivities(): Promise<{ posted: number; message: string }> {
  const webhookUrl = process.env.DISCORD_ACTIVITY_WEBHOOK_URL;

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
  const data = (await res.json()) as { activities?: RuneProfileActivity[] };
  const activities = data.activities ?? [];

  // Refreshed every poll cycle regardless of what's new for Discord —
  // src/page/activity-page.tsx reads from this table instead of calling
  // RuneProfile directly, so it needs the latest snapshot even on a
  // "nothing new to post" cycle.
  await sql`UPDATE activity_feed_cache SET activities = ${JSON.stringify(activities)}::jsonb, updated_at = now() WHERE id = 1`;

  const fresh = activities
    .filter((a) => new Date(a.createdAt) > lastPostedAt)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (fresh.length === 0) {
    return { posted: 0, message: `No new activity since ${lastPostedAt.toISOString()}` };
  }

  if (!webhookUrl) {
    return { posted: 0, message: "DISCORD_ACTIVITY_WEBHOOK_URL not set, skipping Discord post." };
  }

  let message = `Posted ${fresh.length} activities`;
  if (fresh.length === POLL_LIMIT) {
    message += ` (hit the ${POLL_LIMIT}-item page limit — some activity between polls may have been missed)`;
  }

  await postEmbeds(webhookUrl, fresh.map(buildEmbed));

  const newest = fresh[fresh.length - 1].createdAt;
  await sql`UPDATE activity_poller_state SET last_posted_at = ${newest} WHERE id = 1`;
  return { posted: fresh.length, message: `${message}, advanced cursor to ${newest}` };
}

const FEED_PAGE_SIZE = 20;

// Read-only: serves src/page/activity-page.tsx's requests from the cache
// postNewActivities() maintains, instead of that page calling RuneProfile
// directly (see activity_feed_cache in db/schema.sql for why).
export async function getCachedActivityFeed(
  typesFilter: string[] | null,
): Promise<{ activities: RuneProfileActivity[]; updatedAt: string | null }> {
  const rows = await sql`SELECT activities, updated_at FROM activity_feed_cache WHERE id = 1`;
  const all = (rows[0]?.activities as RuneProfileActivity[] | undefined) ?? [];
  const filtered = typesFilter ? all.filter((a) => typesFilter.includes(a.type)) : all;
  return {
    activities: filtered.slice(0, FEED_PAGE_SIZE),
    updatedAt: rows[0]?.updated_at ?? null,
  };
}
