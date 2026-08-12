import { randomBytes, createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./db.js";

export const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionUser {
  id: number;
  discordId: string;
  username: string;
  globalName: string | null;
  runescapeName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  teamId: number | null;
  teamName: string | null;
  rememberRankings: boolean;
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isSecureEnv(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview"
  );
}

export function serializeCookie(
  name: string,
  value: string,
  opts: { maxAgeSeconds: number },
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${opts.maxAgeSeconds}`,
  ];
  if (isSecureEnv()) parts.push("Secure");
  return parts.join("; ");
}

/** Appends to any existing Set-Cookie header(s) instead of overwriting them. */
export function appendSetCookie(res: VercelResponse, cookie: string): void {
  const existing = res.getHeader("Set-Cookie");
  const cookies =
    existing === undefined
      ? []
      : Array.isArray(existing)
        ? existing.map(String)
        : [String(existing)];
  res.setHeader("Set-Cookie", [...cookies, cookie]);
}

export async function createSession(
  userId: number,
  res: VercelResponse,
): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_SECONDS * 1000,
  ).toISOString();
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at)
            VALUES (${hashToken(token)}, ${userId}, ${expiresAt})`;
  appendSetCookie(
    res,
    serializeCookie(SESSION_COOKIE, token, {
      maxAgeSeconds: SESSION_TTL_SECONDS,
    }),
  );
}

function toSessionUser(r: Record<string, unknown>): SessionUser {
  return {
    id: r.id as number,
    discordId: r.discord_id as string,
    username: r.discord_username as string,
    globalName: r.discord_global_name as string | null,
    runescapeName: r.runescape_name as string | null,
    avatarUrl: r.discord_avatar_hash
      ? `https://cdn.discordapp.com/avatars/${r.discord_id as string}/${r.discord_avatar_hash as string}.png?size=64`
      : null,
    isAdmin: r.is_admin as boolean,
    teamId: r.team_id as number | null,
    teamName: r.team_name as string | null,
    rememberRankings: r.remember_rankings as boolean,
  };
}

export async function getSessionUser(
  req: VercelRequest,
): Promise<SessionUser | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;

  const rows = await sql`
    SELECT u.id, u.discord_id, u.discord_username, u.discord_global_name,
           u.discord_avatar_hash, u.is_admin, u.team_id, u.runescape_name,
           u.remember_rankings, t.name AS team_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN teams t ON t.id = u.team_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()`;

  if (rows.length === 0) return null;
  return toSessionUser(rows[0]);
}

/**
 * Resolves the caller from an `Authorization: Bearer <token>` header backed by
 * the plugin_tokens table, for clients that can't hold a browser session
 * cookie (the RuneLite plugin). Returns the same shape as getSessionUser so
 * downstream handlers don't care which way the caller authenticated.
 *
 * Plugin tokens deliberately never satisfy requireAdmin — see getRequestUser.
 */
export async function getPluginUser(
  req: VercelRequest,
): Promise<SessionUser | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  const rows = await sql`
    SELECT pt.id AS token_id, u.id, u.discord_id, u.discord_username,
           u.discord_global_name, u.discord_avatar_hash, u.is_admin, u.team_id,
           u.runescape_name, u.remember_rankings, t.name AS team_name
    FROM plugin_tokens pt
    JOIN users u ON u.id = pt.user_id
    LEFT JOIN teams t ON t.id = u.team_id
    WHERE pt.token_hash = ${hashToken(token)} AND pt.revoked_at IS NULL`;

  if (rows.length === 0) return null;

  await sql`UPDATE plugin_tokens SET last_used_at = now() WHERE id = ${rows[0].token_id}`;
  return toSessionUser(rows[0]);
}

/**
 * Identity for endpoints usable by both the website and the RuneLite plugin:
 * browser session cookie first, plugin bearer token as a fallback.
 *
 * Only wire this into team-scoped read/submit endpoints. Admin endpoints stay
 * on requireUser/requireAdmin (cookie-only) on purpose, so a leaked plugin
 * token can never perform admin actions.
 */
export async function getRequestUser(
  req: VercelRequest,
): Promise<SessionUser | null> {
  return (await getSessionUser(req)) ?? (await getPluginUser(req));
}

export async function destroySession(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const token = req.cookies[SESSION_COOKIE];
  if (token)
    await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
  appendSetCookie(
    res,
    serializeCookie(SESSION_COOKIE, "", { maxAgeSeconds: 0 }),
  );
}

export async function requireUser(
  req: VercelRequest,
  res: VercelResponse,
): Promise<SessionUser | null> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return user;
}

/** requireUser's equivalent for endpoints that also accept a plugin token. */
export async function requireRequestUser(
  req: VercelRequest,
  res: VercelResponse,
): Promise<SessionUser | null> {
  const user = await getRequestUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return user;
}

export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse,
): Promise<SessionUser | null> {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!user.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return user;
}
