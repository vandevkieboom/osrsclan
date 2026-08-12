import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import ranks, { rankIconByRole, STAFF_ROLES } from "../src/data/ranks-data.js";
import { computeClanRankProgress } from "../src/services/rank-checker.js";
import { getRankForRole } from "../src/services/profile.js";
import {
  buildRuneProfile,
  type CombatAchievementTasksResponse,
  type FullAccountResponse,
} from "../src/services/runeprofile.js";

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
  const rows = await sql`SELECT entries, updated_at FROM leaderboard_cache WHERE id = 1`;
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
  const rolesRes = await fetch(`https://api.wiseoldman.net/v2/groups/${WOM_GROUP_ID}`, {
    headers: WOM_HEADERS,
  });
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
  const verificationRows = await sql`SELECT rsn_key, item_name FROM manual_item_verifications`;
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
    for (let attempt = 0; res.status === 429 && attempt < MAX_RETRIES; attempt++) {
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
        const fullRes = await fetchWithRetry(`${RP_BASE}/accounts/${encoded}/full`);
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

        const verifiedItemNames = verifiedByRsn.get(username.toLowerCase()) ?? EMPTY_SET;
        const profile = buildRuneProfile(data, tasksData, null);
        // Untrackable items an admin has confirmed (verifiedItemNames) are
        // counted directly here, same as the per-user "My Progress" view —
        // the rank badge itself still comes from the member's real WOM role
        // below, not this checklist.
        const progress = computeClanRankProgress(ranks, profile, verifiedItemNames);

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
          ? Math.round((progress.overallSatisfied / progress.overallTotal) * 100)
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
            (item) => !item.apiCheck && !verifiedItemNames.has(item.name.toLowerCase()),
          ).length;
          const shortfall = Math.max(0, stats.requiredCount - stats.satisfiedCount);
          const creditedUntrackable = Math.min(unconfirmedUntrackable, shortfall);
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

  entries.sort((a, b) => b.totalSatisfied - a.totalSatisfied || a.name.localeCompare(b.name));

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (req.query.resource === "leaderboard") {
    await getLeaderboard(res);
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
}
