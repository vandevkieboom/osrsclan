import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import { getOrCreateBoardConfig } from "./_lib/board.js";
import { withErrorHandling } from "./_lib/handler.js";
// This backend function intentionally imports frontend domain/service
// modules directly rather than duplicating rank-progress logic — there's no
// shared/ package boundary between api/ and src/, so these are real
// cross-directory dependencies, not an accident. See tsconfig.api.json for
// how api/'s type-checking accounts for this (it pulls in DOM lib so
// src/services/profile.ts type-checks the same way here as it does in the
// browser build).
import { ranks, rankIconByRole, STAFF_ROLES } from "../src/data/ranks-data.js";
import { checkRequirement, computeClanRankProgress } from "../src/services/rank-checker.js";
import { getRankForRole } from "../src/services/profile.js";
import {
  buildRuneProfile,
  type CombatAchievementTasksResponse,
  type FullAccountResponse,
  type RuneProfile,
} from "../src/services/runeprofile.js";
import { checkClanRequirement } from "../src/services/clan-requirement.js";

const RP_BASE = "https://api.runeprofile.com/v1";
const API_KEY = process.env.RUNEPROFILE_API_KEY ?? "";
const RP_HEADERS: Record<string, string> = {
  Accept: "application/json",
  ...(API_KEY ? { "x-api-key": API_KEY } : {}),
};

const ALLOWED_PATHS = [
  /^\/accounts\/[^/]+\/full$/,
  /^\/accounts\/[^/]+\/combat-achievements\/tasks$/,
];

// Same Wise Old Man clan group used by api/wom-proxy.ts, queried here directly
// (rather than through that proxy) since this runs server-side already.
// Keep in sync with WOM_GROUP_ID in src/constants.ts and vite.config.ts.
const WOM_GROUP_ID = 22206;
const WOM_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent": "vandevkieboom",
  ...(process.env.WOM_API_KEY ? { "x-api-key": process.env.WOM_API_KEY } : {}),
};

async function proxyPath(req: VercelRequest, res: VercelResponse) {
  const { path } = req.query;
  if (typeof path !== "string" || !ALLOWED_PATHS.some((re) => re.test(path))) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  const upstream = await fetch(`${RP_BASE}${path}`, { headers: RP_HEADERS });

  if (upstream.status === 404) {
    res.status(404).json({ error: "Account not found on RuneProfile." });
    return;
  }
  if (upstream.status === 429) {
    res
      .status(429)
      .json({ error: "Rate limit hit — wait a moment and try again." });
    return;
  }
  if (!upstream.ok) {
    res
      .status(upstream.status)
      .json({ error: `RuneProfile API error (${upstream.status}).` });
    return;
  }

  res.status(200).json(await upstream.json());
}

interface LeaderboardEntry {
  name: string;
  totalSatisfied: number;
  rankName: string | null;
  rankColor: string | null;
  rankIcon: string | null;
  progressPct: number;
}

// The clan's admin-assigned WOM group role is the source of truth for a
// member's rank — it accounts for items that can't be auto-verified from a
// collection log and require manual sign-off, which the RuneProfile checklist
// alone cannot see. This mirrors profile-page.tsx's getRankForRole() lookup,
// just also returning the index into `ranks` (needed for the "next tier"
// progress bar below), which that helper doesn't expose.
// Returns -1 for no/unrecognized role (progress shown toward the first
// tier), or `ranks.length` for a staff role (above the achievement ladder,
// no "next tier").
function resolveMemberRankIndex(role: string | undefined): number {
  if (!role) return -1;
  const roleKey = role.toLowerCase();
  if (STAFF_ROLES.has(roleKey)) return ranks.length;
  const icon = rankIconByRole[roleKey];
  if (!icon) return -1;
  return ranks.findIndex((r) => r.icon === icon);
}

const EMPTY_SET: ReadonlySet<string> = new Set();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Reads the last cron-computed snapshot (see refreshLeaderboard below) —
// no RuneProfile calls on the request path at all, so page views are cheap
// and RuneProfile only ever hears from us once a day, in a controlled batch.
async function getLeaderboard(res: VercelResponse) {
  const rows =
    await sql`SELECT entries, updated_at FROM leaderboard_cache WHERE id = 1`;
  const entries = (rows[0]?.entries as LeaderboardEntry[] | undefined) ?? [];
  const updatedAt = rows[0]?.updated_at ?? null;

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
  res.status(200).json({ entries, updatedAt });
}

// Fans out to RuneProfile for every clan member (a handful at a time, with a
// small stagger to keep the burst gentle) and runs the exact same
// rank-progress logic as the per-user "My Progress" view, so the leaderboard
// can never drift from what a self-lookup shows. Only ever invoked by the
// daily Vercel Cron defined in vercel.json (see the auth check in `handler`)
// — never on a visitor's request path.
async function refreshLeaderboard(res: VercelResponse) {
  const rolesRes = await fetch(
    `https://api.wiseoldman.net/v2/groups/${WOM_GROUP_ID}`,
    {
      headers: WOM_HEADERS,
    },
  );
  if (!rolesRes.ok) {
    // Leave the existing cached snapshot in place rather than wiping it.
    res.status(502).json({ error: "Failed to load clan member list." });
    return;
  }
  const group = (await rolesRes.json()) as {
    memberships?: Array<{ player: { displayName: string }; role: string }>;
  };
  // RuneProfile needs the real, properly-cased in-game name — WOM's `username`
  // field is a lowercased/sanitized lookup key (fine for internal maps, wrong
  // account or a 404 if used against an external API), same distinction the
  // rest of the app already respects (see hiscores-page.tsx, profile-page.tsx).
  const membershipCount = group.memberships?.length ?? 0;
  const roleByName = new Map(
    (group.memberships ?? [])
      .filter((m) => m.player.displayName)
      .map((m) => [m.player.displayName, m.role]),
  );
  const usernames = Array.from(roleByName.keys());
  const noDisplayNameCount = membershipCount - usernames.length;

  // One bulk query up front rather than one per member — feeds the same
  // manually-verified-item data the Rankings page's admin toggle writes to.
  const verificationRows =
    await sql`SELECT rsn_key, item_name FROM manual_item_verifications`;
  const verifiedByRsn = new Map<string, Set<string>>();
  for (const row of verificationRows) {
    const set = verifiedByRsn.get(row.rsn_key) ?? new Set<string>();
    set.add(row.item_name);
    verifiedByRsn.set(row.rsn_key, set);
  }

  const entries: LeaderboardEntry[] = [];
  // RuneProfile enforces a token-bucket-style rate limit that an
  // authenticated key raises but doesn't remove: 4 workers firing 2 parallel
  // requests each every 150ms burns through the bucket in ~15s and then
  // bleeds 429s for the rest of the run, even with a key. 2 workers, one
  // request at a time, 400ms apart sustained hundreds of requests with zero
  // 429s in testing — so the fan-out below fetches full/tasks sequentially
  // per member instead of in parallel, at lower concurrency.
  const CONCURRENCY = 2;
  const STAGGER_MS = 400;
  const MAX_RETRIES = 3;
  let cursor = 0;

  // Counts of why a member never made it into `entries`, surfaced in the
  // response below — without this, a silent drop (RuneProfile rate limit,
  // never synced, malformed payload) is indistinguishable from "the clan
  // only has this many members."
  const skipCounts = { fetchFailed: 0, rateLimited: 0, error: 0 };

  // RuneProfile 429s under the fan-out below are retried with backoff
  // instead of being treated as a permanent skip — a member simply being
  // unlucky in the queue order shouldn't cost them their leaderboard spot
  // every single day.
  async function fetchWithRetry(url: string): Promise<Response> {
    let res = await fetch(url, { headers: RP_HEADERS });
    for (
      let attempt = 0;
      res.status === 429 && attempt < MAX_RETRIES;
      attempt++
    ) {
      await sleep(STAGGER_MS * 2 ** attempt);
      res = await fetch(url, { headers: RP_HEADERS });
    }
    return res;
  }

  async function worker() {
    while (cursor < usernames.length) {
      const username = usernames[cursor++];
      if (cursor > 1) await sleep(STAGGER_MS);
      try {
        const encoded = encodeURIComponent(username);
        const fullRes = await fetchWithRetry(
          `${RP_BASE}/accounts/${encoded}/full`,
        );
        if (!fullRes.ok) {
          // not on RuneProfile, private, or never synced — or still rate
          // limited after retries.
          if (fullRes.status === 429) skipCounts.rateLimited++;
          else skipCounts.fetchFailed++;
          continue;
        }

        const data = (await fullRes.json()) as FullAccountResponse;

        await sleep(STAGGER_MS);
        const tasksRes = await fetchWithRetry(
          `${RP_BASE}/accounts/${encoded}/combat-achievements/tasks`,
        );
        const tasksData = tasksRes.ok
          ? ((await tasksRes.json()) as CombatAchievementTasksResponse)
          : null;

        const verifiedItemNames =
          verifiedByRsn.get(username.toLowerCase()) ?? EMPTY_SET;
        const profile = buildRuneProfile(data, tasksData, null);
        // Untrackable items an admin has confirmed (verifiedItemNames) are
        // counted directly here, same as the per-user "My Progress" view —
        // the rank badge itself still comes from the member's real WOM role
        // below, not this checklist.
        const progress = computeClanRankProgress(
          ranks,
          profile,
          verifiedItemNames,
        );

        const role = roleByName.get(username);
        const rankInfo = getRankForRole(role);
        const currentRankIndex = resolveMemberRankIndex(role);

        // Share of the ENTIRE achievement ladder completed so far, not just
        // whichever single tier the member happens to be working on next —
        // tiers vary hugely in item-list size (see ranks-data.ts), so a
        // per-tier ratio made members with far more items done show an
        // emptier bar than members on a small early tier. This is the same
        // fixed denominator for every row, so bars are actually comparable.
        const progressPct = progress.overallTotal
          ? Math.round(
              (progress.overallSatisfied / progress.overallTotal) * 100,
            )
          : 0;

        // Being verified into a tier only proves "all but one item" was
        // satisfied — never that every untrackable item was owned, since one
        // of any kind can be skipped. So for an already-verified tier, items
        // an admin has explicitly confirmed (verifiedItemNames, folded into
        // stats.satisfiedCount above) count for real; any STILL-unconfirmed
        // untrackable items only get credited when the confirmed count alone
        // falls short of what verification requires — proving at least that
        // many more must have counted toward it. A provable lower bound: it
        // can undercount but can never overcount.
        const totalSatisfied = ranks.reduce((sum, rank, idx) => {
          const stats = progress.rankStats[idx];
          if (idx > currentRankIndex) return sum + stats.satisfiedCount;
          const unconfirmedUntrackable = rank.items.filter(
            (item) =>
              !item.apiCheck && !verifiedItemNames.has(item.name.toLowerCase()),
          ).length;
          const shortfall = Math.max(
            0,
            stats.requiredCount - stats.satisfiedCount,
          );
          const creditedUntrackable = Math.min(
            unconfirmedUntrackable,
            shortfall,
          );
          return sum + stats.satisfiedCount + creditedUntrackable;
        }, 0);

        entries.push({
          name: data.username || username,
          totalSatisfied,
          rankName: rankInfo?.name ?? null,
          rankColor: rankInfo?.color ?? null,
          rankIcon: rankInfo?.icon ?? null,
          progressPct,
        });
      } catch {
        // Member's RuneProfile data failed to fetch or parse.
        skipCounts.error++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, usernames.length) }, worker),
  );

  entries.sort(
    (a, b) =>
      b.totalSatisfied - a.totalSatisfied || a.name.localeCompare(b.name),
  );

  await sql`
    INSERT INTO leaderboard_cache (id, entries, updated_at)
    VALUES (1, ${JSON.stringify(entries)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET entries = EXCLUDED.entries, updated_at = EXCLUDED.updated_at`;

  res.status(200).json({
    ok: true,
    count: entries.length,
    membershipCount,
    skipped: { noDisplayName: noDisplayNameCount, ...skipCounts },
  });
}

type ResolvedMember =
  | { ok: true; displayName: string; role: string; profile: RuneProfile }
  | { ok: false; status: number; error: string; reason?: string };

/**
 * Shared "resolve an RSN to a live RuneProfile" prefix for both `lookupRank`
 * and `getClanRequirement` below — WOM group roster lookup (WOM has no
 * single-player-by-name lookup within a group, so this fetches the same full
 * roster refreshLeaderboard() does, just once instead of in a batch loop),
 * then the RuneProfile full+combat-achievement-tasks fetch, then
 * buildRuneProfile. Kept as one function so the two callers below can't
 * silently drift on how a member gets resolved.
 */
async function resolveMemberProfile(rsn: string): Promise<ResolvedMember> {
  const rolesRes = await fetch(
    `https://api.wiseoldman.net/v2/groups/${WOM_GROUP_ID}`,
    { headers: WOM_HEADERS },
  );
  if (!rolesRes.ok) {
    return { ok: false, status: 502, error: "Failed to load the clan's member list." };
  }
  const group = (await rolesRes.json()) as {
    memberships?: Array<{
      player: { displayName: string; username: string };
      role: string;
    }>;
  };
  const membership = (group.memberships ?? []).find(
    (m) =>
      m.player.username?.toLowerCase() === rsn.toLowerCase() ||
      m.player.displayName?.toLowerCase() === rsn.toLowerCase(),
  );
  if (!membership) {
    return {
      ok: false,
      status: 404,
      error: `${rsn} isn't in the clan's Wise Old Man group.`,
    };
  }
  // RuneProfile needs the real, properly-cased name — same distinction
  // refreshLeaderboard() above already has to account for.
  const displayName = membership.player.displayName;
  const encoded = encodeURIComponent(displayName);

  const fullRes = await fetch(`${RP_BASE}/accounts/${encoded}/full`, {
    headers: RP_HEADERS,
  });
  if (fullRes.status === 404) {
    return {
      ok: false,
      status: 404,
      error: `${displayName} isn't set up on RuneProfile.`,
      // Lets callers distinguish "never synced" from any other failure
      // without string-matching the message above.
      reason: "not-on-runeprofile",
    };
  }
  if (fullRes.status === 429) {
    return {
      ok: false,
      status: 429,
      error: "Rate limit hit — wait a moment and try again.",
    };
  }
  if (!fullRes.ok) {
    return { ok: false, status: 502, error: "Failed to fetch RuneProfile data." };
  }
  const data = (await fullRes.json()) as FullAccountResponse;

  const tasksRes = await fetch(
    `${RP_BASE}/accounts/${encoded}/combat-achievements/tasks`,
    { headers: RP_HEADERS },
  );
  const tasksData = tasksRes.ok
    ? ((await tasksRes.json()) as CombatAchievementTasksResponse)
    : null;

  const profile = buildRuneProfile(data, tasksData, null);
  return { ok: true, displayName, role: membership.role, profile };
}

function sendResolveError(res: VercelResponse, resolved: Extract<ResolvedMember, { ok: false }>) {
  res
    .status(resolved.status)
    .json(resolved.reason ? { error: resolved.error, reason: resolved.reason } : { error: resolved.error });
}

/**
 * The RuneLite plugin's `!rank <name>` chat command (formerly `!verify` —
 * renamed once the plugin grew a separate, stricter `!verify` for the clan
 * gear/kc gate, see getClanRequirement below) — runs the exact same
 * rank-progress computation as the site's "Auto-Verify" button on the Clan
 * Ranks page (computeClanRankProgress over a live RuneProfile fetch), just
 * server-side for a single RSN instead of client-side in the browser. Only
 * ever tells the caller what rank a member is eligible for — it never
 * changes anything (no API exists to actually promote someone in-game).
 *
 * Deliberately public, no auth: everything this returns is already visible
 * to anyone on the Clan Ranks page without logging in, so requiring a
 * plugin key here would only gate access to data that isn't actually
 * restricted anywhere else — it's not a bingo feature, so it doesn't need
 * one.
 */
async function lookupRank(req: VercelRequest, res: VercelResponse) {
  const rsn = typeof req.query.rsn === "string" ? req.query.rsn.trim() : "";
  if (!rsn) {
    res.status(400).json({ error: "rsn is required" });
    return;
  }

  const resolved = await resolveMemberProfile(rsn);
  if (!resolved.ok) {
    sendResolveError(res, resolved);
    return;
  }
  const { displayName, role, profile } = resolved;

  const verificationRows = await sql`
    SELECT item_name FROM manual_item_verifications WHERE rsn_key = ${displayName.toLowerCase()}`;
  const verifiedItemNames = new Set(
    verificationRows.map((r) => r.item_name as string),
  );

  const progress = computeClanRankProgress(ranks, profile, verifiedItemNames);
  const currentRankInfo = getRankForRole(role);

  // What's left for the *next* tier up — same "satisfied" rule
  // getRankStats uses internally (manually verified, or an apiCheck that
  // actually passes), just listing the item names instead of only a count.
  // Capped at 8 names so a big early tier can't blow up the plugin's chat
  // reply; the exact "any N of these" nuance (one item can always be
  // skipped) isn't reproduced here since this is informational, not
  // gating anything.
  const nextRankIndex = progress.highestEligibleRankIndex + 1;
  let nextRank: string | null = null;
  let neededForNextRank: number | null = null;
  let missingItemNames: string[] = [];
  if (nextRankIndex < ranks.length) {
    const rank = ranks[nextRankIndex];
    const stats = progress.rankStats[nextRankIndex];
    nextRank = rank.name;
    neededForNextRank = Math.max(0, stats.requiredCount - stats.satisfiedCount);
    missingItemNames = rank.items
      .filter((item) => {
        if (verifiedItemNames.has(item.name.toLowerCase())) return false;
        if (item.apiCheck) {
          const result = checkRequirement(item.apiCheck, profile);
          if (result === "pass" || result === "pass-alt") return false;
        }
        return true;
      })
      .map((item) => item.name)
      .slice(0, 8);
  }

  res.status(200).json({
    rsn: displayName,
    currentRank: currentRankInfo?.name ?? null,
    eligibleRank:
      progress.highestEligibleRankIndex >= 0
        ? ranks[progress.highestEligibleRankIndex].name
        : null,
    overallSatisfied: progress.overallSatisfied,
    overallTotal: progress.overallTotal,
    nextRank,
    neededForNextRank,
    missingItemNames,
  });
}

/**
 * The RuneLite plugin's `!verify <name>` chat command — the clan's hard
 * bingo-eligibility gate (see src/services/clan-requirement.ts), separate
 * from and stricter than the rank-tier ladder `lookupRank` above reports.
 * This used to only exist as an inline check on the Clan Rankings page
 * (time-served-page.tsx), computed client-side against a profile the page
 * had already fetched — this just runs the same shared function
 * server-side for a single RSN. Deliberately public, no auth — same
 * reasoning as lookupRank above.
 */
async function getClanRequirement(req: VercelRequest, res: VercelResponse) {
  const rsn = typeof req.query.rsn === "string" ? req.query.rsn.trim() : "";
  if (!rsn) {
    res.status(400).json({ error: "rsn is required" });
    return;
  }

  const resolved = await resolveMemberProfile(rsn);
  if (!resolved.ok) {
    sendResolveError(res, resolved);
    return;
  }

  const result = checkClanRequirement(resolved.profile);
  res.status(200).json({
    rsn: resolved.displayName,
    meets: result.met,
    reason: result.reason,
  });
}

/**
 * The RuneLite plugin's periodic broadcast poll (see BingoApiClient#fetchBroadcast
 * and BingoPlugin#checkBroadcast). Deliberately public, no auth — same
 * reasoning as lookupRank above: an admin broadcast isn't gated anywhere
 * else on the site, so there's nothing here for a plugin key to protect.
 */
async function getBroadcast(res: VercelResponse) {
  const config = await getOrCreateBoardConfig();
  // Same edge-caching pattern as twitch-live.ts's stream check: broadcasts
  // change far less often than that (an admin posts one a handful of times
  // a month), so every plugin's once-a-minute poll hitting this with zero
  // caching was pure waste — this lets Vercel's edge serve most of those
  // polls without invoking the function or touching the database at all,
  // at the cost of a new broadcast taking up to ~30s longer to reach
  // everyone. Was s-maxage=60/swr=30 (~60-90s worst case) — tightened after
  // a clan admin found that window too slow for a second broadcast sent
  // shortly after a first one. Still cheap enough to keep short: broadcasts
  // are rare, so a shorter cache window doesn't meaningfully raise
  // invocation/DB load, it just narrows the staleness gap.
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=15");
  res.status(200).json({
    message: config.broadcast_message,
    updatedAt: config.broadcast_updated_at,
  });
}

export default withErrorHandling(async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (req.query.resource === "broadcast") {
    await getBroadcast(res);
    return;
  }

  if (req.query.resource === "leaderboard") {
    await getLeaderboard(res);
    return;
  }

  if (req.query.resource === "lookup-rank") {
    await lookupRank(req, res);
    return;
  }

  if (req.query.resource === "clan-req") {
    await getClanRequirement(req, res);
    return;
  }

  if (req.query.resource === "leaderboard-refresh") {
    // Vercel automatically sends this header on cron-triggered invocations
    // when CRON_SECRET is set on the project — see vercel.json's `crons`.
    const expected = process.env.CRON_SECRET;
    if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    await refreshLeaderboard(res);
    return;
  }

  await proxyPath(req, res);
});
