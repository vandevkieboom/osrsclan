import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { NavMenu } from "../components/nav-menu";
import {
  fetchCurrentEvent,
  getWomMetricIcon,
  type EventCompetition,
} from "../services/wom";

const DISCORD_URL = "https://discord.gg/P7SkKWM275";

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "b";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "m";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString();
}

export function HomePage() {
  const [event, setEvent] = useState<EventCompetition | null>(null);
  const [eventLoading, setEventLoading] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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
  }, []);

  const now = new Date();
  const eventStart = event ? new Date(event.startsAt) : null;
  const eventEnd = event ? new Date(event.endsAt) : null;
  const isEventActive =
    eventStart !== null &&
    eventEnd !== null &&
    now >= eventStart &&
    now <= eventEnd;
  const isEventPast = eventEnd !== null && now > eventEnd;

  const topParticipants = event
    ? [...event.participations]
        .sort((a, b) => b.progress.gained - a.progress.gained)
        .slice(0, 5)
    : [];

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

      {/* Discord banner */}
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
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
        </svg>
        <div className="home-discord-text">
          <span className="home-discord-label">Join our Discord</span>
          <span className="home-discord-sub">
            Chat, events, drops &amp; more
          </span>
        </div>
        <span className="home-discord-arrow">→</span>
      </a>

      {/* Current event */}
      <div className="home-section-title">
        {isEventActive
          ? "Active Event"
          : isEventPast
            ? "Last Event"
            : "Upcoming Event"}
      </div>

      {eventLoading && <div className="home-status">Loading event…</div>}
      {eventError && (
        <div className="home-status home-status--error">{eventError}</div>
      )}
      {!eventLoading && !eventError && event && (
        <div className="home-event">
          <div className="home-event-header">
            <img
              src={getWomMetricIcon(event.metric)}
              alt={event.metric}
              className="home-event-metric-icon"
            />
            <div className="home-event-header-text">
              <span className="home-event-title">{event.title}</span>
              <span className="home-event-dates">
                {new Date(event.startsAt).toLocaleDateString()} –{" "}
                {new Date(event.endsAt).toLocaleDateString()}
              </span>
            </div>
            {isEventActive && <span className="home-event-live">LIVE</span>}
          </div>

          <div className="home-event-rows">
            {topParticipants.map((p, i) => (
              <div key={p.player.username} className="home-event-row">
                <span className="home-event-pos">#{i + 1}</span>
                <span className="home-event-name">{p.player.displayName}</span>
                <span className="home-event-gained">
                  +{formatCompact(p.progress.gained)}
                </span>
              </div>
            ))}
            {topParticipants.length === 0 && (
              <div className="home-status">No participants yet.</div>
            )}
          </div>

          <Link to="/hiscores" className="home-event-more">
            View full leaderboard →
          </Link>
        </div>
      )}

      {/* Footer */}
      <div className="footer">
        <span className="trophy">⚔</span>Time Served
        <span className="trophy">⚔</span>
      </div>
    </div>
  );
}
