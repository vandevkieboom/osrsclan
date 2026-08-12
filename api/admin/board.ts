import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { getOrCreateBoardConfig, type PrizePot } from "../_lib/board.js";

async function getConfig(res: VercelResponse) {
  const c = await getOrCreateBoardConfig();
  res.status(200).json({
    config: { name: c.name, size: c.size, prizePot: c.prize_pot },
  });
}

function parsePrizePot(raw: unknown): PrizePot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    total: typeof r.total === "string" ? r.total.trim() : "",
  };
}

async function updateConfig(req: VercelRequest, res: VercelResponse) {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const size = Number(req.body?.size);

  if (!name) {
    res.status(400).json({ error: "Event name is required" });
    return;
  }
  if (!Number.isInteger(size) || size < 2 || size > 10) {
    res.status(400).json({ error: "Size must be an integer between 2 and 10" });
    return;
  }

  const prizePot =
    req.body?.prizePot !== undefined ? parsePrizePot(req.body.prizePot) : null;
  if (req.body?.prizePot !== undefined && !prizePot) {
    res.status(400).json({ error: "Invalid prizePot" });
    return;
  }

  // Upsert rather than a plain UPDATE — board_config is a singleton, but if
  // it was ever deleted by hand, a plain "WHERE id = 1" would silently touch
  // zero rows instead of recreating it.
  const current = await getOrCreateBoardConfig();
  const nextPrizePot = prizePot ?? current.prize_pot;
  const rows = await sql`
    INSERT INTO board_config (id, name, size, prize_pot)
    VALUES (1, ${name}, ${size}, ${JSON.stringify(nextPrizePot)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, size = EXCLUDED.size,
      prize_pot = EXCLUDED.prize_pot, updated_at = now()
    RETURNING name, size, prize_pot`;
  const c = rows[0];
  res.status(200).json({
    config: { name: c.name, size: c.size, prizePot: c.prize_pot },
  });
}

async function listTiles(res: VercelResponse) {
  const rows =
    await sql`SELECT id, position, name, icon_url, required_count, category, description FROM tiles ORDER BY position`;
  res.status(200).json({
    tiles: rows.map((r) => ({
      id: r.id,
      position: r.position,
      name: r.name,
      iconUrl: r.icon_url,
      requiredCount: r.required_count,
      category: r.category,
      description: r.description,
    })),
  });
}

async function createTile(req: VercelRequest, res: VercelResponse) {
  const position = Number(req.body?.position);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const iconUrl =
    typeof req.body?.iconUrl === "string"
      ? req.body.iconUrl.trim()
      : typeof req.body?.icon_url === "string"
        ? req.body.icon_url.trim()
        : "";
  const requiredCount = Number(
    req.body?.requiredCount ?? req.body?.required_count ?? 1,
  );
  const category =
    typeof req.body?.category === "string" ? req.body.category.trim() : "";
  const description =
    typeof req.body?.description === "string"
      ? req.body.description.trim()
      : "";
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    !name ||
    !iconUrl ||
    !Number.isInteger(requiredCount) ||
    requiredCount < 1
  ) {
    res.status(400).json({
      error: "position, name, iconUrl and requiredCount are required",
    });
    return;
  }
  try {
    const rows = await sql`
      INSERT INTO tiles (position, name, icon_url, required_count, category, description)
      VALUES (${position}, ${name}, ${iconUrl}, ${requiredCount}, ${category}, ${description})
      RETURNING id, position, name, icon_url, required_count, category, description`;
    const t = rows[0];
    res.status(201).json({
      tile: {
        id: t.id,
        position: t.position,
        name: t.name,
        iconUrl: t.icon_url,
        requiredCount: t.required_count,
        category: t.category,
        description: t.description,
      },
    });
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
  const iconUrl =
    typeof req.body?.iconUrl === "string"
      ? req.body.iconUrl.trim()
      : typeof req.body?.icon_url === "string"
        ? req.body.icon_url.trim()
        : "";
  const requiredCount = Number(
    req.body?.requiredCount ?? req.body?.required_count ?? 1,
  );
  const category =
    typeof req.body?.category === "string" ? req.body.category.trim() : "";
  const description =
    typeof req.body?.description === "string"
      ? req.body.description.trim()
      : "";
  if (
    !Number.isInteger(id) ||
    !name ||
    !iconUrl ||
    !Number.isInteger(requiredCount) ||
    requiredCount < 1
  ) {
    res
      .status(400)
      .json({ error: "id, name, iconUrl and requiredCount are required" });
    return;
  }
  const rows = await sql`
    UPDATE tiles SET name = ${name}, icon_url = ${iconUrl}, required_count = ${requiredCount},
      category = ${category}, description = ${description}
    WHERE id = ${id}
    RETURNING id, position, name, icon_url, required_count, category, description`;
  if (rows.length === 0) {
    res.status(404).json({ error: "Tile not found" });
    return;
  }
  const t = rows[0];
  res.status(200).json({
    tile: {
      id: t.id,
      position: t.position,
      name: t.name,
      iconUrl: t.icon_url,
      requiredCount: t.required_count,
      category: t.category,
      description: t.description,
    },
  });
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

  const resource = req.query.resource;
  const isTiles = resource === "tiles";

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
