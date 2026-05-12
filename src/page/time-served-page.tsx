import { useEffect, useMemo, useState, useRef } from "react";
import RankCard from "../components/rank-card";
import ranks from "../data/ranks-data";
import Ruleset from "../components/rule-set";

type StateMap = Record<string, boolean>;
type SavedProgress = {
  completed: StateMap;
  hideCompleted: boolean;
};

const STORAGE_KEY = "clan-rankings-progress-v1";

const getKey = (rankIndex: number, itemIndex: number) =>
  `${rankIndex}-${itemIndex}`;

export const ClanRankings = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [completed, setCompleted] = useState<StateMap>({});
  const [hideCompleted, setHideCompleted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

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

  const getRankStats = (rankIndex: number) => {
    const total = ranks[rankIndex].items.length;
    const requiredCount = Math.max(total - 1, 0);
    let satisfiedCount = 0;

    ranks[rankIndex].items.forEach((_, itemIndex) => {
      const key = getKey(rankIndex, itemIndex);
      if (completed[key]) {
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
  }, [completed]);

  const priorRanksMetByRank = useMemo(() => {
    return ranks.map((_, rankIndex) => {
      for (let i = 0; i < rankIndex; i += 1) {
        if (!getRankStats(i).isSatisfied) {
          return false;
        }
      }
      return true;
    });
  }, [completed]);

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
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <button
              type="button"
              onClick={handleAudioToggle}
              style={{
                background: "#222",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: 6,
                padding: "4px 14px",
                fontFamily: "inherit",
                fontSize: 14,
                cursor: "pointer",
                marginRight: 4,
                opacity: 0.85,
                transition: "background 0.2s, color 0.2s",
              }}
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
        </div>
        <div className="ranks-grid">
          {ranks.map((rank, rankIndex) => (
            <RankCard
              key={rank.name}
              {...rank}
              rankIndex={rankIndex}
              completed={completed}
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
