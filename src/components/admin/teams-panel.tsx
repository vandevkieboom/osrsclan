import { useEffect, useState } from "react";
import {
  fetchAdminTeams,
  fetchAdminUsers,
  createTeam,
  renameTeam,
  recolorTeam,
  setCaptain,
  deleteTeam,
  type AdminTeam,
  type AdminUser,
} from "../../services/admin";
import { PLACEHOLDER_TEAMS, PLACEHOLDER_USERS } from "./placeholders";

function TeamCard({
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
    <div className="admin-team-card">
      <div className="admin-team-card-top">
        <input
          type="color"
          className="admin-row-color admin-team-card-dot"
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
      </div>
      <select
        className="admin-select admin-team-card-select"
        value={team.captainId ?? ""}
        onChange={(e) =>
          onSetCaptain(e.target.value === "" ? null : Number(e.target.value))
        }
      >
        <option value="">No captain</option>
        {roster.map((u) => (
          <option key={u.id} value={u.id}>
            {u.runescapeName ?? u.globalName ?? u.username}
          </option>
        ))}
      </select>
      <div className="admin-team-card-footer">
        <span className="admin-row-meta">{team.memberCount} members</span>
        <button type="button" className="admin-btn-danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

export function TeamsPanel() {
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
    if (!window.confirm("Delete this team? Members will become unassigned."))
      return;
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
      <div className="admin-teams-grid">
        {teams?.map((t) => (
          <TeamCard
            key={t.id}
            team={t}
            roster={(users ?? []).filter((u) => u.team?.id === t.id)}
            onRename={(newName) => handleRename(t.id, newName)}
            onRecolor={(color) => handleRecolor(t.id, color)}
            onSetCaptain={(captainId) => handleSetCaptain(t.id, captainId)}
            onDelete={() => handleDelete(t.id)}
          />
        ))}
      </div>
      {teams?.length === 0 && <div className="admin-empty">No teams yet.</div>}
      <button
        type="button"
        className="admin-new-team-btn"
        onClick={handleCreate}
        disabled={saving}
      >
        + New Team
      </button>
    </div>
  );
}
