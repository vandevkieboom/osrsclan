import React from "react";
import type { Item, CheckResult } from "../types/item";
import { hasLabeledCount, type RequirementProgress } from "../services/rank-checker";

type ItemCardProps = Item & {
  apiResult: CheckResult | null;
  progress: RequirementProgress | null;
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
  isManuallyVerified,
  canEditVerification,
  onToggleVerification,
}) => {
  const isDone =
    apiResult === "pass" || apiResult === "pass-alt" || isManuallyVerified;

  const manualTitle = isManuallyVerified
    ? "Click to unverify"
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
              data-tooltip="Passed via alternative, primary item not in collection log"
            >
              ~
            </span>
          )}
          {/* Both conditions, because each one alone lets through a badge that
              says nothing true.

              hasLabeledCount: the item's own name has to promise a count
              ("2/3 Cerberus crystals"), the same rule getRankUnits uses to
              decide what the row is worth toward the rank total. "Zaryte
              crossbow" needs 2 components to detect but never promised a
              count, and showing "1/2" there claimed it was worth 2 things
              while the total only ever counted it as 1.

              required > 1: a threshold of exactly 1 can only ever render
              "0/1", because the moment it reaches 1 the item is complete and
              renders a checkmark instead. "1/3 Megarares" and "1/2 Blorva or
              Radiant" both sit here - the 3 and the 2 in those names are how
              many items *qualify*, not how many are needed.

              What's left is the genuinely useful case: a real threshold above
              1, where the fraction moves as you collect. The number shown is
              the amount that completes the requirement, not the size of the
              pool that could satisfy it, so "2/3 Cerberus crystals" reads 0/2
              rather than 0/3, with the pool kept in the tooltip. */}
          {!isDone && progress && hasLabeledCount(name) && progress.required > 1 && (
            <span
              className="item-status api-partial"
              data-tooltip={
                `${progress.found} of ${progress.required} needed` +
                (progress.pool && progress.pool > progress.required
                  ? `, ${progress.pool} available`
                  : "")
              }
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
