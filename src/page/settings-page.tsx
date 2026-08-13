import { useEffect, useState, type FormEvent } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { useAuth } from "../context/auth-context";
import {
  createPluginToken,
  fetchPluginTokens,
  revokePluginToken,
  type PluginToken,
} from "../services/auth";

export function SettingsPage() {
  const { user, isLoading, login, updateSettings } = useAuth();
  const [rsName, setRsName] = useState(user?.runescapeName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tokens, setTokens] = useState<PluginToken[] | null>(null);
  const [tokenLabel, setTokenLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  // Holds the one and only time we can show the raw secret, until dismissed.
  const [newToken, setNewToken] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchPluginTokens()
      .then((list) => {
        if (!cancelled) setTokens(list);
      })
      .catch(() => {
        if (!cancelled) setTokens([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleGenerateToken(e: FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setTokenError(null);
    try {
      const created = await createPluginToken(tokenLabel.trim());
      setNewToken(created.token);
      setTokenLabel("");
      setTokens(await fetchPluginTokens());
    } catch (err) {
      setTokenError(
        err instanceof Error ? err.message : "Failed to create plugin key",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevokeToken(id: number) {
    if (
      !window.confirm(
        "Revoke this key? Any RuneLite install using it will stop submitting.",
      )
    )
      return;
    setTokenError(null);
    try {
      await revokePluginToken(id);
      setTokens(await fetchPluginTokens());
    } catch (err) {
      setTokenError(
        err instanceof Error ? err.message : "Failed to revoke plugin key",
      );
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateSettings({ runescapeName: rsName.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save Old School Runescape name",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleRemember() {
    try {
      await updateSettings({ rememberRankings: !user?.rememberRankings });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update preference",
      );
    }
  }

  if (isLoading) return null;

  if (!user) {
    return (
      <>
        <SiteHeader />
        <div className="page">
          <div className="page-head">
            <div className="page-eyebrow">Account</div>
            <h1 className="page-title">Settings</h1>
            <p className="page-sub">
              Manage your account and site preferences. Link your Old School
              Runescape name and choose whether the leaderboard remembers your
              search.
            </p>
          </div>
          <div className="bingo-admin-empty">
            Log in with Discord to manage your settings.
            <div className="bingo-login-prompt">
              <button
                type="button"
                className="site-header-login"
                onClick={() => login("/settings")}
              >
                Log in with Discord
              </button>
            </div>
          </div>
        </div>
        <SiteFooter />
      </>
    );
  }

  const displayName = user.globalName ?? user.username;

  return (
    <>
      <SiteHeader />

      <div className="page settings-page">
        <div className="page-head">
          <div className="page-eyebrow">Account</div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            Manage your account and site preferences. Link your Old School
            Runescape name and choose whether the leaderboard remembers your
            search.
          </p>
        </div>

        <div className="profile-card">
          <div className="profile-card-title profile-card-title--sm">
            Account
          </div>
          <div className="settings-account-row">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="settings-avatar" />
            ) : (
              <span className="settings-avatar site-header-avatar--placeholder">
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <div className="settings-account-name">{displayName}</div>
              <div className="settings-account-sub">Connected via Discord</div>
            </div>
          </div>
        </div>

        <form className="profile-card" onSubmit={handleSave}>
          <div className="profile-card-title profile-card-title--sm">
            Old School Runescape name
          </div>
          <p className="settings-field-hint">
            Linking your OSRS name powers your shareable profile and rank
            verification.
          </p>
          <div className="settings-rsn-row">
            <input
              className="admin-input admin-input--wide"
              type="text"
              placeholder="Your OSRS name"
              value={rsName}
              maxLength={30}
              onChange={(e) => setRsName(e.target.value)}
            />
            <button
              type="submit"
              className="admin-btn-primary"
              disabled={saving}
            >
              {saved ? "Saved" : saving ? "Saving…" : "Save"}
            </button>
          </div>
          {error && <div className="admin-error">{error}</div>}
        </form>

        <div className="profile-card">
          <div className="profile-card-title profile-card-title--sm">
            Preferences
          </div>
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={user.rememberRankings}
              onChange={handleToggleRemember}
            />
            <div>
              <div className="settings-checkbox-label">
                Remember me on the Rankings page
              </div>
              <div className="settings-checkbox-hint">
                Every time you visit Rankings, your OSRS name is filled in and
                verified automatically.
              </div>
            </div>
          </label>
        </div>

        <div className="profile-card">
          <div className="profile-card-title profile-card-title--sm">
            RuneLite plugin keys
          </div>
          <p className="settings-field-hint">
            Paste a key into the clan bingo RuneLite plugin and it will submit
            tile proofs for you automatically when you get a drop. Treat a key
            like a password.
          </p>

          {newToken && (
            <div className="settings-token-new">
              <div className="settings-token-new-label">
                Your new key: copy it now, it won&apos;t be shown again.
              </div>
              <code className="settings-token-value">{newToken}</code>
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={() => setNewToken(null)}
              >
                Done
              </button>
            </div>
          )}

          <form className="settings-rsn-row" onSubmit={handleGenerateToken}>
            <input
              className="admin-input admin-input--wide"
              type="text"
              placeholder="Label (e.g. my desktop)"
              value={tokenLabel}
              maxLength={60}
              onChange={(e) => setTokenLabel(e.target.value)}
            />
            <button
              type="submit"
              className="admin-btn-primary"
              disabled={generating}
            >
              {generating ? "Generating…" : "Generate key"}
            </button>
          </form>

          {tokens && tokens.length > 0 && (
            <div className="admin-row-list settings-token-list">
              {tokens.map((token) => (
                <div key={token.id} className="admin-row">
                  <span className="admin-row-name">
                    {token.label || "Unnamed key"}
                  </span>
                  <span className="admin-row-meta">
                    {token.lastUsedAt
                      ? `last used ${new Date(token.lastUsedAt).toLocaleDateString()}`
                      : "never used"}
                  </span>
                  <button
                    type="button"
                    className="admin-btn-danger"
                    onClick={() => handleRevokeToken(token.id)}
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
          {tokens && tokens.length === 0 && (
            <div className="admin-empty">No plugin keys yet.</div>
          )}
          {tokenError && <div className="admin-error">{tokenError}</div>}
        </div>
      </div>

      <SiteFooter />
    </>
  );
}
