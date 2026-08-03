export interface AdminTeam {
  id: number;
  name: string;
  slug: string;
  accentColor: string;
  memberCount: number;
}

export interface AdminUser {
  id: number;
  username: string;
  globalName: string | null;
  runescapeName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  team: { id: number; name: string } | null;
}

export interface BoardConfig {
  name: string;
  dateRange: string;
  size: number;
}

export interface AdminTile {
  id: number;
  position: number;
  name: string;
  iconUrl: string;
  requiredCount: number;
}

export interface AdminSubmission {
  id: number;
  status: "pending" | "approved" | "rejected";
  proofUrl: string | null;
  teamName: string;
  tileName: string;
  iconUrl: string;
  submittedBy: string;
  createdAt: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchAdminTeams(): Promise<AdminTeam[]> {
  const res = await fetch("/api/admin/teams");
  const data = await json<{ teams: AdminTeam[] }>(res);
  return data.teams;
}

export async function createTeam(name: string): Promise<AdminTeam> {
  const res = await fetch("/api/admin/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await json<{ team: AdminTeam }>(res);
  return data.team;
}

export async function renameTeam(id: number, name: string): Promise<AdminTeam> {
  const res = await fetch("/api/admin/teams", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name }),
  });
  const data = await json<{ team: AdminTeam }>(res);
  return data.team;
}

export async function recolorTeam(id: number, accentColor: string): Promise<AdminTeam> {
  const res = await fetch("/api/admin/teams", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, accentColor }),
  });
  const data = await json<{ team: AdminTeam }>(res);
  return data.team;
}

export async function deleteTeam(id: number): Promise<void> {
  const res = await fetch(`/api/admin/teams?id=${id}`, { method: "DELETE" });
  await json(res);
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch("/api/admin/teams?resource=users");
  const data = await json<{ users: AdminUser[] }>(res);
  return data.users;
}

export async function assignTeam(userId: number, teamId: number | null): Promise<void> {
  const res = await fetch("/api/admin/teams?resource=assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, teamId }),
  });
  await json(res);
}

export async function fetchBoardConfig(): Promise<BoardConfig> {
  const res = await fetch("/api/admin/board");
  const data = await json<{ config: BoardConfig }>(res);
  return data.config;
}

export async function updateBoardConfig(config: BoardConfig): Promise<BoardConfig> {
  const res = await fetch("/api/admin/board", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await json<{ config: BoardConfig }>(res);
  return data.config;
}

export async function fetchAdminTiles(): Promise<AdminTile[]> {
  const res = await fetch("/api/admin/board?resource=tiles");
  const data = await json<{ tiles: AdminTile[] }>(res);
  return data.tiles;
}

export async function createTile(position: number, name: string, iconUrl: string, requiredCount = 1): Promise<AdminTile> {
  const res = await fetch("/api/admin/board?resource=tiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ position, name, iconUrl, requiredCount }),
  });
  const data = await json<{ tile: AdminTile }>(res);
  return data.tile;
}

export async function updateTile(id: number, name: string, iconUrl: string, requiredCount = 1): Promise<AdminTile> {
  const res = await fetch("/api/admin/board?resource=tiles", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, iconUrl, requiredCount }),
  });
  const data = await json<{ tile: AdminTile }>(res);
  return data.tile;
}

export async function moveTile(id: number, position: number): Promise<AdminTile> {
  const res = await fetch("/api/admin/board?resource=tiles", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, position }),
  });
  const data = await json<{ tile: AdminTile }>(res);
  return data.tile;
}

export async function deleteTile(id: number): Promise<void> {
  const res = await fetch(`/api/admin/board?resource=tiles&id=${id}`, { method: "DELETE" });
  await json(res);
}

export async function fetchAdminSubmissions(status: string): Promise<AdminSubmission[]> {
  const res = await fetch(`/api/admin/submissions?status=${status}`);
  const data = await json<{ submissions: AdminSubmission[] }>(res);
  return data.submissions;
}

export async function reviewSubmission(id: number, decision: "approved" | "rejected"): Promise<void> {
  const res = await fetch("/api/admin/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, decision }),
  });
  await json(res);
}
