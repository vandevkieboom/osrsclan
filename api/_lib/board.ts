import { sql } from "./db.js";

export interface PrizePotEntry {
  name: string;
  amount: string;
}

export interface PrizePot {
  total: string;
  buyIn: string;
  donated: string;
  entries: PrizePotEntry[];
}

export interface BoardConfigRow {
  name: string;
  date_range: string;
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
    RETURNING name, date_range, size, prize_pot`;
  return rows[0] as BoardConfigRow;
}
