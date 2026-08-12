import { useEffect, useState } from "react";
import {
  fetchAdminUsers,
  fetchAdminTeams,
  assignTeam,
  type AdminTeam,
  type AdminUser,
} from "../../services/admin";
import { PLACEHOLDER_TEAMS, PLACEHOLDER_USERS } from "./placeholders";
import { SearchIcon } from "./search-icon";

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
      <span className="admin-row-name">
        {user.runescapeName ?? user.globalName ?? user.username}
      </span>
      <select
        className="admin-select"
        value={user.team?.id ?? ""}
        onChange={(e) => onAssign(e.target.value)}
      >
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

export function MembersPanel() {
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
        {users?.length === 0 && (
          <div className="admin-empty">No members yet.</div>
        )}
      </div>
    </div>
  );
}
