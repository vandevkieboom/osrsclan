import React from "react";
import ItemCard, { type Item, type CheckResult } from "./item-card";

export type Rank = {
  name: string;
  color: string;
  textColor: string;
  icon: string;
  items: Item[];
};

type RankStats = {
  total: number;
  requiredCount: number;
  satisfiedCount: number;
  isSatisfied: boolean;
};

type RankCardProps = Rank & {
  rankIndex: number;
  completed: Record<string, boolean>;
  apiVerified: Record<string, CheckResult>;
  apiProgress: Record<string, { found: number; required: number }>;
  hideCompleted: boolean;
  eligible: boolean;
  priorRanksMet: boolean;
  stats: RankStats;
  onCycleState: (rankIndex: number, itemIndex: number) => void;
};

const RankCard: React.FC<RankCardProps> = ({
  name,
  color,
  textColor,
  icon,
  items,
  rankIndex,
  completed,
  apiVerified,
  apiProgress,
  hideCompleted,
  eligible,
  priorRanksMet,
  stats,
  onCycleState,
}) => {
  const rankStateClass = eligible
    ? "eligible"
    : priorRanksMet
      ? "progress"
      : "locked";
  const rankStateText = eligible
    ? "Eligible"
    : priorRanksMet
      ? "Complete this rank"
      : "Missing prior rank requirements";

  const pct = stats.total
    ? Math.round((stats.satisfiedCount / stats.total) * 100)
    : 0;

  return (
    <div
      className={`rank-card${eligible ? " is-eligible" : ""}`}
      style={
        {
          "--rank-color": color,
          "--rank-text-color": textColor,
        } as React.CSSProperties
      }
    >
      <div className="rank-header">
        <img
          className="rank-gem"
          src={icon}
          alt={`${name} Clan Icon`}
          referrerPolicy="no-referrer"
        />
        <span className="rank-name">{name}</span>
      </div>
      <div className={`rank-state ${rankStateClass}`}>{rankStateText}</div>
      <div className="rank-progress-track">
        <div className="rank-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="rank-progress-count">
        {stats.satisfiedCount} / {stats.total} complete ({stats.requiredCount}{" "}
        needed)
      </div>
      <div className="items-grid">
        {items.map((item, itemIndex) => {
          const key = `${rankIndex}-${itemIndex}`;
          const isManual = Boolean(completed[key]);
          const apiResult = apiVerified[key] ?? null;
          const isApiDone = apiResult === "pass" || apiResult === "pass-alt";
          if (hideCompleted && (isManual || isApiDone)) {
            return null;
          }

          return (
            <ItemCard
              key={key}
              {...item}
              isCompleted={isManual}
              apiResult={apiResult}
              progress={apiProgress[key] ?? null}
              onCycleState={() => onCycleState(rankIndex, itemIndex)}
            />
          );
        })}
      </div>
    </div>
  );
};

export default RankCard;
