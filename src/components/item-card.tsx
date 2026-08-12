import React from "react";
import type { Item, CheckResult } from "../types/item";

type ItemCardProps = Item & {
  apiResult: CheckResult | null;
  progress: { found: number; required: number } | null;
  isUntrackable: boolean;
  isManuallyVerified: boolean;
  canEditVerification: boolean;
  onToggleVerification?: () => void;
};

export const ItemCard: React.FC<ItemCardProps> = ({
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
    apiResult === "pass" || apiResult === "pass-alt" || isManuallyVerified;

  const manualTitle = isManuallyVerified
    ? "Click to unverify"
    : isUntrackable
      ? "Not trackable via RuneProfile — click to mark as manually verified"
      : "Click to manually verify";

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
          {/* Manual verification is the authoritative status (it overrides
              whatever RuneProfile says), so it gets the big centered overlay.
              The small corner badges below stay as supplementary info about
              what the checklist itself found. */}
          {canEditVerification ? (
            <button
              type="button"
              className={`item-manual-toggle${isManuallyVerified ? " checked" : ""}`}
              aria-label={manualTitle}
              data-tooltip={manualTitle}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVerification?.();
              }}
            >
              <span className="item-manual-toggle-icon">✓</span>
            </button>
          ) : (
            isManuallyVerified && (
              <span
                className="item-manual-toggle checked"
                data-tooltip="Manually verified by an admin"
              >
                <span className="item-manual-toggle-icon">✓</span>
              </span>
            )
          )}
          {apiResult === "pass" && (
            <span
              className="item-status api-verified"
              data-tooltip="Verified via RuneProfile"
            >
              ✓
            </span>
          )}
          {apiResult === "pass-alt" && (
            <span
              className="item-status api-alt"
              data-tooltip="Passed via alternative — primary item not in collection log"
            >
              ~
            </span>
          )}
          {!isDone && progress && (
            <span
              className="item-status api-partial"
              data-tooltip={`${progress.found} of ${progress.required} required`}
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
