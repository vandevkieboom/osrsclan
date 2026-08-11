import { useEffect, useState } from "react";
import ranks from "../data/ranks-data";
import {
  fetchClanLeaderboard,
  type ClanLeaderboardResult,
} from "../services/runeprofile";

const UNRANKED_COLOR = "#7a655f";

export default function ClanLeaderboard() {
  const [result, setResult] = useState<ClanLeaderboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      {entries && entries.length > 0 && (
        <div className="leaderboard-rows">
          {entries.map((entry, index) => {
            const rank =
              entry.highestEligibleRankIndex >= 0
                ? ranks[entry.highestEligibleRankIndex]
                : null;

            return (
              <div className="leaderboard-row" key={entry.name}>
                <div className="leaderboard-row-position">#{index + 1}</div>
                {rank && (
                  <div
                    className="leaderboard-row-icon"
                    style={{ backgroundImage: `url(${rank.icon})` }}
                  />
                )}
                <div className="leaderboard-row-info">
                  <div className="leaderboard-row-name">{entry.name}</div>
                  <div
                    className="leaderboard-row-rank"
                    style={{ color: rank ? rank.textColor : UNRANKED_COLOR }}
                  >
                    {rank ? rank.name : "Unranked"}
                  </div>
                </div>
                <div className="leaderboard-row-track">
                  <div
                    className="leaderboard-row-fill"
                    style={{ width: `${entry.nextRankPct}%` }}
                  />
                </div>
                <div className="leaderboard-row-count">
                  {entry.totalSatisfied}
                  <span className="leaderboard-row-count-label">items</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
