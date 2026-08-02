export interface AuthTeam {
  id: number;
  name: string;
}

export interface AuthUser {
  id: number;
  username: string;
  globalName: string | null;
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
