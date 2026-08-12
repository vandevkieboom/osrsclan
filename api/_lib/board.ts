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

export type ProofSubmitResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Records a pending tile-proof submission, enforcing the rules shared by both
 * submission paths (the website's manual upload and the RuneLite plugin's
 * automatic one): the tile must exist, and the team must not already have
 * enough approved-or-pending proofs to fulfil it.
 *
 * Returns a result rather than writing to the response so each caller can
 * shape its own success payload.
 */
export async function insertProofSubmission(opts: {
  teamId: number;
  tileId: number;
  proofUrl: string;
  submittedBy: number;
}): Promise<ProofSubmitResult> {
  const tileRows =
    await sql`SELECT id, required_count FROM tiles WHERE id = ${opts.tileId}`;
  if (tileRows.length === 0) {
    return { ok: false, status: 404, error: "Tile not found" };
  }

  const currentCompleteRows = await sql`
    SELECT COUNT(*) FILTER (WHERE status IN ('approved', 'pending'))::int AS active_count
    FROM submissions
    WHERE team_id = ${opts.teamId} AND tile_id = ${opts.tileId}`;
  const activeCount = currentCompleteRows[0]?.active_count ?? 0;
  if (activeCount >= tileRows[0].required_count) {
    return { ok: false, status: 409, error: "That tile is already complete" };
  }

  await sql`
    INSERT INTO submissions (team_id, tile_id, status, proof_url, submitted_by)
    VALUES (${opts.teamId}, ${opts.tileId}, 'pending', ${opts.proofUrl}, ${opts.submittedBy})`;

  return { ok: true };
}
