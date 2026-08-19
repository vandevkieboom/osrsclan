import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { withErrorHandling } from "../_lib/handler.js";

// Fired on approval, not submission — a rejected screenshot (wrong item,
// duplicate) should never have hit the channel in the first place. Failure
// here is logged and swallowed rather than surfaced to the admin: a Discord
// outage or missing webhook config shouldn't block the actual approval,
// which already succeeded in the database by the time this runs.
async function postBingoDropWebhook(submissionId: number) {
  const webhookUrl = process.env.DISCORD_BINGO_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const rows = await sql`
      SELECT s.proof_url, s.item_id, t.name AS team_name, ti.name AS tile_name,
             ti.icon_url, u.discord_global_name, u.discord_username, u.runescape_name
      FROM submissions s
      JOIN teams t ON t.id = s.team_id
      JOIN tiles ti ON ti.id = s.tile_id
      LEFT JOIN users u ON u.id = s.submitted_by
      WHERE s.id = ${submissionId}`;
    const row = rows[0];
    if (!row) return;

    const submittedBy =
      row.runescape_name ?? row.discord_global_name ?? row.discord_username ?? "Unknown";
    const thumbnail = row.item_id
      ? `https://static.runelite.net/cache/item/icon/${row.item_id}.png`
      : row.icon_url;
    // Only link when we actually have an RSN — the site's profile page
    // resolves ?rsn= against the clan's WOM roster, so linking a Discord
    // display-name fallback would just 404.
    const profileUrl = row.runescape_name
      ? `https://timeserved.vercel.app/profile?${new URLSearchParams({ rsn: row.runescape_name })}`
      : undefined;

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            author: { name: submittedBy, url: profileUrl },
            description: `Completed **${row.tile_name}** for **${row.team_name}**`,
            color: 0x5fbf6a,
            thumbnail: thumbnail ? { url: thumbnail } : undefined,
            image: row.proof_url ? { url: row.proof_url } : undefined,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`Bingo drop webhook returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error("Failed to post bingo drop webhook:", err);
  }
}

async function listSubmissions(req: VercelRequest, res: VercelResponse) {
  const status =
    typeof req.query.status === "string" ? req.query.status : "pending";

  // Ordered by tile then team (not just time) so the admin UI can group
  // everything for the same tile+team together — that's the unit an admin
  // actually needs to compare against when checking for duplicates, never
  // the whole clan at once.
  const rows = await sql`
    SELECT s.id, s.status, s.proof_url, s.created_at, s.item_id,
           s.team_id, s.tile_id,
           t.name AS team_name, ti.name AS tile_name, ti.icon_url,
           ti.require_unique_items,
           u.discord_username, u.discord_global_name, u.runescape_name
    FROM submissions s
    JOIN teams t ON t.id = s.team_id
    JOIN tiles ti ON ti.id = s.tile_id
    LEFT JOIN users u ON u.id = s.submitted_by
    WHERE s.status = ${status}
    ORDER BY ti.name ASC, t.name ASC, s.created_at ASC, s.id ASC`;

  // For unique-item tiles, tell the reviewer which item ids are already
  // approved for the same team+tile — without this they'd have to remember
  // or hunt down every other screenshot for that team's board themselves.
  const approvedRows = await sql`
    SELECT team_id, tile_id, item_id
    FROM submissions
    WHERE status = 'approved' AND item_id IS NOT NULL`;
  const approvedByTeamTile = new Map<string, number[]>();
  for (const r of approvedRows) {
    const key = `${r.team_id}:${r.tile_id}`;
    const list = approvedByTeamTile.get(key) ?? [];
    list.push(r.item_id);
    approvedByTeamTile.set(key, list);
  }

  res.status(200).json({
    submissions: rows.map((r) => ({
      id: r.id,
      status: r.status,
      proofUrl: r.proof_url,
      teamId: r.team_id,
      tileId: r.tile_id,
      teamName: r.team_name,
      tileName: r.tile_name,
      iconUrl: r.icon_url,
      requireUniqueItems: r.require_unique_items,
      // Only ever set once someone (the plugin automatically, or an admin by
      // hand during review) has recorded which item this submission shows.
      itemId: r.item_id,
      alreadyApprovedItemIds: approvedByTeamTile.get(`${r.team_id}:${r.tile_id}`) ?? [],
      submittedBy:
        r.runescape_name ??
        r.discord_global_name ??
        r.discord_username ??
        "Unknown",
      createdAt: r.created_at,
    })),
  });
}

async function reviewSubmission(
  req: VercelRequest,
  res: VercelResponse,
  adminId: number,
) {
  const id = Number(req.body?.id);
  const decision = req.body?.decision;
  const rawItemId = Number(req.body?.itemId);
  const itemId = Number.isInteger(rawItemId) && rawItemId > 0 ? rawItemId : undefined;
  if (
    !Number.isInteger(id) ||
    (decision !== "approved" && decision !== "rejected")
  ) {
    res
      .status(400)
      .json({
        error: "id and decision ('approved' | 'rejected') are required",
      });
    return;
  }

  if (decision === "approved") {
    const capRows = await sql`
      SELECT
        s.team_id,
        s.tile_id,
        t.require_unique_items,
        COUNT(*) FILTER (WHERE s2.status = 'approved')::int AS approved_count,
        t.required_count
      FROM submissions s
      JOIN submissions s2 ON s2.team_id = s.team_id AND s2.tile_id = s.tile_id
      JOIN tiles t ON t.id = s.tile_id
      WHERE s.id = ${id}
      GROUP BY s.team_id, s.tile_id, t.require_unique_items, t.required_count`;

    const capRow = capRows[0];
    if (capRow && capRow.approved_count >= capRow.required_count) {
      res.status(409).json({ error: "That tile is already complete" });
      return;
    }

    // Same rule the RuneLite plugin enforces automatically at submit time —
    // applied here too so a manually-tagged item id gets the same protection
    // a plugin submission always had.
    if (capRow?.require_unique_items && itemId !== undefined) {
      const dupRows = await sql`
        SELECT 1 FROM submissions
        WHERE team_id = ${capRow.team_id} AND tile_id = ${capRow.tile_id}
          AND item_id = ${itemId} AND status = 'approved' AND id != ${id}
        LIMIT 1`;
      if (dupRows.length > 0) {
        res
          .status(409)
          .json({ error: "That item has already been approved for this tile" });
        return;
      }
    }
  }

  const rows =
    itemId !== undefined
      ? await sql`
        UPDATE submissions
        SET status = ${decision}, reviewed_by = ${adminId}, reviewed_at = now(), item_id = ${itemId}
        WHERE id = ${id} AND status = 'pending'
        RETURNING id`
      : await sql`
        UPDATE submissions
        SET status = ${decision}, reviewed_by = ${adminId}, reviewed_at = now()
        WHERE id = ${id} AND status = 'pending'
        RETURNING id`;

  if (rows.length === 0) {
    res.status(404).json({ error: "Pending submission not found" });
    return;
  }

  if (decision === "approved") {
    await postBingoDropWebhook(id);
  }

  res.status(200).json({ ok: true });
}

// Listing pending submissions and reviewing them are combined into one
// function to stay under the Vercel Hobby plan's 12-function-per-deployment
// cap, dispatched by HTTP method.
export default withErrorHandling(async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    await listSubmissions(req, res);
    return;
  }

  if (req.method === "POST") {
    await reviewSubmission(req, res, admin.id);
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
});
