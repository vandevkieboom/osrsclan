import { useEffect, useState } from "react";
import {
  assignTeam,
  createTeam,
  createTile,
  deleteTeam,
  deleteTile,
  fetchAdminTeams,
  fetchAdminTiles,
  fetchAdminUsers,
  fetchBoardConfig,
  recolorTeam,
  renameTeam,
  updateBoardConfig,
  updateTile,
  type AdminTeam,
  type AdminTile,
  type AdminUser,
  type BoardConfig,
} from "../services/admin";

type PanelTab = "teams" | "members" | "board";

const SIZE_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10];

// Dev-only fallback so every admin tab has something to render under plain
// `npm run dev`, which has no backend at all. Never used in production —
// import.meta.env.DEV is false in a real build regardless of what the real
// fetch does.
const PLACEHOLDER_TEAMS: AdminTeam[] = [
  { id: 1, name: "Crimson Fang", slug: "crimson-fang", accentColor: "#e8574a", memberCount: 6 },
  { id: 2, name: "Onyx Talon", slug: "onyx-talon", accentColor: "#5b9bd5", memberCount: 5 },
];
const PLACEHOLDER_USERS: AdminUser[] = [
  { id: 1, username: "izjordy", globalName: "izJordy", avatarUrl: null, isAdmin: true, team: { id: 1, name: "Crimson Fang" } },
  { id: 2, username: "test_user_two", globalName: "Test User Two", avatarUrl: null, isAdmin: false, team: null },
  { id: 3, username: "test_user_three", globalName: null, avatarUrl: null, isAdmin: false, team: { id: 2, name: "Onyx Talon" } },
];
const PLACEHOLDER_BOARD_CONFIG: BoardConfig = {
  name: "Summer Blackout Bingo",
  dateRange: "Aug 2 – Aug 16, 2026",
  size: 5,
};
const PLACEHOLDER_TILES: AdminTile[] = [
  { id: 1, position: 0, name: "Twisted Bow", iconUrl: "https://oldschool.runescape.wiki/images/Twisted_bow_detail.png" },
  { id: 2, position: 1, name: "Scythe of Vitur", iconUrl: "https://oldschool.runescape.wiki/images/Scythe_of_vitur_detail.png" },
];

function TeamRow({
  team,
  onRename,
  onRecolor,
  onDelete,
}: {
  team: AdminTeam;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [prevName, setPrevName] = useState(team.name);
  if (team.name !== prevName) {
    setPrevName(team.name);
    setName(team.name);
  }

  function commit() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== team.name) onRename(trimmed);
    else setName(team.name);
  }

  return (
    <div className="admin-row">
      <input
        type="color"
        className="admin-row-color"
        value={team.accentColor}
        onChange={(e) => onRecolor(e.target.value)}
        title="Team color"
      />
      <input
        type="text"
        className="admin-input admin-row-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <span className="admin-row-meta">{team.memberCount} members</span>
      <button type="button" className="admin-btn-danger" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

function TeamsPanel() {
  const [teams, setTeams] = useState<AdminTeam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reload() {
    fetchAdminTeams()
      .then(setTeams)
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          setTeams(PLACEHOLDER_TEAMS);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load teams");
      });
  }

  useEffect(reload, []);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      await createTeam(`New Team ${(teams?.length ?? 0) + 1}`);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setSaving(false);
    }
  }

  async function handleRename(id: number, newName: string) {
    try {
      await renameTeam(id, newName);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename team");
    }
  }

  async function handleRecolor(id: number, color: string) {
    try {
      await recolorTeam(id, color);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recolor team");
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this team? Members will become unassigned.")) return;
    try {
      await deleteTeam(id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete team");
    }
  }

  return (
    <div className="admin-panel">
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-row-list">
        {teams?.map((t) => (
          <TeamRow
            key={t.id}
            team={t}
            onRename={(newName) => handleRename(t.id, newName)}
            onRecolor={(color) => handleRecolor(t.id, color)}
            onDelete={() => handleDelete(t.id)}
          />
        ))}
        {teams?.length === 0 && <div className="admin-empty">No teams yet.</div>}
      </div>
      <button type="button" className="admin-btn-primary" onClick={handleCreate} disabled={saving}>
        + New Team
      </button>
    </div>
  );
}

function MembersPanel() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [teams, setTeams] = useState<AdminTeam[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    Promise.all([fetchAdminUsers(), fetchAdminTeams()])
      .then(([u, t]) => {
        setUsers(u);
        setTeams(t);
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          setUsers(PLACEHOLDER_USERS);
          setTeams(PLACEHOLDER_TEAMS);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load members");
      });
  }

  useEffect(reload, []);

  async function handleAssign(userId: number, value: string) {
    const teamId = value === "" ? null : Number(value);
    try {
      await assignTeam(userId, teamId);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign team");
    }
  }

  return (
    <div className="admin-panel">
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-row-list">
        {users?.map((u) => (
          <div key={u.id} className="admin-row">
            <span className="admin-row-name">{u.globalName ?? u.username}</span>
            <select
              className="admin-select"
              value={u.team?.id ?? ""}
              onChange={(e) => handleAssign(u.id, e.target.value)}
            >
              <option value="">Unassigned</option>
              {teams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ))}
        {users?.length === 0 && <div className="admin-empty">No members yet.</div>}
      </div>
    </div>
  );
}

function TileAddRow({
  onSave,
  onCancel,
}: {
  onSave: (name: string, iconUrl: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  return (
    <div className="admin-row admin-tile-row--adding">
      <input
        type="text"
        className="admin-input admin-row-input"
        placeholder="Tile name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        type="text"
        className="admin-input admin-tile-icon-input"
        placeholder="Icon image URL"
        value={iconUrl}
        onChange={(e) => setIconUrl(e.target.value)}
      />
      <button
        type="button"
        className="admin-btn-primary"
        onClick={() => name.trim() && iconUrl.trim() && onSave(name.trim(), iconUrl.trim())}
      >
        Save
      </button>
      <button type="button" className="admin-btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function TileRow({
  tile,
  onSave,
  onDelete,
}: {
  tile: AdminTile;
  onSave: (name: string, iconUrl: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(tile.name);
  const [iconUrl, setIconUrl] = useState(tile.iconUrl);
  const [prevTile, setPrevTile] = useState(tile);
  if (tile.name !== prevTile.name || tile.iconUrl !== prevTile.iconUrl) {
    setPrevTile(tile);
    setName(tile.name);
    setIconUrl(tile.iconUrl);
  }

  function commit() {
    const n = name.trim();
    const u = iconUrl.trim();
    if (n && u && (n !== tile.name || u !== tile.iconUrl)) onSave(n, u);
    else {
      setName(tile.name);
      setIconUrl(tile.iconUrl);
    }
  }

  return (
    <div className="admin-row">
      <img src={tile.iconUrl} alt="" className="admin-tile-thumb" />
      <input
        type="text"
        className="admin-input admin-row-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
      />
      <input
        type="text"
        className="admin-input admin-tile-icon-input"
        value={iconUrl}
        onChange={(e) => setIconUrl(e.target.value)}
        onBlur={commit}
      />
      <button type="button" className="admin-btn-danger" onClick={onDelete}>
        ✕
      </button>
    </div>
  );
}

function BoardConfigPanel() {
  const [config, setConfig] = useState<BoardConfig | null>(null);
  const [tiles, setTiles] = useState<AdminTile[] | null>(null);
  const [addingPosition, setAddingPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function reload() {
    Promise.all([fetchBoardConfig(), fetchAdminTiles()])
      .then(([c, t]) => {
        setConfig(c);
        setTiles(t);
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          setConfig(PLACEHOLDER_BOARD_CONFIG);
          setTiles(PLACEHOLDER_TILES);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load board config");
      });
  }

  useEffect(reload, []);

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateBoardConfig(config);
      setConfig(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddTile(position: number, name: string, iconUrl: string) {
    try {
      await createTile(position, name, iconUrl);
      setAddingPosition(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tile");
    }
  }

  async function handleSaveTile(id: number, name: string, iconUrl: string) {
    try {
      await updateTile(id, name, iconUrl);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tile");
    }
  }

  async function handleDeleteTile(id: number) {
    if (!window.confirm("Delete this tile? Any submissions for it will be removed too.")) return;
    try {
      await deleteTile(id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tile");
    }
  }

  if (!config || !tiles) return <div className="admin-panel">{error ?? "Loading..."}</div>;

  const slotCount = config.size * config.size;
  const tileByPosition = new Map(tiles.map((t) => [t.position, t]));
  const overflowTiles = tiles.filter((t) => t.position >= slotCount);

  return (
    <div className="admin-panel">
      {error && <div className="admin-error">{error}</div>}

      <form className="admin-board-form" onSubmit={handleSaveConfig}>
        <label className="admin-field">
          <span>Event name</span>
          <input
            type="text"
            className="admin-input"
            value={config.name}
            onChange={(e) => setConfig({ ...config, name: e.target.value })}
          />
        </label>
        <label className="admin-field">
          <span>Date range</span>
          <input
            type="text"
            className="admin-input"
            placeholder="e.g. Aug 2 – Aug 16, 2026"
            value={config.dateRange}
            onChange={(e) => setConfig({ ...config, dateRange: e.target.value })}
          />
        </label>
        <label className="admin-field">
          <span>Grid size</span>
          <select
            className="admin-select"
            value={config.size}
            onChange={(e) => setConfig({ ...config, size: Number(e.target.value) })}
          >
            {SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s} × {s}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button type="submit" className="admin-btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && <span className="admin-saved">Saved.</span>}
        </div>
      </form>

      <div className="admin-row-list">
        {Array.from({ length: slotCount }, (_, position) => {
          const tile = tileByPosition.get(position);

          if (tile) {
            return (
              <TileRow
                key={position}
                tile={tile}
                onSave={(name, iconUrl) => handleSaveTile(tile.id, name, iconUrl)}
                onDelete={() => handleDeleteTile(tile.id)}
              />
            );
          }

          if (addingPosition === position) {
            return (
              <TileAddRow
                key={position}
                onSave={(name, iconUrl) => handleAddTile(position, name, iconUrl)}
                onCancel={() => setAddingPosition(null)}
              />
            );
          }

          return (
            <button
              key={position}
              type="button"
              className="admin-row admin-row--empty"
              onClick={() => setAddingPosition(position)}
            >
              + Add tile
            </button>
          );
        })}
      </div>

      {overflowTiles.length > 0 && (
        <>
          <p className="page-sub admin-tiles-heading">
            Outside the current {config.size} × {config.size} board (from a larger size before) —
            hidden from the live board until you grow the size again.
          </p>
          <div className="admin-row-list">
            {overflowTiles.map((tile) => (
              <div key={tile.id} className="admin-row">
                <img src={tile.iconUrl} alt="" className="admin-tile-thumb" />
                <span className="admin-row-name">{tile.name}</span>
                <button type="button" className="admin-btn-danger" onClick={() => handleDeleteTile(tile.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AdminPanelTabs() {
  const [panelTab, setPanelTab] = useState<PanelTab>("teams");

  return (
    <div>
      <div className="bingo-panel-tabs">
        <button
          type="button"
          className={`bingo-panel-tab${panelTab === "teams" ? " active" : ""}`}
          onClick={() => setPanelTab("teams")}
        >
          TEAMS
        </button>
        <button
          type="button"
          className={`bingo-panel-tab${panelTab === "members" ? " active" : ""}`}
          onClick={() => setPanelTab("members")}
        >
          MEMBERS
        </button>
        <button
          type="button"
          className={`bingo-panel-tab${panelTab === "board" ? " active" : ""}`}
          onClick={() => setPanelTab("board")}
        >
          BOARD CONFIG
        </button>
      </div>

      {panelTab === "teams" && <TeamsPanel />}
      {panelTab === "members" && <MembersPanel />}
      {panelTab === "board" && <BoardConfigPanel />}
    </div>
  );
}
