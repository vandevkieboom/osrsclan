import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "node:crypto";
import { appendSetCookie, serializeCookie } from "../_lib/auth";

const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "";
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI ?? "";

function isSafeNextPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!CLIENT_ID || !REDIRECT_URI) {
    res.status(500).json({ error: "Discord OAuth is not configured" });
    return;
  }

  const state = randomBytes(16).toString("base64url");
  const rawNext = typeof req.query.next === "string" ? req.query.next : "/";
  const next = isSafeNextPath(rawNext) ? rawNext : "/";

  appendSetCookie(res, serializeCookie("oauth_state", state, { maxAgeSeconds: 300 }));
  appendSetCookie(res, serializeCookie("oauth_next", encodeURIComponent(next), { maxAgeSeconds: 300 }));

  const authorizeUrl = new URL("https://discord.com/api/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "identify");
  authorizeUrl.searchParams.set("state", state);

  res.redirect(302, authorizeUrl.toString());
}
