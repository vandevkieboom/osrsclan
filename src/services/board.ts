import { upload } from "@vercel/blob/client";

export interface BoardTeam {
  id: number;
  name: string;
  memberCount: number;
  completeCount: number;
  totalTiles: number;
  pct: number;
  accentColor: string;
  isLeading: boolean;
}

export interface MyTeamTile {
  tileId: number;
  name: string;
  iconUrl: string;
  status: "none" | "pending" | "approved" | "rejected";
  proofUrl: string | null;
}

export interface BoardData {
  config: { name: string; dateRange: string; size: number };
  teams: BoardTeam[];
  myTeam: { id: number; name: string; tiles: MyTeamTile[] } | null;
}

export async function fetchBoard(): Promise<BoardData> {
  const res = await fetch("/api/board");
  if (!res.ok) throw new Error(`Failed to load board (${res.status})`);
  return res.json() as Promise<BoardData>;
}

export async function submitTileProof(tileId: number, file: File): Promise<void> {
  const blob = await upload(`proofs/${tileId}-${Date.now()}-${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/board/upload",
  });

  const res = await fetch("/api/board/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tileId, proofUrl: blob.url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to submit proof (${res.status})`);
  }
}
