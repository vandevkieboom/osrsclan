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
const CHANNELS = (process.env.TWITCH_CHANNELS ?? "")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

export const twitchConfigured = Boolean(
  CLIENT_ID && CLIENT_SECRET && CHANNELS.length > 0,
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
    let token = await getToken();
    if (!token) return null;

    const params = CHANNELS.map(
      (c) => `user_login=${encodeURIComponent(c)}`,
    ).join("&");
    const url = `https://api.twitch.tv/helix/streams?${params}`;
    const call = (t: string) =>
      fetch(url, {
        headers: { "Client-ID": CLIENT_ID, Authorization: `Bearer ${t}` },
      });

    let res = await call(token);
    if (res.status === 401) {
      token = await getToken(true);
      if (!token) return null;
      res = await call(token);
    }
    if (!res.ok) return null;

    const data = (await res.json()) as TwitchStreamsResponse;
    return data.data.map((s) => ({
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
