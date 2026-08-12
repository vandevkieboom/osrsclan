import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import RankCard from "../components/rank-card";
import ranks from "../data/ranks-data";
import { useAuth } from "../context/auth-context";
import {
  fetchRuneProfile,
  getBossKc,
  type RuneProfile,
} from "../services/runeprofile";
import {
  checkRequirement,
  computeClanRankProgress,
  getRequirementProgress,
} from "../services/rank-checker";
import type { CheckResult } from "../types/item";
import ClanLeaderboard from "../components/clan-leaderboard";
import {
  addVerifiedItem,
  fetchVerifiedItems,
  removeVerifiedItem,
} from "../services/profile";

const STORAGE_KEY = "clan-rankings-hide-completed-v1";

const getKey = (rankIndex: number, itemIndex: number) =>
  `${rankIndex}-${itemIndex}`;

export const ClanRankings = () => {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<"progress" | "leaderboard">("progress");
  const [hideCompleted, setHideCompleted] = useState(false);

  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState<RuneProfile | null>(null);
  const [profileRsn, setProfileRsn] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [verifiedItemNames, setVerifiedItemNames] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      setHideCompleted(Boolean(JSON.parse(raw)));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hideCompleted));
  }, [hideCompleted]);

  const apiVerified = useMemo<Record<string, CheckResult>>(() => {
    if (!profile) {
      return {};
    }

    const result: Record<string, CheckResult> = {};
    ranks.forEach((rank, rankIndex) => {
      rank.items.forEach((item, itemIndex) => {
        if (item.apiCheck) {
          const key = getKey(rankIndex, itemIndex);
          result[key] = checkRequirement(item.apiCheck, profile);
        }
      });
    });
    return result;
  }, [profile]);

  const apiProgress = useMemo<
    Record<string, { found: number; required: number }>
  >(() => {
    if (!profile) return {};
    const result: Record<string, { found: number; required: number }> = {};
    ranks.forEach((rank, rankIndex) => {
      rank.items.forEach((item, itemIndex) => {
        if (item.multiItem && item.apiCheck) {
          const progress = getRequirementProgress(item.apiCheck, profile);
          if (progress) {
            result[getKey(rankIndex, itemIndex)] = progress;
          }
        }
      });
    });
    return result;
  }, [profile]);

  const loadProfile = async (usernameArg?: string) => {
    const trimmed = (usernameArg ?? username).trim();
    if (!trimmed) {
      return;
    }

    setSearchParams({ u: trimmed }, { replace: true });
    setProfileLoading(true);
    setProfileError(null);
    try {
      const [data, verified] = await Promise.all([
        fetchRuneProfile(trimmed),
        fetchVerifiedItems(trimmed).catch(() => new Set<string>()),
      ]);
      setProfile(data);
      setProfileRsn(trimmed);
      setVerifiedItemNames(verified);
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Failed to load profile.",
      );
    } finally {
      setProfileLoading(false);
    }
  };

  // Optimistic — flips immediately, then rolls back if the request fails.
  // Only reachable by admins (see canEditVerification on RankCard below).
  const toggleVerification = async (itemName: string) => {
    if (!profileRsn) return;
    const key = itemName.toLowerCase();
    const wasVerified = verifiedItemNames.has(key);

    setVerifiedItemNames((prev) => {
      const next = new Set(prev);
      if (wasVerified) next.delete(key);
      else next.add(key);
      return next;
    });

    try {
      if (wasVerified) {
        await removeVerifiedItem(profileRsn, itemName);
      } else {
        await addVerifiedItem(profileRsn, itemName);
      }
    } catch {
      setVerifiedItemNames((prev) => {
        const next = new Set(prev);
        if (wasVerified) next.add(key);
        else next.delete(key);
        return next;
      });
    }
  };

  useEffect(() => {
    const u = searchParams.get("u");
    if (u) {
      setUsername(u);
      loadProfile(u);
      return;
    }
    // Auth resolves asynchronously — wait for it before applying the
    // "remember me on Rankings" auto-verify fallback.
    if (authLoading) return;
    if (user?.rememberRankings && user.runescapeName) {
      setUsername(user.runescapeName);
      loadProfile(user.runescapeName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const clanProgress = useMemo(
    () => computeClanRankProgress(ranks, profile, verifiedItemNames),
    [profile, verifiedItemNames],
  );
  const {
    eligibleByRank,
    priorRanksMetByRank,
    highestEligibleRankIndex: highestEligibleRank,
  } = clanProgress;

  const overallStats = useMemo(
    () => ({
      total: clanProgress.overallTotal,
      satisfied: clanProgress.overallSatisfied,
      pct: clanProgress.overallTotal
        ? Math.round(
            (clanProgress.overallSatisfied / clanProgress.overallTotal) * 100,
          )
        : 0,
    }),
    [clanProgress],
  );

  const resetAll = () => {
    setUsername("");
    setProfile(null);
    setProfileError(null);
    setProfileRsn("");
    setVerifiedItemNames(new Set());
  };

  return (
    <>
      <SiteHeader />

      <div className="page">
        <div className="page-head page-head--rankings">
          <div className="page-head-text">
            <div className="page-eyebrow">Rank requirements</div>
            <h1 className="page-title">Clan Ranks</h1>
            <p className="page-sub">
              Rankings are based on your collection log. Install the RuneProfile
              plugin to auto-verify yourself. Not everything can be tracked
              through the collection log.
            </p>
          </div>
        </div>

        <div className="rankings-view-tabs">
          <button
            type="button"
            className={`rankings-view-tab${view === "progress" ? " active" : ""}`}
            onClick={() => setView("progress")}
          >
            MY PROGRESS
          </button>
          <button
            type="button"
            className={`rankings-view-tab${view === "leaderboard" ? " active" : ""}`}
            onClick={() => setView("leaderboard")}
          >
            LEADERBOARD
          </button>
        </div>

        {view === "leaderboard" ? (
          <ClanLeaderboard />
        ) : (
          <>
            <div className="badge-legend">
              <span className="legend-item">
                <span className="legend-badge api-verified">✓</span>
                Verified
              </span>
              <span className="legend-item">
                <span className="legend-badge api-alt">~</span>
                Alternative Item
              </span>
            </div>
            <div className="overall-progress">
              <div className="overall-progress-row">
                <div className="overall-progress-label">
                  Current highest eligible rank:{" "}
                  <strong
                    style={{
                      color:
                        highestEligibleRank >= 0
                          ? ranks[highestEligibleRank].textColor
                          : "#f0e8e6",
                      fontFamily: "MedievalSharp, Arial, Helvetica, sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    {highestEligibleRank >= 0
                      ? ranks[highestEligibleRank].name
                      : "None yet"}
                  </strong>
                </div>
                <div className="overall-progress-count">
                  {overallStats.satisfied} / {overallStats.total} items
                  collected
                </div>
              </div>
              <div className="overall-progress-track">
                <div
                  className="overall-progress-fill"
                  style={{ width: `${overallStats.pct}%` }}
                />
              </div>
            </div>

            <div className="tracker-controls">
              <div className="tracker-toolbar">
                <button
                  type="button"
                  className="tracker-btn"
                  onClick={resetAll}
                >
                  Reset Progress
                </button>
                <button
                  type="button"
                  className={`tracker-btn ${hideCompleted ? "active" : ""}`}
                  onClick={() => setHideCompleted((prev) => !prev)}
                >
                  {hideCompleted ? "Show Completed" : "Hide Completed"}
                </button>
              </div>
              <div className="profile-lookup">
                <div className="profile-lookup-row">
                  {profile && !profileError && (
                    <div className="profile-lookup-success">
                      Clan Req:{" "}
                      {(() => {
                        const enhancedSeedCount =
                          profile.itemMap.get("enhanced crystal weapon seed") ??
                          0;
                        const armourSeeds = Math.max(
                          profile.itemMap.get("crystal armour seed") ?? 0,
                          profile.itemMap.get("crystal armor seed") ?? 0,
                        );
                        if (enhancedSeedCount >= 1 && armourSeeds >= 6) {
                          return (
                            <span
                              style={{ color: "var(--green)", fontWeight: 600 }}
                            >
                              ✓ {enhancedSeedCount} Enhanced Crystal Weapon Seed
                              {enhancedSeedCount > 1 ? "s" : ""} + {armourSeeds}{" "}
                              Crystal Armour Seed
                              {armourSeeds > 1 ? "s" : ""}
                            </span>
                          );
                        }
                        const cgKc = getBossKc(profile.bossKcMap, [
                          "corrupted gauntlet",
                          "the corrupted gauntlet",
                        ]);
                        if (cgKc >= 800) {
                          return (
                            <span
                              style={{ color: "var(--green)", fontWeight: 600 }}
                            >
                              ✓ Corrupted Gauntlet ({cgKc} kc)
                            </span>
                          );
                        }
                        if ((profile.itemMap.get("twisted bow") ?? 0) >= 1) {
                          return (
                            <span
                              style={{ color: "var(--green)", fontWeight: 600 }}
                            >
                              ✓ Twisted Bow
                            </span>
                          );
                        }
                        return (
                          <span style={{ color: "#ff5364", fontWeight: 600 }}>
                            ✗ Not met (or RuneProfile outdated)
                          </span>
                        );
                      })()}
                    </div>
                  )}
                  <input
                    className="profile-lookup-input"
                    type="text"
                    placeholder="OSRS name"
                    value={username}
                    maxLength={12}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadProfile()}
                    aria-label="OSRS name"
                  />
                  <button
                    type="button"
                    className="tracker-btn profile-lookup-btn"
                    onClick={() => loadProfile()}
                    disabled={profileLoading || !username.trim()}
                  >
                    {profileLoading ? "Loading..." : "Auto-Verify"}
                  </button>
                </div>
                {profileError && (
                  <div className="profile-lookup-error">{profileError}</div>
                )}
              </div>
            </div>
            <div className="ranks-grid">
              {ranks.map((rank, rankIndex) => (
                <RankCard
                  key={rank.name}
                  {...rank}
                  rankIndex={rankIndex}
                  apiVerified={apiVerified}
                  apiProgress={apiProgress}
                  hideCompleted={hideCompleted}
                  eligible={eligibleByRank[rankIndex]}
                  priorRanksMet={priorRanksMetByRank[rankIndex]}
                  stats={clanProgress.rankStats[rankIndex]}
                  verifiedItemNames={verifiedItemNames}
                  canEditVerification={isAdmin && !!profile}
                  onToggleVerification={toggleVerification}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <SiteFooter />
    </>
  );
};
