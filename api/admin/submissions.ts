import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!(await requireAdmin(req, res))) return;

  const status = typeof req.query.status === "string" ? req.query.status : "pending";

  const rows = await sql`
    SELECT s.id, s.status, s.proof_url, s.created_at,
           t.name AS team_name, ti.name AS tile_name, ti.icon_url,
           u.discord_username AS submitted_by
    FROM submissions s
    JOIN teams t ON t.id = s.team_id
    JOIN tiles ti ON ti.id = s.tile_id
    LEFT JOIN users u ON u.id = s.submitted_by
    WHERE s.status = ${status}
    ORDER BY s.created_at ASC`;

  res.status(200).json({
    submissions: rows.map((r) => ({
      id: r.id,
      status: r.status,
      proofUrl: r.proof_url,
      teamName: r.team_name,
      tileName: r.tile_name,
      iconUrl: r.icon_url,
      submittedBy: r.submitted_by ?? "Unknown",
      createdAt: r.created_at,
    })),
  });
}
