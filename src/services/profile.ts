import ranks, { rankIconByRole, staffRankByRole } from "../data/ranks-data";

export interface WomSkillEntry {
  level: number;
  experience: number;
}

export interface WomBossEntry {
  kills: number;
}

export interface WomPlayer {
  displayName: string;
  type: string;
  combatLevel: number;
  exp: number;
  ehp: number;
  ehb: number;
  updatedAt: string | null;
  lastChangedAt: string | null;
  latestSnapshot: {
    data: {
      skills: Record<string, WomSkillEntry>;
      bosses: Record<string, WomBossEntry>;
    };
  } | null;
}

export async function fetchWomPlayer(username: string): Promise<WomPlayer> {
  const res = await fetch(`https://api.wiseoldman.net/v2/players/${encodeURIComponent(username)}`);
  if (!res.ok) {
    throw new Error(res.status === 404 ? "Player not tracked on Wise Old Man" : `Request failed (${res.status})`);
  }
  return res.json() as Promise<WomPlayer>;
}

export interface RankInfo {
  name: string;
  color: string;
  icon: string;
}

/** Derives a member's clan rank tier from their live Wise Old Man group role — there's no persisted rank column in our own database. */
export function getRankForRole(role: string | undefined): RankInfo | null {
  if (!role) return null;
  const roleKey = role.toLowerCase();

  const staff = staffRankByRole[roleKey];
  if (staff) return { name: staff.name, color: staff.color, icon: staff.icon };

  const icon = rankIconByRole[roleKey];
  if (!icon) return null;
  const rank = ranks.find((r) => r.icon === icon);
  if (!rank) return null;
  // Use textColor, not color — the Rankings page renders rank names with
  // textColor (`.rank-name`'s `--rank-text-color`); `color` is a darker
  // variant meant for borders/backgrounds there, not text.
  return { name: rank.name, color: rank.textColor, icon: rank.icon };
}

export interface Trophy {
  id: number;
  label: string;
  date: string;
  createdAt: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface RsnProfile {
  trophies: Trophy[];
  avatarUrl: string | null;
}

export async function fetchTrophies(rsn: string): Promise<RsnProfile> {
  const res = await fetch(`/api/profile?rsn=${encodeURIComponent(rsn)}`);
  return json<RsnProfile>(res);
}

export async function addTrophy(rsn: string, label: string, date: string): Promise<Trophy> {
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rsn, label, date }),
  });
  const data = await json<{ trophy: Trophy }>(res);
  return data.trophy;
}

export async function removeTrophy(id: number): Promise<void> {
  const res = await fetch(`/api/profile?id=${id}`, { method: "DELETE" });
  await json(res);
}
