import React from "react";
import ItemCard, { type Item, type CheckResult } from "./item-card.js";

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
  apiVerified: Record<string, CheckResult>;
  apiProgress: Record<string, { found: number; required: number }>;
  hideCompleted: boolean;
  eligible: boolean;
  priorRanksMet: boolean;
  stats: RankStats;
  verifiedItemNames: Set<string>;
  canEditVerification: boolean;
  onToggleVerification: (itemName: string) => void;
};

const RankCard: React.FC<RankCardProps> = ({
  name,
  color,
  textColor,
  icon,
  items,
  rankIndex,
  apiVerified,
  apiProgress,
  hideCompleted,
  eligible,
  priorRanksMet,
  stats,
  verifiedItemNames,
  canEditVerification,
  onToggleVerification,
}) => {
  // Ranks are cumulative, so "progress" (prior ranks met, this one isn't
  // yet) can only ever be true for a single rank at a time — the next one
  // up. Everything after it is necessarily "locked" (a prior rank failed).
  const rankStateClass = eligible
    ? "eligible"
    : priorRanksMet
      ? "progress"
      : "locked";
  const isNext = rankStateClass === "progress";
  const rankStateText = eligible ? "Eligible" : isNext ? "In Progress" : "Locked";

  const pct = stats.total
    ? Math.round((stats.satisfiedCount / stats.total) * 100)
    : 0;

  const cardStateClass = eligible
    ? " is-eligible"
    : isNext
      ? " is-next"
      : " is-locked";

  return (
    <div
      className={`rank-card${cardStateClass}`}
      style={
        {
          "--rank-color": color,
          "--rank-text-color": textColor,
        } as React.CSSProperties
      }
    >
      {isNext && <div className="rank-next-badge">Next Up</div>}
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
          const apiResult = apiVerified[key] ?? null;
          const isUntrackable = !item.apiCheck;
          const isManuallyVerified =
            isUntrackable && verifiedItemNames.has(item.name.toLowerCase());
          const isApiDone =
            apiResult === "pass" || apiResult === "pass-alt" || isManuallyVerified;
          if (hideCompleted && isApiDone) {
            return null;
          }

          return (
            <ItemCard
              key={key}
              {...item}
              apiResult={apiResult}
              progress={apiProgress[key] ?? null}
              isUntrackable={isUntrackable}
              isManuallyVerified={isManuallyVerified}
              canEditVerification={canEditVerification && isUntrackable}
              onToggleVerification={
                isUntrackable ? () => onToggleVerification(item.name) : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
};

export default RankCard;
