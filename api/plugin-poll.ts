import { clampEnvSeconds } from "./_lib/board.js";
import {
  cachePollResponse,
  loadPollState,
  setCdnCache,
} from "./_lib/board-cache.js";
import { withErrorHandling } from "./_lib/handler.js";

/**
 * The single request the RuneLite plugin makes on its tick, while a plugin key
 * is set. The website's open board tabs ask for it too, as their "did anything
 * change?" check, so both share one CDN entry.
 *
 * Two properties matter:
 *
 *  1. **Byte-identical for every caller.** No auth, no cookies, nothing
 *     per-member. That's what lets one CDN entry serve every online plugin
 *     instead of one entry per member (which is no cache at all).
 *
 *  2. **Always answers 200, always cacheable** — including when the database
 *     is unreachable. Vercel's CDN does not cache a 5xx, so an endpoint that
 *     500s under pressure stops absorbing traffic at exactly the moment it
 *     most needs to, and every polling client is promoted straight to a
 *     function invocation. That is precisely how a database compute quota
 *     running out once turned into the hosting compute quota running out too.
 *
 * The response is cached at the CDN until something actually changes (see
 * _lib/board-cache.ts), so this function, and Postgres behind it, only run
 * after a submission, a review, an admin edit, or when an xp/kc hiscores pass
 * comes due. It carries `boardVersion`, which a client passes back as
 * `/api/board?v=` to get a board that is also cached until it changes.
 */

/**
 * How often the plugin should call this, in seconds — the server decides, not
 * the plugin, so it can be changed without shipping a plugin release. Set
 * PLUGIN_POLL_SECONDS_ACTIVE / PLUGIN_POLL_SECONDS_IDLE on the project to
 * change them; they take effect on every plugin within one poll.
 *
 * This is the only dial for the *Edge Requests* meter: every poll is a billed
 * request whether or not it is a cache hit, so caching cannot help there, only
 * asking less often can. Plugins from 2026-09-23 on already poll less often
 * while their sidebar panel is closed.
 */
const POLL_SECONDS_ACTIVE = clampEnvSeconds(process.env.PLUGIN_POLL_SECONDS_ACTIVE, 60);
const POLL_SECONDS_IDLE = clampEnvSeconds(process.env.PLUGIN_POLL_SECONDS_IDLE, 300);

// Served when the database can't be reached and this instance has never seen
// a good read. bingoActive is false here, the opposite of the fail-open
// default used elsewhere, on purpose: the only thing a plugin does with
// bingoActive=true is start fetching the board, and if the database is down
// that fetch cannot succeed either.
const OUTAGE_FALLBACK = {
  bingoActive: false,
  boardChangedAt: null as string | null,
  boardVersion: null as string | null,
  goalProgress: {},
  degraded: true,
};

export default withErrorHandling(async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Before anything that can fail, so no path returns an uncacheable response.
  setCdnCache(res, 30);

  const { state, degraded } = await loadPollState();
  cachePollResponse(res, state, degraded);

  if (!state) {
    res.status(200).json({ ...OUTAGE_FALLBACK, pollSeconds: POLL_SECONDS_IDLE });
    return;
  }

  res.status(200).json({
    bingoActive: state.config.bingo_active,
    pollSeconds: state.config.bingo_active ? POLL_SECONDS_ACTIVE : POLL_SECONDS_IDLE,
    // The plugin compares this against the stamp its board was rendered with.
    boardChangedAt: state.config.board_changed_at,
    // Pass back as /api/board?v= to get a board cached until it changes.
    boardVersion: state.boardVersion,
    // Team-combined xp/kc totals, applied to the held board in place so a
    // number moving doesn't require a board fetch.
    goalProgress: state.goalProgress,
    // True when the answer is a cached read after a failed database query,
    // so a client can tell "no event running" from "we couldn't check".
    degraded,
  });
});
