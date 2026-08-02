import { DISCORD_URL } from "../data/links";

const CLAN_CAPACITY = 500;

interface HeroProps {
  stats: {
    memberCount: number;
    totalXp: number;
    avgTotalLevel: number;
    maxedTotal: number;
  } | null;
}

function formatXp(xp: number): string {
  if (xp >= 1e12) return `${(xp / 1e12).toFixed(1)}T`;
  if (xp >= 1e9) return `${(xp / 1e9).toFixed(1)}B`;
  return `${(xp / 1e6).toFixed(0)}M`;
}

export function Hero({ stats }: HeroProps) {
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
            <a
              href={DISCORD_URL}
              className="hero-discord-btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                className="hero-discord-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"
                />
              </svg>
              Join our Discord
            </a>
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
