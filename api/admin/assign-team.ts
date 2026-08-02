import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!(await requireAdmin(req, res))) return;

  const userId = Number(req.body?.userId);
  const teamIdRaw = req.body?.teamId;
  const teamId = teamIdRaw === null || teamIdRaw === undefined ? null : Number(teamIdRaw);

  if (!Number.isInteger(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }
  if (teamId !== null && !Number.isInteger(teamId)) {
    res.status(400).json({ error: "Invalid teamId" });
    return;
  }

  const rows = await sql`
    UPDATE users SET team_id = ${teamId} WHERE id = ${userId}
    RETURNING id, team_id`;

  if (rows.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.status(200).json({ userId: rows[0].id, teamId: rows[0].team_id });
}
