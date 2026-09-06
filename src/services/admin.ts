import type { ItemRequirement, ItemRequirementsStatus } from "./board";

export interface AdminTeam {
  id: number;
  name: string;
  slug: string;
  accentColor: string;
  memberCount: number;
  captainId: number | null;
  captainName: string | null;
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

export interface Donation {
  id: number;
  name: string;
  amountGp: number;
}

export interface BoardConfig {
  name: string;
  size: number;
  /** Lets the RuneLite plugin back off its board polling to a slow, occasional
   * check instead of every couple minutes forever — the plugin is a general
   * clan tool, not bingo-only, so most installs otherwise poll the board year-round. */
  bingoActive: boolean;
}

export interface AdminTile {
  id: number;
  position: number;
  name: string;
  iconUrl: string;
  requiredCount: number;
  category: string;
  description: string;
  /** OSRS item ids the RuneLite plugin watches for. Empty = manual only. */
  itemIds: number[];
  /** When true, the same item id can only be submitted once per team for this tile. */
  requireUniqueItems: boolean;
  /** "item" (default) is the proof/review flow above; "xp"/"kc" is a
   * team-combined total the plugin reports directly — goalKey is the exact
   * skill/boss name (matched case-insensitively), goalTarget the threshold. */
  goalKind: "item" | "xp" | "kc";
  goalKey: string;
  goalTarget: number | null;
  /** Richer AND/OR item conditions (see db/schema.sql) — null (the default)
   * means "not using this, the flat itemIds/requiredCount/
   * requireUniqueItems fields above apply as normal." When set, those flat
   * fields are ignored for completion purposes. */
  itemRequirements: ItemRequirement[] | null;
}

/** The xp/kc-goal fields shared by createTile/updateTile's params. */
export interface TileGoal {
  goalKind: "item" | "xp" | "kc";
  goalKey: string;
  goalTarget: number | null;
}

export interface AdminSubmission {
  id: number;
  status: "pending" | "approved" | "rejected";
  proofUrl: string | null;
  teamId: number;
  tileId: number;
  teamName: string;
  tileName: string;
  iconUrl: string;
  requireUniqueItems: boolean;
  submittedBy: string;
  createdAt: string;
  /** Set once the plugin (automatically) or an admin (by hand) has tagged it. */
  itemId: number | null;
  /** Item ids already approved for this exact team+tile, for reviewer context. */
  alreadyApprovedItemIds: number[];
  /** Present only for tiles using the richer item_requirements model (AND/OR
   * item conditions — see db/schema.sql); null for every other tile. */
  itemRequirementsStatus: ItemRequirementsStatus | null;
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

export async function recolorTeam(
  id: number,
  accentColor: string,
): Promise<AdminTeam> {
  const res = await fetch("/api/admin/teams", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, accentColor }),
  });
  const data = await json<{ team: AdminTeam }>(res);
  return data.team;
}

export async function setCaptain(
  teamId: number,
  captainId: number | null,
): Promise<AdminTeam> {
  const res = await fetch("/api/admin/teams", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: teamId, captainId }),
  });
  const data = await json<{ team: AdminTeam }>(res);
  return data.team;
}

export async function deleteTeam(id: number): Promise<void> {
  const res = await fetch(`/api/admin/teams?id=${id}`, { method: "DELETE" });
  await json(res);
}

export async function fetchDonations(): Promise<Donation[]> {
  const res = await fetch("/api/admin/teams?resource=donations");
  const data = await json<{ donations: Donation[] }>(res);
  return data.donations;
}

export async function addDonation(
  name: string,
  amountGp: number,
): Promise<Donation> {
  const res = await fetch("/api/admin/teams?resource=donations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, amountGp }),
  });
  const data = await json<{ donation: Donation }>(res);
  return data.donation;
}

export async function updateDonation(
  id: number,
  name: string,
  amountGp: number,
): Promise<Donation> {
  const res = await fetch("/api/admin/teams?resource=donations", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, amountGp }),
  });
  const data = await json<{ donation: Donation }>(res);
  return data.donation;
}

export async function deleteDonation(id: number): Promise<void> {
  const res = await fetch(`/api/admin/teams?resource=donations&id=${id}`, {
    method: "DELETE",
  });
  await json(res);
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch("/api/admin/teams?resource=users");
  const data = await json<{ users: AdminUser[] }>(res);
  return data.users;
}

export async function assignTeam(
  userId: number,
  teamId: number | null,
): Promise<void> {
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

export async function updateBoardConfig(
  config: BoardConfig,
): Promise<BoardConfig> {
  const res = await fetch("/api/admin/board", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await json<{ config: BoardConfig }>(res);
  return data.config;
}

/**
 * Wipes everything tied to the current bingo round (submissions, xp/kc goal
 * progress) so a new round starts clean. Tiles, teams/rosters and donations
 * are left untouched. Irreversible.
 */
export async function resetBingo(): Promise<void> {
  const res = await fetch("/api/admin/board?resource=reset-bingo", {
    method: "POST",
  });
  await json(res);
}

export async function fetchAdminTiles(): Promise<AdminTile[]> {
  const res = await fetch("/api/admin/board?resource=tiles");
  const data = await json<{ tiles: AdminTile[] }>(res);
  return data.tiles;
}

export async function createTile(params: {
  position: number;
  name: string;
  /** Legacy fallback only — no longer collected from the tile editor (icons
   * are derived, see api/_lib/icons.ts); still accepted for the random-fill
   * feature's real wiki images, where there's no item to derive an icon
   * from at all. */
  iconUrl?: string;
  requiredCount?: number;
  category?: string;
  description?: string;
  itemIds?: number[];
  requireUniqueItems?: boolean;
  goal?: TileGoal;
  itemRequirements?: ItemRequirement[] | null;
}): Promise<AdminTile> {
  const {
    position,
    name,
    iconUrl = "",
    requiredCount = 1,
    category = "",
    description = "",
    itemIds = [],
    requireUniqueItems = false,
    goal,
    itemRequirements = null,
  } = params;
  const res = await fetch("/api/admin/board?resource=tiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      position,
      name,
      iconUrl,
      requiredCount,
      category,
      description,
      itemIds,
      requireUniqueItems,
      itemRequirements,
      icon_url: iconUrl,
      required_count: requiredCount,
      ...goal,
    }),
  });
  const data = await json<{ tile: AdminTile }>(res);
  return data.tile;
}

export async function updateTile(params: {
  id: number;
  name: string;
  /** Legacy fallback only — see the matching comment on createTile. Leaving
   * this out (the normal case now) never overwrites a tile's existing
   * stored value; the API only replaces it when a non-empty string is
   * actually sent. */
  iconUrl?: string;
  requiredCount?: number;
  category?: string;
  description?: string;
  itemIds?: number[];
  requireUniqueItems?: boolean;
  goal?: TileGoal;
  itemRequirements?: ItemRequirement[] | null;
}): Promise<AdminTile> {
  const {
    id,
    name,
    iconUrl = "",
    requiredCount = 1,
    category = "",
    description = "",
    itemIds = [],
    requireUniqueItems = false,
    goal,
    itemRequirements = null,
  } = params;
  const res = await fetch("/api/admin/board?resource=tiles", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      name,
      iconUrl,
      requiredCount,
      category,
      description,
      itemIds,
      requireUniqueItems,
      itemRequirements,
      icon_url: iconUrl,
      required_count: requiredCount,
      ...goal,
    }),
  });
  const data = await json<{ tile: AdminTile }>(res);
  return data.tile;
}

export async function deleteTile(id: number): Promise<void> {
  const res = await fetch(`/api/admin/board?resource=tiles&id=${id}`, {
    method: "DELETE",
  });
  await json(res);
}

export async function fetchAdminSubmissions(
  status: string,
  filters?: { teamId?: number; tileId?: number; sort?: "grouped" | "oldest" },
): Promise<AdminSubmission[]> {
  const params = new URLSearchParams({ status });
  if (filters?.teamId) params.set("teamId", String(filters.teamId));
  if (filters?.tileId) params.set("tileId", String(filters.tileId));
  if (filters?.sort === "oldest") params.set("sort", "oldest");
  const res = await fetch(`/api/admin/submissions?${params.toString()}`);
  const data = await json<{ submissions: AdminSubmission[] }>(res);
  return data.submissions;
}

export async function reviewSubmission(
  id: number,
  decision: "approved" | "rejected",
  itemId?: number,
): Promise<void> {
  const res = await fetch("/api/admin/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, decision, itemId }),
  });
  await json(res);
}
