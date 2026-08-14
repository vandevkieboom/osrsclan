import { withErrorHandling } from "./_lib/handler.js";
import { reconcileGoalProgress, fetchWomStatsByRsnKey } from "./_lib/board.js";

const BASE_URL = "https://api.wiseoldman.net/v2";
// Keep in sync with WOM_GROUP_ID in src/constants.ts, vite.config.ts, and
// api/runeprofile-proxy.ts.
const GROUP_ID = 22206;
const API_KEY = process.env.WOM_API_KEY ?? "";

const WOM_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent": "vandevkieboom",
  ...(API_KEY ? { "x-api-key": API_KEY } : {}),
};

const PERIOD_RE = /^(week|month)$/;

export default withErrorHandling(async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { type } = req.query;

  if (type === "bulk-gained") {
    const { period } = req.query;
    if (typeof period !== "string" || !PERIOD_RE.test(period)) {
      res.status(400).json({ error: "Invalid period" });
      return;
    }
    const upstream = await fetch(
      `${BASE_URL}/groups/${GROUP_ID}/bulk-gained?period=${period}`,
      { headers: WOM_HEADERS },
    );
    if (upstream.status === 429) {
      res
        .status(429)
        .json({ error: "Rate limit hit — wait a moment and try again." });
      return;
    }
    res.setHeader(
      "Cache-Control",
      "s-maxage=3600, stale-while-revalidate=3600",
    );
    res.status(upstream.status).json(await upstream.json());
  } else if (type === "bulk-hiscores") {
    const upstream = await fetch(
      `${BASE_URL}/groups/${GROUP_ID}/bulk-hiscores`,
      { headers: WOM_HEADERS },
    );
    if (upstream.status === 429) {
      res
        .status(429)
        .json({ error: "Rate limit hit — wait a moment and try again." });
      return;
    }
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
    res.status(upstream.status).json(await upstream.json());
  } else if (type === "roles") {
    const upstream = await fetch(`${BASE_URL}/groups/${GROUP_ID}`, {
      headers: WOM_HEADERS,
    });
    if (upstream.status === 429) {
      res
        .status(429)
        .json({ error: "Rate limit hit — wait a moment and try again." });
      return;
    }
    if (!upstream.ok) {
      res.status(upstream.status).json(await upstream.json());
      return;
    }
    const group = (await upstream.json()) as {
      memberships?: Array<{
        player: { username: string };
        role: string;
      }>;
    };
    res.setHeader(
      "Cache-Control",
      "s-maxage=3600, stale-while-revalidate=3600",
    );
    res.status(200).json({ memberships: group.memberships ?? [] });
  } else if (type === "event") {
    const compsRes = await fetch(
      `${BASE_URL}/groups/${GROUP_ID}/competitions?limit=20`,
      { headers: WOM_HEADERS },
    );
    if (compsRes.status === 429) {
      res
        .status(429)
        .json({ error: "Rate limit hit — wait a moment and try again." });
      return;
    }
    if (!compsRes.ok) {
      res.status(compsRes.status).json(await compsRes.json());
      return;
    }
    const comps = (await compsRes.json()) as Array<{
      id: number;
      status: string;
    }>;
    const target =
      comps.find((c) => c.status === "ongoing") ??
      comps.find((c) => c.status === "upcoming") ??
      comps[0];
    if (!target) {
      res.status(404).json({ error: "No competition found." });
      return;
    }
    const upstream = await fetch(`${BASE_URL}/competitions/${target.id}`, {
      headers: WOM_HEADERS,
    });
    if (upstream.status === 429) {
      res
        .status(429)
        .json({ error: "Rate limit hit — wait a moment and try again." });
      return;
    }
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
    res.status(upstream.status).json(await upstream.json());
  } else if (type === "player") {
    const { username } = req.query;
    if (typeof username !== "string" || !username.trim()) {
      res.status(400).json({ error: "Invalid username" });
      return;
    }
    const upstream = await fetch(
      `${BASE_URL}/players/${encodeURIComponent(username)}`,
      { headers: WOM_HEADERS },
    );
    if (upstream.status === 429) {
      res
        .status(429)
        .json({ error: "Rate limit hit — wait a moment and try again." });
      return;
    }
    res.status(upstream.status).json(await upstream.json());
  } else if (type === "goal-reconcile") {
    // Vercel automatically sends this header on cron-triggered invocations
    // when CRON_SECRET is set on the project — see vercel.json's `crons`.
    // Same auth shape as runeprofile-proxy.ts's leaderboard-refresh cron.
    const expected = process.env.CRON_SECRET;
    if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // This is now a redundant fallback for periods with zero site/plugin
    // traffic — the real backstop is maybeReconcileGoalProgress, triggered
    // from GET /api/board on every plugin refresh (see api/_lib/board.ts).
    const womByRsnKey = await fetchWomStatsByRsnKey();
    if (!womByRsnKey) {
      res.status(502).json({ error: "Failed to load WOM hiscores." });
      return;
    }

    const result = await reconcileGoalProgress(womByRsnKey);
    res.status(200).json({ ok: true, ...result });
  } else {
    res.status(400).json({ error: "Invalid type" });
  }
});
