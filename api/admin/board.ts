import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { getOrCreateBoardConfig, type PrizePot } from "../_lib/board.js";
import { withErrorHandling } from "../_lib/handler.js";

async function getConfig(res: VercelResponse) {
  const c = await getOrCreateBoardConfig();
  res.status(200).json({
    config: {
      name: c.name,
      size: c.size,
      prizePot: c.prize_pot,
    },
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
      prize_pot = EXCLUDED.prize_pot,
      updated_at = now()
    RETURNING name, size, prize_pot`;
  const c = rows[0];
  res.status(200).json({
    config: {
      name: c.name,
      size: c.size,
      prizePot: c.prize_pot,
    },
  });
}

function serializeTile(t: Record<string, unknown>) {
  return {
    id: t.id,
    position: t.position,
    name: t.name,
    iconUrl: t.icon_url,
    requiredCount: t.required_count,
    category: t.category,
    description: t.description,
    itemIds: (t.item_ids ?? []) as number[],
    requireUniqueItems: Boolean(t.require_unique_items),
    goalKind: t.goal_kind as "item" | "xp" | "kc",
    goalKey: t.goal_key as string,
    goalTarget: t.goal_target === null ? null : Number(t.goal_target),
  };
}

/**
 * A tile is either an item-drop tile (goalKind absent/"item") or a
 * team-combined xp/kc goal (see goal_kind in db/schema.sql) — the latter
 * needs a non-empty goalKey (skill/boss name) and a positive goalTarget.
 * Returns null on a malformed (not just empty) goal, so the caller can 400.
 */
function parseGoal(
  body: unknown,
): { goalKind: "item" | "xp" | "kc"; goalKey: string; goalTarget: number | null } | null {
  const b = body as
    | { goalKind?: unknown; goalKey?: unknown; goalTarget?: unknown }
    | undefined;
  const goalKind = b?.goalKind ?? "item";
  if (goalKind !== "item" && goalKind !== "xp" && goalKind !== "kc") return null;

  if (goalKind === "item") return { goalKind, goalKey: "", goalTarget: null };

  const goalKey = typeof b?.goalKey === "string" ? b.goalKey.trim() : "";
  const goalTarget = Number(b?.goalTarget);
  if (!goalKey || !Number.isInteger(goalTarget) || goalTarget <= 0) return null;
  return { goalKind, goalKey, goalTarget };
}

/**
 * OSRS item ids that satisfy a tile, used by the RuneLite plugin's automatic
 * drop detection. Absent means "leave empty" (manual upload only); returns
 * null if the value is present but malformed, so the caller can 400.
 */
function parseItemIds(body: unknown): number[] | null {
  const b = body as { itemIds?: unknown; item_ids?: unknown } | undefined;
  const raw = b?.itemIds ?? b?.item_ids;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const ids = raw.map(Number);
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  return Array.from(new Set(ids));
}

async function listTiles(res: VercelResponse) {
  const rows = await sql`
    SELECT id, position, name, icon_url, required_count, category, description,
           item_ids, require_unique_items, goal_kind, goal_key, goal_target
    FROM tiles ORDER BY position`;
  res.status(200).json({ tiles: rows.map(serializeTile) });
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
  const itemIds = parseItemIds(req.body);
  const requireUniqueItems = Boolean(
    req.body?.requireUniqueItems ?? req.body?.require_unique_items,
  );
  const goal = parseGoal(req.body);
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    !name ||
    !iconUrl ||
    !Number.isInteger(requiredCount) ||
    requiredCount < 1 ||
    itemIds === null ||
    goal === null
  ) {
    res.status(400).json({
      error:
        "position, name, iconUrl and requiredCount are required, and an xp/kc goal needs a goalKey and positive goalTarget",
    });
    return;
  }
  try {
    const rows = await sql`
      INSERT INTO tiles (position, name, icon_url, required_count, category, description, item_ids, require_unique_items, goal_kind, goal_key, goal_target)
      VALUES (${position}, ${name}, ${iconUrl}, ${requiredCount}, ${category}, ${description}, ${itemIds}::int[], ${requireUniqueItems}, ${goal.goalKind}, ${goal.goalKey}, ${goal.goalTarget})
      RETURNING id, position, name, icon_url, required_count, category, description, item_ids, require_unique_items, goal_kind, goal_key, goal_target`;
    res.status(201).json({ tile: serializeTile(rows[0]) });
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
  const itemIds = parseItemIds(req.body);
  const requireUniqueItems = Boolean(
    req.body?.requireUniqueItems ?? req.body?.require_unique_items,
  );
  const goal = parseGoal(req.body);
  if (
    !Number.isInteger(id) ||
    !name ||
    !iconUrl ||
    !Number.isInteger(requiredCount) ||
    requiredCount < 1 ||
    itemIds === null ||
    goal === null
  ) {
    res.status(400).json({
      error:
        "id, name, iconUrl and requiredCount are required, and an xp/kc goal needs a goalKey and positive goalTarget",
    });
    return;
  }
  const rows = await sql`
    UPDATE tiles SET name = ${name}, icon_url = ${iconUrl}, required_count = ${requiredCount},
      category = ${category}, description = ${description}, item_ids = ${itemIds}::int[],
      require_unique_items = ${requireUniqueItems}, goal_kind = ${goal.goalKind},
      goal_key = ${goal.goalKey}, goal_target = ${goal.goalTarget}
    WHERE id = ${id}
    RETURNING id, position, name, icon_url, required_count, category, description, item_ids, require_unique_items, goal_kind, goal_key, goal_target`;
  if (rows.length === 0) {
    res.status(404).json({ error: "Tile not found" });
    return;
  }
  res.status(200).json({ tile: serializeTile(rows[0]) });
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
export default withErrorHandling(async function handler(req, res) {
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
});
