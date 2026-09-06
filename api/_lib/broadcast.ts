import { put } from "@vercel/blob";

/**
 * The clan-wide admin broadcast, reintroduced 2026-09-07 using the same
 * pattern as the board marker (_lib/board-marker.ts) instead of the Postgres
 * column it used to be.
 *
 * The first version of this feature stored the message as a column on
 * board_config, so every one of the ~100+ installed plugins checking it once
 * a minute was a real database read — the single biggest reason Neon's
 * compute never suspended. It was removed entirely rather than cached harder,
 * because caching only reduces cost *per check*, not the fact that a check
 * happened on a timer at all.
 *
 * This version never touches Postgres. The message lives as a small public
 * file on Blob, and the plugin reads that file **directly** — no Vercel
 * function sits in front of it — so every install can check it every minute,
 * for every member, whether or not they've ever touched bingo, at a cost of
 * essentially nothing on any meter. That is the property broadcast actually
 * needs and bingo_active-gated endpoints don't have: this has to reach
 * everyone, not just participants.
 */

const BROADCAST_PATH = "broadcast.json";
const BROADCAST_CACHE_SECONDS = 60; // Blob's own floor.

export interface Broadcast {
  message: string | null;
  updatedAt: string;
}

/**
 * Overwrites the broadcast. `message: null` clears it - the file still gets
 * rewritten (with a null message and a fresh updatedAt) rather than deleted,
 * so a plugin that already showed the last message doesn't keep re-showing it
 * from a stale cached copy; it sees the update and simply displays nothing.
 */
export async function publishBroadcast(message: string | null): Promise<void> {
  const broadcast: Broadcast = {
    message: message && message.trim() ? message.trim() : null,
    updatedAt: new Date().toISOString(),
  };
  await put(BROADCAST_PATH, JSON.stringify(broadcast), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: BROADCAST_CACHE_SECONDS,
  });
}
