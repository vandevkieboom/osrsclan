import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { sql } from "./_lib/db.js";
import { getSessionUser, requireUser } from "./_lib/auth.js";
import { getOrCreateBoardConfig } from "./_lib/board.js";

// The leaderboard is public — anyone can see team standings without logging
// in. Only "my team's board" (which team you're even on) needs a session.
async function getBoard(req: VercelRequest, res: VercelResponse) {
  const user = await getSessionUser(req);

  const config = await getOrCreateBoardConfig();
  const slotCount = config.size * config.size;

  // A bingo board is always size x size — tiles beyond that (left over from
  // a larger board that got shrunk) stay in the database but drop off the
  // board until size grows back to cover them again.
  const tileRows = await sql`
    SELECT id, position, name, icon_url, required_count FROM tiles WHERE position < ${slotCount} ORDER BY position`;
  const tiles = tileRows.map((t) => ({
    id: t.id,
    position: t.position,
    name: t.name,
    iconUrl: t.icon_url,
    requiredCount: t.required_count,
  }));
  const requiredCountByTile = new Map<number, number>(tiles.map((t) => [t.id, t.requiredCount]));

  const teamRows = await sql`
    SELECT tm.id, tm.name, tm.accent_color, COUNT(u.id)::int AS member_count
    FROM teams tm
    LEFT JOIN users u ON u.team_id = tm.id
    GROUP BY tm.id
    ORDER BY tm.name`;

  const memberRows = await sql`
    SELECT team_id, discord_username, discord_global_name, runescape_name
    FROM users WHERE team_id IS NOT NULL ORDER BY discord_username`;
  const membersByTeam = new Map<number, string[]>();
  for (const r of memberRows) {
    const list = membersByTeam.get(r.team_id) ?? [];
    list.push(r.runescape_name ?? r.discord_global_name ?? r.discord_username);
    membersByTeam.set(r.team_id, list);
  }

  const submissionRows = await sql`
    SELECT s.team_id, s.tile_id, s.status, s.proof_url, s.created_at,
           u.discord_global_name, u.discord_username, u.runescape_name
    FROM submissions s
    LEFT JOIN users u ON u.id = s.submitted_by
    WHERE s.team_id IN (SELECT id FROM teams)
    ORDER BY s.created_at ASC, s.id ASC`;

  type TileSubmissionAggregate = {
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
    latestProofUrl: string | null;
    latestSubmittedBy: string | null;
    latestCreatedAt: number;
  };

  const submissionsByTeam = new Map<number, Map<number, TileSubmissionAggregate>>();
  for (const row of submissionRows) {
    const teamSubmissions = submissionsByTeam.get(row.team_id) ?? new Map<number, TileSubmissionAggregate>();
    const current = teamSubmissions.get(row.tile_id) ?? {
      approvedCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
      latestProofUrl: null,
      latestSubmittedBy: null,
      latestCreatedAt: 0,
    };

    if (row.status === "approved") current.approvedCount += 1;
    else if (row.status === "pending") current.pendingCount += 1;
    else current.rejectedCount += 1;

    current.latestProofUrl = row.proof_url;
    current.latestSubmittedBy = row.runescape_name ?? row.discord_global_name ?? row.discord_username ?? null;
    current.latestCreatedAt = new Date(row.created_at).getTime();

    teamSubmissions.set(row.tile_id, current);
    submissionsByTeam.set(row.team_id, teamSubmissions);
  }

  const completeByTeam = new Map<number, number>();
  for (const team of teamRows) {
    const teamSubmissions = submissionsByTeam.get(team.id) ?? new Map<number, TileSubmissionAggregate>();
    let complete = 0;
    for (const tile of tiles) {
      const aggregate = teamSubmissions.get(tile.id);
      if (aggregate && aggregate.approvedCount >= requiredCountByTile.get(tile.id)!) complete += 1;
    }
    completeByTeam.set(team.id, complete);
  }

  const totalTiles = tiles.length;
  const teamsWithPct = teamRows.map((t) => {
    const completeCount = completeByTeam.get(t.id) ?? 0;
    const pct = totalTiles > 0 ? Math.round((completeCount / totalTiles) * 100) : 0;
    return {
      id: t.id,
      name: t.name,
      memberCount: t.member_count,
      members: membersByTeam.get(t.id) ?? [],
      completeCount,
      totalTiles,
      pct,
      accentColor: t.accent_color,
    };
  });
  const leaderPct = teamsWithPct.length > 0 ? Math.max(...teamsWithPct.map((t) => t.pct)) : 0;
  const teams = teamsWithPct.map((t) => ({ ...t, isLeading: t.pct === leaderPct && leaderPct > 0 }));

  let myTeam = null;
  if (user?.teamId) {
    const subByTile = submissionsByTeam.get(user.teamId) ?? new Map<number, TileSubmissionAggregate>();
    myTeam = {
      id: user.teamId,
      name: user.teamName,
      tiles: tiles.map((t) => ({
        tileId: t.id,
        name: t.name,
        iconUrl: t.iconUrl,
        requiredCount: t.requiredCount,
        approvedCount: subByTile.get(t.id)?.approvedCount ?? 0,
        pendingCount: subByTile.get(t.id)?.pendingCount ?? 0,
        rejectedCount: subByTile.get(t.id)?.rejectedCount ?? 0,
        status:
          (subByTile.get(t.id)?.approvedCount ?? 0) >= t.requiredCount
            ? "approved"
            : (subByTile.get(t.id)?.pendingCount ?? 0) > 0
              ? "pending"
              : (subByTile.get(t.id)?.rejectedCount ?? 0) > 0
                ? "rejected"
                : "none",
        latestProofUrl: subByTile.get(t.id)?.latestProofUrl ?? null,
        latestSubmittedBy: subByTile.get(t.id)?.latestSubmittedBy ?? null,
      })),
    };
  }

  res.status(200).json({
    config: { name: config.name, dateRange: config.date_range, size: config.size },
    teams,
    myTeam,
  });
}

async function submitTile(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (!user.teamId) {
    res.status(400).json({ error: "You are not assigned to a team yet" });
    return;
  }

  const tileId = Number(req.body?.tileId);
  const proofUrl = typeof req.body?.proofUrl === "string" ? req.body.proofUrl : "";
  if (!Number.isInteger(tileId) || !proofUrl) {
    res.status(400).json({ error: "tileId and proofUrl are required" });
    return;
  }

  const tileRows = await sql`SELECT id, required_count FROM tiles WHERE id = ${tileId}`;
  if (tileRows.length === 0) {
    res.status(404).json({ error: "Tile not found" });
    return;
  }

  const currentCompleteRows = await sql`
    SELECT COUNT(*)::int AS approved_count
    FROM submissions
    WHERE team_id = ${user.teamId} AND tile_id = ${tileId} AND status = 'approved'`;
  const approvedCount = currentCompleteRows[0]?.approved_count ?? 0;
  const requiredCount = tileRows[0].required_count;
  if (approvedCount >= requiredCount) {
    res.status(409).json({ error: "That tile is already complete" });
    return;
  }

  await sql`
    INSERT INTO submissions (team_id, tile_id, status, proof_url, submitted_by)
    VALUES (${user.teamId}, ${tileId}, 'pending', ${proofUrl}, ${user.id})`;

  res.status(200).json({ ok: true });
}

async function uploadToken(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return;

  const body = req.body as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["image/png", "image/jpeg", "image/webp"],
        maximumSizeInBytes: 8 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {},
    });
    res.status(200).json(jsonResponse);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
}

// Reading the board, submitting a tile, and the Blob upload-token handshake
// are combined into one function to stay under the Vercel Hobby plan's
// 12-function-per-deployment cap. Vercel Blob's client SDK always posts a
// `type` field (e.g. "blob.generate-client-token"); our own submit body
// never has one, so that's what distinguishes the two POST actions.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    await getBoard(req, res);
    return;
  }

  if (req.method === "POST") {
    if (typeof req.body?.type === "string") {
      await uploadToken(req, res);
    } else {
      await submitTile(req, res);
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
