import { sql } from "./db.js";

export interface PrizePot {
  total: string;
}

export interface BoardConfigRow {
  name: string;
  size: number;
  prize_pot: PrizePot;
}

// board_config is a singleton (id = 1). This upserts a default row into
// existence if it's ever missing (e.g. someone deleted it by hand in the
// database) instead of every caller crashing on an empty result set.
export async function getOrCreateBoardConfig(): Promise<BoardConfigRow> {
  const rows = await sql`
    INSERT INTO board_config (id) VALUES (1)
    ON CONFLICT (id) DO UPDATE SET id = board_config.id
    RETURNING name, size, prize_pot`;
  return rows[0] as BoardConfigRow;
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
