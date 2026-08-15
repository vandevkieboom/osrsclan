# osrsclan — context for continuing this work

Companion website for the Time Served OSRS clan (React+Vite frontend,
Vercel serverless functions in `api/`, Postgres via `@neondatabase/serverless`).
Talks to the RuneLite plugin in the sibling `osrsclanplugin` repo via
`plugin_tokens` bearer-auth (see `api/_lib/auth.ts`).

## Goal-progress tracking (XP/KC tiles) — hiscores-only, explicit-seeding design

`goal_progress` (team-combined XP/KC tracking, `tiles.goal_kind IN ('xp',
'kc')`) is tracked **entirely from Wise Old Man hiscores** — the plugin
sends nothing for these tiles at all, not even a chat-parsed reading. This
replaced an earlier live-push design (plugin parsed kill-count chat lines
and pushed skill XP readings directly) that was scrapped after real testing
showed it was fundamentally unreliable: the first kill of a kill-count tile
sometimes never counted, xp tiles sometimes silently created a baseline
mid-session (crediting a member's already-gained xp as "progress"), and a
board reset sometimes didn't re-seed every member at once. The root cause in
all three cases was the same: baselines were being set **implicitly**,
whenever a plugin's report happened to be the first one seen for that
(member, goal), staggered across whenever each person's client happened to
next report — never explicitly, never synchronously for the whole team.

The fix (`api/_lib/board.ts`) splits what used to be one mixed
correction+seeding function into two single-purpose ones:

- **`seedGoalBaselines(womByRsnKey, goals)`** — the only thing that ever
  creates or resets a `goal_progress` row. Unconditionally overwrites both
  `baseline_value` and `latest_value` from a fresh hiscores read, for every
  current team member on the given goals, in one bulk upsert. Only ever
  called from a deliberate action: `resetBingoProgress()` (full board reset)
  and `seedNewGoalTile()` in `api/admin/board.ts` (a tile's goal is created
  or changed to xp/kc). This is what makes "everyone's starting line is the
  same moment" actually true — no more staggered-by-whoever's-plugin-reported
  baselines.
- **`refreshGoalLatestValues(womByRsnKey)`** — correction-only backstop.
  Only ever *raises* `latest_value` on rows that already exist; never lowers
  it, never touches `baseline_value`, never creates a row. Called from
  `maybeReconcileGoalProgress()` (throttled to once per 2 min, riding along
  on `GET /api/board` traffic) and from the `?type=goal-reconcile` cron
  fallback in `api/wom-proxy.ts` for zero-traffic periods.

Both are single Postgres round trips via `unnest()`-based bulk
INSERT/UPDATE, regardless of team size — no per-row awaited loop, so seeding
or correcting an entire roster at once can't approach Vercel's function
timeout.

There is no plugin-facing write endpoint for goal progress anymore —
`POST /api/board?resource=goal-progress` and `recordGoalProgress` were
removed entirely, since a live "arbitrary progress write" endpoint would
have defeated the point of moving to a hiscores-only source of truth (it
would still let anyone with a plugin key spoof a huge value directly). See
`osrsclanplugin/CLAUDE.md` for the plugin-side half of this same rework.

## `bingo_active` — letting the plugin back off when no event is running

The RuneLite plugin (`osrsclanplugin`) is a general clan tool, not a
bingo-only one — most members keep it running for `!verify`/`!live`,
clan broadcasts, and live-stream notifications whether or not a bingo
event exists. Before this, its board refresh polled `GET /api/board`
every minute forever regardless, which is real, ongoing load against
Vercel's (free-tier) invocation quota for something that's often not even
running.

`board_config.bingo_active` (admin-toggleable from the Board Config
panel, `BoardConfigPanel`) lets an admin explicitly say "no event right
now." `getBoard` and the admin config endpoint both return it as
`bingoActive`. The plugin reads it and, once it sees `false`, backs its
board-specific polling down to once per 30 minutes instead of once per
minute (see `BingoPlugin#maybeRefreshBoard` in the sibling repo) — a
~30x cut for however long an event isn't running, which for a clan that
runs occasional bingo events is most of the time. Defaults `true`
(fail-open): a missing/old field must never silently look like
"inactive," since that would just look like the board mysteriously
stopped updating with no visible cause.

Deliberately does **not** touch `!verify`/`!live`/broadcast/live-stream
checks — those stay on their normal 1-minute cadence regardless of
`bingo_active`, since they're general clan features whose promptness
people actually notice, not bingo-specific.

## Broadcast endpoint caching

`GET /api/runeprofile-proxy?resource=broadcast` (backs the plugin's
"Clan broadcasts" toggle) had **no response caching at all** despite
every online plugin polling it once a minute, unauthenticated, forever —
found while looking into general plugin request volume. Fixed with the
same `Cache-Control: s-maxage=60, stale-while-revalidate=30` pattern
`api/twitch-live.ts` already used for its live-stream check: Vercel's
edge now serves most of those polls without invoking the function or
touching the database, since a broadcast (an admin posting a message a
handful of times a month) tolerates being up to ~60-90s stale far more
easily than it tolerates the previous zero-caching cost. This is the
preferred lever over slowing down client poll intervals — it decouples
"how often each client checks" from "how many times the backend actually
runs," rather than trading delay for request volume directly.

## Scope / design philosophy — bingo tiles

Tile types are staying to exactly three on purpose: **item drops,
team-combined boss KC, team-combined skill XP** (`tiles.goal_kind IN
('item', 'xp', 'kc')`). This was a deliberate decision after comparing
against a more feature-rich reference plugin ("Anvil" — see
`osrsclanplugin`'s `CLAUDE.md` for the full comparison and everything
explicitly declined from it: CA/diary/timed-clear/item-gain/loot-value
tiles, weekly competitions, multi-clan federation, a points/tiers system).
Don't propose expanding `goal_kind` or adding new tile shapes without
checking that this scope call still stands — it isn't a placeholder, it's
"keep it simple" chosen on purpose for this clan's size.

## Also fixed previously, worth knowing

- A verification-codeword feature was attempted, found to leak through
  `GET /api/board` (no auth required on that endpoint), and reverted in
  favor of a plugin-side-only manual config value. See the sibling
  `osrsclanplugin` repo's `CLAUDE.md` for the corrected version.
- An `lfg_posts` table from an earlier, separately-reverted LFG feature was
  found still orphaned in the live database (revert had removed the
  `CREATE TABLE` from `schema.sql` but never dropped the actual table) —
  cleaned up with an explicit `DROP TABLE`.
