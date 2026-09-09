import { head, put } from "@vercel/blob";
import { sql } from "./db.js";

/**
 * Manually-verified rank items, kept in Vercel Blob instead of Postgres for
 * every *read* — the same pattern as `board-marker.ts`, applied to a much
 * smaller, much less frequently written table.
 *
 * **The problem this exists to solve.** `!rank`/`!needed` and the website's
 * own Clan Ranks search both read `manual_item_verifications` on every single
 * call, and the RuneProfile-sync reminder runs the same read once per member
 * per day automatically — confirmed live to be the last remaining reason
 * Neon wakes up year-round with no bingo running at all. The table itself
 * changes only when an admin manually confirms an item from a screenshot,
 * which is a handful of times a month at most.
 *
 * **What changes.** Only where the *read* comes from. The table stays the
 * source of truth in Postgres — admin writes still go there first — but a
 * flat `{rsnKey: itemNames[]}` snapshot is republished to Blob after every
 * write, and every read-heavy caller (`!rank`, `!needed`, the website search)
 * reads that snapshot instead. A clan's total verified-item count is small
 * enough that republishing the *whole* table on every write, rather than
 * patching one entry, is simpler and still cheap.
 *
 * **Why one backstop window, not two.** The board marker needs an active/idle
 * split because "nothing changed" is its normal resting state during a whole
 * multi-week event. This table has no such state — it only ever changes on a
 * rare, explicit admin action, which republishes on the spot. So a stale
 * marker here only ever means a missed publish (a crashed request, a Blob
 * hiccup), not a normal condition to design around. One generous window is
 * enough: it exists purely as a net for that failure, not a schedule anything
 * depends on.
 */

const MARKER_PATH = "verifications/marker.json";

// Blob's own floor.
const MARKER_CACHE_SECONDS = 60;

// Purely a net for a missed publish (see the file doc above) — not a real
// schedule, so it can afford to be generous. 24h comfortably outlasts any
// realistic gap between an admin's write and someone actually reading it.
const BACKSTOP_MS = 24 * 60 * 60 * 1000;

export interface VerificationsMarker {
  /** rsn_key -> that member's manually-verified (lowercased) item names. */
  byRsn: Record<string, string[]>;
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
    // Not published yet (first deploy, or the store was cleared). Callers
    // fall back to Postgres, and the next write republishes it.
    return null;
  }
}

/**
 * Rewrites the marker from the full `manual_item_verifications` table.
 *
 * Call this after any admin add/remove. Always called from a request that
 * just wrote to Postgres anyway, so this costs nothing in the terms that
 * actually matter — same reasoning as `publishBoardMarker`.
 *
 * Never throws — a failed publish must not fail the admin action that
 * triggered it. The backstop above turns a missed publish into "stale for a
 * while, then Postgres is consulted directly again" rather than a permanently
 * wrong answer.
 */
export async function publishVerificationsMarker(): Promise<void> {
  try {
    const rows = await sql`SELECT rsn_key, item_name FROM manual_item_verifications`;
    const byRsn: Record<string, string[]> = {};
    for (const row of rows) {
      const key = row.rsn_key as string;
      (byRsn[key] ??= []).push(row.item_name as string);
    }

    const marker: VerificationsMarker = {
      byRsn,
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
    console.error("verifications marker publish failed:", err);
  }
}

/** Never throws — a marker that can't be read is reported as absent, and the
 * caller falls back to Postgres. */
export async function readVerificationsMarker(): Promise<VerificationsMarker | null> {
  const url = await resolveMarkerUrl();
  if (!url) return null;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const parsed = (await res.json()) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as VerificationsMarker).byRsn !== "object" ||
      typeof (parsed as VerificationsMarker).publishedAt !== "string"
    ) {
      return null;
    }
    return parsed as VerificationsMarker;
  } catch (err) {
    console.error("verifications marker read failed:", err);
    return null;
  }
}

function isMarkerStale(marker: VerificationsMarker): boolean {
  const publishedAt = new Date(marker.publishedAt).getTime();
  if (!Number.isFinite(publishedAt)) return true;
  return Date.now() - publishedAt > BACKSTOP_MS;
}

/**
 * The one function `!rank`/`!needed` and the website search actually call.
 * Serves from the Blob marker when it's present and fresh; falls back to a
 * direct, single-RSN Postgres read otherwise (missing/stale marker) so a
 * broken publish degrades to "back to the old cost, temporarily" rather than
 * a wrong answer.
 */
export async function getVerifiedItemNames(rsnKey: string): Promise<Set<string>> {
  const marker = await readVerificationsMarker();
  if (marker && !isMarkerStale(marker)) {
    return new Set(marker.byRsn[rsnKey] ?? []);
  }
  const rows = await sql`
    SELECT item_name FROM manual_item_verifications WHERE rsn_key = ${rsnKey}`;
  return new Set(rows.map((r) => r.item_name as string));
}
