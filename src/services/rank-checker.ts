import type { ApiCheck, CheckResult } from "../components/item-card";
import { getBossKc, type RuneProfile } from "./runeprofile";

// Points each completed task contributes, per tier
const CA_POINTS_PER_TASK: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  elite: 4,
  master: 5,
  grandmaster: 6,
};

// Cumulative point threshold required to unlock each tier's rewards
const CA_POINTS_REQUIRED: Record<string, number> = {
  easy: 41,
  medium: 161,
  hard: 416,
  elite: 1064,
  master: 1904,
  grandmaster: 2630,
};

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

      const totalPoints = profile.combatAchievements.reduce((sum, ca) => {
        const pts = CA_POINTS_PER_TASK[ca.name.toLowerCase()] ?? 0;
        return sum + ca.completed * pts;
      }, 0);
      return totalPoints >= required ? "pass" : "fail";
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
      // All non-mini quests must be finished
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
      const passed = check.names.some(
        (n) => (profile.itemMap.get(n.toLowerCase()) ?? 0) > 0,
      );
      return passed ? "pass" : "fail";
    }

    case "collection-count": {
      let found = check.names.filter(
        (n) => (profile.itemMap.get(n.toLowerCase()) ?? 0) > 0,
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

      return found >= check.required ? "pass" : "fail";
    }

    case "collection-quantity": {
      const passed =
        (profile.itemMap.get(check.name.toLowerCase()) ?? 0) >= check.required;
      return passed ? "pass" : "fail";
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
      if (checkRequirement(check.primary, profile) !== "fail") {
        return "pass";
      }
      for (const alt of check.alternatives) {
        if (checkRequirement(alt, profile) !== "fail") {
          return "pass-alt";
        }
      }
      return "fail";
    }

    default: {
      return "fail";
    }
  }
}

export function checkEntryRequirement(profile: RuneProfile): {
  met: boolean;
  which?: string;
} {
  const enhancedSeedCount =
    profile.itemMap.get("enhanced crystal weapon seed") ?? 0;
  const armourSeeds = Math.max(
    profile.itemMap.get("crystal armour seed") ?? 0,
    profile.itemMap.get("crystal armor seed") ?? 0,
  );
  if (enhancedSeedCount >= 1 && armourSeeds >= 6) {
    return {
      met: true,
      which: `1 Enhanced Crystal Weapon Seed + 6 Crystal Armour Seeds (${armourSeeds})`,
    };
  }

  const cgKc = getBossKc(profile.bossKcMap, [
    "corrupted gauntlet",
    "the corrupted gauntlet",
  ]);
  if (cgKc >= 800) {
    return { met: true, which: `Corrupted Gauntlet (${cgKc} kc)` };
  }

  if ((profile.itemMap.get("twisted bow") ?? 0) >= 1) {
    return { met: true, which: "Twisted Bow" };
  }

  return { met: false };
}
