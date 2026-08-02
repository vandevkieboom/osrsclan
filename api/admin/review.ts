import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const id = Number(req.body?.id);
  const decision = req.body?.decision;
  if (!Number.isInteger(id) || (decision !== "approved" && decision !== "rejected")) {
    res.status(400).json({ error: "id and decision ('approved' | 'rejected') are required" });
    return;
  }

  const rows = await sql`
    UPDATE submissions
    SET status = ${decision}, reviewed_by = ${admin.id}, reviewed_at = now()
    WHERE id = ${id} AND status = 'pending'
    RETURNING id`;

  if (rows.length === 0) {
    res.status(404).json({ error: "Pending submission not found" });
    return;
  }
  res.status(200).json({ ok: true });
}
