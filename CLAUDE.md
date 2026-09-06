# osrsclan — context for continuing this work

Companion website for the Time Served OSRS clan (React+Vite frontend,
Vercel serverless functions in `api/`, Postgres via `@neondatabase/serverless`).
Talks to the RuneLite plugin in the sibling `osrsclanplugin` repo via
`plugin_tokens` bearer-auth (see `api/_lib/auth.ts`).

## Tile icons and item requirements (AND/OR item conditions)

Two related additions, written 2026-09-06, reviewed and bug-fixed before
shipping the same day — not documented at the time they were written, which
is itself why the bugs sat unnoticed.

**Shared icon derivation** (`api/_lib/icons.ts`, `deriveTileIconUrl()`):
priority chain — a skill icon for xp-goal tiles (`SKILL_ICON_FILES`, keep in
sync with the plugin's `BingoPanel#SKILL_SPRITES`) → `item_ids[0]` → the
legacy `icon_url` — used by every surface that renders a tile icon
(`api/board.ts`, `api/admin/board.ts`, `api/admin/submissions.ts`), so the
website and the RuneLite plugin can no longer disagree on a tile's picture
the way they used to.

An explicit per-tile icon override (`tiles.icon_item_id`, an admin-set OSRS
item id) was part of the original design, shipped, then **removed the same
day**: its whole purpose — picking a specific item's picture instead of
whatever's first in the list — is already achievable for free by reordering
`item_ids`, since that's exactly what the fallback above already does. The
override was a second field doing a job the first field already did, at
the cost of a database column, an admin input, and a value that has to
travel correctly from the website to the plugin (which, per bug 2 below, it
initially didn't). Don't reintroduce it without a concrete case the
reorder-the-list approach genuinely can't cover.

**Item requirements** (`tiles.item_requirements JSONB`, nullable — `NULL`
means "ignore, use the old flat `item_ids`/`required_count`/
`require_unique_items` fields"): entries with no `group` are AND'd, entries
sharing a `group` are OR'd (any one full set completes the tile). See
`parseItemRequirements`/`evaluateItemRequirements`/`checkItemRequirements`
in `api/_lib/board.ts`, and `validateProofSubmission`'s new branch there.

**Bugs found in review and fixed before this shipped:**
1. `api/board.ts`'s per-tile item counting included `pending` submissions,
   not just `approved` — meaning an unreviewed screenshot already turned the
   tile green and moved team standings, unlike every other tile type. Fixed
   to `approved`-only.
2. `buildSlimTile()` in `api/board.ts` (the projection the RuneLite plugin
   actually fetches via `?view=plugin`) never carried the (since-removed)
   icon override field at all — so it had zero effect in-game despite
   working correctly on the website's own board view, the same day it was
   removed for being redundant anyway. A live example of why a field that
   has to travel between two repos needs a test that actually crosses the
   wire, not just a same-repo one.
3. The admin hint text for item requirements said it "overrides" the Item
   IDs field, which invited leaving that field empty — but the plugin's
   drop-detection watch list (`tilesByItemId` in `BingoPlugin.java`) only
   ever reads `item_ids`, not `item_requirements`, so an admin following that
   hint would silently disable auto-submission for that tile. Hint text
   corrected to say Item IDs must still be kept populated.

**Plugin-side status**: the skill-icon rendering (`BingoPanel.java`'s
rewritten `loadIconInto()`, the new `SKILL_SPRITES` map) is reviewed and
ready but not committed alongside this — see the plugin's own `CLAUDE.md`.
Nothing breaks by that gap: an un-updated plugin install just keeps falling
back to `itemIds[0]` for everything, same as before any of this existed.

## Hosting cost — the incident, and the shape of the fix

> **Superseded 2026-09-02** — the fix below shipped and genuinely cut
> invocations/edge-requests, but Neon compute usage stayed close to 24/7
> anyway: its free-tier auto-suspend needs 5 real minutes of inactivity, and
> the combined poll's 30s edge-cache window meant *some* clan member's
> cache-miss reached the database every 30-60 seconds around the clock,
> resetting that countdown before it could ever finish — regardless of
> whether bingo was even running. That traffic was broadcast and live-stream
> notifications, which have nothing to do with bingo and were hitting every
> online install, not just participants. Both were removed entirely rather
> than cached harder — see "Broadcast and live-stream notifications: removed
> entirely" below. Read what follows as design history: still accurate about
> *why* merging three requests into one mattered, no longer accurate about
> what the combined poll currently carries.

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

**Its cache window was a year-round leak until 2026-09-06.** `getBingoStatus`
hard-coded `s-maxage=30` regardless of `bingo_active`, so while
`/api/plugin-poll` got the long idle window described below, this superseded
sibling kept waking Postgres every 30 seconds — meaning a *single* plugin
install that never updated was enough to defeat the idle window everywhere
else and keep the compute awake all year. Both endpoints now take their
windows from one shared `boardConfigCacheControl` in `_lib/board.ts`,
deliberately: two endpoints answering the same question out of the same row
must not be able to disagree about how long that answer keeps, which is
exactly how this drifted in the first place.

The current plugin no longer calls this endpoint at all —
`BingoPlugin#checkBoardState` was removed on the same day (see the plugin's
own `CLAUDE.md`), since it asked for `boardChangedAt` on the same tick
`/api/plugin-poll` had already returned it, as a separate CDN cache entry and
therefore a separate origin invocation and database read. Only genuinely stale
installs reach it now.

## Broadcast and live-stream notifications: removed entirely

**2026-09-02, superseding both sections below.** The feature itself is gone,
not just re-cached: `api/plugin-poll.ts` no longer reads
`broadcast_message`/`broadcast_updated_at` or fetches Twitch streams at all;
`POST /api/admin/board?resource=broadcast` (`sendBroadcast`/`setBroadcast`)
and `GET /api/runeprofile-proxy?resource=broadcast` (`getBroadcast`, the
pre-consolidation broadcast poll kept for old plugin installs) are deleted
outright; the admin UI's whole Broadcast tab (`broadcast-panel.tsx`) is gone;
`db/schema.sql` drops the `broadcast_message`/`broadcast_updated_at` columns
from `board_config`. `getOrCreateBoardConfig`/`BoardConfigRow` no longer
carry either field.

`pollSeconds` in `api/plugin-poll.ts` is now tied directly to `bingo_active`
(fast while an event is on, slow otherwise) rather than "was a broadcast
sent in the last 15 minutes" — the old `needsFastPolling()`/
`BROADCAST_FAST_WINDOW_MS` logic is gone along with the feature it existed
for. Since the only remaining caller of this endpoint is a bingo participant
(see the plugin's own `CLAUDE.md`, `hasAnythingToPollFor()`), tying the
cadence to `bingo_active` is both simpler and more correct than what it
replaced.

**Why, given the two sections below already show real engineering effort
put into caching this cheaply**: caching harder only ever reduces the *cost
per check*, never the fact that a check happens on a fixed short interval
around the clock regardless of whether anyone needs an answer. Neon's
free-tier compute auto-suspends after 5 real minutes of inactivity — with
several hundred installs clan-wide each checking every 30-60s, the database
was reaching that 5-minute quiet window essentially never, burning compute
24/7 for two features unrelated to bingo. Removing the traffic source beats
caching it more aggressively when the traffic has nothing to do with the
thing the hosting budget actually needs to serve. This was a deliberate
scope cut, made with the user's explicit sign-off (small non-monetized
clan project) rather than a technical dead end — don't reintroduce either
feature without a fresh conversation about scope.

> **Correction, 2026-09-06.** The paragraph above is right about *broadcast*
> and wrong about *live streams*, and the difference matters if either is ever
> reconsidered. `api/twitch-live.ts` contains no `sql` calls and never did: it
> asks Twitch and returns the answer, so it could not have contributed a single
> second of Neon compute. Broadcast was the half that read `board_config` out
> of Postgres every minute; that is what kept the compute awake. What
> live-stream polling actually consumed was **Vercel edge requests**, a
> different meter with a different cap (1M/month on Hobby, ~23 requests/minute
> sustained for everything). At 100+ installs checking once a minute that alone
> is ~4.3M/month, so the feature is still not free — but the reason is request
> volume, not the database, and "it stopped Neon sleeping" is not a valid
> argument against bringing it back.
>
> Note also that `!live` was **not** removed. It survives as an on-demand chat
> command (`onLiveCommand` in the plugin), which is cheap precisely because it
> costs one request when somebody asks rather than 1,440/day/member whether
> anyone cares. That contrast — on-demand versus on-a-timer — is the actual
> lesson from this whole episode, and it generalises better than "we removed
> two features".
>
> If instant in-game live announcements are ever wanted, the cheap shape is
> Twitch EventSub (Twitch pushes to a webhook when a stream starts) writing a
> small JSON file to Blob that plugins read directly — the same pattern as the
> board marker below, for the same reason. Discord's native Twitch integration
> already does this for free, though, and should be ruled out first.

See the plugin's own `CLAUDE.md` ("Broadcast and live-stream notifications:
removed entirely") for the plugin-side half of this same change.

## The board marker: the poll answers from Blob, not Postgres

**2026-09-06.** `api/_lib/board-marker.ts`. The change that actually addresses
the compute problem rather than trimming around it, and the reasoning behind
it is worth keeping because it is easy to get backwards.

**The meter is time, not count.** Neon suspends only after 5 unbroken minutes
with *no query at all*, and does not care how many people asked — only how
long since the last one. So halving request volume buys nothing if the
remaining requests still land more often than every 5 minutes. One member
online at 4am with a leftover plugin key, on a 30s cache window, was enough to
keep the compute awake around the clock for a two-week event and, thanks to
stale keys, most of the year. Every previous fix in this file attacked *count*.
This one attacks *whether Postgres is involved at all*.

**What moved, and what deliberately did not.** Only the change marker —
`{bingoActive, boardChangedAt, hasGoalTiles, publishedAt}`, about 100 bytes at
`board/marker.json` in the Blob store the proof screenshots already use (no new
store, no new env var). The board itself — tiles, teams, standings,
submissions — is untouched and still rendered from Postgres by `getBoard`. A
plugin compares the marker against the stamp of the board it holds and only
fetches a real board on the tick where they differ, exactly as before. Same
board, same freshness; what disappears is ~40,000 wake-ups per event spent
answering "no, nothing changed".

**Publishing is wired at the dispatcher, not per-handler.** `api/admin/board.ts`
and `api/admin/teams.ts` republish after any non-GET; `api/admin/submissions.ts`
and `api/board.ts` after a review and a submission. This is the pattern
`board_changed_at` deliberately avoids — it uses database triggers precisely
because a bump() call at each of ~20 write sites is one that eventually gets
missed — and Blob cannot be written from a trigger, so the risk is real and had
to be mitigated instead: `isMarkerStale` makes a missed publish degrade to
"late, then self-corrects" rather than "the board silently never updates
again". The poll republishes from the database whenever it finds the marker
missing or stale, so it also self-bootstraps on a fresh deploy.

**Two backstop windows, because the states fail differently.** 15 minutes while
active (a missed publish freezes everyone's board, so the net must be tight);
24 hours while idle (nothing *can* change except the admin switch, which is a
write that republishes on the spot). An earlier version used 15 minutes for
both, which was a bug: between events nothing writes, so the marker was
*always* older than 15 minutes, every poll fell back to Postgres, and the idle
case — the entire point — would have saved nothing.

**Two cases still reach Postgres, both on purpose.** A stale or missing marker;
and an active event whose board has xp/kc tiles, because
`maybeReconcileGoalProgress` needs this endpoint as its carrier and runs on a
2-minute throttle. That second one is why `hasGoalTiles` is in the marker at
all — it lets that decision be made without a query. The consequence is worth
stating plainly to whoever plans the next event: **an item-only board lets the
database sleep through the quiet hours of an event; one xp or kc tile keeps it
awake for the duration.** That was left as a deliberate choice rather than
silently degraded, since the alternative is a laggier progress bar.

**What did not get faster.** Flipping `bingo_active` still takes up to 30
minutes to reach every client, because the *poll response* is edge-cached for
the idle window even though the marker updates instantly. The
"flip it 30 minutes before the announced start" routine below still applies.
Shortening the idle edge window is now affordable (that path no longer touches
Postgres) but was left alone rather than stacked onto this change.

## Idle vs. active cache window on `/api/plugin-poll`

**2026-09-02, follow-up to the removal above.** Even with broadcast/live-stream
gone, Neon compute stayed close to 24/7: its free-tier auto-suspend needs 5
real minutes with no query at all, and a single 30s cache window meant *any*
straggler — someone who did bingo once and never cleared their plugin key —
touching the database every few minutes was enough to prevent that gap
forever, regardless of how few requests there actually were. The database
doesn't care about request *count*, only time-since-last-query.

Split `CACHE_SECONDS` into `CACHE_SECONDS_ACTIVE` (30s, unchanged — board
freshness during a real event is untouched by any of this) and
`CACHE_SECONDS_IDLE` (1800s / 30 min default, `PLUGIN_POLL_CACHE_SECONDS_IDLE`
env var, its own higher clamp ceiling than the usual 900s since a long idle
window is the intent, not a mistake to guard against). The response always
sets the short/active header first, before the database read that could fail
— same fail-safe reasoning as always — then overwrites it to the long/idle
one only once a real read confirms `bingo_active` is false. Guarantees a real
≥30-minute quiet gap every cycle while idle, no matter how many stale keys are
still floating around, while leaving active-event freshness completely
untouched.

**The tradeoff, and how it's meant to be worked around operationally rather
than in code**: flipping `bingo_active` on doesn't reach already-polling
clients until the cache naturally rolls over — up to 30 minutes, worst case.
A drop landing in that window before a participant's own client has picked up
the change won't be recognized as a tile match at all (the item-id watch list
comes from the board fetch, which is gated on locally-known `bingoActive`) —
this is a genuinely missed submission, not just a delayed one, since it never
enters the retry queue. The intended mitigation is operational: flip
`bingo_active` on **~30 minutes before** the announced start time, not at it.
That's not a workaround for a shortcoming — 30 minutes is exactly this
window's length, so by the real start every online client is guaranteed to
have already refreshed at least once.

**What this does not fix**: cost during an actual multi-day event with many
participants. While `bingo_active` is true the cache is back to 30s, and with
enough concurrent participants the database is essentially continuously awake
for the event's whole duration — unrelated to anything above, since that's
real, current demand, not idle stragglers. For this clan's actual scale (100+
plugin installs, 50-70 realistic participants, events up to ~2 weeks), a
maxed-out event can approach the entire 100 CU-hour free-tier budget on
compute alone. Budget for Neon's paid Launch plan (pay-as-you-go, no hard cap)
specifically for an event's duration rather than treating this idle-window fix
as a guarantee against hitting the cap mid-event — it isn't one, and nothing
short of a much larger redesign (see the "fetch board once at login instead
of polling" idea discussed with the user, not yet built) would meaningfully
change that.

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
