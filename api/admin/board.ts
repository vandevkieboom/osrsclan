import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

async function getConfig(res: VercelResponse) {
  const rows = await sql`SELECT name, date_range, size FROM board_config WHERE id = 1`;
  const c = rows[0];
  res.status(200).json({ config: { name: c.name, dateRange: c.date_range, size: c.size } });
}

async function updateConfig(req: VercelRequest, res: VercelResponse) {
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
}

async function listTiles(res: VercelResponse) {
  const rows = await sql`SELECT id, position, name, icon_url FROM tiles ORDER BY position`;
  res.status(200).json({
    tiles: rows.map((r) => ({ id: r.id, position: r.position, name: r.name, iconUrl: r.icon_url })),
  });
}

async function createTile(req: VercelRequest, res: VercelResponse) {
  const position = Number(req.body?.position);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const iconUrl = typeof req.body?.iconUrl === "string" ? req.body.iconUrl.trim() : "";
  if (!Number.isInteger(position) || position < 0 || !name || !iconUrl) {
    res.status(400).json({ error: "position, name and iconUrl are required" });
    return;
  }
  try {
    const rows = await sql`
      INSERT INTO tiles (position, name, icon_url)
      VALUES (${position}, ${name}, ${iconUrl})
      RETURNING id, position, name, icon_url`;
    const t = rows[0];
    res.status(201).json({ tile: { id: t.id, position: t.position, name: t.name, iconUrl: t.icon_url } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("duplicate key")) {
      res.status(409).json({ error: "That board slot is already filled" });
      return;
    }
    res.status(500).json({ error: "Failed to create tile" });
  }
}

async function updateTile(req: VercelRequest, res: VercelResponse) {
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
}

async function deleteTile(req: VercelRequest, res: VercelResponse) {
  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await sql`DELETE FROM tiles WHERE id = ${id}`;
  res.status(200).json({ ok: true });
}

// Board config and tiles are combined into one function to stay under the
// Vercel Hobby plan's 12-function-per-deployment cap — dispatched by
// `resource`, the same pattern api/wom-proxy.ts already uses for `type`.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return;

  const isTiles = req.query.resource === "tiles";

  if (req.method === "GET") {
    if (isTiles) await listTiles(res);
    else await getConfig(res);
    return;
  }

  if (req.method === "PUT") {
    if (isTiles) await updateTile(req, res);
    else await updateConfig(req, res);
    return;
  }

  if (req.method === "POST" && isTiles) {
    await createTile(req, res);
    return;
  }

  if (req.method === "DELETE" && isTiles) {
    await deleteTile(req, res);
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
