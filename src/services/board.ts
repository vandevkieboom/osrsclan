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
  /**
   * Opaque change stamp for the board this response represents. Only ever
   * compared against the one fetchBoardStatus returns, never parsed or shown.
   */
  boardChangedAt?: string | null;
}

export interface BoardStatus {
  bingoActive: boolean;
  boardChangedAt: string | null;
  /**
   * Names one exact state of the board. Pass it to fetchBoard to get a copy
   * that is cached until the board next changes. Null during an outage.
   */
  boardVersion?: string | null;
}

/**
 * The cheap "has anything actually changed?" check.
 *
 * The same endpoint the RuneLite plugin polls, deliberately: it is identical
 * for every caller, so every open tab and every plugin share one CDN entry,
 * and it is cached until the board actually changes (see
 * api/_lib/board-cache.ts). Polling this and only fetching the board when the
 * version moves is what keeps an open board tab from costing anything.
 */
export async function fetchBoardStatus(): Promise<BoardStatus> {
  const res = await fetch("/api/plugin-poll");
  if (!res.ok) throw new Error(`Failed to load board status (${res.status})`);
  return res.json() as Promise<BoardStatus>;
}

/**
 * Whether change stamp `a` is strictly older than `b`. Stamps only ever move
 * forward (db/schema.sql), so an older one is a lagging cache, never a real
 * state to go back to. Unknown or unparseable stamps are never "older".
 */
export function isOlderStamp(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const at = Date.parse(a);
  const bt = Date.parse(b);
  return Number.isFinite(at) && Number.isFinite(bt) && at < bt;
}

export interface Donor {
  name: string;
  donatedGp: number;
}

/**
 * @param version from fetchBoardStatus: the CDN keeps a versioned board until
 *   the board changes, so it is rendered once per change however many people
 *   look at it.
 * @param fresh bypass every cache - only right after *you* did something:
 *   seeing your own submission missing from the board you just submitted it
 *   to reads as a bug, not as a cache. Costs one render each, and only happens
 *   on a real user action, so there are very few of them.
 */
export async function fetchBoard(
  opts: { fresh?: boolean; version?: string | null } = {},
): Promise<BoardData> {
  const url = opts.fresh
    ? `/api/board?fresh=${Date.now()}`
    : opts.version
      ? `/api/board?v=${encodeURIComponent(opts.version)}`
      : "/api/board";
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

// The Blob store proof screenshots live in. Must match
// images.remotePatterns in vercel.json: the optimizer refuses any other host.
const PROOF_IMAGE_HOST = "o3vcuwswsm0xzkof.public.blob.vercel-storage.com";

/**
 * A proof screenshot's URL, resized through Vercel's image optimizer (sizes
 * and qualities must match images.sizes/qualities in vercel.json).
 *
 * The board's detail panel used to show every screenshot of a tile at full
 * resolution as its "thumbnail": 32 GB of Blob transfer in ten days of an
 * event from ~420 MB of stored images, each one downloaded ~75 times. A
 * resized WebP is cached at the CDN, costs one transformation per image per
 * size, and is served as ordinary CDN transfer rather than Blob transfer.
 * Anything not on the proof store (dev placeholders) is returned untouched.
 */
export function proofImageUrl(url: string, size: "thumb" | "full"): string {
  if (!import.meta.env.PROD) return url;
  try {
    if (new URL(url).hostname !== PROOF_IMAGE_HOST) return url;
  } catch {
    return url;
  }
  const [width, quality] = size === "thumb" ? [320, 60] : [1920, 80];
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}

// A proof has to stay readable (the codeword overlay especially), not be a
// photograph: 1920px wide at JPEG quality 0.85 keeps small text crisp.
const PROOF_MAX_WIDTH = 1920;
const PROOF_JPEG_QUALITY = 0.85;

/**
 * Re-encodes a screenshot as JPEG before upload, the way the RuneLite plugin
 * already does for its own captures. Measured live: website uploads averaged
 * 1.46 MB (raw PNG screenshots), plugin captures 190 KB, for the same kind of
 * image. Every byte stored is a byte every viewer downloads. Falls back to the
 * original file if the browser can't decode it or the result isn't smaller.
 */
async function compressProof(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PROOF_MAX_WIDTH / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", PROOF_JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function submitTileProof(
  tileId: number,
  original: File,
  itemId?: number,
): Promise<void> {
  const file = await compressProof(original);
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
