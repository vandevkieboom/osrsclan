import { useEffect, useRef, useState } from "react";
import { METRIC_GROUPS } from "../../services/wom";
import { SearchIcon } from "./search-icon";
import { getMetricOption, getRowIcon } from "./hiscores-helpers";

type MetricSelectProps = {
  value: string;
  onChange: (v: string) => void;
};

export function MetricSelect({ value, onChange }: MetricSelectProps) {
  const [search, setSearch] = useState("");
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const current = getMetricOption(value);
  const currentDataType = current?.dataType ?? "skill";

  useEffect(() => {
    const el = detailsRef.current;
    if (!el) return;

    function onToggle() {
      if (el!.open) {
        setTimeout(() => searchRef.current?.focus(), 0);
      } else {
        setSearch("");
      }
    }
    function onMouseDown(e: MouseEvent) {
      if (el && !el.contains(e.target as Node)) {
        el.open = false;
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") el!.open = false;
    }

    el.addEventListener("toggle", onToggle);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("toggle", onToggle);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const q = search.toLowerCase();

  return (
    <details className="ms-wrap" ref={detailsRef}>
      <summary className="ms-trigger" aria-haspopup="listbox">
        <img
          src={getRowIcon(current?.value ?? value, currentDataType)}
          alt=""
          className="ms-trigger-icon"
        />
        <span className="ms-trigger-label">
          {current?.label ?? "Select metric"}
        </span>
        <span className="ms-trigger-arrow" aria-hidden="true">
          <img src="/dropdown-arrow.svg" alt="" className="dropdown-arrow-icon" />
        </span>
      </summary>
      <div className="ms-panel" role="listbox">
        <div className="ms-search-wrap">
          <SearchIcon />
          <input
            ref={searchRef}
            type="text"
            className="ms-search"
            placeholder="Search by metric"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ms-list">
          {(() => {
            const visibleGroups = METRIC_GROUPS.map((group) => ({
              group,
              filtered: q
                ? group.metrics.filter((m) => m.label.toLowerCase().includes(q))
                : group.metrics,
            })).filter(({ filtered }) => filtered.length > 0);

            return visibleGroups.map(({ group, filtered }, i) => (
              <div key={group.groupLabel}>
                <div
                  className={`ms-group-label${i === 0 ? " ms-group-label--first" : ""}`}
                >
                  {group.groupLabel}
                </div>
                {filtered.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="option"
                    aria-selected={m.value === value}
                    className={`ms-item${m.value === value ? " selected" : ""}`}
                    onClick={() => {
                      onChange(m.value);
                      if (detailsRef.current) detailsRef.current.open = false;
                    }}
                  >
                    <img
                      src={getRowIcon(m.value, m.dataType)}
                      alt=""
                      className="ms-item-icon"
                    />
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            ));
          })()}
        </div>
      </div>
    </details>
  );
}
