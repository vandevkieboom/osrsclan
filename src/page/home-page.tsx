import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { NavMenu } from "../components/nav-menu";

const DISCORD_URL = "https://discord.gg/P7SkKWM275";
const WOM_GROUP_ID = 22206;
const WOM_BASE = "https://api.wiseoldman.net/v2";

// ─── Twitch live streamers ────────────────────────────────────────────────────

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

// ─── Clan stats (WOM) ────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

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
    <div className="page">
      <NavMenu />

      {/* Header */}
      <div className="header">
        <div className="header-deco">
          <h1 className="title">Time Served</h1>
        </div>
        <div className="subtitle">Old School RuneScape Clan</div>
        <div className="divider" />
      </div>

      {/* Feature cards */}
      <div className="home-cards">
        <Link to="/rankings" className="home-card">
          <img
            src="https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_6_detail.png"
            className="home-card-icon"
            alt=""
          />
          <div className="home-card-title">Rankings</div>
          <div className="home-card-desc">
            Verify your rank eligibility by importing your RuneProfile
            collection log and checking your progress through every tier.
          </div>
        </Link>
        <Link to="/hiscores" className="home-card">
          <img
            src="https://oldschool.runescape.wiki/images/Stats_icon.png"
            className="home-card-icon"
            alt=""
          />
          <div className="home-card-title">Hiscores</div>
          <div className="home-card-desc">
            Browse clan member leaderboards across every skill, boss, and
            activity. Filter by active players or view the latest event.
          </div>
        </Link>
        <Link to="/activity" className="home-card">
          <img
            src="https://oldschool.runescape.wiki/images/Chronicle_detail.png"
            className="home-card-icon"
            alt=""
          />
          <div className="home-card-title">Activity</div>
          <div className="home-card-desc">
            Live clan feed showing rare drops, level-ups, quests, and combat
            achievements as they happen.
          </div>
        </Link>
      </div>

      {/* Bottom panels */}
      <div className="home-panels">
        {/* Twitch live streamers */}
        <div className="home-panel">
          <div className="home-panel-header">
            <span className="home-panel-title">Live Now</span>
            <svg
              className="home-panel-twitch-logo"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
            </svg>
          </div>
          {streamsLoading && (
            <div className="home-status">Checking streams…</div>
          )}
          {!streamsLoading && streams.length === 0 && (
            <div className="home-twitch-offline">
              <span className="home-twitch-offline-dot" />
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

        {/* Clan stats */}
        <div className="home-panel">
          <div className="home-panel-header">
            <span className="home-panel-title">Clan Stats</span>
            <img
              src="https://oldschool.runescape.wiki/images/Clan_icon.png"
              alt=""
              className="home-panel-clan-icon"
            />
          </div>
          {statsLoading && <div className="home-status">Loading…</div>}
          {!statsLoading && !clanStats && (
            <div className="home-status">Stats unavailable.</div>
          )}
          {clanStats && (
            <div className="home-clan-stats">
              {/*
               * ── HOW TO CUSTOMISE ────────────────────────────────────────
               * Each <div className="home-clan-stat"> block is one stat box.
               * • To REMOVE a stat: delete its block.
               * • To ADD a stat: copy any block and change the value/label.
               *
               * Values come from fetchClanStats() above. Available fields:
               *   clanStats.memberCount    — total tracked members
               *   clanStats.totalXp        — total clan XP (sum of all members)
               *   clanStats.avgTotalLevel  — average total level
               *   clanStats.maxedCombat    — members at 126 combat
               *   clanStats.maxedTotal     — members at 2277 total level
               *   clanStats.maxed200ms     — members with 200M XP in all skills
               *   clanStats.avgEhp         — average Efficient Hours Played
               *   clanStats.avgEhb         — average Efficient Hours Bossed
               *
               * To expose more WOM fields, add them to the ClanStats interface
               * and the return value of fetchClanStats().
               * ────────────────────────────────────────────────────────── */}

              {/* Hero stat — spans full width */}
              <div className="home-clan-stat home-clan-stat--hero">
                <span className="home-clan-stat-value">
                  {clanStats.memberCount.toLocaleString()}
                </span>
                <span className="home-clan-stat-label">Members</span>
              </div>

              {/* Row 1 */}
              <div className="home-clan-stat">
                <span className="home-clan-stat-value">
                  {clanStats.totalXp >= 1e12
                    ? `${(clanStats.totalXp / 1e12).toFixed(1)}T`
                    : clanStats.totalXp >= 1e9
                      ? `${(clanStats.totalXp / 1e9).toFixed(1)}B`
                      : `${(clanStats.totalXp / 1e6).toFixed(0)}M`}
                </span>
                <span className="home-clan-stat-label">Total Clan XP</span>
              </div>
              <div className="home-clan-stat">
                <span className="home-clan-stat-value">
                  {clanStats.avgTotalLevel.toLocaleString()}
                </span>
                <span className="home-clan-stat-label">Avg. Total Level</span>
              </div>
              <div className="home-clan-stat">
                <span className="home-clan-stat-value">
                  {clanStats.maxedCombat.toLocaleString()}
                </span>
                <span className="home-clan-stat-label">Max Combat</span>
              </div>
              <div className="home-clan-stat">
                <span className="home-clan-stat-value">
                  {clanStats.maxedTotal.toLocaleString()}
                </span>
                <span className="home-clan-stat-label">Maxed Total</span>
              </div>

              {/* Row 2 */}
              <div className="home-clan-stat">
                <span className="home-clan-stat-value">
                  {clanStats.avgEhp.toLocaleString()}
                </span>
                <span className="home-clan-stat-label">Avg. EHP</span>
              </div>
              <div className="home-clan-stat">
                <span className="home-clan-stat-value">
                  {clanStats.avgEhb.toLocaleString()}
                </span>
                <span className="home-clan-stat-label">Avg. EHB</span>
              </div>
              <div className="home-clan-stat home-clan-stat--span">
                <span className="home-clan-stat-value">
                  {clanStats.maxed200ms.toLocaleString()}
                </span>
                <span className="home-clan-stat-label">200M XP Club</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Discord join — bottom CTA */}
      <a
        href={DISCORD_URL}
        className="home-discord"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg
          className="home-discord-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"
          />
        </svg>
        <div className="home-discord-text">
          <span className="home-discord-label">Join our Discord</span>
          <span className="home-discord-sub">
            Chat, events, drops &amp; more
          </span>
        </div>
        <span className="home-discord-arrow">→</span>
      </a>
    </div>
  );
}
