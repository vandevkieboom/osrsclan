import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import {
  fetchWomStatsByRsnKey,
  getOrCreateBoardConfig,
  invalidateBoardConfigMemo,
  parseItemRequirements,
  resetBingoProgress,
  seedGoalBaselines,
  type ItemRequirement,
} from "../_lib/board.js";
import { publishBoardMarker } from "../_lib/board-marker.js";
import { deriveTileIconUrl } from "../_lib/icons.js";
import { withErrorHandling } from "../_lib/handler.js";

/**
 * Seeds every current team member's baseline for one specific goal from
 * their hiscores reading right now — called after a tile's goal is
 * created or changed to xp/kc, so tracking starts existing for everyone at
 * the same moment the tile does, rather than staggered across whenever
 * each person's plugin next happens to report (or never, for a
 * mobile-only player). Best-effort: a WOM outage here just means nobody
 * got seeded for this tile yet, which the next reset (or a future manual
 * retry) would still fix — it's not worth failing the tile save over.
 */
async function seedNewGoalTile(goalKind: string, goalKey: string) {
  if (goalKind !== "xp" && goalKind !== "kc") {
    return;
  }
  const womByRsnKey = await fetchWomStatsByRsnKey();
  if (!womByRsnKey) {
    console.error(`seedNewGoalTile: WOM unreachable, baselines not seeded for ${goalKind}:${goalKey}`);
    return;
  }
  await seedGoalBaselines(womByRsnKey, [{ goalKind, goalKey }]);
}

async function getConfig(res: VercelResponse) {
  const c = await getOrCreateBoardConfig();
  res.status(200).json({
    config: {
      name: c.name,
      size: c.size,
      bingoActive: c.bingo_active,
      boardVisible: c.board_visible,
    },
  });
}

async function updateConfig(req: VercelRequest, res: VercelResponse) {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const size = Number(req.body?.size);
  const bingoActive = Boolean(req.body?.bingoActive ?? true);
  const boardVisible = Boolean(req.body?.boardVisible ?? false);

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
  await getOrCreateBoardConfig();
  // board_changed_at is maintained by triggers on every table the board is
  // built from (see db/schema.sql), but board_config itself can't carry one —
  // a trigger on this table that updates this table recurses. Since the name
  // and size are part of what the board renders, this is the one place that
  // has to stamp it by hand.
  const rows = await sql`
    INSERT INTO board_config (id, name, size, bingo_active, board_visible)
    VALUES (1, ${name}, ${size}, ${bingoActive}, ${boardVisible})
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, size = EXCLUDED.size, bingo_active = EXCLUDED.bingo_active,
      board_visible = EXCLUDED.board_visible,
      updated_at = now(), board_changed_at = now()
    RETURNING name, size, bingo_active, board_visible`;
  invalidateBoardConfigMemo();
  const c = rows[0];
  res.status(200).json({
    config: {
      name: c.name,
      size: c.size,
      bingoActive: c.bingo_active,
      boardVisible: c.board_visible,
    },
  });
}

/**
 * Clears everything tied to the current bingo round (submissions, xp/kc goal
 * progress) so a new round starts clean — see resetBingoProgress for exactly
 * what is and isn't touched. Deliberately destructive and irreversible, so
 * the frontend requires a typed confirmation before ever sending this.
 */
async function resetBingo(res: VercelResponse) {
  await resetBingoProgress();
  res.status(200).json({ ok: true });
}

function serializeTile(t: Record<string, unknown>) {
  const itemIds = (t.item_ids ?? []) as number[];
  const goalKind = t.goal_kind as "item" | "xp" | "kc";
  const goalKey = t.goal_key as string;
  return {
    id: t.id,
    position: t.position,
    name: t.name,
    // Computed, read-only for the admin panel's preview (the row thumbnail,
    // the collapsed-row icon) — see api/_lib/icons.ts. Not something an
    // admin types in directly; the first entry in itemIds is what decides it.
    iconUrl: deriveTileIconUrl({
      itemIds,
      goalKind,
      goalKey,
      legacyIconUrl: (t.icon_url as string) ?? "",
    }),
    requiredCount: t.required_count,
    category: t.category,
    description: t.description,
    itemIds,
    requireUniqueItems: Boolean(t.require_unique_items),
    goalKind,
    goalKey,
    goalTarget: t.goal_target === null ? null : Number(t.goal_target),
    itemRequirements: parseItemRequirements(t.item_requirements),
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

/**
 * A tile's item_requirements (AND/OR item conditions — see db/schema.sql):
 * an array of { itemId, name?, requiredAmount, group? }, or absent/empty to
 * clear it (fall back to the flat item_ids/required_count/
 * require_unique_items fields). Unlike parseItemRequirements in
 * api/_lib/board.ts (which treats a malformed value the same as "absent," so
 * a bad stored value degrades a tile rather than breaking it), this rejects
 * a malformed value outright — an admin who typed a bad row should see a
 * 400, not have it silently saved as "no advanced requirements."
 */
function parseItemRequirementsInput(
  body: unknown,
): { ok: true; value: ItemRequirement[] | null } | { ok: false } {
  const b = body as { itemRequirements?: unknown } | undefined;
  const raw = b?.itemRequirements;
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (!Array.isArray(raw)) return { ok: false };
  if (raw.length === 0) return { ok: true, value: null };

  const reqs: ItemRequirement[] = [];
  for (const entry of raw) {
    const e = entry as Record<string, unknown> | null;
    const itemId = Number(e?.itemId);
    const requiredAmount = Number(e?.requiredAmount);
    if (
      !e ||
      !Number.isInteger(itemId) ||
      itemId <= 0 ||
      !Number.isInteger(requiredAmount) ||
      requiredAmount < 1
    ) {
      return { ok: false };
    }
    reqs.push({
      itemId,
      name: typeof e.name === "string" && e.name.trim() ? e.name.trim() : `Item ${itemId}`,
      requiredAmount,
      group: typeof e.group === "string" && e.group.trim() ? e.group.trim() : null,
    });
  }
  return { ok: true, value: reqs };
}

async function listTiles(res: VercelResponse) {
  const rows = await sql`
    SELECT id, position, name, icon_url, required_count, category, description,
           item_ids, require_unique_items, goal_kind, goal_key, goal_target,
           item_requirements
    FROM tiles ORDER BY position`;
  res.status(200).json({ tiles: rows.map(serializeTile) });
}

async function createTile(req: VercelRequest, res: VercelResponse) {
  const position = Number(req.body?.position);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  // Legacy fallback only — no longer collected from the tile editor (see
  // api/_lib/icons.ts), so almost every new tile sends nothing here at all.
  // Kept accepted (never required) for the rare manual tile with no item to
  // derive an icon from.
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
  const itemRequirements = parseItemRequirementsInput(req.body);
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    !name ||
    !Number.isInteger(requiredCount) ||
    requiredCount < 1 ||
    itemIds === null ||
    goal === null ||
    !itemRequirements.ok
  ) {
    res.status(400).json({
      error:
        "position, name and requiredCount are required, itemRequirements (if given) must be a valid array, and an xp/kc goal needs a goalKey and positive goalTarget",
    });
    return;
  }
  const itemRequirementsJson = itemRequirements.value ? JSON.stringify(itemRequirements.value) : null;
  try {
    const rows = await sql`
      INSERT INTO tiles (position, name, icon_url, required_count, category, description, item_ids, require_unique_items, goal_kind, goal_key, goal_target, item_requirements)
      VALUES (${position}, ${name}, ${iconUrl}, ${requiredCount}, ${category}, ${description}, ${itemIds}::int[], ${requireUniqueItems}, ${goal.goalKind}, ${goal.goalKey}, ${goal.goalTarget}, ${itemRequirementsJson}::jsonb)
      RETURNING id, position, name, icon_url, required_count, category, description, item_ids, require_unique_items, goal_kind, goal_key, goal_target, item_requirements`;
    await seedNewGoalTile(goal.goalKind, goal.goalKey);
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
  // Legacy fallback only (see the matching comment in createTile) — the form
  // no longer sends this, so leaving it blank must NOT wipe out an existing
  // tile's stored value (see the COALESCE/NULLIF in the UPDATE below).
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
  const itemRequirements = parseItemRequirementsInput(req.body);
  if (
    !Number.isInteger(id) ||
    !name ||
    !Number.isInteger(requiredCount) ||
    requiredCount < 1 ||
    itemIds === null ||
    goal === null ||
    !itemRequirements.ok
  ) {
    res.status(400).json({
      error:
        "id, name and requiredCount are required, itemRequirements (if given) must be a valid array, and an xp/kc goal needs a goalKey and positive goalTarget",
    });
    return;
  }
  const itemRequirementsJson = itemRequirements.value ? JSON.stringify(itemRequirements.value) : null;
  const rows = await sql`
    UPDATE tiles SET name = ${name},
      icon_url = COALESCE(NULLIF(${iconUrl}, ''), icon_url), required_count = ${requiredCount},
      category = ${category}, description = ${description}, item_ids = ${itemIds}::int[],
      require_unique_items = ${requireUniqueItems}, goal_kind = ${goal.goalKind},
      goal_key = ${goal.goalKey}, goal_target = ${goal.goalTarget},
      item_requirements = ${itemRequirementsJson}::jsonb
    WHERE id = ${id}
    RETURNING id, position, name, icon_url, required_count, category, description, item_ids, require_unique_items, goal_kind, goal_key, goal_target, item_requirements`;
  if (rows.length === 0) {
    res.status(404).json({ error: "Tile not found" });
    return;
  }
  await seedNewGoalTile(goal.goalKind, goal.goalKey);
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

// Requires ?all=true rather than just a missing id, so a malformed
// single-tile delete request can never silently wipe the whole board.
async function deleteAllTiles(res: VercelResponse) {
  await sql`DELETE FROM tiles`;
  res.status(200).json({ ok: true });
}

// Board config and tiles are combined into one function to stay under the
// Vercel Hobby plan's 12-function-per-deployment cap — dispatched by
// `resource`, the same pattern api/wom-proxy.ts already uses for `type`.
export default withErrorHandling(async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  await dispatch(req, res);

  // Republished here, once, rather than at the end of each handler above.
  // Every non-GET route on this endpoint changes something a polling plugin
  // acts on — the bingo_active switch most of all — and the marker is the only
  // thing most plugins ever read (see _lib/board-marker.ts). Doing it at the
  // dispatcher means a route added later cannot forget to, which is the exact
  // failure db/schema.sql avoids for board_changed_at by using triggers rather
  // than a bump() call at every write site.
  //
  // After the response, deliberately: the admin already has their answer, and
  // a slow CDN write should not make saving a tile feel slow. It still runs to
  // completion — the function is not frozen until this handler resolves.
  if (req.method !== "GET") {
    await publishBoardMarker();
  }
});

async function dispatch(req: VercelRequest, res: VercelResponse) {
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

  if (req.method === "POST" && resource === "reset-bingo") {
    await resetBingo(res);
    return;
  }

  if (req.method === "POST" && isTiles) {
    await createTile(req, res);
    return;
  }

  if (req.method === "DELETE" && isTiles && req.query.all === "true") {
    await deleteAllTiles(res);
    return;
  }

  if (req.method === "DELETE" && isTiles) {
    await deleteTile(req, res);
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
