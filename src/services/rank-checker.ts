import type { ApiCheck, CheckResult, Item } from "../types/item.js";
import type { Rank } from "../types/rank.js";
import type { RuneProfile } from "./runeprofile.js";

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
      const results = check.checks.map((c) => checkRequirement(c, profile));
      const allPass = results.every(
        (r) => r === "pass" || r === "pass-alt",
      );
      if (!allPass) return "fail";
      const anyAlt = results.some((r) => r === "pass-alt");
      return anyAlt ? "pass-alt" : "pass";
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

/**
 * Progress toward *satisfying* a requirement, not toward owning everything
 * that could possibly satisfy it.
 *
 * `required` is the count that actually completes the check; `pool` is how
 * many distinct items would qualify, when that is more than `required`.
 * These used to be the same number, and it read as a far bigger ask than the
 * rank actually made: "2/3 Cerberus crystals" needs 2 of the 3, but the badge
 * counted against 3 and so showed 0/3 to somebody two crystals from done,
 * contradicting the requirement's own name right next to it.
 */
export interface RequirementProgress {
  found: number;
  /** The count that completes this check. */
  required: number;
  /** How many distinct items qualify, when that is more than `required`. */
  pool?: number;
}

export function getRequirementProgress(
  check: ApiCheck,
  profile: RuneProfile,
): RequirementProgress | null {
  switch (check.type) {
    case "collection-item": {
      // Passes on owning ANY of these names - they are alternative spellings
      // for one item rather than a set to collect - so the threshold is 1 no
      // matter how many are listed.
      const found = check.names.some((n) => ownsCollectionItem(n, profile))
        ? 1
        : 0;
      return { found, required: 1 };
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
        found: Math.min(found, check.required),
        required: check.required,
        pool: check.names.length,
      };
    }
    case "collection-quantity": {
      const found = profile.itemMap.get(check.name.toLowerCase()) ?? 0;
      return {
        found: Math.min(found, check.required),
        required: check.required,
        pool: check.displayTotal,
      };
    }
    case "collection-piece-types": {
      // Was only ever checking each group's primary name (Virtus mask, say),
      // never its alternates (Ancestral hat) - so somebody with 2 ancestral
      // pieces and 0 virtus pieces showed 0/3 here while checkRequirement's
      // own version of this same check (above), which does look at altNames,
      // correctly passed them as 2/3. The badge and the actual pass/fail
      // determination were reading two different rules for the same
      // requirement. Now mirrors checkRequirement's primaryCount + altCount
      // exactly, including the same oathplate-shard consumption order.
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
        const [primaryName, ...altNames] = group;
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
        return altNames.some(
          (name) => (profile.itemMap.get(name.toLowerCase()) ?? 0) > 0,
        );
      }).length;
      return {
        found: Math.min(found, check.required),
        required: check.required,
        pool: check.pieceGroups.length,
      };
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
    // A set assembled from per-slot alternatives (blue moon OR ahrim's OR
    // virtus OR ancestral, for each of three slots). Counting the slots filled
    // by ANY accepted alternative is the entire point: somebody holding one
    // ancestral piece is a third of the way there, and reporting 0/3 because
    // they own no blue moon specifically was measuring a set nobody is
    // required to collect.
    case "collection-all-checks": {
      const found = check.checks.filter((c) => {
        const result = checkRequirement(c, profile);
        return result === "pass" || result === "pass-alt";
      }).length;
      return { found, required: check.checks.length };
    }
    // Satisfied by any one branch, so progress is whichever branch the player
    // is furthest along, not the primary one by default.
    case "collection-any-of": {
      const branches = [check.primary, ...check.alternatives];
      const satisfied = branches.some((branch) => {
        const result = checkRequirement(branch, profile);
        return result === "pass" || result === "pass-alt";
      });
      if (satisfied) return { found: 1, required: 1 };
      let best: RequirementProgress | null = null;
      for (const branch of branches) {
        const progress = getRequirementProgress(branch, profile);
        if (!progress || progress.required === 0) continue;
        if (
          !best ||
          progress.found / progress.required > best.found / best.required
        ) {
          best = progress;
        }
      }
      return best;
    }
    default:
      return null;
  }
}

/**
 * The {found, required} pair a single rank item contributes to its rank's
 * totals, for every check type - not just the multi-item ones
 * getRequirementProgress covers.
 *
 * getRequirementProgress returns null for a simple pass/fail check (a combat
 * achievement tier, a quest, a skill level): those have no partial state, so
 * they contribute a plain 1-unit requirement, satisfied or not, exactly like
 * a single named item always did under the old row-counted model.
 */
function getItemUnits(
  check: ApiCheck,
  profile: RuneProfile,
): { found: number; required: number } {
  const progress = getRequirementProgress(check, profile);
  if (progress) {
    return { found: progress.found, required: progress.required };
  }
  const result = checkRequirement(check, profile);
  return { found: result === "pass" || result === "pass-alt" ? 1 : 0, required: 1 };
}

// Matches "2/3 Cerberus crystals", "4/4 DT2 rings" - a rank item's own name
// promising the player it's worth that many units. Deliberately read from the
// name rather than trusted from the apiCheck's internal `required`: those two
// numbers usually agree, but not always, and the name is what a member is
// actually shown, so it - not an internal detail - is the source of truth for
// what gets counted.
const LABELED_COUNT_RE = /^\d+\/\d+\s/;

/**
 * Whether a rank item's own name promises a count ("2/3 Cerberus crystals"),
 * as opposed to a plain name ("Zaryte crossbow") that happens to be detected
 * via a multi-part check behind the scenes.
 *
 * Exported so the item card can use the exact same rule to decide whether to
 * show a progress badge at all - Zaryte crossbow needs 2 components to
 * detect, but its name never promised a count, so a "1/2" badge on it would
 * be telling the player something the card's own label doesn't back up.
 */
export function hasLabeledCount(name: string): boolean {
  return LABELED_COUNT_RE.test(name);
}

/**
 * A rank item's real weight toward its rank's total, distinct from whatever
 * its apiCheck needs internally to detect completion.
 *
 * A named item like "Zaryte crossbow" or "Voidwaker" is one achievement to a
 * player, full stop - that it happens to be assembled from 2 or 3 components
 * behind the scenes is a detection detail, not something the rank total
 * should weigh as 2 or 3 separate wins. Only an item whose own name already
 * promises a count ("2/3 Cerberus crystals") is actually asking for more than
 * one thing, so only those get weighted by their real required amount;
 * everything else collapses to a plain 1-unit pass/fail for counting
 * purposes, regardless of how many ingredients its check evaluates.
 *
 * Uses the same hasLabeledCount rule the item card uses to decide whether to
 * show a progress badge at all, so a card never shows "1/2" on something the
 * rank total is only weighing as 1 - the two would otherwise disagree about
 * how many things this row is asking for.
 */
function getRankUnits(
  item: Item,
  profile: RuneProfile,
): { found: number; required: number } {
  const units = item.apiCheck ? getItemUnits(item.apiCheck, profile) : { found: 0, required: 1 };
  if (hasLabeledCount(item.name)) {
    return units;
  }
  return { found: units.found >= units.required ? 1 : 0, required: 1 };
}

export interface RankStats {
  total: number;
  requiredCount: number;
  satisfiedCount: number;
  isSatisfied: boolean;
}

/**
 * `profile` is nullable so this also covers the "haven't looked anyone up
 * yet" state of the per-user progress view: no checks are evaluated, so only
 * ranks with zero required units (after the one-item skip) show as satisfied.
 *
 * `verifiedItemNames` is an admin override — items with no `apiCheck` can
 * never be verified from a collection log at all, so this is their only path
 * to counting; items that DO have an `apiCheck` can also be manually flagged
 * here to override a stale or wrong RuneProfile result. Either way, a manual
 * verification always wins over whatever the checklist would've said.
 *
 * Counts individual *items* toward a rank's total, not requirement *rows* -
 * see getRankUnits for exactly what "an item" means here. "2/3 Cerberus
 * crystals" needs 2, so it contributes 2 to the total and up to 2 to
 * satisfiedCount, the same weight as two separate single-item rows would -
 * not 1, the way every row counted equally before regardless of how many
 * items it actually asked for. Skipping one item now means exactly that:
 * being short by one unit anywhere in the rank, whether that unit is an
 * entire single-item row or one crystal out of three.
 *
 * An item like "Zaryte crossbow" still only ever weighs 1, even though its
 * apiCheck needs 2 components to detect - its name makes no promise of a
 * count, so it isn't one to the player, and shouldn't be one in the total.
 *
 * This replaces the previous two-part rule (count satisfied rows, then
 * separately hard-block on a badly-missed multi-item row) with one additive
 * threshold, and the two turn out to agree on every case: a row missing by
 * more than one unit already drags the sum below requiredCount on its own, so
 * nothing extra has to be bolted on to catch it. The practical payoff is that
 * "satisfiedCount >= requiredCount" can no longer be true while a rank is
 * still genuinely blocked - which the row-counted version could do, and was
 * exactly the "7 / 8 complete (7 needed)" reading-as-done bug this replaces.
 */
export function getRankStats(
  rank: Rank,
  profile: RuneProfile | null,
  verifiedItemNames: ReadonlySet<string> = new Set(),
): RankStats {
  let total = 0;
  let satisfiedCount = 0;

  rank.items.forEach((item) => {
    const units =
      item.apiCheck && profile
        ? getRankUnits(item, profile)
        : { found: 0, required: 1 };
    total += units.required;
    if (verifiedItemNames.has(item.name.toLowerCase())) {
      // A manual verification always wins outright, regardless of whatever
      // the checklist found - full credit for this item's own requirement.
      satisfiedCount += units.required;
    } else {
      satisfiedCount += units.found;
    }
  });

  const requiredCount = Math.max(total - 1, 0);
  return {
    total,
    requiredCount,
    satisfiedCount,
    isSatisfied: satisfiedCount >= requiredCount,
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
