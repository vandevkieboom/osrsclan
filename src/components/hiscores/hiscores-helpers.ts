import {
  getWomMetricIcon,
  METRIC_GROUPS,
  type MetricOption,
  type WomHiscoresEntry,
} from "../../services/wom";

const IRONMAN_ICON =
  "https://oldschool.runescape.wiki/images/Ironman_chat_badge.png";
const HARDCORE_ICON =
  "https://oldschool.runescape.wiki/images/Hardcore_ironman_chat_badge.png";
const ULTIMATE_ICON =
  "https://oldschool.runescape.wiki/images/Ultimate_ironman_chat_badge.png";
const GIM_ICON =
  "https://oldschool.runescape.wiki/images/Group_ironman_chat_badge.png";

export function getTypeIcon(type: string): string | null {
  if (type === "ironman") return IRONMAN_ICON;
  if (type === "hardcore") return HARDCORE_ICON;
  if (type === "ultimate") return ULTIMATE_ICON;
  if (type === "regular") return GIM_ICON;
  return null;
}

export function formatNumber(n: number | undefined): string {
  if (n === undefined || n < 0) return "—";
  return n.toLocaleString();
}

export function getTrophyIcon(clanRank: number): string | null {
  if (clanRank === 1) return "/trophy.png";
  if (clanRank === 2) return "/trophy-silver.png";
  if (clanRank === 3) return "/trophy-bronze.png";
  return null;
}

export function getMetricOption(value: string): MetricOption | undefined {
  for (const group of METRIC_GROUPS) {
    const found = group.metrics.find((m) => m.value === value);
    if (found) return found;
  }
  return undefined;
}

// OSRS wiki icon filenames that don't follow the `${Metric}_icon.png`
// convention — every other skill is that pattern, capitalized.
const SKILL_ICON_URL_OVERRIDES: Record<string, string> = {
  overall: "https://oldschool.runescape.wiki/images/Stats_icon.png",
  runecrafting: "https://oldschool.runescape.wiki/images/Runecraft_icon.png",
};

export function getSkillIconUrl(metric: string): string {
  if (SKILL_ICON_URL_OVERRIDES[metric]) return SKILL_ICON_URL_OVERRIDES[metric];
  const name = metric.charAt(0).toUpperCase() + metric.slice(1);
  return `https://oldschool.runescape.wiki/images/${name}_icon.png`;
}

export function getRowIcon(metric: string, dataType: string): string {
  return dataType === "skill"
    ? getSkillIconUrl(metric)
    : getWomMetricIcon(metric);
}

export function getPrimaryCol(entry: WomHiscoresEntry, dataType: string): string {
  const d = entry.data;
  if (dataType === "skill") return formatNumber(d.level);
  if (dataType === "boss") return formatNumber(d.kills);
  if (dataType === "activity") return formatNumber(d.score);
  if (dataType === "computed")
    return d.value !== undefined ? d.value.toFixed(1) : "—";
  return "—";
}
