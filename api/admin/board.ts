import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { getOrCreateBoardConfig, type PrizePot } from "../_lib/board.js";

async function getConfig(res: VercelResponse) {
  const c = await getOrCreateBoardConfig();
  res.status(200).json({
    config: { name: c.name, dateRange: c.date_range, size: c.size, prizePot: c.prize_pot },
  });
}

function parsePrizePot(raw: unknown): PrizePot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.entries)) return null;
  const entries = r.entries
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      name: typeof e.name === "string" ? e.name.trim() : "",
      amount: typeof e.amount === "string" ? e.amount.trim() : "",
    }))
    .filter((e) => e.name && e.amount);
  return {
    total: typeof r.total === "string" ? r.total.trim() : "",
    buyIn: typeof r.buyIn === "string" ? r.buyIn.trim() : "",
    donated: typeof r.donated === "string" ? r.donated.trim() : "",
    entries,
  };
}

async function updateConfig(req: VercelRequest, res: VercelResponse) {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const dateRange =
    typeof req.body?.dateRange === "string" ? req.body.dateRange.trim() : "";
  const size = Number(req.body?.size);

  if (!name) {
    res.status(400).json({ error: "Event name is required" });
    return;
  }
  if (!Number.isInteger(size) || size < 2 || size > 10) {
    res.status(400).json({ error: "Size must be an integer between 2 and 10" });
    return;
  }

  const prizePot = req.body?.prizePot !== undefined ? parsePrizePot(req.body.prizePot) : null;
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
    INSERT INTO board_config (id, name, date_range, size, prize_pot)
    VALUES (1, ${name}, ${dateRange}, ${size}, ${JSON.stringify(nextPrizePot)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, date_range = EXCLUDED.date_range, size = EXCLUDED.size,
      prize_pot = EXCLUDED.prize_pot, updated_at = now()
    RETURNING name, date_range, size, prize_pot`;
  const c = rows[0];
  res.status(200).json({
    config: { name: c.name, dateRange: c.date_range, size: c.size, prizePot: c.prize_pot },
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
  const category = typeof req.body?.category === "string" ? req.body.category.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    !name ||
    !iconUrl ||
    !Number.isInteger(requiredCount) ||
    requiredCount < 1
  ) {
    res
      .status(400)
      .json({
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
    res
      .status(201)
      .json({
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
  const category = typeof req.body?.category === "string" ? req.body.category.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
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
  res
    .status(200)
    .json({
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

async function getDraft(res: VercelResponse) {
  const config = await getOrCreateBoardConfig();
  const unassigned = await sql`
    SELECT id, discord_username, discord_global_name, runescape_name
    FROM users WHERE team_id IS NULL ORDER BY discord_username`;
  res.status(200).json({
    draft: {
      active: config.draft_active,
      order: config.draft_order,
      pickIndex: config.draft_pick_index,
      log: config.draft_log,
    },
    unassignedMembers: unassigned.map((u) => ({
      id: u.id,
      name: u.runescape_name ?? u.discord_global_name ?? u.discord_username,
    })),
  });
}

async function startDraft(res: VercelResponse) {
  const teamRows = await sql`SELECT id FROM teams ORDER BY name`;
  const teamIds: number[] = teamRows.map((t) => t.id);
  const unassignedRows = await sql`SELECT id FROM users WHERE team_id IS NULL`;
  const unassignedCount = unassignedRows.length;

  if (teamIds.length === 0 || unassignedCount === 0) {
    res.status(400).json({ error: "No teams or no unassigned members to draft" });
    return;
  }

  const order: number[] = [];
  let round = 0;
  while (order.length < unassignedCount) {
    const seq = round % 2 === 0 ? teamIds : [...teamIds].reverse();
    order.push(...seq);
    round += 1;
  }

  await sql`
    UPDATE board_config SET
      draft_active = TRUE, draft_order = ${JSON.stringify(order.slice(0, unassignedCount))}::jsonb,
      draft_pick_index = 0, draft_log = '[]'::jsonb, updated_at = now()
    WHERE id = 1`;
  await getDraft(res);
}

async function pickDraft(req: VercelRequest, res: VercelResponse) {
  const userId = Number(req.body?.userId);
  if (!Number.isInteger(userId)) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const config = await getOrCreateBoardConfig();
  if (!config.draft_active) {
    res.status(409).json({ error: "The draft is not active" });
    return;
  }

  const memberRows = await sql`
    SELECT id, team_id, discord_username, discord_global_name, runescape_name
    FROM users WHERE id = ${userId}`;
  if (memberRows.length === 0) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  if (memberRows[0].team_id !== null) {
    res.status(409).json({ error: "That member is already assigned to a team" });
    return;
  }

  const teamId = config.draft_order[config.draft_pick_index];
  const memberName =
    memberRows[0].runescape_name ?? memberRows[0].discord_global_name ?? memberRows[0].discord_username;
  const pickNumber = config.draft_pick_index + 1;
  const nextIndex = config.draft_pick_index + 1;
  const stillActive = nextIndex < config.draft_order.length;

  await sql`UPDATE users SET team_id = ${teamId} WHERE id = ${userId}`;
  await sql`
    UPDATE board_config SET
      draft_pick_index = ${nextIndex}, draft_active = ${stillActive},
      draft_log = draft_log || ${JSON.stringify([{ pickNumber, teamId, memberName, userId }])}::jsonb,
      updated_at = now()
    WHERE id = 1`;

  await getDraft(res);
}

async function endDraft(res: VercelResponse) {
  // Stops the clock without unassigning anyone already picked — the pick
  // log is intentionally left untouched.
  await sql`
    UPDATE board_config SET draft_active = FALSE, draft_order = '[]'::jsonb, draft_pick_index = 0, updated_at = now()
    WHERE id = 1`;
  await getDraft(res);
}

async function resetDraft(res: VercelResponse) {
  // Fully undoes the last draft run: puts everyone it picked back to
  // unassigned and wipes the log, so "Start Draft" is meaningful again.
  // Only entries with a stored userId (picks made after this field was
  // added) can be safely reversed — older log entries are skipped.
  const config = await getOrCreateBoardConfig();
  const draftedUserIds = config.draft_log
    .map((entry) => entry.userId)
    .filter((id): id is number => typeof id === "number");

  if (draftedUserIds.length > 0) {
    await sql`UPDATE users SET team_id = NULL WHERE id = ANY(${draftedUserIds}::bigint[])`;
  }

  await sql`
    UPDATE board_config SET
      draft_active = FALSE, draft_order = '[]'::jsonb, draft_pick_index = 0, draft_log = '[]'::jsonb, updated_at = now()
    WHERE id = 1`;
  await getDraft(res);
}

// Board config, tiles, and the draft are combined into one function to stay
// under the Vercel Hobby plan's 12-function-per-deployment cap — dispatched
// by `resource`, the same pattern api/wom-proxy.ts already uses for `type`.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return;

  const resource = req.query.resource;
  const isTiles = resource === "tiles";
  const isDraft = resource === "draft";

  if (req.method === "GET") {
    if (isTiles) await listTiles(res);
    else if (isDraft) await getDraft(res);
    else await getConfig(res);
    return;
  }

  if (req.method === "PUT") {
    if (isTiles) await updateTile(req, res);
    else await updateConfig(req, res);
    return;
  }

  if (req.method === "POST" && isDraft) {
    const action = req.body?.action;
    if (action === "start") await startDraft(res);
    else if (action === "pick") await pickDraft(req, res);
    else if (action === "end") await endDraft(res);
    else if (action === "reset") await resetDraft(res);
    else res.status(400).json({ error: "action must be 'start', 'pick', 'end', or 'reset'" });
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
