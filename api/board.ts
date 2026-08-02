import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";

const ACCENT_PALETTE = ["#e8574a", "#5b9bd5", "#ffb340", "#3fae5c", "#c9c9c9", "#a76ee8"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;

  const configRows = await sql`SELECT name, date_range, size FROM board_config WHERE id = 1`;
  const config = configRows[0];

  const tileRows = await sql`SELECT id, position, name, icon_url FROM tiles ORDER BY position`;
  const tiles = tileRows.map((t) => ({ id: t.id, position: t.position, name: t.name, iconUrl: t.icon_url }));

  const teamRows = await sql`
    SELECT tm.id, tm.name, COUNT(u.id)::int AS member_count
    FROM teams tm
    LEFT JOIN users u ON u.team_id = tm.id
    GROUP BY tm.id
    ORDER BY tm.name`;

  const completeRows = await sql`
    SELECT team_id, COUNT(*) FILTER (WHERE status = 'approved')::int AS complete
    FROM submissions GROUP BY team_id`;
  const completeByTeam = new Map<number, number>(completeRows.map((r) => [r.team_id, r.complete]));

  const totalTiles = tiles.length;
  const teamsWithPct = teamRows.map((t, i) => {
    const completeCount = completeByTeam.get(t.id) ?? 0;
    const pct = totalTiles > 0 ? Math.round((completeCount / totalTiles) * 100) : 0;
    return {
      id: t.id,
      name: t.name,
      memberCount: t.member_count,
      completeCount,
      totalTiles,
      pct,
      accentColor: ACCENT_PALETTE[i % ACCENT_PALETTE.length],
    };
  });
  const leaderPct = teamsWithPct.length > 0 ? Math.max(...teamsWithPct.map((t) => t.pct)) : 0;
  const teams = teamsWithPct.map((t) => ({ ...t, isLeading: t.pct === leaderPct && leaderPct > 0 }));

  let myTeam = null;
  if (user.teamId) {
    const subRows = await sql`
      SELECT tile_id, status, proof_url FROM submissions WHERE team_id = ${user.teamId}`;
    const subByTile = new Map(subRows.map((r) => [r.tile_id, { status: r.status, proofUrl: r.proof_url }]));
    myTeam = {
      id: user.teamId,
      name: user.teamName,
      tiles: tiles.map((t) => ({
        tileId: t.id,
        name: t.name,
        iconUrl: t.iconUrl,
        status: subByTile.get(t.id)?.status ?? "none",
        proofUrl: subByTile.get(t.id)?.proofUrl ?? null,
      })),
    };
  }

  res.status(200).json({
    config: { name: config.name, dateRange: config.date_range, size: config.size },
    teams,
    myTeam,
  });
}
