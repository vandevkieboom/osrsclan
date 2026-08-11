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
  | {
      type: "collection-quantity";
      name: string;
      required: number;
      displayTotal?: number;
    }
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
  | { type: "collection-all-checks"; checks: ApiCheck[] }
  | { type: "collection-masori-f" };

export type Item = {
  name: string;
  img: string;
  alt: string;
  multiItem?: boolean;
  apiCheck?: ApiCheck;
};

type ItemCardProps = Item & {
  apiResult: CheckResult | null;
  progress: { found: number; required: number } | null;
  isUntrackable: boolean;
  isManuallyVerified: boolean;
  canEditVerification: boolean;
  onToggleVerification?: () => void;
};

const ItemCard: React.FC<ItemCardProps> = ({
  name,
  img,
  alt,
  apiResult,
  progress,
  isUntrackable,
  isManuallyVerified,
  canEditVerification,
  onToggleVerification,
}) => {
  const isDone =
    apiResult === "pass" ||
    apiResult === "pass-alt" ||
    (isUntrackable && isManuallyVerified);

  return (
    <div className={`item ${isDone ? "is-complete" : ""}`}>
      <div className="item-hitbox">
        <span className="item-icon-wrap">
          <img
            className="item-sprite"
            referrerPolicy="no-referrer"
            src={img}
            alt={alt}
          />
          {apiResult === "pass" && (
            <span
              className="item-status api-verified"
              title="Verified via RuneProfile"
            >
              ✓
            </span>
          )}
          {apiResult === "pass-alt" && (
            <span
              className="item-status api-alt"
              title="Passed via alternative — primary item not in collection log"
            >
              ~
            </span>
          )}
          {isUntrackable && canEditVerification && (
            <button
              type="button"
              className={`item-status manual-verify${isManuallyVerified ? " checked" : ""}`}
              title={
                isManuallyVerified
                  ? "Manually verified — click to unverify"
                  : "Not trackable via RuneProfile — click to mark as manually verified"
              }
              onClick={(e) => {
                e.stopPropagation();
                onToggleVerification?.();
              }}
            >
              {isManuallyVerified ? "✓" : "+"}
            </button>
          )}
          {isUntrackable && !canEditVerification && isManuallyVerified && (
            <span
              className="item-status api-verified"
              title="Manually verified by an admin"
            >
              ✓
            </span>
          )}
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
      </div>
    </div>
  );
};

export default ItemCard;
