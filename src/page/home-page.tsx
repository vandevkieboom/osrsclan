import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Hero } from "../components/hero";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";

const WOM_GROUP_ID = 22206;
const WOM_BASE = "https://api.wiseoldman.net/v2";

interface LiveStream {
  username: string;
  displayName: string;
  game: string;
  title: string;
  viewers: number;
  thumbnail: string;
}

interface TwitchApiResponse {
  streams: LiveStream[];
}

async function fetchLiveStreams(): Promise<LiveStream[]> {
  const res = await fetch("/api/twitch-live");
  if (!res.ok) return [];
  const data = (await res.json()) as TwitchApiResponse;
  return data.streams ?? [];
}

interface WomGroup {
  memberCount: number;
  memberships: Array<{ player: { exp: number } }>;
}

interface WomGroupStats {
  maxedCombatCount: number;
  maxedTotalCount: number;
  maxed200msCount: number;
  averageStats: {
    data: {
      skills: { overall: { level: number; experience: number } };
      computed: { ehp: { value: number }; ehb: { value: number } };
    };
  };
}

interface ClanStats {
  memberCount: number;
  totalXp: number;
  avgTotalLevel: number;
  maxedCombat: number;
  maxedTotal: number;
  maxed200ms: number;
  avgEhp: number;
  avgEhb: number;
}

async function fetchClanStats(): Promise<ClanStats | null> {
  const [groupRes, statsRes] = await Promise.all([
    fetch(`${WOM_BASE}/groups/${WOM_GROUP_ID}`),
    fetch(`${WOM_BASE}/groups/${WOM_GROUP_ID}/statistics`),
  ]);
  if (!groupRes.ok || !statsRes.ok) return null;
  const group = (await groupRes.json()) as WomGroup;
  const stats = (await statsRes.json()) as WomGroupStats;
  const avgXp = stats.averageStats?.data?.skills?.overall?.experience || 0;
  const members = group.memberCount || 0;
  const totalXp =
    group.memberships?.reduce((sum, m) => sum + (m.player?.exp || 0), 0) ??
    Math.round(avgXp * members);
  return {
    memberCount: members,
    totalXp,
    avgTotalLevel: Math.round(
      stats.averageStats?.data?.skills?.overall?.level || 0,
    ),
    maxedCombat: stats.maxedCombatCount || 0,
    maxedTotal: stats.maxedTotalCount || 0,
    maxed200ms: stats.maxed200msCount || 0,
    avgEhp: Math.round(stats.averageStats?.data?.computed?.ehp?.value || 0),
    avgEhb: Math.round(stats.averageStats?.data?.computed?.ehb?.value || 0),
  };
}

export function HomePage() {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(true);

  const [clanStats, setClanStats] = useState<ClanStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchLiveStreams()
      .then((data) => {
        if (!cancelled) setStreams(data);
      })
      .catch(() => {
        /* silently fail */
      })
      .finally(() => {
        if (!cancelled) setStreamsLoading(false);
      });

    fetchClanStats()
      .then((data) => {
        if (!cancelled) setClanStats(data);
      })
      .catch(() => {
        /* silently fail */
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SiteHeader />

      <Hero stats={clanStats} liveCount={streams.length} />

      <div className="page">
        <h2 className="home-section-title">Explore the clan</h2>

        <div className="home-cards">
          <Link to="/rankings" className="home-card">
            <img
              src="https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_6_detail.png"
              className="home-card-icon"
              alt=""
            />
            <div className="home-card-body">
              <div className="home-card-title">Rankings</div>
              <div className="home-card-desc">
                Verify your rank eligibility by importing your RuneProfile
                collection log and checking your progress through every tier.
              </div>
            </div>
          </Link>
          <Link to="/hiscores" className="home-card">
            <img
              src="https://oldschool.runescape.wiki/images/Stats_icon.png"
              className="home-card-icon"
              alt=""
            />
            <div className="home-card-body">
              <div className="home-card-title">Hiscores</div>
              <div className="home-card-desc">
                Browse clan member leaderboards across every skill, boss, and
                activity. Filter by active players or view the latest event.
              </div>
            </div>
          </Link>
          <Link to="/activity" className="home-card">
            <img
              src="https://oldschool.runescape.wiki/images/Chronicle_detail.png"
              className="home-card-icon"
              alt=""
            />
            <div className="home-card-body">
              <div className="home-card-title">Activity</div>
              <div className="home-card-desc">
                Live clan feed showing rare drops, level-ups, quests, and combat
                achievements as they happen.
              </div>
            </div>
          </Link>
        </div>

        <h2 className="home-section-title">Right now</h2>

        <div className="home-panels">
          <div className="home-panel" id="live">
            <div className="home-panel-header">
              <span className="home-panel-title">Live Now</span>
            </div>
            {streamsLoading && (
              <div className="home-status">Checking streams…</div>
            )}
            {!streamsLoading && streams.length === 0 && (
              <div className="home-twitch-offline">
                No clan members are live right now.
              </div>
            )}
            {streams.map((s) => (
              <a
                key={s.username}
                href={`https://twitch.tv/${s.username}`}
                className="home-twitch-stream"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={s.thumbnail}
                  alt={s.title}
                  className="home-twitch-thumb"
                />
                <div className="home-twitch-info">
                  <span className="home-twitch-name">{s.displayName}</span>
                  <span className="home-twitch-game">{s.game}</span>
                  <span className="home-twitch-viewers">
                    <span className="home-twitch-live-dot" />
                    {s.viewers.toLocaleString()} viewers
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>

        <a
          href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
          className="home-discord"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="https://oldschool.runescape.wiki/images/Old_school_bond_detail.png"
            className="home-discord-icon"
            alt=""
            referrerPolicy="no-referrer"
          />
          <div className="home-discord-text">
            <span className="home-discord-label">
              Free Old School Runescape Bonds
            </span>
          </div>
          <span className="home-discord-arrow">→</span>
        </a>
      </div>

      <SiteFooter />
    </>
  );
}
