import type { VercelRequest, VercelResponse } from "@vercel/node";
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

// Fans out to RuneProfile for every clan member (a handful at a time) and
// runs the exact same rank-progress logic as the per-user "My Progress"
// view, so the leaderboard can never drift from what a self-lookup shows.
async function getLeaderboard(res: VercelResponse) {
  const rolesRes = await fetch(`https://api.wiseoldman.net/v2/groups/${WOM_GROUP_ID}`, {
    headers: WOM_HEADERS,
  });
  if (!rolesRes.ok) {
    res.status(502).json({ error: "Failed to load clan member list." });
    return;
  }
  const group = (await rolesRes.json()) as {
    memberships?: Array<{ player: { username: string } }>;
  };
  const usernames = Array.from(
    new Set((group.memberships ?? []).map((m) => m.player.username).filter(Boolean)),
  );

  const entries: LeaderboardEntry[] = [];
  const CONCURRENCY = 5;
  let cursor = 0;

  async function worker() {
    while (cursor < usernames.length) {
      const username = usernames[cursor++];
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

  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=900");
  res.status(200).json({ entries });
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

  await proxyPath(req, res);
}
