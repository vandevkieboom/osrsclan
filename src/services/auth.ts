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
  rememberRankings: boolean;
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

export async function updateSettings(patch: {
  runescapeName?: string;
  rememberRankings?: boolean;
}): Promise<AuthUser> {
  const res = await fetch("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to update settings (${res.status})`);
  }
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

const PLUGIN_TOKENS_URL = "/api/auth/me?resource=plugin-tokens";

/** A RuneLite plugin token. The secret itself is only ever returned once, at
 *  creation — afterwards only this metadata is retrievable. */
export interface PluginToken {
  id: number;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

async function pluginTokenJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `${fallback} (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchPluginTokens(): Promise<PluginToken[]> {
  const res = await fetch(PLUGIN_TOKENS_URL);
  const data = await pluginTokenJson<{ tokens: PluginToken[] }>(
    res,
    "Failed to load plugin keys",
  );
  return data.tokens;
}

export async function createPluginToken(
  label: string,
): Promise<PluginToken & { token: string }> {
  const res = await fetch(PLUGIN_TOKENS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  return pluginTokenJson<PluginToken & { token: string }>(
    res,
    "Failed to create plugin key",
  );
}

export async function revokePluginToken(id: number): Promise<void> {
  const res = await fetch(`${PLUGIN_TOKENS_URL}&id=${id}`, {
    method: "DELETE",
  });
  await pluginTokenJson<{ ok: true }>(res, "Failed to revoke plugin key");
}
