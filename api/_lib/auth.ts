import { randomBytes, createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./db";

export const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionUser {
  id: number;
  discordId: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  teamId: number | null;
  teamName: string | null;
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isSecureEnv(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
}

export function serializeCookie(
  name: string,
  value: string,
  opts: { maxAgeSeconds: number },
): string {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${opts.maxAgeSeconds}`];
  if (isSecureEnv()) parts.push("Secure");
  return parts.join("; ");
}

/** Appends to any existing Set-Cookie header(s) instead of overwriting them. */
export function appendSetCookie(res: VercelResponse, cookie: string): void {
  const existing = res.getHeader("Set-Cookie");
  const cookies = existing === undefined ? [] : Array.isArray(existing) ? existing.map(String) : [String(existing)];
  res.setHeader("Set-Cookie", [...cookies, cookie]);
}

export async function createSession(userId: number, res: VercelResponse): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at)
            VALUES (${hashToken(token)}, ${userId}, ${expiresAt})`;
  appendSetCookie(res, serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds: SESSION_TTL_SECONDS }));
}

export async function getSessionUser(req: VercelRequest): Promise<SessionUser | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;

  const rows = await sql`
    SELECT u.id, u.discord_id, u.discord_username, u.discord_global_name,
           u.discord_avatar_hash, u.is_admin, u.team_id, t.name AS team_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN teams t ON t.id = u.team_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()`;

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    discordId: r.discord_id,
    username: r.discord_username,
    globalName: r.discord_global_name,
    avatarUrl: r.discord_avatar_hash
      ? `https://cdn.discordapp.com/avatars/${r.discord_id}/${r.discord_avatar_hash}.png?size=64`
      : null,
    isAdmin: r.is_admin,
    teamId: r.team_id,
    teamName: r.team_name,
  };
}

export async function destroySession(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
  appendSetCookie(res, serializeCookie(SESSION_COOKIE, "", { maxAgeSeconds: 0 }));
}
