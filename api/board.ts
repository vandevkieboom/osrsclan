import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { sql } from "./_lib/db.js";
import { getSessionUser, requireUser } from "./_lib/auth.js";
import { getOrCreateBoardConfig } from "./_lib/board.js";

// The leaderboard is public — anyone can see team standings (and every
// team's board, read-only) without logging in. A session is only needed to
// know which team is "yours" for submit-proof permission checks.
async function getBoard(req: VercelRequest, res: VercelResponse) {
  const user = await getSessionUser(req);

  const config = await getOrCreateBoardConfig();
  const slotCount = config.size * config.size;

  // A bingo board is always size x size — tiles beyond that (left over from
  // a larger board that got shrunk) stay in the database but drop off the
  // board until size grows back to cover them again.
  const tileRows = await sql`
    SELECT id, position, name, icon_url, required_count, category, description
    FROM tiles WHERE position < ${slotCount} ORDER BY position`;
  const tiles = tileRows.map((t) => ({
    id: t.id,
    position: t.position,
    name: t.name,
    iconUrl: t.icon_url,
    requiredCount: t.required_count,
    category: t.category,
    description: t.description,
  }));
  const requiredCountByTile = new Map<number, number>(tiles.map((t) => [t.id, t.requiredCount]));

  const teamRows = await sql`
    SELECT tm.id, tm.name, tm.accent_color, tm.captain_id,
           cap.discord_username AS captain_username, cap.discord_global_name AS captain_global_name,
           cap.runescape_name AS captain_rsn,
           COUNT(u.id)::int AS member_count
    FROM teams tm
    LEFT JOIN users u ON u.team_id = tm.id
    LEFT JOIN users cap ON cap.id = tm.captain_id
    GROUP BY tm.id, cap.id
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
    SELECT s.id, s.team_id, s.tile_id, s.status, s.proof_url, s.created_at,
           u.discord_global_name, u.discord_username, u.runescape_name,
           u.discord_id, u.discord_avatar_hash
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
    proofs: {
      id: number;
      status: "pending" | "approved" | "rejected";
      proofUrl: string;
      submittedBy: string | null;
      submittedByAvatarUrl: string | null;
      createdAt: string;
    }[];
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
      proofs: [],
    };

    if (row.status === "approved") current.approvedCount += 1;
    else if (row.status === "pending") current.pendingCount += 1;
    else current.rejectedCount += 1;

    current.latestProofUrl = row.proof_url;
    current.latestSubmittedBy = row.runescape_name ?? row.discord_global_name ?? row.discord_username ?? null;
    current.proofs.push({
      id: row.id,
      status: row.status,
      proofUrl: row.proof_url,
      submittedBy: row.runescape_name ?? row.discord_global_name ?? row.discord_username ?? null,
      submittedByAvatarUrl:
        row.discord_id && row.discord_avatar_hash
          ? `https://cdn.discordapp.com/avatars/${row.discord_id}/${row.discord_avatar_hash}.png?size=64`
          : null,
      createdAt: row.created_at,
    });

    teamSubmissions.set(row.tile_id, current);
    submissionsByTeam.set(row.team_id, teamSubmissions);
  }

  function buildTiles(teamId: number) {
    const subByTile = submissionsByTeam.get(teamId) ?? new Map<number, TileSubmissionAggregate>();
    return tiles.map((t) => {
      const agg = subByTile.get(t.id);
      const approvedCount = agg?.approvedCount ?? 0;
      const pendingCount = agg?.pendingCount ?? 0;
      const rejectedCount = agg?.rejectedCount ?? 0;
      return {
        tileId: t.id,
        name: t.name,
        iconUrl: t.iconUrl,
        requiredCount: t.requiredCount,
        category: t.category,
        description: t.description,
        approvedCount,
        pendingCount,
        rejectedCount,
        status:
          approvedCount >= t.requiredCount
            ? "approved"
            : pendingCount > 0
              ? "pending"
              : rejectedCount > 0
                ? "rejected"
                : "none",
        latestProofUrl: agg?.latestProofUrl ?? null,
        latestSubmittedBy: agg?.latestSubmittedBy ?? null,
        proofs: agg?.proofs ?? [],
      };
    });
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
      captainId: t.captain_id,
      captainName: t.captain_id
        ? (t.captain_rsn ?? t.captain_global_name ?? t.captain_username ?? null)
        : null,
      completeCount,
      totalTiles,
      pct,
      accentColor: t.accent_color,
      tiles: buildTiles(t.id),
    };
  });
  const leaderPct = teamsWithPct.length > 0 ? Math.max(...teamsWithPct.map((t) => t.pct)) : 0;
  const teams = teamsWithPct.map((t) => ({ ...t, isLeading: t.pct === leaderPct && leaderPct > 0 }));

  res.status(200).json({
    config: {
      name: config.name,
      size: config.size,
      prizePot: config.prize_pot,
    },
    teams,
    myTeamId: user?.teamId ?? null,
  });
}

async function getDonors(res: VercelResponse) {
  const rows = await sql`
    SELECT name, amount_gp
    FROM donations
    WHERE amount_gp > 0
    ORDER BY amount_gp DESC, name ASC
    LIMIT 5`;

  res.status(200).json({
    donors: rows.map((r) => ({
      name: r.name,
      donatedGp: Number(r.amount_gp),
    })),
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

  // Counting submissions and then inserting used to be two separate round
  // trips, so two teammates submitting the same tile at once could both read
  // "one slot left" and both insert. The UNIQUE (team_id, tile_id) that would
  // once have caught that was dropped when tiles gained required_count, so
  // nothing was backstopping it.
  //
  // Both statements now run in one transaction: SELECT … FOR UPDATE takes a
  // row lock on the tile, so a second submission for the same tile waits and
  // then sees the first one committed. The INSERT … SELECT … WHERE re-checks
  // the count as part of the write itself rather than trusting an earlier read.
  const [tileRows, insertedRows] = await sql.transaction([
    sql`SELECT id FROM tiles WHERE id = ${tileId} FOR UPDATE`,
    sql`
      INSERT INTO submissions (team_id, tile_id, status, proof_url, submitted_by)
      SELECT ${user.teamId}, ${tileId}, 'pending', ${proofUrl}, ${user.id}
      WHERE (
        SELECT COUNT(*) FROM submissions
        WHERE team_id = ${user.teamId} AND tile_id = ${tileId}
          AND status IN ('approved', 'pending')
      ) < (SELECT required_count FROM tiles WHERE id = ${tileId})
      RETURNING id`,
  ]);

  if (tileRows.length === 0) {
    res.status(404).json({ error: "Tile not found" });
    return;
  }
  if (insertedRows.length === 0) {
    res.status(409).json({ error: "That tile is already complete" });
    return;
  }

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

// Reading the board (incl. the public donor leaderboard), submitting a
// tile, and the Blob upload-token handshake are combined into one function
// to stay under the Vercel Hobby plan's 12-function-per-deployment cap.
// Vercel Blob's client SDK always posts a `type` field (e.g.
// "blob.generate-client-token"); our own submit body never has one, so
// that's what distinguishes the two POST actions.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    if (req.query.resource === "donors") {
      await getDonors(res);
    } else {
      await getBoard(req, res);
    }
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
