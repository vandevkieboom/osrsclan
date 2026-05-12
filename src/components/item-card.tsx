import React from "react";

export type Item = {
  name: string;
  img: string;
  alt: string;
};

type ItemCardProps = Item & {
  isCompleted: boolean;
  onCycleState: () => void;
};

const ItemCard: React.FC<ItemCardProps> = ({
  name,
  img,
  alt,
  isCompleted,
  onCycleState,
}) => {
  const nextAction = isCompleted ? "clear completion" : "mark as completed";

  return (
    <div className={`item ${isCompleted ? "is-complete" : ""}`}>
      <button
        type="button"
        className="item-hitbox"
        onClick={onCycleState}
        title={`Click to ${nextAction}`}
        aria-label={`${name}: click to ${nextAction}`}
        aria-pressed={isCompleted}
      >
        <span className="item-icon-wrap">
          <img
            className="item-sprite"
            referrerPolicy="no-referrer"
            src={img}
            alt={alt}
          />
          {isCompleted && <span className="item-status done">✓</span>}
        </span>
        <span className="item-name">{name}</span>
      </button>
    </div>
  );
};

export default ItemCard;
