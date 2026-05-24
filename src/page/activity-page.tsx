import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const CLAN = "Time Served";
const LIMIT = 20;

// ─── API types ───────────────────────────────────────────────────────────────

interface ActivityAccount {
  username: string;
  accountType: { id: number; key: string; name: string };
}

interface RuneProfileActivity {
  type: string;
  data: {
    name?: string;
    level?: number;
    itemId?: number;
    value?: number;
    questId?: number;
    xp?: number;
    tierId?: number;
  };
  enriched?: Record<string, string | number | boolean | null | undefined>;
  createdAt: string;
  account: ActivityAccount;
}

interface ActivitiesResponse {
  activities: RuneProfileActivity[];
  nextCursor: string;
  prevCursor: string;
  hasMore: boolean;
  hasPrev: boolean;
}

async function fetchClanActivities(
  types: string,
  cursor: string,
  direction: "next" | "prev",
): Promise<ActivitiesResponse> {
  const params = new URLSearchParams({
    limit: String(LIMIT),
    activityTypes: types,
    direction,
    cursor,
  });
  const res = await fetch(
    `https://api.runeprofile.com/v1/clans/${encodeURIComponent(CLAN)}/activities?${params}`,
  );
  if (res.status === 429)
    throw new Error("Rate limited — please wait a moment.");
  if (!res.ok) throw new Error(`Failed to load activity (${res.status}).`);
  return res.json() as Promise<ActivitiesResponse>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACCOUNT_ICONS: Record<string, string> = {
  ironman: "https://oldschool.runescape.wiki/images/Ironman_chat_badge.png",
  hardcore_ironman:
    "https://oldschool.runescape.wiki/images/Hardcore_ironman_chat_badge.png",
  ultimate_ironman:
    "https://oldschool.runescape.wiki/images/Ultimate_ironman_chat_badge.png",
  group_ironman:
    "https://oldschool.runescape.wiki/images/Group_ironman_chat_badge.png",
  hardcore_group_ironman:
    "https://oldschool.runescape.wiki/images/Hardcore_group_ironman_chat_badge.png",
};

function getAccountIcon(key: string): string | null {
  return ACCOUNT_ICONS[key.toLowerCase()] ?? null;
}

const SKILL_METRIC_OVERRIDES: Record<string, string> = {
  runecraft: "runecrafting",
};

function skillIcon(skillName: string): string {
  const key =
    SKILL_METRIC_OVERRIDES[skillName.toLowerCase()] ?? skillName.toLowerCase();
  return `https://cdn.jsdelivr.net/gh/wise-old-man/wise-old-man@master/app/public/img/metrics/${key}.png`;
}

function skillDisplayName(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "runecraft") return "Runecrafting";
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function formatXp(xp: number): string {
  if (xp >= 1_000_000_000) return `${+(xp / 1_000_000_000).toFixed(1)}B`;
  if (xp >= 1_000_000) return `${+(xp / 1_000_000).toFixed(1)}M`;
  if (xp >= 1_000) return `${+(xp / 1_000).toFixed(1)}K`;
  return xp.toLocaleString();
}

const CA_TIERS: Record<number, string> = {
  1: "Easy",
  2: "Medium",
  3: "Hard",
  4: "Elite",
  5: "Master",
  6: "Grandmaster",
};

function timeAgo(iso: string): string {
  // Ensure the timestamp is treated as UTC if no timezone info is present
  const utcIso =
    iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z";
  const s = Math.floor((Date.now() - new Date(utcIso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// ─── Activity row ─────────────────────────────────────────────────────────────

function ActivityRow({ activity }: { activity: RuneProfileActivity }) {
  const { type, data, enriched, createdAt, account } = activity;
  const typeIcon = getAccountIcon(account.accountType.key);
  const womUrl = `https://wiseoldman.net/players/${encodeURIComponent(account.username)}`;

  let skillImg: string | null = null;
  let description: React.ReactNode = null;

  if (type === "level_up") {
    skillImg = skillIcon(data.name ?? "");
    const displayName = skillDisplayName(data.name ?? "");
    description = (
      <>
        reached{" "}
        {data.level !== undefined && (
          <>
            <span className="activity-highlight">level {data.level}</span>{" "}
            in{" "}
          </>
        )}
        <span className="activity-highlight">{displayName}</span>
      </>
    );
  } else if (type === "valuable_drop") {
    if (data.itemId)
      skillImg = `https://static.runelite.net/cache/item/icon/${data.itemId}.png`;
    description = (
      <>
        received a valuable drop worth{" "}
        <span className="activity-highlight">
          {data.value !== undefined
            ? formatXp(data.value) + " gp"
            : String(enriched?.itemName ?? "Unknown item")}
        </span>
      </>
    );
  } else if (type === "new_item_obtained") {
    if (data.itemId)
      skillImg = `https://static.runelite.net/cache/item/icon/${data.itemId}.png`;
    description = (
      <>
        added{" "}
        <span className="activity-highlight">
          {String(enriched?.itemName ?? "an item")}
        </span>{" "}
        to their collection log
      </>
    );
  } else if (type === "quest_completed") {
    skillImg = "https://oldschool.runescape.wiki/images/Quest_point_icon.png";
    description = (
      <>
        completed{" "}
        <span className="activity-highlight">
          {String(enriched?.questName ?? "a quest")}
        </span>
      </>
    );
  } else if (type === "achievement_diary_tier_completed") {
    skillImg =
      "https://oldschool.runescape.wiki/images/Achievement_Diaries.png";
    const area = enriched?.areaName ? String(enriched.areaName) : null;
    const tier = enriched?.tierName ? String(enriched.tierName) : null;
    description = (
      <>
        completed the{" "}
        <span className="activity-highlight">
          {[tier, area, "Achievement Diary"].filter(Boolean).join(" ")}
        </span>
      </>
    );
  } else if (type === "combat_achievement_tier_reached") {
    skillImg =
      "https://oldschool.runescape.wiki/images/Combat_Achievements_icon.png";
    const tierName =
      data.tierId !== undefined
        ? (CA_TIERS[data.tierId] ?? `Tier ${data.tierId}`)
        : "a";
    description = (
      <>
        reached <span className="activity-highlight">{tierName}</span> combat
        achievement tier
      </>
    );
  } else if (type === "maxed") {
    skillImg = "https://oldschool.runescape.wiki/images/Max_cape.png";
    description = (
      <>
        achieved{" "}
        <span className="activity-highlight">max level in all skills</span>
      </>
    );
  } else if (type === "xp_milestone") {
    skillImg = skillIcon(data.name ?? "overall");
    const displayName = skillDisplayName(data.name ?? "Overall");
    const xpStr = data.xp !== undefined ? formatXp(data.xp) : null;
    description = (
      <>
        reached{" "}
        {xpStr && (
          <>
            <span className="activity-highlight">{xpStr} XP</span> in{" "}
          </>
        )}
        {!xpStr && <>an XP milestone in </>}
        <span className="activity-highlight">{displayName}</span>
      </>
    );
  } else {
    description = (
      <span className="activity-highlight">{type.replace(/_/g, " ")}</span>
    );
  }

  return (
    <div className="activity-row">
      <div className="activity-row-left">
        {skillImg && (
          <img
            src={skillImg}
            alt={data.name ?? ""}
            className="activity-skill-icon"
          />
        )}
        <div className="activity-row-content">
          <span className="activity-row-main">
            {typeIcon && (
              <img
                src={typeIcon}
                alt={account.accountType.name}
                className="player-badge"
              />
            )}
            <a
              href={womUrl}
              target="_blank"
              rel="noreferrer"
              className="activity-player-link"
              title={`Open ${account.username} on Wise Old Man`}
            >
              {account.username}
            </a>
            <span className="activity-desc"> {description}</span>
          </span>
        </div>
      </div>
      <span className="activity-time">{timeAgo(createdAt)}</span>
    </div>
  );
}

// ─── Activity type selector ───────────────────────────────────────────────────

interface ActivityTypeOption {
  value: string;
  label: string;
}

const ACTIVITY_TYPES: ActivityTypeOption[] = [
  { value: "all", label: "All" },
  { value: "level_up", label: "Levels" },
  { value: "new_item_obtained", label: "Collection Logs" },
  { value: "valuable_drop", label: "Valuable Drops" },
  { value: "combat_achievement_tier_reached", label: "Combat Achievements" },
  { value: "achievement_diary_tier_completed", label: "Achievement Diaries" },
  { value: "quest_completed", label: "Quests" },
  { value: "xp_milestone", label: "Milestones" },
  { value: "maxed", label: "Maxed" },
];

const ALL_TYPES_PARAM = ACTIVITY_TYPES.filter((t) => t.value !== "all")
  .map((t) => t.value)
  .join(",");

function getTypesParam(value: string): string {
  return value === "all" ? ALL_TYPES_PARAM : value;
}

function ActivityTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current =
    ACTIVITY_TYPES.find((t) => t.value === value) ?? ACTIVITY_TYPES[0];

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="ms-wrap" ref={wrapRef}>
      <button
        type="button"
        className="ms-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="ms-trigger-label">{current.label}</span>
        <span className="ms-trigger-arrow" aria-hidden="true">
          <img
            src="/dropdown-arrow.svg"
            alt=""
            className={`dropdown-arrow-icon${open ? " open" : ""}`}
          />
        </span>
      </button>
      {open && (
        <div className="ms-panel" role="listbox">
          {ACTIVITY_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="option"
              aria-selected={t.value === value}
              className={`ms-item${t.value === value ? " selected" : ""}`}
              onClick={() => {
                onChange(t.value);
                setOpen(false);
              }}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

function ActivityFeed({ activityType }: { activityType: string }) {
  const [result, setResult] = useState<ActivitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);

    fetchClanActivities(getTypesParam(activityType), "", "next")
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Unknown error.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activityType]);

  return (
    <div className="activity-feed">
      {loading && <div className="activity-state">Loading...</div>}
      {error && <div className="activity-state activity-error">{error}</div>}
      {!loading && !error && result?.activities.length === 0 && (
        <div className="activity-state">No recent activity found.</div>
      )}
      {!loading &&
        !error &&
        result?.activities.map((act, i) => (
          <ActivityRow key={i} activity={act} />
        ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ActivityPage() {
  const location = useLocation();
  const [activityType, setActivityType] = useState("all");

  return (
    <div className="page">
      {/* Nav */}
      <nav className="page-nav">
        <Link
          to="/"
          className={`page-nav-btn${location.pathname === "/" ? " active" : ""}`}
        >
          Rankings
        </Link>
        <Link
          to="/hiscores"
          className={`page-nav-btn${location.pathname === "/hiscores" ? " active" : ""}`}
        >
          Hiscores
        </Link>
        <Link
          to="/activity"
          className={`page-nav-btn${location.pathname === "/activity" ? " active" : ""}`}
        >
          Activity
        </Link>
      </nav>

      {/* Header */}
      <div className="header">
        <div className="header-deco">
          <h1 className="title">Time Served</h1>
        </div>
        <div className="subtitle">Clan Activity</div>
        <a
          href="https://www.youtube.com/watch?v=5T5BY1j2MkE"
          className="divider-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="divider" />
        </a>
      </div>

      {/* Type filter */}
      <div className="metric-select-wrap activity-select-wrap">
        <ActivityTypeSelect value={activityType} onChange={setActivityType} />
      </div>

      {/* Feed */}
      <ActivityFeed key={activityType} activityType={activityType} />
    </div>
  );
}
