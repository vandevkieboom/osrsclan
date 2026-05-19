import React from "react";

export type ApiCheck =
  | { type: "combat-achievement"; tier: string }
  | { type: "quest-cape" }
  | { type: "quest"; name: string }
  | { type: "diary-cape" }
  | { type: "total-level"; required: number }
  | { type: "skill-level"; skill: string; required: number }
  | { type: "collection-item"; names: string[] }
  | { type: "collection-count"; names: string[]; required: number }
  | { type: "collection-quantity"; name: string; required: number };

export type Item = {
  name: string;
  img: string;
  alt: string;
  apiCheck?: ApiCheck;
};

type ItemCardProps = Item & {
  isCompleted: boolean;
  isApiVerified: boolean;
  onCycleState: () => void;
};

const ItemCard: React.FC<ItemCardProps> = ({
  name,
  img,
  alt,
  isCompleted,
  isApiVerified,
  onCycleState,
}) => {
  const isDone = isCompleted || isApiVerified;
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
          {isApiVerified && !isCompleted && (
            <span
              className="item-status api-verified"
              title="Verified via RuneProfile"
            >
              ✓
            </span>
          )}
          {isCompleted && <span className="item-status done">✓</span>}
        </span>
        <span className="item-name">{name}</span>
      </button>
    </div>
  );
};

export default ItemCard;
