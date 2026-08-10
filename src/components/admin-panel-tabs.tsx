import { useEffect, useState } from "react";
import {
  addDonation,
  assignTeam,
  createTeam,
  createTile,
  deleteDonation,
  deleteTeam,
  deleteTile,
  fetchAdminTeams,
  fetchAdminTiles,
  fetchAdminUsers,
  fetchBoardConfig,
  fetchDonations,
  recolorTeam,
  renameTeam,
  setCaptain,
  updateBoardConfig,
  updateDonation,
  updateTile,
  type AdminTeam,
  type AdminTile,
  type AdminUser,
  type BoardConfig,
  type Donation,
} from "../services/admin";

type PanelTab = "teams" | "members" | "donations" | "board" | "tiles";

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
  { id: 1, username: "izjordy", globalName: "izJordy", runescapeName: "izJordy", avatarUrl: null, isAdmin: true, team: { id: 1, name: "Crimson Fang" } },
  { id: 2, username: "test_user_two", globalName: "Test User Two", runescapeName: null, avatarUrl: null, isAdmin: false, team: null },
  { id: 3, username: "test_user_three", globalName: null, runescapeName: null, avatarUrl: null, isAdmin: false, team: { id: 2, name: "Onyx Talon" } },
];
const PLACEHOLDER_DONATIONS: Donation[] = [
  { id: 1, name: "izJordy", amountGp: 500000 },
];
const PLACEHOLDER_BOARD_CONFIG: BoardConfig = {
  name: "Summer Blackout Bingo",
  size: 5,
  prizePot: { total: "" },
};
const PLACEHOLDER_TILES: AdminTile[] = [
  { id: 1, position: 0, name: "Twisted Bow", iconUrl: "https://oldschool.runescape.wiki/images/Twisted_bow_detail.png", requiredCount: 1, category: "ITEM DROP", description: "" },
  { id: 2, position: 1, name: "Scythe of Vitur", iconUrl: "https://oldschool.runescape.wiki/images/Scythe_of_vitur_detail.png", requiredCount: 1, category: "ITEM DROP", description: "" },
];

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
}: {
  user: AdminUser;
  teams: AdminTeam[];
  onAssign: (value: string) => void;
}) {
  return (
    <div className="admin-row">
      <span className="admin-row-name">{user.runescapeName ?? user.globalName ?? user.username}</span>
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

function DonationsPanel() {
  const [donations, setDonations] = useState<Donation[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    fetchDonations()
      .then(setDonations)
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          setDonations(PLACEHOLDER_DONATIONS);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load donations");
      });
  }

  useEffect(reload, []);

  async function handleAdd(name: string, amountGp: number) {
    try {
      await addDonation(name, amountGp);
      setAdding(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add donation");
    }
  }

  async function handleSave(id: number, name: string, amountGp: number) {
    try {
      await updateDonation(id, name, amountGp);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update donation");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteDonation(id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete donation");
    }
  }

  if (!donations) return <div className="admin-panel">{error ?? "Loading..."}</div>;

  return (
    <div className="admin-panel">
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-row-list">
        {donations.map((d) => (
          <DonationRow
            key={d.id}
            donation={d}
            onSave={(name, amountGp) => handleSave(d.id, name, amountGp)}
            onDelete={() => handleDelete(d.id)}
          />
        ))}
        {adding && <DonationAddRow onSave={handleAdd} onCancel={() => setAdding(false)} />}
        {donations.length === 0 && !adding && (
          <div className="admin-empty">No donations recorded yet.</div>
        )}
      </div>
      {!adding && (
        <button type="button" className="admin-tile-list-add" onClick={() => setAdding(true)}>
          + Add Donor
        </button>
      )}
    </div>
  );
}

function DonationRow({
  donation,
  onSave,
  onDelete,
}: {
  donation: Donation;
  onSave: (name: string, amountGp: number) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(donation.name);
  const [amount, setAmount] = useState(String(donation.amountGp));
  const [prevDonation, setPrevDonation] = useState(donation);
  if (donation.name !== prevDonation.name || donation.amountGp !== prevDonation.amountGp) {
    setPrevDonation(donation);
    setName(donation.name);
    setAmount(String(donation.amountGp));
  }

  function commit() {
    const n = name.trim();
    const a = Math.max(0, Math.floor(Number(amount)) || 0);
    if (n && (n !== donation.name || a !== donation.amountGp)) {
      onSave(n, a);
    } else {
      setName(donation.name);
      setAmount(String(donation.amountGp));
    }
  }

  return (
    <div className="admin-row">
      <input
        type="text"
        className="admin-input admin-row-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
      />
      <input
        type="number"
        min={0}
        className="admin-input admin-donation-amount-input"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <button type="button" className="admin-btn-danger" onClick={onDelete}>
        ✕
      </button>
    </div>
  );
}

function DonationAddRow({
  onSave,
  onCancel,
}: {
  onSave: (name: string, amountGp: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  return (
    <div className="admin-row">
      <input
        type="text"
        className="admin-input admin-row-input"
        placeholder="Donor name / RSN"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        type="number"
        min={0}
        className="admin-input admin-donation-amount-input"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button
        type="button"
        className="admin-btn-primary"
        onClick={() => name.trim() && onSave(name.trim(), Math.max(0, Math.floor(Number(amount)) || 0))}
      >
        Save
      </button>
      <button type="button" className="admin-btn-ghost" onClick={onCancel}>
        Cancel
      </button>
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function reload() {
    fetchBoardConfig()
      .then(setConfig)
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          setConfig(PLACEHOLDER_BOARD_CONFIG);
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

  if (!config) return <div className="admin-panel">{error ?? "Loading..."}</div>;

  return (
    <div className="admin-panel">
      {error && <div className="admin-error">{error}</div>}

      <form onSubmit={handleSaveConfig}>
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
          <label className="admin-field">
            <span>Prize pot total</span>
            <input
              type="text"
              className="admin-input"
              placeholder="e.g. 51.50M"
              value={config.prizePot.total}
              onChange={(e) => setConfig({ ...config, prizePot: { total: e.target.value } })}
            />
          </label>
        </div>

        <div className="admin-section-save">
          <button type="submit" className="admin-btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && <span className="admin-saved">Saved.</span>}
        </div>
      </form>
    </div>
  );
}

function TilesPanel() {
  const [config, setConfig] = useState<BoardConfig | null>(null);
  const [tiles, setTiles] = useState<AdminTile[] | null>(null);
  const [addingPosition, setAddingPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setError(err instanceof Error ? err.message : "Failed to load tiles");
      });
  }

  useEffect(reload, []);

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
      <div className="bingo-tabs">
        <button
          type="button"
          className={`bingo-tab${panelTab === "teams" ? " active" : ""}`}
          onClick={() => setPanelTab("teams")}
        >
          TEAMS
        </button>
        <button
          type="button"
          className={`bingo-tab${panelTab === "members" ? " active" : ""}`}
          onClick={() => setPanelTab("members")}
        >
          MEMBERS
        </button>
        <button
          type="button"
          className={`bingo-tab${panelTab === "donations" ? " active" : ""}`}
          onClick={() => setPanelTab("donations")}
        >
          DONATIONS
        </button>
        <button
          type="button"
          className={`bingo-tab${panelTab === "board" ? " active" : ""}`}
          onClick={() => setPanelTab("board")}
        >
          BINGO CONFIG
        </button>
        <button
          type="button"
          className={`bingo-tab${panelTab === "tiles" ? " active" : ""}`}
          onClick={() => setPanelTab("tiles")}
        >
          TILES
        </button>
      </div>

      {panelTab === "teams" && <TeamsPanel />}
      {panelTab === "members" && <MembersPanel />}
      {panelTab === "donations" && <DonationsPanel />}
      {panelTab === "board" && <BoardConfigPanel />}
      {panelTab === "tiles" && <TilesPanel />}
    </div>
  );
}
