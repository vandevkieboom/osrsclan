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
  getRequirementProgress,
} from "../services/rank-checker";
import type { Item, CheckResult } from "../components/item-card";

const STORAGE_KEY = "clan-rankings-hide-completed-v1";

const getKey = (rankIndex: number, itemIndex: number) =>
  `${rankIndex}-${itemIndex}`;

export const ClanRankings = () => {
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [hideCompleted, setHideCompleted] = useState(false);

  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState<RuneProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

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
      const data = await fetchRuneProfile(trimmed);
      setProfile(data);
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Failed to load profile.",
      );
    } finally {
      setProfileLoading(false);
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

  const isMultiItemHardFail = (
    item: Item,
    apiKey: CheckResult | undefined,
  ): boolean => {
    if (!item.multiItem || apiKey !== "fail" || !item.apiCheck) return false;
    switch (item.apiCheck.type) {
      case "collection-count":
      case "collection-quantity":
      case "collection-piece-types":
      case "collection-full-groups":
      case "collection-any-group":
        return item.apiCheck.required >= 2;
      case "collection-masori-f":
        return true;
      default:
        return false;
    }
  };

  const getRankStats = (rankIndex: number) => {
    const total = ranks[rankIndex].items.length;
    const requiredCount = Math.max(total - 1, 0);
    let satisfiedCount = 0;
    let hardFailCount = 0;

    ranks[rankIndex].items.forEach((item, itemIndex) => {
      const key = getKey(rankIndex, itemIndex);
      const apiKey = apiVerified[key];
      if (apiKey === "pass" || apiKey === "pass-alt") {
        satisfiedCount += 1;
      } else if (isMultiItemHardFail(item, apiKey)) {
        hardFailCount += 1;
      }
      // "partial" = has required-1 items, eligible for the rank-level skip (not counted as satisfied)
      // "fail" on single-item check = also eligible for the rank-level skip
    });

    return {
      total,
      requiredCount,
      satisfiedCount,
      isSatisfied: satisfiedCount >= requiredCount && hardFailCount === 0,
    };
  };

  const eligibleByRank = useMemo(() => {
    return ranks.map((_, rankIndex) => {
      for (let i = 0; i <= rankIndex; i += 1) {
        if (!getRankStats(i).isSatisfied) {
          return false;
        }
      }
      return true;
    });
  }, [apiVerified]);

  const priorRanksMetByRank = useMemo(() => {
    return ranks.map((_, rankIndex) => {
      for (let i = 0; i < rankIndex; i += 1) {
        if (!getRankStats(i).isSatisfied) {
          return false;
        }
      }
      return true;
    });
  }, [apiVerified]);

  const highestEligibleRank = useMemo(() => {
    let lastEligible = -1;
    eligibleByRank.forEach((isEligible, rankIndex) => {
      if (isEligible) {
        lastEligible = rankIndex;
      }
    });
    return lastEligible;
  }, [eligibleByRank]);

  const overallStats = useMemo(() => {
    let total = 0;
    let satisfied = 0;
    ranks.forEach((_, rankIndex) => {
      const stats = getRankStats(rankIndex);
      total += stats.total;
      satisfied += stats.satisfiedCount;
    });
    return {
      total,
      satisfied,
      pct: total ? Math.round((satisfied / total) * 100) : 0,
    };
  }, [apiVerified]);

  const resetAll = () => {
    setUsername("");
    setProfile(null);
    setProfileError(null);
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
              {overallStats.satisfied} / {overallStats.total} items collected
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
            <button type="button" className="tracker-btn" onClick={resetAll}>
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
                      profile.itemMap.get("enhanced crystal weapon seed") ?? 0;
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
                placeholder="Solo Nostalg"
                value={username}
                maxLength={12}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadProfile()}
                aria-label="Solo Nostalg"
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
              stats={getRankStats(rankIndex)}
            />
          ))}
        </div>
      </div>

      <SiteFooter />
    </>
  );
};
