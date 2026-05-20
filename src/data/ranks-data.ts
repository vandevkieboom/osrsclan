import type { Rank } from "../components/rank-card";

const ranks: Rank[] = [
  {
    name: "Sapphire",
    color: "#2a62e5",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Sapphire.png",
    items: [
      {
        name: "Easy CA Completed",
        img: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_1_detail.png",
        alt: "Ghommal's Hilt 1",
        apiCheck: { type: "combat-achievement", tier: "Easy" },
      },
      {
        name: "Fire Cape",
        img: "https://oldschool.runescape.wiki/images/Fire_cape_detail.png",
        alt: "Fire Cape",
        apiCheck: { type: "collection-item", names: ["Fire cape"] },
      },
      {
        name: "Imbued God Cape",
        img: "https://oldschool.runescape.wiki/images/Imbued_zamorak_cape_detail.png",
        alt: "Imbued God Cape",
        apiCheck: { type: "quest", name: "Mage Arena II" },
      },
      {
        name: "Berserker Ring",
        img: "https://oldschool.runescape.wiki/images/Berserker_ring_detail.png",
        alt: "Berserker Ring",
        apiCheck: { type: "collection-item", names: ["Berserker ring"] },
      },
      {
        name: "Dragon Defender",
        img: "https://oldschool.runescape.wiki/images/Dragon_defender_detail.png",
        alt: "Dragon Defender",
        apiCheck: { type: "collection-item", names: ["Dragon defender"] },
      },
      {
        name: "Warped Sceptre",
        img: "https://oldschool.runescape.wiki/images/Warped_sceptre_detail.png",
        alt: "Warped Sceptre",
        apiCheck: {
          type: "collection-any-group",
          groups: [
            ["Warped sceptre (uncharged)"],
            [
              "Trident of the seas (full)",
              "Sanguinesti staff (uncharged)",
              "Tumeken's shadow (uncharged)",
              "Eye of Ayak",
            ],
          ],
          required: 1,
        },
      },
      {
        name: "Zombie Axe",
        img: "https://oldschool.runescape.wiki/images/Zombie_axe_detail.png",
        alt: "Zombie Axe",
        apiCheck: {
          type: "collection-any-of",
          primary: { type: "collection-item", names: ["Broken zombie axe"] },
          alternatives: [
            {
              type: "collection-item",
              names: [
                "Sarachnis cudgel",
                "Zamorakian spear",
                "Inquisitor's mace",
              ],
            },
            {
              type: "collection-count",
              names: ["Bludgeon axon", "Bludgeon claw", "Bludgeon spine"],
              required: 3,
            },
          ],
        },
      },
    ],
  },
  {
    name: "Emerald",
    color: "#21c04b",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Emerald.png",
    items: [
      {
        name: "Medium CA Completed",
        img: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_2_detail.png",
        alt: "Ghommal's Hilt 2",
        apiCheck: { type: "combat-achievement", tier: "Medium" },
      },
      {
        name: "Quest Point Cape",
        img: "https://oldschool.runescape.wiki/images/Quest_point_cape_detail.png",
        alt: "Quest Point Cape",
        apiCheck: { type: "quest-cape" },
      },
      {
        name: "Ava's Assembler",
        img: "https://oldschool.runescape.wiki/images/Ava%27s_assembler_detail.png",
        alt: "Ava's Assembler",
        apiCheck: { type: "collection-item", names: ["Vorkath's head"] },
      },
      {
        name: "Trident of the Seas",
        img: "https://oldschool.runescape.wiki/images/Trident_of_the_seas_detail.png",
        alt: "Trident",
        apiCheck: {
          type: "collection-item",
          names: ["Uncharged trident", "Trident of the seas (full)"],
        },
      },
      {
        name: "Abyssal Whip",
        img: "https://oldschool.runescape.wiki/images/Abyssal_whip_detail.png",
        alt: "Abyssal Whip",
        apiCheck: {
          type: "collection-any-of",
          primary: { type: "collection-item", names: ["Abyssal whip"] },
          alternatives: [
            {
              type: "collection-quantity",
              name: "Enhanced crystal weapon seed",
              required: 2,
            },
            { type: "collection-item", names: ["Scythe of vitur (uncharged)"] },
            {
              type: "collection-count",
              names: [
                "Leviathan's lure",
                "Siren's staff",
                "Executioner's axe head",
                "Eye of the duke",
              ],
              required: 4,
            },
            {
              type: "collection-count",
              names: ["Noxious point", "Noxious blade", "Noxious pommel"],
              required: 3,
            },
          ],
        },
      },
      {
        name: "2/2 Royal Titan Prayers",
        img: "https://oldschool.runescape.wiki/images/Deadeye_prayer_scroll_detail.png",
        alt: "Royal Titans Prayers",
        apiCheck: {
          type: "collection-any-group",
          groups: [
            ["Deadeye prayer scroll", "Mystic vigour prayer scroll"],
            ["Arcane prayer scroll", "Dexterous prayer scroll"],
          ],
          required: 2,
        },
      },
      {
        name: "2/3 Moons Set w/ Weapon",
        img: "https://oldschool.runescape.wiki/images/Eclipse_moon_helm_detail.png",
        alt: "Moons Set",
        apiCheck: {
          type: "collection-full-groups",
          groups: [
            [
              "Eclipse moon helm",
              "Eclipse moon chestplate",
              "Eclipse moon tassets",
              "Eclipse atlatl",
            ],
            [
              "Blue moon helm",
              "Blue moon chestplate",
              "Blue moon tassets",
              "Blue moon spear",
            ],
            [
              "Blood moon helm",
              "Blood moon chestplate",
              "Blood moon tassets",
              "Dual macuahuitl",
            ],
          ],
          required: 2,
        },
      },
    ],
  },
  {
    name: "Ruby",
    color: "#e03a3a",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Ruby.png",
    items: [
      {
        name: "Hard CA Completed",
        img: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_3_detail.png",
        alt: "Ghommal's Hilt 3",
        apiCheck: { type: "combat-achievement", tier: "Hard" },
      },
      {
        name: "Amulet of Fury",
        img: "https://oldschool.runescape.wiki/images/Amulet_of_fury_detail.png",
        alt: "Amulet of Fury",
        apiCheck: { type: "skill-level", skill: "Crafting", required: 85 },
      },
      {
        name: "Bandos Godsword",
        img: "https://oldschool.runescape.wiki/images/Bandos_godsword_detail.png",
        alt: "Bandos Godsword",
        apiCheck: { type: "collection-item", names: ["Bandos hilt"] },
      },
      {
        name: "Dragon Warhammer",
        img: "https://oldschool.runescape.wiki/images/Dragon_warhammer_detail.png",
        alt: "Dragon Warhammer",
        apiCheck: { type: "collection-item", names: ["Dragon warhammer"] },
      },
      {
        name: "2/3 Cerberus Crystals",
        img: "https://oldschool.runescape.wiki/images/Primordial_crystal_detail.png",
        alt: "Cerberus Crystal",
        apiCheck: {
          type: "collection-count",
          names: ["Primordial crystal", "Pegasian crystal", "Eternal crystal"],
          required: 2,
        },
      },
      {
        name: "2/4 Zenyte Shards",
        img: "https://oldschool.runescape.wiki/images/Zenyte_shard_detail.png",
        alt: "Zenyte Shards",
        apiCheck: {
          type: "collection-quantity",
          name: "Zenyte shard",
          required: 2,
        },
      },
      {
        name: "1/2 Tormented Synapses",
        img: "https://oldschool.runescape.wiki/images/Tormented_synapse_detail.png",
        alt: "Tormented Synapse",
        apiCheck: {
          type: "collection-quantity",
          name: "Tormented synapse",
          required: 1,
        },
      },
    ],
  },
  {
    name: "Diamond",
    color: "#f5f5f5",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Diamond.png",
    items: [
      {
        name: "Occult Necklace",
        img: "https://oldschool.runescape.wiki/images/Occult_necklace_detail.png",
        alt: "Occult Necklace",
        apiCheck: { type: "collection-item", names: ["Occult necklace"] },
      },
      {
        name: "Voidwaker",
        img: "https://oldschool.runescape.wiki/images/Voidwaker_detail.png",
        alt: "Voidwaker",
        apiCheck: {
          type: "collection-count",
          names: ["Voidwaker blade", "Voidwaker gem", "Voidwaker hilt"],
          required: 3,
        },
      },
      {
        name: "Osmumten's Fang or Lightbearer",
        img: "https://oldschool.runescape.wiki/images/Osmumten%27s_fang_detail.png",
        alt: "Osmumten's Fang",
        apiCheck: {
          type: "collection-item",
          names: ["Osmumten's fang", "Lightbearer"],
        },
      },
      {
        name: "4/4 Zenyte Shards",
        img: "https://oldschool.runescape.wiki/images/Zenyte_shard_detail.png",
        alt: "Zenyte Shards",
        apiCheck: {
          type: "collection-quantity",
          name: "Zenyte shard",
          required: 4,
        },
      },
      {
        name: "2/2 Tormented Synapses",
        img: "https://oldschool.runescape.wiki/images/Tormented_synapse_detail.png",
        alt: "Tormented Synapse",
        apiCheck: {
          type: "collection-quantity",
          name: "Tormented synapse",
          required: 2,
        },
      },
      {
        name: "1/3 Doom Uniques",
        img: "https://oldschool.runescape.wiki/images/Avernic_treads_detail.png",
        alt: "Doom Unique",
        apiCheck: {
          type: "collection-item",
          names: [
            "Avernic treads",
            "Eye of ayak (uncharged)",
            "Mokhaiotl cloth",
          ],
        },
      },
    ],
  },
  {
    name: "Dragonstone",
    color: "#a259c6",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Dragonstone.png",
    items: [
      {
        name: "Elite CA Completed",
        img: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_4_detail.png",
        alt: "Ghommal's Hilt 4",
        apiCheck: { type: "combat-achievement", tier: "Elite" },
      },
      {
        name: "Achievement Diary Cape",
        img: "https://oldschool.runescape.wiki/images/Achievement_diary_cape_detail.png",
        alt: "Achievement Diary Cape",
        apiCheck: { type: "diary-cape" },
      },
      {
        name: "Any CoX Prayer Scroll",
        img: "https://oldschool.runescape.wiki/images/Arcane_prayer_scroll_detail.png",
        alt: "Augury or Rigour",
        apiCheck: {
          type: "collection-item",
          names: ["Arcane prayer scroll", "Dexterous prayer scroll"],
        },
      },
      {
        name: "Toxic Blowpipe",
        img: "https://oldschool.runescape.wiki/images/Toxic_blowpipe_detail.png",
        alt: "Toxic Blowpipe",
        apiCheck: { type: "collection-item", names: ["Tanzanite fang"] },
      },
      {
        name: "Amulet of Rancour",
        img: "https://oldschool.runescape.wiki/images/Amulet_of_rancour_detail.png",
        alt: "Amulet of Rancour",
        apiCheck: { type: "collection-item", names: ["Araxyte fang"] },
      },
      {
        name: "Ferocious Gloves",
        img: "https://oldschool.runescape.wiki/images/Ferocious_gloves_detail.png",
        alt: "Ferocious Gloves",
        apiCheck: { type: "collection-item", names: ["Hydra leather"] },
      },
      {
        name: "Noxious Halberd",
        img: "https://oldschool.runescape.wiki/images/Noxious_halberd_detail.png",
        alt: "Noxious Halberd",
        apiCheck: {
          type: "collection-count",
          names: ["Noxious point", "Noxious blade", "Noxious pommel"],
          required: 3,
        },
      },
      {
        name: "2/3 Doom Uniques",
        img: "https://oldschool.runescape.wiki/images/Avernic_treads_detail.png",
        alt: "Doom Unique",
        apiCheck: {
          type: "collection-count",
          names: [
            "Avernic treads",
            "Eye of ayak (uncharged)",
            "Mokhaiotl cloth",
          ],
          required: 2,
        },
      },
    ],
  },
  {
    name: "Onyx",
    color: "#2e2929",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Onyx.png",
    items: [
      {
        name: "Infernal Cape",
        img: "https://oldschool.runescape.wiki/images/Infernal_cape_detail.png",
        alt: "Infernal Cape",
        apiCheck: { type: "collection-item", names: ["Infernal cape"] },
      },
      {
        name: "Avernic Defender",
        img: "https://oldschool.runescape.wiki/images/Avernic_defender_detail.png",
        alt: "Avernic Defender",
        apiCheck: { type: "collection-item", names: ["Avernic defender hilt"] },
      },
      {
        name: "Dizana's Quiver",
        img: "https://oldschool.runescape.wiki/images/Dizana%27s_quiver_detail.png",
        alt: "Dizana's Quiver",
        apiCheck: {
          type: "collection-item",
          names: ["Dizana's quiver (uncharged)"],
        },
      },
      {
        name: "Dragon Hunter Lance",
        img: "https://oldschool.runescape.wiki/images/Dragon_hunter_lance_detail.png",
        alt: "Dragon Hunter Lance",
        // Requires Hydra's claw (KBD loot key) + Zamorakian spear (CG proxy)
        apiCheck: {
          type: "collection-count",
          names: ["Hydra's claw", "Zamorakian spear"],
          required: 2,
        },
      },
      {
        name: "2/3 Masori",
        img: "https://oldschool.runescape.wiki/images/Masori_body_detail.png",
        alt: "Masori",
        apiCheck: {
          type: "collection-count",
          names: ["Masori mask", "Masori body", "Masori chaps"],
          required: 2,
        },
      },
      {
        name: "2/3 Oathplate or Torva",
        img: "https://oldschool.runescape.wiki/images/Oathplate_chest_detail.png?",
        alt: "2/3 Oathplate or Torva",
        apiCheck: {
          type: "collection-count",
          names: [
            "Oathplate helm",
            "Oathplate chest",
            "Oathplate legs",
            "Torva full helm (damaged)",
            "Torva platebody (damaged)",
            "Torva platelegs (damaged)",
          ],
          required: 2,
        },
      },
      {
        name: "1/4 DT2 Rings",
        img: "https://oldschool.runescape.wiki/images/Ultor_ring_detail.png",
        alt: "1/4 DT2 Rings",
        apiCheck: {
          type: "collection-item",
          names: [
            "Ultor vestige",
            "Venator vestige",
            "Bellator vestige",
            "Magus vestige",
          ],
        },
      },
      {
        name: "3/3 Doom Uniques",
        img: "https://oldschool.runescape.wiki/images/Avernic_treads_detail.png",
        alt: "Doom Unique",
        apiCheck: {
          type: "collection-count",
          names: [
            "Avernic treads",
            "Eye of ayak (uncharged)",
            "Mokhaiotl cloth",
          ],
          required: 3,
        },
      },
    ],
  },
  {
    name: "Zenyte",
    color: "#ff9900",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Zenyte.png",
    items: [
      {
        name: "Master CA Completed",
        img: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_5_detail.png",
        alt: "Ghommal's Hilt 5",
        apiCheck: { type: "combat-achievement", tier: "Master" },
      },
      {
        name: "Avernic Treads (Max)",
        img: "https://oldschool.runescape.wiki/images/Avernic_treads_%28max%29_detail.png",
        alt: "Avernic Treads",
        apiCheck: {
          type: "collection-count",
          names: [
            "Infinity boots",
            "Ranger boots",
            "Dragon boots",
            "Primordial crystal",
            "Pegasian crystal",
            "Eternal crystal",
          ],
          required: 6,
        },
      },
      {
        name: "Zaryte Vambraces",
        img: "https://oldschool.runescape.wiki/images/Zaryte_vambraces_detail.png",
        alt: "Zaryte Vambraces",
        apiCheck: { type: "collection-item", names: ["Zaryte vambraces"] },
      },
      {
        name: "Blessed Dizana's Quiver",
        img: "https://oldschool.runescape.wiki/images/Blessed_dizana%27s_quiver_detail.png",
        alt: "Blessed Dizana's Quiver",
      },
      {
        name: "TOA 500 Fang Kit",
        img: "https://oldschool.runescape.wiki/images/Osmumten%27s_fang_%28or%29_detail.png",
        alt: "TOA 500 Fang Kit",
        apiCheck: { type: "collection-item", names: ["Cursed phalanx"] },
      },
      {
        name: "Full Oathplate or Torva",
        img: "https://oldschool.runescape.wiki/images/Oathplate_chest_detail.png?",
        alt: "Full Oathplate or Torva",
        apiCheck: {
          type: "collection-count",
          names: [
            "Oathplate helm",
            "Oathplate chest",
            "Oathplate legs",
            "Torva full helm (damaged)",
            "Torva platebody (damaged)",
            "Torva platelegs (damaged)",
          ],
          required: 3,
        },
      },
      {
        name: "Blood Torva",
        img: "https://oldschool.runescape.wiki/images/Sanguine_torva_platebody_detail.png",
        alt: "Blood Torva",
        apiCheck: {
          type: "combat-achievement-task",
          names: [
            "Vardorvis Sleeper",
            "Duke Sucellus Sleeper",
            "Leviathan Sleeper",
            "Whispered",
          ],
        },
      },
      {
        name: "2/4 DT2 Rings",
        img: "https://oldschool.runescape.wiki/images/Ultor_ring_detail.png",
        alt: "Ultor Ring",
        apiCheck: {
          type: "collection-count",
          names: [
            "Ultor vestige",
            "Venator vestige",
            "Bellator vestige",
            "Magus vestige",
          ],
          required: 2,
        },
      },
      {
        name: "2/3 Virtus or Ancestral",
        img: "https://oldschool.runescape.wiki/images/Virtus_robe_top_detail.png",
        alt: "Virtus",
        apiCheck: {
          type: "collection-count",
          names: [
            "Virtus mask",
            "Virtus robe top",
            "Virtus robe bottom",
            "Ancestral hat",
            "Ancestral robe top",
            "Ancestral robe bottom",
          ],
          required: 2,
        },
      },
      {
        name: "1/3 Megarares",
        img: "https://oldschool.runescape.wiki/images/Twisted_bow_detail.png",
        alt: "Megarares",
        apiCheck: {
          type: "collection-item",
          names: [
            "Twisted bow",
            "Tumeken's shadow (uncharged)",
            "Scythe of vitur (uncharged)",
          ],
        },
      },
    ],
  },
  {
    name: "Infernal",
    color: "#ff6622",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_TzKal.png",
    items: [
      {
        name: "2376 Total Level",
        img: "https://oldschool.runescape.wiki/images/Stats_icon.png",
        alt: "Total Level",
        apiCheck: { type: "total-level", required: 2376 },
      },
      {
        name: "Grandmaster CA Completed",
        img: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_6_detail.png",
        alt: "Ghommal's Hilt 6",
        apiCheck: { type: "combat-achievement", tier: "Grandmaster" },
      },
      {
        name: "Zaryte Crossbow",
        img: "https://oldschool.runescape.wiki/images/Zaryte_crossbow_detail.png",
        alt: "Zaryte Crossbow",
        apiCheck: { type: "collection-item", names: ["Nihil horn"] },
      },
      {
        name: "Saturated Heart",
        img: "https://oldschool.runescape.wiki/images/Saturated_heart_detail.png",
        alt: "Saturated Heart",
        // not tracked in collection log
      },
      {
        name: "Full Masori (F)",
        img: "https://oldschool.runescape.wiki/images/Masori_body_%28f%29_detail.png",
        alt: "Full Masori (F)",
        // not tracked in collection log
      },
      {
        name: "Full Ancestral",
        img: "https://oldschool.runescape.wiki/images/Ancestral_robe_top_detail.png",
        alt: "Full Ancestral",
        apiCheck: {
          type: "collection-count",
          names: [
            "Ancestral hat",
            "Ancestral robe top",
            "Ancestral robe bottom",
          ],
          required: 3,
        },
      },
      {
        name: "Full Torva",
        img: "https://oldschool.runescape.wiki/images/Torva_platebody_detail.png",
        alt: "Full Torva",
        apiCheck: {
          type: "collection-count",
          names: [
            "Torva full helm (damaged)",
            "Torva platebody (damaged)",
            "Torva platelegs (damaged)",
          ],
          required: 3,
        },
      },
      {
        name: "Radiant Oathplate",
        img: "https://oldschool.runescape.wiki/images/Radiant_oathplate_chest_detail.png",
        alt: "Radiant Oathplate",
        // not tracked in collection log
      },
      {
        name: "Completed Spirit Shield",
        img: "https://oldschool.runescape.wiki/images/Elysian_spirit_shield_detail.png",
        alt: "Spirit Shield",
        apiCheck: {
          type: "collection-all-plus-any",
          all: ["Spirit shield", "Holy elixir"],
          any: ["Elysian sigil", "Spectral sigil", "Arcane sigil"],
        },
      },
      {
        name: "4/4 DT2 Rings",
        img: "https://oldschool.runescape.wiki/images/Ultor_ring_detail.png",
        alt: "Ultor Ring",
        apiCheck: {
          type: "collection-count",
          names: [
            "Ultor vestige",
            "Venator vestige",
            "Bellator vestige",
            "Magus vestige",
          ],
          required: 4,
        },
      },
      {
        name: "3/3 Megarares",
        img: "https://oldschool.runescape.wiki/images/Twisted_bow_detail.png",
        alt: "Twisted Bow",
        apiCheck: {
          type: "collection-count",
          names: [
            "Twisted bow",
            "Tumeken's shadow (uncharged)",
            "Scythe of vitur (uncharged)",
          ],
          required: 3,
        },
      },
    ],
  },
];

export default ranks;
