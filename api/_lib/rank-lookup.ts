import { ranks } from "../../src/data/ranks-data.js";
import {
  checkRequirement,
  computeClanRankProgress,
} from "../../src/services/rank-checker.js";
import {
  buildRuneProfile,
  type CombatAchievementTasksResponse,
  type FullAccountResponse,
  type RuneProfile,
  type WomPlayerResponse,
} from "../../src/services/runeprofile.js";
import { getVerifiedItemNames } from "./verifications-marker.js";

// A member's clan-rank progress from a live RuneProfile, shared by the
// plugin's `!rank`/`!needed` (api/runeprofile-proxy.ts) and the Discord bot's
// `/rank` (api/_lib/discord.ts), so the two can never disagree. Moved here
// unchanged from runeprofile-proxy.ts.

export const RP_BASE = "https://api.runeprofile.com/v1";
const API_KEY = process.env.RUNEPROFILE_API_KEY ?? "";
export const RP_HEADERS: Record<string, string> = {
  Accept: "application/json",
  ...(API_KEY ? { "x-api-key": API_KEY } : {}),
};

const WOM_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent": "vandevkieboom",
  ...(process.env.WOM_API_KEY ? { "x-api-key": process.env.WOM_API_KEY } : {}),
};

// RuneProfile's stored username for an account isn't guaranteed to match the
// real OSRS name exactly — most accounts keep real spaces, matching what WOM
// or a caller types, but some are registered there with underscores
// substituted in instead (verified against the live API: "Solo Nostalg"
// exists as-is, "useless pov" only exists as "useless_pov"). RuneProfile does
// an exact match with no normalization either way, so a 404 on the literal
// name is retried once with that substitution before being treated as "not
// on RuneProfile" — that conclusion should mean the account genuinely
// doesn't exist there, not just that this one spelling didn't match.
export async function fetchWithUnderscoreFallback(
  username: string,
  fetchByName: (name: string) => Promise<Response>,
): Promise<{ res: Response; resolvedUsername: string }> {
  const res = await fetchByName(username);
  if (res.status !== 404 || !username.includes(" ")) {
    return { res, resolvedUsername: username };
  }
  const fallbackUsername = username.replace(/ /g, "_");
  const fallbackRes = await fetchByName(fallbackUsername);
  return fallbackRes.status === 404
    ? { res, resolvedUsername: username }
    : { res: fallbackRes, resolvedUsername: fallbackUsername };
}

export type ResolvedMember =
  | { ok: true; displayName: string; profile: RuneProfile }
  | { ok: false; status: number; error: string; reason?: string };

/**
 * Resolves an RSN to a live RuneProfile, for `!rank`/`!verify`/`!needed`.
 *
 * Looks the name up exactly as typed, which is precisely what the website's
 * own Clan Ranks page does (fetchRuneProfile in src/services/runeprofile.ts).
 *
 * This used to consult the clan's WOM group roster first and then query
 * RuneProfile with the roster's stored displayName rather than the typed
 * name, on the stated grounds that "RuneProfile needs the real, properly-cased
 * name". That premise was simply wrong: RuneProfile's lookup is
 * case-insensitive (verified against the live API), so the substitution
 * bought nothing while quietly introducing a failure mode. Any time the
 * roster's name and the name RuneProfile knew disagreed, most often a rename
 * only one side had caught up on, the lookup went out under the wrong name
 * and came back 404. The plugin then told a member with a perfectly good
 * profile that they "aren't set up on RuneProfile", while the website, asking
 * under the name the member actually typed, found them immediately.
 *
 * The roster's only other contribution was the member's clan role, which fed
 * a `currentRank` field the plugin never read. So it cost a ~500 member WOM
 * group fetch, plus one more upstream call for a request to time out on, to
 * produce a value nothing displayed. Boss kc still comes from WOM below,
 * exactly as the website's own lookup gets it.
 */
export async function resolveMemberProfile(rsn: string): Promise<ResolvedMember> {
  const { res: fullRes, resolvedUsername } = await fetchWithUnderscoreFallback(
    rsn,
    (name) =>
      fetch(`${RP_BASE}/accounts/${encodeURIComponent(name)}/full`, {
        headers: RP_HEADERS,
      }),
  );
  if (fullRes.status === 404) {
    return {
      ok: false,
      status: 404,
      error: `${rsn} isn't set up on RuneProfile.`,
      // Lets callers distinguish "never synced" from any other failure
      // without string-matching the message above.
      reason: "not-on-runeprofile",
    };
  }
  if (fullRes.status === 429) {
    return {
      ok: false,
      status: 429,
      error: "Rate limit hit — wait a moment and try again.",
    };
  }
  if (!fullRes.ok) {
    return { ok: false, status: 502, error: "Failed to fetch RuneProfile data." };
  }
  const data = (await fullRes.json()) as FullAccountResponse;

  // Run alongside each other rather than sequentially - neither depends on the other's result.
  const [tasksData, womData] = await Promise.all([
    fetch(`${RP_BASE}/accounts/${encodeURIComponent(resolvedUsername)}/combat-achievements/tasks`, { headers: RP_HEADERS })
      .then((res) => (res.ok ? (res.json() as Promise<CombatAchievementTasksResponse>) : null))
      .catch(() => null),
    // WOM's per-player lookup isn't scoped to our group, so this can still
    // find boss kc for someone outside the clan too - worth trying either way.
    fetchWomPlayerData(rsn),
  ]);

  const profile = buildRuneProfile(data, tasksData, womData);
  return { ok: true, displayName: rsn, profile };
}

// Boss kc isn't in RuneProfile's own payload at all - it only tracks collection log/skills/quests/CAs.
// The client-side fetchRuneProfile() (src/services/runeprofile.ts) already knew this and pulled boss kc
// from a separate Wise Old Man player lookup; resolveMemberProfile above used to skip this entirely
// (passing null for womData), which meant every boss-kc apiCheck here silently saw 0 kc regardless of
// the real value - never noticed until getClanRequirement's Corrupted Gauntlet check actually depended
// on it. A missing/failed WOM lookup degrades to "no boss kc data" rather than failing the whole
// request, same as the client-side version's .catch(() => null).
async function fetchWomPlayerData(username: string): Promise<WomPlayerResponse | null> {
  try {
    const res = await fetch(`https://api.wiseoldman.net/v2/players/${encodeURIComponent(username)}`, {
      headers: WOM_HEADERS,
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as WomPlayerResponse;
  } catch {
    return null;
  }
}

export interface RankLookup {
  rsn: string;
  eligibleRank: string | null;
  overallSatisfied: number;
  overallTotal: number;
  nextRank: string | null;
  neededForNextRank: number | null;
  missingItemNames: string[];
}

export async function lookupRankProgress(
  displayName: string,
  profile: RuneProfile,
): Promise<RankLookup> {
  const verifiedItemNames = await getVerifiedItemNames(displayName.toLowerCase());

  const progress = computeClanRankProgress(ranks, profile, verifiedItemNames);

  // What's left for the *next* tier up — same "satisfied" rule
  // getRankStats uses internally (manually verified, or an apiCheck that
  // actually passes), just listing the item names instead of only a count.
  // Capped at 8 names so a big early tier can't blow up the plugin's chat
  // reply; the exact "any N of these" nuance (one item can always be
  // skipped) isn't reproduced here since this is informational, not
  // gating anything.
  const nextRankIndex = progress.highestEligibleRankIndex + 1;
  let nextRank: string | null = null;
  let neededForNextRank: number | null = null;
  let missingItemNames: string[] = [];
  if (nextRankIndex < ranks.length) {
    const rank = ranks[nextRankIndex];
    const stats = progress.rankStats[nextRankIndex];
    nextRank = rank.name;
    neededForNextRank = Math.max(0, stats.requiredCount - stats.satisfiedCount);
    missingItemNames = rank.items
      .filter((item) => {
        if (verifiedItemNames.has(item.name.toLowerCase())) return false;
        if (item.apiCheck) {
          const result = checkRequirement(item.apiCheck, profile);
          if (result === "pass" || result === "pass-alt") return false;
        }
        return true;
      })
      .map((item) => item.name)
      .slice(0, 8);
  }

  return {
    rsn: displayName,
    eligibleRank:
      progress.highestEligibleRankIndex >= 0
        ? ranks[progress.highestEligibleRankIndex].name
        : null,
    overallSatisfied: progress.overallSatisfied,
    overallTotal: progress.overallTotal,
    nextRank,
    neededForNextRank,
    missingItemNames,
  };
}
