import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    const rows = await sql`SELECT id, position, name, icon_url FROM tiles ORDER BY position`;
    res.status(200).json({
      tiles: rows.map((r) => ({ id: r.id, position: r.position, name: r.name, iconUrl: r.icon_url })),
    });
    return;
  }

  if (req.method === "POST") {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const iconUrl = typeof req.body?.iconUrl === "string" ? req.body.iconUrl.trim() : "";
    if (!name || !iconUrl) {
      res.status(400).json({ error: "name and iconUrl are required" });
      return;
    }
    const rows = await sql`
      INSERT INTO tiles (position, name, icon_url)
      VALUES ((SELECT COALESCE(MAX(position), -1) + 1 FROM tiles), ${name}, ${iconUrl})
      RETURNING id, position, name, icon_url`;
    const t = rows[0];
    res.status(201).json({ tile: { id: t.id, position: t.position, name: t.name, iconUrl: t.icon_url } });
    return;
  }

  if (req.method === "PUT") {
    const id = Number(req.body?.id);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const iconUrl = typeof req.body?.iconUrl === "string" ? req.body.iconUrl.trim() : "";
    if (!Number.isInteger(id) || !name || !iconUrl) {
      res.status(400).json({ error: "id, name and iconUrl are required" });
      return;
    }
    const rows = await sql`
      UPDATE tiles SET name = ${name}, icon_url = ${iconUrl} WHERE id = ${id}
      RETURNING id, position, name, icon_url`;
    if (rows.length === 0) {
      res.status(404).json({ error: "Tile not found" });
      return;
    }
    const t = rows[0];
    res.status(200).json({ tile: { id: t.id, position: t.position, name: t.name, iconUrl: t.icon_url } });
    return;
  }

  if (req.method === "DELETE") {
    const id = Number(req.query.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await sql`DELETE FROM tiles WHERE id = ${id}`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
