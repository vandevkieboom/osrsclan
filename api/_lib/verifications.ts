import type { VercelResponse } from "@vercel/node";
import { invalidateByTag, waitUntil } from "@vercel/functions";
import { sql } from "./db.js";
import { SITE_ORIGIN, canPurgeCdn, setCdnCache } from "./board-cache.js";

/**
 * Manually-verified rank items, read from a CDN-cached snapshot instead of
 * Postgres (2026-10-05, replacing the Blob marker in verifications-marker.ts).
 *
 * **Why it exists.** `!rank`/`!needed`, the plugin's once-a-day RuneProfile
 * check for every member, the bot's `/rank` and the website's Clan Ranks
 * search all need this table. Reading it from Postgres on each of those keeps
 * Neon awake around the clock with no event running.
 *
 * **Why not Blob any more.** The previous copy lived in the Blob store that
 * also holds bingo proof screenshots. A bingo pushed that store over its Hobby
 * quota and Vercel suspended it (2026-09-24); every read then fell back to
 * Postgres, twice per call because the fallback also tried to republish, and
 * kept Neon awake for weeks after the event without anyone noticing, since
 * every answer was still correct. The CDN has no such quota (only Edge
 * Requests, which the Blob read cost too), and it's the same purge-on-write
 * pattern the bingo poll uses (_lib/board-cache.ts).
 *
 * **How.** `GET /api/profile?resource=verified-items-snapshot` renders the
 * whole table (a handful of rows) and is cached at the CDN for a day, tagged
 * `VERIFICATIONS_CACHE_TAG`. Admin writes purge the tag. Readers fetch that
 * URL, so Postgres is read about once a day per CDN region, plus once after
 * each admin change. Without a purge API it falls back to a short window.
 */

export const VERIFICATIONS_CACHE_TAG = "verifications";

const SNAPSHOT_CDN_SECONDS = 24 * 60 * 60;
// Without a purge API an admin change would otherwise take a day to show.
const SNAPSHOT_FALLBACK_SECONDS = 5 * 60;
// One warm instance answering a burst of lookups asks the CDN once.
const INSTANCE_MEMO_MS = 60 * 1000;

const SNAPSHOT_URL = `${SITE_ORIGIN}/api/profile?resource=verified-items-snapshot`;

interface Snapshot {
  /** rsn_key -> that member's manually-verified (lowercased) item names. */
  byRsn: Record<string, string[]>;
  renderedAt: string;
}

let memo: { snapshot: Snapshot; at: number } | null = null;

/** The snapshot endpoint: the whole table, cached at the CDN until changed. */
export async function renderVerificationsSnapshot(res: VercelResponse) {
  const rows = await sql`SELECT rsn_key, item_name FROM manual_item_verifications`;
  const byRsn: Record<string, string[]> = {};
  for (const row of rows) {
    (byRsn[row.rsn_key as string] ??= []).push(row.item_name as string);
  }
  // Set only after the read succeeded: an error response must not be cached,
  // and Vercel's CDN doesn't cache errors anyway.
  setCdnCache(
    res,
    canPurgeCdn() ? SNAPSHOT_CDN_SECONDS : SNAPSHOT_FALLBACK_SECONDS,
    [VERIFICATIONS_CACHE_TAG],
  );
  const snapshot: Snapshot = { byRsn, renderedAt: new Date().toISOString() };
  res.status(200).json(snapshot);
}

/**
 * Call after any admin add/remove. Purges twice, 3s apart, for the same
 * reason as notifyBoardChanged: a render that read the table just before the
 * write but finished just after the first purge would otherwise re-cache the
 * old list for a day.
 */
export async function notifyVerificationsChanged(): Promise<void> {
  memo = null;
  const purge = () =>
    invalidateByTag(VERIFICATIONS_CACHE_TAG).catch((err: unknown) => {
      console.error("verifications cache purge failed:", err);
    });
  await purge();
  waitUntil(new Promise((resolve) => setTimeout(resolve, 3000)).then(purge));
}

async function fetchSnapshot(): Promise<Snapshot | null> {
  if (memo && Date.now() - memo.at < INSTANCE_MEMO_MS) return memo.snapshot;
  try {
    const r = await fetch(SNAPSHOT_URL, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const parsed = (await r.json()) as Snapshot;
    if (typeof parsed?.byRsn !== "object" || parsed.byRsn === null) return null;
    memo = { snapshot: parsed, at: Date.now() };
    return parsed;
  } catch (err) {
    console.error("verifications snapshot read failed:", err);
    return null;
  }
}

/**
 * The one function every reader calls. Falls back to a direct, single-RSN
 * Postgres read only when the snapshot can't be fetched at all, so a CDN
 * hiccup costs a database read rather than a wrong answer.
 */
export async function getVerifiedItemNames(rsnKey: string): Promise<Set<string>> {
  const snapshot = await fetchSnapshot();
  if (snapshot) return new Set(snapshot.byRsn[rsnKey] ?? []);
  const rows = await sql`
    SELECT item_name FROM manual_item_verifications WHERE rsn_key = ${rsnKey}`;
  return new Set(rows.map((r) => r.item_name as string));
}
