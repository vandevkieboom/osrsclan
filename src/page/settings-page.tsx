import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { useAuth } from "../context/auth-context";

export function SettingsPage() {
  const { user, isLoading, login, updateSettings } = useAuth();
  const [rsName, setRsName] = useState(user?.runescapeName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        err instanceof Error ? err.message : "Failed to save RuneScape name",
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
            <p className="page-sub">Manage your account and site preferences. Link your RuneScape name and
            choose whether the leaderboard remembers your search.</p>
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
          <p className="page-sub">Manage your account and site preferences. Link your RuneScape name and
            choose whether the leaderboard remembers your search.</p>
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

        {user.runescapeName && (
          <Link
            to={`/profile?rsn=${encodeURIComponent(user.runescapeName)}`}
            className="settings-profile-link"
          >
            View your profile →
          </Link>
        )}
      </div>

      <SiteFooter />
    </>
  );
}
