import type { BoardData, BoardTile } from "../../services/board";
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
function placeholderTiles(teamId: number): BoardTile[] {
  return Array.from({ length: 25 }, (_, i) => {
    const status =
      PLACEHOLDER_STATUSES[(i + teamId) % PLACEHOLDER_STATUSES.length];
    return {
      tileId: i,
      name: `Tile ${i + 1}`,
      iconUrl: PLACEHOLDER_ICON,
      requiredCount: i % 5 === 0 ? 3 : 1,
      category: "ITEM DROP",
      description: "Submit a screenshot once you've received this item.",
      approvedCount: status === "approved" ? 1 : 0,
      pendingCount: status === "pending" ? 1 : 0,
      rejectedCount: status === "rejected" ? 1 : 0,
      status,
      latestProofUrl: null,
      latestSubmittedBy: status === "none" ? null : "izJordy",
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
    prizePot: {
      total: "51.50M",
    },
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
    teamName: "Crimson Fang",
    tileName: "Twisted Bow",
    iconUrl: PLACEHOLDER_ICON,
    submittedBy: "SomePlayer",
    createdAt: "2026-08-02T00:00:00.000Z",
    itemId: null,
  },
  {
    id: 2,
    status: "pending",
    proofUrl: null,
    teamName: "Onyx Talon",
    tileName: "Scythe of Vitur",
    iconUrl: PLACEHOLDER_ICON,
    submittedBy: "AnotherPlayer",
    createdAt: "2026-08-02T00:00:00.000Z",
    itemId: null,
  },
];
