# osrsclan — context for continuing this work

Companion website for the Time Served OSRS clan (React+Vite frontend,
Vercel serverless functions in `api/`, Postgres via `@neondatabase/serverless`).
Talks to the RuneLite plugin in the sibling `osrsclanplugin` repo via
`plugin_tokens` bearer-auth (see `api/_lib/auth.ts`).

## Hosting cost — the incident, and the shape of the fix

In late August 2026 the site went down: every database-backed endpoint
returned 500, and Vercel's compute usage went from ~4 minutes a day to
~18, hitting the plan cap. The two looked like separate problems. They
were one problem, and understanding the order matters more than any
individual fix below.

**What actually happened, in order:**

1. Every online plugin made **three** requests a minute, forever, and did
   so whether or not the player was even logged in: `/api/board?resource=status`,
   `/api/runeprofile-proxy?resource=broadcast`, and `/api/twitch-live`. That
   is ~4,300 requests per member per day at rest. Two of the three hit
   Postgres, and `getOrCreateBoardConfig()` was an `INSERT ... ON CONFLICT
   DO UPDATE` — so they were *writes*, tens of thousands a day, all to the
   same single row.
2. Because that traffic never stopped, the database's compute never
   idled, and its monthly compute quota ran out. It began answering
   every query with `402: exceeded the compute time quota`.
3. Every database-backed endpoint therefore returned **500**. And Vercel's
   edge **does not cache an error response**. So the endpoints that had
   been serving most polls from cache stopped caching entirely, and every
   single poll from every online member was promoted into a real function
   invocation.
4. That is what burned the hosting compute quota. The hosting bill was a
   *symptom* of the database bill, amplified by the cache collapsing at
   exactly the moment it was most needed.

**The load reduction** (in rough order of how much it removes):

- `GET /api/plugin-poll` (`api/plugin-poll.ts`) merges the three
  per-minute plugin requests into one, cutting the plugin's request
  volume by two thirds at identical freshness — they were always fetched
  on the same tick anyway. It is anonymous and byte-identical for every
  caller *on purpose*: that is what lets one edge cache entry serve the
  whole clan. Never add a key or a player name to it; per-member cache
  entries are the same as no cache.
- The plugin no longer polls at all while logged out (`BingoPlugin#poll`).
  Every result it fetches is delivered as an in-game chat message or an
  in-game board, so polling at the login screen was buying nothing.
- `board_changed_at` (`db/schema.sql`) lets the plugin skip the expensive
  board fetch entirely on ticks where nothing has changed. It is
  maintained by **triggers**, not by a `bump()` call at each of the ~20
  places that write to those tables, deliberately: a missed call site is
  invisible in testing and shows up in production as a board that
  silently never updates.
- `getOrCreateBoardConfig()` reads before it writes, and only writes in
  the genuinely-missing case it was written for.
- `plugin_tokens.last_used_at` is written at most hourly per token
  instead of on every authenticated request.
- The Twitch app token (`api/_lib/twitch.ts`) and the WOM clan roster
  (`api/runeprofile-proxy.ts`) are memoised per warm instance instead of
  re-fetched on every single request that needs them.

**The board fetch: one shared copy, not one per member.** `GET /api/board`
is the most expensive response the site produces, and during an event every
online plugin wants it again every time anything changes — so one person's
drop cost one full board render *per online member*. It is now byte-identical
for every caller and edge-cached: no session is read and no `myTeamId` is
returned, which is exactly what lets a single render answer everybody.
Nothing became more public in the process; this endpoint never required
authentication and every team's board was already readable by anyone. Who
"you" are now comes from `useAuth().user.team` on the website and from
`?resource=my-team` (once a session) in the plugin. `?view=plugin` strips the
per-proof blob and avatar URLs the plugin's parser was already discarding —
most of the payload, once an event has real submissions on it.

**The clan is two audiences, and it matters more than the event does.** A
bingo runs a few times a year; the rest of the time several hundred people run
the plugin purely for the chat commands and the live-stream/broadcast notices.
That idle state is where nearly all of the year's requests go, simply because
it is nearly all of the year — so it gets the cheap treatment (a 5-minute
poll, no board fetches at all, no team lookups), and an event gets the
expensive one.

Crucially the split is per *member*, not per *period*: `/api/plugin-poll`
returns both `pollSeconds` and `participantPollSeconds`, and the plugin picks
the fast one only while it is genuinely on a team. Someone who isn't in the
bingo sees nothing different during an event, so putting them on the fast
cadence would spend most of the event's budget on people who cannot tell.
Likewise the plugin doesn't fetch the board at all for a member who is not on
a team and doesn't have the panel open — there is nothing they could do with
it, since the server refuses submissions from a member with no team anyway.
That decision has to be client-side: this response is one cached copy shared
by the whole clan, so it cannot know who is asking.

**Two dials, and they do different things.** This is the part to get right
when usage runs hot, because the obvious move is often the useless one:

| Meter running hot | Change | Why |
|---|---|---|
| Edge Requests | `PLUGIN_POLL_SECONDS_ACTIVE` (poll interval) | Edge requests are billed on cache hits too, so caching cannot help this meter. Only asking less often can. Scales with member count. |
| Active CPU / Invocations | `PLUGIN_POLL_CACHE_SECONDS` (cache window) | Once every cache window ends in a miss somewhere, how often the function *runs* is set by (CDN locations x 60/window) and stops depending on member count entirely. Twice the members costs the same compute. |

Both are environment variables on the Vercel project, deliberately: quotas are
monthly and hard, going over takes the site down for everyone until the month
rolls over, and plugin installs update whenever they feel like it. A number
compiled into the plugin is a number that cannot be corrected in time.

**Where the ceiling actually is.** The Hobby plan allows 1,000,000 edge
requests a month, which is 0.386 requests per second for everything, all
month, and no amount of caching moves that number — a cache hit is still a
billed request. Modelled against every meter, with the defaults as shipped:

- **No event running:** comfortable to roughly 80 simultaneously-online
  plugins. A few hundred installs sitting on the chat commands and
  notifications year-round is not the problem, and does not need to be
  rationed.
- **During an event:** roughly 50 simultaneously-online plugins with a
  quarter of them competing, or 40 with half. Past that, raise
  `PLUGIN_POLL_SECONDS_ACTIVE` — 90s buys about a third more, 120s about a
  half.

Those figures carry real uncertainty; the least certain input is CPU per
invocation (~12ms, taken from this project's own observability). Treat them as
the right order of magnitude, not a guarantee, and watch the usage page during
the first days of an event rather than trusting the model.

**The resilience fix, which matters more than any of the above.** The
step that turned a database problem into a total outage was step 3: a
heavily-polled endpoint answering 5xx, and therefore becoming
uncacheable, and therefore multiplying its own load. So the hot poll
endpoints now **never answer with an error and always set their cache
header before doing any work that could fail**. When the database is
unreachable they serve last-known values with a `degraded: true` flag
and a normal 200. The plugin sits still on a degraded response rather
than acting on numbers it can't trust, and backs off exponentially (up
to 15 minutes) on outright failures, so a struggling site gets quieter
rather than louder.

`degraded` deliberately reports `bingoActive: false` when there is no
last-known value at all, inverting the fail-open default used elsewhere.
The only thing a plugin does with `bingoActive: true` is start fetching
the board — and if the database is down that fetch can't succeed either,
so failing open during an outage buys nobody a working board and just
adds a second failing request per member per minute.

**Freshness was not traded away for any of this**, and shouldn't be:
this clan's whole reason for having a plugin and a site is that the
board and the ranks are live. The plugin still ticks once a minute, edge
cache windows are 30-60s, and a real board change is still picked up on
the very next tick. What was removed is re-fetching *identical* answers,
not the speed at which *new* ones arrive. If load ever needs cutting
again, cache and de-duplicate harder before slowing any poll interval
down.

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
  on `GET /api/plugin-poll` traffic — and on `GET /api/board` too, but that
  is now the secondary trigger, see the note in that function) and from the
  `?type=goal-reconcile` cron fallback in `api/wom-proxy.ts` for
  zero-traffic periods.

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

## `bingo_active` — a cheap status ping, decoupled from the expensive board fetch

The RuneLite plugin (`osrsclanplugin`) is a general clan tool, not a
bingo-only one — most members keep it running for `!verify`/`!live`,
clan broadcasts, and live-stream notifications whether or not a bingo
event exists. Before this, its board refresh polled `GET /api/board`
every minute forever regardless, which is real, ongoing load (tiles +
teams + submissions queries) against Vercel's (free-tier) invocation
quota for something that's often not even running.

`board_config.bingo_active` (admin-toggleable from the Board Config
panel, `BoardConfigPanel`) lets an admin explicitly say "no event right
now." An earlier version of this had the plugin back its *full* board
poll down to once per 30 minutes while inactive — simple, but meant
turning an event back on could take up to 30 minutes to be noticed,
which is exactly backwards (re-activating is the moment you want picked
up fast). The actual fix: `GET /api/board?resource=status` is a second,
deliberately tiny endpoint that returns *only* `{ bingoActive }`, backed
by `Cache-Control: s-maxage=30` — cheap enough that the plugin can poll
it every single minute regardless of activity, for practically free.
The plugin polls this every tick unconditionally, and only runs the
*expensive* `GET /api/board` fetch (tiles/teams/submissions) on ticks
where the cheap ping says an event is genuinely active. So: near-zero
bingo-related cost while inactive, and reactivating is noticed within
about a minute, not 30 — a strictly better trade than the interval-based
backoff it replaced. Defaults `true` (fail-open) throughout: a
missing/old field must never silently look like "inactive."

Deliberately does **not** touch `!verify`/`!live`/broadcast/live-stream
checks — those stay on their normal 1-minute cadence regardless of
`bingo_active`, since they're general clan features whose promptness
people actually notice, not bingo-specific.

**Partly superseded** — the reasoning above still holds, but the cheap
ping is no longer its own request. `GET /api/plugin-poll` now carries
`bingoActive` alongside the broadcast and live-stream answers the plugin
was fetching separately on the same tick, so what used to be three
requests a minute is one. `GET /api/board?resource=status` still exists
and still works, for plugin installs that haven't updated yet. It also
now carries `boardChangedAt`, which lets the plugin skip even the
expensive board fetch on ticks where nothing changed — the gate this
section describes was "is an event on", and that is now "is an event on
*and* has anything actually moved". See the hosting-cost section at the
top.

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

**Superseded for updated plugins** — the broadcast now arrives as part of
`GET /api/plugin-poll` rather than as its own request, and this endpoint
is kept working for older installs. The instinct recorded above (cache
harder rather than poll slower) turned out to be right but not
sufficient on its own: edge caching only helps once there are more
clients than edge locations, and it does nothing at all about *request
count*, which is metered separately from compute. Merging requests
attacks both at once. See the hosting-cost section at the top.

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
