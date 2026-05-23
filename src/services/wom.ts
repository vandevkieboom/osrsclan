const GROUP_ID = 22206;
const BASE_URL = "https://api.wiseoldman.net/v2";

export interface WomHiscoresEntry {
  player: {
    username: string;
    displayName: string;
    type: "ironman" | "ultimate" | "hardcore" | "regular" | string;
    exp: number;
    ehp: number;
    ehb: number;
  };
  data: {
    type: "skill" | "boss" | "activity" | "computed";
    rank: number;
    level?: number;
    experience?: number;
    kills?: number;
    score?: number;
    value?: number;
  };
}

export interface MetricOption {
  value: string;
  label: string;
  dataType: "skill" | "boss" | "activity" | "computed";
}

export interface MetricGroup {
  groupLabel: string;
  metrics: MetricOption[];
}

// Maps WOM metric values to icon URLs hosted on WOM's own CDN.
const ICON_OVERRIDES: Record<string, string> = {
  hueycoatl: "the_hueycoatl",
};

export function getWomMetricIcon(metric: string): string {
  const name = ICON_OVERRIDES[metric] ?? metric;
  return `https://cdn.jsdelivr.net/gh/wise-old-man/wise-old-man@master/app/public/img/metrics/${name}.png`;
}

export const METRIC_GROUPS: MetricGroup[] = [
  {
    groupLabel: "Overall",
    metrics: [
      {
        value: "overall",
        label: "Overall",
        dataType: "skill",
      },
    ],
  },
  {
    groupLabel: "Skills",
    metrics: [
      {
        value: "attack",
        label: "Attack",
        dataType: "skill",
      },
      {
        value: "defence",
        label: "Defence",
        dataType: "skill",
      },
      {
        value: "strength",
        label: "Strength",
        dataType: "skill",
      },
      {
        value: "hitpoints",
        label: "Hitpoints",
        dataType: "skill",
      },
      {
        value: "ranged",
        label: "Ranged",
        dataType: "skill",
      },
      {
        value: "prayer",
        label: "Prayer",
        dataType: "skill",
      },
      {
        value: "magic",
        label: "Magic",
        dataType: "skill",
      },
      {
        value: "cooking",
        label: "Cooking",
        dataType: "skill",
      },
      {
        value: "woodcutting",
        label: "Woodcutting",
        dataType: "skill",
      },
      {
        value: "fletching",
        label: "Fletching",
        dataType: "skill",
      },
      {
        value: "fishing",
        label: "Fishing",
        dataType: "skill",
      },
      {
        value: "firemaking",
        label: "Firemaking",
        dataType: "skill",
      },
      {
        value: "crafting",
        label: "Crafting",
        dataType: "skill",
      },
      {
        value: "smithing",
        label: "Smithing",
        dataType: "skill",
      },
      {
        value: "mining",
        label: "Mining",
        dataType: "skill",
      },
      {
        value: "herblore",
        label: "Herblore",
        dataType: "skill",
      },
      {
        value: "agility",
        label: "Agility",
        dataType: "skill",
      },
      {
        value: "thieving",
        label: "Thieving",
        dataType: "skill",
      },
      {
        value: "slayer",
        label: "Slayer",
        dataType: "skill",
      },
      {
        value: "farming",
        label: "Farming",
        dataType: "skill",
      },
      {
        value: "runecrafting",
        label: "Runecrafting",
        dataType: "skill",
      },
      {
        value: "hunter",
        label: "Hunter",
        dataType: "skill",
      },
      {
        value: "construction",
        label: "Construction",
        dataType: "skill",
      },
      {
        value: "sailing",
        label: "Sailing",
        dataType: "skill",
      },
    ],
  },
  {
    groupLabel: "Bosses",
    metrics: [
      {
        value: "abyssal_sire",
        label: "Abyssal Sire",
        dataType: "boss",
      },
      {
        value: "alchemical_hydra",
        label: "Alchemical Hydra",
        dataType: "boss",
      },
      {
        value: "amoxliatl",
        label: "Amoxliatl",
        dataType: "boss",
      },
      {
        value: "araxxor",
        label: "Araxxor",
        dataType: "boss",
      },
      {
        value: "artio",
        label: "Artio",
        dataType: "boss",
      },
      {
        value: "barrows_chests",
        label: "Barrows Chests",
        dataType: "boss",
      },
      {
        value: "bryophyta",
        label: "Bryophyta",
        dataType: "boss",
      },
      {
        value: "brutus",
        label: "Brutus",
        dataType: "boss",
      },
      {
        value: "callisto",
        label: "Callisto",
        dataType: "boss",
      },
      {
        value: "calvarion",
        label: "Calvar'ion",
        dataType: "boss",
      },
      {
        value: "cerberus",
        label: "Cerberus",
        dataType: "boss",
      },
      {
        value: "chambers_of_xeric",
        label: "Chambers of Xeric",
        dataType: "boss",
      },
      {
        value: "chambers_of_xeric_challenge_mode",
        label: "CoX Challenge Mode",
        dataType: "boss",
      },
      {
        value: "chaos_elemental",
        label: "Chaos Elemental",
        dataType: "boss",
      },
      {
        value: "chaos_fanatic",
        label: "Chaos Fanatic",
        dataType: "boss",
      },
      {
        value: "commander_zilyana",
        label: "Commander Zilyana",
        dataType: "boss",
      },
      {
        value: "corporeal_beast",
        label: "Corporeal Beast",
        dataType: "boss",
      },
      {
        value: "crazy_archaeologist",
        label: "Crazy Archaeologist",
        dataType: "boss",
      },
      {
        value: "dagannoth_prime",
        label: "Dagannoth Prime",
        dataType: "boss",
      },
      {
        value: "dagannoth_rex",
        label: "Dagannoth Rex",
        dataType: "boss",
      },
      {
        value: "dagannoth_supreme",
        label: "Dagannoth Supreme",
        dataType: "boss",
      },
      {
        value: "deranged_archaeologist",
        label: "Deranged Archaeologist",
        dataType: "boss",
      },
      {
        value: "doom_of_mokhaiotl",
        label: "Doom of Mokhaiotl",
        dataType: "boss",
      },
      {
        value: "duke_sucellus",
        label: "Duke Sucellus",
        dataType: "boss",
      },
      {
        value: "general_graardor",
        label: "General Graardor",
        dataType: "boss",
      },
      {
        value: "giant_mole",
        label: "Giant Mole",
        dataType: "boss",
      },
      {
        value: "grotesque_guardians",
        label: "Grotesque Guardians",
        dataType: "boss",
      },
      {
        value: "hespori",
        label: "Hespori",
        dataType: "boss",
      },
      {
        value: "hueycoatl",
        label: "Hueycoatl",
        dataType: "boss",
      },
      {
        value: "kalphite_queen",
        label: "Kalphite Queen",
        dataType: "boss",
      },
      {
        value: "king_black_dragon",
        label: "King Black Dragon",
        dataType: "boss",
      },
      {
        value: "kraken",
        label: "Kraken",
        dataType: "boss",
      },
      {
        value: "kreearra",
        label: "Kree'arra",
        dataType: "boss",
      },
      {
        value: "kril_tsutsaroth",
        label: "K'ril Tsutsaroth",
        dataType: "boss",
      },
      {
        value: "lunar_chests",
        label: "Lunar Chests",
        dataType: "boss",
      },
      {
        value: "mimic",
        label: "Mimic",
        dataType: "boss",
      },
      {
        value: "nex",
        label: "Nex",
        dataType: "boss",
      },
      {
        value: "nightmare",
        label: "Nightmare",
        dataType: "boss",
      },
      {
        value: "phosanis_nightmare",
        label: "Phosani's Nightmare",
        dataType: "boss",
      },
      {
        value: "obor",
        label: "Obor",
        dataType: "boss",
      },
      {
        value: "phantom_muspah",
        label: "Phantom Muspah",
        dataType: "boss",
      },
      {
        value: "sarachnis",
        label: "Sarachnis",
        dataType: "boss",
      },
      {
        value: "scorpia",
        label: "Scorpia",
        dataType: "boss",
      },
      {
        value: "scurrius",
        label: "Scurrius",
        dataType: "boss",
      },
      {
        value: "skotizo",
        label: "Skotizo",
        dataType: "boss",
      },
      {
        value: "sol_heredit",
        label: "Sol Heredit",
        dataType: "boss",
      },
      {
        value: "spindel",
        label: "Spindel",
        dataType: "boss",
      },
      {
        value: "tempoross",
        label: "Tempoross",
        dataType: "boss",
      },
      {
        value: "the_gauntlet",
        label: "The Gauntlet",
        dataType: "boss",
      },
      {
        value: "the_corrupted_gauntlet",
        label: "The Corrupted Gauntlet",
        dataType: "boss",
      },
      {
        value: "the_leviathan",
        label: "The Leviathan",
        dataType: "boss",
      },
      {
        value: "the_royal_titans",
        label: "The Royal Titans",
        dataType: "boss",
      },
      {
        value: "the_whisperer",
        label: "The Whisperer",
        dataType: "boss",
      },
      {
        value: "theatre_of_blood",
        label: "Theatre of Blood",
        dataType: "boss",
      },
      {
        value: "theatre_of_blood_hard_mode",
        label: "Theatre of Blood (HM)",
        dataType: "boss",
      },
      {
        value: "thermonuclear_smoke_devil",
        label: "Thermonuclear Smoke Devil",
        dataType: "boss",
      },
      {
        value: "tombs_of_amascut",
        label: "Tombs of Amascut",
        dataType: "boss",
      },
      {
        value: "tombs_of_amascut_expert",
        label: "Tombs of Amascut (Expert)",
        dataType: "boss",
      },
      {
        value: "tzkal_zuk",
        label: "TzKal-Zuk",
        dataType: "boss",
      },
      {
        value: "tztok_jad",
        label: "TzTok-Jad",
        dataType: "boss",
      },
      {
        value: "vardorvis",
        label: "Vardorvis",
        dataType: "boss",
      },
      {
        value: "venenatis",
        label: "Venenatis",
        dataType: "boss",
      },
      {
        value: "vetion",
        label: "Vet'ion",
        dataType: "boss",
      },
      {
        value: "vorkath",
        label: "Vorkath",
        dataType: "boss",
      },
      {
        value: "wintertodt",
        label: "Wintertodt",
        dataType: "boss",
      },
      {
        value: "zalcano",
        label: "Zalcano",
        dataType: "boss",
      },
      {
        value: "zulrah",
        label: "Zulrah",
        dataType: "boss",
      },
    ],
  },
  {
    groupLabel: "Clue Scrolls",
    metrics: [
      {
        value: "clue_scrolls_all",
        label: "All Clues",
        dataType: "activity",
      },
      {
        value: "clue_scrolls_beginner",
        label: "Beginner Clues",
        dataType: "activity",
      },
      {
        value: "clue_scrolls_easy",
        label: "Easy Clues",
        dataType: "activity",
      },
      {
        value: "clue_scrolls_medium",
        label: "Medium Clues",
        dataType: "activity",
      },
      {
        value: "clue_scrolls_hard",
        label: "Hard Clues",
        dataType: "activity",
      },
      {
        value: "clue_scrolls_elite",
        label: "Elite Clues",
        dataType: "activity",
      },
      {
        value: "clue_scrolls_master",
        label: "Master Clues",
        dataType: "activity",
      },
    ],
  },
  {
    groupLabel: "Activities",
    metrics: [
      {
        value: "collections_logged",
        label: "Collection Log",
        dataType: "activity",
      },
      {
        value: "colosseum_glory",
        label: "Colosseum Glory",
        dataType: "activity",
      },
      {
        value: "guardians_of_the_rift",
        label: "Guardians of the Rift",
        dataType: "activity",
      },
      {
        value: "last_man_standing",
        label: "Last Man Standing",
        dataType: "activity",
      },
      {
        value: "pvp_arena",
        label: "PvP Arena",
        dataType: "activity",
      },
      {
        value: "soul_wars_zeal",
        label: "Soul Wars Zeal",
        dataType: "activity",
      },
    ],
  },
  {
    groupLabel: "Computed",
    metrics: [
      {
        value: "ehp",
        label: "EHP (Efficient Hours Played)",
        dataType: "computed",
      },
      {
        value: "ehb",
        label: "EHB (Efficient Hours Bossing)",
        dataType: "computed",
      },
    ],
  },
];

export async function fetchClanHiscores(
  metric: string,
): Promise<WomHiscoresEntry[]> {
  const url = `${BASE_URL}/groups/${GROUP_ID}/hiscores?metric=${encodeURIComponent(metric)}&limit=500`;
  const res = await fetch(url);

  if (res.status === 429) {
    throw new Error("Rate limit hit — wait a moment and try again.");
  }
  if (!res.ok) {
    throw new Error(`Failed to load hiscores (${res.status}).`);
  }

  return res.json() as Promise<WomHiscoresEntry[]>;
}
