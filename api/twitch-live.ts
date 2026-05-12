import type { VercelRequest, VercelResponse } from "@vercel/node";

const CLIENT_ID = process.env.TWITCH_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET ?? "";
const CHANNELS = (process.env.TWITCH_CHANNELS ?? "")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

interface TwitchTokenResponse {
  access_token: string;
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

export interface LiveStream {
  username: string;
  displayName: string;
  game: string;
  title: string;
  viewers: number;
  thumbnail: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!CLIENT_ID || !CLIENT_SECRET || CHANNELS.length === 0) {
    res.status(200).json({ streams: [] });
    return;
  }

  try {
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(CLIENT_SECRET)}&grant_type=client_credentials`,
      { method: "POST" },
    );
    if (!tokenRes.ok) {
      res.status(200).json({ streams: [] });
      return;
    }
    const tokenData = (await tokenRes.json()) as TwitchTokenResponse;
    const token = tokenData.access_token;

    const params = CHANNELS.map(
      (c) => `user_login=${encodeURIComponent(c)}`,
    ).join("&");
    const streamsRes = await fetch(
      `https://api.twitch.tv/helix/streams?${params}`,
      {
        headers: {
          "Client-ID": CLIENT_ID,
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!streamsRes.ok) {
      res.status(200).json({ streams: [] });
      return;
    }
    const streamsData = (await streamsRes.json()) as TwitchStreamsResponse;

    const streams: LiveStream[] = streamsData.data.map((s) => ({
      username: s.user_login,
      displayName: s.user_name,
      game: s.game_name,
      title: s.title,
      viewers: s.viewer_count,
      thumbnail: s.thumbnail_url
        .replace("{width}", "320")
        .replace("{height}", "180"),
    }));

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
    res.status(200).json({ streams });
  } catch {
    res.status(200).json({ streams: [] });
  }
}
