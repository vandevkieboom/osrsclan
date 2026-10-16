import { useEffect, useRef } from "react";
import { ranks } from "../../data/ranks-data";

// "All ranks" shows a few rank icons fanned out, lowest to highest, so it
// reads as "every rank" rather than as one of them.
const STACK_RANKS = ["Sapphire", "Dragonstone", "Infernal"];

function RankStack() {
  return (
    <span className="ms-rank-stack">
      {ranks
        .filter((r) => STACK_RANKS.includes(r.name))
        .map((r) => (
          <img key={r.name} src={r.icon} alt="" referrerPolicy="no-referrer" />
        ))}
    </span>
  );
}

type RankSelectProps = {
  /** Lowercase rank name ("sapphire" ... "infernal"), or null for every member. */
  value: string | null;
  onChange: (v: string | null) => void;
  /** Members per lowercase rank name; null while clan roles are loading. */
  counts: Map<string, number> | null;
  totalMembers: number;
};

export function RankSelect({
  value,
  onChange,
  counts,
  totalMembers,
}: RankSelectProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const current = ranks.find((r) => r.name.toLowerCase() === value);

  useEffect(() => {
    const el = detailsRef.current;
    if (!el) return;

    function onMouseDown(e: MouseEvent) {
      if (el && !el.contains(e.target as Node)) {
        el.open = false;
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") el!.open = false;
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function select(v: string | null) {
    onChange(v);
    if (detailsRef.current) detailsRef.current.open = false;
  }

  return (
    <details className="ms-wrap" ref={detailsRef}>
      <summary className="ms-trigger" aria-haspopup="listbox">
        {current ? (
          <img
            src={current.icon}
            alt=""
            className="ms-trigger-icon"
            referrerPolicy="no-referrer"
          />
        ) : (
          <RankStack />
        )}
        <span className="ms-trigger-label">
          {current?.name ?? "All ranks"}
        </span>
        <span className="ms-trigger-arrow" aria-hidden="true">
          <img
            src="/dropdown-arrow.svg"
            alt=""
            className="dropdown-arrow-icon"
          />
        </span>
      </summary>
      <div className="ms-panel" role="listbox">
        <div className="ms-list">
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            className={`ms-item${value === null ? " selected" : ""}`}
            onClick={() => select(null)}
          >
            <RankStack />
            <span>All ranks</span>
            <span className="ms-item-count">{totalMembers}</span>
          </button>
          {ranks.map((rank) => {
            const key = rank.name.toLowerCase();
            return (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={key === value}
                className={`ms-item${key === value ? " selected" : ""}`}
                onClick={() => select(key)}
              >
                <img
                  src={rank.icon}
                  alt=""
                  className="ms-item-icon"
                  referrerPolicy="no-referrer"
                />
                <span style={{ color: rank.textColor }}>{rank.name}</span>
                <span className="ms-item-count">
                  {counts ? (counts.get(key) ?? 0) : "…"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </details>
  );
}
