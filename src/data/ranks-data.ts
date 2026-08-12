import type { Rank } from "../types/rank";

const ranks: Rank[] = [
  {
    name: "Sapphire",
    color: "#2a62e5",
    textColor: "#5b8fef",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Sapphire.png",
    items: [
      {
        name: "Easy combat achievements",
        img: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_1_detail.png",
        alt: "Easy combat achievements",
        apiCheck: { type: "combat-achievement", tier: "Easy" },
      },
      {
        name: "Fire cape",
        img: "https://oldschool.runescape.wiki/images/Fire_cape_detail.png",
        alt: "Fire cape",
        apiCheck: { type: "collection-item", names: ["Fire cape"] },
      },
      {
        name: "Imbued god cape",
        img: "https://oldschool.runescape.wiki/images/Imbued_zamorak_cape_detail.png",
        alt: "Imbued god cape",
        apiCheck: { type: "quest", name: "Mage Arena II" },
      },
      {
        name: "Berserker ring",
        img: "https://oldschool.runescape.wiki/images/Berserker_ring_detail.png",
        alt: "Berserker ring",
        apiCheck: { type: "collection-item", names: ["Berserker ring"] },
      },
      {
        name: "Dragon defender",
        img: "https://oldschool.runescape.wiki/images/Dragon_defender_detail.png",
        alt: "Dragon defender",
        apiCheck: { type: "collection-item", names: ["Dragon defender"] },
      },
      {
        name: "Warped sceptre",
        img: "https://oldschool.runescape.wiki/images/Warped_sceptre_detail.png",
        alt: "Warped sceptre",
        apiCheck: {
          type: "collection-any-of",
          primary: {
            type: "collection-item",
            names: ["Warped sceptre (uncharged)"],
          },
          alternatives: [
            { type: "collection-item", names: ["Uncharged trident"] },
            { type: "collection-item", names: ["Trident of the seas (full)"] },
            { type: "collection-item", names: ["Eye of Ayak"] },
            {
              type: "collection-item",
              names: ["Sanguinesti staff (uncharged)"],
            },
            {
              type: "collection-item",
              names: ["Tumeken's shadow (uncharged)"],
            },
          ],
        },
      },
      {
        name: "Zombie axe",
        img: "https://oldschool.runescape.wiki/images/Zombie_axe_detail.png",
        alt: "Zombie axe",
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
      {
        name: "Barrows gloves",
        img: "https://oldschool.runescape.wiki/images/Barrows_gloves_detail.png",
        alt: "Barrows gloves",
        apiCheck: { type: "quest", name: "Recipe for disaster" },
      },
    ],
  },
  {
    name: "Emerald",
    color: "#21c04b",
    textColor: "#3fd268",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Emerald.png",
    items: [
      {
        name: "Medium combat achievements",
        img: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_2_detail.png",
        alt: "Medium combat achievements",
        apiCheck: { type: "combat-achievement", tier: "Medium" },
      },
      {
        name: "Quest point cape",
        img: "https://oldschool.runescape.wiki/images/Quest_point_cape_detail.png",
        alt: "Quest point cape",
        apiCheck: { type: "quest-cape" },
      },
      {
        name: "Ava's assembler",
        img: "https://oldschool.runescape.wiki/images/Ava%27s_assembler_detail.png",
        alt: "Ava's assembler",
        apiCheck: { type: "collection-item", names: ["Vorkath's head"] },
      },
      {
        name: "Trident of the seas",
        img: "https://oldschool.runescape.wiki/images/Trident_of_the_seas_detail.png",
        alt: "Trident of the seas",
        apiCheck: {
          type: "collection-any-of",
          primary: {
            type: "collection-item",
            names: ["Uncharged trident", "Trident of the seas (full)"],
          },
          alternatives: [
            {
              type: "collection-item",
              names: ["Sanguinesti staff (uncharged)"],
            },
            { type: "collection-item", names: ["Eye of ayak (uncharged)"] },
            {
              type: "collection-item",
              names: ["Tumeken's shadow (uncharged)"],
            },
          ],
        },
      },
      {
        name: "Abyssal whip",
        img: "https://oldschool.runescape.wiki/images/Abyssal_whip_detail.png",
        alt: "Abyssal whip",
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
        name: "2/2 Titan prayer scrolls",
        img: "https://oldschool.runescape.wiki/images/Deadeye_prayer_scroll_detail.png",
        alt: "2/2 Titan prayer scrolls",
        multiItem: true,
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
        name: "Blood moon armour",
        img: "https://oldschool.runescape.wiki/images/Blood_moon_helm_detail.png",
        alt: "Blood moon armour",
        apiCheck: {
          type: "collection-all-checks",
          checks: [
            {
              type: "collection-any-of",
              primary: { type: "collection-item", names: ["Blood moon helm"] },
              alternatives: [
                { type: "collection-item", names: ["Helm of neitiznot"] },
                { type: "quest", name: "The Fremennik Isles" },
                { type: "collection-item", names: ["Oathplate helm"] },
                {
                  type: "collection-item",
                  names: ["Torva full helm (damaged)"],
                },
              ],
            },
            {
              type: "collection-any-of",
              primary: {
                type: "collection-item",
                names: ["Blood moon chestplate"],
              },
              alternatives: [
                { type: "collection-item", names: ["Fighter torso"] },
                { type: "collection-item", names: ["Bandos chestplate"] },
                { type: "collection-item", names: ["Oathplate chest"] },
                {
                  type: "collection-item",
                  names: ["Torva platebody (damaged)"],
                },
              ],
            },
            {
              type: "collection-any-of",
              primary: {
                type: "collection-item",
                names: ["Blood moon tassets"],
              },
              alternatives: [
                { type: "collection-item", names: ["Bandos tassets"] },
                { type: "collection-item", names: ["Oathplate legs"] },
                {
                  type: "collection-item",
                  names: ["Torva platelegs (damaged)"],
                },
              ],
            },
            {
              type: "collection-any-of",
              primary: {
                type: "collection-item",
                names: ["Dual macuahuitl"],
              },
              alternatives: [
                {
                  type: "collection-item",
                  names: [
                    "Broken zombie axe",
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
          ],
        },
      },
      {
        name: "Blue moon armour",
        img: "https://oldschool.runescape.wiki/images/Blue_moon_helm_detail.png",
        alt: "Blue moon armour",
        apiCheck: {
          type: "collection-all-checks",
          checks: [
            {
              type: "collection-any-of",
              primary: { type: "collection-item", names: ["Blue moon helm"] },
              alternatives: [
                { type: "collection-item", names: ["Ahrim's hood"] },
                { type: "collection-item", names: ["Virtus mask"] },
                { type: "collection-item", names: ["Ancestral hat"] },
              ],
            },
            {
              type: "collection-any-of",
              primary: {
                type: "collection-item",
                names: ["Blue moon chestplate"],
              },
              alternatives: [
                { type: "collection-item", names: ["Ahrim's robetop"] },
                { type: "collection-item", names: ["Virtus robe top"] },
                { type: "collection-item", names: ["Ancestral robe top"] },
              ],
            },
            {
              type: "collection-any-of",
              primary: {
                type: "collection-item",
                names: ["Blue moon tassets"],
              },
              alternatives: [
                { type: "collection-item", names: ["Ahrim's robeskirt"] },
                { type: "collection-item", names: ["Virtus robe bottom"] },
                { type: "collection-item", names: ["Ancestral robe bottom"] },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    name: "Ruby",
    color: "#e03a3a",
    textColor: "#ec5f5f",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Ruby.png",
    items: [
      {
        name: "Hard combat achievements",
        img: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_3_detail.png",
        alt: "Hard combat achievements",
        apiCheck: { type: "combat-achievement", tier: "Hard" },
      },
      {
        name: "Amulet of fury",
        img: "https://oldschool.runescape.wiki/images/Amulet_of_fury_detail.png",
        alt: "Amulet of fury",
        apiCheck: { type: "skill-level", skill: "Crafting", required: 85 },
      },
      {
        name: "Bandos godsword",
        img: "https://oldschool.runescape.wiki/images/Bandos_godsword_detail.png",
        alt: "Bandos godsword",
        apiCheck: {
          type: "collection-count",
          names: [
            "Bandos hilt",
            "Godsword shard 1",
            "Godsword shard 2",
            "Godsword shard 3",
          ],
          required: 4,
        },
      },
      {
        name: "Dragon warhammer",
        img: "https://oldschool.runescape.wiki/images/Dragon_warhammer_detail.png",
        alt: "Dragon warhammer",
        apiCheck: {
          type: "collection-any-of",
          primary: { type: "collection-item", names: ["Dragon warhammer"] },
          alternatives: [{ type: "collection-item", names: ["Elder maul"] }],
        },
      },
      {
        name: "2/3 Cerberus crystals",
        img: "https://oldschool.runescape.wiki/images/Primordial_crystal_detail.png",
        alt: "2/3 Cerberus crystals",
        multiItem: true,
        apiCheck: {
          type: "collection-count",
          names: ["Primordial crystal", "Pegasian crystal", "Eternal crystal"],
          required: 2,
        },
      },
      {
        name: "2/4 Zenyte shards",
        img: "https://oldschool.runescape.wiki/images/Zenyte_shard_detail.png",
        alt: "2/4 Zenyte shards",
        multiItem: true,
        apiCheck: {
          type: "collection-quantity",
          name: "Zenyte shard",
          required: 2,
          displayTotal: 4,
        },
      },
      {
        name: "1/2 Tormented synapses",
        img: "https://oldschool.runescape.wiki/images/Tormented_synapse_detail.png",
        alt: "1/2 Tormented synapses",
        multiItem: true,
        apiCheck: {
          type: "collection-quantity",
          name: "Tormented synapse",
          required: 1,
          displayTotal: 2,
        },
      },
      {
        name: "Thread of elidinis",
        img: "https://oldschool.runescape.wiki/images/Thread_of_elidinis_detail.png",
        alt: "Thread of elidinis",
        apiCheck: {
          type: "collection-item",
          names: ["Thread of elidinis"],
        },
      },
    ],
  },
  {
    name: "Diamond",
    color: "#f5f5f5",
    textColor: "#e8e8f0",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Diamond.png",
    items: [
      {
        name: "Occult necklace",
        img: "https://oldschool.runescape.wiki/images/Occult_necklace_detail.png",
        alt: "Occult necklace",
        apiCheck: { type: "collection-item", names: ["Occult necklace"] },
      },
      {
        name: "Osmumten's fang or Lightbearer",
        img: "https://oldschool.runescape.wiki/images/Osmumten%27s_fang_detail.png",
        alt: "Osmumten's fang or Lightbearer",
        apiCheck: {
          type: "collection-item",
          names: ["Osmumten's fang", "Lightbearer"],
        },
      },
      {
        name: "4/4 Zenyte shards",
        img: "https://oldschool.runescape.wiki/images/Zenyte_shard_detail.png",
        alt: "4/4 Zenyte shards",
        multiItem: true,
        apiCheck: {
          type: "collection-quantity",
          name: "Zenyte shard",
          required: 4,
        },
      },
      {
        name: "2/2 Tormented synapses",
        img: "https://oldschool.runescape.wiki/images/Tormented_synapse_detail.png",
        alt: "2/2 Tormented synapses",
        multiItem: true,
        apiCheck: {
          type: "collection-quantity",
          name: "Tormented synapse",
          required: 2,
        },
      },
      {
        name: "1/3 Doom uniques",
        img: "https://oldschool.runescape.wiki/images/Avernic_treads_detail.png",
        alt: "1/3 Doom uniques",
        multiItem: true,
        apiCheck: {
          type: "collection-item",
          names: [
            "Avernic treads",
            "Eye of ayak (uncharged)",
            "Mokhaiotl cloth",
          ],
        },
      },
      {
        name: "Masori crafting kit",
        img: "https://oldschool.runescape.wiki/images/Masori_crafting_kit_detail.png",
        alt: "Masori crafting kit",
        apiCheck: {
          type: "collection-item",
          names: ["Masori crafting kit"],
        },
      },
      {
        name: "Toxic blowpipe",
        img: "https://oldschool.runescape.wiki/images/Toxic_blowpipe_detail.png",
        alt: "Toxic blowpipe",
        apiCheck: { type: "collection-item", names: ["Tanzanite fang"] },
      },
    ],
  },
  {
    name: "Dragonstone",
    color: "#a259c6",
    textColor: "#c088e0",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Dragonstone.png",
    items: [
      {
        name: "Elite combat achievements",
        img: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_4_detail.png",
        alt: "Elite combat achievements",
        apiCheck: { type: "combat-achievement", tier: "Elite" },
      },
      {
        name: "Achievement diary cape",
        img: "https://oldschool.runescape.wiki/images/Achievement_diary_cape_detail.png",
        alt: "Achievement diary cape",
        apiCheck: { type: "diary-cape" },
      },
      {
        name: "1/2 CoX prayer scrolls",
        img: "https://oldschool.runescape.wiki/images/Arcane_prayer_scroll_detail.png",
        alt: "1/2 CoX prayer scrolls",
        apiCheck: {
          type: "collection-item",
          names: ["Arcane prayer scroll", "Dexterous prayer scroll"],
        },
      },
      {
        name: "Amulet of rancour",
        img: "https://oldschool.runescape.wiki/images/Amulet_of_rancour_detail.png",
        alt: "Amulet of rancour",
        apiCheck: { type: "collection-item", names: ["Araxyte fang"] },
      },
      {
        name: "Ferocious gloves",
        img: "https://oldschool.runescape.wiki/images/Ferocious_gloves_detail.png",
        alt: "Ferocious gloves",
        apiCheck: { type: "collection-item", names: ["Hydra leather"] },
      },
      {
        name: "Noxious halberd",
        img: "https://oldschool.runescape.wiki/images/Noxious_halberd_detail.png",
        alt: "Noxious halberd",
        apiCheck: {
          type: "collection-any-of",
          primary: {
            type: "collection-count",
            names: ["Noxious point", "Noxious blade", "Noxious pommel"],
            required: 3,
          },
          alternatives: [
            {
              type: "collection-quantity",
              name: "Enhanced crystal weapon seed",
              required: 2,
            },
            {
              type: "collection-item",
              names: ["Scythe of vitur (uncharged)"],
            },
          ],
        },
      },
      {
        name: "2/3 Doom uniques",
        img: "https://oldschool.runescape.wiki/images/Avernic_treads_detail.png",
        alt: "2/3 Doom uniques",
        multiItem: true,
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
        name: "Necklace of rupture",
        img: "https://oldschool.runescape.wiki/images/Necklace_of_rupture_detail.png",
        alt: "Necklace of rupture",
        apiCheck: {
          type: "collection-item",
          names: ["Elder venator fang"],
        },
      },
    ],
  },
  {
    name: "Onyx",
    color: "#2e2929",
    textColor: "#c9c9c9",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Onyx.png",
    items: [
      {
        name: "Infernal cape",
        img: "https://oldschool.runescape.wiki/images/Infernal_cape_detail.png",
        alt: "Infernal cape",
        apiCheck: { type: "collection-item", names: ["Infernal cape"] },
      },
      {
        name: "Avernic defender",
        img: "https://oldschool.runescape.wiki/images/Avernic_defender_detail.png",
        alt: "Avernic defender",
        apiCheck: { type: "collection-item", names: ["Avernic defender hilt"] },
      },
      {
        name: "Dizana's quiver",
        img: "https://oldschool.runescape.wiki/images/Dizana%27s_quiver_detail.png",
        alt: "Dizana's quiver",
        apiCheck: {
          type: "collection-item",
          names: ["Dizana's quiver (uncharged)"],
        },
      },
      {
        name: "Dragon hunter lance",
        img: "https://oldschool.runescape.wiki/images/Dragon_hunter_lance_detail.png",
        alt: "Dragon hunter lance",
        apiCheck: {
          type: "collection-count",
          names: ["Hydra's claw", "Zamorakian spear"],
          required: 2,
        },
      },
      {
        name: "2/3 Masori armour",
        img: "https://oldschool.runescape.wiki/images/Masori_mask_detail.png",
        alt: "2/3 Masori armour",
        multiItem: true,
        apiCheck: {
          type: "collection-count",
          names: ["Masori mask", "Masori body", "Masori chaps"],
          required: 2,
        },
      },
      {
        name: "2/3 Oathplate armour",
        img: "https://oldschool.runescape.wiki/images/Oathplate_helm_detail.png",
        alt: "2/3 Oathplate armour",
        multiItem: true,
        apiCheck: {
          type: "collection-piece-types",
          pieceGroups: [
            ["Oathplate helm", "Torva full helm (damaged)"],
            ["Oathplate chest", "Torva platebody (damaged)"],
            ["Oathplate legs", "Torva platelegs (damaged)"],
          ],
          required: 2,
        },
      },
      {
        name: "1/4 DT2 rings",
        img: "https://oldschool.runescape.wiki/images/Ultor_ring_detail.png",
        alt: "1/4 DT2 rings",
        multiItem: true,
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
        name: "3/3 Doom uniques",
        img: "https://oldschool.runescape.wiki/images/Avernic_treads_detail.png",
        alt: "3/3 Doom uniques",
        multiItem: true,
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
      {
        name: "2/3 Virtus robes",
        img: "https://oldschool.runescape.wiki/images/Virtus_mask_detail.png",
        alt: "2/3 Virtus robes",
        multiItem: true,
        apiCheck: {
          type: "collection-piece-types",
          pieceGroups: [
            ["Virtus mask", "Ancestral hat"],
            ["Virtus robe top", "Ancestral robe top"],
            ["Virtus robe bottom", "Ancestral robe bottom"],
          ],
          required: 2,
        },
      },
    ],
  },
  {
    name: "Zenyte",
    color: "#ff9900",
    textColor: "#ffb340",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_Zenyte.png",
    items: [
      {
        name: "Master combat achievements",
        img: "https://oldschool.runescape.wiki/images/Ghommal%27s_hilt_5_detail.png",
        alt: "Master combat achievements",
        apiCheck: { type: "combat-achievement", tier: "Master" },
      },
      {
        name: "Avernic treads (max)",
        img: "https://oldschool.runescape.wiki/images/Avernic_treads_%28max%29_detail.png",
        alt: "Avernic treads (max)",
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
        name: "Zaryte vambraces",
        img: "https://oldschool.runescape.wiki/images/Zaryte_vambraces_detail.png",
        alt: "Zaryte vambraces",
        apiCheck: { type: "collection-item", names: ["Zaryte vambraces"] },
      },
      {
        name: "Blessed dizana's quiver",
        img: "https://oldschool.runescape.wiki/images/Blessed_dizana%27s_quiver_detail.png",
        alt: "Blessed dizana's quiver",
      },
      {
        name: "Cursed phalanx",
        img: "https://oldschool.runescape.wiki/images/Cursed_phalanx_detail.png",
        alt: "Cursed phalanx",
        apiCheck: { type: "collection-item", names: ["Cursed phalanx"] },
      },
      {
        name: "3/3 Oathplate armour",
        img: "https://oldschool.runescape.wiki/images/Oathplate_helm_detail.png",
        alt: "3/3 Oathplate armour",
        multiItem: true,
        apiCheck: {
          type: "collection-piece-types",
          pieceGroups: [
            ["Oathplate helm", "Torva full helm (damaged)"],
            ["Oathplate chest", "Torva platebody (damaged)"],
            ["Oathplate legs", "Torva platelegs (damaged)"],
          ],
          required: 3,
        },
      },
      {
        name: "1/2 Blorva or Radiant",
        img: "/clan-emblem.png",
        alt: "1/2 Blorva or Radiant",
        multiItem: true,
        apiCheck: {
          type: "collection-item",
          names: ["Ancient blood ornament kit", "Radiant oathplate armour"],
        },
      },
      {
        name: "2/4 DT2 rings",
        img: "https://oldschool.runescape.wiki/images/Ultor_ring_detail.png",
        alt: "2/4 DT2 rings",
        multiItem: true,
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
        name: "3/3 Virtus robes",
        img: "https://oldschool.runescape.wiki/images/Virtus_mask_detail.png",
        alt: "3/3 Virtus robes",
        multiItem: true,
        apiCheck: {
          type: "collection-piece-types",
          pieceGroups: [
            ["Virtus mask", "Ancestral hat"],
            ["Virtus robe top", "Ancestral robe top"],
            ["Virtus robe bottom", "Ancestral robe bottom"],
          ],
          required: 3,
        },
      },
      {
        name: "3/3 Masori armour (f)",
        img: "https://oldschool.runescape.wiki/images/Masori_mask_%28f%29_detail.png",
        alt: "3/3 Masori armour (f)",
        multiItem: true,
        apiCheck: { type: "collection-masori-f" },
      },
      {
        name: "1/3 Megarares",
        img: "https://oldschool.runescape.wiki/images/Twisted_bow_detail.png",
        alt: "1/3 Megarares",
        multiItem: true,
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
    textColor: "#ff8a5c",
    icon: "https://oldschool.runescape.wiki/images/Clan_icon_-_TzKal.png",
    items: [
      {
        name: "Grandmaster combat achievements",
        img: "https://oldschool.runescape.wiki/images/Tzkal_slayer_helmet_detail.png",
        alt: "Grandmaster combat achievements",
        apiCheck: { type: "combat-achievement", tier: "Grandmaster" },
      },
      {
        name: "Max cape",
        img: "https://oldschool.runescape.wiki/images/Max_cape_detail.png",
        alt: "Max cape",
        apiCheck: { type: "total-level", required: 2376 },
      },
      {
        name: "Zaryte crossbow",
        img: "https://oldschool.runescape.wiki/images/Zaryte_crossbow_detail.png",
        alt: "Zaryte crossbow",
        apiCheck: {
          type: "collection-count",
          names: ["Nihil horn", "Armadyl crossbow"],
          required: 2,
        },
      },
      {
        name: "Saturated heart",
        img: "https://oldschool.runescape.wiki/images/Saturated_heart_detail.png",
        alt: "Saturated heart",
      },
      {
        name: "3/3 Ancestral robes",
        img: "https://oldschool.runescape.wiki/images/Ancestral_hat_detail.png",
        alt: "3/3 Ancestral robes",
        multiItem: true,
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
        name: "3/3 Torva armour",
        img: "https://oldschool.runescape.wiki/images/Torva_full_helm_detail.png",
        alt: "3/3 Torva armour",
        multiItem: true,
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
        name: "2/2 Blorva and Radiant",
        img: "/clan-emblem.png",
        alt: "2/2 Blorva and Radiant",
        multiItem: true,
        apiCheck: {
          type: "collection-count",
          names: ["Ancient blood ornament kit", "Radiant oathplate armour"],
          required: 2,
        },
      },
      {
        name: "Completed spirit shield",
        img: "https://oldschool.runescape.wiki/images/Elysian_spirit_shield_detail.png",
        alt: "Completed spirit shield",
        apiCheck: {
          type: "collection-all-plus-any",
          all: ["Spirit shield", "Holy elixir"],
          any: ["Elysian sigil", "Spectral sigil", "Arcane sigil"],
        },
      },
      {
        name: "4/4 DT2 rings",
        img: "https://oldschool.runescape.wiki/images/Ultor_ring_detail.png",
        alt: "4/4 DT2 rings",
        multiItem: true,
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
        alt: "3/3 Megarares",
        multiItem: true,
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

// Maps a Wise Old Man group role (lowercased) to that rank's clan icon, so
// the Hiscores page can show a player's rank gem without a per-player
// RuneProfile lookup. WOM's role for the top rank is "tzkal" (matching the
// TzKal-Zuk-themed icon file), not "infernal", so it's aliased here.
export const rankIconByRole: Record<string, string> = {
  ...Object.fromEntries(ranks.map((r) => [r.name.toLowerCase(), r.icon])),
  tzkal: ranks.find((r) => r.name === "Infernal")!.icon,
};

// WOM group roles held by clan leadership/moderation. Their displayed rank
// badge comes straight from WOM itself (see getRankForRole's fallback in
// services/profile.ts) — this set exists only so the leaderboard's
// progress-crediting math (resolveMemberRankIndex in
// api/runeprofile-proxy.ts) can still treat them as having satisfied the
// whole achievement ladder, same as before that badge was WOM-driven.
export const STAFF_ROLES = new Set(["owner", "deputy_owner", "moderator"]);

export default ranks;
