import type { ApiCheck, CheckResult } from "../components/item-card";
import { getBossKc, type RuneProfile } from "./runeprofile";

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
        const allGroups = check.groups.filter((g): g is string[] => g !== undefined);
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
      if (check.required >= 2 && completedGroups >= check.required - 1) return "partial";
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

      const typesRepresented = check.pieceGroups.filter((group) => {
        if (
          group.some(
            (name) => (profile.itemMap.get(name.toLowerCase()) ?? 0) > 0,
          )
        ) {
          return true;
        }
        const hasOathplateSlot = group.some((name) =>
          oathplateSlots.includes(name.toLowerCase()),
        );
        if (hasOathplateSlot && shardsRemaining >= 450) {
          shardsRemaining -= 450;
          return true;
        }
        return false;
      }).length;

      if (typesRepresented >= check.required) return "pass";
      if (check.required >= 2 && typesRepresented >= check.required - 1) return "partial";
      return "fail";
    }

    case "collection-all-checks": {
      const allPass = check.checks.every(
        (c) => checkRequirement(c, profile) !== "fail",
      );
      return allPass ? "pass" : "fail";
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
      const found = check.names.filter(
        (n) => (profile.itemMap.get(n.toLowerCase()) ?? 0) > 0,
      ).length;
      return { found, required: check.names.length };
    }
    case "collection-count": {
      let found = check.names.filter(
        (n) => (profile.itemMap.get(n.toLowerCase()) ?? 0) > 0,
      ).length;
      const oathplateSlots = ["oathplate helm", "oathplate chest", "oathplate legs"];
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
      return { found: Math.min(found, check.names.length), required: check.names.length };
    }
    case "collection-quantity": {
      const found = profile.itemMap.get(check.name.toLowerCase()) ?? 0;
      const total = check.displayTotal ?? check.required;
      return { found: Math.min(found, total), required: total };
    }
    case "collection-piece-types": {
      const oathplateSlots = ["oathplate helm", "oathplate chest", "oathplate legs"];
      const shardCount =
        (profile.itemMap.get("oathplate shard") ?? 0) +
        (profile.itemMap.get("oathplate shards") ?? 0);
      let shardsRemaining = shardCount;
      const found = check.pieceGroups.filter((group) => {
        if (group.some((name) => (profile.itemMap.get(name.toLowerCase()) ?? 0) > 0)) {
          return true;
        }
        const hasOathplateSlot = group.some((name) =>
          oathplateSlots.includes(name.toLowerCase()),
        );
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
        group.every((name) => (profile.itemMap.get(name.toLowerCase()) ?? 0) > 0),
      ).length;
      return { found, required: check.required };
    }
    case "collection-any-group": {
      const countInGroup = (group: string[]) =>
        group.filter((n) => (profile.itemMap.get(n.toLowerCase()) ?? 0) > 0).length;
      const maxFound = Math.max(...check.groups.map(countInGroup));
      return { found: Math.min(maxFound, check.required), required: check.required };
    }
    default:
      return null;
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
