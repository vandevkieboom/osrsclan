# osrsclan — context for continuing this work

Companion website for the Time Served OSRS clan (React+Vite frontend,
Vercel serverless functions in `api/`, Postgres via `@neondatabase/serverless`).
Talks to the RuneLite plugin in the sibling `osrsclanplugin` repo via
`plugin_tokens` bearer-auth (see `api/_lib/auth.ts`).

## Recent work (already merged to `main` and pushed)

**Goal-progress reconciliation** (`api/_lib/board.ts`: `reconcileGoalProgress`,
`maybeReconcileGoalProgress`, `fetchWomStatsByRsnKey`) — `goal_progress`
(team-combined XP/KC tracking) used to trust the plugin's live push as the
*only* source of truth, with no way to recover from a missed chat line, a
client that quit mid-event, or — the big one — a mobile-only player, who can
never generate a report at all (no RuneLite on mobile). This adds a
self-correcting backstop against real WOM hiscores:

- Only ever *raises* `latest_value`, never lowers it, never touches
  `baseline_value` — same rule `recordGoalProgress` already followed.
- Also *seeds* a starting baseline for a team member an active tile should
  track but who has zero rows yet, using their current hiscores reading —
  same "nothing backdated" rule a first-ever plugin report already gets.
- Triggered from `GET /api/board` itself (throttled to once per 10 min via
  `board_config.goal_reconciled_at`), not a fixed cron — Vercel Hobby only
  allows daily crons, which could run *after* an event's deadline. Riding
  along on real traffic (the plugin polls every ~1 min) keeps it correcting
  right up to a deadline instead.
- Capped at 60 writes per pass (`MAX_WRITES_PER_PASS`) so a big first
  catch-up can't time out the function — leftover work just gets picked up
  by the next throttled pass a few minutes later.

## Open decision — not yet actioned

A dry run against the real DB showed **318 rows would be seeded** the first
time this actually runs against the current live board (40 members × 8
active xp/kc tiles, minus 2 that already exist). That's correct, not a bug —
most members have simply never had a `goal_progress` row at all. But it's a
one-time, highly visible jump in every team's displayed KC/XP progress the
moment it happens, and whoever it seeds effectively starts their tracking
clock "now" rather than whenever the board actually began. **This hasn't
been triggered yet on purpose** — it's a fairness/timing call (announce it
first? does it matter given how small the current targets are?), not a
technical blocker. It'll happen automatically and gradually the next time
`GET /api/board` is hit after deploy, 60 rows at a time — if you want to
hold it off longer, that needs a deliberate decision, not code.

## Also fixed this session, worth knowing

- A verification-codeword feature was attempted, found to leak through
  `GET /api/board` (no auth required on that endpoint), and reverted in
  favor of a plugin-side-only manual config value. See the sibling
  `osrsclanplugin` repo's `CLAUDE.md` for the corrected version.
- An `lfg_posts` table from an earlier, separately-reverted LFG feature was
  found still orphaned in the live database (revert had removed the
  `CREATE TABLE` from `schema.sql` but never dropped the actual table) —
  cleaned up with an explicit `DROP TABLE`.
