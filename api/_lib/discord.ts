import { createPublicKey, verify } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { sql } from "./db.js";
import { lookupRankProgress, resolveMemberProfile } from "./rank-lookup.js";
import { ranks } from "../../src/data/ranks-data.js";
import { getRankForRole } from "../../src/services/profile.js";
import { METRIC_GROUPS } from "../../src/services/wom.js";

// The same Discord application the website's OAuth login uses, with a bot
// user added. The bot does not run anywhere: Discord POSTs button clicks and
// form submissions to the Interactions Endpoint URL set in the developer
// portal (`/api/auth/me?resource=discord-interactions`), and this answers
// them like any other request. One request per click, nothing on a timer.
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY ?? "";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
const GUILD_ID = process.env.DISCORD_GUILD_ID ?? "";

const API = "https://discord.com/api/v10";

// The Time Served server's member role and the channels the bot points to.
// The member role is granted to anyone whose RSN is in the WOM clan group.
const MEMBER_ROLE_ID = "1501333285421322410";
const RANKS_CHANNEL = "<#1503144145404035254>";
// Where the Verify button is.
const VERIFY_CHANNEL = "<#1556700749059067964>";
const LOG_CHANNEL_ID = "1556708563991269446";

// Taken away, together with the member role, from anyone who leaves the clan.
const RANK_ROLES: Record<string, string> = {
  "1504249730576945302": "Sapphire",
  "1504249773274955816": "Emerald",
  "1504249796934893779": "Ruby",
  "1504249839620198491": "Diamond",
  "1504249866162012210": "Dragonstone",
  "1504249909363347596": "Onyx",
  "1504249934486962206": "Zenyte",
  "1504252647392280658": "Infernal",
};

// Keep in sync with WOM_GROUP_ID in src/constants.ts, vite.config.ts,
// api/wom-proxy.ts, api/runeprofile-proxy.ts and api/_lib/board.ts.
const WOM_GROUP_ID = 22206;
const WOM_BASE_URL = "https://api.wiseoldman.net/v2";
// Same headers as the WOM calls elsewhere in api/, which are known to work
// from Vercel.
const WOM_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent": "vandevkieboom",
  ...(process.env.WOM_API_KEY ? { "x-api-key": process.env.WOM_API_KEY } : {}),
};

// Everything the bot does runs after Discord already has its "thinking…"
// reply, and Discord allows the real answer 15 minutes, so a slow upstream
// only needs a generous ceiling, not a tight one. From Vercel's region WOM's
// group endpoint was measured at 3-4.5s against ~1s locally, and the 5-8s
// limits first used here timed out in production.
const UPSTREAM_TIMEOUT_MS = 20_000;

// fetch() with that ceiling, whose error names the request and how long it
// ran: a bare "The operation was aborted due to timeout" in the logs says
// nothing about which of the several calls behind one reply was slow.
async function fetchWithin(url: string, init: RequestInit = {}): Promise<Response> {
  const started = Date.now();
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(
      `${init.method ?? "GET"} ${url.split("?")[0]} failed after ${Date.now() - started}ms`,
      { cause: err },
    );
  }
}

export const SET_RSN_BUTTON_ID = "set-rsn";
const SET_RSN_MODAL_ID = "set-rsn-modal";
const RSN_INPUT_ID = "rsn";

// OSRS display names: 1-12 characters, letters, digits, spaces, hyphens and
// underscores. Anything else in a nickname ("Zezima | Admin", emoji) is not
// an RSN, so it must never be copied onto a website profile.
const RSN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,11}$/;

export function normalizeRsn(raw: string): string | null {
  const rsn = raw.trim().replace(/\s+/g, " ");
  return RSN_PATTERN.test(rsn) ? rsn : null;
}

const InteractionType = {
  PING: 1,
  COMMAND: 2,
  COMPONENT: 3,
  MODAL_SUBMIT: 5,
} as const;
const ResponseType = {
  PONG: 1,
  MESSAGE: 4,
  DEFERRED_MESSAGE: 5,
  MODAL: 9,
} as const;
const EPHEMERAL = 1 << 6;

interface Interaction {
  type: number;
  application_id: string;
  token: string;
  guild_id?: string;
  member?: {
    nick?: string | null;
    roles: string[];
    user: { id: string };
  };
  data?: {
    custom_id?: string;
    components?: { components: { custom_id: string; value: string }[] }[];
    // Slash commands.
    name?: string;
    options?: { name: string; value: string }[];
  };
}

// A message body for a reply: text, embeds, or both.
interface ReplyBody {
  content?: string;
  embeds?: object[];
}

/**
 * Discord wants an answer within 3 seconds, which a cold database or a slow
 * WOM/RuneProfile can't promise. So the immediate answer is "thinking…" and
 * the real reply replaces it once `work` is done.
 */
function replyLater(
  res: VercelResponse,
  interaction: Interaction,
  work: () => Promise<ReplyBody>,
  { ephemeral }: { ephemeral: boolean },
) {
  res.status(200).json({
    type: ResponseType.DEFERRED_MESSAGE,
    data: ephemeral ? { flags: EPHEMERAL } : {},
  });
  const started = Date.now();
  const what = interaction.data?.name ? `/${interaction.data.name}` : "Verify";
  waitUntil(
    work()
      .catch((err): ReplyBody => {
        console.error(
          `Discord ${what} failed after ${Date.now() - started}ms:`,
          err,
          err instanceof Error ? err.cause : "",
        );
        return { content: "Something went wrong. Try again, or contact a mod." };
      })
      .then((body) =>
        fetch(
          `${API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, allowed_mentions: { parse: [] } }),
          },
        ),
      )
      // fetch() only throws when the request can't be sent; a rejected edit
      // leaves the user on "thinking…" forever, so log it as well.
      .then(async (r) => {
        if (!r.ok) {
          console.error(
            `Discord ${what} reply was rejected:`,
            r.status,
            await r.text(),
          );
        }
      })
      .catch((err) => console.error("Discord follow-up failed:", err)),
  );
}

// Discord signs the raw bytes, so the body has to be read before (and
// instead of) the runtime's JSON parsing - re-serialising req.body would not
// reproduce them.
function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Node takes Ed25519 public keys as SPKI DER; this prefix wraps Discord's raw
// 32-byte hex key into one.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const MAX_REQUEST_AGE_SECONDS = 5 * 60;

function isValidSignature(req: VercelRequest, body: Buffer): boolean {
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  if (typeof signature !== "string" || typeof timestamp !== "string") {
    return false;
  }
  // The timestamp is signed too, so refusing old ones stops a captured
  // request from being sent again later.
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!(ageSeconds <= MAX_REQUEST_AGE_SECONDS)) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(PUBLIC_KEY, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.concat([Buffer.from(timestamp), body]),
      key,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

function reply(res: VercelResponse, content: string) {
  res.status(200).json({
    type: ResponseType.MESSAGE,
    data: { content, flags: EPHEMERAL },
  });
}

function showRsnModal(res: VercelResponse, interaction: Interaction) {
  const current = normalizeRsn(interaction.member?.nick ?? "");
  res.status(200).json({
    type: ResponseType.MODAL,
    data: {
      custom_id: SET_RSN_MODAL_ID,
      title: "Set your in-game name",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: RSN_INPUT_ID,
              label: "Your exact Old School RuneScape name",
              style: 1,
              min_length: 1,
              max_length: 12,
              required: true,
              ...(current ? { value: current } : {}),
            },
          ],
        },
      ],
    },
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Retries when Discord rate-limits, which it does quickly on member search
// (10 per 10 seconds, measured): a 429 there would otherwise read as "that
// name is taken" to the button and abort the leaver sync.
async function botFetch(
  path: string,
  init: RequestInit = {},
  auditReason = "Set RSN via button",
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetchWithin(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json",
        "X-Audit-Log-Reason": encodeURIComponent(auditReason),
      },
    });
    const retryAfter = Number(r.headers.get("retry-after"));
    if (r.status !== 429 || attempt >= 3 || !(retryAfter <= 15)) return r;
    await sleep(retryAfter * 1000 + 250);
  }
}

// OSRS treats spaces, underscores and hyphens in a name as the same
// character, and so does WOM's lowercased `username`.
export function rsnKey(name: string): string {
  return name.replace(/[-_\s]+/g, " ").trim().toLowerCase();
}

interface GuildMember {
  nick?: string | null;
  roles: string[];
  user: { id: string; username: string; global_name?: string | null };
}

// Everyone shown under this name in the server: their server nickname, or
// without one their display name, or without that their username.
//
// Discord's search matches names that *start with* the query, character for
// character, so searching for "iron_man" misses a member called "Iron Man"
// even though both are the same RSN. Only the part before the first space,
// `_` or `-` is searched, and the results are compared with rsnKey. Short
// prefixes match many people, hence Discord's maximum limit.
async function findMembersNamed(
  rsn: string,
  guildId = GUILD_ID,
): Promise<GuildMember[]> {
  const prefix = rsn.trim().split(/[-_\s]/)[0];
  const r = await botFetch(
    `/guilds/${guildId}/members/search?query=${encodeURIComponent(prefix)}&limit=1000`,
  );
  if (!r.ok) throw new Error(`Discord member search failed: ${r.status}`);
  return ((await r.json()) as GuildMember[]).filter(
    (m) => rsnKey(m.nick ?? m.user.global_name ?? m.user.username) === rsnKey(rsn),
  );
}

// Whether another Discord account has set this RSN on its website profile.
// That covers members whose nickname isn't their RSN (a known name that was
// taken in-game, say), whom the nickname search below can't see. A database
// failure counts as free, unlike a failed member search: the nickname check
// still runs, and refusing every Verify while Neon is unreachable would be
// worse than missing this one extra check for a moment.
async function isRsnLinkedElsewhere(
  userId: string,
  rsn: string,
): Promise<boolean> {
  try {
    const rows = await sql`
      SELECT 1 FROM users
      WHERE discord_id <> ${userId}
        AND lower(btrim(regexp_replace(runescape_name, '[-_[:space:]]+', ' ', 'g'))) = ${rsnKey(rsn)}
      LIMIT 1`;
    return rows.length > 0;
  } catch (err) {
    console.error("Website RSN duplicate check failed:", err);
    return false;
  }
}

// Whether another member already goes by this name, as their Discord
// nickname or as the RSN on their website profile. This is the only thing
// stopping a guest from typing a clan member's RSN to get the member role, so
// a failed member search throws (the Verify is refused with "Something went
// wrong") rather than counting as free.
async function isNameTaken(
  guildId: string,
  userId: string,
  rsn: string,
): Promise<boolean> {
  if (await isRsnLinkedElsewhere(userId, rsn)) return true;
  const members = await findMembersNamed(rsn, guildId);
  return members.some((m) => m.user.id !== userId);
}

interface ClanMatch {
  // The name with its in-game capitalisation, used as the nickname, so
  // typing "zezima" still ends up as "Zezima".
  displayName: string;
  // The name the clan group still lists, when the match came through a name
  // change WOM hasn't approved yet.
  previousName: string | null;
}

interface WomMembership {
  playerId: number;
  role: string;
  player: { username: string; displayName: string };
}

// Throws when WOM can't be asked, which must never be mistaken for "nobody
// is in the clan".
async function fetchWomClan(): Promise<WomMembership[]> {
  const r = await fetchWithin(`${WOM_BASE_URL}/groups/${WOM_GROUP_ID}`, {
    headers: WOM_HEADERS,
  });
  if (!r.ok) throw new Error(`WOM group lookup failed: ${r.status}`);
  return ((await r.json()) as { memberships: WomMembership[] }).memberships;
}

/**
 * Looks the RSN up in the WOM clan group. An approved name change renames
 * the player in the group, so that case is a plain match; a pending one still
 * lists the old name, and is found through the change record's player id.
 * Returns null when the RSN isn't in the clan, and throws when WOM can't be
 * asked.
 */
async function findInWomClan(rsn: string): Promise<ClanMatch | null> {
  const [memberships, changes] = await Promise.all([
    fetchWomClan(),
    // `status=pending` matters: without it this search took 38s when tried.
    fetchWithin(
      `${WOM_BASE_URL}/names?username=${encodeURIComponent(rsn)}&status=pending&limit=20`,
      { headers: WOM_HEADERS },
    )
      .then((r) =>
        r.ok
          ? (r.json() as Promise<
              { playerId: number; oldName: string; newName: string }[]
            >)
          : [],
      )
      .catch(() => []),
  ]);

  const key = rsnKey(rsn);
  const direct = memberships.find((m) => rsnKey(m.player.username) === key);
  if (direct) {
    return { displayName: direct.player.displayName, previousName: null };
  }
  const memberIds = new Set(memberships.map((m) => m.playerId));
  const change = changes.find(
    (c) => rsnKey(c.newName) === key && memberIds.has(c.playerId),
  );
  return change
    ? { displayName: change.newName, previousName: change.oldName }
    : null;
}

// Works out the reply for a Verify, and pushes one line for #logging onto
// `log` describing what happened, so mods can see who verified as what.
async function processRsn(
  interaction: Interaction,
  typed: string,
  log: string[],
) {
  const guildId = interaction.guild_id!;
  const member = interaction.member!;
  const userId = member.user.id;
  const who = `<@${userId}>`;
  const role = `the ${roleTag(MEMBER_ROLE_ID)} role`;

  if (await isNameTaken(guildId, userId, typed)) {
    log.push(
      `⛔ ${who} tried to change their name to **${typed}**, but someone else already uses that name. Refused.`,
    );
    return `Someone else in this server already uses **${typed}**. If that really is your name, contact a mod.`;
  }

  // undefined: WOM couldn't be asked. null: asked, and not in the clan.
  let clan: ClanMatch | null | undefined;
  try {
    clan = await findInWomClan(typed);
  } catch (err) {
    console.error(
      "Verify: WOM clan lookup failed:",
      err,
      err instanceof Error ? err.cause : "",
    );
  }
  // Anyone can submit a name change to WOM, so a pending one away from a name
  // someone else here goes by would be a way around the check above.
  const notes: string[] = [];
  if (
    clan?.previousName &&
    (await isNameTaken(guildId, userId, clan.previousName))
  ) {
    notes.push(
      `Wise Old Man has a name change from **${clan.previousName}** to **${clan.displayName}** waiting for approval, but someone else in the server goes by **${clan.previousName}**, so I ignored it.`,
    );
    clan = null;
  } else if (clan?.previousName) {
    notes.push(
      `The clan list still says **${clan.previousName}**: Wise Old Man has their name change from **${clan.previousName}** to **${clan.displayName}** waiting for approval.`,
    );
  }
  const rsn = clan?.displayName ?? typed;

  const lines: string[] = [];
  const renamed = await botFetch(`/guilds/${guildId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ nick: rsn }),
  });
  if (renamed.ok) {
    lines.push(`Done! Your nickname is now **${rsn}**.`);
  } else {
    // 403 is the expected failure: Discord never lets a bot rename the
    // server owner, or anyone whose highest role sits above the bot's.
    console.error(
      "Discord nickname update failed:",
      renamed.status,
      await renamed.text(),
    );
    lines.push(
      `I couldn't change your nickname, please set it to **${rsn}** yourself.`,
    );
    notes.push("I couldn't change their nickname, so it has to be set by hand.");
  }

  // Only an existing account is touched; someone who never logged in to the
  // site gets the nickname picked up at their first login
  // (`fetchGuildNickname`).
  await sql`UPDATE users SET runescape_name = ${rsn} WHERE discord_id = ${userId}`.catch(
    (err) => console.error("Saving RSN from Discord failed:", err),
  );

  const hasRole = member.roles.includes(MEMBER_ROLE_ID);
  const changed =
    member.nick && member.nick !== rsn
      ? `${who} changed their name from **${member.nick}** to **${rsn}**`
      : `${who} set their name to **${rsn}**`;
  // The #logging line: what happened to their name and the member role.
  let entry: string;
  if (clan === undefined) {
    entry = hasRole
      ? `📝 ${changed}. Already had ${role}.`
      : `⚠️ ${changed}, but Wise Old Man couldn't be reached, so they didn't get ${role}. Check by hand.`;
    if (!hasRole) {
      lines.push(
        `I couldn't reach Wise Old Man to check your clan membership. Try again in a minute, or contact a mod.`,
      );
    }
  } else if (clan && hasRole) {
    entry = `📝 ${changed}. Already had ${role}.`;
  } else if (clan) {
    const granted = await botFetch(
      `/guilds/${guildId}/members/${userId}/roles/${MEMBER_ROLE_ID}`,
      { method: "PUT" },
    );
    if (granted.ok) {
      entry = `✅ ${changed} and got ${role}, since they're in the clan.`;
      lines.push(
        `You're in the clan on Wise Old Man, so you now have the **Time Served** role. Next, create a ticket in ${RANKS_CHANNEL} to get your in-game rank.`,
      );
    } else {
      console.error(
        "Granting member role failed:",
        granted.status,
        await granted.text(),
      );
      entry = `⚠️ ${changed}. They're in the clan, but I couldn't give them ${role}. Give it by hand.`;
      lines.push(
        `You're in the clan on Wise Old Man, but I couldn't give you the **Time Served** role. Please contact a mod.`,
      );
    }
  } else if (!hasRole) {
    entry = `ℹ️ ${changed}. Not in the clan, so they didn't get ${role}.`;
    lines.push(
      `I couldn't find **${rsn}** in the clan on Wise Old Man, so you didn't get the **Time Served** role. Check the spelling and try again. If you just joined or changed your name, it can take a bit to update. Not in the clan yet? You'll get the role automatically within a day of joining.`,
    );
  } else {
    // Deliberately never removes the role: a typo, or a name change WOM
    // doesn't know about yet, would otherwise strip a real member.
    entry = `⚠️ ${changed}, but **${rsn}** isn't in the clan. They kept ${role}; check if it's a typo.`;
    lines.push(
      `Heads up: **${rsn}** isn't in the clan on Wise Old Man. If that's a typo, click the button again.`,
    );
  }

  log.push([entry, ...notes].join(" "));
  return lines.join("\n\n");
}

async function applyRsn(res: VercelResponse, interaction: Interaction) {
  const raw =
    interaction.data?.components
      ?.flatMap((row) => row.components)
      .find((c) => c.custom_id === RSN_INPUT_ID)?.value ?? "";
  const rsn = normalizeRsn(raw);

  if (!interaction.member || !interaction.guild_id) {
    reply(res, "This only works inside the server.");
    return;
  }
  if (!rsn) {
    reply(
      res,
      "That doesn't look like a RuneScape name: 1-12 characters, only letters, numbers, spaces, `-` and `_`. Click the button to try again.",
    );
    return;
  }

  // The member search, WOM and a cold database together don't fit Discord's
  // 3 seconds.
  replyLater(
    res,
    interaction,
    async () => {
      const log: string[] = [];
      const content = await processRsn(interaction, rsn, log);
      // Posted alongside the reply rather than before it, so the member
      // doesn't wait on it.
      waitUntil(
        postLog(log).catch((err) => console.error("Verify log failed:", err)),
      );
      return { content };
    },
    { ephemeral: true },
  );
}

const SITE_URL = "https://timeserved.vercel.app";

function embedColor(hex: string | undefined): number | undefined {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : undefined;
}

// Who a command without a name is about: the caller's website RSN first,
// since that's the one they chose (a nickname can be a known name that was
// taken in-game), then their nickname.
async function callerRsn(interaction: Interaction): Promise<string | null> {
  const userId = interaction.member?.user.id;
  if (userId) {
    try {
      const rows =
        await sql`SELECT runescape_name FROM users WHERE discord_id = ${userId}`;
      const site = normalizeRsn((rows[0]?.runescape_name as string | null) ?? "");
      if (site) return site;
    } catch (err) {
      console.error("Looking up the caller's website RSN failed:", err);
    }
  }
  return normalizeRsn(interaction.member?.nick ?? "");
}

// `/rank [rsn]`: the same answer as the plugin's `!rank`, from the same code
// (`lookupRankProgress`).
async function rankReply(rsn: string): Promise<ReplyBody> {
  const resolved = await resolveMemberProfile(rsn);
  if (!resolved.ok) {
    if (resolved.reason === "not-on-runeprofile") {
      return {
        content: `**${rsn}** isn't on RuneProfile yet. Install the RuneProfile plugin in RuneLite and sync your account, then try again.`,
      };
    }
    return {
      content:
        resolved.status === 429
          ? "RuneProfile is busy right now. Try again in a minute."
          : `I couldn't load **${rsn}** from RuneProfile. Try again later.`,
    };
  }

  const lookup = await lookupRankProgress(resolved.displayName, resolved.profile);
  const eligible = ranks.find((r) => r.name === lookup.eligibleRank);
  const lines = [
    eligible
      ? `Eligible for **${eligible.name}**`
      : "Not eligible for a rank yet",
    `${lookup.overallSatisfied}/${lookup.overallTotal} rank items done`,
  ];
  if (lookup.nextRank && lookup.neededForNextRank !== null) {
    lines.push(
      "",
      `**Next: ${lookup.nextRank}**, ${lookup.neededForNextRank} more item${lookup.neededForNextRank === 1 ? "" : "s"} needed`,
    );
    if (lookup.missingItemNames.length > 0) {
      lines.push(`Missing: ${lookup.missingItemNames.join(", ")}`);
    }
  } else {
    lines.push("", "That's the highest rank!");
  }

  return {
    embeds: [
      {
        title: lookup.rsn,
        url: `${SITE_URL}/rankings?u=${encodeURIComponent(lookup.rsn)}`,
        description: lines.join("\n"),
        color: embedColor(eligible?.textColor),
        thumbnail: eligible ? { url: eligible.icon } : undefined,
      },
    ],
  };
}

interface WomPlayer {
  id: number;
  displayName: string;
  combatLevel: number;
  exp: number;
  latestSnapshot?: {
    data?: {
      skills?: { overall?: { level?: number } };
      bosses?: Record<string, { kills: number }>;
    };
  };
}

const BOSS_METRICS = METRIC_GROUPS.find((g) => g.groupLabel === "Bosses")!.metrics;
// Left out of the top bosses, as on the website's profile page, which gives
// raids their own section rather than letting them compete with easy bosses.
// Keep in sync with RAID_METRIC_VALUES in src/page/profile-page.tsx.
const RAID_METRICS = new Set([
  "theatre_of_blood",
  "theatre_of_blood_hard_mode",
  "tombs_of_amascut",
  "tombs_of_amascut_expert",
  "chambers_of_xeric",
  "chambers_of_xeric_challenge_mode",
]);

function topBosses(player: WomPlayer, count: number): string {
  const kills = player.latestSnapshot?.data?.bosses ?? {};
  const top = BOSS_METRICS.filter((m) => !RAID_METRICS.has(m.value))
    .map((m) => ({ name: m.label, kc: kills[m.value]?.kills ?? 0 }))
    .filter((b) => b.kc > 0)
    .sort((a, b) => b.kc - a.kc)
    .slice(0, count);
  return top.length > 0
    ? top.map((b) => `${b.name}: ${b.kc.toLocaleString("en-US")} kc`).join("\n")
    : "None yet";
}

// `/profile [rsn]`: the stats at the top of the website's profile page, with
// a link to it.
async function profileReply(rsn: string): Promise<ReplyBody> {
  const [playerRes, clan] = await Promise.all([
    fetchWithin(`${WOM_BASE_URL}/players/${encodeURIComponent(rsn)}`, {
      headers: WOM_HEADERS,
    }),
    // Only for the clan rank; the profile still shows without it.
    fetchWomClan().catch(() => null),
  ]);
  if (playerRes.status === 404) {
    return { content: `**${rsn}** isn't tracked on Wise Old Man.` };
  }
  if (playerRes.status === 429) {
    return { content: "Wise Old Man is busy right now. Try again in a minute." };
  }
  if (!playerRes.ok) {
    return { content: `I couldn't load **${rsn}** from Wise Old Man. Try again later.` };
  }

  const player = (await playerRes.json()) as WomPlayer;
  // WOM keeps an empty record (all zeros, no snapshot) for names it was asked
  // about but never managed to track, e.g. ones not on the hiscores.
  if (!player.latestSnapshot) {
    return { content: `**${rsn}** isn't tracked on Wise Old Man.` };
  }
  const membership = clan?.find((m) => m.playerId === player.id);
  const rank = getRankForRole(membership?.role);
  const totalLevel = player.latestSnapshot?.data?.skills?.overall?.level;

  return {
    embeds: [
      {
        title: player.displayName,
        url: `${SITE_URL}/profile?rsn=${encodeURIComponent(player.displayName)}`,
        description: rank
          ? `**${rank.name}** in Time Served`
          : membership
            ? "Member of Time Served"
            : clan
              ? "Not in Time Served"
              : undefined,
        color: embedColor(rank?.color),
        thumbnail: rank ? { url: rank.icon } : undefined,
        fields: [
          { name: "Combat", value: String(player.combatLevel), inline: true },
          { name: "Total level", value: totalLevel ? String(totalLevel) : "?", inline: true },
          { name: "Total XP", value: `${(player.exp / 1e6).toFixed(1)}M`, inline: true },
          { name: "Top bosses", value: topBosses(player, 3) },
        ],
      },
    ],
  };
}

function handleCommand(res: VercelResponse, interaction: Interaction) {
  const build =
    interaction.data?.name === "rank"
      ? rankReply
      : interaction.data?.name === "profile"
        ? profileReply
        : null;
  if (!build) {
    reply(res, "Unknown command.");
    return;
  }
  const typed = interaction.data?.options?.find((o) => o.name === "rsn")?.value;
  if (typed !== undefined && !normalizeRsn(typed)) {
    reply(
      res,
      "That doesn't look like a RuneScape name: 1-12 characters, only letters, numbers, spaces, `-` and `_`.",
    );
    return;
  }

  // Public, like `!rank` in the clan chat. Deferred before working out who a
  // name-less command is about, since that can wait on a cold database.
  replyLater(
    res,
    interaction,
    async () => {
      const rsn = typed !== undefined ? normalizeRsn(typed) : await callerRsn(interaction);
      if (!rsn) {
        return {
          content: `Which player? Add a name, like \`/${interaction.data?.name} Zezima\`, or verify in ${VERIFY_CHANNEL} first.`,
        };
      }
      return build(rsn);
    },
    { ephemeral: false },
  );
}

export async function handleDiscordInteraction(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!PUBLIC_KEY || !BOT_TOKEN) {
    res.status(500).json({ error: "Discord bot is not configured" });
    return;
  }

  const body = await readRawBody(req);
  // Discord deliberately sends badly-signed requests when the endpoint URL is
  // saved, and refuses the URL unless they are rejected.
  if (!isValidSignature(req, body)) {
    res.status(401).json({ error: "Invalid request signature" });
    return;
  }

  const interaction = JSON.parse(body.toString("utf8")) as Interaction;

  if (interaction.type === InteractionType.PING) {
    res.status(200).json({ type: ResponseType.PONG });
    return;
  }
  if (interaction.type === InteractionType.COMMAND) {
    handleCommand(res, interaction);
    return;
  }
  if (
    interaction.type === InteractionType.COMPONENT &&
    interaction.data?.custom_id === SET_RSN_BUTTON_ID
  ) {
    showRsnModal(res, interaction);
    return;
  }
  if (
    interaction.type === InteractionType.MODAL_SUBMIT &&
    interaction.data?.custom_id === SET_RSN_MODAL_ID
  ) {
    await applyRsn(res, interaction);
    return;
  }

  reply(res, "Unknown action.");
}

/**
 * The member's nickname in the clan server, if it is shaped like an RSN, for
 * filling an empty `runescape_name` at login. Uses the bot token rather than
 * the user's OAuth token so the login doesn't need an extra scope (and an
 * extra line on Discord's consent screen). Never throws: a missing nickname
 * just means the profile field stays empty, as it always did.
 */
export async function fetchGuildNickname(
  discordId: string,
): Promise<string | null> {
  if (!BOT_TOKEN || !GUILD_ID) return null;
  try {
    const r = await fetch(`${API}/guilds/${GUILD_ID}/members/${discordId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const member = (await r.json()) as { nick?: string | null };
    return member.nick ? normalizeRsn(member.nick) : null;
  } catch {
    return null;
  }
}

// Joins and leaves are read from WOM's group activity feed, which records
// explicit "joined"/"left" events, rather than inferred from who appears in or
// disappears from the group. A little over a day, so consecutive daily cron
// runs (whose start time drifts within the hour) overlap instead of leaving a
// gap. Re-processing an event is harmless: the role is already given or gone
// the second time, and nothing is logged for a no-op.
const ACTIVITY_WINDOW_MS = 26 * 60 * 60 * 1000;
// More joins or leaves than this in one day is far likelier to be a botched
// WOM sync than real movement, so the sync then only reports and changes
// nothing for that direction.
const MASS_CHANGE_LIMIT = 15;
// A role as its tag in a message. #logging posts with allowed_mentions off,
// so this never pings the people who have it.
function roleTag(roleId: string): string {
  return `<@&${roleId}>`;
}

const CLAN_ROLE_NAMES: Record<string, string> = {
  [MEMBER_ROLE_ID]: "Time Served",
  ...RANK_ROLES,
};

interface WomActivity {
  playerId: number;
  type: string;
  createdAt: string;
  player: { displayName: string };
}

// The latest joined and left event per player since `since`.
async function fetchRecentActivity(
  since: number,
): Promise<{ joins: WomActivity[]; leaves: WomActivity[] }> {
  const joins = new Map<number, WomActivity>();
  const leaves = new Map<number, WomActivity>();
  for (let offset = 0; offset < 1000; offset += 50) {
    const r = await fetchWithin(
      `${WOM_BASE_URL}/groups/${WOM_GROUP_ID}/activity?limit=50&offset=${offset}`,
      { headers: WOM_HEADERS },
    );
    if (!r.ok) throw new Error(`WOM activity lookup failed: ${r.status}`);
    const page = (await r.json()) as WomActivity[];
    for (const event of page) {
      if (Date.parse(event.createdAt) < since) continue;
      const byType =
        event.type === "joined" ? joins : event.type === "left" ? leaves : null;
      if (byType && !byType.has(event.playerId)) {
        byType.set(event.playerId, event);
      }
    }
    // Newest first, so once a page reaches past the window nothing older
    // can matter.
    const oldest = page[page.length - 1];
    if (page.length < 50 || Date.parse(oldest.createdAt) < since) break;
  }
  return { joins: [...joins.values()], leaves: [...leaves.values()] };
}

/**
 * Who the daily sync may rename or strip for this RSN. Decided with the user
 * ("option C"), because nothing records which Discord account is which RSN:
 *
 * - A **server nickname** is set deliberately in this server (by the Verify
 *   button, the member or a mod), so it is trusted.
 * - A **display name** is the member's own Discord name and can be anything
 *   ("Brenda"), so it only counts for members who already have Time Served,
 *   i.e. were verified once. 77 such members rely on it (display name = RSN,
 *   no nickname), which is why it isn't simply ignored.
 * - When someone has the name as nickname, display names are ignored: a
 *   second account named after the same player (four such pairs existed)
 *   must not block renaming the main one.
 *
 * Granting the member role on a join never uses display names at all; see
 * grantJoinerRole.
 */
async function findTrustedMembers(rsn: string): Promise<GuildMember[]> {
  const shownAs = await findMembersNamed(rsn);
  const byNickname = shownAs.filter((m) => m.nick);
  if (byNickname.length > 0) return byNickname;
  return shownAs.filter((m) => m.roles.includes(MEMBER_ROLE_ID));
}

async function postLog(lines: string[]) {
  // Discord caps a message at 2000 characters.
  const messages: string[] = [];
  for (const line of lines) {
    const last = messages[messages.length - 1];
    if (last !== undefined && last.length + line.length + 1 <= 1900) {
      messages[messages.length - 1] = `${last}\n${line}`;
    } else {
      messages.push(line);
    }
  }
  for (const content of messages) {
    await botFetch(`/channels/${LOG_CHANNEL_ID}/messages`, {
      method: "POST",
      // Name people with a mention but don't ping them.
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
  }
}

// Gives the member role to whoever set their server nickname to this RSN
// before joining the clan, so they don't have to click the button again
// afterwards. Only a nickname counts here, never a display name: this is the
// one step that *gives* something, and anyone can be called "Brenda" in
// their own Discord profile (see findTrustedMembers). Never rank roles: those
// are still requested through #clan-ranks.
async function grantJoinerRole(name: string, log: string[]): Promise<boolean> {
  const shownAs = await findMembersNamed(name);
  // Already verified under this name: nothing to do or report.
  if (shownAs.some((m) => m.roles.includes(MEMBER_ROLE_ID))) return false;
  const members = shownAs.filter((m) => m.nick);
  // Not in the server yet, or only a display name matches: they use Verify.
  if (members.length === 0) return false;
  if (members.length > 1) {
    log.push(
      `⚠️ **${name}** joined the clan, but ${members.length} people in the server have that nickname, so I gave nobody the ${roleTag(MEMBER_ROLE_ID)} role.`,
    );
    return false;
  }

  const [member] = members;
  const r = await botFetch(
    `/guilds/${GUILD_ID}/members/${member.user.id}/roles/${MEMBER_ROLE_ID}`,
    { method: "PUT" },
    `${name} joined the clan (Wise Old Man)`,
  );
  if (!r.ok) {
    log.push(
      `⚠️ **${name}** joined the clan, but I couldn't give <@${member.user.id}> the ${roleTag(MEMBER_ROLE_ID)} role.`,
    );
    return false;
  }
  log.push(
    `🔺 **${name}** joined the clan: gave the ${roleTag(MEMBER_ROLE_ID)} role to <@${member.user.id}>.`,
  );
  return true;
}

// Whether an account by this name exists in-game right now: true, false, or
// null when the hiscores couldn't be asked.
async function existsOnHiscores(name: string): Promise<boolean | null> {
  try {
    const r = await fetchWithin(
      `https://secure.runescape.com/m=hiscore_oldschool/index_lite.json?player=${encodeURIComponent(name)}`,
    );
    if (r.status === 404) return false;
    return r.ok ? true : null;
  } catch {
    return null;
  }
}

/**
 * Takes the member role and rank roles away from a clan leaver.
 *
 * A name change WOM didn't know about yet when the clan list was synced shows
 * up as the old name leaving and the new name joining, as two different
 * players (seen live: "bb squeet" left and "squeet g" joined in one sync).
 * Someone who really left still exists in-game under that name, and someone
 * who renamed doesn't, so the hiscores tell the two apart: roles are only
 * removed when the name still exists. `sameSyncJoiners` are the names that
 * joined in the same sync, the likely new name, for the mod who checks.
 */
async function removeLeaverRoles(
  name: string,
  sameSyncJoiners: string[],
  log: string[],
): Promise<boolean> {
  const trusted = await findTrustedMembers(name);
  if (trusted.length === 0) {
    log.push(
      `❔ **${name}** left the clan, but nobody in the server has that nickname.`,
    );
    return false;
  }
  // A guest who was never given clan roles: nothing to do or report.
  const members = trusted.filter((m) =>
    m.roles.some((id) => id in CLAN_ROLE_NAMES),
  );
  if (members.length === 0) return false;
  if (members.length > 1) {
    log.push(
      `⚠️ **${name}** left the clan, but ${members.length} people in the server with clan roles are called ${name}, so I removed nobody's roles.`,
    );
    return false;
  }

  const exists = await existsOnHiscores(name);
  if (exists !== true) {
    const mentions = members.map((m) => `<@${m.user.id}>`).join(", ");
    const candidates =
      sameSyncJoiners.length > 0
        ? ` Joined in the same sync: ${sameSyncJoiners.map((n) => `**${n}**`).join(", ")}.`
        : "";
    log.push(
      exists === false
        ? `⚠️ **${name}** left the clan, but that name no longer exists in-game, so they probably changed it. I kept ${mentions}'s roles.${candidates} If it's them, ask them to click Verify with their new name.`
        : `⚠️ **${name}** left the clan, but I couldn't check the OSRS hiscores to rule out a name change, so I kept ${mentions}'s roles. Please check.`,
    );
    return false;
  }

  let removedAny = false;
  for (const member of members) {
    const roles = member.roles.filter((id) => id in CLAN_ROLE_NAMES);
    if (roles.length === 0) continue;

    const failed: string[] = [];
    for (const roleId of roles) {
      const r = await botFetch(
        `/guilds/${GUILD_ID}/members/${member.user.id}/roles/${roleId}`,
        { method: "DELETE" },
        `${name} left the clan (Wise Old Man)`,
      );
      if (!r.ok) failed.push(roleTag(roleId));
    }
    const done = roles.map(roleTag).filter((t) => !failed.includes(t));
    if (done.length > 0) {
      removedAny = true;
      log.push(
        `🔻 **${name}** left the clan: removed ${done.join(", ")} from <@${member.user.id}>.`,
      );
    }
    if (failed.length > 0) {
      log.push(
        `⚠️ **${name}** left the clan, but I couldn't remove ${failed.join(", ")} from <@${member.user.id}>.`,
      );
    }
  }
  return removedAny;
}

interface WomNameChange {
  oldName: string;
  newName: string;
  resolvedAt: string | null;
}

// Name changes WOM approved since `since`, oldest first so a member who
// renamed twice in a day ends up on the latest name.
async function fetchRecentNameChanges(since: number): Promise<WomNameChange[]> {
  const r = await fetchWithin(
    `${WOM_BASE_URL}/groups/${WOM_GROUP_ID}/name-changes?limit=50`,
    { headers: WOM_HEADERS },
  );
  if (!r.ok) throw new Error(`WOM name-change lookup failed: ${r.status}`);
  return ((await r.json()) as (WomNameChange & { status: string })[])
    .filter(
      (c) =>
        c.status === "approved" &&
        c.resolvedAt !== null &&
        Date.parse(c.resolvedAt) >= since,
    )
    .reverse();
}

// Moves a member's nickname (and website RSN) along with an in-game name
// change, so the joins/leaves matching after it, and the duplicate check on
// the button, keep finding them.
async function applyNameChange(
  change: WomNameChange,
  log: string[],
): Promise<boolean> {
  const { oldName, newName } = change;
  const members = await findTrustedMembers(oldName);
  // Not in the server, or already renamed (a re-run, or they did it).
  if (members.length === 0) return false;
  if (members.length > 1) {
    log.push(
      `⚠️ **${oldName}** changed their name to **${newName}**, but ${members.length} people in the server are called ${oldName}, so I renamed nobody.`,
    );
    return false;
  }
  const [member] = members;
  if ((await findMembersNamed(newName)).some((m) => m.user.id !== member.user.id)) {
    log.push(
      `⚠️ **${oldName}** changed their name to **${newName}**, but someone else in the server already uses that name, so I left <@${member.user.id}>'s nickname alone.`,
    );
    return false;
  }

  const r = await botFetch(
    `/guilds/${GUILD_ID}/members/${member.user.id}`,
    { method: "PATCH", body: JSON.stringify({ nick: newName }) },
    `${oldName} changed their name to ${newName} (Wise Old Man)`,
  );
  if (!r.ok) {
    log.push(
      `⚠️ **${oldName}** changed their name to **${newName}**, but I couldn't change <@${member.user.id}>'s nickname.`,
    );
    return false;
  }
  await sql`UPDATE users SET runescape_name = ${newName} WHERE discord_id = ${member.user.id}`.catch(
    (err) => console.error("Saving renamed RSN failed:", err),
  );
  log.push(
    `✏️ **${oldName}** changed their name to **${newName}**: updated <@${member.user.id}>'s nickname.`,
  );
  return true;
}

/**
 * Daily cron: keeps Discord in step with WOM. Members who changed their name
 * in-game get their nickname updated; anyone who joined the clan in the last
 * day and already set their nickname to their RSN gets the member role;
 * anyone who left loses it and their rank role. People are found by name,
 * trusted as findTrustedMembers describes: a server nickname always, a display
 * name only for members who already have Time Served. Everything it does, and
 * every leaver it couldn't find, is reported in #logging.
 */
export async function syncClanRoles(res: VercelResponse) {
  if (!BOT_TOKEN || !GUILD_ID) {
    res.status(500).json({ error: "Discord bot is not configured" });
    return;
  }

  const since = Date.now() - ACTIVITY_WINDOW_MS;
  const [activity, clan, nameChanges] = await Promise.all([
    fetchRecentActivity(since),
    fetchWomClan(),
    fetchRecentNameChanges(since),
  ]);
  // Judged by where they stand now, so joining and leaving again on the same
  // day (or the reverse) only counts the way it ended.
  const inClan = new Set(clan.map((m) => m.playerId));
  const joiners = activity.joins.filter((e) => inClan.has(e.playerId));
  const leavers = activity.leaves.filter((e) => !inClan.has(e.playerId));

  const log: string[] = [];
  let renamed = 0;
  let granted = 0;
  let removed = 0;

  // First, so the joins and leaves below find people under their new name.
  for (const change of nameChanges) {
    if (await applyNameChange(change, log)) renamed++;
  }

  if (joiners.length > MASS_CHANGE_LIMIT) {
    log.push(
      `⚠️ Wise Old Man says ${joiners.length} members joined the clan in the last day. That looks more like a sync mistake than real joins, so I gave out no roles. Please check: ${joiners.map((e) => e.player.displayName).join(", ")}`,
    );
  } else {
    for (const e of joiners) {
      if (await grantJoinerRole(e.player.displayName, log)) granted++;
    }
  }

  if (leavers.length > MASS_CHANGE_LIMIT) {
    log.push(
      `⚠️ Wise Old Man says ${leavers.length} members left the clan in the last day. That looks more like a sync mistake than real leaves, so I removed no roles. Please check: ${leavers.map((e) => e.player.displayName).join(", ")}`,
    );
  } else {
    for (const e of leavers) {
      const sameSyncJoiners = joiners
        .filter((j) => j.createdAt === e.createdAt)
        .map((j) => j.player.displayName);
      if (await removeLeaverRoles(e.player.displayName, sameSyncJoiners, log)) {
        removed++;
      }
    }
  }

  if (log.length > 0) await postLog(log);
  res.status(200).json({
    nameChanges: nameChanges.length,
    renamed,
    joiners: joiners.length,
    granted,
    leavers: leavers.length,
    removed,
  });
}
