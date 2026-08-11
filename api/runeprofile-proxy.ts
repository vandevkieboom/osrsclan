import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import ranks from "../src/data/ranks-data.js";
import { computeClanRankProgress } from "../src/services/rank-checker.js";
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
  highestEligibleRankIndex: number;
  nextRankPct: number;
}

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
    memberships?: Array<{ player: { displayName: string } }>;
  };
  // RuneProfile needs the real, properly-cased in-game name — WOM's `username`
  // field is a lowercased/sanitized lookup key (fine for internal maps, wrong
  // account or a 404 if used against an external API), same distinction the
  // rest of the app already respects (see hiscores-page.tsx, profile-page.tsx).
  const usernames = Array.from(
    new Set((group.memberships ?? []).map((m) => m.player.displayName).filter(Boolean)),
  );

  const entries: LeaderboardEntry[] = [];
  const CONCURRENCY = 4;
  const STAGGER_MS = 150;
  let cursor = 0;

  async function worker() {
    while (cursor < usernames.length) {
      const username = usernames[cursor++];
      if (cursor > 1) await sleep(STAGGER_MS);
      try {
        const encoded = encodeURIComponent(username);
        const [fullRes, tasksRes] = await Promise.all([
          fetch(`${RP_BASE}/accounts/${encoded}/full`, { headers: RP_HEADERS }),
          fetch(`${RP_BASE}/accounts/${encoded}/combat-achievements/tasks`, {
            headers: RP_HEADERS,
          }),
        ]);
        if (!fullRes.ok) continue; // not on RuneProfile, private, or never synced

        const data = (await fullRes.json()) as FullAccountResponse;
        const tasksData = tasksRes.ok
          ? ((await tasksRes.json()) as CombatAchievementTasksResponse)
          : null;

        const profile = buildRuneProfile(data, tasksData, null);
        const progress = computeClanRankProgress(ranks, profile);

        const nextRankIndex = progress.highestEligibleRankIndex + 1;
        const nextRankStats = progress.rankStats[nextRankIndex];
        const nextRankPct =
          nextRankIndex >= ranks.length
            ? 100
            : nextRankStats.total
              ? Math.round((nextRankStats.satisfiedCount / nextRankStats.total) * 100)
              : 0;

        entries.push({
          name: data.username || username,
          totalSatisfied: progress.overallSatisfied,
          highestEligibleRankIndex: progress.highestEligibleRankIndex,
          nextRankPct,
        });
      } catch {
        // Skip members whose RuneProfile data fails to fetch or parse.
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

  res.status(200).json({ ok: true, count: entries.length });
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
