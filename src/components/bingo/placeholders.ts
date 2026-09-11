import type {
  BoardData,
  BoardTile,
  ItemRequirementsStatus,
} from "../../services/board";
import type { AdminSubmission } from "../../services/admin";

// Dev-only fallback so the page has something to render under plain
// `npm run dev`, which has no backend at all. Never used in production —
// `fetchBoard`/`fetchAdminSubmissions` failures there surface as real errors.
const PLACEHOLDER_ICON =
  "https://oldschool.runescape.wiki/images/Twisted_bow_detail.png";
const PLACEHOLDER_STATUSES = [
  "approved",
  "approved",
  "pending",
  "none",
  "rejected",
] as const;
// One tile (position 4, "Tile 5") uses item_requirements — Corrupted
// Gauntlet's real "any one set" shape (an enhanced weapon seed on its own,
// OR 3 armour seeds) — so the icon-in-a-pill rendering (ItemRequirementsProgress)
// has something to show under plain `npm run dev`, which has no backend and
// therefore no real advanced tile to fetch. Real OSRS item ids, so the icons
// actually resolve against RuneLite's static icon CDN like the live version.
const ADVANCED_TILE_POSITION = 4;
// A few real OSRS item ids so every plain tile's new qualifying-items icon
// row (TileDetailPanel) has something real to resolve against RuneLite's
// icon CDN too, not just the one advanced tile above.
const SAMPLE_ITEM_IDS = [11785, 11787, 11824, 11826, 11828];
function placeholderItemRequirementsStatus(): ItemRequirementsStatus {
  return {
    complete: false,
    perItem: [
      {
        itemId: 25859,
        name: "Enhanced crystal weapon seed",
        requiredAmount: 1,
        currentAmount: 0,
        group: "enhanced",
      },
      {
        itemId: 23956,
        name: "Crystal armour seed",
        requiredAmount: 3,
        currentAmount: 1,
        group: "armour",
      },
    ],
  };
}

function placeholderTiles(teamId: number): BoardTile[] {
  return Array.from({ length: 25 }, (_, i) => {
    const status =
      PLACEHOLDER_STATUSES[(i + teamId) % PLACEHOLDER_STATUSES.length];
    const isAdvanced = i === ADVANCED_TILE_POSITION;
    return {
      tileId: i,
      position: i,
      name: isAdvanced ? "Corrupted Gauntlet" : `Tile ${i + 1}`,
      iconUrl: PLACEHOLDER_ICON,
      requiredCount: i % 5 === 0 ? 3 : 1,
      category: "ITEM DROP",
      description: isAdvanced
        ? "Receive an Enhanced Crystal Weapon Seed, or 3 Crystal Armour Seeds."
        : "Submit a screenshot once you've received this item.",
      approvedCount: status === "approved" ? 1 : 0,
      pendingCount: status === "pending" ? 1 : 0,
      rejectedCount: status === "rejected" ? 1 : 0,
      status,
      latestProofUrl: null,
      latestSubmittedBy: status === "none" ? null : "izJordy",
      goalKind: "item",
      goalKey: "",
      goalTarget: null,
      teamProgress: null,
      itemRequirementsStatus: isAdvanced
        ? placeholderItemRequirementsStatus()
        : null,
      itemIds: isAdvanced ? [25859, 23956] : SAMPLE_ITEM_IDS,
      proofs:
        status === "none"
          ? []
          : [
              {
                id: i,
                status:
                  status === "rejected"
                    ? "rejected"
                    : status === "pending"
                      ? "pending"
                      : "approved",
                proofUrl: PLACEHOLDER_ICON,
                submittedBy: "izJordy",
                submittedByAvatarUrl: null,
                createdAt: "2026-08-02T00:00:00.000Z",
              },
            ],
    };
  });
}
export const PLACEHOLDER_BOARD: BoardData = {
  config: {
    name: "Summer Blackout Bingo",
    size: 5,
  },
  teams: [
    {
      id: 1,
      name: "Crimson Fang",
      memberCount: 6,
      members: [
        "izJordy",
        "AtomicKilo",
        "BreauxChacho",
        "BHops",
        "Lamboat",
        "YoonA",
      ],
      captainId: 1,
      captainName: "izJordy",
      completeCount: 18,
      totalTiles: 25,
      pct: 72,
      accentColor: "#e8574a",
      isLeading: true,
      tiles: placeholderTiles(1),
    },
    {
      id: 2,
      name: "Onyx Talon",
      memberCount: 5,
      members: [
        "Indaco",
        "Treecio",
        "AnotherPlayer",
        "SomePlayer",
        "Solo Nostalg",
      ],
      captainId: null,
      captainName: null,
      completeCount: 9,
      totalTiles: 25,
      pct: 36,
      accentColor: "#c9c9c9",
      isLeading: false,
      tiles: placeholderTiles(2),
    },
    {
      id: 3,
      name: "Zenyte Vanguard",
      memberCount: 7,
      members: [
        "ABearCat",
        "Helesta",
        "Wafas",
        "Eskett",
        "Mevvz",
        "Player7",
        "Player8",
      ],
      captainId: null,
      captainName: null,
      completeCount: 14,
      totalTiles: 25,
      pct: 56,
      accentColor: "#ffb340",
      isLeading: false,
      tiles: placeholderTiles(3),
    },
  ],
  myTeamId: 1,
};
export const PLACEHOLDER_SUBMISSIONS: AdminSubmission[] = [
  {
    id: 1,
    status: "pending",
    proofUrl: null,
    teamId: 1,
    tileId: 1,
    teamName: "Crimson Fang",
    tileName: "Twisted Bow",
    iconUrl: PLACEHOLDER_ICON,
    requireUniqueItems: false,
    submittedBy: "SomePlayer",
    createdAt: "2026-08-02T00:00:00.000Z",
    itemId: null,
    alreadyApprovedItemIds: [],
    itemRequirementsStatus: null,
  },
  {
    id: 2,
    status: "pending",
    proofUrl: null,
    teamId: 2,
    tileId: 2,
    teamName: "Onyx Talon",
    tileName: "Scythe of Vitur",
    iconUrl: PLACEHOLDER_ICON,
    requireUniqueItems: false,
    submittedBy: "AnotherPlayer",
    createdAt: "2026-08-02T00:00:00.000Z",
    itemId: null,
    alreadyApprovedItemIds: [],
    itemRequirementsStatus: null,
  },
];
