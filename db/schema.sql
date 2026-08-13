CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  accent_color TEXT NOT NULL DEFAULT '#e8574a',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#e8574a';

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  discord_username TEXT NOT NULL,
  discord_global_name TEXT,
  discord_avatar_hash TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  team_id BIGINT REFERENCES teams(id) ON DELETE SET NULL,
  runescape_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS runescape_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS remember_rankings BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS donated_gp BIGINT NOT NULL DEFAULT 0;
-- The bingo draft feature (and the entrant flag that fed its pick pool) was
-- removed — drop the columns it left behind.
ALTER TABLE users DROP COLUMN IF EXISTS bingo_entrant;
CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);

-- Added after users so the FK target already exists when this file is
-- re-run in full from a fresh database.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS captain_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS board_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Bingo',
  size INT NOT NULL DEFAULT 5 CHECK (size BETWEEN 2 AND 10),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO board_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE board_config DROP COLUMN IF EXISTS draft_active;
ALTER TABLE board_config DROP COLUMN IF EXISTS draft_order;
ALTER TABLE board_config DROP COLUMN IF EXISTS draft_pick_index;
ALTER TABLE board_config DROP COLUMN IF EXISTS draft_log;
-- The Board Config admin form's Date Range field was removed as clutter.
ALTER TABLE board_config DROP COLUMN IF EXISTS date_range;
ALTER TABLE board_config ADD COLUMN IF NOT EXISTS prize_pot JSONB NOT NULL DEFAULT '{"total":""}';
-- The prize pot admin form was simplified down to just the total GP amount —
-- buy-in, donated, and the per-donor entries list were never shown anywhere
-- on the public site and are dropped from new rows and future saves.
ALTER TABLE board_config ALTER COLUMN prize_pot SET DEFAULT '{"total":""}';
-- A site-wide verification codephrase was tried and dropped: any
-- authenticated member could read it via the board API (see getBoard in
-- api/board.ts), not just members actually on a bingo team, which defeats
-- the point of it being a shared secret. The RuneLite plugin now takes this
-- as a manually-entered config value instead, communicated to participants
-- directly rather than broadcast through the site.
ALTER TABLE board_config DROP COLUMN IF EXISTS verification_code;
-- A one-off message an admin can push out, read by the RuneLite plugin's
-- periodic poll and printed as a chat message to anyone with the "Clan
-- broadcasts" toggle on. broadcast_updated_at is what the plugin compares
-- against its own last-seen timestamp to tell a new broadcast from one
-- it's already shown.
ALTER TABLE board_config ADD COLUMN IF NOT EXISTS broadcast_message TEXT NOT NULL DEFAULT '';
ALTER TABLE board_config ADD COLUMN IF NOT EXISTS broadcast_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS tiles (
  id BIGSERIAL PRIMARY KEY,
  position INT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon_url TEXT NOT NULL,
  required_count INT NOT NULL DEFAULT 1 CHECK (required_count >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS required_count INT NOT NULL DEFAULT 1 CHECK (required_count >= 1);
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
-- OSRS item ids that satisfy this tile, for the RuneLite plugin's automatic
-- drop detection. An array because a tile can accept several items (e.g. any
-- one of the DT2 rings). Empty means "no automatic detection" — the tile is
-- manual-upload only, which is the default and stays valid.
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS item_ids INT[] NOT NULL DEFAULT '{}';
-- For a tile that accepts several items and needs more than one proof (e.g.
-- "10 Barrows items"): when true, the same item id can only be submitted once
-- per team for this tile, so "10 different pieces" and "4 unique DK rings"
-- are enforced automatically instead of relying on an admin to notice a
-- duplicate during review. Has no effect on tiles needing only one proof.
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS require_unique_items BOOLEAN NOT NULL DEFAULT FALSE;
-- A tile's goal is either an item drop (the default — tracked via item_ids
-- above, admin-reviewed proof) or a team-combined total the RuneLite plugin
-- reports on directly with no proof/review step: 'xp' is total skill XP
-- gained by the team since each member's plugin started reporting, 'kc' is
-- total kills of a boss. goal_key is the skill or boss name exactly as it
-- reads in-game/in kill-count chat (matched case-insensitively), not a
-- machine id — see goal_progress below for how the per-member totals that
-- get summed into a team total are tracked.
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS goal_kind TEXT NOT NULL DEFAULT 'item' CHECK (goal_kind IN ('item', 'xp', 'kc'));
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS goal_key TEXT NOT NULL DEFAULT '';
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS goal_target BIGINT;

-- Per-member progress toward a tile's team-combined xp/kc goal (see goal_kind
-- above). baseline_value is that member's reading the first time their
-- plugin ever reports this (goal_kind, goal_key) — so only XP/kills gained
-- from that point on count, mirroring how item-drop tiles only see loot
-- obtained while the plugin is running. latest_value only ever moves
-- forward (XP and kill counts are monotonic in OSRS) — a team's total
-- contribution is SUM(latest_value - baseline_value) across its members for
-- a given goal_kind+goal_key, computed at read time in api/board.ts rather
-- than stored, so it always reflects current team membership.
CREATE TABLE IF NOT EXISTS goal_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_kind TEXT NOT NULL CHECK (goal_kind IN ('xp', 'kc')),
  goal_key TEXT NOT NULL,
  baseline_value BIGINT NOT NULL,
  latest_value BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, goal_kind, goal_key)
);

CREATE TABLE IF NOT EXISTS submissions (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tile_id BIGINT NOT NULL REFERENCES tiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  proof_url TEXT,
  submitted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE (team_id, tile_id)
);
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_team_id_tile_id_key;
-- Which OSRS item this submission was for, when known (only the RuneLite
-- plugin resolves this — a manual screenshot upload has no way to). Backs
-- the require_unique_items check on tiles and lets the admin review list
-- show what was actually submitted instead of just an image.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS item_id INT;
CREATE INDEX IF NOT EXISTS idx_submissions_team_id ON submissions(team_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);

-- One row per clan-event trophy, keyed by the lowercased RSN it belongs to
-- rather than a user id — a profile can be looked up (and thus hold
-- trophies) for any RSN in the WOM group, not just ones with a linked
-- Discord/site account.
CREATE TABLE IF NOT EXISTS trophies (
  id BIGSERIAL PRIMARY KEY,
  rsn_key TEXT NOT NULL,
  label TEXT NOT NULL,
  date_label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trophies_rsn_key ON trophies(rsn_key);

-- Records which rank items that can't be auto-verified from a collection log
-- an admin has manually confirmed for a given RSN (e.g. via a screenshot).
-- Keyed by RSN like trophies, not user id, for the same reason. item_name is
-- stored lowercased to match how RuneProfile item names are looked up
-- elsewhere (see buildItemMap in src/services/runeprofile.ts).
CREATE TABLE IF NOT EXISTS manual_item_verifications (
  id BIGSERIAL PRIMARY KEY,
  rsn_key TEXT NOT NULL,
  item_name TEXT NOT NULL,
  verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rsn_key, item_name)
);
CREATE INDEX IF NOT EXISTS idx_manual_item_verifications_rsn_key ON manual_item_verifications(rsn_key);

-- Donations used to live as a `donated_gp` number on a `users` row, which
-- meant a donor had to have logged into the site at least once with Discord
-- before their donation would show up anywhere. Tracking them independently
-- by name lets an admin record a donation for any clan member.
CREATE TABLE IF NOT EXISTS donations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  amount_gp BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users DROP COLUMN IF EXISTS donated_gp;

-- Cached output of the clan-wide collection-log leaderboard. Computed by a
-- daily cron (api/runeprofile-proxy.ts, resource=leaderboard-refresh) that
-- fans out to RuneProfile for every clan member, rather than doing that fan
-- out on every page view — collection log progress doesn't change minute to
-- minute, and RuneProfile shouldn't get hit with ~500 requests per visitor.
CREATE TABLE IF NOT EXISTS leaderboard_cache (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  entries JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO leaderboard_cache (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Long-lived per-user tokens so the RuneLite bingo plugin can submit tile
-- proofs on a member's behalf. A browser session cookie can't be used — the
-- plugin is a Java process, not a browser — so it sends
-- `Authorization: Bearer <token>` instead. Mirrors the sessions table's
-- store-only-the-hash pattern, so a database leak never exposes usable
-- tokens. Revocation is a soft delete so last_used_at history survives it.
CREATE TABLE IF NOT EXISTS plugin_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_plugin_tokens_user_id ON plugin_tokens(user_id);

-- One open "looking for group" ad per member, posted from the RuneLite
-- plugin's LFG panel — there is no website UI for this at all. Deliberately
-- ephemeral: nothing ever deletes a row on a timer, api/lfg.ts just filters
-- out anything older than its age cutoff at read time, and a stale row is
-- harmless clutter the next post from that user overwrites anyway.
-- UNIQUE(user_id) is what makes "one active post per member" true: posting
-- again is an upsert (see api/lfg.ts) that bumps created_at, not a second row.
CREATE TABLE IF NOT EXISTS lfg_posts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  activity TEXT NOT NULL CHECK (activity IN ('tob', 'cox', 'toa', 'inferno', 'fight_caves', 'wintertodt', 'skilling', 'other')),
  spots_needed INT NOT NULL CHECK (spots_needed BETWEEN 1 AND 20),
  note TEXT NOT NULL DEFAULT '',
  party_passphrase TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lfg_posts_created_at ON lfg_posts(created_at);
