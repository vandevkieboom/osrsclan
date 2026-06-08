import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { NavMenu } from "../components/nav-menu";
import {
  fetchClanHiscores,
  fetchCurrentEvent,
  fetchGroupGained,
  getWomMetricIcon,
  METRIC_GROUPS,
  type EventCompetition,
  type MetricOption,
  type WomGainedEntry,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("tab") === "event" ? "event" : "hiscores";
  const metric = searchParams.get("metric") || "overall";
  const inactiveMonthOnly = searchParams.get("inactive") === "1";

  function updateParams(updates: Record<string, string | null>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(updates)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  }
  const [showPlayerSearch, setShowPlayerSearch] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [entries, setEntries] = useState<WomHiscoresEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [gainedMap, setGainedMap] = useState<Map<
    string,
    WomGainedEntry
  > | null>(null);
  const [event, setEvent] = useState<EventCompetition | null>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventPage, setEventPage] = useState(1);

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
  }, [metric]);

  useEffect(() => {
    setPage(1);
  }, [metric]);

  useEffect(() => {
    setPage(1);
    setEventPage(1);
  }, [playerSearch]);

  useEffect(() => {
    setPage(1);
  }, [inactiveMonthOnly]);

  useEffect(() => {
    let cancelled = false;
    fetchGroupGained("overall", "month")
      .then((rows) => {
        if (cancelled) return;
        const map = new Map<string, WomGainedEntry>();
        for (const row of rows) {
          map.set(row.player.username.toLowerCase(), row);
        }
        setGainedMap(map);
      })
      .catch(() => {
        if (!cancelled) setGainedMap(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (view !== "event") return;
    let cancelled = false;
    setEventLoading(true);
    setEventError(null);
    setEventPage(1);
    fetchCurrentEvent()
      .then((data) => {
        if (!cancelled) setEvent(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setEventError(
            err instanceof Error ? err.message : "Failed to load event.",
          );
      })
      .finally(() => {
        if (!cancelled) setEventLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const currentOption = getMetricOption(metric);
  const dataType = currentOption?.dataType ?? "skill";
  const q = playerSearch.trim().toLowerCase();
  const NOW = Date.now();
  const NEW_PLAYER_DAYS = 14;
  const INACTIVE_DAYS = 28;
  const inactivityFilteredEntries =
    inactiveMonthOnly && gainedMap
      ? entries.filter((entry) => {
          const username = entry.player.username.toLowerCase();
          const gained = gainedMap.get(username);
          if (!gained) return false;
          if (gained.player.registeredAt) {
            const daysSinceRegistered =
              (NOW - new Date(gained.player.registeredAt).getTime()) /
              (1000 * 60 * 60 * 24);
            if (daysSinceRegistered <= NEW_PLAYER_DAYS) return false;
          }
          if (!gained.player.lastChangedAt) return false;
          const daysSinceChanged =
            (NOW - new Date(gained.player.lastChangedAt).getTime()) /
            (1000 * 60 * 60 * 24);
          return daysSinceChanged >= INACTIVE_DAYS;
        })
      : entries;
  const filteredEntries = q
    ? inactivityFilteredEntries.filter((entry) => {
        const display = entry.player.displayName.toLowerCase();
        const username = entry.player.username.toLowerCase();
        return display.includes(q) || username.includes(q);
      })
    : inactivityFilteredEntries;
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const pageEntries = filteredEntries.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

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
      <NavMenu />

      <div className="header">
        <div className="header-deco">
          <Link to="/" className="title-link">
            <h1 className="title">Time Served</h1>
          </Link>
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

      <div className="metric-select-wrap">
        <div className="event-tabs-left">
          <button
            type="button"
            className={`event-tab-btn${view === "hiscores" ? " active" : ""}`}
            onClick={() => updateParams({ tab: null })}
          >
            <img
              src={getWomMetricIcon("overall")}
              alt=""
              className="event-tab-icon"
            />
            Clan Hiscores
          </button>
          <button
            type="button"
            className={`event-tab-btn event-tab-btn--event${view === "event" ? " active" : ""}`}
            onClick={() => updateParams({ tab: "event" })}
          >
            <span className="event-tab-emoji" aria-hidden="true">
              🏆
            </span>
            Event Hiscores
          </button>
        </div>
        {view === "hiscores" && (
          <div className="metric-controls-right">
            <MetricSelect value={metric} onChange={(v) => updateParams({ metric: v === "overall" ? null : v })} />
            <button
              type="button"
              className={`tracker-btn${inactiveMonthOnly ? " active" : ""}`}
              onClick={() => updateParams({ inactive: inactiveMonthOnly ? null : "1" })}
              disabled={gainedMap === null}
              title={gainedMap === null ? "Loading activity data…" : undefined}
            >
              {gainedMap === null ? "Inactive…" : "Inactive"}
            </button>
            <button
              type="button"
              className={`tracker-btn${showPlayerSearch ? " active" : ""}`}
              onClick={() => {
                setShowPlayerSearch((v) => !v);
                if (showPlayerSearch) setPlayerSearch("");
              }}
              aria-expanded={showPlayerSearch}
            >
              search
            </button>
          </div>
        )}
        {view === "event" && (
          <div className="metric-controls-right">
            <button
              type="button"
              className={`tracker-btn${showPlayerSearch ? " active" : ""}`}
              onClick={() => {
                setShowPlayerSearch((v) => !v);
                if (showPlayerSearch) setPlayerSearch("");
              }}
              aria-expanded={showPlayerSearch}
            >
              Find Player
            </button>
          </div>
        )}
      </div>

      {showPlayerSearch && (
        <div className="player-search-wrap">
          <input
            type="text"
            className="player-search-input"
            placeholder={
              view === "hiscores"
                ? "Search player in clan hiscores..."
                : "Search player in current event..."
            }
            value={playerSearch}
            onChange={(e) => setPlayerSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowPlayerSearch(false);
                setPlayerSearch("");
              }
            }}
            autoFocus
          />
        </div>
      )}

      {view === "hiscores" && (
        <>
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

          {!loading && !error && filteredEntries.length === 0 && (
            <div
              className="rank-card"
              style={{ textAlign: "center", padding: "2rem", color: "#d8b0b0" }}
            >
              {q
                ? "No matches for that player search."
                : "No data available for this metric."}
            </div>
          )}

          {!loading && !error && filteredEntries.length > 0 && (
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
                      <th className="hiscores-th hiscores-th-num">
                        Experience
                      </th>
                    )}
                    <th className="hiscores-th hiscores-th-num">Global Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {pageEntries.map((entry) => {
                    const clanRank =
                      entries.findIndex(
                        (e) => e.player.username === entry.player.username,
                      ) + 1;
                    const typeIcon = getTypeIcon(entry.player.type);
                    const gained = gainedMap?.get(
                      entry.player.username.toLowerCase(),
                    );
                    const isStale =
                      !!gained?.player.updatedAt &&
                      (NOW - new Date(gained.player.updatedAt).getTime()) /
                        (1000 * 60 * 60 * 24) >=
                        7;
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
                                [
                                  clanRank === 1
                                    ? "top3-player-name top1-player-name"
                                    : clanRank === 2
                                      ? "top3-player-name top2-player-name"
                                      : clanRank === 3
                                        ? "top3-player-name top3-player-name-bronze"
                                        : undefined,
                                  isStale ? "player-name--stale" : undefined,
                                ]
                                  .filter(Boolean)
                                  .join(" ") || undefined
                              }
                              title={
                                isStale
                                  ? "Profile hasn't been updated on WOM in 2+ weeks"
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
                      &nbsp;({filteredEntries.length} members)
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
        </>
      )}

      {view === "event" && (
        <div className="event-leaderboard">
          {eventLoading && (
            <div
              className="rank-card"
              style={{ textAlign: "center", padding: "2rem", color: "#d8b0b0" }}
            >
              Loading event...
            </div>
          )}
          {eventError && (
            <div
              className="rank-card"
              style={{ textAlign: "center", padding: "2rem", color: "#e03a3a" }}
            >
              {eventError}
            </div>
          )}
          {!eventLoading &&
            !eventError &&
            event &&
            (() => {
              const sortedAll = [...event.participations].sort(
                (a, b) => b.progress.gained - a.progress.gained,
              );
              const filteredParticipations = q
                ? sortedAll.filter((p) => {
                    const display = p.player.displayName.toLowerCase();
                    const username = p.player.username.toLowerCase();
                    return display.includes(q) || username.includes(q);
                  })
                : sortedAll;
              const sorted = filteredParticipations;
              const eventTotalPages = Math.max(
                1,
                Math.ceil(sorted.length / PAGE_SIZE),
              );
              const eventPageEntries = sorted.slice(
                (eventPage - 1) * PAGE_SIZE,
                eventPage * PAGE_SIZE,
              );
              return (
                <>
                  <div className="event-header">
                    <div className="event-header-meta">
                      <img
                        src={getWomMetricIcon(event.metric)}
                        alt={event.metric}
                        className="event-metric-icon"
                      />
                      <div>
                        <a
                          className="event-title"
                          href={`https://wiseoldman.net/competitions/${event.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {event.title}
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="hiscores-table-wrap">
                    {sorted.length === 0 && (
                      <div
                        className="rank-card"
                        style={{
                          textAlign: "center",
                          padding: "2rem",
                          color: "#d8b0b0",
                        }}
                      >
                        No matches for that player search.
                      </div>
                    )}
                    {sorted.length > 0 && (
                      <table className="hiscores-table">
                        <thead>
                          <tr>
                            <th className="hiscores-th hiscores-th-rank">
                              Rank
                            </th>
                            <th className="hiscores-th hiscores-th-player">
                              Player
                            </th>
                            <th className="hiscores-th hiscores-th-num">
                              Gained
                            </th>
                            <th className="hiscores-th hiscores-th-num">
                              Start
                            </th>
                            <th className="hiscores-th hiscores-th-num">End</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eventPageEntries.map((p) => {
                            const rank =
                              sortedAll.findIndex(
                                (x) =>
                                  x.player.username.toLowerCase() ===
                                  p.player.username.toLowerCase(),
                              ) + 1;
                            const typeIcon = getTypeIcon(p.player.type);
                            return (
                              <tr
                                key={p.player.username}
                                className="hiscores-row"
                              >
                                <td className="hiscores-td hiscores-td-rank">
                                  {rank}.
                                </td>
                                <td className="hiscores-td hiscores-td-player">
                                  {typeIcon && (
                                    <img
                                      src={typeIcon}
                                      alt={p.player.type}
                                      className="player-badge"
                                    />
                                  )}
                                  <a
                                    href={`https://wiseoldman.net/players/${encodeURIComponent(p.player.displayName)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="player-link"
                                    title={`Open ${p.player.displayName} on Wise Old Man`}
                                  >
                                    <span
                                      className={
                                        rank === 1
                                          ? "top3-player-name top1-player-name"
                                          : rank === 2
                                            ? "top3-player-name top2-player-name"
                                            : rank === 3
                                              ? "top3-player-name top3-player-name-bronze"
                                              : undefined
                                      }
                                    >
                                      {p.player.displayName}
                                    </span>
                                  </a>
                                </td>
                                <td className="hiscores-td hiscores-td-num event-gained">
                                  {p.progress.gained > 0 ? "+" : ""}
                                  {formatNumber(p.progress.gained)}
                                </td>
                                <td className="hiscores-td hiscores-td-num">
                                  {formatNumber(p.progress.start)}
                                </td>
                                <td className="hiscores-td hiscores-td-num">
                                  {formatNumber(p.progress.end)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    {eventTotalPages > 1 && (
                      <div className="hiscores-pagination">
                        <button
                          type="button"
                          className="tracker-btn"
                          onClick={() =>
                            setEventPage((p) => Math.max(1, p - 1))
                          }
                          disabled={eventPage <= 1}
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
                          Page {eventPage} of {eventTotalPages}
                          <span className="hiscores-pagination-total">
                            &nbsp;({sorted.length} participants)
                          </span>
                        </span>
                        <button
                          type="button"
                          className="tracker-btn"
                          onClick={() =>
                            setEventPage((p) =>
                              Math.min(eventTotalPages, p + 1),
                            )
                          }
                          disabled={eventPage >= eventTotalPages}
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
                </>
              );
            })()}
        </div>
      )}
    </div>
  );
}
