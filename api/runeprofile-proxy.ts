import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
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
  type WomPlayerResponse,
} from "../src/services/runeprofile.js";
import { checkClanRequirement } from "../src/services/clan-requirement.js";

// refreshLeaderboard's fan-out below takes minutes against a roster this size
// — RuneProfile's rate limit forces it to go slowly (see the concurrency notes
// in that function) — so this raises the ceiling for the whole file.
//
// 60s was not enough and had not been for a long time: at ~500 members the
// fan-out needs around four minutes, so the function was being killed before
// it ever reached the write at the end, and the leaderboard silently stopped
// updating. It now also finishes early and saves what it has rather than
// relying on this ceiling being generous enough (see REFRESH_DEADLINE_MS), so
// a roster that keeps growing degrades into "takes two nights to come round"
// instead of "stops working and says nothing".
//
// Almost all of that time is spent awaiting network, not burning CPU, so a
// long run here costs very little against the compute quota.
export const config = { maxDuration: 300 };

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
// Stop fetching and save at this point, comfortably inside maxDuration above.
// Whatever has been refreshed this run is merged over the previous snapshot and
// written; the next run picks up where this one stopped. The leaderboard is
// therefore always complete and never more than a run or two stale, rather
// than being all-or-nothing on a fan-out that may not fit in one invocation.
const REFRESH_DEADLINE_MS = 240_000;

async function refreshLeaderboard(res: VercelResponse) {
  const startedAt = Date.now();
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

  // The previous snapshot and where the last run stopped. Entries are merged
  // by name rather than rebuilt from scratch, so a run that only gets through
  // part of the roster still leaves every other member's row intact.
  const cacheRows = await sql`
    SELECT entries, refresh_offset FROM leaderboard_cache WHERE id = 1`;
  const previousEntries =
    (cacheRows[0]?.entries as LeaderboardEntry[] | undefined) ?? [];
  const byName = new Map(previousEntries.map((e) => [e.name, e]));
  const startOffset = Math.max(0, Number(cacheRows[0]?.refresh_offset ?? 0)) %
    Math.max(1, usernames.length);

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

  let processed = 0;
  let ranOutOfTime = false;
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
      if (Date.now() - startedAt > REFRESH_DEADLINE_MS) {
        ranOutOfTime = true;
        return;
      }
      // Wraps, so successive runs sweep the whole roster rather than always
      // re-refreshing the same members at the front of it and never reaching
      // the back.
      const username = usernames[(startOffset + cursor++) % usernames.length];
      processed++;
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

        byName.set(data.username || username, {
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

  // Anyone no longer in the clan drops off, even if this run never reached
  // them — otherwise a member who left would sit on the leaderboard until a
  // run happened to sweep past their position.
  // Compared case-insensitively: entries are keyed by the name RuneProfile
  // returns and the roster is keyed by the name Wise Old Man returns, and the
  // two agreeing exactly on capitalisation is an assumption, not a guarantee.
  // Getting that wrong would quietly drop a member from the leaderboard on
  // every run with nothing to show for it.
  const stillInClan = new Set(usernames.map((u) => u.toLowerCase()));
  const entries = Array.from(byName.values()).filter((e) =>
    stillInClan.has(e.name.toLowerCase()),
  );

  entries.sort(
    (a, b) =>
      b.totalSatisfied - a.totalSatisfied || a.name.localeCompare(b.name),
  );

  const nextOffset = usernames.length
    ? (startOffset + processed) % usernames.length
    : 0;

  await sql`
    INSERT INTO leaderboard_cache (id, entries, updated_at, refresh_offset)
    VALUES (1, ${JSON.stringify(entries)}::jsonb, now(), ${nextOffset})
    ON CONFLICT (id) DO UPDATE SET
      entries = EXCLUDED.entries,
      updated_at = EXCLUDED.updated_at,
      refresh_offset = EXCLUDED.refresh_offset`;

  res.status(200).json({
    ok: true,
    count: entries.length,
    membershipCount,
    refreshedThisRun: processed,
    complete: !ranOutOfTime,
    nextOffset,
    elapsedMs: Date.now() - startedAt,
    skipped: { noDisplayName: noDisplayNameCount, ...skipCounts },
  });
}

type ResolvedMember =
  | { ok: true; displayName: string; profile: RuneProfile }
  | { ok: false; status: number; error: string; reason?: string };

/**
 * Resolves an RSN to a live RuneProfile, for `!rank`/`!verify`/`!needed`.
 *
 * Looks the name up exactly as typed, which is precisely what the website's
 * own Clan Ranks page does (fetchRuneProfile in src/services/runeprofile.ts).
 *
 * This used to consult the clan's WOM group roster first and then query
 * RuneProfile with the roster's stored displayName rather than the typed
 * name, on the stated grounds that "RuneProfile needs the real, properly-cased
 * name". That premise was simply wrong: RuneProfile's lookup is
 * case-insensitive (verified against the live API), so the substitution
 * bought nothing while quietly introducing a failure mode. Any time the
 * roster's name and the name RuneProfile knew disagreed, most often a rename
 * only one side had caught up on, the lookup went out under the wrong name
 * and came back 404. The plugin then told a member with a perfectly good
 * profile that they "aren't set up on RuneProfile", while the website, asking
 * under the name the member actually typed, found them immediately.
 *
 * The roster's only other contribution was the member's clan role, which fed
 * a `currentRank` field the plugin never read. So it cost a ~500 member WOM
 * group fetch, plus one more upstream call for a request to time out on, to
 * produce a value nothing displayed. Boss kc still comes from WOM below,
 * exactly as the website's own lookup gets it.
 */
async function resolveMemberProfile(rsn: string): Promise<ResolvedMember> {
  const encoded = encodeURIComponent(rsn);

  const fullRes = await fetch(`${RP_BASE}/accounts/${encoded}/full`, {
    headers: RP_HEADERS,
  });
  if (fullRes.status === 404) {
    return {
      ok: false,
      status: 404,
      error: `${rsn} isn't set up on RuneProfile.`,
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

  // Run alongside each other rather than sequentially - neither depends on the other's result.
  const [tasksData, womData] = await Promise.all([
    fetch(`${RP_BASE}/accounts/${encoded}/combat-achievements/tasks`, { headers: RP_HEADERS })
      .then((res) => (res.ok ? (res.json() as Promise<CombatAchievementTasksResponse>) : null))
      .catch(() => null),
    // WOM's per-player lookup isn't scoped to our group, so this can still
    // find boss kc for someone outside the clan too - worth trying either way.
    fetchWomPlayerData(rsn),
  ]);

  const profile = buildRuneProfile(data, tasksData, womData);
  return { ok: true, displayName: rsn, profile };
}

// Boss kc isn't in RuneProfile's own payload at all - it only tracks collection log/skills/quests/CAs.
// The client-side fetchRuneProfile() (src/services/runeprofile.ts) already knew this and pulled boss kc
// from a separate Wise Old Man player lookup; resolveMemberProfile above used to skip this entirely
// (passing null for womData), which meant every boss-kc apiCheck here silently saw 0 kc regardless of
// the real value - never noticed until getClanRequirement's Corrupted Gauntlet check actually depended
// on it. A missing/failed WOM lookup degrades to "no boss kc data" rather than failing the whole
// request, same as the client-side version's .catch(() => null).
async function fetchWomPlayerData(username: string): Promise<WomPlayerResponse | null> {
  try {
    const res = await fetch(`https://api.wiseoldman.net/v2/players/${encodeURIComponent(username)}`, {
      headers: WOM_HEADERS,
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as WomPlayerResponse;
  } catch {
    return null;
  }
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
  const { displayName, profile } = resolved;

  const verificationRows = await sql`
    SELECT item_name FROM manual_item_verifications WHERE rsn_key = ${displayName.toLowerCase()}`;
  const verifiedItemNames = new Set(
    verificationRows.map((r) => r.item_name as string),
  );

  const progress = computeClanRankProgress(ranks, profile, verifiedItemNames);

  // `!rank <name>` gets run on the same handful of people repeatedly (and
  // once per login by the RuneProfile-sync reminder), and this is still one of
  // the more expensive endpoints on the site: three upstream fetches, down
  // from four now that the WOM roster lookup is gone (see
  // resolveMemberProfile). A minute of edge caching collapses a burst of
  // lookups for the same name into one, while staying short enough that
  // someone who just re-synced RuneProfile and re-checks doesn't see a stale
  // answer for any length of time worth noticing.
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=60");

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
    // Always null since the WOM roster lookup that supplied it went away (see
    // resolveMemberProfile). Kept in the payload rather than dropped so the
    // plugin's existing field, which never displayed it anyway, keeps
    // deserializing against an unchanged response shape.
    currentRank: null,
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
  // Same reasoning as lookupRank's cache header above.
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=60");
  res.status(200).json({
    rsn: resolved.displayName,
    meets: result.met,
    reason: result.reason,
  });
}

export default withErrorHandling(async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
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
