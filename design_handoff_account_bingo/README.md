# Handoff: Account Menu, Profile, Settings & Bingo Redesign

## Overview
Adds a Discord-account dropdown (profile/settings/logout) across the site, a shareable member profile page backed by the Wise Old Man API, a settings page for linking an RSN, and a full redesign of the Bingo event page (cleaner tiles, a tile-detail panel with multi-contributor tracking and screenshot proof, admin member search, and an admin-run snake draft). Also adds a donation leaderboard section to the homepage.

## About the Design Files
The files in this bundle are **design references built as standalone HTML prototypes** — they show the intended look, copy, and interaction behavior. They are not production code to copy in directly. Recreate this behavior inside the target codebase's existing stack (React components, routing, state management, backend) using its established patterns — component structure, auth handling, and data layer will differ from the prototype's inline-styled, client-only mock state.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and copy below are final. Recreate pixel-accurately using the codebase's real design tokens/components where they already exist for shared chrome (nav, buttons, cards) — introduce new tokens only for values that don't yet exist (see Design Tokens below).

## Screens / Views

### 1. Account dropdown (in the nav, every page)
- **Purpose**: Replaces the previous bare login/logout with a full account menu.
- **Layout**: Avatar (24px circle) + Discord display name + chevron button, pill-shaped, border `#3a2224`. Click toggles a dropdown panel anchored `top: calc(100% + 8px); right: 0`, width 220px, bg `#1e1617`, border `#2a1315`, radius 8px, shadow `0 16px 32px rgba(0,0,0,.5)`, padding 8px.
- **Dropdown contents**: header row (36px avatar + display name bold 13px `#f0e8e6` + "Signed in via Discord" 11px `#8f7a78`), divider, "My dashboard" link → own Profile page, "Settings" link → Settings page, divider, "Sign out" (13px `#e8574a` bold).
- **States**: logged-out state shows a "LOG IN WITH DISCORD" button instead (same border-pill style, no fill).
- **Behavior**: chevron rotates 180° when open. Menu items highlight `#241d1d` on hover.

### 2. Profile page (shareable, one per member)
- **Purpose**: A public, shareable page per clan member showing their OSRS stats and clan history. URL takes `?rsn=<name>`; without it, falls back to the signed-in user's own saved RSN.
- **Layout**: page header with a search box (RSN input + "VIEW" button) to look up any member. Below: profile header card (avatar-initial circle 64px ringed in the member's clan-rank color, display name, account-type badge if Ironman/HCIM/etc, clan rank name+icon, "member since" date, "SHARE PROFILE" button that copies the URL to clipboard). Then a row of 5 stat chips (Total Level, Total XP, Combat Level, EHP, EHB). Below that a 2-column layout: left column has a Skills card (4-col grid of all 23 skills + Overall, each row = icon 18px + name + level, RS-style) and a Notable Boss Kills card (3-col grid of boss icon + name + KC, only bosses with KC > 0, sorted descending); right column has a Recent Activity card (last-sync/last-changed text) and a Trophy Case card (event wins list — 🏆 icon + label + date; editable by the profile owner via an EDIT/DONE toggle that reveals inline add-trophy fields).
- **States**: empty (no RSN yet), loading ("Loading stats from Wise Old Man…"), error (couldn't find/load — retry button), loaded.
- **Data source**: `GET https://api.wiseoldman.net/v2/players/{username}` (public, no auth). Reads `displayName`, `type`, `combatLevel`, `exp`, `ehp`, `ehb`, `updatedAt`, `lastChangedAt`, and `latestSnapshot.data.skills.*` / `latestSnapshot.data.bosses.*`.
- **Clan rank / trophies**: these are clan-specific and NOT available from any public API — they must be stored in your own backend, keyed by RSN (or member ID), and edited by admins/the member themselves. The prototype fakes this with a static lookup table.

### 3. Settings page
- **Purpose**: Link an RSN to the signed-in Discord account, and control an auto-verify preference for the Rankings page.
- **Layout**: single column, max-width 640px. Card 1 "Account" — read-only Discord avatar + name. Card 2 "RuneScape name" — text input + Save button. Card 3 "Preferences" — checkbox "Remember me on the Rankings page" with helper copy explaining it auto-fills and auto-verifies RSN on that page. Footer link "View your profile →".
- **Behavior**: Save persists the RSN (and the checkbox persists immediately on toggle) to the user's account record. When the "remember" preference is on, the Rankings page should pre-fill and auto-run verification for that RSN on load.

### 4. Bingo page redesign
- **Tabs**: LEADERBOARD, BOARD, **DRAFT** (new, public/read-only), ADMIN REVIEW, ADMIN PANEL.
- **Board header card**: team name + event date range on the left; a progress bar + large "{{complete}} / {{total}} TILES COMPLETE" stat on the right — intentionally prominent (the old small caption text was easy to miss).
- **Team switcher**: pill buttons to view any team's board (read-only for teams other than your own).
- **Tile face (redesigned)**: icon-only (30px), no name/description text on the tile itself — all clutter and heavy shadowing removed. Status shown via a small 15px badge top-left (✓ green = complete, ⏳ amber = pending), a tiny stacked-avatar cluster bottom-left when 2+ people have contributed, and a small "{{done}}/{{required}}" pill bottom-right for tiles that need more than one contribution. Border/bg tint: green-tinted + `#3fae5c` border when complete, amber border when pending, neutral `#2a1315` otherwise. Icon opacity 0.75/0.9/1 (incomplete/pending/complete) — raised from the old 0.4 so incomplete tiles don't read as "dark/broken."
- **Tile detail panel** (right sidebar, NOT a hover tooltip or popover over the grid): opens on tile click. Shows: tile name, category badge (admin-set free text, e.g. "ITEM DROP"), full description (admin-authored — this is where ambiguous tiles like "any unique from X" get spelled out explicitly), a contributed/required progress bar for multi-contribution tiles, a **Contributors** list (avatar-initial + name + timestamp + APPROVED/PENDING status per person — supports many people each submitting one of N required items), a horizontal **Screenshots** thumbnail strip (click a thumbnail to open a full-size lightbox overlay), and a **Submit Proof** uploader.
- **Submit Proof / permissions**: only visible/usable when the viewer's own team matches the board currently being viewed — viewing another team's board shows the contributor/screenshot info read-only plus a note to switch back to your own team. This must be enforced server-side, not just hidden in the UI.
- **Screenshot upload**: prototype uses a native `<input type="file">` read via `FileReader` into a data URL for an instant client-side preview before submitting. **In production, this file must be uploaded to real object storage (S3, Cloudinary, etc.) and the resulting CDN URL stored** — the data-URL approach is a prototype stand-in only, not viable for real image storage.
- **Public Draft tab**: read-only for all users — shows "on the clock" team + captain, a reverse-chronological pick log (pick number, team color dot, team name, member name), and live per-team rosters. No pick controls here.
- **Admin Panel → Draft tab**: this is where picks actually happen. Admin clicks "START DRAFT" to generate a snake order (Team A, B, C, C, B, A, A, B, C…) across the unassigned member pool, then clicks a member name to assign them to whichever team is currently on the clock; auto-advances. "END DRAFT" stops it without unassigning anyone.
- **Admin Panel → Members tab**: added a search input above the member list (filters by substring match on name, case-insensitive).
- **Admin Panel → Teams tab**: added a captain `<select>` per team (choices = that team's current roster).
- **Admin Panel → Board Config tab**: each tile is now a card (not a single row) with name, icon URL, category (free text), required-contributions number, and a full-width description field — this is the mechanism for admins to make an ambiguous tile's rules explicit to players.
- **Prize Pot sidebar card**: below the tile-detail panel — total pot, buy-in vs donated breakdown, and a short list of contributing entries (per-team buy-ins + coffer donation). Static/display-only in the prototype; wire to real payment/coffer records in production.

### 5. Homepage — donation leaderboard
- **Purpose**: Spotlight top all-time clan donors to encourage giving.
- **Layout**: section titled "Top donators" with a 5-column row of cards. 1st/2nd/3rd get a medal emoji (🥇🥈🥉) and a colored top border (`#d4a017` gold / `#c9c9c9` silver / `#cd7f32` bronze); 4th/5th are plain-ranked cards. Each card: rank/medal, display name, total GP donated in `#d4b158`.

## Interactions & Behavior
- Dropdown menu: click toggles open/closed; clicking "Sign out" closes it and logs out.
- Rankings page: on load, if the "remember me" preference is set, pre-fill the verify input with the saved RSN and mark it verified immediately (no round trip) — otherwise leave it to manual entry + a VERIFY click.
- Profile page: share button copies `location.origin + pathname + '?rsn=' + encodeURIComponent(rsn)` and shows "LINK COPIED" for ~1.5s.
- Bingo tile click: opens the detail panel for that team+tile; clicking a different tile updates the same panel in place (never opens a second panel or overlaps other tiles). Closing via the ✕ clears selection.
- Lightbox: full-screen dim overlay (`rgba(12,6,7,.85)`), click anywhere to close.
- Draft: starting a draft resets the pick log; each pick appends to the log and advances the snake pointer; draft auto-ends when the order is exhausted.

## State Management
- **Auth/session**: Discord display name + avatar (from OAuth), linked RSN (user-editable), "remember me on Rankings" boolean.
- **Bingo**: per-team, per-tile array of contribution records `{ id, submittedBy, proofUrl, status: pending|approved, timestamp }`; a tile is complete once `approved.length >= tile.required`. Team/member roster assignments. Draft state: `{ active, order: teamId[], pickIndex }` + an append-only pick log for the public view.
- **Profile**: fetched WOM snapshot (cache with a reasonable TTL — WOM rate-limits), clan rank + trophy list (own backend record).

## Design Tokens
- Backgrounds: `#171213` (page), `#1e1617` (cards) — both OLED-safe darks, not pure black.
- Borders: `#2a1315` (default), `#3a2224` (inputs/buttons), `#241d1d` (nested/inner).
- Text: `#f0e8e6` (primary), `#c9b8b6` (secondary), `#a08c89` / `#8f7a78` (muted), `#7a655f` (faint).
- Accent: `#e8574a` (primary red), `#a3241a` (button fill), `#e2938a` (light accent).
- Status: `#3fae5c` (approved/green), `#d4a017` (pending/amber), `#d4b158` (gold/GP text).
- Fonts: `MedievalSharp` (headings/display), `Manrope` (body/UI), weights 400–800.
- Radii: 4px (inputs/buttons), 6–8px (cards/tiles), 20px (pills).

## Assets
- OSRS item/skill/boss icons from `oldschool.runescape.wiki` (`_detail.png` for items, `_icon.png` for skills, `_chathead.png` for boss portraits, `Clan_icon_-_<Rank>.png` for rank badges) — these are wiki-hosted images, not owned assets; consider mirroring them if you need guaranteed uptime/licensing clarity.
- Discord avatar placeholder: `https://cdn.discordapp.com/embed/avatars/1.png` — replace with the real OAuth avatar URL.
- Wise Old Man API: `https://api.wiseoldman.net/v2/players/{username}` (public, no key required, but respect their rate limits).

## Files
- `Homepage.dc.html` — donation leaderboard section + account dropdown
- `Rankings.dc.html` — account dropdown + auto-verify wiring
- `Hiscores.dc.html` — account dropdown
- `Activity.dc.html` — account dropdown
- `Bingo.dc.html` — full redesign (tiles, detail panel, draft, member search, prize pot)
- `Profile.dc.html` — new shareable profile page
- `Settings.dc.html` — new settings page
