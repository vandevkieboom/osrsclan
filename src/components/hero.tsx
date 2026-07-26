import { Link } from "react-router-dom";
import { DISCORD_URL } from "../data/links";
import { SiteHeader } from "./site-header";

interface HeroProps {
  stats: {
    memberCount: number;
    avgTotalLevel: number;
    maxedTotal: number;
  } | null;
  liveCount: number;
}

export function Hero({ stats, liveCount }: HeroProps) {
  return (
    <div className="hero">
      <div className="hero-media" aria-hidden="true">
        <img
          className="hero-img"
          src="/hunllef-hero-1800.jpg"
          srcSet="/hunllef-hero-1200.jpg 1200w, /hunllef-hero-1800.jpg 1800w, /hunllef-hero-2600.jpg 2600w"
          sizes="(max-width: 720px) 100vw, 72vw"
          alt=""
          fetchPriority="high"
          decoding="async"
        />
      </div>
      <div className="hero-veil" aria-hidden="true" />

      <div className="hero-layer">
        <SiteHeader variant="hero" />

        <div className="hero-inner">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span className="hero-eyebrow-line" />
              Old School RuneScape
            </div>
            <h1 className="hero-title">Time Served</h1>
            <p className="hero-lede">
              Rank is earned with time, not talk. Import your collection log,
              see exactly where you stand, and climb through every tier.
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
                {stats ? stats.avgTotalLevel.toLocaleString() : "—"}
              </span>
              <span className="hero-stat-label">Avg. total level</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-value">
                {stats ? stats.maxedTotal.toLocaleString() : "—"}
              </span>
              <span className="hero-stat-label">Maxed total</span>
            </div>

            {liveCount > 0 && (
              <a href="#live" className="hero-live">
                <span className="hero-live-dot" />
                {liveCount} live on Twitch
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
