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
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="hero-eyebrow">if you read this you are bald</div>
            <h1 className="hero-title">Time Served</h1>
            <p className="hero-lede">
              Ironman clan for those who have served their sentence in the
              Corrupted Gauntlet.
            </p>
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
              <span className="hero-live hero-live--full">
                <span className="hero-live-offline-dot" />
                Clan is currently full
              </span>
            ) : (
              stats && (
                <span className="hero-live hero-live--open">
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
