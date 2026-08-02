import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireUser } from "../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;

  if (!user.teamId) {
    res.status(400).json({ error: "You are not assigned to a team yet" });
    return;
  }

  const tileId = Number(req.body?.tileId);
  const proofUrl = typeof req.body?.proofUrl === "string" ? req.body.proofUrl : "";
  if (!Number.isInteger(tileId) || !proofUrl) {
    res.status(400).json({ error: "tileId and proofUrl are required" });
    return;
  }

  const tileRows = await sql`SELECT id FROM tiles WHERE id = ${tileId}`;
  if (tileRows.length === 0) {
    res.status(404).json({ error: "Tile not found" });
    return;
  }

  await sql`
    INSERT INTO submissions (team_id, tile_id, status, proof_url, submitted_by)
    VALUES (${user.teamId}, ${tileId}, 'pending', ${proofUrl}, ${user.id})
    ON CONFLICT (team_id, tile_id) DO UPDATE SET
      status = 'pending',
      proof_url = EXCLUDED.proof_url,
      submitted_by = EXCLUDED.submitted_by,
      reviewed_by = NULL,
      reviewed_at = NULL`;

  res.status(200).json({ ok: true });
}
