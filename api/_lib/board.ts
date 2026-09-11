import { del } from "@vercel/blob";
import { sql } from "./db.js";

export interface BoardConfigRow {
  name: string;
  size: number;
  bingo_active: boolean;
  /** See db/schema.sql - a viewing switch, deliberately independent of
   * bingo_active's cost/submission effects. Only ever consulted by
   * getBoard's visibility gate. */
  board_visible: boolean;
  board_changed_at: string;
}

// board_config is a singleton (id = 1), and it is by far the most-read row in
// the database — every plugin poll needs it.
//
// This used to be an `INSERT ... ON CONFLICT DO UPDATE`, purely so that a
// row deleted by hand would be recreated. That made a *write* out of what is
// overwhelmingly a read: with a few dozen plugins online it was tens of
// thousands of pointless writes a day to a single row, each one generating
// WAL and dead tuples for autovacuum to clean up, on a database whose compute
// quota is the binding constraint. Now it reads first and only ever writes on
// the genuinely-missing case it was written for.
export async function getOrCreateBoardConfig(): Promise<BoardConfigRow> {
  const rows = await sql`
    SELECT name, size, bingo_active, board_visible, board_changed_at
    FROM board_config WHERE id = 1`;
  if (rows.length > 0) {
    return rows[0] as BoardConfigRow;
  }

  const created = await sql`
    INSERT INTO board_config (id) VALUES (1)
    ON CONFLICT (id) DO UPDATE SET id = board_config.id
    RETURNING name, size, bingo_active, board_visible, board_changed_at`;
  return created[0] as BoardConfigRow;
}

// How long a warm function instance may reuse a board_config it already read
// rather than querying again. Only the high-frequency plugin poll path uses
// this (see api/plugin-poll.ts) — admin reads and the full board fetch always
// go to the database — so the worst case it can produce is a plugin seeing a
// just-toggled bingo_active up to this much later, on top of the edge cache
// window that already applies to the same response.
const CONFIG_MEMO_MS = 10_000;

let configMemo: { row: BoardConfigRow; at: number } | null = null;

/**
 * board_config for the plugin poll path, memoised per warm function instance.
 *
 * Vercel's Fluid compute runs many concurrent requests on one instance, so a
 * burst of poll requests that all miss the edge cache at the same moment
 * previously became a burst of identical single-row queries. This collapses
 * them into one. `lastGood` additionally survives a database outage: the poll
 * endpoint would rather serve a slightly stale-but-correct answer with a
 * cacheable 200 than a 500 that the edge refuses to cache and that therefore
 * turns every polling client into a direct function invocation — see
 * api/plugin-poll.ts for why that distinction is the whole point.
 */
export async function getBoardConfigMemoised(): Promise<{
  row: BoardConfigRow | null;
  stale: boolean;
}> {
  if (configMemo && Date.now() - configMemo.at < CONFIG_MEMO_MS) {
    return { row: configMemo.row, stale: false };
  }
  try {
    const row = await getOrCreateBoardConfig();
    configMemo = { row, at: Date.now() };
    return { row, stale: false };
  } catch (err) {
    console.error("board_config read failed, falling back:", err);
    return { row: configMemo?.row ?? null, stale: true };
  }
}

/** Drops the memo so an admin write is visible to this instance immediately. */
export function invalidateBoardConfigMemo(): void {
  configMemo = null;
}

/**
 * Bounds an env-var-supplied number of seconds. Bounded rather than trusted: a
 * typo should not be able to have every plugin in the clan hammering an
 * endpoint, nor to silently switch one off by asking it to wait an hour.
 */
export function clampEnvSeconds(
  raw: string | undefined,
  fallback: number,
  min = 60,
  max = 900,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/**
 * How long the CDN may serve a cached copy of a response derived from
 * board_config — and it differs by whether an event is on.
 *
 * This is the dial that controls **compute**, and it behaves in a way that is
 * easy to get backwards. Once enough members are online that every cache
 * window ends in a miss somewhere, how often the origin actually *runs* stops
 * depending on member count at all: it settles at roughly (CDN locations) x
 * (60 / this value) per minute, and nothing else.
 *
 * That matters for a reason specific to Neon rather than Vercel: its compute
 * only suspends (stops billing) after 5 real minutes with **no query at all**.
 * Neon does not care how many people asked, only how long it has been since
 * the last one — so a handful of members who forgot to clear a plugin key,
 * still idly polling, is enough in aggregate to touch the database more often
 * than every 5 minutes forever and never once suspend, even though the request
 * *count* is tiny. While idle this window therefore has to be comfortably
 * longer than 5 minutes to guarantee a real gap every cycle. While an event is
 * active none of that applies: freshness is what matters, so it drops back to
 * the short window.
 *
 * **Shared by every board_config-derived endpoint on purpose.** These used to
 * be private to api/plugin-poll.ts, which meant the older
 * `GET /api/board?resource=status` kept a flat 30s window regardless of
 * whether an event was running — so a single un-updated plugin install could
 * hold the database awake around the clock, all year, defeating the idle
 * window entirely. Two endpoints answering the same question must not be able
 * to disagree about how long that answer keeps.
 */
const CACHE_SECONDS_ACTIVE = clampEnvSeconds(
  process.env.PLUGIN_POLL_CACHE_SECONDS_ACTIVE,
  30,
  5,
);

// The idle window gets its own, much higher ceiling than the normal 900s cap:
// that cap exists to stop a typo making the *active* window dangerously slow
// during a real event, which doesn't apply here — a long idle window is the
// entire point. 1800s (30 min) default: comfortably past Neon's 5-minute
// suspend threshold, while still picking up a newly re-activated event within
// one cycle.
const CACHE_SECONDS_IDLE = clampEnvSeconds(
  process.env.PLUGIN_POLL_CACHE_SECONDS_IDLE,
  1800,
  5,
  3600,
);

export function boardConfigCacheControl(bingoActive: boolean): string {
  const seconds = bingoActive ? CACHE_SECONDS_ACTIVE : CACHE_SECONDS_IDLE;
  // stale-while-revalidate is generous on purpose: a member never waits on a
  // revalidation, and a slow moment at the origin degrades to "your answer is
  // a few seconds older" rather than to a burst of concurrent misses all
  // rendering the same thing.
  return `s-maxage=${seconds}, stale-while-revalidate=${seconds * 3}`;
}

/**
 * Wipes everything tied to the current round of bingo so a new one can start
 * clean: every team's tile submissions (proof images included — see below),
 * and every member's xp/kc goal-tile progress (see goal_progress in
 * db/schema.sql — baselines otherwise persist forever and would under-count
 * a reused goal_key's next round). Tiles, teams/rosters and donations are
 * deliberately left alone — none of those are "per-round" state.
 *
 * Proof screenshots live in Vercel Blob, not the database (see uploadProof
 * in api/board.ts) — deleting only the submissions rows would leave every
 * old image sitting in storage, still publicly reachable at its URL,
 * forever. So this reads every proof_url and deletes the blobs *before*
 * touching the database: if blob deletion fails partway, the submissions
 * rows are still there to retry against, rather than the rows being gone
 * with no record of which blobs still need cleaning up.
 *
 * After wiping, immediately re-seeds every current team member's baseline
 * for every active xp/kc goal from their hiscores reading right now (see
 * seedGoalBaselines) — a reset isn't just "forget the old numbers," it's
 * "everyone's starting line is this exact moment," for every roster member
 * at once, not staggered across whenever each person's plugin next checks
 * in (or never, for a mobile-only player). A WOM outage here just means
 * the reset's wipe still happened but nobody got re-seeded yet — the
 * periodic refresh can't fix that on its own since it only ever corrects
 * existing rows, so this logs rather than silently swallowing the failure.
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

  const activeGoals = await getActiveGoals();
  if (activeGoals.length === 0) {
    return;
  }
  const womByRsnKey = await fetchWomStatsByRsnKey();
  if (!womByRsnKey) {
    console.error("resetBingoProgress: WOM unreachable, goal baselines were not re-seeded");
    return;
  }
  await seedGoalBaselines(womByRsnKey, activeGoals);
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

/** Every currently-active xp/kc goal, deduplicated and lowercased — the same tile.goal_key-casing normalization getTeamGoalProgress's lookup requires. */
export async function getActiveGoals(): Promise<
  { goalKind: "xp" | "kc"; goalKey: string }[]
> {
  const rows = await sql`
    SELECT DISTINCT goal_kind, goal_key FROM tiles WHERE goal_kind IN ('xp', 'kc')`;
  return rows.map((g) => ({
    goalKind: g.goal_kind as "xp" | "kc",
    goalKey: (g.goal_key as string).trim().toLowerCase(),
  }));
}

export interface GoalRefreshResult {
  checked: number;
  updated: number;
  skippedNoRsnMatch: number;
  skippedNoMetric: number;
}

/**
 * Corrects EXISTING goal_progress rows against real WOM hiscores data —
 * only ever raises latest_value (never lowers it, never touches
 * baseline_value, never creates a row that doesn't already exist). This is
 * a pure backstop against a value falling behind reality; it does not, and
 * deliberately no longer does, create new rows — see seedGoalBaselines for
 * that, which is now only ever called explicitly (on reset or when a tile's
 * goal is set/changed), not opportunistically here. Mixing "correct what
 * exists" and "invent what's missing" into one lazily-triggered pass was
 * the previous design, and it's what caused entries to seem to appear at
 * random, inconsistent moments depending on whose report happened to be
 * seen first.
 *
 * Single round trip regardless of team size: computes every (row id, new
 * value) candidate in memory first, then issues one bulk UPDATE — avoids
 * both the N-round-trip cost and the timeout risk that came with it.
 */
export async function refreshGoalLatestValues(
  womByRsnKey: Map<string, WomStats>,
): Promise<GoalRefreshResult> {
  const result: GoalRefreshResult = {
    checked: 0,
    updated: 0,
    skippedNoRsnMatch: 0,
    skippedNoMetric: 0,
  };

  const existingRows = await sql`
    SELECT gp.id, gp.goal_kind, gp.goal_key, u.runescape_name
    FROM goal_progress gp
    JOIN users u ON u.id = gp.user_id
    WHERE u.runescape_name IS NOT NULL AND u.runescape_name != ''`;
  result.checked = existingRows.length;

  const ids: number[] = [];
  const values: number[] = [];
  for (const row of existingRows) {
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
    ids.push(row.id as number);
    values.push(womValue);
  }

  if (ids.length === 0) {
    return result;
  }

  const updatedRows = await sql`
    UPDATE goal_progress gp SET latest_value = v.new_value, updated_at = now()
    FROM (SELECT * FROM unnest(${ids}::bigint[], ${values}::bigint[]) AS t(id, new_value)) v
    WHERE gp.id = v.id AND v.new_value > gp.latest_value
    RETURNING gp.id`;
  result.updated = updatedRows.length;
  return result;
}

/**
 * Explicitly (re)establishes the starting line for every current team
 * member on the given goals, from their hiscores reading right now —
 * unlike refreshGoalLatestValues, this UNCONDITIONALLY overwrites both
 * baseline_value and latest_value, because it's only ever called from a
 * deliberate "start tracking this from here" action (a full board reset,
 * or a tile's goal being created/changed), never opportunistically. That's
 * what makes it fair across a team: everyone's baseline is snapshotted at
 * the exact same moment, rather than staggered across whenever each
 * person's plugin happened to next report (or, for a mobile-only player,
 * potentially never).
 *
 * Single round trip via a bulk upsert — safe even for every member × every
 * goal at once (a full reset), since it's bounded by roster size, not by
 * open-ended historical data.
 */
export async function seedGoalBaselines(
  womByRsnKey: Map<string, WomStats>,
  goals: { goalKind: "xp" | "kc"; goalKey: string }[],
): Promise<{ seeded: number }> {
  if (goals.length === 0) {
    return { seeded: 0 };
  }

  const members = await sql`
    SELECT id, runescape_name FROM users
    WHERE team_id IS NOT NULL AND runescape_name IS NOT NULL AND runescape_name != ''`;

  const userIds: number[] = [];
  const goalKinds: string[] = [];
  const goalKeys: string[] = [];
  const values: number[] = [];
  for (const member of members) {
    const rsnKey = (member.runescape_name as string).trim().toLowerCase();
    const womEntry = womByRsnKey.get(rsnKey);
    if (!womEntry) continue;

    for (const goal of goals) {
      const womValue = lookupWomValue(womEntry, goal.goalKind, goal.goalKey);
      if (womValue === null) continue;
      userIds.push(member.id as number);
      goalKinds.push(goal.goalKind);
      goalKeys.push(goal.goalKey);
      values.push(womValue);
    }
  }

  if (userIds.length === 0) {
    return { seeded: 0 };
  }

  const seededRows = await sql`
    INSERT INTO goal_progress (user_id, goal_kind, goal_key, baseline_value, latest_value)
    SELECT * FROM unnest(${userIds}::bigint[], ${goalKinds}::text[], ${goalKeys}::text[], ${values}::bigint[], ${values}::bigint[])
    ON CONFLICT (user_id, goal_kind, goal_key) DO UPDATE SET
      baseline_value = EXCLUDED.baseline_value,
      latest_value = EXCLUDED.latest_value,
      updated_at = now()
    RETURNING user_id`;
  return { seeded: seededRows.length };
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
// throttle this could fire a WOM request on every single one of those
// requests. The throttle is claimed via one shared board_config timestamp
// (see below), so regardless of how many members are polling at once, this
// only ever costs one bulk-hiscores call per window.
//
// This is also the one thing that keeps Neon awake for an xp/kc board's
// entire active duration (see the board marker's hasGoalTiles doc) — every
// plugin poll during an event falls through to Postgres on this exact
// cadence, and Neon suspends only after 5 unbroken minutes with none at all.
// 2 minutes was chosen when this was "how fresh should the progress bar be",
// with the compute-uptime side effect undiscovered; 10 minutes cuts that
// event-long cost by roughly half (~84 CU-hours -> ~28 over a two-week event)
// at the cost of the xp/kc bar lagging up to 10 minutes instead of 2 — drop
// tiles, screenshots, approvals and every chat command are completely
// unaffected either way. A deliberate tradeoff, not a bug: lower
// GOAL_RECONCILE_SECONDS for a future event if the lag ever actually matters
// more than the cost.
const GOAL_RECONCILE_THROTTLE_MS =
  clampEnvSeconds(process.env.GOAL_RECONCILE_SECONDS, 600, 60, 3600) * 1000;

/**
 * Opportunistically corrects existing goal_progress rows, throttled to run
 * at most once per GOAL_RECONCILE_THROTTLE_MS. Rides along on real traffic
 * rather than a fixed-clock cron (Vercel Hobby only allows daily crons,
 * which could land after an event's deadline has already passed). Never
 * throws — a WOM outage should never take the board down with it, it just
 * means this pass is skipped and the next request retries.
 *
 * The *primary* caller is the plugin poll endpoint (api/plugin-poll.ts), and
 * that matters rather than being incidental: getBoard is now only fetched
 * when the board has actually changed (see board_changed_at in
 * db/schema.sql), and this pass is itself one of the things that changes it,
 * so hanging it off getBoard alone would make the two circular — xp/kc
 * progress would freeze the moment it stopped changing for other reasons and
 * never restart. The poll endpoint runs unconditionally, so it can't stall
 * that way. getBoard calls it too, which costs one throttled row read and
 * covers a browser opening the bingo page while no plugin is online.
 *
 * Deliberately correction-only — never seeds a missing row. Seeding only
 * ever happens explicitly (resetBingoProgress, or a tile's goal being
 * created/changed), so every team member's baseline lands at the same
 * moment as their teammates', not staggered across however long it takes
 * each of them to be "noticed" by an opportunistic pass like this one.
 */
/**
 * Returns true when it actually updated progress, so the caller can republish
 * the board marker with the new numbers (see _lib/board-marker.ts). It can't
 * republish itself: board-marker.ts imports from this file, so calling back
 * the other way would be a cycle.
 */
export async function maybeReconcileGoalProgress(): Promise<boolean> {
  // Throttle check first, and on its own: this function is called from the
  // plugin poll endpoint, so the overwhelming majority of calls are going to
  // be throttled out, and those need to cost exactly one indexed single-row
  // read and nothing else. Checking for active goal tiles up front instead
  // would add a second query to every one of those no-op calls.
  const rows = await sql`SELECT goal_reconciled_at FROM board_config WHERE id = 1`;
  const lastRun = rows[0]?.goal_reconciled_at as string | null;
  if (lastRun && Date.now() - new Date(lastRun).getTime() < GOAL_RECONCILE_THROTTLE_MS) {
    return false;
  }

  // Nothing to reconcile against if the board has no xp/kc tiles at all,
  // which is the common case between events. Claiming the throttle anyway
  // keeps that check to once per interval rather than once per poll.
  await sql`UPDATE board_config SET goal_reconciled_at = now() WHERE id = 1`;
  const activeGoals = await getActiveGoals();
  if (activeGoals.length === 0) return false;

  const womByRsnKey = await fetchWomStatsByRsnKey();
  if (!womByRsnKey) return false;
  await refreshGoalLatestValues(womByRsnKey);
  return true;
}

export type ProofValidation =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * One entry in a tile's item_requirements (see db/schema.sql) — richer than
 * the flat item_ids/required_count/require_unique_items trio, which can only
 * express "any N of a pool" or "any N distinct items." An entry with no
 * `group` is always required at its own `requiredAmount` (an AND); entries
 * sharing a `group` are one alternative set — completing any ONE full group
 * satisfies that part of the tile (an OR of asymmetric branches, or "any one
 * complete Barrows brother's set").
 */
export interface ItemRequirement {
  itemId: number;
  name: string;
  requiredAmount: number;
  group: string | null;
}

export interface ItemRequirementStatus extends ItemRequirement {
  currentAmount: number;
}

export interface ItemRequirementsStatus {
  complete: boolean;
  perItem: ItemRequirementStatus[];
}

/**
 * Parses tiles.item_requirements (JSONB). Null, not an array, an empty
 * array, or any malformed entry all come back as `null` — meaning "not using
 * this feature here, fall back to the flat item_ids/required_count/
 * require_unique_items fields" — so a bad value degrades to today's
 * behavior rather than breaking the tile.
 */
export function parseItemRequirements(raw: unknown): ItemRequirement[] | null {
  if (raw == null) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const reqs: ItemRequirement[] = [];
    for (const entry of parsed as unknown[]) {
      const e = entry as Record<string, unknown>;
      if (
        !e ||
        typeof e.itemId !== "number" ||
        typeof e.requiredAmount !== "number" ||
        !Number.isInteger(e.requiredAmount) ||
        e.requiredAmount < 1
      ) {
        return null;
      }
      reqs.push({
        itemId: e.itemId,
        name: typeof e.name === "string" && e.name.trim() ? e.name.trim() : `Item ${e.itemId}`,
        requiredAmount: e.requiredAmount,
        group: typeof e.group === "string" && e.group.trim() ? e.group.trim() : null,
      });
    }
    return reqs;
  } catch {
    return null;
  }
}

/**
 * Pure — decides item_requirements completeness from each requirement's
 * current count. Shared by checkItemRequirements (queries the DB for one
 * team+tile) and getBoard's bulk in-memory status calc (which already has
 * every submission's item_id loaded and would rather not issue one query
 * per team per tile — see the hosting-cost notes in this project's own
 * CLAUDE.md on why getBoard stays a fixed number of queries regardless of
 * team/tile count).
 */
export function evaluateItemRequirements(
  itemRequirements: ItemRequirement[],
  countByItemId: Map<number, number>,
): ItemRequirementsStatus {
  const perItem: ItemRequirementStatus[] = itemRequirements.map((r) => ({
    ...r,
    currentAmount: countByItemId.get(r.itemId) ?? 0,
  }));

  const ungroupedComplete = perItem
    .filter((i) => !i.group)
    .every((i) => i.currentAmount >= i.requiredAmount);

  const groups = new Map<string, ItemRequirementStatus[]>();
  for (const i of perItem) {
    if (!i.group) continue;
    const key = i.group.toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(i);
    groups.set(key, list);
  }
  const anyGroupComplete =
    groups.size === 0 ||
    Array.from(groups.values()).some((set) =>
      set.every((i) => i.currentAmount >= i.requiredAmount),
    );

  return { complete: ungroupedComplete && anyGroupComplete, perItem };
}

/**
 * checkItemRequirements for one team+tile, counting only APPROVED submission
 * rows per item id (each row is one unit — this schema has no
 * per-submission amount/quantity column). `excludeSubmissionId` lets a
 * caller ask "would this be complete WITHOUT the row I'm about to
 * approve/reject" (it defaults to 0, an id that never matches a real
 * BIGSERIAL row, so passing nothing counts every row as normal).
 *
 * Approved-only on purpose, not approved-or-pending — a real drop in a live
 * event traced to this exact distinction. A tile with several alternative
 * sets (see item_requirements above) is "complete" the moment ONE set's
 * items are all merely pending, before an admin has confirmed anything —
 * and validateProofSubmission refuses every further submission once a tile
 * reads complete, with no way to tell which set it thinks is done. So a
 * second team member's genuinely different, valid drop for a DIFFERENT set
 * got refused while the first set's proofs sat in review; when an admin
 * later rejected one of those, the tile correctly reopened, but the second
 * member's drop was already gone. Bingo tiles are built around drops that
 * cannot realistically be spammed (nobody re-triggers a rare unique on
 * demand), so there is no real over-submission risk to weigh against that —
 * a handful of extra pending proofs on the same item while one is still in
 * review is a cost worth paying to never silently lose a real one.
 */
export async function checkItemRequirements(
  teamId: number,
  tileId: number,
  itemRequirements: ItemRequirement[],
  excludeSubmissionId = 0,
): Promise<ItemRequirementsStatus> {
  const itemIds = itemRequirements.map((r) => r.itemId);
  const rows =
    itemIds.length > 0
      ? await sql`
        SELECT item_id, COUNT(*)::int AS count
        FROM submissions
        WHERE team_id = ${teamId} AND tile_id = ${tileId}
          AND item_id = ANY(${itemIds}::int[]) AND status = 'approved'
          AND id != ${excludeSubmissionId}
        GROUP BY item_id`
      : [];
  const countByItemId = new Map<number, number>();
  for (const r of rows) countByItemId.set(r.item_id as number, Number(r.count));
  return evaluateItemRequirements(itemRequirements, countByItemId);
}

/**
 * Checks whether a tile-proof submission would be accepted, enforcing the
 * rules shared by both submission paths (the website's manual upload and the
 * RuneLite plugin's automatic one):
 * - the tile must exist,
 * - a tile with item_requirements (see above) needs a valid itemId that
 *   isn't already at its own requiredAmount, and the tile overall mustn't
 *   already be complete,
 * - otherwise (the flat item_ids/required_count/require_unique_items
 *   fields): if itemId is given and the tile restricts itself to specific
 *   items, it must be one of them; if the tile requires unique items, that
 *   item id must not already have an approved-or-pending submission for
 *   this team on this tile; the team must not already have enough
 *   approved-or-pending proofs to fulfil the tile.
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
    SELECT required_count, item_ids, require_unique_items, item_requirements
    FROM tiles WHERE id = ${opts.tileId}`;
  if (tileRows.length === 0) {
    return { ok: false, status: 404, error: "Tile not found" };
  }
  const tile = tileRows[0];

  const itemRequirements = parseItemRequirements(tile.item_requirements);
  if (itemRequirements) {
    if (opts.itemId === undefined) {
      return { ok: false, status: 400, error: "itemId is required for this tile" };
    }
    const requirement = itemRequirements.find((r) => r.itemId === opts.itemId);
    if (!requirement) {
      return {
        ok: false,
        status: 400,
        error: "That item does not satisfy the requested tile",
      };
    }
    const reqStatus = await checkItemRequirements(opts.teamId, opts.tileId, itemRequirements);
    if (reqStatus.complete) {
      return { ok: false, status: 409, error: "That tile is already complete" };
    }
    const itemStatus = reqStatus.perItem.find((i) => i.itemId === opts.itemId)!;
    if (itemStatus.currentAmount >= itemStatus.requiredAmount) {
      return {
        ok: false,
        status: 409,
        error: `${requirement.name} already at required amount (${requirement.requiredAmount})`,
      };
    }
    return { ok: true };
  }

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

  // Approved-only, not approved-or-pending — see checkItemRequirements above
  // for the full reasoning. The same risk applies here just as much: a
  // requiredCount of 1 with one pending submission refused every other
  // team member's genuinely separate drop of the same item, and a later
  // rejection of that first proof had no way to get the second one back.
  const currentCompleteRows = await sql`
    SELECT COUNT(*) FILTER (WHERE status = 'approved')::int AS active_count
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
