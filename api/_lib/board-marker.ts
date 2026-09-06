import { head, put } from "@vercel/blob";
import { sql } from "./db.js";
import { getOrCreateBoardConfig, getTeamGoalProgress } from "./board.js";

/**
 * The "has anything changed?" note, kept in Vercel Blob instead of Postgres.
 *
 * **The problem this exists to solve.** Every online plugin asks the site the
 * same question once a minute — "is a bingo running, and has the board moved
 * since I last looked?" — and the answer is *no* almost every single time,
 * because the board only moves when somebody actually gets a drop or an admin
 * approves one. Those endless "no" answers were being read out of Postgres,
 * and Neon bills for *time awake*, suspending only after 5 unbroken minutes
 * with no query at all. It does not care how many people asked, only how long
 * since the last one — so a single member online at 4am with a leftover plugin
 * key was enough to keep a query landing every 30 seconds and the compute
 * awake around the clock, for a two-week event and, thanks to stale keys,
 * potentially all year.
 *
 * **What changes.** The board itself does not move — tiles, teams, standings
 * and submissions all still live in Postgres and are still fetched from there.
 * Only the *change marker* moves here: a ~100 byte JSON file, rewritten by the
 * server whenever something genuinely happens, and read from a CDN. A plugin
 * compares the marker against the stamp of the board it already holds and only
 * fetches a real board on the tick where they differ. Same board, same speed,
 * same database — minus roughly 40,000 wake-ups per event spent being told
 * nothing had changed.
 *
 * **Why a backstop exists.** db/schema.sql maintains `board_changed_at` with
 * database *triggers* rather than a bump() call at each of the ~20 places that
 * write to those tables, deliberately: a missed call site is invisible in
 * testing and shows up in production as a board that silently never updates.
 * Publishing to Blob cannot be done from a trigger, so it *is* a call at each
 * write site, and it reintroduces exactly that risk. `isMarkerStale` is the
 * mitigation: past BACKSTOP_MS the poll endpoint ignores the marker and reads
 * Postgres directly, so a missed publish degrades to "up to 15 minutes late
 * and then self-corrects" rather than "the board never updates again". 15
 * minutes is comfortably longer than Neon's 5-minute suspend threshold, so the
 * backstop still leaves a real quiet gap every cycle.
 */

const MARKER_PATH = "board/marker.json";

// Blob will not accept anything below 60 seconds. It is also the floor on how
// stale the flag below can be, which is why bingoActive is the only *decision*
// taken from this file and boardChangedAt is only ever compared, never trusted
// as a clock.
const MARKER_CACHE_SECONDS = 60;

// How old a marker may be before the poll endpoint stops believing it and goes
// back to Postgres. See the "why a backstop exists" note above.
//
// Two windows, because the two states fail differently. While an event runs,
// a missed publish means a board that looks frozen to everyone playing, so the
// net has to be tight. While no event runs, nothing *can* change except an
// admin flipping the switch — and that is a write, which republishes the
// marker on the spot. So a stale idle marker is not evidence of a problem, it
// is the normal resting state, and re-reading Postgres on a 15-minute timer to
// re-confirm "still nothing happening" would rebuild exactly the every-few-
// minutes drip this whole file exists to remove: Neon suspends only after 5
// unbroken minutes, so that drip is the difference between a database that
// sleeps between events and one that never does. The long window is purely a
// net for publishing being broken outright.
const BACKSTOP_ACTIVE_MS = 15 * 60 * 1000;
const BACKSTOP_IDLE_MS = 24 * 60 * 60 * 1000;

export interface BoardMarker {
  bingoActive: boolean;
  /** Opaque; only ever compared against the stamp a client already holds. */
  boardChangedAt: string | null;
  /**
   * Whether any tile currently tracks combined xp/kc. Those are the only tiles
   * whose progress comes from a timed hiscores pass rather than from someone
   * submitting something (see maybeReconcileGoalProgress), so they are the one
   * thing that still needs the poll to reach Postgres on its normal cadence.
   * Carried here so that decision can be made *without* a query on the boards
   * that have no such tiles — which is most of them.
   */
  hasGoalTiles: boolean;
  /**
   * Team-combined xp/kc progress, as `{"xp:slayer": {"3": 1250000}}` —
   * goal_kind:goal_key, then team id, then the combined value.
   *
   * Carried here so an xp/kc number can reach a plugin **without** the board
   * being marked changed. Updating one number used to bump `board_changed_at`
   * (via a trigger on goal_progress), which told every participant their board
   * was stale and had them re-download all tiles, teams and submissions —
   * every two minutes, for the whole event. That single behaviour was the
   * largest compute cost the project had: the fetch is the most expensive
   * response the site produces, and it was being triggered by the cheapest
   * possible change. Progress is identical for every viewer (it is per *team*,
   * not per member), so it fits the marker's one-cached-copy-for-everyone
   * shape exactly.
   */
  goalProgress: Record<string, Record<string, number>>;
  /** When this file was written, for the staleness backstop. */
  publishedAt: string;
}

// The pathname is fixed, so the URL is too — worth memoising, since resolving
// it is a round trip a warm instance should only ever make once.
let markerUrl: string | null = null;

async function resolveMarkerUrl(): Promise<string | null> {
  if (markerUrl) return markerUrl;
  try {
    const meta = await head(MARKER_PATH);
    markerUrl = meta.url;
    return markerUrl;
  } catch {
    // Not published yet (first deploy, or the store was cleared). Callers fall
    // back to Postgres, and the next write republishes it.
    return null;
  }
}

/**
 * Rewrites the marker from the current database state.
 *
 * Call this after anything that changes what a polling plugin would care
 * about. It deliberately reads Postgres — but only ever from a request that
 * has just written to Postgres anyway, so the compute is already awake and
 * this costs nothing in the terms that actually matter.
 *
 * Never throws. A failed publish must not fail the submission or admin action
 * that triggered it: the backstop above already turns a missed marker into a
 * delay rather than a breakage, which is a far better outcome than an approval
 * appearing to fail because a CDN write timed out.
 */
export async function publishBoardMarker(): Promise<void> {
  try {
    const [config, goalRows, goalProgressByGoal] = await Promise.all([
      getOrCreateBoardConfig(),
      sql`SELECT EXISTS (
            SELECT 1 FROM tiles WHERE goal_kind IN ('xp', 'kc')
          ) AS has_goal_tiles`,
      getTeamGoalProgress(),
    ]);

    // Map<string, Map<number, number>> doesn't survive JSON.stringify — it
    // would serialise as {} — so flatten to plain objects here rather than
    // discovering an empty progress payload in production.
    const goalProgress: Record<string, Record<string, number>> = {};
    for (const [goal, byTeam] of goalProgressByGoal) {
      const teams: Record<string, number> = {};
      for (const [teamId, value] of byTeam) {
        teams[String(teamId)] = value;
      }
      goalProgress[goal] = teams;
    }

    const marker: BoardMarker = {
      bingoActive: config.bingo_active,
      boardChangedAt: config.board_changed_at,
      hasGoalTiles: Boolean(goalRows[0]?.has_goal_tiles),
      goalProgress,
      publishedAt: new Date().toISOString(),
    };

    const result = await put(MARKER_PATH, JSON.stringify(marker), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: MARKER_CACHE_SECONDS,
    });
    markerUrl = result.url;
  } catch (err) {
    console.error("board marker publish failed:", err);
  }
}

/** Never throws — a marker that can't be read is reported as absent, and the
 * caller falls back to Postgres. */
export async function readBoardMarker(): Promise<BoardMarker | null> {
  const url = await resolveMarkerUrl();
  if (!url) return null;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const parsed = (await res.json()) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as BoardMarker).bingoActive !== "boolean" ||
      typeof (parsed as BoardMarker).publishedAt !== "string"
    ) {
      return null;
    }
    return parsed as BoardMarker;
  } catch (err) {
    console.error("board marker read failed:", err);
    return null;
  }
}

export function isMarkerStale(marker: BoardMarker): boolean {
  const publishedAt = new Date(marker.publishedAt).getTime();
  if (!Number.isFinite(publishedAt)) return true;
  const backstop = marker.bingoActive ? BACKSTOP_ACTIVE_MS : BACKSTOP_IDLE_MS;
  return Date.now() - publishedAt > backstop;
}
