import type { ApiCheck, CheckResult, Item } from "../types/item";
import type { Rank } from "../types/rank";
import type { RuneProfile } from "./runeprofile";

const CA_POINTS_REQUIRED: Record<string, number> = {
  easy: 41,
  medium: 161,
  hard: 416,
  elite: 1064,
  master: 1904,
  grandmaster: 2630,
};

// "Ancient blood ornament kit" ("Blorva") isn't a collection-log item, so it
// can never appear in profile.itemMap — the only way to detect it is via the
// combat achievements that gate it: all four Awakened-DT2-boss "Sleeper"
// tasks.
const BLORVA_SLEEPER_TASKS = [
  "vardorvis sleeper",
  "whispered",
  "leviathan sleeper",
  "duke sucellus sleeper",
];

function ownsCollectionItem(name: string, profile: RuneProfile): boolean {
  if (name.toLowerCase() === "ancient blood ornament kit") {
    return BLORVA_SLEEPER_TASKS.every((t) => profile.caTaskSet.has(t));
  }
  return (profile.itemMap.get(name.toLowerCase()) ?? 0) > 0;
}

export function checkRequirement(
  check: ApiCheck,
  profile: RuneProfile,
): CheckResult {
  switch (check.type) {
    case "combat-achievement": {
      const required = CA_POINTS_REQUIRED[check.tier.toLowerCase()];
      if (required === undefined) {
        return "fail";
      }

      return profile.caTotalPoints >= required ? "pass" : "fail";
    }

    case "total-level": {
      const total = profile.skills.reduce((sum, s) => sum + s.level, 0);
      return total >= check.required ? "pass" : "fail";
    }

    case "skill-level": {
      const skill = profile.skills.find(
        (s) => s.name.toLowerCase() === check.skill.toLowerCase(),
      );
      return (skill?.level ?? 0) >= check.required ? "pass" : "fail";
    }

    case "quest-cape": {
      const questsPassed =
        profile.quests.length > 0 &&
        profile.quests
          .filter((q) => q.type !== "mini")
          .every((q) => q.state === "finished");
      return questsPassed ? "pass" : "fail";
    }

    case "quest": {
      const quest = profile.quests.find(
        (q) => q.name.toLowerCase() === check.name.toLowerCase(),
      );
      return quest?.state === "finished" ? "pass" : "fail";
    }

    case "diary-cape": {
      const diariesPassed =
        profile.achievementDiaries.length > 0 &&
        profile.achievementDiaries.every((d) =>
          d.tiers.every((t) => t.completed >= t.total),
        );
      return diariesPassed ? "pass" : "fail";
    }

    case "collection-item": {
      const passed = check.names.some((n) => ownsCollectionItem(n, profile));
      return passed ? "pass" : "fail";
    }

    case "collection-count": {
      let found = check.names.filter((n) =>
        ownsCollectionItem(n, profile),
      ).length;

      const oathplateSlots = [
        "oathplate helm",
        "oathplate chest",
        "oathplate legs",
      ];
      const oathplateSlotsInCheck = check.names.filter((n) =>
        oathplateSlots.includes(n.toLowerCase()),
      );
      if (oathplateSlotsInCheck.length > 0) {
        const shardCount =
          (profile.itemMap.get("oathplate shard") ?? 0) +
          (profile.itemMap.get("oathplate shards") ?? 0);
        const ownedOathplateSlots = oathplateSlotsInCheck.filter(
          (n) => (profile.itemMap.get(n.toLowerCase()) ?? 0) > 0,
        ).length;
        const remainingSlots =
          oathplateSlotsInCheck.length - ownedOathplateSlots;
        const shardPieces = Math.min(
          Math.floor(shardCount / 450),
          remainingSlots,
        );
        found += shardPieces;
      }

      if (found >= check.required) return "pass";
      if (check.required >= 2 && found >= check.required - 1) return "partial";
      return "fail";
    }

    case "collection-quantity": {
      const count = profile.itemMap.get(check.name.toLowerCase()) ?? 0;
      if (count >= check.required) return "pass";
      if (check.required >= 2 && count >= check.required - 1) return "partial";
      return "fail";
    }

    case "collection-any-group": {
      const countInGroup = (group: string[]) =>
        group.filter((n) => (profile.itemMap.get(n.toLowerCase()) ?? 0) > 0)
          .length;
      const [primaryGroup, ...altGroups] = check.groups;
      if (
        primaryGroup !== undefined &&
        countInGroup(primaryGroup) >= check.required
      ) {
        return "pass";
      }
      if (altGroups.some((g) => countInGroup(g) >= check.required)) {
        return "pass-alt";
      }
      if (check.required >= 2) {
        const allGroups = check.groups.filter(
          (g): g is string[] => g !== undefined,
        );
        if (allGroups.some((g) => countInGroup(g) >= check.required - 1)) {
          return "partial";
        }
      }
      return "fail";
    }

    case "collection-full-groups": {
      const completedGroups = check.groups.filter((group) =>
        group.every(
          (name) => (profile.itemMap.get(name.toLowerCase()) ?? 0) > 0,
        ),
      ).length;
      if (completedGroups >= check.required) return "pass";
      if (check.required >= 2 && completedGroups >= check.required - 1)
        return "partial";
      return "fail";
    }

    case "collection-all-plus-any": {
      const hasAllRequired = check.all.every(
        (n) => (profile.itemMap.get(n.toLowerCase()) ?? 0) > 0,
      );
      const hasAnyOptional = check.any.some(
        (n) => (profile.itemMap.get(n.toLowerCase()) ?? 0) > 0,
      );
      return hasAllRequired && hasAnyOptional ? "pass" : "fail";
    }

    case "combat-achievement-task": {
      const passed = check.names.every((name) =>
        profile.caTaskSet.has(name.toLowerCase()),
      );
      return passed ? "pass" : "fail";
    }

    case "collection-any-of": {
      const primaryResult = checkRequirement(check.primary, profile);
      if (primaryResult === "pass" || primaryResult === "pass-alt") {
        return "pass";
      }
      let hasPartial = primaryResult === "partial";
      for (const alt of check.alternatives) {
        const altResult = checkRequirement(alt, profile);
        if (altResult === "pass" || altResult === "pass-alt") {
          return "pass-alt";
        }
        if (altResult === "partial") hasPartial = true;
      }
      return hasPartial ? "partial" : "fail";
    }

    case "collection-piece-types": {
      const oathplateSlots = [
        "oathplate helm",
        "oathplate chest",
        "oathplate legs",
      ];

      const shardCount =
        (profile.itemMap.get("oathplate shard") ?? 0) +
        (profile.itemMap.get("oathplate shards") ?? 0);

      let shardsRemaining = shardCount;
      let primaryCount = 0;
      let altCount = 0;

      for (const group of check.pieceGroups) {
        const [primaryName, ...altNames] = group;
        if (
          primaryName !== undefined &&
          (profile.itemMap.get(primaryName.toLowerCase()) ?? 0) > 0
        ) {
          primaryCount++;
          continue;
        }
        const hasOathplateSlot =
          primaryName !== undefined &&
          oathplateSlots.includes(primaryName.toLowerCase());
        if (hasOathplateSlot && shardsRemaining >= 450) {
          shardsRemaining -= 450;
          primaryCount++;
          continue;
        }
        if (
          altNames.some(
            (name) => (profile.itemMap.get(name.toLowerCase()) ?? 0) > 0,
          )
        ) {
          altCount++;
        }
      }

      const typesRepresented = primaryCount + altCount;

      if (typesRepresented >= check.required) {
        return altCount > 0 ? "pass-alt" : "pass";
      }
      if (check.required >= 2 && typesRepresented >= check.required - 1)
        return "partial";
      return "fail";
    }

    case "collection-all-checks": {
      const allPass = check.checks.every(
        (c) => checkRequirement(c, profile) !== "fail",
      );
      return allPass ? "pass" : "fail";
    }

    case "collection-masori-f": {
      const mask = (profile.itemMap.get("masori mask") ?? 0) > 0;
      const body = (profile.itemMap.get("masori body") ?? 0) > 0;
      const chaps = (profile.itemMap.get("masori chaps") ?? 0) > 0;
      const plates =
        (profile.itemMap.get("armadyl helmet") ?? 0) * 1 +
        (profile.itemMap.get("armadyl chestplate") ?? 0) * 4 +
        (profile.itemMap.get("armadyl chainskirt") ?? 0) * 3;

      if (mask && body && chaps && plates >= 8) return "pass";
      // Partial: can craft any 2 of the 3 pieces
      if (
        (mask && body && plates >= 5) ||
        (mask && chaps && plates >= 4) ||
        (body && chaps && plates >= 7)
      )
        return "partial";
      return "fail";
    }

    default: {
      return "fail";
    }
  }
}

export function getRequirementProgress(
  check: ApiCheck,
  profile: RuneProfile,
): { found: number; required: number } | null {
  switch (check.type) {
    case "collection-item": {
      const found = check.names.filter((n) =>
        ownsCollectionItem(n, profile),
      ).length;
      return { found, required: check.names.length };
    }
    case "collection-count": {
      let found = check.names.filter((n) =>
        ownsCollectionItem(n, profile),
      ).length;
      const oathplateSlots = [
        "oathplate helm",
        "oathplate chest",
        "oathplate legs",
      ];
      const oathplateSlotsInCheck = check.names.filter((n) =>
        oathplateSlots.includes(n.toLowerCase()),
      );
      if (oathplateSlotsInCheck.length > 0) {
        const shardCount =
          (profile.itemMap.get("oathplate shard") ?? 0) +
          (profile.itemMap.get("oathplate shards") ?? 0);
        const ownedSlots = oathplateSlotsInCheck.filter(
          (n) => (profile.itemMap.get(n.toLowerCase()) ?? 0) > 0,
        ).length;
        const shardPieces = Math.min(
          Math.floor(shardCount / 450),
          oathplateSlotsInCheck.length - ownedSlots,
        );
        found += shardPieces;
      }
      return {
        found: Math.min(found, check.names.length),
        required: check.names.length,
      };
    }
    case "collection-quantity": {
      const found = profile.itemMap.get(check.name.toLowerCase()) ?? 0;
      const total = check.displayTotal ?? check.required;
      return { found: Math.min(found, total), required: total };
    }
    case "collection-piece-types": {
      const oathplateSlots = [
        "oathplate helm",
        "oathplate chest",
        "oathplate legs",
      ];
      const shardCount =
        (profile.itemMap.get("oathplate shard") ?? 0) +
        (profile.itemMap.get("oathplate shards") ?? 0);
      let shardsRemaining = shardCount;
      const found = check.pieceGroups.filter((group) => {
        const [primaryName] = group;
        if (
          primaryName !== undefined &&
          (profile.itemMap.get(primaryName.toLowerCase()) ?? 0) > 0
        ) {
          return true;
        }
        const hasOathplateSlot =
          primaryName !== undefined &&
          oathplateSlots.includes(primaryName.toLowerCase());
        if (hasOathplateSlot && shardsRemaining >= 450) {
          shardsRemaining -= 450;
          return true;
        }
        return false;
      }).length;
      return { found, required: check.pieceGroups.length };
    }
    case "collection-full-groups": {
      const found = check.groups.filter((group) =>
        group.every(
          (name) => (profile.itemMap.get(name.toLowerCase()) ?? 0) > 0,
        ),
      ).length;
      return { found, required: check.required };
    }
    case "collection-any-group": {
      const countInGroup = (group: string[]) =>
        group.filter((n) => (profile.itemMap.get(n.toLowerCase()) ?? 0) > 0)
          .length;
      const maxFound = Math.max(...check.groups.map(countInGroup));
      return {
        found: Math.min(maxFound, check.required),
        required: check.required,
      };
    }
    case "collection-masori-f": {
      const mask = (profile.itemMap.get("masori mask") ?? 0) > 0;
      const body = (profile.itemMap.get("masori body") ?? 0) > 0;
      const chaps = (profile.itemMap.get("masori chaps") ?? 0) > 0;
      const plates =
        (profile.itemMap.get("armadyl helmet") ?? 0) * 1 +
        (profile.itemMap.get("armadyl chestplate") ?? 0) * 4 +
        (profile.itemMap.get("armadyl chainskirt") ?? 0) * 3;
      // Greedy allocation (most expensive first) to count max craftable pieces
      let craftable = 0;
      let remaining = plates;
      if (body && remaining >= 4) {
        craftable++;
        remaining -= 4;
      }
      if (chaps && remaining >= 3) {
        craftable++;
        remaining -= 3;
      }
      if (mask && remaining >= 1) {
        craftable++;
        remaining -= 1;
      }
      return { found: craftable, required: 3 };
    }
    default:
      return null;
  }
}

// Ranks allow skipping exactly one item — except a "hard fail" on a
// multi-item requirement, which can't be papered over by the skip because it
// represents missing more than one of the alternatives it covers.
export function isMultiItemHardFail(
  item: Item,
  result: CheckResult | undefined,
): boolean {
  if (!item.multiItem || result !== "fail" || !item.apiCheck) return false;
  switch (item.apiCheck.type) {
    case "collection-count":
    case "collection-quantity":
    case "collection-piece-types":
    case "collection-full-groups":
    case "collection-any-group":
      return item.apiCheck.required >= 2;
    case "collection-masori-f":
      return true;
    default:
      return false;
  }
}

export interface RankStats {
  total: number;
  requiredCount: number;
  satisfiedCount: number;
  isSatisfied: boolean;
}

// `profile` is nullable so this also covers the "haven't looked anyone up
// yet" state of the per-user progress view: no checks are evaluated, so
// only ranks with zero required items (after the one-item skip) show as
// satisfied.
// `verifiedItemNames` is an admin override — items with no `apiCheck` can
// never be verified from a collection log at all, so this is their only path
// to counting; items that DO have an `apiCheck` can also be manually flagged
// here to override a stale or wrong RuneProfile result. Either way, a manual
// verification always wins over whatever the checklist would've said.
export function getRankStats(
  rank: Rank,
  profile: RuneProfile | null,
  verifiedItemNames: ReadonlySet<string> = new Set(),
): RankStats {
  const total = rank.items.length;
  const requiredCount = Math.max(total - 1, 0);
  let satisfiedCount = 0;
  let hardFailCount = 0;

  rank.items.forEach((item) => {
    if (verifiedItemNames.has(item.name.toLowerCase())) {
      satisfiedCount += 1;
      return;
    }
    if (!item.apiCheck || !profile) return;
    const result = checkRequirement(item.apiCheck, profile);
    if (result === "pass" || result === "pass-alt") {
      satisfiedCount += 1;
    } else if (isMultiItemHardFail(item, result)) {
      hardFailCount += 1;
    }
  });

  return {
    total,
    requiredCount,
    satisfiedCount,
    isSatisfied: satisfiedCount >= requiredCount && hardFailCount === 0,
  };
}

export interface ClanRankProgress {
  rankStats: RankStats[];
  eligibleByRank: boolean[];
  priorRanksMetByRank: boolean[];
  highestEligibleRankIndex: number;
  overallTotal: number;
  overallSatisfied: number;
}

// Ranks are cumulative — a rank only counts as eligible once every rank
// below it (including itself) is satisfied — so this is the single source
// of truth for both the per-user progress view and the clan leaderboard.
export function computeClanRankProgress(
  ranks: Rank[],
  profile: RuneProfile | null,
  verifiedItemNames: ReadonlySet<string> = new Set(),
): ClanRankProgress {
  const rankStats = ranks.map((rank) =>
    getRankStats(rank, profile, verifiedItemNames),
  );

  const eligibleByRank = ranks.map((_, rankIndex) => {
    for (let i = 0; i <= rankIndex; i += 1) {
      if (!rankStats[i].isSatisfied) return false;
    }
    return true;
  });

  const priorRanksMetByRank = ranks.map((_, rankIndex) => {
    for (let i = 0; i < rankIndex; i += 1) {
      if (!rankStats[i].isSatisfied) return false;
    }
    return true;
  });

  let highestEligibleRankIndex = -1;
  eligibleByRank.forEach((isEligible, rankIndex) => {
    if (isEligible) highestEligibleRankIndex = rankIndex;
  });

  let overallTotal = 0;
  let overallSatisfied = 0;
  rankStats.forEach((stats) => {
    overallTotal += stats.total;
    overallSatisfied += stats.satisfiedCount;
  });

  return {
    rankStats,
    eligibleByRank,
    priorRanksMetByRank,
    highestEligibleRankIndex,
    overallTotal,
    overallSatisfied,
  };
}
