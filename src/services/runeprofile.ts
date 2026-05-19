const BASE = "https://api.runeprofile.com/v1";

export interface SkillData {
  name: string;
  xp: number;
  level: number;
  virtualLevel: number;
}

export interface QuestData {
  id: number;
  name: string;
  points: number;
  type: "free" | "members" | "mini";
  state: "finished" | "in_progress" | "not_started";
}

export interface CombatAchievementTier {
  id: number;
  name: string;
  completed: number;
  total: number;
}

export interface AchievementDiaryTier {
  tier: string;
  completed: number;
  total: number;
}

export interface AchievementDiary {
  areaId: number;
  area: string;
  tiers: AchievementDiaryTier[];
}

export interface CollectionLogItem {
  id: number;
  name: string;
  quantity: number;
}

export interface CollectionLog {
  obtained: number;
  total: number;
  tabs: Array<{
    name: string;
    pages: Array<{
      name: string;
      items: CollectionLogItem[];
    }>;
  }>;
}

interface FullAccountResponse {
  username: string;
  skills: SkillData[];
  quests: QuestData[];
  collectionLog: CollectionLog;
  achievementDiaries: AchievementDiary[];
  combatAchievements: CombatAchievementTier[];
}

export interface RuneProfile {
  username: string;
  skills: SkillData[];
  quests: QuestData[];
  achievementDiaries: AchievementDiary[];
  combatAchievements: CombatAchievementTier[];
  itemMap: Map<string, number>;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) throw new Error("Account not found on RuneProfile.");
  if (res.status === 429)
    throw new Error("Rate limit hit — wait a moment and try again.");
  if (!res.ok) throw new Error(`RuneProfile API error (${res.status}).`);
  return res.json() as Promise<T>;
}

export function buildItemMap(log: CollectionLog): Map<string, number> {
  const map = new Map<string, number>();
  for (const tab of log.tabs) {
    for (const page of tab.pages) {
      for (const item of page.items) {
        const key = item.name.toLowerCase();
        map.set(key, Math.max(map.get(key) ?? 0, item.quantity));
      }
    }
  }
  return map;
}

export async function fetchRuneProfile(username: string): Promise<RuneProfile> {
  const data = await apiFetch<FullAccountResponse>(
    `/accounts/${encodeURIComponent(username.trim())}/full`,
  );
  return {
    username: data.username,
    skills: data.skills ?? [],
    quests: data.quests ?? [],
    achievementDiaries: data.achievementDiaries ?? [],
    combatAchievements: data.combatAchievements ?? [],
    itemMap: buildItemMap(data.collectionLog),
  };
}
