import { fetchLiveStreams, type LiveStream } from "./_lib/twitch.js";
import { withErrorHandling } from "./_lib/handler.js";

export type { LiveStream };

/**
 * Superseded for the RuneLite plugin by GET /api/plugin-poll, which returns
 * this same list alongside the two other things the plugin used to fetch
 * separately on the same tick. Kept because (a) the site's own homepage
 * widget reads it, and (b) plugin installs update on their own schedule, so
 * older versions keep polling this for as long as they keep running.
 *
 * Both remaining callers are cheap now: the Twitch app token is cached
 * between invocations (see _lib/twitch.ts) rather than re-minted per request,
 * and every response — success, misconfiguration, or upstream failure — sets
 * the same cache header, so a Twitch outage can no longer collapse the edge
 * cache hit rate and promote every polling client to a real invocation.
 */
const CACHE_CONTROL = "s-maxage=60, stale-while-revalidate=120";

let lastGood: LiveStream[] = [];

export default withErrorHandling(async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  res.setHeader("Cache-Control", CACHE_CONTROL);

  const streams = await fetchLiveStreams();
  if (streams === null) {
    // Upstream failed. Serve the last list this instance actually saw rather
    // than an empty one — an empty list is a claim ("nobody is streaming")
    // that would make every plugin re-announce those same streamers as newly
    // live once Twitch came back.
    res.status(200).json({ streams: lastGood });
    return;
  }

  lastGood = streams;
  res.status(200).json({ streams });
});
