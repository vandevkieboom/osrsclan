import { useEffect, useState } from "react";
import {
  assignTeam,
  createTeam,
  createTile,
  deleteTeam,
  deleteTile,
  endDraft,
  fetchAdminTeams,
  fetchAdminTiles,
  fetchAdminUsers,
  fetchBoardConfig,
  fetchDraft,
  pickDraftMember,
  recolorTeam,
  renameTeam,
  setCaptain,
  setDonation,
  startDraft,
  updateBoardConfig,
  updateTile,
  type AdminDraftMember,
  type AdminDraftState,
  type AdminTeam,
  type AdminTile,
  type AdminUser,
  type BoardConfig,
  type PrizePotEntry,
} from "../services/admin";

type PanelTab = "teams" | "members" | "board" | "draft";

const SIZE_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10];

// Dev-only fallback so every admin tab has something to render under plain
// `npm run dev`, which has no backend at all. Never used in production —
// import.meta.env.DEV is false in a real build regardless of what the real
// fetch does.
const PLACEHOLDER_TEAMS: AdminTeam[] = [
  { id: 1, name: "Crimson Fang", slug: "crimson-fang", accentColor: "#e8574a", memberCount: 6, captainId: 1, captainName: "izJordy" },
  { id: 2, name: "Onyx Talon", slug: "onyx-talon", accentColor: "#5b9bd5", memberCount: 5, captainId: null, captainName: null },
];
const PLACEHOLDER_USERS: AdminUser[] = [
  { id: 1, username: "izjordy", globalName: "izJordy", runescapeName: "izJordy", avatarUrl: null, isAdmin: true, team: { id: 1, name: "Crimson Fang" }, donatedGp: 500000 },
  { id: 2, username: "test_user_two", globalName: "Test User Two", runescapeName: null, avatarUrl: null, isAdmin: false, team: null, donatedGp: 0 },
  { id: 3, username: "test_user_three", globalName: null, runescapeName: null, avatarUrl: null, isAdmin: false, team: { id: 2, name: "Onyx Talon" }, donatedGp: 0 },
];
const PLACEHOLDER_BOARD_CONFIG: BoardConfig = {
  name: "Summer Blackout Bingo",
  dateRange: "Aug 2 – Aug 16, 2026",
  size: 5,
  prizePot: { total: "", buyIn: "", donated: "", entries: [] },
};
const PLACEHOLDER_TILES: AdminTile[] = [
  { id: 1, position: 0, name: "Twisted Bow", iconUrl: "https://oldschool.runescape.wiki/images/Twisted_bow_detail.png", requiredCount: 1, category: "ITEM DROP", description: "" },
  { id: 2, position: 1, name: "Scythe of Vitur", iconUrl: "https://oldschool.runescape.wiki/images/Scythe_of_vitur_detail.png", requiredCount: 1, category: "ITEM DROP", description: "" },
];
const PLACEHOLDER_DRAFT: AdminDraftState = { active: false, order: [], pickIndex: 0, log: [] };

function TeamRow({
  team,
  roster,
  onRename,
  onRecolor,
  onSetCaptain,
  onDelete,
}: {
  team: AdminTeam;
  roster: AdminUser[];
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onSetCaptain: (captainId: number | null) => void;
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
      <select
        className="admin-select"
        value={team.captainId ?? ""}
        onChange={(e) => onSetCaptain(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">No captain</option>
        {roster.map((u) => (
          <option key={u.id} value={u.id}>
            {u.runescapeName ?? u.globalName ?? u.username}
          </option>
        ))}
      </select>
      <span className="admin-row-meta">{team.memberCount} members</span>
      <button type="button" className="admin-btn-danger" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

function TeamsPanel() {
  const [teams, setTeams] = useState<AdminTeam[] | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reload() {
    Promise.all([fetchAdminTeams(), fetchAdminUsers()])
      .then(([t, u]) => {
        setTeams(t);
        setUsers(u);
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          setTeams(PLACEHOLDER_TEAMS);
          setUsers(PLACEHOLDER_USERS);
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

  async function handleSetCaptain(id: number, captainId: number | null) {
    try {
      await setCaptain(id, captainId);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set captain");
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
            roster={(users ?? []).filter((u) => u.team?.id === t.id)}
            onRename={(newName) => handleRename(t.id, newName)}
            onRecolor={(color) => handleRecolor(t.id, color)}
            onSetCaptain={(captainId) => handleSetCaptain(t.id, captainId)}
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

function SearchIcon() {
  return (
    <svg
      className="ms-search-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function MembersPanel() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [teams, setTeams] = useState<AdminTeam[] | null>(null);
  const [search, setSearch] = useState("");
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

  async function handleDonation(userId: number, donatedGp: number) {
    try {
      await setDonation(userId, donatedGp);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update donation total");
    }
  }

  const filtered = (users ?? []).filter((u) => {
    if (!search.trim()) return true;
    const name = u.runescapeName ?? u.globalName ?? u.username;
    return name.toLowerCase().includes(search.trim().toLowerCase());
  });

  return (
    <div className="admin-panel">
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-member-search-wrap">
        <SearchIcon />
        <input
          type="text"
          className="admin-input admin-member-search"
          placeholder="Search members…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="admin-row-list">
        {filtered.map((u) => (
          <MemberRow
            key={u.id}
            user={u}
            teams={teams ?? []}
            onAssign={(value) => handleAssign(u.id, value)}
            onDonation={(gp) => handleDonation(u.id, gp)}
          />
        ))}
        {users && users.length > 0 && filtered.length === 0 && (
          <div className="admin-empty">No members match "{search}".</div>
        )}
        {users?.length === 0 && <div className="admin-empty">No members yet.</div>}
      </div>
    </div>
  );
}

function MemberRow({
  user,
  teams,
  onAssign,
  onDonation,
}: {
  user: AdminUser;
  teams: AdminTeam[];
  onAssign: (value: string) => void;
  onDonation: (donatedGp: number) => void;
}) {
  const [donation, setDonation] = useState(String(user.donatedGp));
  const [prevGp, setPrevGp] = useState(user.donatedGp);
  if (user.donatedGp !== prevGp) {
    setPrevGp(user.donatedGp);
    setDonation(String(user.donatedGp));
  }

  function commitDonation() {
    const parsed = Math.max(0, Math.floor(Number(donation)) || 0);
    if (parsed !== user.donatedGp) onDonation(parsed);
    else setDonation(String(user.donatedGp));
  }

  return (
    <div className="admin-row">
      <span className="admin-row-name">{user.runescapeName ?? user.globalName ?? user.username}</span>
      <input
        type="number"
        min={0}
        className="admin-input admin-donation-input"
        title="Total GP donated"
        value={donation}
        onChange={(e) => setDonation(e.target.value)}
        onBlur={commitDonation}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <select className="admin-select" value={user.team?.id ?? ""} onChange={(e) => onAssign(e.target.value)}>
        <option value="">Unassigned</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function TileAddRow({
  onSave,
  onCancel,
}: {
  onSave: (name: string, iconUrl: string, requiredCount: number, category: string, description: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [requiredCount, setRequiredCount] = useState(1);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div className="admin-row admin-tile-row--adding admin-tile-card">
      <div className="admin-tile-card-top">
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
        <input
          type="text"
          className="admin-input admin-tile-category-input"
          placeholder="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <input
          type="number"
          min={1}
          className="admin-input admin-tile-count-input"
          placeholder="Proofs"
          value={requiredCount}
          onChange={(e) => setRequiredCount(Math.max(1, Number(e.target.value) || 1))}
        />
      </div>
      <input
        type="text"
        className="admin-input admin-tile-description-input"
        placeholder="Explain exactly what counts for this tile…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="admin-tile-card-actions">
        <button
          type="button"
          className="admin-btn-primary"
          onClick={() =>
            name.trim() &&
            iconUrl.trim() &&
            onSave(name.trim(), iconUrl.trim(), requiredCount, category.trim(), description.trim())
          }
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

function TileRow({
  tile,
  onSave,
  onDelete,
}: {
  tile: AdminTile;
  onSave: (name: string, iconUrl: string, requiredCount: number, category: string, description: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(tile.name);
  const [iconUrl, setIconUrl] = useState(tile.iconUrl);
  const [requiredCount, setRequiredCount] = useState(tile.requiredCount);
  const [category, setCategory] = useState(tile.category);
  const [description, setDescription] = useState(tile.description);
  const [prevTile, setPrevTile] = useState(tile);
  if (
    tile.name !== prevTile.name ||
    tile.iconUrl !== prevTile.iconUrl ||
    tile.requiredCount !== prevTile.requiredCount ||
    tile.category !== prevTile.category ||
    tile.description !== prevTile.description
  ) {
    setPrevTile(tile);
    setName(tile.name);
    setIconUrl(tile.iconUrl);
    setRequiredCount(tile.requiredCount);
    setCategory(tile.category);
    setDescription(tile.description);
  }

  function commit() {
    const n = name.trim();
    const u = iconUrl.trim();
    const c = Math.max(1, Math.floor(requiredCount) || 1);
    const cat = category.trim();
    const desc = description.trim();
    if (
      n &&
      u &&
      (n !== tile.name || u !== tile.iconUrl || c !== tile.requiredCount || cat !== tile.category || desc !== tile.description)
    ) {
      onSave(n, u, c, cat, desc);
    } else {
      setName(tile.name);
      setIconUrl(tile.iconUrl);
      setRequiredCount(tile.requiredCount);
      setCategory(tile.category);
      setDescription(tile.description);
    }
  }

  return (
    <div className="admin-row admin-tile-card">
      <div className="admin-tile-card-top">
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
        <input
          type="text"
          className="admin-input admin-tile-category-input"
          placeholder="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          onBlur={commit}
        />
        <input
          type="number"
          min={1}
          className="admin-input admin-tile-count-input"
          value={requiredCount}
          onChange={(e) => setRequiredCount(Math.max(1, Number(e.target.value) || 1))}
          onBlur={commit}
        />
        <button type="button" className="admin-btn-danger" onClick={onDelete}>
          ✕
        </button>
      </div>
      <input
        type="text"
        className="admin-input admin-tile-description-input"
        placeholder="Explain exactly what counts for this tile…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={commit}
      />
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

  async function handleAddTile(
    position: number,
    name: string,
    iconUrl: string,
    requiredCount: number,
    category: string,
    description: string,
  ) {
    try {
      await createTile(position, name, iconUrl, requiredCount, category, description);
      setAddingPosition(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tile");
    }
  }

  async function handleSaveTile(
    id: number,
    name: string,
    iconUrl: string,
    requiredCount: number,
    category: string,
    description: string,
  ) {
    try {
      await updateTile(id, name, iconUrl, requiredCount, category, description);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tile");
    }
  }

  function updatePrizePotField(field: "total" | "buyIn" | "donated", value: string) {
    if (!config) return;
    setConfig({ ...config, prizePot: { ...config.prizePot, [field]: value } });
  }

  function updatePrizePotEntry(index: number, patch: Partial<PrizePotEntry>) {
    if (!config) return;
    const entries = config.prizePot.entries.map((e, i) => (i === index ? { ...e, ...patch } : e));
    setConfig({ ...config, prizePot: { ...config.prizePot, entries } });
  }

  function addPrizePotEntry() {
    if (!config) return;
    setConfig({
      ...config,
      prizePot: { ...config.prizePot, entries: [...config.prizePot.entries, { name: "", amount: "" }] },
    });
  }

  function removePrizePotEntry(index: number) {
    if (!config) return;
    setConfig({
      ...config,
      prizePot: { ...config.prizePot, entries: config.prizePot.entries.filter((_, i) => i !== index) },
    });
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
  const firstEmptyPosition = Array.from({ length: slotCount }, (_, i) => i).find(
    (i) => !tileByPosition.has(i),
  );

  return (
    <div className="admin-panel">
      {error && <div className="admin-error">{error}</div>}

      <form onSubmit={handleSaveConfig}>
        <div className="admin-section">
          <div className="admin-section-label">EVENT SETTINGS</div>
          <div className="admin-board-form">
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
          </div>
        </div>

        <div className="admin-section admin-section--prizepot">
          <div className="admin-section-label">PRIZE POT</div>
          <div className="admin-prizepot-row">
            <input
              type="text"
              className="admin-input"
              placeholder="Total (e.g. 51.50M)"
              value={config.prizePot.total}
              onChange={(e) => updatePrizePotField("total", e.target.value)}
            />
            <input
              type="text"
              className="admin-input"
              placeholder="Buy-in (e.g. 1.50M)"
              value={config.prizePot.buyIn}
              onChange={(e) => updatePrizePotField("buyIn", e.target.value)}
            />
            <input
              type="text"
              className="admin-input"
              placeholder="Donated (e.g. 50.00M)"
              value={config.prizePot.donated}
              onChange={(e) => updatePrizePotField("donated", e.target.value)}
            />
          </div>
          {config.prizePot.entries.map((entry, i) => (
            <div key={i} className="admin-prizepot-row">
              <input
                type="text"
                className="admin-input"
                placeholder="Entry name"
                value={entry.name}
                onChange={(e) => updatePrizePotEntry(i, { name: e.target.value })}
              />
              <input
                type="text"
                className="admin-input"
                placeholder="Amount"
                value={entry.amount}
                onChange={(e) => updatePrizePotEntry(i, { amount: e.target.value })}
              />
              <button type="button" className="admin-btn-danger" onClick={() => removePrizePotEntry(i)}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="admin-btn-ghost" onClick={addPrizePotEntry}>
            + Entry
          </button>
        </div>

        <div className="admin-section-save">
          <button type="submit" className="admin-btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && <span className="admin-saved">Saved.</span>}
        </div>
      </form>

      <div className="admin-section-divider" />

      <div className="admin-section">
        <div className="admin-section-label">TILES</div>
        <div className="admin-row-list admin-tile-list">
          {tiles
            .filter((t) => t.position < slotCount)
            .sort((a, b) => a.position - b.position)
            .map((tile) => (
              <TileRow
                key={tile.position}
                tile={tile}
                onSave={(name, iconUrl, requiredCount, category, description) =>
                  handleSaveTile(tile.id, name, iconUrl, requiredCount, category, description)
                }
                onDelete={() => handleDeleteTile(tile.id)}
              />
            ))}
          {addingPosition !== null && (
            <TileAddRow
              onSave={(name, iconUrl, requiredCount, category, description) =>
                handleAddTile(addingPosition, name, iconUrl, requiredCount, category, description)
              }
              onCancel={() => setAddingPosition(null)}
            />
          )}
        </div>
        {addingPosition === null && firstEmptyPosition !== undefined && (
          <button
            type="button"
            className="admin-tile-list-add"
            onClick={() => setAddingPosition(firstEmptyPosition)}
          >
            + Add Tile
          </button>
        )}
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

function DraftPanel() {
  const [draft, setDraft] = useState<AdminDraftState | null>(null);
  const [members, setMembers] = useState<AdminDraftMember[] | null>(null);
  const [teams, setTeams] = useState<AdminTeam[] | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    Promise.all([fetchDraft(), fetchAdminTeams(), fetchAdminUsers()])
      .then(([d, t, u]) => {
        setDraft(d.draft);
        setMembers(d.unassignedMembers);
        setTeams(t);
        setUsers(u);
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          setDraft(PLACEHOLDER_DRAFT);
          setMembers([]);
          setTeams(PLACEHOLDER_TEAMS);
          setUsers(PLACEHOLDER_USERS);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load draft");
      });
  }

  useEffect(reload, []);

  async function handleStart() {
    try {
      const d = await startDraft();
      setDraft(d.draft);
      setMembers(d.unassignedMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start draft");
    }
  }

  async function handlePick(userId: number) {
    try {
      const d = await pickDraftMember(userId);
      setDraft(d.draft);
      setMembers(d.unassignedMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to make pick");
    }
  }

  async function handleEnd() {
    try {
      const d = await endDraft();
      setDraft(d.draft);
      setMembers(d.unassignedMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end draft");
    }
  }

  if (!draft || !teams) return <div className="admin-panel">{error ?? "Loading..."}</div>;

  const onTheClockTeam = draft.active ? teams.find((t) => t.id === draft.order[draft.pickIndex]) : undefined;

  return (
    <div className="admin-panel">
      {error && <div className="admin-error">{error}</div>}

      {!draft.active && (
        <div className="admin-draft-intro">
          <p className="page-sub">
            Runs a snake draft over the {members?.length ?? 0} unassigned members, in order across{" "}
            {teams.length} teams — you make each pick on behalf of the captains.
          </p>
          <button type="button" className="admin-btn-primary" onClick={handleStart}>
            Start Draft
          </button>
        </div>
      )}

      {draft.active && onTheClockTeam && (
        <div className="admin-draft-clock" style={{ borderColor: onTheClockTeam.accentColor }}>
          <div>
            <div className="bingo-draft-clock-label">
              ON THE CLOCK — PICK {draft.pickIndex + 1} OF {draft.order.length}
            </div>
            <div className="bingo-draft-clock-team" style={{ color: onTheClockTeam.accentColor }}>
              {onTheClockTeam.name}
            </div>
            <div className="bingo-draft-clock-captain">Captain: {onTheClockTeam.captainName ?? "—"}</div>
          </div>
          <button type="button" className="admin-btn-ghost" onClick={handleEnd}>
            End Draft
          </button>
        </div>
      )}

      {draft.active && (
        <>
          <div className="admin-draft-available-label">AVAILABLE PLAYERS — CLICK TO ASSIGN</div>
          <div className="admin-draft-available">
            {members?.map((m) => (
              <button key={m.id} type="button" className="bingo-team-pill" onClick={() => handlePick(m.id)}>
                {m.name}
              </button>
            ))}
            {members?.length === 0 && <div className="admin-empty">All players drafted.</div>}
          </div>
        </>
      )}

      <div className="admin-draft-available-label">DRAFT BOARD</div>
      <div className="bingo-draft-rosters">
        {teams.map((team) => {
          const roster = (users ?? []).filter((u) => u.team?.id === team.id);
          return (
            <div key={team.id} className="bingo-draft-roster-card" style={{ borderTopColor: team.accentColor }}>
              <div className="bingo-draft-roster-name" style={{ color: team.accentColor }}>
                {team.name}
              </div>
              {roster.length > 0 ? (
                roster.map((u) => (
                  <div key={u.id} className="bingo-draft-roster-member">
                    {u.runescapeName ?? u.globalName ?? u.username}
                  </div>
                ))
              ) : (
                <div className="bingo-draft-roster-empty">No players yet.</div>
              )}
            </div>
          );
        })}
      </div>
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
        <button
          type="button"
          className={`bingo-panel-tab${panelTab === "draft" ? " active" : ""}`}
          onClick={() => setPanelTab("draft")}
        >
          DRAFT
        </button>
      </div>

      {panelTab === "teams" && <TeamsPanel />}
      {panelTab === "members" && <MembersPanel />}
      {panelTab === "board" && <BoardConfigPanel />}
      {panelTab === "draft" && <DraftPanel />}
    </div>
  );
}
