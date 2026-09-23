import { createHash } from "node:crypto";
import { invalidateByTag, waitUntil } from "@vercel/functions";
import type { VercelResponse } from "@vercel/node";
import { sql } from "./db.js";
import {
  type BoardConfigRow,
  getOrCreateBoardConfig,
  getTeamGoalProgress,
  maybeReconcileGoalProgress,
  pollCacheFallbackSeconds,
  secondsUntilGoalReconcileDue,
} from "./board.js";

/**
 * How the plugin poll, the board status check and the board itself are cached
 * at the CDN. Replaced the Blob "board marker" on 2026-09-23; see CLAUDE.md
 * ("The poll and the board are cached until something changes").
 *
 * Two mechanisms, one per kind of response:
 *
 * - **The poll** (`/api/plugin-poll`, `/api/board?resource=status`) is small,
 *   asked for constantly, and has to reflect changes promptly. It is cached
 *   until something actually changes, tagged `POLL_CACHE_TAG`, and every write
 *   that matters calls `notifyBoardChanged()` to purge that tag. Purging is not
 *   billed. While a board has xp/kc tiles the cache also expires exactly when
 *   the next hiscores pass is due, which is what triggers that pass.
 *
 * - **The board** is large and expensive, and is requested by version:
 *   `/api/board?v=<boardVersion>`, where the version comes from the poll. A
 *   version names one state of the board, so its render can be cached for a
 *   day without ever needing a purge, and a board is only rendered after it
 *   actually changed. It used to be cached for 60s regardless, and re-rendered
 *   from Postgres every time that window lapsed while anyone was looking,
 *   which measured at one full render every ~27s during a live event with one
 *   real change in six hours. Requests without a version (plugins older than
 *   this change) keep the old 60s window.
 */
export const POLL_CACHE_TAG = "board-poll";

/** While no event runs: nothing changes except via an admin write, which purges. */
const POLL_CDN_SECONDS_IDLE = 24 * 60 * 60;
/**
 * While an item-only event runs. Every change purges, so this is purely a net
 * under a purge that failed; long enough that it never becomes the thing that
 * keeps Neon awake.
 */
const POLL_CDN_SECONDS_ACTIVE = 6 * 60 * 60;
/** A versioned board never changes, so this is only a storage bound. */
export const VERSIONED_BOARD_CDN_SECONDS = 24 * 60 * 60;
/** When the database could not be read at all. Short, so recovery is quick. */
const DEGRADED_CDN_SECONDS = 30;

const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

/**
 * Whether this invocation can purge the CDN by tag.
 *
 * `invalidateByTag` from @vercel/functions resolves silently when the runtime
 * provides no purge API, so a long cache that depends on it would not fail, it
 * would freeze everyone's board for the length of the cache. Checked on every
 * response that relies on a purge, and falls back to the short time-based
 * windows when it is missing.
 */
export function canPurgeCdn(): boolean {
  const holder = (
    globalThis as unknown as Record<
      symbol,
      { get?: () => { purge?: unknown } } | undefined
    >
  )[REQUEST_CONTEXT];
  return Boolean(holder?.get?.()?.purge);
}

/**
 * Caches a response at Vercel's CDN only. Browsers always revalidate, so a
 * purge or a new version is never hidden behind a browser's own copy.
 */
export function setCdnCache(
  res: VercelResponse,
  seconds: number,
  tags: string[] = [],
): void {
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader(
    "Vercel-CDN-Cache-Control",
    `max-age=${Math.max(1, Math.round(seconds))}, stale-while-revalidate=60`,
  );
  if (tags.length > 0) res.setHeader("Vercel-Cache-Tag", tags.join(","));
  else res.removeHeader("Vercel-Cache-Tag");
}

/** Keeps a response out of every shared cache. */
export function setNoCdnCache(res: VercelResponse): void {
  res.setHeader("Cache-Control", "private, no-store");
  res.removeHeader("Vercel-CDN-Cache-Control");
  res.removeHeader("Vercel-Cache-Tag");
}

/**
 * Tells every cached poll that the board changed. Call after any write that
 * changes what the board shows or whether an event is running.
 *
 * Purged twice: a poll render that read the database just before this write
 * but finished just after the first purge would otherwise re-cache the old
 * state until its window runs out, and nothing would correct it.
 */
export async function notifyBoardChanged(): Promise<void> {
  const purge = () =>
    invalidateByTag(POLL_CACHE_TAG).catch((err: unknown) => {
      console.error("poll cache purge failed:", err);
    });
  await purge();
  waitUntil(new Promise((resolve) => setTimeout(resolve, 3000)).then(purge));
}

export interface PollState {
  config: BoardConfigRow;
  /** `{"xp:slayer": {"3": 1250000}}`, keys sorted so the version is stable. */
  goalProgress: Record<string, Record<string, number>>;
  /** Names this exact state of the board; see boardVersionOf. */
  boardVersion: string;
  /** Seconds until the next xp/kc pass is due, or null on an item-only board. */
  reconcileDueInSeconds: number | null;
}

let lastGoodState: PollState | null = null;

/**
 * Everything the poll and status responses carry, read from Postgres. Only
 * runs on a CDN miss. Runs the xp/kc hiscores pass when it is due.
 *
 * Never throws: on a database error it returns the last state this instance
 * read, marked degraded, so the poll can still answer with a cacheable 200
 * (Vercel's CDN does not cache errors, and an uncacheable poll turns every
 * polling plugin into a function invocation).
 */
export async function loadPollState(): Promise<{
  state: PollState | null;
  degraded: boolean;
}> {
  try {
    const config = await getOrCreateBoardConfig();
    let goalProgress: PollState["goalProgress"] = {};
    let reconcileDueInSeconds: number | null = null;

    if (config.bingo_active) {
      const goalRows = await sql`
        SELECT EXISTS (SELECT 1 FROM tiles WHERE goal_kind IN ('xp', 'kc'))
          AS has_goal_tiles`;
      if (goalRows[0]?.has_goal_tiles) {
        let reconciledAt = config.goal_reconciled_at;
        try {
          reconciledAt = (await maybeReconcileGoalProgress(reconciledAt))
            .reconciledAt;
        } catch (err) {
          // A failed pass must not take the poll down; it is retried when the
          // short cache below lapses.
          console.error("goal-progress reconciliation failed:", err);
          reconciledAt = null;
        }
        goalProgress = flattenGoalProgress(await getTeamGoalProgress());
        reconcileDueInSeconds = secondsUntilGoalReconcileDue(reconciledAt);
      }
    }

    const state: PollState = {
      config,
      goalProgress,
      boardVersion: boardVersionOf(config, goalProgress),
      reconcileDueInSeconds,
    };
    lastGoodState = state;
    return { state, degraded: false };
  } catch (err) {
    console.error("poll state read failed, serving last known state:", err);
    return { state: lastGoodState, degraded: true };
  }
}

/** Sets the CDN window for a poll or status response rendered from `state`. */
export function cachePollResponse(
  res: VercelResponse,
  state: PollState | null,
  degraded: boolean,
): void {
  if (!state || degraded) {
    setCdnCache(res, DEGRADED_CDN_SECONDS);
    return;
  }
  const active = state.config.bingo_active;
  const purgeable = canPurgeCdn();
  // Visible with curl: "fallback" means the long, purge-driven windows are off
  // and this is running on the short time-based ones.
  res.setHeader("X-Poll-Cache", purgeable ? "until-changed" : "fallback");
  if (!purgeable) {
    setCdnCache(res, pollCacheFallbackSeconds(active), [POLL_CACHE_TAG]);
    return;
  }
  if (!active) {
    setCdnCache(res, POLL_CDN_SECONDS_IDLE, [POLL_CACHE_TAG]);
    return;
  }
  if (state.reconcileDueInSeconds !== null) {
    setCdnCache(
      res,
      Math.min(3600, Math.max(60, state.reconcileDueInSeconds)),
      [POLL_CACHE_TAG],
    );
    return;
  }
  setCdnCache(res, POLL_CDN_SECONDS_ACTIVE, [POLL_CACHE_TAG]);
}

/**
 * A short name for one exact state of everything the board response shows.
 * Covers board_changed_at (submissions, tiles, teams, rosters - maintained by
 * triggers, see db/schema.sql), the config fields the board renders or is
 * gated on, and the xp/kc totals, which change without touching
 * board_changed_at.
 */
function boardVersionOf(
  config: BoardConfigRow,
  goalProgress: PollState["goalProgress"],
): string {
  return createHash("sha1")
    .update(
      JSON.stringify([
        config.board_changed_at,
        config.bingo_active,
        config.board_visible,
        config.name,
        config.size,
        goalProgress,
      ]),
    )
    .digest("base64url")
    .slice(0, 16);
}

function flattenGoalProgress(
  byGoal: Map<string, Map<number, number>>,
): PollState["goalProgress"] {
  const out: PollState["goalProgress"] = {};
  for (const goal of [...byGoal.keys()].sort()) {
    const byTeam = byGoal.get(goal)!;
    const teams: Record<string, number> = {};
    for (const teamId of [...byTeam.keys()].sort((a, b) => a - b)) {
      teams[String(teamId)] = byTeam.get(teamId)!;
    }
    out[goal] = teams;
  }
  return out;
}
