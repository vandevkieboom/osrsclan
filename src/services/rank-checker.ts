import type { ApiCheck } from "../components/item-card";
import type { RuneProfile } from "./runeprofile";

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
): boolean {
  switch (check.type) {
    case "combat-achievement": {
      const required = CA_POINTS_REQUIRED[check.tier.toLowerCase()];
      if (required === undefined) return false;
      const totalPoints = profile.combatAchievements.reduce((sum, ca) => {
        const pts = CA_POINTS_PER_TASK[ca.name.toLowerCase()] ?? 0;
        return sum + ca.completed * pts;
      }, 0);
      return totalPoints >= required;
    }

    case "total-level": {
      const total = profile.skills.reduce((sum, s) => sum + s.level, 0);
      return total >= check.required;
    }

    case "skill-level": {
      const skill = profile.skills.find(
        (s) => s.name.toLowerCase() === check.skill.toLowerCase(),
      );
      return (skill?.level ?? 0) >= check.required;
    }

    case "quest-cape":
      // All non-mini quests must be finished
      return (
        profile.quests.length > 0 &&
        profile.quests
          .filter((q) => q.type !== "mini")
          .every((q) => q.state === "finished")
      );

    case "quest": {
      const quest = profile.quests.find(
        (q) => q.name.toLowerCase() === check.name.toLowerCase(),
      );
      return quest?.state === "finished";
    }

    case "diary-cape":
      return (
        profile.achievementDiaries.length > 0 &&
        profile.achievementDiaries.every((d) =>
          d.tiers.every((t) => t.completed >= t.total),
        )
      );

    case "collection-item":
      return check.names.some(
        (n) => (profile.itemMap.get(n.toLowerCase()) ?? 0) > 0,
      );

    case "collection-count": {
      const found = check.names.filter(
        (n) => (profile.itemMap.get(n.toLowerCase()) ?? 0) > 0,
      ).length;
      return found >= check.required;
    }

    case "collection-quantity":
      return (
        (profile.itemMap.get(check.name.toLowerCase()) ?? 0) >= check.required
      );

    default:
      return false;
  }
}
