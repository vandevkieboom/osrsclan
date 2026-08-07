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
  date_range TEXT NOT NULL DEFAULT '',
  size INT NOT NULL DEFAULT 5 CHECK (size BETWEEN 2 AND 10),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO board_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE board_config ADD COLUMN IF NOT EXISTS draft_active BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE board_config ADD COLUMN IF NOT EXISTS draft_order JSONB NOT NULL DEFAULT '[]';
ALTER TABLE board_config ADD COLUMN IF NOT EXISTS draft_pick_index INT NOT NULL DEFAULT 0;
ALTER TABLE board_config ADD COLUMN IF NOT EXISTS draft_log JSONB NOT NULL DEFAULT '[]';
ALTER TABLE board_config ADD COLUMN IF NOT EXISTS prize_pot JSONB NOT NULL DEFAULT '{"total":"","buyIn":"","donated":"","entries":[]}';

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
