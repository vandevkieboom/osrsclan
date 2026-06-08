import React from "react";

export type CheckResult = "pass" | "pass-alt" | "partial" | "fail";

export type ApiCheck =
  | { type: "combat-achievement"; tier: string }
  | { type: "quest-cape" }
  | { type: "quest"; name: string }
  | { type: "diary-cape" }
  | { type: "total-level"; required: number }
  | { type: "skill-level"; skill: string; required: number }
  | { type: "collection-item"; names: string[] }
  | { type: "collection-count"; names: string[]; required: number }
  | { type: "collection-quantity"; name: string; required: number; displayTotal?: number }
  | { type: "collection-any-group"; groups: string[][]; required: number }
  | { type: "collection-full-groups"; groups: string[][]; required: number }
  | { type: "collection-all-plus-any"; all: string[]; any: string[] }
  | { type: "collection-any-of"; primary: ApiCheck; alternatives: ApiCheck[] }
  | { type: "combat-achievement-task"; names: string[] }
  | {
      type: "collection-piece-types";
      pieceGroups: string[][];
      required: number;
    }
  | { type: "collection-all-checks"; checks: ApiCheck[] };

export type Item = {
  name: string;
  img: string;
  alt: string;
  multiItem?: boolean;
  apiCheck?: ApiCheck;
};

type ItemCardProps = Item & {
  isCompleted: boolean;
  apiResult: CheckResult | null;
  progress: { found: number; required: number } | null;
  onCycleState: () => void;
};

const ItemCard: React.FC<ItemCardProps> = ({
  name,
  img,
  alt,
  isCompleted,
  apiResult,
  progress,
  onCycleState,
}) => {
  const isDone =
    isCompleted || apiResult === "pass" || apiResult === "pass-alt";
  const nextAction = isDone ? "clear completion" : "mark as completed";

  return (
    <div className={`item ${isDone ? "is-complete" : ""}`}>
      <button
        type="button"
        className="item-hitbox"
        onClick={onCycleState}
        title={`Click to ${nextAction}`}
        aria-label={`${name}: click to ${nextAction}`}
        aria-pressed={isDone}
      >
        <span className="item-icon-wrap">
          <img
            className="item-sprite"
            referrerPolicy="no-referrer"
            src={img}
            alt={alt}
          />
          {apiResult === "pass" && !isCompleted && (
            <span
              className="item-status api-verified"
              title="Verified via RuneProfile"
            >
              ✓
            </span>
          )}
          {apiResult === "pass-alt" && !isCompleted && (
            <span
              className="item-status api-alt"
              title="Passed via alternative — primary item not in collection log"
            >
              ~
            </span>
          )}
          {isCompleted && <span className="item-status done">✓</span>}
          {!isDone && progress && (
            <span
              className="item-status api-partial"
              title={`${progress.found} of ${progress.required} required`}
            >
              {progress.found}/{progress.required}
            </span>
          )}
        </span>
        <span className="item-name">{name}</span>
      </button>
    </div>
  );
};

export default ItemCard;
