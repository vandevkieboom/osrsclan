import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { useAuth } from "../context/auth-context";
import {
  METRIC_GROUPS,
  fetchGroupRoles,
  getWomMetricIcon,
} from "../services/wom";
import {
  addTrophy,
  fetchTrophies,
  fetchWomPlayer,
  getRankForRole,
  removeTrophy,
  type RsnProfile,
  type WomPlayer,
} from "../services/profile";

const SKILL_METRICS = METRIC_GROUPS.find(
  (g) => g.groupLabel === "Skills",
)!.metrics;
const BOSS_METRICS = METRIC_GROUPS.find(
  (g) => g.groupLabel === "Bosses",
)!.metrics;

const DEFAULT_RING_COLOR = "#3a2224";
const COMBAT_LEVEL_ICON =
  "https://oldschool.runescape.wiki/images/Combat_icon.png";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "unknown";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ProfilePage() {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const [rsn, setRsn] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<WomPlayer | null>(null);
  const [profileExtras, setProfileExtras] = useState<RsnProfile | null>(null);
  const [roles, setRoles] = useState<Map<string, string> | null>(null);
  const [editingTrophies, setEditingTrophies] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDate, setNewDate] = useState("");
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    fetchGroupRoles()
      .then(setRoles)
      .catch(() => {
        /* rank ring is a nice-to-have — silently omit it if roles can't load */
      });
  }, []);

  function loadProfile(target: string) {
    setRsn(target);
    setSearchInput(target);
    setLoading(true);
    setError(null);
    setPlayer(null);
    setProfileExtras(null);
    setEditingTrophies(false);

    // Own-backend trophy/member-since data is a nice-to-have layered on top
    // of the real Wise Old Man stats — if it fails (or there's no backend
    // at all, e.g. local `vite` dev without `vercel dev`), the profile
    // should still render with an empty trophy case rather than dying.
    fetchTrophies(target)
      .then(setProfileExtras)
      .catch(() => setProfileExtras({ trophies: [], memberSince: null }));

    fetchWomPlayer(target)
      .then(setPlayer)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const fromUrl = searchParams.get("rsn");
    if (fromUrl) {
      loadProfile(fromUrl);
      return;
    }
    // Auth resolves asynchronously — wait for it before falling back to the
    // signed-in user's own saved RSN, otherwise this fires before `user` is
    // populated and never shows their own profile by default.
    if (authLoading) return;
    if (user?.runescapeName) loadProfile(user.runescapeName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  function runSearch() {
    const trimmed = searchInput.trim();
    if (!trimmed) return;
    setSearchParams({ rsn: trimmed }, { replace: true });
    loadProfile(trimmed);
  }

  function handleShare() {
    if (!rsn) return;
    const url = `${location.origin}${location.pathname}?rsn=${encodeURIComponent(rsn)}`;
    navigator.clipboard?.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1500);
  }

  async function handleAddTrophy() {
    if (!rsn || !newLabel.trim()) return;
    const trophy = await addTrophy(rsn, newLabel.trim(), newDate.trim());
    setProfileExtras((prev) =>
      prev ? { ...prev, trophies: [trophy, ...prev.trophies] } : prev,
    );
    setNewLabel("");
    setNewDate("");
  }

  async function handleRemoveTrophy(id: number) {
    await removeTrophy(id);
    setProfileExtras((prev) =>
      prev
        ? { ...prev, trophies: prev.trophies.filter((t) => t.id !== id) }
        : prev,
    );
  }

  const rank = rsn ? getRankForRole(roles?.get(rsn.toLowerCase())) : null;

  const skills = player?.latestSnapshot
    ? SKILL_METRICS.map((m) => ({
        key: m.value,
        name: m.label,
        icon: getWomMetricIcon(m.value),
        level: player.latestSnapshot!.data.skills[m.value]?.level ?? "—",
      }))
    : [];

  const bosses = player?.latestSnapshot
    ? BOSS_METRICS.map((m) => ({
        key: m.value,
        name: m.label,
        icon: getWomMetricIcon(m.value),
        kc: player.latestSnapshot!.data.bosses[m.value]?.kills ?? 0,
      }))
        .filter((b) => b.kc > 0)
        .sort((a, b) => b.kc - a.kc)
        .slice(0, 9)
    : [];

  const accountTypeLabel =
    player && player.type && player.type !== "regular"
      ? player.type.replace("_", " ").toUpperCase()
      : "";

  const memberSince = profileExtras
    ? formatDate(profileExtras.memberSince)
    : null;
  const totalLevel = player?.latestSnapshot?.data.skills.overall?.level;

  return (
    <>
      <SiteHeader />

      <div className="page">
        <div className="page-head">
          <div className="page-head-row profile-search-row">
            <div className="page-head-text">
              <div className="page-eyebrow">Clan Member</div>
              <h1 className="page-title">Member Profile</h1>
            </div>
            <div className="profile-search">
              <input
                className="profile-search-input"
                type="text"
                placeholder="Look up a member's profile"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
              <button
                type="button"
                className="admin-btn-primary"
                onClick={runSearch}
              >
                View
              </button>
            </div>
          </div>
        </div>

        {!rsn && !loading && (
          <div className="profile-state-card">
            <div className="profile-state-title">No profile loaded</div>
            <div className="profile-state-sub">
              Enter an RSN above to view a clan member's profile
              {!user?.runescapeName && ", or link your own in Settings"}.
            </div>
          </div>
        )}

        {loading && (
          <div className="profile-state-card">
            <div className="profile-state-sub">
              Loading stats from Wise Old Man…
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="profile-error-card">
            <div className="profile-state-title">Couldn't load "{rsn}"</div>
            <div className="profile-state-sub">
              {error}. Make sure the name is tracked on Wise Old Man, or try
              again.
            </div>
            <button
              type="button"
              className="admin-btn-primary"
              onClick={() => rsn && loadProfile(rsn)}
            >
              Retry
            </button>
          </div>
        )}

        {player && !loading && !error && (
          <>
            <div
              className="profile-header-card"
              style={{ borderTopColor: rank?.color ?? DEFAULT_RING_COLOR }}
            >
              <div className="profile-header-main">
                <div
                  className="profile-avatar"
                  style={{
                    borderColor: rank?.color ?? DEFAULT_RING_COLOR,
                    color: rank?.color ?? "#f0e8e6",
                  }}
                >
                  {player.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="profile-name-row">
                    <div className="profile-display-name">
                      {player.displayName}
                    </div>
                    {accountTypeLabel && (
                      <div className="profile-type-badge">
                        {accountTypeLabel}
                      </div>
                    )}
                  </div>
                  <div className="profile-rank-row">
                    {rank && (
                      <img
                        src={rank.icon}
                        alt=""
                        className="profile-rank-icon"
                      />
                    )}
                    {rank && (
                      <span
                        className="profile-rank-name"
                        style={{ color: rank.color }}
                      >
                        {rank.name}
                      </span>
                    )}
                    {memberSince && (
                      <span className="profile-member-since">
                        · Member since {memberSince}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="admin-btn-ghost profile-share-btn"
                onClick={handleShare}
              >
                {shareCopied ? "Link copied" : "Share profile"}
              </button>
            </div>

            <div className="profile-stat-chips">
              <div className="profile-stat-chip">
                <div className="profile-stat-label">Combat Level</div>
                <div className="profile-stat-value-row">
                  <img
                    src={COMBAT_LEVEL_ICON}
                    alt=""
                    className="profile-stat-icon"
                  />
                  <div className="profile-stat-value">
                    {player.combatLevel ?? "—"}
                  </div>
                </div>
              </div>
              <div className="profile-stat-chip">
                <div className="profile-stat-label">Total Level</div>
                <div className="profile-stat-value-row">
                  <img
                    src={getWomMetricIcon("overall")}
                    alt=""
                    className="profile-stat-icon"
                  />
                  <div className="profile-stat-value">
                    {totalLevel?.toLocaleString() ?? "—"}
                  </div>
                </div>
              </div>
              <div className="profile-stat-chip">
                <div className="profile-stat-label">Total XP</div>
                <div className="profile-stat-value-row">
                  <img
                    src={getWomMetricIcon("overall")}
                    alt=""
                    className="profile-stat-icon"
                  />
                  <div className="profile-stat-value">
                    {player.exp ? `${(player.exp / 1e6).toFixed(1)}M` : "—"}
                  </div>
                </div>
              </div>
              <div className="profile-stat-chip">
                <div className="profile-stat-label">EHP</div>
                <div className="profile-stat-value-row">
                  <img
                    src={getWomMetricIcon("ehp")}
                    alt=""
                    className="profile-stat-icon"
                  />
                  <div className="profile-stat-value">
                    {player.ehp ? Math.round(player.ehp) : "—"}
                  </div>
                </div>
              </div>
              <div className="profile-stat-chip">
                <div className="profile-stat-label">EHB</div>
                <div className="profile-stat-value-row">
                  <img
                    src={getWomMetricIcon("ehb")}
                    alt=""
                    className="profile-stat-icon"
                  />
                  <div className="profile-stat-value">
                    {player.ehb ? Math.round(player.ehb) : "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="profile-columns">
              <div>
                <div className="profile-card">
                  <div className="profile-card-title">Skills</div>
                  <div className="profile-skills-grid">
                    {skills.map((sk) => (
                      <div key={sk.key} className="profile-skill-row">
                        <img
                          src={sk.icon}
                          alt=""
                          className="profile-skill-icon"
                        />
                        <div className="profile-skill-name">{sk.name}</div>
                        <div className="profile-skill-level">{sk.level}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="profile-card">
                  <div className="profile-card-title">Notable boss kills</div>
                  {bosses.length > 0 ? (
                    <div className="profile-bosses-grid">
                      {bosses.map((b) => (
                        <div key={b.key} className="profile-boss-row">
                          <img
                            src={b.icon}
                            alt=""
                            className="profile-boss-icon"
                          />
                          <div className="profile-boss-info">
                            <div className="profile-boss-name">{b.name}</div>
                            <div className="profile-boss-kc">
                              {b.kc.toLocaleString()} KC
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="admin-empty">
                      No tracked boss kills yet.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="profile-card">
                  <div className="profile-card-title profile-card-title--sm">
                    Recent activity
                  </div>
                  <div className="profile-activity-text">
                    <div>Last progress synced {timeAgo(player.updatedAt)}.</div>
                    <div>
                      Last change detected {timeAgo(player.lastChangedAt)}.
                    </div>
                  </div>
                </div>

                <div className="profile-card">
                  <div className="profile-card-header">
                    <div className="profile-card-title profile-card-title--sm">
                      Trophy case
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        className="admin-btn-ghost profile-edit-toggle"
                        onClick={() => setEditingTrophies((v) => !v)}
                      >
                        {editingTrophies ? "Done" : "Edit"}
                      </button>
                    )}
                  </div>

                  {profileExtras && profileExtras.trophies.length > 0 ? (
                    <div className="profile-trophy-list">
                      {profileExtras.trophies.map((t) => (
                        <div key={t.id} className="profile-trophy-row">
                          <span className="profile-trophy-icon">🏆</span>
                          <div className="profile-trophy-info">
                            <div className="profile-trophy-label">
                              {t.label}
                            </div>
                            <div className="profile-trophy-date">{t.date}</div>
                          </div>
                          {editingTrophies && (
                            <button
                              type="button"
                              className="admin-btn-danger"
                              onClick={() => handleRemoveTrophy(t.id)}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="profile-trophy-empty">
                      No event wins recorded yet.
                    </div>
                  )}

                  {editingTrophies && (
                    <div className="profile-trophy-form">
                      <input
                        className="admin-input"
                        placeholder="e.g. Skill of the Week: Fishing — Winner"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                      />
                      <div className="profile-trophy-form-row">
                        <input
                          className="admin-input"
                          placeholder="Aug 2026"
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                        />
                        <button
                          type="button"
                          className="admin-btn-primary"
                          onClick={handleAddTrophy}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <SiteFooter />
    </>
  );
}
