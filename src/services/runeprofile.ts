const BASE = "https://api.runeprofile.com/v1";
const WOM_BASE = "https://api.wiseoldman.net/v2";

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

interface WomBossEntry {
  metric?: string;
  kills?: number;
}

interface WomPlayerResponse {
  latestSnapshot?: {
    data?: {
      bosses?: Record<string, WomBossEntry>;
    };
  };
}

type UnknownRecord = Record<string, unknown>;

interface CaTaskEntry {
  name: string;
  completed: boolean;
}

interface CombatAchievementTasksResponse {
  totalPoints?: number;
  data: CaTaskEntry[];
}

export interface RuneProfile {
  username: string;
  skills: SkillData[];
  quests: QuestData[];
  achievementDiaries: AchievementDiary[];
  combatAchievements: CombatAchievementTier[];
  itemMap: Map<string, number>;
  caTaskSet: Set<string>;
  caTotalPoints: number;
  bossKcMap: Map<string, number>;
}

async function apiFetch<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = import.meta.env.VITE_RUNEPROFILE_API_KEY;
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const res = await fetch(`${BASE}${path}`, { headers });

  if (res.status === 404) {
    throw new Error("Account not found on RuneProfile.");
  }

  if (res.status === 429) {
    throw new Error("Rate limit hit — wait a moment and try again.");
  }

  if (!res.ok) {
    throw new Error(`RuneProfile API error (${res.status}).`);
  }

  return res.json() as Promise<T>;
}

function buildCaTaskSet(
  tasks: CombatAchievementTasksResponse | null,
): Set<string> {
  if (!tasks) {
    return new Set();
  }
  return new Set(
    tasks.data.filter((t) => t.completed).map((t) => t.name.toLowerCase()),
  );
}

function buildBossKcMap(hiscores: unknown): Map<string, number> {
  const map = new Map<string, number>();

  const normalizeBossName = (name: string) =>
    name
      .toLowerCase()
      .replace(/^the\s+/, "")
      .replace(/\s+/g, " ")
      .trim();

  const addEntry = (name: unknown, score: unknown) => {
    if (typeof name !== "string") {
      return;
    }
    const numericScore =
      typeof score === "number"
        ? score
        : typeof score === "string"
          ? Number(score)
          : NaN;
    if (!Number.isFinite(numericScore) || numericScore <= 0) {
      return;
    }

    const key = normalizeBossName(name);
    const value = Math.floor(numericScore);
    map.set(key, Math.max(map.get(key) ?? 0, value));
  };

  const collectArray = (value: unknown) => {
    if (!Array.isArray(value)) {
      return;
    }
    for (const item of value) {
      if (item && typeof item === "object") {
        const obj = item as UnknownRecord;
        addEntry(obj.name ?? obj.activity, obj.score ?? obj.kc ?? obj.value);
      }
    }
  };

  if (!hiscores || typeof hiscores !== "object") {
    return map;
  }

  const root = hiscores as UnknownRecord;
  collectArray(root.activities);
  collectArray(root.bosses);

  const data =
    root.data && typeof root.data === "object"
      ? (root.data as UnknownRecord)
      : null;
  if (data) {
    collectArray(data.activities);
    collectArray(data.bosses);
  }

  // Wise Old Man shape: latestSnapshot.data.bosses.{metric}.kills
  const latestSnapshot =
    root.latestSnapshot && typeof root.latestSnapshot === "object"
      ? (root.latestSnapshot as UnknownRecord)
      : null;
  const snapshotData =
    latestSnapshot?.data && typeof latestSnapshot.data === "object"
      ? (latestSnapshot.data as UnknownRecord)
      : null;
  const bosses =
    snapshotData?.bosses && typeof snapshotData.bosses === "object"
      ? (snapshotData.bosses as UnknownRecord)
      : null;
  if (bosses) {
    for (const [metricKey, bossValue] of Object.entries(bosses)) {
      if (!bossValue || typeof bossValue !== "object") {
        continue;
      }
      const entry = bossValue as UnknownRecord;
      const metricName =
        typeof entry.metric === "string" ? entry.metric : metricKey;
      const normalizedName = metricName.replace(/_/g, " ");
      addEntry(normalizedName, entry.kills);
    }
  }

  return map;
}

export function getBossKc(
  bossKcMap: Map<string, number>,
  names: string[],
): number {
  const normalizeBossName = (name: string) =>
    name
      .toLowerCase()
      .replace(/^the\s+/, "")
      .replace(/\s+/g, " ")
      .trim();

  let maxKc = 0;
  for (const rawName of names) {
    const normalized = normalizeBossName(rawName);
    maxKc = Math.max(maxKc, bossKcMap.get(normalized) ?? 0);
  }

  // Fallback for slight naming differences in provider payloads.
  if (maxKc === 0) {
    for (const [bossName, kc] of bossKcMap) {
      if (names.some((n) => bossName.includes(normalizeBossName(n)))) {
        maxKc = Math.max(maxKc, kc);
      }
    }
  }

  return maxKc;
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
  const encoded = encodeURIComponent(username.trim());
  const [data, tasksData, womData] = await Promise.all([
    apiFetch<FullAccountResponse>(`/accounts/${encoded}/full`),
    apiFetch<CombatAchievementTasksResponse>(
      `/accounts/${encoded}/combat-achievements/tasks`,
    ).catch(() => null),
    fetch(`${WOM_BASE}/players/${encoded}`, {
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) {
          return null;
        }
        return (await res.json()) as WomPlayerResponse;
      })
      .catch(() => null),
  ]);

  const bossKcMap = buildBossKcMap(womData);
  const fullPayloadBossKcMap = buildBossKcMap(data as unknown);
  for (const [name, kc] of fullPayloadBossKcMap) {
    bossKcMap.set(name, Math.max(bossKcMap.get(name) ?? 0, kc));
  }

  const caTaskSet = buildCaTaskSet(tasksData);
  const caTotalPoints =
    tasksData?.totalPoints ?? Array.from(caTaskSet).reduce((sum) => sum, 0); // fallback: count only (no tier info)

  return {
    username: data.username,
    skills: data.skills ?? [],
    quests: data.quests ?? [],
    achievementDiaries: data.achievementDiaries ?? [],
    combatAchievements: data.combatAchievements ?? [],
    itemMap: buildItemMap(data.collectionLog),
    caTaskSet,
    caTotalPoints,
    bossKcMap,
  };
}
