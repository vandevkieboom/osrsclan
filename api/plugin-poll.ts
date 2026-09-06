import {
  boardConfigCacheControl,
  clampEnvSeconds,
  getBoardConfigMemoised,
  maybeReconcileGoalProgress,
} from "./_lib/board.js";
import { withErrorHandling } from "./_lib/handler.js";

/**
 * The single request the RuneLite plugin makes on its once-a-minute tick,
 * while a plugin key is set.
 *
 * Broadcast and live-stream notifications (and the third request that used
 * to carry them) were removed entirely — see CLAUDE.md's "Hosting cost"
 * section. What's left only matters to members actually participating in a
 * bingo, so `hasAnythingToPollFor()` on the plugin side gates the whole tick
 * on having a plugin key set: nobody polls at all between events.
 *
 * Two properties still matter here:
 *
 *  1. **Byte-identical for every caller.** No auth, no cookies, nothing
 *     per-member. That's what lets one edge cache entry serve every online
 *     plugin instead of one cache entry per member (which is no cache at
 *     all).
 *
 *  2. **Always answers 200, and always with a cache header** — including
 *     when the database is unreachable. This is the important one. Vercel's
 *     edge does not cache a 5xx, so an endpoint that 500s under pressure
 *     stops absorbing traffic at exactly the moment it most needs to, and
 *     every polling client is promoted straight to a function invocation.
 *     That is not hypothetical: it is precisely how a database compute quota
 *     running out turned into the hosting compute quota running out too. A
 *     degraded-but-cacheable answer breaks that feedback loop.
 *
 * It still carries `boardChangedAt`, so the plugin can skip the expensive
 * board fetch entirely on the (overwhelmingly common) ticks where the board
 * has not changed since it last looked. See db/schema.sql.
 */

/**
 * The cache windows this endpoint uses live in _lib/board.ts
 * (`boardConfigCacheControl`), shared with every other endpoint that answers
 * from board_config — see the reasoning there. If the *compute* or
 * *invocations* meter is running hot, raise `PLUGIN_POLL_CACHE_SECONDS_IDLE`.
 * If the *edge requests* meter is running hot, raising either will not help at
 * all — a cache hit is still a billed request — and the thing to change is
 * `PLUGIN_POLL_SECONDS_ACTIVE` below, which is what scales with member count.
 */

/**
 * How often the plugin should call this, in seconds — the server decides,
 * not the plugin.
 *
 * Two reasons it lives here rather than as a constant in the plugin:
 *
 *  1. **It differs by whether a bingo event is actually running.** Nobody
 *     polls at all outside an event (see the plugin's
 *     `hasAnythingToPollFor()`), so this only ever matters to someone who
 *     currently has a plugin key set. While an event is on, the board is
 *     what they're watching, so the poll stays at one minute. The moment
 *     `bingo_active` goes false, the cadence backs off — there's nothing
 *     left to be prompt about.
 *
 *  2. **It can be changed without shipping a plugin release.** Hosting quotas
 *     are monthly and hard: going over doesn't cost money on this plan, it
 *     takes the site down for everyone until the month rolls over. Plugin
 *     installs update on their own schedule and some never do, so a number
 *     baked into the plugin is a number that cannot be corrected in time.
 *     Set PLUGIN_POLL_SECONDS_ACTIVE / PLUGIN_POLL_SECONDS_IDLE in the
 *     project's environment variables to raise these if usage is running hot
 *     mid-month; it takes effect on every plugin within one poll.
 *
 * Note that the edge cache does not help with the metered request *count* at
 * all — a cache hit is still a billed request. Only polling less often, or
 * polling for fewer things at once, moves that number.
 */
const POLL_SECONDS_ACTIVE = clampEnvSeconds(process.env.PLUGIN_POLL_SECONDS_ACTIVE, 60);
const POLL_SECONDS_IDLE = clampEnvSeconds(process.env.PLUGIN_POLL_SECONDS_IDLE, 300);

// Served when the database can't be reached and this instance has never seen
// a good read. bingoActive is false here, which is the opposite of the
// fail-open default used everywhere else, and that inversion is on purpose:
// "fail open" normally means "don't let a hiccup cancel someone's event", but
// the only thing a plugin does with bingoActive=true is start fetching the
// board — and if the database is down, that fetch cannot succeed either. So
// failing open during an outage buys nobody a working board; it just adds a
// second failing request per member per minute to a system already in
// trouble. The instant a real read succeeds, the real value takes over.
const OUTAGE_FALLBACK = {
  bingoActive: false,
  boardChangedAt: null as string | null,
  degraded: true,
};

export default withErrorHandling(async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Set before anything that can fail, so no path can return an uncacheable
  // response — see property 2 above. Defaults to the short, active-event
  // window: safest assumption when we don't yet know (or can't find out)
  // whether an event is running, since it degrades toward "checked too
  // often" rather than "an active event's board goes stale for 30 minutes".
  res.setHeader("Cache-Control", boardConfigCacheControl(true));

  const { row: config, stale } = await getBoardConfigMemoised();

  if (!config) {
    // Idle cadence during an outage: there is nothing to be prompt about
    // when we can't read anything, and a struggling site should be asked
    // less often, not more. Cache header stays at the short default set
    // above, for the same fail-safe reason.
    res.status(200).json({
      ...OUTAGE_FALLBACK,
      pollSeconds: POLL_SECONDS_IDLE,
    });
    return;
  }

  // Now that a real read succeeded, switch to the long idle cache window if
  // there's genuinely no event running — this is what lets Neon's compute
  // actually suspend between events. Left at the short default from above
  // while an event is active, so board freshness during the one time it
  // matters is completely unaffected by any of this.
  if (!config.bingo_active) {
    res.setHeader("Cache-Control", boardConfigCacheControl(false));
  }

  // The xp/kc hiscores reconcile pass hangs off this endpoint rather than off
  // the board fetch — see maybeReconcileGoalProgress for why that placement
  // is required rather than incidental. It is internally throttled, so all
  // but roughly one call per interval costs a single indexed row read, and it
  // only runs at all while an event is actually on.
  if (config.bingo_active) {
    try {
      await maybeReconcileGoalProgress();
    } catch (err) {
      console.error("goal-progress reconciliation failed:", err);
    }
  }

  res.status(200).json({
    bingoActive: config.bingo_active,
    // How long the plugin should wait before calling again — fast while an
    // event is on, slow the instant it isn't. Only participants (the only
    // callers of this endpoint at all now) ever see the fast value.
    pollSeconds: config.bingo_active ? POLL_SECONDS_ACTIVE : POLL_SECONDS_IDLE,
    // The plugin only ever compares this to the value it last fetched the
    // board with, so its format is opaque — it just has to change whenever
    // the board does.
    boardChangedAt: config.board_changed_at,
    // True when the answer came from a cached read after a failed database
    // query. Surfaced so the plugin can tell "no event running" from "we
    // couldn't check", and stay quiet rather than acting on the difference.
    degraded: stale,
  });
});
