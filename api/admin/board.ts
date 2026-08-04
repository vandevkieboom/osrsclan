import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { getOrCreateBoardConfig } from "../_lib/board.js";

async function getConfig(res: VercelResponse) {
  const c = await getOrCreateBoardConfig();
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

  // Upsert rather than a plain UPDATE — board_config is a singleton, but if
  // it was ever deleted by hand, a plain "WHERE id = 1" would silently touch
  // zero rows instead of recreating it.
  const rows = await sql`
    INSERT INTO board_config (id, name, date_range, size)
    VALUES (1, ${name}, ${dateRange}, ${size})
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, date_range = EXCLUDED.date_range, size = EXCLUDED.size, updated_at = now()
    RETURNING name, date_range, size`;
  const c = rows[0];
  res.status(200).json({ config: { name: c.name, dateRange: c.date_range, size: c.size } });
}

async function listTiles(res: VercelResponse) {
  const rows = await sql`SELECT id, position, name, icon_url, required_count FROM tiles ORDER BY position`;
  res.status(200).json({
    tiles: rows.map((r) => ({ id: r.id, position: r.position, name: r.name, iconUrl: r.icon_url, requiredCount: r.required_count })),
  });
}

async function createTile(req: VercelRequest, res: VercelResponse) {
  const position = Number(req.body?.position);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const iconUrl = typeof req.body?.iconUrl === "string" ? req.body.iconUrl.trim() : "";
  const requiredCount = Number(req.body?.requiredCount ?? req.body?.required_count ?? 1);
  if (!Number.isInteger(position) || position < 0 || !name || !iconUrl || !Number.isInteger(requiredCount) || requiredCount < 1) {
    res.status(400).json({ error: "position, name, iconUrl and requiredCount are required" });
    return;
  }
  try {
    const rows = await sql`
      INSERT INTO tiles (position, name, icon_url, required_count)
      VALUES (${position}, ${name}, ${iconUrl}, ${requiredCount})
      RETURNING id, position, name, icon_url, required_count`;
    const t = rows[0];
    res.status(201).json({ tile: { id: t.id, position: t.position, name: t.name, iconUrl: t.icon_url, requiredCount: t.required_count } });
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
  const requiredCount = Number(req.body?.requiredCount ?? req.body?.required_count ?? 1);

  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid tile id" });
    return;
  }

  if (!name || !iconUrl || !Number.isInteger(requiredCount) || requiredCount < 1) {
    res.status(400).json({ error: "name, iconUrl and requiredCount are required" });
    return;
  }

  try {
    const rows = await sql`
      UPDATE tiles SET name = ${name}, icon_url = ${iconUrl}, required_count = ${requiredCount} WHERE id = ${id}
      RETURNING id, position, name, icon_url, required_count`;
    if (rows.length === 0) {
      res.status(404).json({ error: "Tile not found" });
      return;
    }
    const t = rows[0];
    res.status(200).json({ tile: { id: t.id, position: t.position, name: t.name, iconUrl: t.icon_url, requiredCount: t.required_count } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown database error";
    res.status(500).json({ error: `Failed to update tile: ${message}` });
  }
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
