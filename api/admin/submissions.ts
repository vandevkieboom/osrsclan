import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

async function listSubmissions(req: VercelRequest, res: VercelResponse) {
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

async function reviewSubmission(req: VercelRequest, res: VercelResponse, adminId: number) {
  const id = Number(req.body?.id);
  const decision = req.body?.decision;
  if (!Number.isInteger(id) || (decision !== "approved" && decision !== "rejected")) {
    res.status(400).json({ error: "id and decision ('approved' | 'rejected') are required" });
    return;
  }

  const rows = await sql`
    UPDATE submissions
    SET status = ${decision}, reviewed_by = ${adminId}, reviewed_at = now()
    WHERE id = ${id} AND status = 'pending'
    RETURNING id`;

  if (rows.length === 0) {
    res.status(404).json({ error: "Pending submission not found" });
    return;
  }
  res.status(200).json({ ok: true });
}

// Listing pending submissions and reviewing them are combined into one
// function to stay under the Vercel Hobby plan's 12-function-per-deployment
// cap, dispatched by HTTP method.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    await listSubmissions(req, res);
    return;
  }

  if (req.method === "POST") {
    await reviewSubmission(req, res, admin.id);
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
