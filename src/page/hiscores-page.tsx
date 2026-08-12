import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import {
  fetchCurrentEvent,
  fetchGroupBulkGained,
  fetchGroupBulkHiscores,
  fetchGroupRoles,
  getMetricEntries,
  getWomMetricIcon,
  type EventCompetition,
  type WomBulkGainedEntry,
  type WomBulkHiscoresEntry,
  type WomHiscoresEntry,
} from "../services/wom";
import { getRankForRole } from "../services/profile";
import { PlayerSearchInput } from "../components/hiscores/player-search-input";
import { MetricSelect } from "../components/hiscores/metric-select";
import {
  formatNumber,
  getMetricOption,
  getPrimaryCol,
  getTrophyIcon,
  getTypeIcon,
} from "../components/hiscores/hiscores-helpers";

const PAGE_SIZE = 25;

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
  const [playerSearch, setPlayerSearch] = useState("");
  const [roleMap, setRoleMap] = useState<Map<string, string> | null>(null);
  const [bulkHiscores, setBulkHiscores] = useState<
    WomBulkHiscoresEntry[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [gainedMap, setGainedMap] = useState<Map<
    string,
    WomBulkGainedEntry
  > | null>(null);
  const [event, setEvent] = useState<EventCompetition | null>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventPage, setEventPage] = useState(1);

  // Fetched once — every metric's stats for every member come back in this
  // single call, so switching metrics below is just a client-side re-sort,
  // no re-fetch (see bulk-hiscores in services/wom.ts).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGroupBulkHiscores()
      .then((data) => {
        if (!cancelled) setBulkHiscores(data);
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
  }, []);

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
    fetchGroupRoles()
      .then((map) => {
        if (!cancelled) setRoleMap(map);
      })
      .catch(() => {
        if (!cancelled) setRoleMap(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchGroupBulkGained("month")
      .then((rows) => {
        if (cancelled) return;
        const map = new Map<string, WomBulkGainedEntry>();
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
  const entries = useMemo<WomHiscoresEntry[]>(
    () =>
      bulkHiscores ? getMetricEntries(bulkHiscores, metric, dataType) : [],
    [bulkHiscores, metric, dataType],
  );
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
    <>
      <SiteHeader />

      <div className="page">
        <div className="page-head">
          <div className="page-eyebrow">Wise Old Man</div>
          <h1 className="page-title">Hiscores</h1>
          <p className="page-sub">
            Clan hiscores across every skill, boss and activity. When an event
            is running, check the hiscores to see how you stack up against the
            rest of the clan.
          </p>
        </div>

        <div className="hiscores-panel">
          <div className="metric-select-wrap">
            <div className="event-tabs-left">
              <button
                type="button"
                className={`event-tab-btn${view === "hiscores" ? " active" : ""}`}
                onClick={() => updateParams({ tab: null })}
              >
                Clan Hiscores
              </button>
              <button
                type="button"
                className={`event-tab-btn${view === "event" ? " active" : ""}`}
                onClick={() => updateParams({ tab: "event" })}
              >
                Event Hiscores
              </button>
              {view === "hiscores" && (
                <button
                  type="button"
                  className={`tracker-btn${inactiveMonthOnly ? " active" : ""}`}
                  onClick={() =>
                    updateParams({ inactive: inactiveMonthOnly ? null : "1" })
                  }
                  disabled={gainedMap === null}
                  data-tooltip={
                    gainedMap === null ? "Loading activity data…" : undefined
                  }
                >
                  {gainedMap === null ? "Inactive…" : "Inactive"}
                </button>
              )}
            </div>
            {view === "hiscores" && (
              <div className="metric-controls-right">
                <MetricSelect
                  value={metric}
                  onChange={(v) =>
                    updateParams({ metric: v === "overall" ? null : v })
                  }
                />
                <PlayerSearchInput
                  value={playerSearch}
                  onChange={setPlayerSearch}
                />
              </div>
            )}
            {view === "event" && (
              <div className="metric-controls-right">
                <PlayerSearchInput
                  value={playerSearch}
                  onChange={setPlayerSearch}
                />
              </div>
            )}
          </div>

          {view === "hiscores" && (
            <>
              {error && (
                <div
                  className="rank-card"
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "#e03a3a",
                  }}
                >
                  {error}
                </div>
              )}

              {loading && !error && (
                <div
                  className="rank-card"
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "#8f7a78",
                  }}
                >
                  Loading...
                </div>
              )}

              {!loading && !error && filteredEntries.length === 0 && (
                <div
                  className="rank-card"
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "#8f7a78",
                  }}
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
                        <th className="hiscores-th hiscores-th-player">
                          Player
                        </th>
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
                        <th className="hiscores-th hiscores-th-num">
                          Global Rank
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageEntries.map((entry) => {
                        const clanRank =
                          entries.findIndex(
                            (e) => e.player.username === entry.player.username,
                          ) + 1;
                        const typeIcon = getTypeIcon(entry.player.type);
                        const role = roleMap?.get(
                          entry.player.username.toLowerCase(),
                        );
                        const rankInfo = getRankForRole(role);
                        const trophyIcon = getTrophyIcon(clanRank);
                        const gained = gainedMap?.get(
                          entry.player.username.toLowerCase(),
                        );
                        const isStale =
                          !!gained?.player.updatedAt &&
                          (NOW - new Date(gained.player.updatedAt).getTime()) /
                            (1000 * 60 * 60 * 24) >=
                            7;
                        return (
                          <tr
                            key={entry.player.username}
                            className="hiscores-row"
                          >
                            <td className="hiscores-td hiscores-td-rank">
                              {trophyIcon ? (
                                <img
                                  src={trophyIcon}
                                  alt={`Rank ${clanRank}`}
                                  className="hiscores-trophy-icon"
                                />
                              ) : (
                                `${clanRank}.`
                              )}
                            </td>
                            <td className="hiscores-td hiscores-td-player">
                              {typeIcon && (
                                <img
                                  src={typeIcon}
                                  alt={entry.player.type}
                                  className="player-badge"
                                />
                              )}
                              {rankInfo && (
                                <img
                                  src={rankInfo.icon}
                                  alt={rankInfo.name}
                                  title={rankInfo.name}
                                  className="player-rank-icon"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                              <a
                                href={`https://wiseoldman.net/players/${encodeURIComponent(
                                  entry.player.displayName,
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="player-link"
                                data-tooltip={`Open ${entry.player.displayName} on Wise Old Man`}
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
                                      isStale
                                        ? "player-name--stale"
                                        : undefined,
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
                            {(dataType === "boss" ||
                              dataType === "activity") && (
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
                                {formatNumber(entry.data.experience)}
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
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
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
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "#8f7a78",
                  }}
                >
                  Loading event...
                </div>
              )}
              {eventError && (
                <div
                  className="rank-card"
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "#e03a3a",
                  }}
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
                              color: "#8f7a78",
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
                                <th className="hiscores-th hiscores-th-num">
                                  End
                                </th>
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
                                const role = roleMap?.get(
                                  p.player.username.toLowerCase(),
                                );
                                const rankInfo = getRankForRole(role);
                                const trophyIcon = getTrophyIcon(rank);
                                return (
                                  <tr
                                    key={p.player.username}
                                    className="hiscores-row"
                                  >
                                    <td className="hiscores-td hiscores-td-rank">
                                      {trophyIcon ? (
                                        <img
                                          src={trophyIcon}
                                          alt={`Rank ${rank}`}
                                          className="hiscores-trophy-icon"
                                        />
                                      ) : (
                                        `${rank}.`
                                      )}
                                    </td>
                                    <td className="hiscores-td hiscores-td-player">
                                      {typeIcon && (
                                        <img
                                          src={typeIcon}
                                          alt={p.player.type}
                                          className="player-badge"
                                        />
                                      )}
                                      {rankInfo && (
                                        <img
                                          src={rankInfo.icon}
                                          alt={rankInfo.name}
                                          title={rankInfo.name}
                                          className="player-rank-icon"
                                          referrerPolicy="no-referrer"
                                        />
                                      )}
                                      <a
                                        href={`https://wiseoldman.net/players/${encodeURIComponent(p.player.displayName)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="player-link"
                                        data-tooltip={`Open ${p.player.displayName} on Wise Old Man`}
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
      </div>

      <SiteFooter />
    </>
  );
}
