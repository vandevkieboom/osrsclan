import { useEffect, useState } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import {
  assignTeam,
  createTeam,
  createTile,
  deleteTile,
  fetchAdminTeams,
  fetchAdminTiles,
  fetchAdminUsers,
  fetchBoardConfig,
  updateBoardConfig,
  updateTile,
  type AdminTeam,
  type AdminTile,
  type AdminUser,
  type BoardConfig,
} from "../services/admin";

type Tab = "teams" | "users" | "board" | "tiles";

function TeamsPanel() {
  const [teams, setTeams] = useState<AdminTeam[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reload() {
    fetchAdminTeams().then(setTeams).catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load teams"));
  }

  useEffect(reload, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createTeam(name.trim());
      setName("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-panel">
      <form className="admin-inline-form" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="New team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="admin-input"
        />
        <button type="submit" className="admin-btn-primary" disabled={saving}>
          Create team
        </button>
      </form>
      {error && <div className="admin-error">{error}</div>}
      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Members</th>
          </tr>
        </thead>
        <tbody>
          {teams?.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.memberCount}</td>
            </tr>
          ))}
          {teams?.length === 0 && (
            <tr>
              <td colSpan={2} className="admin-empty">
                No teams yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [teams, setTeams] = useState<AdminTeam[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    Promise.all([fetchAdminUsers(), fetchAdminTeams()])
      .then(([u, t]) => {
        setUsers(u);
        setTeams(t);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load users"));
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
      <table className="admin-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Admin</th>
            <th>Team</th>
          </tr>
        </thead>
        <tbody>
          {users?.map((u) => (
            <tr key={u.id}>
              <td className="admin-user-cell">
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt="" className="admin-user-avatar" />
                ) : (
                  <span className="admin-user-avatar admin-user-avatar--placeholder" />
                )}
                {u.globalName ?? u.username}
              </td>
              <td>{u.isAdmin ? "Yes" : ""}</td>
              <td>
                <select
                  className="admin-select"
                  value={u.team?.id ?? ""}
                  onChange={(e) => handleAssign(u.id, e.target.value)}
                >
                  <option value="">— none —</option>
                  {teams?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardConfigPanel() {
  const [config, setConfig] = useState<BoardConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchBoardConfig().then(setConfig).catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load config"));
  }, []);

  async function handleSave(e: React.FormEvent) {
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

  if (!config) return <div className="admin-panel">{error ?? "Loading..."}</div>;

  return (
    <form className="admin-panel admin-board-form" onSubmit={handleSave}>
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
        <span>Board size (N × N tiles)</span>
        <input
          type="number"
          min={2}
          max={10}
          className="admin-input"
          value={config.size}
          onChange={(e) => setConfig({ ...config, size: Number(e.target.value) })}
        />
      </label>
      {error && <div className="admin-error">{error}</div>}
      <button type="submit" className="admin-btn-primary" disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </button>
      {saved && <span className="admin-saved">Saved.</span>}
    </form>
  );
}

function TileSlotAddForm({
  onSave,
  onCancel,
}: {
  onSave: (name: string, iconUrl: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  return (
    <div className="admin-tile-slot admin-tile-slot--editing">
      <input
        type="text"
        className="admin-input"
        placeholder="Tile name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        type="text"
        className="admin-input"
        placeholder="Icon image URL"
        value={iconUrl}
        onChange={(e) => setIconUrl(e.target.value)}
      />
      <div className="admin-tile-slot-actions">
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
    </div>
  );
}

function TileSlotEditForm({
  tile,
  onSave,
  onCancel,
}: {
  tile: AdminTile;
  onSave: (name: string, iconUrl: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tile.name);
  const [iconUrl, setIconUrl] = useState(tile.iconUrl);
  return (
    <div className="admin-tile-slot admin-tile-slot--editing">
      <input
        type="text"
        className="admin-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        type="text"
        className="admin-input"
        value={iconUrl}
        onChange={(e) => setIconUrl(e.target.value)}
      />
      <div className="admin-tile-slot-actions">
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
    </div>
  );
}

function TilesPanel() {
  const [config, setConfig] = useState<BoardConfig | null>(null);
  const [tiles, setTiles] = useState<AdminTile[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addingPosition, setAddingPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    Promise.all([fetchBoardConfig(), fetchAdminTiles()])
      .then(([c, t]) => {
        setConfig(c);
        setTiles(t);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load tiles"));
  }

  useEffect(reload, []);

  async function handleAdd(position: number, name: string, iconUrl: string) {
    try {
      await createTile(position, name, iconUrl);
      setAddingPosition(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tile");
    }
  }

  async function handleSaveEdit(id: number, name: string, iconUrl: string) {
    try {
      await updateTile(id, name, iconUrl);
      setEditingId(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tile");
    }
  }

  async function handleDelete(id: number) {
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
      <p className="page-sub">
        A {config.size} × {config.size} board — {slotCount} tiles total. Change the size on the
        Board Config tab.
      </p>
      <div
        className="admin-tiles-grid"
        style={{ gridTemplateColumns: `repeat(${config.size}, 1fr)` }}
      >
        {Array.from({ length: slotCount }, (_, position) => {
          const tile = tileByPosition.get(position);

          if (tile && editingId === tile.id) {
            return (
              <TileSlotEditForm
                key={position}
                tile={tile}
                onSave={(name, iconUrl) => handleSaveEdit(tile.id, name, iconUrl)}
                onCancel={() => setEditingId(null)}
              />
            );
          }

          if (tile) {
            return (
              <div key={position} className="admin-tile-slot">
                <img src={tile.iconUrl} alt="" className="admin-tile-thumb" />
                <span className="admin-tile-name">{tile.name}</span>
                <div className="admin-tile-slot-actions">
                  <button type="button" className="admin-btn-ghost" onClick={() => setEditingId(tile.id)}>
                    Edit
                  </button>
                  <button type="button" className="admin-btn-danger" onClick={() => handleDelete(tile.id)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          }

          if (addingPosition === position) {
            return (
              <TileSlotAddForm
                key={position}
                onSave={(name, iconUrl) => handleAdd(position, name, iconUrl)}
                onCancel={() => setAddingPosition(null)}
              />
            );
          }

          return (
            <button
              key={position}
              type="button"
              className="admin-tile-slot admin-tile-slot--empty"
              onClick={() => setAddingPosition(position)}
            >
              + Add tile
            </button>
          );
        })}
      </div>

      {overflowTiles.length > 0 && (
        <div className="admin-panel">
          <p className="page-sub">
            These tiles are outside the current {config.size} × {config.size} board (from a
            larger size before) — hidden from the live board until you grow the size again.
          </p>
          <div className="admin-tiles-list">
            {overflowTiles.map((tile) => (
              <div key={tile.id} className="admin-tile-row">
                <img src={tile.iconUrl} alt="" className="admin-tile-thumb" />
                <span className="admin-tile-name">{tile.name}</span>
                <button type="button" className="admin-btn-danger" onClick={() => handleDelete(tile.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("teams");

  return (
    <>
      <SiteHeader />
      <div className="page">
        <div className="page-head">
          <div className="page-eyebrow">Clan Management</div>
          <h1 className="page-title">Admin</h1>
          <p className="page-sub">
            Create teams and assign members to them, configure the current
            bingo event's name and board size, and add or edit the tiles
            players complete.
          </p>
        </div>

        <div className="admin-tabs">
          <button type="button" className={`admin-tab${tab === "teams" ? " active" : ""}`} onClick={() => setTab("teams")}>
            TEAMS
          </button>
          <button type="button" className={`admin-tab${tab === "users" ? " active" : ""}`} onClick={() => setTab("users")}>
            USERS
          </button>
          <button type="button" className={`admin-tab${tab === "board" ? " active" : ""}`} onClick={() => setTab("board")}>
            BOARD CONFIG
          </button>
          <button type="button" className={`admin-tab${tab === "tiles" ? " active" : ""}`} onClick={() => setTab("tiles")}>
            TILES
          </button>
        </div>

        {tab === "teams" && <TeamsPanel />}
        {tab === "users" && <UsersPanel />}
        {tab === "board" && <BoardConfigPanel />}
        {tab === "tiles" && <TilesPanel />}
      </div>
      <SiteFooter />
    </>
  );
}
