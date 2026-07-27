import { Link } from "react-router-dom";
import { DISCORD_URL } from "../data/links";

const CLAN_CAPACITY = 500;

interface HeroProps {
  stats: {
    memberCount: number;
    totalXp: number;
    avgTotalLevel: number;
    maxedTotal: number;
  } | null;
  liveCount: number;
}

function formatXp(xp: number): string {
  if (xp >= 1e12) return `${(xp / 1e12).toFixed(1)}T`;
  if (xp >= 1e9) return `${(xp / 1e9).toFixed(1)}B`;
  return `${(xp / 1e6).toFixed(0)}M`;
}

export function Hero({ stats, liveCount }: HeroProps) {
  return (
    <div className="hero">
      <div className="hero-media" aria-hidden="true">
        <img
          className="hero-img"
          src="/example.png"
          sizes="(max-width: 720px) 100vw, 72vw"
          alt=""
          fetchPriority="high"
          decoding="async"
        />
      </div>
      <div className="hero-veil" aria-hidden="true" />

      <div className="hero-layer">
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span className="hero-eyebrow-line" />
              Old School RuneScape Clan
            </div>
            <h1 className="hero-title">Time Served</h1>
            <p className="hero-lede">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </p>
            <div className="hero-cta">
              <Link to="/rankings" className="hero-btn hero-btn-primary">
                Check your rank
              </Link>
              <a
                href={DISCORD_URL}
                className="hero-btn hero-btn-ghost"
                target="_blank"
                rel="noopener noreferrer"
              >
                Join Discord
              </a>
            </div>
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-value">
                {stats ? stats.memberCount.toLocaleString() : "—"}
              </span>
              <span className="hero-stat-label">Members</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-value">
                {stats ? formatXp(stats.totalXp) : "—"}
              </span>
              <span className="hero-stat-label">Total Clan XP</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-value">
                {stats ? stats.avgTotalLevel.toLocaleString() : "—"}
              </span>
              <span className="hero-stat-label">Avg. total level</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-value">
                {stats ? stats.maxedTotal.toLocaleString() : "—"}
              </span>
              <span className="hero-stat-label">Maxed Members</span>
            </div>

            {stats && stats.memberCount >= CLAN_CAPACITY ? (
              <span className="hero-live">
                <span className="hero-live-offline-dot" />
                Clan is currently at max capacity
              </span>
            ) : (
              stats && (
                <span className="hero-live">
                  <span className="hero-live-online-dot" />
                  {CLAN_CAPACITY - stats.memberCount} clan spots open
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
