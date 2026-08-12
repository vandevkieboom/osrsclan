import { useEffect, useState } from "react";
import {
  fetchClanLeaderboard,
  type ClanLeaderboardResult,
} from "../services/runeprofile";

const UNRANKED_COLOR = "#7a655f";
const PAGE_SIZE = 25;

export function ClanLeaderboard() {
  const [result, setResult] = useState<ClanLeaderboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    fetchClanLeaderboard()
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load leaderboard.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = result?.entries ?? null;
  const totalPages = entries ? Math.max(1, Math.ceil(entries.length / PAGE_SIZE)) : 1;
  const pageEntries = entries?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? null;
  const pageStartIndex = (page - 1) * PAGE_SIZE;

  return (
    <div>
      <p className="leaderboard-intro">
        Ranked by total collection log items checked off, across all tiers.
        {result?.updatedAt && ` Last updated ${new Date(result.updatedAt).toLocaleString()}.`}
      </p>

      {error && <div className="admin-empty">{error}</div>}
      {!error && !entries && <div className="admin-empty">Loading leaderboard…</div>}
      {!error && entries && entries.length === 0 && (
        <div className="admin-empty">
          {result?.updatedAt
            ? "No members found."
            : "Leaderboard hasn't run yet — check back soon."}
        </div>
      )}

      {pageEntries && pageEntries.length > 0 && (
        <div className="leaderboard-rows">
          {pageEntries.map((entry, index) => (
            <div className="leaderboard-row" key={entry.name}>
              <div className="leaderboard-row-position">
                #{pageStartIndex + index + 1}
              </div>
              {entry.rankIcon && (
                <div
                  className="leaderboard-row-icon"
                  style={{ backgroundImage: `url(${entry.rankIcon})` }}
                />
              )}
              <div className="leaderboard-row-info">
                <div className="leaderboard-row-name">{entry.name}</div>
                <div
                  className="leaderboard-row-rank"
                  style={{ color: entry.rankColor ?? UNRANKED_COLOR }}
                >
                  {entry.rankName ?? "Unranked"}
                </div>
              </div>
              <div className="leaderboard-row-track">
                <div
                  className="leaderboard-row-fill"
                  style={{ width: `${entry.progressPct}%` }}
                />
              </div>
              <div className="leaderboard-row-count">
                {entry.totalSatisfied}
                <span className="leaderboard-row-count-label">items</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {entries && totalPages > 1 && (
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
  );
}
