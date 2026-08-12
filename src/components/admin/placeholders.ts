import type {
  AdminTeam,
  AdminTile,
  AdminUser,
  BoardConfig,
  Donation,
} from "../../services/admin";

// Dev-only fallback so every admin tab has something to render under plain
// `npm run dev`, which has no backend at all. Never used in production —
// import.meta.env.DEV is false in a real build regardless of what the real
// fetch does.
export const PLACEHOLDER_TEAMS: AdminTeam[] = [
  { id: 1, name: "Crimson Fang", slug: "crimson-fang", accentColor: "#e8574a", memberCount: 6, captainId: 1, captainName: "izJordy" },
  { id: 2, name: "Onyx Talon", slug: "onyx-talon", accentColor: "#5b9bd5", memberCount: 5, captainId: null, captainName: null },
];
export const PLACEHOLDER_USERS: AdminUser[] = [
  { id: 1, username: "izjordy", globalName: "izJordy", runescapeName: "izJordy", avatarUrl: null, isAdmin: true, team: { id: 1, name: "Crimson Fang" } },
  { id: 2, username: "test_user_two", globalName: "Test User Two", runescapeName: null, avatarUrl: null, isAdmin: false, team: null },
  { id: 3, username: "test_user_three", globalName: null, runescapeName: null, avatarUrl: null, isAdmin: false, team: { id: 2, name: "Onyx Talon" } },
];
export const PLACEHOLDER_DONATIONS: Donation[] = [
  { id: 1, name: "izJordy", amountGp: 500000 },
];
export const PLACEHOLDER_BOARD_CONFIG: BoardConfig = {
  name: "Summer Blackout Bingo",
  size: 5,
  prizePot: { total: "" },
};
export const PLACEHOLDER_TILES: AdminTile[] = [
  { id: 1, position: 0, name: "Twisted Bow", iconUrl: "https://oldschool.runescape.wiki/images/Twisted_bow_detail.png", requiredCount: 1, category: "ITEM DROP", description: "" },
  { id: 2, position: 1, name: "Scythe of Vitur", iconUrl: "https://oldschool.runescape.wiki/images/Scythe_of_vitur_detail.png", requiredCount: 1, category: "ITEM DROP", description: "" },
];
