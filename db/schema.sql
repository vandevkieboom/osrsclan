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
-- api/profile.ts looks members up with `WHERE lower(runescape_name) = …`.
-- A plain column index can't serve a function call, so this has to match the
-- expression exactly or the lookup stays a sequential scan.
CREATE INDEX IF NOT EXISTS idx_users_runescape_name_lower ON users (lower(runescape_name));

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

CREATE TABLE IF NOT EXISTS tiles (
  id BIGSERIAL PRIMARY KEY,
  position INT NOT NULL,
  name TEXT NOT NULL,
  icon_url TEXT NOT NULL,
  required_count INT NOT NULL DEFAULT 1 CHECK (required_count >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Positions stay unique, but the check is DEFERRABLE so a reorder can write
-- the whole permutation inside one transaction. A non-deferrable UNIQUE fails
-- the moment two rows collide part-way through the rewrite, which is why
-- drag-to-reorder had no way to persist. Dropping both the old inline
-- constraint name and this one first keeps the statement replayable, since
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS.
ALTER TABLE tiles DROP CONSTRAINT IF EXISTS tiles_position_key;
ALTER TABLE tiles DROP CONSTRAINT IF EXISTS tiles_position_unique;
ALTER TABLE tiles ADD CONSTRAINT tiles_position_unique UNIQUE (position) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS required_count INT NOT NULL DEFAULT 1 CHECK (required_count >= 1);
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

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
CREATE INDEX IF NOT EXISTS idx_submissions_team_id ON submissions(team_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
-- The "is this tile already complete for this team" count filters on both
-- columns together (see submitTile in api/board.ts).
CREATE INDEX IF NOT EXISTS idx_submissions_team_tile ON submissions(team_id, tile_id);

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
