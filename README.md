# Clan Rankings

Web app for the clan: rankings/tier list, hiscores, activity, bingo events, and clan profiles. React/Vite frontend with a Vercel serverless backend and a Neon Postgres database.

## Architecture

- `src/` — React 19 + React Router frontend (Vite). Each route in `src/main.tsx` corresponds to one file in `src/page/`.
- `api/` — Vercel serverless functions (the backend): authentication (Discord OAuth), admin CRUD, board/bingo data, and proxies to external APIs (Wise Old Man, RuneProfile, Twitch).
- `db/schema.sql` — current database schema, applied idempotently via `pnpm db:migrate`.

`api/runeprofile-proxy.ts` intentionally imports directly from `src/data/` and `src/services/` (rank-progress logic isn't duplicated). There's no separate `shared/` package between `api/` and `src/` — that's a deliberate, deferred choice, not accidental coupling.

## Getting started

```bash
pnpm install
pnpm dev            # frontend only (Vite dev server)
pnpm dev:vercel     # frontend + api/ routes locally (requires Vercel CLI + env vars)
```

`pnpm dev:vercel` is needed as soon as you're testing anything in `api/`, since `pnpm dev` doesn't run the serverless functions.

## Required environment variables

See `.env.local` (not in git) for the current values. Required:

- `DATABASE_URL` — Neon Postgres connection string
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` — Discord OAuth login
- `WOM_API_KEY` — Wise Old Man API (via `api/wom-proxy.ts` and `api/runeprofile-proxy.ts`)
- `RUNEPROFILE_API_KEY` — RuneProfile API (via `api/runeprofile-proxy.ts`)
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_CHANNELS` — live status of clan members
- `CRON_SECRET` — secures the daily cron job (`vercel.json`) that refreshes the RuneProfile leaderboard
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob storage for bingo tile screenshots (usually set automatically by Vercel)
- `DISCORD_BINGO_WEBHOOK_URL` — (optional) Discord webhook posted to when an admin approves a bingo tile submission, screenshot included.
- `DISCORD_ACTIVITY_WEBHOOK_URL` — (optional) Discord webhook for the activity feed (see below).
- `ACTIVITY_CRON_SECRET` — secures `GET /api/runeprofile-proxy?resource=activity-post` against the external scheduler that triggers it (see below). Separate from `CRON_SECRET` on purpose — different trigger, different secret.

## Discord activity feed (`GET /api/runeprofile-proxy?resource=activity-post`)

Polls the same public RuneProfile clan-activities endpoint the Activity page
uses and posts anything new to a Discord webhook, tracking progress in the
`activity_poller_state` table so nothing gets posted twice.

This deliberately isn't Vercel's own cron — Hobby only allows daily cron
invocations, far too infrequent for a "near real-time" feed. Instead, an
external scheduler (e.g. [cron-job.org](https://cron-job.org), free) should
hit this endpoint every few minutes:

```
GET https://timeserved.vercel.app/api/runeprofile-proxy?resource=activity-post
Authorization: Bearer <ACTIVITY_CRON_SECRET>
```

Only run **one** scheduler against this endpoint — it isn't safe to run
concurrently with another instance of itself, since two overlapping runs can
both read the same `activity_poller_state.last_posted_at` before either
updates it, posting the same activities twice.

## Other scripts

```bash
pnpm build        # tsc -b && vite build
pnpm lint         # eslint .
pnpm preview      # preview of the production build
pnpm db:migrate   # applies db/schema.sql to the database from .env.local
```
