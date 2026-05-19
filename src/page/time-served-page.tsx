import { useEffect, useMemo, useState, useRef } from "react";
import RankCard from "../components/rank-card";
import ranks from "../data/ranks-data";
import Ruleset from "../components/rule-set";
import { fetchRuneProfile, type RuneProfile } from "../services/runeprofile";
import { checkRequirement } from "../services/rank-checker";

type StateMap = Record<string, boolean>;
type SavedProgress = {
  completed: StateMap;
  hideCompleted: boolean;
};

const STORAGE_KEY = "clan-rankings-progress-v1";

const getKey = (rankIndex: number, itemIndex: number) =>
  `${rankIndex}-${itemIndex}`;

export const ClanRankings = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [completed, setCompleted] = useState<StateMap>({});
  const [hideCompleted, setHideCompleted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState<RuneProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.2;
      if (isPlaying) {
        audioRef.current.play().catch(() => {});
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);
  const handleAudioToggle = () => {
    setIsPlaying((prev) => !prev);
  };

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as SavedProgress;
      setCompleted(parsed.completed ?? {});
      setHideCompleted(Boolean(parsed.hideCompleted));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const payload: SavedProgress = {
      completed,
      hideCompleted,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [completed, hideCompleted]);

  const apiVerified = useMemo<StateMap>(() => {
    if (!profile) return {};
    const result: StateMap = {};
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

  const loadProfile = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;
    setProfileLoading(true);
    setProfileError(null);
    setCompleted({});
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

  const getRankStats = (rankIndex: number) => {
    const total = ranks[rankIndex].items.length;
    const requiredCount = Math.max(total - 1, 0);
    let satisfiedCount = 0;

    ranks[rankIndex].items.forEach((_, itemIndex) => {
      const key = getKey(rankIndex, itemIndex);
      if (completed[key] || apiVerified[key]) {
        satisfiedCount += 1;
      }
    });

    return {
      total,
      requiredCount,
      satisfiedCount,
      isSatisfied: satisfiedCount >= requiredCount,
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
  }, [completed, apiVerified]);

  const priorRanksMetByRank = useMemo(() => {
    return ranks.map((_, rankIndex) => {
      for (let i = 0; i < rankIndex; i += 1) {
        if (!getRankStats(i).isSatisfied) {
          return false;
        }
      }
      return true;
    });
  }, [completed, apiVerified]);

  const highestEligibleRank = useMemo(() => {
    let lastEligible = -1;
    eligibleByRank.forEach((isEligible, rankIndex) => {
      if (isEligible) {
        lastEligible = rankIndex;
      }
    });
    return lastEligible;
  }, [eligibleByRank]);

  const cycleItemState = (rankIndex: number, itemIndex: number) => {
    const key = getKey(rankIndex, itemIndex);
    setCompleted((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetAll = () => {
    setCompleted({});
    setProfile(null);
    setProfileError(null);
  };

  return (
    <>
      <audio
        ref={audioRef}
        src="/The_Gauntlet.ogg"
        autoPlay
        loop
        style={{ display: "none" }}
      />
      <div className="page">
        <div className="header">
          <div className="header-actions">
            <button
              type="button"
              onClick={handleAudioToggle}
              className="audio-toggle-btn"
              aria-label={isPlaying ? "Pause music" : "Play music"}
            >
              {isPlaying ? "Pause Music" : "Play Music"}
            </button>
          </div>
          <div className="header-deco">
            <h1 className="title">Time Served</h1>
          </div>
          <div className="subtitle">Clan Rank Progression</div>
          <div className="divider"></div>
          <div className="tracker-summary">
            Current highest eligible rank:{" "}
            <strong
              style={{
                color:
                  highestEligibleRank >= 0
                    ? ranks[highestEligibleRank].color
                    : undefined,
                fontFamily: "MedievalSharp, Arial, Helvetica, sans-serif",
              }}
            >
              {highestEligibleRank >= 0
                ? ranks[highestEligibleRank].name
                : "None yet"}
            </strong>
          </div>
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
              <input
                className="profile-lookup-input"
                type="text"
                placeholder="RuneScape username"
                value={username}
                maxLength={12}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadProfile()}
                aria-label="RuneScape username"
              />
              <button
                type="button"
                className="tracker-btn profile-lookup-btn"
                onClick={loadProfile}
                disabled={profileLoading || !username.trim()}
              >
                {profileLoading ? "Loading..." : "Auto-Verify"}
              </button>
            </div>
            {profileError && (
              <div className="profile-lookup-error">{profileError}</div>
            )}
            {profile && !profileError && (
              <div className="profile-lookup-success">
                Verified as <strong>{profile.username}</strong> — items
                auto-marked in blue
              </div>
            )}
          </div>
        </div>
        <div className="ranks-grid">
          {ranks.map((rank, rankIndex) => (
            <RankCard
              key={rank.name}
              {...rank}
              rankIndex={rankIndex}
              completed={completed}
              apiVerified={apiVerified}
              hideCompleted={hideCompleted}
              eligible={eligibleByRank[rankIndex]}
              priorRanksMet={priorRanksMetByRank[rankIndex]}
              onCycleState={cycleItemState}
            />
          ))}
          <Ruleset />
        </div>
      </div>
    </>
  );
};
