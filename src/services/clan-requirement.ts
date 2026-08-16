import { getBossKc, type RuneProfile } from "./runeprofile.js";

export interface ClanRequirementResult {
  met: boolean;
  reason: string | null;
}

// The clan's hard bingo-eligibility gate — separate from (and stricter than)
// the rank-tier ladder in ranks-data.ts/rank-checker.ts. Extracted out of
// time-served-page.tsx (where this used to be an inline IIFE) so the plugin's
// "!verify" command (api/runeprofile-proxy.ts's resource=clan-req) can run
// the exact same check server-side instead of duplicating it.
export function checkClanRequirement(profile: RuneProfile): ClanRequirementResult {
  const enhancedSeedCount =
    profile.itemMap.get("enhanced crystal weapon seed") ?? 0;
  const armourSeeds = Math.max(
    profile.itemMap.get("crystal armour seed") ?? 0,
    profile.itemMap.get("crystal armor seed") ?? 0,
  );
  if (enhancedSeedCount >= 1 && armourSeeds >= 6) {
    return {
      met: true,
      reason:
        `${enhancedSeedCount} Enhanced Crystal Weapon Seed${enhancedSeedCount > 1 ? "s" : ""}` +
        ` + ${armourSeeds} Crystal Armour Seed${armourSeeds > 1 ? "s" : ""}`,
    };
  }

  const cgKc = getBossKc(profile.bossKcMap, [
    "corrupted gauntlet",
    "the corrupted gauntlet",
  ]);
  if (cgKc >= 800) {
    return { met: true, reason: `Corrupted Gauntlet (${cgKc} kc)` };
  }

  if ((profile.itemMap.get("twisted bow") ?? 0) >= 1) {
    return { met: true, reason: "Twisted Bow" };
  }

  return { met: false, reason: null };
}
