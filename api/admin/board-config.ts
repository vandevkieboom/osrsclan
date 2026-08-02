import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    const rows = await sql`SELECT name, date_range, size FROM board_config WHERE id = 1`;
    const c = rows[0];
    res.status(200).json({ config: { name: c.name, dateRange: c.date_range, size: c.size } });
    return;
  }

  if (req.method === "PUT") {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const dateRange = typeof req.body?.dateRange === "string" ? req.body.dateRange.trim() : "";
    const size = Number(req.body?.size);

    if (!name) {
      res.status(400).json({ error: "Event name is required" });
      return;
    }
    if (!Number.isInteger(size) || size < 2 || size > 10) {
      res.status(400).json({ error: "Size must be an integer between 2 and 10" });
      return;
    }

    const rows = await sql`
      UPDATE board_config SET name = ${name}, date_range = ${dateRange}, size = ${size}, updated_at = now()
      WHERE id = 1
      RETURNING name, date_range, size`;
    const c = rows[0];
    res.status(200).json({ config: { name: c.name, dateRange: c.date_range, size: c.size } });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
