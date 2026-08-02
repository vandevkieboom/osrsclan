import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!(await requireAdmin(req, res))) return;

  const rows = await sql`
    SELECT u.id, u.discord_id, u.discord_username, u.discord_global_name, u.discord_avatar_hash,
           u.is_admin, u.team_id, t.name AS team_name
    FROM users u
    LEFT JOIN teams t ON t.id = u.team_id
    ORDER BY u.discord_username`;

  res.status(200).json({
    users: rows.map((r) => ({
      id: r.id,
      username: r.discord_username,
      globalName: r.discord_global_name,
      avatarUrl: r.discord_avatar_hash
        ? `https://cdn.discordapp.com/avatars/${r.discord_id}/${r.discord_avatar_hash}.png?size=32`
        : null,
      isAdmin: r.is_admin,
      team: r.team_id ? { id: r.team_id, name: r.team_name } : null,
    })),
  });
}
