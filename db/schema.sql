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
-- Throttle for maybeReconcileGoalProgress (api/_lib/board.ts): the last time
-- goal_progress was checked against WOM hiscores. Reconciliation is
-- triggered from GET /api/board itself (every plugin refresh, ~1/min per
-- online member) rather than a fixed-clock cron, specifically so it keeps
-- correcting right up until an event's actual deadline instead of waiting
-- for a scheduled time that might land after scoring has already closed.
ALTER TABLE board_config ADD COLUMN IF NOT EXISTS goal_reconciled_at TIMESTAMPTZ;
-- A server-broadcast verification codeword was tried and dropped: same
-- mistake as the verification_code attempt above — GET /api/board requires
-- no authentication at all, so anyone could have read it, which defeats the
-- point of it being something only real participants know. Superseded by a
-- plain manually-entered field in the plugin's own config, communicated to
-- participants directly (e.g. via Discord) rather than through the site.
ALTER TABLE board_config DROP COLUMN IF EXISTS codeword;
ALTER TABLE board_config DROP COLUMN IF EXISTS codeword_rotated_at;
ALTER TABLE board_config DROP COLUMN IF EXISTS draft_active;
ALTER TABLE board_config DROP COLUMN IF EXISTS draft_order;
ALTER TABLE board_config DROP COLUMN IF EXISTS draft_pick_index;
ALTER TABLE board_config DROP COLUMN IF EXISTS draft_log;
-- The Board Config admin form's Date Range field was removed as clutter.
ALTER TABLE board_config DROP COLUMN IF EXISTS date_range;
-- The prize pot feature (admin field + public "PRIZE POT" chip) was never
-- used and is dropped entirely.
ALTER TABLE board_config DROP COLUMN IF EXISTS prize_pot;
-- A site-wide verification codephrase was tried and dropped: any
-- authenticated member could read it via the board API (see getBoard in
-- api/board.ts), not just members actually on a bingo team, which defeats
-- the point of it being a shared secret. The RuneLite plugin now takes this
-- as a manually-entered config value instead, communicated to participants
-- directly rather than broadcast through the site.
ALTER TABLE board_config DROP COLUMN IF EXISTS verification_code;
-- The admin-broadcast feature (a one-off message pushed to anyone with the
-- "Clan broadcasts" toggle on) was dropped entirely, along with live-stream
-- notifications on the plugin side, to cut the plugin down to only polling
-- the site while a bingo event is actually relevant to it — see CLAUDE.md's
-- "Hosting cost" section.
ALTER TABLE board_config DROP COLUMN IF EXISTS broadcast_message;
ALTER TABLE board_config DROP COLUMN IF EXISTS broadcast_updated_at;
-- Lets an admin explicitly mark "no bingo event is running right now" —
-- the plugin is a general clan tool (chat commands, live-stream/broadcast
-- notifications), not bingo-only, so most installs otherwise keep polling
-- the board every couple minutes forever regardless of whether bingo is
-- even happening. Defaults true (fail-open): an old plugin build or a
-- response missing this field entirely must never be silently treated as
-- "inactive," which would just look like the board mysteriously stopped
-- updating. Only an explicit false (an admin turning it off) backs the
-- plugin's board polling down — see BingoPlugin#scheduledRefresh.
ALTER TABLE board_config ADD COLUMN IF NOT EXISTS bingo_active BOOLEAN NOT NULL DEFAULT true;

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
-- above, admin-reviewed proof) or a team-combined total tracked entirely
-- from WOM hiscores, with no plugin reporting and no proof/review step:
-- 'xp' is total skill XP gained by the team since each member's baseline
-- was seeded, 'kc' is total kills of a boss. goal_key is the skill or boss
-- name as an admin types it (matched case-insensitively, and reconciled
-- against a couple of known WOM/OSRS naming mismatches — see
-- lookupWomValue in api/_lib/board.ts), not a machine id — see goal_progress
-- below for how the per-member totals that get summed into a team total are
-- tracked.
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS goal_kind TEXT NOT NULL DEFAULT 'item' CHECK (goal_kind IN ('item', 'xp', 'kc'));
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS goal_key TEXT NOT NULL DEFAULT '';
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS goal_target BIGINT;
-- Explicit icon override, as an OSRS item id rather than a URL: the RuneLite
-- plugin can't fetch arbitrary image URLs, so its tile icon has always
-- defaulted to item_ids[0] via the client's own item sprite cache. For a
-- multi-item tile that default is often the wrong item (whichever happens to
-- be listed first), and for an xp/kc goal tile there's often no meaningful
-- item at all. NULL (the default) means "derive one instead" — see
-- deriveTileIconUrl in api/_lib/icons.ts, which both the website and the
-- plugin's icon logic are built from, so the two can no longer disagree.
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS icon_item_id INT;
-- icon_url used to be the ONLY icon source (admin pastes a wiki "detail"
-- image) and the plugin's item-id-derived icon was a completely separate,
-- independently-authored thing — the two could (and did) show different
-- pictures for the same tile. Now that deriveTileIconUrl (api/_lib/icons.ts)
-- computes one shared icon for both surfaces from icon_item_id/item_ids/
-- goal_key, admins no longer fill this in for new tiles — it's kept only as
-- a last-resort fallback for tiles from before this change (or a genuinely
-- manual tile with no item at all) where nothing else can be derived.
ALTER TABLE tiles ALTER COLUMN icon_url DROP NOT NULL;
ALTER TABLE tiles ALTER COLUMN icon_url SET DEFAULT '';
-- Per-item completion rule for a drop tile, richer than the flat
-- item_ids/required_count/require_unique_items trio above can express: an
-- array of { itemId, name, requiredAmount, group? }. An entry with no group
-- is always required at its own requiredAmount ("2 Burning claws AND 2
-- Tormented synapses"); entries sharing a group are one alternative set —
-- completing any ONE full group satisfies that part of the tile ("1
-- Enhanced crystal weapon seed OR 3 Crystal armour seeds", or "any one
-- complete Barrows brother's set"). NULL (the default, and every existing
-- tile) means "ignore this column, use the flat fields exactly as before" —
-- fully additive and opt-in per tile. See checkItemRequirements in
-- api/_lib/board.ts for the completion logic this backs.
ALTER TABLE tiles ADD COLUMN IF NOT EXISTS item_requirements JSONB;

-- Per-member progress toward a tile's team-combined xp/kc goal (see goal_kind
-- above). baseline_value is that member's hiscores reading at the moment
-- seedGoalBaselines (api/_lib/board.ts) explicitly seeded it — a full board
-- reset, or this tile's goal being created/changed — never set implicitly
-- by "whenever we first happened to see a reading" the way an earlier,
-- plugin-live-push design worked. latest_value only ever moves forward
-- (XP and kill counts are monotonic in OSRS) — a team's total contribution
-- is SUM(latest_value - baseline_value) across its members for a given
-- goal_kind+goal_key, computed at read time in api/board.ts rather than
-- stored, so it always reflects current team membership.
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
-- An in-plugin "looking for group" board was tried and dropped before
-- shipping. The table was already live on the database by the time it was
-- reverted, so it needs an explicit drop here — removing its CREATE TABLE
-- from this file only stops it being recreated, it doesn't remove it from
-- a database where it already exists.
DROP TABLE IF EXISTS lfg_posts;

-- ---------------------------------------------------------------------------
-- Board change stamp — lets the plugin skip the expensive board fetch
-- ---------------------------------------------------------------------------
-- Every online plugin used to re-fetch the whole board (tiles + teams +
-- rosters + every submission) once a minute for as long as an event was
-- running, whether or not a single thing had changed since its last fetch.
-- With a few dozen members online that is tens of thousands of invocations
-- and gigabytes of response body per day, spent almost entirely on
-- re-sending an identical payload.
--
-- `board_changed_at` is a single timestamp that moves whenever anything the
-- board response is built from actually changes. The plugin reads it from
-- the cheap, edge-cached status ping it already polls every minute, and only
-- runs the real board fetch when it differs from the one it last fetched.
-- Freshness is unchanged — a real change is still picked up on the very next
-- minute tick — but an unchanged board now costs nothing at all.
ALTER TABLE board_config ADD COLUMN IF NOT EXISTS board_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Maintained by triggers rather than by a bumpBoardVersion() call at each of
-- the ~20 places that write to these tables, deliberately: a *missed* call
-- site is invisible in testing and shows up in production as a board that
-- silently never updates, which is precisely the failure this whole change
-- must not introduce. A trigger cannot be forgotten.
--
-- now() is the transaction timestamp, so it is constant within a statement
-- *and* within a multi-statement transaction. That makes the WHERE clause
-- self-limiting: the first changed row in a transaction moves the stamp, and
-- every subsequent row in that same transaction matches `board_changed_at <
-- now()` as false and updates nothing. So a bulk update of a whole roster's
-- goal_progress costs one write here, not one per row.
CREATE OR REPLACE FUNCTION bump_board_changed_at() RETURNS trigger AS $$
BEGIN
  UPDATE board_config SET board_changed_at = now()
   WHERE id = 1 AND board_changed_at < now();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- INSERT/DELETE always count as a change; UPDATE only counts when a column
-- value actually differs, so the every-2-minutes goal reconcile pass (which
-- re-writes only rows whose hiscores value genuinely went up — see
-- refreshGoalLatestValues in api/_lib/board.ts) doesn't invalidate every
-- plugin's cached board on a pass where nobody actually gained anything.
DROP TRIGGER IF EXISTS tiles_bump_board ON tiles;
CREATE TRIGGER tiles_bump_board
  AFTER INSERT OR DELETE ON tiles
  FOR EACH ROW EXECUTE FUNCTION bump_board_changed_at();
DROP TRIGGER IF EXISTS tiles_bump_board_update ON tiles;
CREATE TRIGGER tiles_bump_board_update
  AFTER UPDATE ON tiles
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION bump_board_changed_at();

DROP TRIGGER IF EXISTS teams_bump_board ON teams;
CREATE TRIGGER teams_bump_board
  AFTER INSERT OR DELETE ON teams
  FOR EACH ROW EXECUTE FUNCTION bump_board_changed_at();
DROP TRIGGER IF EXISTS teams_bump_board_update ON teams;
CREATE TRIGGER teams_bump_board_update
  AFTER UPDATE ON teams
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION bump_board_changed_at();

DROP TRIGGER IF EXISTS submissions_bump_board ON submissions;
CREATE TRIGGER submissions_bump_board
  AFTER INSERT OR DELETE ON submissions
  FOR EACH ROW EXECUTE FUNCTION bump_board_changed_at();
DROP TRIGGER IF EXISTS submissions_bump_board_update ON submissions;
CREATE TRIGGER submissions_bump_board_update
  AFTER UPDATE ON submissions
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION bump_board_changed_at();

DROP TRIGGER IF EXISTS goal_progress_bump_board ON goal_progress;
CREATE TRIGGER goal_progress_bump_board
  AFTER INSERT OR DELETE ON goal_progress
  FOR EACH ROW EXECUTE FUNCTION bump_board_changed_at();
DROP TRIGGER IF EXISTS goal_progress_bump_board_update ON goal_progress;
CREATE TRIGGER goal_progress_bump_board_update
  AFTER UPDATE ON goal_progress
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION bump_board_changed_at();

-- users only matters here for the fields the board response actually renders
-- (team membership and the display name shown on a submission) — a login
-- touching last_seen or a rankings preference must not invalidate every
-- plugin's board.
DROP TRIGGER IF EXISTS users_bump_board ON users;
CREATE TRIGGER users_bump_board
  AFTER INSERT OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION bump_board_changed_at();
DROP TRIGGER IF EXISTS users_bump_board_update ON users;
CREATE TRIGGER users_bump_board_update
  AFTER UPDATE ON users
  FOR EACH ROW WHEN (
    OLD.team_id IS DISTINCT FROM NEW.team_id
    OR OLD.runescape_name IS DISTINCT FROM NEW.runescape_name
    OR OLD.discord_global_name IS DISTINCT FROM NEW.discord_global_name
    OR OLD.discord_username IS DISTINCT FROM NEW.discord_username
    OR OLD.discord_avatar_hash IS DISTINCT FROM NEW.discord_avatar_hash
  )
  EXECUTE FUNCTION bump_board_changed_at();

-- Where the last leaderboard refresh stopped. The refresh fans out to
-- RuneProfile for the entire roster and, at this clan's size, needs several
-- minutes -- which is longer than a single function invocation is allowed to
-- run. It used to be all-or-nothing: the write happened only at the very end,
-- so once the roster outgrew the time limit the function was killed first and
-- the leaderboard silently stopped updating altogether.
--
-- It now stops at a deadline, merges what it managed over the previous
-- snapshot, and records how far it got so the next night continues from there
-- rather than restarting at the top of the roster forever.
ALTER TABLE leaderboard_cache ADD COLUMN IF NOT EXISTS refresh_offset INT NOT NULL DEFAULT 0;
