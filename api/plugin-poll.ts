import {
  getBoardConfigMemoised,
  maybeReconcileGoalProgress,
} from "./_lib/board.js";
import { fetchLiveStreams, type LiveStream } from "./_lib/twitch.js";
import { withErrorHandling } from "./_lib/handler.js";

/**
 * The single request the RuneLite plugin makes on its once-a-minute tick.
 *
 * It replaces three separate ones (`/api/board?resource=status`,
 * `/api/runeprofile-proxy?resource=broadcast`, `/api/twitch-live`), which
 * between them were the entire reason this project's hosting usage ran away:
 * three requests per minute per online member, forever, is ~4,300 requests
 * per member per day before anybody does anything at all. Merging them cuts
 * that by two thirds at identical freshness — the three answers were always
 * being fetched on the same tick anyway, they were just being fetched
 * separately.
 *
 * Three properties matter here and each one is deliberate:
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
 *  3. **Carries `boardChangedAt`**, so the plugin can skip the expensive
 *     board fetch entirely on the (overwhelmingly common) ticks where the
 *     board has not changed since it last looked. See db/schema.sql.
 */

/**
 * How long the CDN may serve a cached copy of this response.
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
 * The practical consequence: if the *compute* or *invocations* meter is
 * running hot, raise this. If the *edge requests* meter is running hot,
 * raising this will not help at all — a cache hit is still a billed request —
 * and the thing to change is PLUGIN_POLL_SECONDS_ACTIVE below, which is what
 * scales with member count.
 *
 * Total staleness a member can see is this plus their poll interval. At the
 * default 30s and a 60s poll that is a worst case of about a minute and a
 * half from an admin pressing send to the last member seeing it.
 */
const CACHE_SECONDS = clampSeconds(process.env.PLUGIN_POLL_CACHE_SECONDS, 30, 5);

// stale-while-revalidate is generous on purpose: it means a member never
// waits on a revalidation, and that a slow moment at the origin degrades to
// "your answer is a few seconds older" rather than to a burst of concurrent
// misses all rendering the same thing.
const CACHE_CONTROL = `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 3}`;

/**
 * How often the plugin should call this, in seconds — the server decides,
 * not the plugin.
 *
 * Two reasons it lives here rather than as a constant in the plugin:
 *
 *  1. **It can differ by situation, and the situations are very different.**
 *     Bingo events happen a few times a year; the rest of the time this
 *     plugin is a clan tool that a few hundred people run for the chat
 *     commands and the notifications. That idle state, not the event, is
 *     where nearly all of the year's requests are spent, simply because it
 *     is nearly all of the year.
 *
 *     During an event the board is what members are actually watching, so the
 *     poll stays at one minute. Between events the only things this response
 *     carries are "someone went live" and the occasional admin broadcast —
 *     neither of which anybody experiences differently at one minute versus
 *     five — so it backs right off, and the idle cost falls by 80%. Note that
 *     a *follow-up* broadcast still arrives quickly: posting one switches
 *     everybody to the fast cadence for the next quarter of an hour (see
 *     needsFastPolling).
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
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  // Bounded rather than trusted: a typo in an environment variable should not
  // be able to have every plugin in the clan hammering this, nor to silently
  // switch the plugin off by asking it to wait an hour.
  return Math.min(900, Math.max(min, Math.round(parsed)));
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
  broadcast: null as { message: string; updatedAt: string } | null,
  degraded: true,
};

// How long after a broadcast the fast cadence stays on. An admin who sends
// one message very often sends a correction or a follow-up shortly after, and
// that second message arriving up to a slow-cadence interval later is exactly
// the complaint that got the old broadcast cache window shortened. This
// doesn't help the *first* message of a quiet period — nothing can, short of
// polling fast all the time, since the plugin has to ask before it can be
// told — but it does mean a conversation happens at conversation speed.
const BROADCAST_FAST_WINDOW_MS = 15 * 60 * 1000;

function needsFastPolling(config: {
  broadcast_updated_at: string | null;
}): boolean {
  if (!config.broadcast_updated_at) return false;
  const age = Date.now() - new Date(config.broadcast_updated_at).getTime();
  return Number.isFinite(age) && age >= 0 && age < BROADCAST_FAST_WINDOW_MS;
}

// Streams are cached separately from board_config because they come from a
// different upstream with a different failure mode: a Twitch outage must not
// discard a perfectly good bingo/broadcast answer, and a null (rather than
// empty) stream result has to be held onto rather than published, or every
// plugin would treat the streamers it dropped as newly live again the moment
// Twitch recovered.
const STREAM_MEMO_MS = 30_000;
let streamMemo: { streams: LiveStream[]; at: number } | null = null;

async function getStreams(): Promise<LiveStream[]> {
  if (streamMemo && Date.now() - streamMemo.at < STREAM_MEMO_MS) {
    return streamMemo.streams;
  }
  const streams = await fetchLiveStreams();
  if (streams === null) {
    // Lookup failed — keep serving the last known-good list rather than
    // publishing an empty one we don't actually believe.
    return streamMemo?.streams ?? [];
  }
  streamMemo = { streams, at: Date.now() };
  return streams;
}

export default withErrorHandling(async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Set before anything that can fail, so no path can return an uncacheable
  // response — see property 2 above.
  res.setHeader("Cache-Control", CACHE_CONTROL);

  const [{ row: config, stale }, streams] = await Promise.all([
    getBoardConfigMemoised(),
    getStreams(),
  ]);

  if (!config) {
    // Idle cadence during an outage: there is nothing to be prompt about
    // when we can't read anything, and a struggling site should be asked
    // less often, not more.
    res.status(200).json({
      ...OUTAGE_FALLBACK,
      pollSeconds: POLL_SECONDS_IDLE,
      streams,
    });
    return;
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
    // How long the plugin should wait before calling again. One number, the
    // same for every member of the clan.
    //
    // An earlier version returned a second, faster number for members
    // competing in a bingo, on the grounds that they were already polling
    // often for the board so the announcements were free for them. That was
    // true and it was still wrong: it made a clan-wide feature — "someone is
    // live", "everyone check Discord" — arrive sooner for some members than
    // others based on whether they happened to be in a bingo team, which is
    // indefensible from the outside no matter how well it reads as a billing
    // optimisation.
    //
    // Board state now travels on its own request instead (see the status
    // endpoint in api/board.ts), which is the thing that actually needed to be
    // fast for a subset of people. Announcements are for everybody, so they
    // go out to everybody at one speed.
    pollSeconds: needsFastPolling(config) ? POLL_SECONDS_ACTIVE : POLL_SECONDS_IDLE,
    // The plugin only ever compares this to the value it last fetched the
    // board with, so its format is opaque — it just has to change whenever
    // the board does.
    boardChangedAt: config.board_changed_at,
    broadcast:
      config.broadcast_message && config.broadcast_updated_at
        ? {
            message: config.broadcast_message,
            updatedAt: config.broadcast_updated_at,
          }
        : null,
    streams,
    // True when the answer came from a cached read after a failed database
    // query. Surfaced so the plugin can tell "no event running" from "we
    // couldn't check", and stay quiet rather than acting on the difference.
    degraded: stale,
  });
});
