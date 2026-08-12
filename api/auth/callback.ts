import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import {
  appendSetCookie,
  createSession,
  serializeCookie,
} from "../_lib/auth.js";

const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "";
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI ?? "";

interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { code, state } = req.query;
  const expectedState = req.cookies.oauth_state;
  const next = req.cookies.oauth_next
    ? decodeURIComponent(req.cookies.oauth_next)
    : "/";

  appendSetCookie(
    res,
    serializeCookie("oauth_state", "", { maxAgeSeconds: 0 }),
  );
  appendSetCookie(res, serializeCookie("oauth_next", "", { maxAgeSeconds: 0 }));

  if (
    typeof code !== "string" ||
    typeof state !== "string" ||
    !expectedState ||
    state !== expectedState
  ) {
    res.redirect(302, "/?authError=state");
    return;
  }

  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    res.status(500).json({ error: "Discord OAuth is not configured" });
    return;
  }

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) {
      res.redirect(302, "/?authError=token");
      return;
    }
    const { access_token } = (await tokenRes.json()) as {
      access_token: string;
    };

    const meRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!meRes.ok) {
      res.redirect(302, "/?authError=profile");
      return;
    }
    const me = (await meRes.json()) as DiscordUser;

    const rows = await sql`
      INSERT INTO users (discord_id, discord_username, discord_global_name, discord_avatar_hash, last_login_at)
      VALUES (${me.id}, ${me.username}, ${me.global_name}, ${me.avatar}, now())
      ON CONFLICT (discord_id) DO UPDATE SET
        discord_username = EXCLUDED.discord_username,
        discord_global_name = EXCLUDED.discord_global_name,
        discord_avatar_hash = EXCLUDED.discord_avatar_hash,
        last_login_at = now()
      RETURNING id`;

    await createSession(rows[0].id, res);
    res.redirect(302, next);
  } catch (err) {
    console.error("Discord OAuth callback failed:", err);
    res.redirect(302, "/?authError=unexpected");
  }
}
