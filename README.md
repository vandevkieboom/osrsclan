# Clan Rankings

Web app voor de clan: rankings/tier-lijst, hiscores, activiteit, bingo-events en clan-profielen. React/Vite frontend met een Vercel serverless backend en een Neon Postgres database.

## Architectuur

- `src/` — React 19 + React Router frontend (Vite). Elke route in `src/main.tsx` komt overeen met één bestand in `src/page/`.
- `api/` — Vercel serverless functions (de backend): authenticatie (Discord OAuth), admin CRUD, board/bingo-data, en proxies naar externe APIs (Wise Old Man, RuneProfile, Twitch).
- `db/schema.sql` — huidig databaseschema, wordt idempotent toegepast via `pnpm db:migrate`.

## Aan de slag

```bash
pnpm install
pnpm dev            # frontend only (Vite dev server)
pnpm dev:vercel     # frontend + api/ routes lokaal (vereist Vercel CLI + env vars)
```

`pnpm dev:vercel` is nodig zodra je iets in `api/` test, omdat `pnpm dev` de serverless functions niet uitvoert.

## Benodigde environment variables

Zie `.env.local` (niet in git) voor de huidige waarden. Vereist:

- `DATABASE_URL` — Neon Postgres connection string
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` — Discord OAuth login
- `DISCORD_BOT_TOKEN`, `DISCORD_ANNOUNCEMENTS_CHANNEL_ID` — Discord aankondigingen
- `WOM_API_KEY` — Wise Old Man API (via `api/wom-proxy.ts` en `api/runeprofile-proxy.ts`)
- `RUNEPROFILE_API_KEY` — RuneProfile API (via `api/runeprofile-proxy.ts`)
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_CHANNELS` — live-status van clanleden
- `CRON_SECRET` — beveiligt de dagelijkse cron (`vercel.json`) die de RuneProfile-leaderboard ververst
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob storage voor bingo-tile screenshots (meestal automatisch gezet door Vercel)

## Overige scripts

```bash
pnpm build        # tsc -b && vite build
pnpm lint         # eslint .
pnpm preview      # preview van de productiebuild
pnpm db:migrate   # past db/schema.sql toe op de database uit .env.local
```
