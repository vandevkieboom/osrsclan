import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { withErrorHandling } from "../_lib/handler.js";
import {
  checkItemRequirements,
  parseItemRequirements,
  type ItemRequirementsStatus,
} from "../_lib/board.js";
import { publishBoardMarker } from "../_lib/board-marker.js";
import { deriveTileIconUrl, itemIconUrl } from "../_lib/icons.js";

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
             ti.icon_url, ti.item_ids,
             u.discord_global_name, u.discord_username, u.runescape_name
      FROM submissions s
      JOIN teams t ON t.id = s.team_id
      JOIN tiles ti ON ti.id = s.tile_id
      LEFT JOIN users u ON u.id = s.submitted_by
      WHERE s.id = ${submissionId}`;
    const row = rows[0];
    if (!row) return;

    const submittedBy =
      row.runescape_name ?? row.discord_global_name ?? row.discord_username ?? "Unknown";
    // The exact item this submission was for is the most relevant picture for
    // a "you got X" notification — fall back to the tile's own derived icon
    // (same as the board/review queue) only when that isn't known.
    const thumbnail = row.item_id
      ? itemIconUrl(row.item_id)
      : deriveTileIconUrl({
          itemIds: (row.item_ids ?? []) as number[],
          goalKind: "item",
          goalKey: "",
          legacyIconUrl: row.icon_url ?? "",
        });
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

  // Optional narrowing for a 200-person clan's worth of pending submissions —
  // without these an admin has no way to focus on just their own team or a
  // single tile. Passed as nullable params (rather than composing the WHERE
  // clause dynamically) so this stays one plain tagged-template query either
  // way.
  const rawTeamId = Number(req.query.teamId);
  const teamId = Number.isInteger(rawTeamId) && rawTeamId > 0 ? rawTeamId : null;
  const rawTileId = Number(req.query.tileId);
  const tileId = Number.isInteger(rawTileId) && rawTileId > 0 ? rawTileId : null;

  // Two full, literal queries rather than a dynamically-composed ORDER BY —
  // Postgres can't parameterize which column to sort by, and the `sql`
  // tagged template executes eagerly (it's not a lazy fragment builder), so
  // a shared partial template can't be embedded in either. Default groups by
  // tile then team (so an admin can compare every submission on the same
  // tile+team together, the unit that actually matters for spotting
  // duplicates); `sort=oldest` ignores grouping for "clear the backlog in
  // the order it arrived," useful right after a launch-day submission rush.
  const rows =
    req.query.sort === "oldest"
      ? await sql`
        SELECT s.id, s.status, s.proof_url, s.created_at, s.item_id,
               s.team_id, s.tile_id,
               t.name AS team_name, ti.name AS tile_name, ti.icon_url,
               ti.item_ids,
               ti.require_unique_items, ti.item_requirements
        FROM submissions s
        JOIN teams t ON t.id = s.team_id
        JOIN tiles ti ON ti.id = s.tile_id
        LEFT JOIN users u ON u.id = s.submitted_by
        WHERE s.status = ${status}
          AND (${teamId}::bigint IS NULL OR s.team_id = ${teamId})
          AND (${tileId}::bigint IS NULL OR s.tile_id = ${tileId})
        ORDER BY s.created_at ASC, s.id ASC`
      : await sql`
        SELECT s.id, s.status, s.proof_url, s.created_at, s.item_id,
               s.team_id, s.tile_id,
               t.name AS team_name, ti.name AS tile_name, ti.icon_url,
               ti.item_ids,
               ti.require_unique_items, ti.item_requirements
        FROM submissions s
        JOIN teams t ON t.id = s.team_id
        JOIN tiles ti ON ti.id = s.tile_id
        LEFT JOIN users u ON u.id = s.submitted_by
        WHERE s.status = ${status}
          AND (${teamId}::bigint IS NULL OR s.team_id = ${teamId})
          AND (${tileId}::bigint IS NULL OR s.tile_id = ${tileId})
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

  // For item_requirements tiles (see db/schema.sql), the reviewer needs the
  // full per-item/per-group picture — which items are already at their
  // required amount, and which "OR" set (if any) is closest to done — not
  // just a flat approved-ids list. Computed once per distinct team+tile pair
  // actually present in this result (admin review is low-frequency and
  // human-paced, unlike the plugin poll/board endpoints, so a handful of
  // extra queries here is fine).
  const itemRequirementsStatusByTeamTile = new Map<string, ItemRequirementsStatus>();
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.team_id}:${r.tile_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const reqs = parseItemRequirements(r.item_requirements);
    if (!reqs) continue;
    itemRequirementsStatusByTeamTile.set(
      key,
      await checkItemRequirements(r.team_id, r.tile_id, reqs),
    );
  }

  res.status(200).json({
    submissions: rows.map((r) => {
      const key = `${r.team_id}:${r.tile_id}`;
      return {
        id: r.id,
        status: r.status,
        proofUrl: r.proof_url,
        teamId: r.team_id,
        tileId: r.tile_id,
        teamName: r.team_name,
        tileName: r.tile_name,
        iconUrl: deriveTileIconUrl({
          itemIds: (r.item_ids ?? []) as number[],
          goalKind: "item",
          goalKey: "",
          legacyIconUrl: r.icon_url ?? "",
        }),
        requireUniqueItems: r.require_unique_items,
        // Only ever set once someone (the plugin automatically, or an admin by
        // hand during review) has recorded which item this submission shows.
        itemId: r.item_id,
        alreadyApprovedItemIds: approvedByTeamTile.get(key) ?? [],
        // Present only for tiles using the richer item_requirements model —
        // null for every tile still on the flat item_ids/required_count model.
        itemRequirementsStatus: itemRequirementsStatusByTeamTile.get(key) ?? null,
        submittedBy:
          r.runescape_name ??
          r.discord_global_name ??
          r.discord_username ??
          "Unknown",
        createdAt: r.created_at,
      };
    }),
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
        s.item_id AS submission_item_id,
        t.require_unique_items,
        t.item_requirements,
        COUNT(*) FILTER (WHERE s2.status = 'approved')::int AS approved_count,
        t.required_count
      FROM submissions s
      JOIN submissions s2 ON s2.team_id = s.team_id AND s2.tile_id = s.tile_id
      JOIN tiles t ON t.id = s.tile_id
      WHERE s.id = ${id}
      GROUP BY s.team_id, s.tile_id, s.item_id, t.require_unique_items,
               t.item_requirements, t.required_count`;

    const capRow = capRows[0];
    const itemRequirements = capRow ? parseItemRequirements(capRow.item_requirements) : null;

    if (capRow && itemRequirements) {
      // Effective item id: what this review call is tagging it as, or (a plugin
      // submission, or one already tagged in an earlier review pass) what it
      // already carries.
      const effectiveItemId = itemId ?? capRow.submission_item_id;
      if (effectiveItemId == null) {
        res.status(400).json({ error: "itemId is required to approve this tile" });
        return;
      }
      const requirement = itemRequirements.find((r) => r.itemId === effectiveItemId);
      if (!requirement) {
        res.status(400).json({ error: "That item does not satisfy the requested tile" });
        return;
      }
      // Excludes this row itself (still 'pending' at this point, so it would
      // otherwise count against its own cap) — see checkItemRequirements.
      // Deliberately does not reject once reqStatus.complete: a tile that is
      // already done via one group (e.g. a single-item "Set B") cannot be
      // made any less done by approving a genuine drop for another group
      // ("Set A") that happened to arrive afterward. Blocking that outright
      // used to throw away real contributions with no way to record them —
      // approving here can only ever add credit, never un-complete anything,
      // so there is no actual harm in letting it through.
      const reqStatus = await checkItemRequirements(
        capRow.team_id,
        capRow.tile_id,
        itemRequirements,
        id,
      );
      const itemStatus = reqStatus.perItem.find((i) => i.itemId === effectiveItemId)!;
      if (itemStatus.currentAmount >= itemStatus.requiredAmount) {
        res.status(409).json({
          error: `${requirement.name} already at required amount (${requirement.requiredAmount})`,
        });
        return;
      }
    } else if (capRow && capRow.approved_count >= capRow.required_count) {
      res.status(409).json({ error: "That tile is already complete" });
      return;
    } else if (capRow?.require_unique_items && itemId !== undefined) {
      // Same rule the RuneLite plugin enforces automatically at submit time —
      // applied here too so a manually-tagged item id gets the same protection
      // a plugin submission always had.
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
    // An approval or rejection moves a tile, so every plugin holding a board
    // needs to learn it has changed. See _lib/board-marker.ts.
    await publishBoardMarker();
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
});
