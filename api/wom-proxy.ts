import { withErrorHandling } from "./_lib/handler.js";
import { refreshGoalLatestValues, fetchWomStatsByRsnKey } from "./_lib/board.js";
import { isSkillMetric } from "./_lib/icons.js";
import { readBoardMarker } from "./_lib/board-marker.js";

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

/**
 * WOM's group-competitions list (and the single-competition endpoint) do not
 * actually return a `status` field at all — confirmed against the live API,
 * not assumed. Both `type=event` and `type=event-summary` used to filter on
 * `c.status === "ongoing"`, which can never match anything, so both silently
 * always fell through to their "nothing matched" fallback. For `type=event`
 * that fallback is `comps[0]`, which happened to look right only because
 * WOM's list is sorted newest-first — it was never actually checking whether
 * that competition was still running. Status has to be derived from the
 * timestamps instead.
 */
function classifyCompetition(
  c: { startsAt: string; endsAt: string },
): "ongoing" | "upcoming" | "finished" {
  const now = Date.now();
  const starts = new Date(c.startsAt).getTime();
  const ends = new Date(c.endsAt).getTime();
  if (now < starts) return "upcoming";
  if (now > ends) return "finished";
  return "ongoing";
}

/**
 * The clan also creates WOM competitions for purposes other than a public
 * SOTW/BOTW — most notably one per bingo, used purely to eyeball xp/kc
 * movement on WOM's own site. The bingo board's own xp/kc tiles never read
 * this (they come from bulk-hiscores against a baseline set at reset, not
 * from any competition object), so a bingo-tracking competition existing has
 * no effect on the board — but without this filter it would still show up in
 * `!event` as if it were a real event with "official" top-3 standings, which
 * it isn't; nobody is actually competing in it.
 *
 * A positive match rather than an exclude list on purpose: "contains SOTW or
 * BOTW" only ever matches the clan's actual naming convention for real
 * events (confirmed - every one so far is titled "<thing> - SOTW/BOTW (date
 * range)"), so anything named for another purpose is excluded automatically,
 * without this needing to know every non-event name in advance the way an
 * exclude-"bingo" check would.
 */
function isRealCompetition(title: string): boolean {
  return /\b(sotw|botw)\b/i.test(title);
}

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
    const allComps = (await compsRes.json()) as Array<{
      id: number;
      title: string;
      startsAt: string;
      endsAt: string;
    }>;
    // Excludes non-public competitions (a bingo's own xp/kc tracking comp,
    // say) — see isRealCompetition.
    const comps = allComps.filter((c) => isRealCompetition(c.title));
    const target =
      comps.find((c) => classifyCompetition(c) === "ongoing") ??
      comps.find((c) => classifyCompetition(c) === "upcoming") ??
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
  } else if (type === "event-summary") {
    // Backs the RuneLite plugin's `!event` command. Deliberately separate
    // from `type=event` above (which the website's Events tab uses) rather
    // than changing that endpoint's shape: this needs to report *every*
    // currently-ongoing competition, not silently pick one, since the clan
    // does sometimes overlap a BOTW and a SOTW rather than always running
    // them one at a time. `comps.find(...)` (singular) would show one and
    // give no indication a second was even running.
    //
    // Also reports "none" explicitly when nothing is ongoing or upcoming,
    // rather than falling back to comps[0] the way type=event does — that
    // fallback can surface a competition that finished long ago as if it
    // were current, exactly what would happen during a bingo or any other
    // quiet week with nothing running on WOM.
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
    const allComps = (await compsRes.json()) as Array<{
      id: number;
      title: string;
      startsAt: string;
      endsAt: string;
    }>;
    // Excludes non-public competitions (a bingo's own xp/kc tracking comp,
    // say) — see isRealCompetition. Without this, !event would report a
    // bingo-tracking competition as if it were a real event complete with a
    // "top 3" nobody is actually competing for.
    const comps = allComps.filter((c) => isRealCompetition(c.title));

    const ongoing = comps.filter((c) => classifyCompetition(c) === "ongoing");
    const upcoming = comps.filter((c) => classifyCompetition(c) === "upcoming");
    const targets = ongoing.length > 0 ? ongoing : upcoming;
    const status = ongoing.length > 0 ? "ongoing" : upcoming.length > 0 ? "upcoming" : "none";

    if (targets.length === 0) {
      // Told apart from "there's genuinely nothing going on" so the plugin
      // can say something more useful than "no BOTW/SOTW" during a bingo -
      // the bingo's own xp/kc tracking competition (if any) was just
      // filtered out above precisely because it isn't a real event, but
      // that doesn't mean nothing is happening. Only fetched here, on the
      // no-competition path, rather than unconditionally: it's a free Blob
      // read either way, but there's no reason to spend even that on the
      // common case where a real competition was already found above.
      const marker = await readBoardMarker();
      res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
      res.status(200).json({
        status,
        competitions: [],
        bingoActive: marker?.bingoActive ?? false,
      });
      return;
    }

    const details = await Promise.all(
      targets.map((t) =>
        fetch(`${BASE_URL}/competitions/${t.id}`, { headers: WOM_HEADERS }).then((r) =>
          r.ok ? r.json() : null,
        ),
      ),
    );
    // metricType decided here, once, from the one canonical skill list
    // (api/_lib/icons.ts) rather than the plugin keeping its own copy just
    // for this — that list already has to stay in sync between the website
    // and the plugin for tile icons, and a third copy is a third place to
    // drift.
    const competitions = (details.filter(Boolean) as Array<{ metric: string }>).map(
      (c) => ({ ...c, metricType: isSkillMetric(c.metric) ? "xp" : "kc" }),
    );
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
    res.status(200).json({ status, competitions });
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

    const result = await refreshGoalLatestValues(womByRsnKey);
    res.status(200).json({ ok: true, ...result });
  } else {
    res.status(400).json({ error: "Invalid type" });
  }
});
