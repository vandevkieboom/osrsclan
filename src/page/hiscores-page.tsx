import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  fetchClanHiscores,
  getWomMetricIcon,
  METRIC_GROUPS,
  type MetricOption,
  type WomHiscoresEntry,
} from "../services/wom";

const IRONMAN_ICON =
  "https://oldschool.runescape.wiki/images/Ironman_chat_badge.png";
const HARDCORE_ICON =
  "https://oldschool.runescape.wiki/images/Hardcore_ironman_chat_badge.png";
const ULTIMATE_ICON =
  "https://oldschool.runescape.wiki/images/Ultimate_ironman_chat_badge.png";
const GIM_ICON =
  "https://oldschool.runescape.wiki/images/Group_ironman_chat_badge.png";

function getTypeIcon(type: string): string | null {
  if (type === "ironman") return IRONMAN_ICON;
  if (type === "hardcore") return HARDCORE_ICON;
  if (type === "ultimate") return ULTIMATE_ICON;
  if (type === "regular") return GIM_ICON;
  return null;
}

function formatNumber(n: number | undefined): string {
  if (n === undefined || n < 0) return "—";
  return n.toLocaleString();
}

function formatCompact(n: number | undefined): string {
  if (n === undefined || n < 0) return "—";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "b";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "m";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function getMetricOption(value: string): MetricOption | undefined {
  for (const group of METRIC_GROUPS) {
    const found = group.metrics.find((m) => m.value === value);
    if (found) return found;
  }
  return undefined;
}

function getPrimaryCol(entry: WomHiscoresEntry, dataType: string): string {
  const d = entry.data;
  if (dataType === "skill") return formatNumber(d.level);
  if (dataType === "boss") return formatNumber(d.kills);
  if (dataType === "activity") return formatNumber(d.score);
  if (dataType === "computed")
    return d.value !== undefined ? d.value.toFixed(1) : "—";
  return "—";
}

const PAGE_SIZE = 25;

type MetricSelectProps = {
  value: string;
  onChange: (v: string) => void;
};

function MetricSelect({ value, onChange }: MetricSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const current = getMetricOption(value);

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    setTimeout(() => searchRef.current?.focus(), 0);
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = search.toLowerCase();

  return (
    <div className="ms-wrap" ref={wrapRef}>
      <button
        type="button"
        className="ms-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <img
          src={getWomMetricIcon(current?.value ?? value)}
          alt=""
          className="ms-trigger-icon"
        />
        <span className="ms-trigger-label">
          {current?.label ?? "Select metric"}
        </span>
        <span className="ms-trigger-arrow" aria-hidden="true">
          <img
            src="/dropdown-arrow.svg"
            alt=""
            className={`dropdown-arrow-icon${open ? " open" : ""}`}
          />
        </span>
      </button>
      {open && (
        <div className="ms-panel" role="listbox">
          <div className="ms-search-wrap">
            <input
              ref={searchRef}
              type="text"
              className="ms-search"
              placeholder="Search metrics…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {METRIC_GROUPS.map((group) => {
            const filtered = q
              ? group.metrics.filter((m) => m.label.toLowerCase().includes(q))
              : group.metrics;
            if (filtered.length === 0) return null;
            return (
              <div key={group.groupLabel}>
                <div className="ms-group-label">{group.groupLabel}</div>
                {filtered.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="option"
                    aria-selected={m.value === value}
                    className={`ms-item${m.value === value ? " selected" : ""}`}
                    onClick={() => {
                      onChange(m.value);
                      setOpen(false);
                    }}
                  >
                    <img
                      src={getWomMetricIcon(m.value)}
                      alt=""
                      className="ms-item-icon"
                    />
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function HiscoresPage() {
  const [metric, setMetric] = useState("overall");
  const [refreshKey, setRefreshKey] = useState(0);
  const [entries, setEntries] = useState<WomHiscoresEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchClanHiscores(metric)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load hiscores.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [metric, refreshKey]);

  // Reset to page 1 whenever metric changes
  useEffect(() => {
    setPage(1);
  }, [metric]);

  const currentOption = getMetricOption(metric);
  const dataType = currentOption?.dataType ?? "skill";
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pageEntries = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const colHeaders = (() => {
    if (dataType === "skill") return ["Level"];
    if (dataType === "boss") return ["Kills"];
    if (dataType === "activity") return ["Score"];
    if (dataType === "computed") return ["Value"];
    return ["Value"];
  })();

  const showXpCol = dataType === "skill";

  return (
    <div className="page">
      {/* Nav */}
      <nav className="page-nav">
        <Link
          to="/"
          className={`page-nav-btn${location.pathname === "/" ? " active" : ""}`}
        >
          Rankings
        </Link>
        <Link
          to="/hiscores"
          className={`page-nav-btn${location.pathname === "/hiscores" ? " active" : ""}`}
        >
          Hiscores
        </Link>
        <Link
          to="/activity"
          className={`page-nav-btn${location.pathname === "/activity" ? " active" : ""}`}
        >
          Activity
        </Link>
      </nav>

      {/* Header */}
      <div className="header">
        <div className="header-deco">
          <h1 className="title">Time Served</h1>
        </div>
        <div className="subtitle">Clan Hiscores</div>
        <a
          href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
          className="divider-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="divider" />
        </a>
      </div>

      {/* Metric selector */}
      <div className="metric-select-wrap">
        <MetricSelect value={metric} onChange={setMetric} />
        <button
          type="button"
          className="tracker-btn"
          style={{ marginLeft: "0.75rem" }}
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Content */}
      {error && (
        <div
          className="rank-card"
          style={{ textAlign: "center", padding: "2rem", color: "#e03a3a" }}
        >
          {error}
        </div>
      )}

      {loading && !error && (
        <div
          className="rank-card"
          style={{ textAlign: "center", padding: "2rem", color: "#d8b0b0" }}
        >
          Loading...
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div
          className="rank-card"
          style={{ textAlign: "center", padding: "2rem", color: "#d8b0b0" }}
        >
          No data available for this metric.
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="hiscores-table-wrap">
          <table className="hiscores-table">
            <thead>
              <tr>
                <th className="hiscores-th hiscores-th-rank">Rank</th>
                <th className="hiscores-th hiscores-th-player">Player</th>
                {colHeaders.map((h) => (
                  <th key={h} className="hiscores-th hiscores-th-num">
                    {h}
                  </th>
                ))}
                {showXpCol && (
                  <th className="hiscores-th hiscores-th-num">Experience</th>
                )}
                <th className="hiscores-th hiscores-th-num">Global Rank</th>
              </tr>
            </thead>
            <tbody>
              {pageEntries.map((entry, i) => {
                const clanRank = (page - 1) * PAGE_SIZE + i + 1;
                const typeIcon = getTypeIcon(entry.player.type);
                return (
                  <tr key={entry.player.username} className="hiscores-row">
                    <td className="hiscores-td hiscores-td-rank">
                      {clanRank}.
                    </td>
                    <td className="hiscores-td hiscores-td-player">
                      {typeIcon && (
                        <img
                          src={typeIcon}
                          alt={entry.player.type}
                          className="player-badge"
                        />
                      )}
                      <a
                        href={`https://wiseoldman.net/players/${encodeURIComponent(
                          entry.player.displayName,
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="player-link"
                        title={`Open ${entry.player.displayName} on Wise Old Man`}
                      >
                        <span
                          className={
                            clanRank === 1
                              ? "top3-player-name top1-player-name"
                              : clanRank === 2
                                ? "top3-player-name top2-player-name"
                                : clanRank === 3
                                  ? "top3-player-name top3-player-name-bronze"
                                  : undefined
                          }
                        >
                          {entry.player.displayName}
                        </span>
                      </a>
                    </td>
                    {dataType === "skill" && (
                      <td className="hiscores-td hiscores-td-num">
                        {formatNumber(entry.data.level)}
                      </td>
                    )}
                    {(dataType === "boss" || dataType === "activity") && (
                      <td className="hiscores-td hiscores-td-num">
                        {getPrimaryCol(entry, dataType)}
                      </td>
                    )}
                    {dataType === "computed" && (
                      <td className="hiscores-td hiscores-td-num">
                        {getPrimaryCol(entry, dataType)}
                      </td>
                    )}
                    {showXpCol && (
                      <td className="hiscores-td hiscores-td-num">
                        {formatCompact(entry.data.experience)}
                      </td>
                    )}
                    <td className="hiscores-td hiscores-td-num hiscores-td-global">
                      {entry.data.rank >= 0
                        ? formatNumber(entry.data.rank)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="hiscores-pagination">
              <button
                type="button"
                className="tracker-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <img
                  src="/arrow-left-small.svg"
                  alt="Previous"
                  className="pagination-arrow-icon"
                />
                Prev
              </button>
              <span className="hiscores-pagination-info">
                Page {page} of {totalPages}
                <span className="hiscores-pagination-total">
                  &nbsp;({entries.length} members)
                </span>
              </span>
              <button
                type="button"
                className="tracker-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
              >
                Next
                <img
                  src="/arrow-right-small.svg"
                  alt="Next"
                  className="pagination-arrow-icon"
                />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
