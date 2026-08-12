import { ranks, rankIconByRole } from "../data/ranks-data";

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

// Wise Old Man ships a small badge icon for every group role it supports —
// not just the achievement tiers this clan's own ladder tracks, but staff
// titles (owner, deputy_owner, moderator, ...) and cosmetic/event ones (e.g.
// "champion") too. Rather than maintaining our own separate icon/name for
// those, render whatever icon and role name WOM itself shows next to their
// name. Pinned to a commit-ish ref rather than a moving branch so the URL
// can't change under us.
const WOM_ROLE_ICON_BASE =
  "https://cdn.jsdelivr.net/gh/wise-old-man/wise-old-man@master/app/public/img/group_roles";
const WOM_ROLE_FALLBACK_COLOR = "#a99089";

// This clan uses the WOM role "serenist" to mark members who haven't
// earned a real clan rank yet — it's a placeholder, not an achievement, so
// it should render as no badge at all rather than WOM's serenist icon.
const UNRANKED_ROLES = new Set(["serenist"]);

function titleCaseRole(role: string): string {
  return role
    .split("_")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/** Derives a member's clan rank tier from their live Wise Old Man group role — there's no persisted rank column in our own database. */
export function getRankForRole(role: string | undefined): RankInfo | null {
  if (!role) return null;
  const roleKey = role.toLowerCase();
  if (UNRANKED_ROLES.has(roleKey)) return null;

  const icon = rankIconByRole[roleKey];
  if (icon) {
    const rank = ranks.find((r) => r.icon === icon);
    if (rank) {
      // Use textColor, not color — the Rankings page renders rank names with
      // textColor (`.rank-name`'s `--rank-text-color`); `color` is a darker
      // variant meant for borders/backgrounds there, not text.
      return { name: rank.name, color: rank.textColor, icon: rank.icon };
    }
  }

  return {
    name: titleCaseRole(roleKey),
    color: WOM_ROLE_FALLBACK_COLOR,
    icon: `${WOM_ROLE_ICON_BASE}/${roleKey}.png`,
  };
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

// Items a rank requires that can't be auto-verified from a collection log
// (no `apiCheck`) — an admin confirms these by hand, and the site remembers
// it against the RSN instead of only reflecting it in a WOM role change.
export async function fetchVerifiedItems(rsn: string): Promise<Set<string>> {
  const res = await fetch(
    `/api/profile?resource=verified-items&rsn=${encodeURIComponent(rsn)}`,
  );
  const data = await json<{ items: string[] }>(res);
  return new Set(data.items);
}

export async function addVerifiedItem(rsn: string, itemName: string): Promise<void> {
  const res = await fetch("/api/profile?resource=verified-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rsn, itemName }),
  });
  await json(res);
}

export async function removeVerifiedItem(rsn: string, itemName: string): Promise<void> {
  const res = await fetch(
    `/api/profile?resource=verified-items&rsn=${encodeURIComponent(rsn)}&itemName=${encodeURIComponent(itemName)}`,
    { method: "DELETE" },
  );
  await json(res);
}
