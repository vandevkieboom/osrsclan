import {
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
 * How long the CDN may serve a cached copy of this response — and unlike
 * `pollSeconds` below, this now differs by whether an event is on, not just
 * how often each client asks.
 *
 * This is the dial that controls **compute**, and it is worth being precise
 * about why, because it behaves in a way that is easy to get backwards.
 *
 * Once enough members are online that every cache window ends in a miss
 * somewhere, the number of times this function actually *runs* stops
 * depending on how many members there are at all. It settles at roughly
 * (number of CDN locations serving the clan) x (60 / this value) per minute,
 * and nothing else. Twice as many members polling does not cost twice as
 * much compute; it costs the same, because the extra polls land on cache
 * entries that already exist.
 *
 * That matters for a reason specific to Neon, not just Vercel: its free-tier
 * compute only suspends (stops billing) after 5 real minutes with no query at
 * all. A handful of participants who forgot to clear their plugin key and
 * are still idly polling every few minutes is enough, in aggregate, to touch
 * the database more often than every 5 minutes forever — never once
 * suspending — even though the *count* of requests is tiny. The database
 * doesn't care how many people asked; it only cares how long it's been since
 * the last one. So while idle, this window needs to be comfortably longer
 * than 5 minutes to guarantee a real gap every cycle, regardless of how many
 * stale keys are still out there. While an event is active, none of that
 * applies — freshness is what matters, so this drops back to the short,
 * original window; see `CACHE_SECONDS_ACTIVE` below.
 *
 * The practical consequence: if the *compute* or *invocations* meter is
 * running hot, raise `PLUGIN_POLL_CACHE_SECONDS_IDLE`. If the *edge requests*
 * meter is running hot, raising either will not help at all — a cache hit is
 * still a billed request — and the thing to change is
 * `PLUGIN_POLL_SECONDS_ACTIVE` below, which is what scales with member count.
 */
const CACHE_SECONDS_ACTIVE = clampSeconds(process.env.PLUGIN_POLL_CACHE_SECONDS_ACTIVE, 30, 5);

// Idle window gets its own, much higher ceiling than clampSeconds' normal
// 900s cap: that cap exists to stop a typo turning the *active* window
// dangerously slow during a real event, which doesn't apply here — a long
// idle window is the entire point. 1800s (30 min) default: comfortably past
// Neon's 5-minute suspend threshold (guarantees the database actually gets a
// real quiet gap every cycle, see above) while still catching a newly
// re-activated event within one cycle, same as any other idle-to-active
// transition already had to tolerate.
const CACHE_SECONDS_IDLE = clampSeconds(
  process.env.PLUGIN_POLL_CACHE_SECONDS_IDLE,
  1800,
  5,
  3600,
);

function cacheControlFor(seconds: number): string {
  // stale-while-revalidate is generous on purpose: it means a member never
  // waits on a revalidation, and that a slow moment at the origin degrades to
  // "your answer is a few seconds older" rather than to a burst of concurrent
  // misses all rendering the same thing.
  return `s-maxage=${seconds}, stale-while-revalidate=${seconds * 3}`;
}

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
const POLL_SECONDS_ACTIVE = clampSeconds(process.env.PLUGIN_POLL_SECONDS_ACTIVE, 60);
const POLL_SECONDS_IDLE = clampSeconds(process.env.PLUGIN_POLL_SECONDS_IDLE, 300);

function clampSeconds(
  raw: string | undefined,
  fallback: number,
  min = 60,
  max = 900,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  // Bounded rather than trusted: a typo in an environment variable should not
  // be able to have every plugin in the clan hammering this, nor to silently
  // switch the plugin off by asking it to wait an hour (or, for the idle
  // cache window's much higher max, an unreasonably long one).
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

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
  res.setHeader("Cache-Control", cacheControlFor(CACHE_SECONDS_ACTIVE));

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
    res.setHeader("Cache-Control", cacheControlFor(CACHE_SECONDS_IDLE));
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
