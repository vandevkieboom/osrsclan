import { upload } from "@vercel/blob/client";

export interface BoardProof {
  id: number;
  status: "pending" | "approved" | "rejected";
  proofUrl: string;
  submittedBy: string | null;
  submittedByAvatarUrl: string | null;
  createdAt: string;
}

export interface ItemRequirement {
  itemId: number;
  name: string;
  requiredAmount: number;
  group: string | null;
}

export interface ItemRequirementStatus extends ItemRequirement {
  currentAmount: number;
}

/** Per-item/per-group completion for a tile using item_requirements (see
 * db/schema.sql) — null for every tile still on the flat item_ids/
 * required_count model. */
export interface ItemRequirementsStatus {
  complete: boolean;
  perItem: ItemRequirementStatus[];
}

export interface BoardTile {
  tileId: number;
  position: number;
  name: string;
  iconUrl: string;
  requiredCount: number;
  category: string;
  description: string;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  status: "none" | "pending" | "approved" | "rejected";
  latestProofUrl: string | null;
  latestSubmittedBy: string | null;
  proofs: BoardProof[];
  /** "item" (the default) goes through proof/review above; "xp"/"kc" are
   * team-combined totals the RuneLite plugin reports directly — see
   * teamProgress/goalTarget below, and never have proofs. */
  goalKind: "item" | "xp" | "kc";
  goalKey: string;
  goalTarget: number | null;
  teamProgress: number | null;
  itemRequirementsStatus: ItemRequirementsStatus | null;
  /** Which OSRS items count toward this tile — every one of them for a
   * plain tile, or every item across every set for an advanced one (in
   * which case itemRequirementsStatus above is the one that actually
   * explains how they combine; this is just "what to show an icon for"). */
  itemIds: number[];
}

// Same public, static CDN api/_lib/icons.ts's itemIconUrl derives tile icons
// from — a fixed URL formula from a numeric item id, not a lookup, so
// there's nothing here that can drift from the server's own version. Shared
// by ItemRequirementsProgress and TileDetailPanel's own qualifying-items
// grid, rather than each keeping its own copy of one string template.
export function itemIconUrl(itemId: number): string {
  return `https://static.runelite.net/cache/item/icon/${itemId}.png`;
}

export interface BoardTeam {
  id: number;
  name: string;
  memberCount: number;
  members: string[];
  captainId: number | null;
  captainName: string | null;
  completeCount: number;
  totalTiles: number;
  pct: number;
  accentColor: string;
  isLeading: boolean;
  tiles: BoardTile[];
}

export interface BoardData {
  config: {
    name: string;
    size: number;
  };
  teams: BoardTeam[];
  /**
   * Always null — the board is one cached copy shared by every viewer, so it
   * carries nothing per-viewer. Use `useAuth().user?.team?.id` instead. Kept
   * on the type because the API still sends the field.
   */
  myTeamId: number | null;
  /**
   * True only while no event is active and the viewer isn't an admin —
   * `teams` is deliberately emptied by the server in that case (see
   * getBoard in api/board.ts), not actually empty. Lets the page tell "no
   * bingo running right now" apart from a genuinely empty board, which
   * otherwise look identical from here. Admins never see this: they get
   * the real board regardless of whether an event is active.
   */
  hidden?: boolean;
}

export interface Donor {
  name: string;
  donatedGp: number;
}

/**
 * @param fresh bypass the CDN copy. The board is edge-cached for a few
 *   seconds so that one change doesn't cost one render per viewer (see
 *   getBoard in api/board.ts), which is right for ordinary page loads and
 *   wrong immediately after *you* did something: seeing your own submission
 *   missing from the board you just submitted it to reads as a bug, not as a
 *   cache. A unique query string gives those few reloads an uncached answer,
 *   at the cost of one extra render each — they only happen on a real user
 *   action, so there are very few of them.
 */
export async function fetchBoard(fresh = false): Promise<BoardData> {
  const url = fresh ? `/api/board?fresh=${Date.now()}` : "/api/board";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load board (${res.status})`);
  return res.json() as Promise<BoardData>;
}

export async function fetchDonors(): Promise<Donor[]> {
  const res = await fetch("/api/board?resource=donors");
  if (!res.ok) throw new Error(`Failed to load donors (${res.status})`);
  const data = (await res.json()) as { donors: Donor[] };
  return data.donors;
}

export async function submitTileProof(
  tileId: number,
  file: File,
  itemId?: number,
): Promise<void> {
  const blob = await upload(
    `proofs/${tileId}-${Date.now()}-${file.name}`,
    file,
    {
      access: "public",
      handleUploadUrl: "/api/board",
    },
  );

  const res = await fetch("/api/board", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tileId, proofUrl: blob.url, itemId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to submit proof (${res.status})`);
  }
}
