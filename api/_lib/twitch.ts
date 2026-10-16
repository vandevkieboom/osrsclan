import { createHmac } from "node:crypto";

export interface LiveStream {
  username: string;
  displayName: string;
  game: string;
  title: string;
  viewers: number;
  thumbnail: string;
}

interface TwitchTokenResponse {
  access_token: string;
  expires_in?: number;
}

interface TwitchStream {
  user_name: string;
  user_login: string;
  game_name: string;
  title: string;
  viewer_count: number;
  thumbnail_url: string;
}

interface TwitchStreamsResponse {
  data: TwitchStream[];
}

const CLIENT_ID = process.env.TWITCH_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET ?? "";
export const TWITCH_CHANNELS = (process.env.TWITCH_CHANNELS ?? "")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

// Twitch's category name, compared exactly as Helix returns it in game_name.
export const STREAMED_GAME = "Old School RuneScape";

export const twitchConfigured = Boolean(
  CLIENT_ID && CLIENT_SECRET && TWITCH_CHANNELS.length > 0,
);

// A client-credentials token is valid for ~60 days, but this endpoint was
// minting a brand new one on *every single invocation* — an extra round trip
// to id.twitch.tv in front of every stream check, doubling both the latency
// and the number of upstream calls for no benefit whatsoever. Cached per warm
// function instance, refreshed a minute before expiry (and re-fetched once on
// a 401, below, so a token invalidated early can't wedge the endpoint).
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(CLIENT_SECRET)}&grant_type=client_credentials`,
    { method: "POST" },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as TwitchTokenResponse;
  if (!data.access_token) return null;
  // Fall back to a conservative hour if Twitch omits expires_in, rather than
  // treating a missing field as "expires immediately" (which would restore
  // the per-request token fetch this cache exists to remove).
  const ttlMs = (data.expires_in ?? 3600) * 1000;
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60_000, ttlMs - 60_000),
  };
  return cachedToken.value;
}

/**
 * Which of the clan's configured Twitch channels are live right now.
 *
 * Returns null (rather than an empty list) when the lookup itself failed, so
 * callers can tell "nobody is streaming" from "we don't know" — the plugin
 * poll endpoint needs that distinction to avoid caching a bogus "nobody is
 * live" and, worse, making every plugin announce those same streamers as
 * newly live again once the real answer comes back.
 */
export async function fetchLiveStreams(): Promise<LiveStream[] | null> {
  if (!twitchConfigured) return [];

  try {
    const params = TWITCH_CHANNELS.map(
      (c) => `user_login=${encodeURIComponent(c)}`,
    ).join("&");
    const res = await helix(`/streams?${params}`);
    if (!res?.ok) return null;

    const data = (await res.json()) as TwitchStreamsResponse;
    // Only Old School streams count: members who stream other games are
    // still clan streamers, but this is an OSRS clan and the homepage and
    // `!live` were advertising whatever they happened to be playing.
    return data.data
      .filter((s) => s.game_name === STREAMED_GAME)
      .map((s) => ({
        username: s.user_login,
        displayName: s.user_name,
        game: s.game_name,
        title: s.title,
        viewers: s.viewer_count,
        thumbnail: s.thumbnail_url
          .replace("{width}", "320")
          .replace("{height}", "180"),
      }));
  } catch {
    return null;
  }
}

/**
 * A Helix API call with the app token, retried once with a fresh token on a
 * 401. Null when no token could be had at all.
 */
export async function helix(
  path: string,
  init: RequestInit = {},
): Promise<Response | null> {
  let token = await getToken();
  if (!token) return null;
  const call = (t: string) =>
    fetch(`https://api.twitch.tv/helix${path}`, {
      ...init,
      headers: {
        "Client-ID": CLIENT_ID,
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
    });
  let res = await call(token);
  if (res.status === 401) {
    token = await getToken(true);
    if (!token) return null;
    res = await call(token);
  }
  return res;
}

/**
 * The secret Twitch signs EventSub notifications with. Derived from the
 * client secret rather than kept as its own env var: one less thing to set
 * up, and rotating the client secret just makes the old subscriptions fail
 * until the daily sync re-creates them with the new one.
 */
export function eventSubSecret(): string {
  return createHmac("sha256", CLIENT_SECRET).update("eventsub").digest("hex");
}
