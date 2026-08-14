import { del } from "@vercel/blob";
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
 * clean: every team's tile submissions (proof images included — see below),
 * and every member's xp/kc goal-tile progress (see goal_progress in
 * db/schema.sql — baselines otherwise persist forever and would under-count
 * a reused goal_key's next round). Tiles, teams/rosters, donations and the
 * broadcast message are deliberately left alone — none of those are
 * "per-round" state.
 *
 * Proof screenshots live in Vercel Blob, not the database (see uploadProof
 * in api/board.ts) — deleting only the submissions rows would leave every
 * old image sitting in storage, still publicly reachable at its URL,
 * forever. So this reads every proof_url and deletes the blobs *before*
 * touching the database: if blob deletion fails partway, the submissions
 * rows are still there to retry against, rather than the rows being gone
 * with no record of which blobs still need cleaning up.
 */
export async function resetBingoProgress(): Promise<void> {
  const proofRows = await sql`
    SELECT proof_url FROM submissions WHERE proof_url IS NOT NULL`;
  const proofUrls = proofRows
    .map((r) => r.proof_url as string)
    .filter(Boolean);
  if (proofUrls.length > 0) {
    await del(proofUrls);
  }

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

export interface GoalReconcileResult {
  checked: number;
  updated: number;
  seeded: number;
  skippedNoRsnMatch: number;
  skippedNoMetric: number;
}

export interface WomStats {
  skills?: Record<string, { experience?: number }>;
  bosses?: Record<string, { kills?: number }>;
}

/**
 * Matches a goal_progress/tiles goal_key against a WOM player's stats,
 * tolerating the same admin-typo spellings the plugin's own skillFromName()
 * already accepts — plus one WOM disagrees with RuneLite's own enum on:
 * WOM's skill metric is "runecrafting", not "runecraft", so an admin typing
 * the CURRENT in-game name (which the plugin accepts directly) needs the
 * alias tried here too. Boss KC metrics collapse anything that isn't a
 * letter or digit to a single underscore ("TzTok-Jad" -> "tztok_jad",
 * "Vet'ion" -> "vet_ion"). Returns null when nothing matches — an
 * admin-typed goal_key that isn't a real WOM skill/boss (a Slayer-task NPC,
 * say) just never gets a backstop; the live push stays the only source.
 */
function lookupWomValue(
  entry: WomStats,
  goalKind: string,
  goalKey: string,
): number | null {
  if (goalKind === "xp") {
    const aliases =
      goalKey === "runecraft"
        ? ["runecrafting", "runecraft"]
        : goalKey === "defense"
          ? ["defence", "defense"]
          : [goalKey];
    for (const alias of aliases) {
      const skill = entry.skills?.[alias];
      if (skill && typeof skill.experience === "number" && skill.experience >= 0) {
        return skill.experience;
      }
    }
    return null;
  }
  if (goalKind === "kc") {
    const metricKey = goalKey.replace(/[^a-z0-9]+/g, "_");
    const boss = entry.bosses?.[metricKey];
    if (boss && typeof boss.kills === "number" && boss.kills >= 0) {
      return boss.kills;
    }
  }
  return null;
}

/**
 * Corrects goal_progress against real Wise Old Man hiscores data, fetched
 * by the caller (fetchWomStatsByRsnKey below). The plugin's own live push
 * (see recordGoalProgress) is normally enough, but it's the ONLY source of
 * truth today — a missed chat line, a client that quits mid-event, or a
 * regex that doesn't match some message variant leaves that member's
 * contribution permanently short with nothing to correct it. This does two
 * things:
 *
 * 1. Corrects existing rows — only ever raises latest_value (never lowers
 *    it, never touches baseline_value), the same GREATEST-based "only
 *    progress counts" idiom recordGoalProgress itself already uses.
 * 2. Seeds a starting row for a team member an active tile should be
 *    tracking who has none at all — otherwise a member who never opens the
 *    plugin (there's no RuneLite on mobile, so a mobile-only player NEVER
 *    gets a first-ever report) contributes nothing to their team,
 *    permanently, with nothing able to fix it — there'd be no row to ever
 *    raise. The seeded baseline is their hiscores reading at the moment
 *    this runs, identical in spirit to a first-ever plugin report becoming
 *    a baseline: nothing is backdated or retroactively credited, tracking
 *    just starts existing for them from here. ON CONFLICT DO NOTHING
 *    guards the race where the plugin establishes a real baseline for the
 *    same (user, goal) at the same moment — whichever commits first wins.
 */
// Caps how many INSERT/UPDATE statements a single reconciliation pass will
// actually execute. Each one is a separate awaited round trip, and Vercel
// kills a function that runs too long — a clan with many members and no
// existing goal_progress rows yet (a fresh board, or the first run after
// this feature ships) could otherwise need hundreds of writes in one pass.
// Capping it just means the leftover work naturally gets picked up by the
// next throttled pass (see maybeReconcileGoalProgress) a few minutes later
// — nothing is lost or skipped permanently, it just spreads out safely
// instead of risking a mid-batch timeout.
const MAX_WRITES_PER_PASS = 60;

export async function reconcileGoalProgress(
  womByRsnKey: Map<string, WomStats>,
): Promise<GoalReconcileResult> {
  const result: GoalReconcileResult = {
    checked: 0,
    updated: 0,
    seeded: 0,
    skippedNoRsnMatch: 0,
    skippedNoMetric: 0,
  };

  const existingRows = await sql`
    SELECT gp.id, gp.user_id, gp.goal_kind, gp.goal_key, gp.latest_value, u.runescape_name
    FROM goal_progress gp
    JOIN users u ON u.id = gp.user_id
    WHERE u.runescape_name IS NOT NULL AND u.runescape_name != ''`;
  result.checked = existingRows.length;

  const existingKeys = new Set<string>();
  let writes = 0;
  for (const row of existingRows) {
    existingKeys.add(`${row.user_id}:${row.goal_kind}:${row.goal_key}`);
    if (writes >= MAX_WRITES_PER_PASS) continue;

    const rsnKey = (row.runescape_name as string).trim().toLowerCase();
    const womEntry = womByRsnKey.get(rsnKey);
    if (!womEntry) {
      result.skippedNoRsnMatch++;
      continue;
    }

    const womValue = lookupWomValue(womEntry, row.goal_kind as string, row.goal_key as string);
    if (womValue === null) {
      result.skippedNoMetric++;
      continue;
    }

    const updatedRows = await sql`
      UPDATE goal_progress SET latest_value = ${womValue}, updated_at = now()
      WHERE id = ${row.id} AND ${womValue} > latest_value
      RETURNING id`;
    if (updatedRows.length > 0) {
      result.updated++;
      writes++;
    }
  }

  // tiles.goal_key preserves whatever casing the admin typed ("Zulrah"),
  // unlike goal_progress.goal_key, which recordGoalProgress always
  // lowercases before storing ("zulrah"). Normalizing here is what keeps
  // this comparable against existingKeys (built from goal_progress rows
  // above) and matchable against WOM's lowercase metric names — skipping
  // it would silently match nothing, or worse, insert a row whose casing
  // getTeamGoalProgress's own lookup (also lowercase) would never find.
  const activeGoalsRaw = await sql`
    SELECT DISTINCT goal_kind, goal_key FROM tiles WHERE goal_kind IN ('xp', 'kc')`;
  const activeGoals = activeGoalsRaw.map((g) => ({
    goal_kind: g.goal_kind as string,
    goal_key: (g.goal_key as string).trim().toLowerCase(),
  }));
  if (activeGoals.length === 0) {
    return result;
  }

  const members = await sql`
    SELECT id, runescape_name FROM users
    WHERE team_id IS NOT NULL AND runescape_name IS NOT NULL AND runescape_name != ''`;

  memberLoop: for (const member of members) {
    const rsnKey = (member.runescape_name as string).trim().toLowerCase();
    const womEntry = womByRsnKey.get(rsnKey);
    if (!womEntry) continue;

    for (const goal of activeGoals) {
      if (writes >= MAX_WRITES_PER_PASS) break memberLoop;

      const key = `${member.id}:${goal.goal_kind}:${goal.goal_key}`;
      if (existingKeys.has(key)) continue;

      const womValue = lookupWomValue(womEntry, goal.goal_kind, goal.goal_key);
      if (womValue === null) continue;

      await sql`
        INSERT INTO goal_progress (user_id, goal_kind, goal_key, baseline_value, latest_value)
        VALUES (${member.id}, ${goal.goal_kind}, ${goal.goal_key}, ${womValue}, ${womValue})
        ON CONFLICT (user_id, goal_kind, goal_key) DO NOTHING`;
      existingKeys.add(key);
      result.seeded++;
      writes++;
    }
  }

  return result;
}

const WOM_BASE_URL = "https://api.wiseoldman.net/v2";
// Keep in sync with WOM_GROUP_ID in src/constants.ts, vite.config.ts,
// api/runeprofile-proxy.ts, and api/wom-proxy.ts.
const WOM_GROUP_ID = 22206;
const WOM_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent": "vandevkieboom",
  ...(process.env.WOM_API_KEY ? { "x-api-key": process.env.WOM_API_KEY } : {}),
};

/** Fetches the whole group's hiscores in one call, keyed by lowercased RSN. Null on any failure — callers just skip reconciling for this pass. */
export async function fetchWomStatsByRsnKey(): Promise<Map<string, WomStats> | null> {
  try {
    const res = await fetch(`${WOM_BASE_URL}/groups/${WOM_GROUP_ID}/bulk-hiscores`, {
      headers: WOM_HEADERS,
    });
    if (!res.ok) return null;
    const bulk = (await res.json()) as Array<{
      player?: { username?: string; displayName?: string };
      data?: { data?: WomStats };
    }>;
    const map = new Map<string, WomStats>();
    for (const entry of bulk) {
      const key = (entry.player?.displayName ?? entry.player?.username ?? "")
        .trim()
        .toLowerCase();
      if (key && entry.data?.data) {
        map.set(key, entry.data.data);
      }
    }
    return map;
  } catch {
    return null;
  }
}

// Only actually hit WOM this often, no matter how many times
// maybeReconcileGoalProgress is called — it's invoked from getBoard, which
// every online plugin user's 1-minute refresh already hits, so without a
// throttle this would fire a WOM request roughly once per online member
// per minute. 10 minutes still means the backstop keeps correcting
// throughout an event right up to its deadline, unlike a fixed daily cron
// that might not run again until after scoring has already closed.
const GOAL_RECONCILE_THROTTLE_MS = 10 * 60 * 1000;

/**
 * Opportunistically reconciles goal_progress, throttled to run at most once
 * per GOAL_RECONCILE_THROTTLE_MS. Called from getBoard (see api/board.ts)
 * so it rides along on real traffic instead of a fixed-clock cron. Never
 * throws — a WOM outage should never take the board down with it, it just
 * means this pass is skipped and the next request retries.
 */
export async function maybeReconcileGoalProgress(): Promise<void> {
  const rows = await sql`SELECT goal_reconciled_at FROM board_config WHERE id = 1`;
  const lastRun = rows[0]?.goal_reconciled_at as string | null;
  if (lastRun && Date.now() - new Date(lastRun).getTime() < GOAL_RECONCILE_THROTTLE_MS) {
    return;
  }
  // Claimed before the network call so concurrent requests arriving during
  // the fetch don't all decide it's also their turn.
  await sql`UPDATE board_config SET goal_reconciled_at = now() WHERE id = 1`;

  const womByRsnKey = await fetchWomStatsByRsnKey();
  if (!womByRsnKey) return;
  await reconcileGoalProgress(womByRsnKey);
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
