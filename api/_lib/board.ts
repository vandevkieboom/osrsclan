import { sql } from "./db.js";

export interface BoardConfigRow {
  name: string;
  size: number;
  broadcast_message: string;
  broadcast_updated_at: string | null;
}

// board_config is a singleton (id = 1). This upserts a default row into
// existence if it's ever missing (e.g. someone deleted it by hand in the
// database) instead of every caller crashing on an empty result set.
export async function getOrCreateBoardConfig(): Promise<BoardConfigRow> {
  const rows = await sql`
    INSERT INTO board_config (id) VALUES (1)
    ON CONFLICT (id) DO UPDATE SET id = board_config.id
    RETURNING name, size, broadcast_message, broadcast_updated_at`;
  return rows[0] as BoardConfigRow;
}

/**
 * Wipes everything tied to the current round of bingo so a new one can start
 * clean: every team's tile submissions, and every member's xp/kc goal-tile
 * progress (see goal_progress in db/schema.sql — baselines otherwise persist
 * forever and would under-count a reused goal_key's next round). Tiles,
 * teams/rosters, donations and the broadcast message are deliberately left
 * alone — none of those are "per-round" state. Run as a transaction so a
 * failure partway through can't leave submissions cleared but goal progress
 * intact (or vice versa).
 */
export async function resetBingoProgress(): Promise<void> {
  await sql.transaction([
    sql`DELETE FROM submissions`,
    sql`DELETE FROM goal_progress`,
  ]);
}

/**
 * Pushes a new one-off admin message, read by the RuneLite plugin's
 * periodic poll (see BingoApiClient#fetchBroadcast) and printed as a chat
 * message to anyone with the "Clan broadcasts" toggle on. Each call
 * overwrites the previous message — this isn't a log, just "the current
 * thing to tell people".
 */
export async function setBroadcast(
  message: string,
): Promise<{ message: string; updatedAt: string }> {
  const rows = await sql`
    INSERT INTO board_config (id, broadcast_message, broadcast_updated_at)
    VALUES (1, ${message}, now())
    ON CONFLICT (id) DO UPDATE SET
      broadcast_message = EXCLUDED.broadcast_message,
      broadcast_updated_at = EXCLUDED.broadcast_updated_at
    RETURNING broadcast_message, broadcast_updated_at`;
  return {
    message: rows[0].broadcast_message,
    updatedAt: rows[0].broadcast_updated_at,
  };
}

/**
 * Records a plugin's reading of a member's current XP/kill-count for a goal.
 * The first reading for a given (user, goalKind, goalKey) becomes that
 * member's baseline — only progress from that point on counts, same
 * philosophy as item-drop tiles only seeing loot obtained while the plugin
 * runs. Later readings only ever raise latest_value: both XP and kill count
 * are monotonic in OSRS, so a lower report is a stale/out-of-order request,
 * not real progress lost.
 */
export async function recordGoalProgress(opts: {
  userId: number;
  goalKind: "xp" | "kc";
  goalKey: string;
  value: number;
}): Promise<void> {
  const key = opts.goalKey.trim().toLowerCase();
  await sql`
    INSERT INTO goal_progress (user_id, goal_kind, goal_key, baseline_value, latest_value)
    VALUES (${opts.userId}, ${opts.goalKind}, ${key}, ${opts.value}, ${opts.value})
    ON CONFLICT (user_id, goal_kind, goal_key) DO UPDATE SET
      latest_value = GREATEST(goal_progress.latest_value, EXCLUDED.latest_value),
      updated_at = now()`;
}

/**
 * Team-combined progress for every (goal_kind, goal_key) pair currently used
 * by a tile, keyed the same way so getBoard can look up a tile's number with
 * a single map get. Computed fresh from current team membership on every
 * call rather than stored, so a roster change is reflected immediately.
 */
export async function getTeamGoalProgress(): Promise<
  Map<string, Map<number, number>>
> {
  const rows = await sql`
    SELECT u.team_id, gp.goal_kind, gp.goal_key,
           SUM(GREATEST(gp.latest_value - gp.baseline_value, 0))::bigint AS total
    FROM goal_progress gp
    JOIN users u ON u.id = gp.user_id
    WHERE u.team_id IS NOT NULL
    GROUP BY u.team_id, gp.goal_kind, gp.goal_key`;

  const byGoal = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const goalMapKey = `${row.goal_kind}:${row.goal_key}`;
    const byTeam = byGoal.get(goalMapKey) ?? new Map<number, number>();
    byTeam.set(row.team_id, Number(row.total));
    byGoal.set(goalMapKey, byTeam);
  }
  return byGoal;
}

export type ProofValidation =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Checks whether a tile-proof submission would be accepted, enforcing the
 * rules shared by both submission paths (the website's manual upload and the
 * RuneLite plugin's automatic one):
 * - the tile must exist,
 * - if itemId is given and the tile restricts itself to specific items, it
 *   must be one of them,
 * - if the tile requires unique items, that item id must not already have an
 *   approved-or-pending submission for this team on this tile (e.g. "4
 *   unique DK rings" — a second ring of the same kind is refused, not just
 *   flagged for an admin to notice),
 * - the team must not already have enough approved-or-pending proofs to
 *   fulfil the tile.
 *
 * Deliberately does NOT insert anything: the plugin's proof upload needs to
 * validate *before* spending a Blob upload on a submission that's going to be
 * rejected anyway, so validation and recording are separate steps.
 */
export async function validateProofSubmission(opts: {
  teamId: number;
  tileId: number;
  itemId?: number;
}): Promise<ProofValidation> {
  const tileRows = await sql`
    SELECT required_count, item_ids, require_unique_items
    FROM tiles WHERE id = ${opts.tileId}`;
  if (tileRows.length === 0) {
    return { ok: false, status: 404, error: "Tile not found" };
  }
  const tile = tileRows[0];

  if (opts.itemId !== undefined) {
    const itemIds = (tile.item_ids ?? []) as number[];
    if (itemIds.length > 0 && !itemIds.includes(opts.itemId)) {
      return {
        ok: false,
        status: 400,
        error: "That item does not satisfy the requested tile",
      };
    }

    if (tile.require_unique_items) {
      const dupRows = await sql`
        SELECT 1 FROM submissions
        WHERE team_id = ${opts.teamId} AND tile_id = ${opts.tileId}
          AND item_id = ${opts.itemId} AND status IN ('approved', 'pending')
        LIMIT 1`;
      if (dupRows.length > 0) {
        return {
          ok: false,
          status: 409,
          error: "That item has already been submitted for this tile",
        };
      }
    }
  }

  const currentCompleteRows = await sql`
    SELECT COUNT(*) FILTER (WHERE status IN ('approved', 'pending'))::int AS active_count
    FROM submissions
    WHERE team_id = ${opts.teamId} AND tile_id = ${opts.tileId}`;
  const activeCount = currentCompleteRows[0]?.active_count ?? 0;
  if (activeCount >= tile.required_count) {
    return { ok: false, status: 409, error: "That tile is already complete" };
  }

  return { ok: true };
}

/** Records a pending tile-proof submission. Call validateProofSubmission first. */
export async function recordProofSubmission(opts: {
  teamId: number;
  tileId: number;
  proofUrl: string;
  submittedBy: number;
  itemId?: number;
}): Promise<void> {
  await sql`
    INSERT INTO submissions (team_id, tile_id, status, proof_url, submitted_by, item_id)
    VALUES (${opts.teamId}, ${opts.tileId}, 'pending', ${opts.proofUrl}, ${opts.submittedBy}, ${opts.itemId ?? null})`;
}
