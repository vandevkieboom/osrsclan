import React from "react";
import ItemCard, { type Item, type CheckResult } from "./item-card";

export type Rank = {
  name: string;
  color: string;
  icon: string;
  items: Item[];
};

type RankCardProps = Rank & {
  rankIndex: number;
  completed: Record<string, boolean>;
  apiVerified: Record<string, CheckResult>;
  apiProgress: Record<string, { found: number; required: number }>;
  hideCompleted: boolean;
  eligible: boolean;
  priorRanksMet: boolean;
  onCycleState: (rankIndex: number, itemIndex: number) => void;
};

const RankCard: React.FC<RankCardProps> = ({
  name,
  color,
  icon,
  items,
  rankIndex,
  completed,
  apiVerified,
  apiProgress,
  hideCompleted,
  eligible,
  priorRanksMet,
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

  return (
    <div className="rank-card" style={{ ["--rank-color" as any]: color }}>
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
