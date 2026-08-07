import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { useAuth } from "../context/auth-context";

export function SettingsPage() {
  const { user, isLoading, login, updateProfile } = useAuth();

  return (
    <>
      <SiteHeader />

      <div className="page">
        <div className="page-head">
          <div className="page-eyebrow">
            <span className="page-eyebrow-line" />
            Account
          </div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Manage your account and site preferences.</p>
        </div>

        {isLoading ? null : !user ? (
          <div className="rank-card settings-login-card">
            <p>Log in with Discord to manage your settings.</p>
            <button type="button" className="tracker-btn" onClick={() => login("/settings")}>
              Log in with Discord
            </button>
          </div>
        ) : (
          <SettingsContent
            avatarUrl={user.avatarUrl}
            username={user.globalName ?? user.username}
            runescapeName={user.runescapeName}
            rememberRankings={user.rememberRankings}
            onUpdate={updateProfile}
          />
        )}
      </div>

      <SiteFooter />
    </>
  );
}

function SettingsContent({
  avatarUrl,
  username,
  runescapeName,
  rememberRankings,
  onUpdate,
}: {
  avatarUrl: string | null;
  username: string;
  runescapeName: string | null;
  rememberRankings: boolean;
  onUpdate: (patch: { runescapeName?: string; rememberRankings?: boolean }) => Promise<void>;
}) {
  const [nameInput, setNameInput] = useState(runescapeName ?? "");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isRemember, setIsRemember] = useState(rememberRankings);

  useEffect(() => {
    if (!nameSaved) return;
    const timer = setTimeout(() => setNameSaved(false), 1500);
    return () => clearTimeout(timer);
  }, [nameSaved]);

  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    setIsSavingName(true);
    setNameError(null);
    try {
      await onUpdate({ runescapeName: nameInput.trim() });
      setNameSaved(true);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Failed to save name");
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleToggleRemember() {
    const next = !isRemember;
    setIsRemember(next);
    try {
      await onUpdate({ rememberRankings: next });
    } catch {
      setIsRemember(!next);
    }
  }

  return (
    <div className="settings-cards">
      <section className="settings-card">
        <h2 className="settings-card-title">Account</h2>
        <div className="settings-account-row">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="settings-account-avatar" />
          ) : (
            <span className="settings-account-avatar settings-account-avatar--placeholder" aria-hidden="true">
              {username.charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <div className="settings-account-name">{username}</div>
            <div className="settings-account-sub">Connected via Discord</div>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <h2 className="settings-card-title">RuneScape name</h2>
        <p className="settings-card-helper">
          Linking your RSN powers your shareable profile and rank verification.
        </p>
        <form className="settings-rsn-form" onSubmit={handleSaveName}>
          <input
            type="text"
            className="settings-rsn-input"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Your RSN"
            maxLength={30}
          />
          <button type="submit" className="settings-rsn-save" disabled={isSavingName}>
            {isSavingName ? "Saving…" : nameSaved ? "Saved" : "Save"}
          </button>
        </form>
        {nameError && <div className="settings-rsn-error">{nameError}</div>}
      </section>

      <section className="settings-card">
        <h2 className="settings-card-title">Preferences</h2>
        <label className="settings-checkbox-row">
          <input type="checkbox" checked={isRemember} onChange={handleToggleRemember} />
          <span>
            <span className="settings-checkbox-label">Remember me on the Rankings page</span>
            <span className="settings-checkbox-helper">
              Every time you visit Rankings, your RSN is filled in and verified automatically.
            </span>
          </span>
        </label>
      </section>

      <Link to="/profile" className="settings-profile-link">
        View your profile →
      </Link>
    </div>
  );
}
