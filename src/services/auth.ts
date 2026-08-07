export interface AuthTeam {
  id: number;
  name: string;
}

export interface AuthUser {
  id: number;
  username: string;
  globalName: string | null;
  runescapeName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  team: AuthTeam | null;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return null;
    const data = (await res.json()) as { user: AuthUser | null };
    return data.user;
  } catch {
    // /api isn't available at all (e.g. running plain `vite` without `vercel dev`)
    return null;
  }
}

export function getLoginUrl(next: string): string {
  return `/api/auth/login?next=${encodeURIComponent(next)}`;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/me", { method: "DELETE" });
}

export async function updateRunescapeName(runescapeName: string): Promise<AuthUser> {
  const res = await fetch("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runescapeName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to update RuneScape name (${res.status})`);
  }
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}
