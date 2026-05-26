import type { VercelRequest, VercelResponse } from "@vercel/node";

// Set these in your Vercel project environment variables:
//   DISCORD_BOT_TOKEN          — your Discord bot token
//   DISCORD_ANNOUNCEMENTS_CHANNEL_ID — the channel ID to pull messages from
//
// How to get your bot token:
//   1. Go to https://discord.com/developers/applications → New Application
//   2. Bot → Add Bot → Reset Token → copy it
//   3. OAuth2 → URL Generator → scope "bot" → permission "Read Message History"
//      → visit the generated URL to invite the bot to your server
//   4. Paste the token as DISCORD_BOT_TOKEN in Vercel env vars
//
// How to get the channel ID:
//   Discord → right-click the announcements channel → Copy Channel ID

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
const CHANNEL_ID = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? "";
const MESSAGE_LIMIT = 3;

interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
}

interface RawMessage {
  id: string;
  content: string;
  author: DiscordUser;
  timestamp: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!BOT_TOKEN || !CHANNEL_ID) {
    res.status(200).json({ messages: [] });
    return;
  }

  try {
    const apiRes = await fetch(
      `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=${MESSAGE_LIMIT}`,
      {
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!apiRes.ok) {
      res.status(200).json({ messages: [] });
      return;
    }

    const raw = (await apiRes.json()) as RawMessage[];

    const messages = raw.map((m) => ({
      id: m.id,
      content: m.content,
      author: {
        username: m.author.username,
        avatarUrl: m.author.avatar
          ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png?size=64`
          : null,
      },
      timestamp: m.timestamp,
    }));

    // Cache for 2 minutes
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    res.status(200).json({ messages });
  } catch {
    res.status(200).json({ messages: [] });
  }
}
