import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { put } from "@vercel/blob";
import { sql } from "./_lib/db.js";
import {
  getRequestUser,
  requireRequestUser,
  requireUser,
} from "./_lib/auth.js";
import {
  evaluateItemRequirements,
  getBoardConfigMemoised,
  getOrCreateBoardConfig,
  getTeamGoalProgress,
  maybeReconcileGoalProgress,
  parseItemRequirements,
  recordProofSubmission,
  validateProofSubmission,
} from "./_lib/board.js";
import { deriveTileIconUrl } from "./_lib/icons.js";
import { withErrorHandling } from "./_lib/handler.js";

// Bounded rather than trusted: a typo here should not be able to render the
// board on every single request, nor to freeze it for an hour.
const BOARD_CACHE_SECONDS = (() => {
  const parsed = Number(process.env.BOARD_CACHE_SECONDS);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(300, Math.max(5, Math.round(parsed)));
})();

const BOARD_CACHE_CONTROL = `s-maxage=${BOARD_CACHE_SECONDS}, stale-while-revalidate=${BOARD_CACHE_SECONDS * 3}`;

const PROOF_CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// Unlike the browser's upload (which streams straight to Blob storage and so
// allows 8MB), plugin uploads pass through this function, and Vercel caps a
// function's request body at ~4.5MB. Stay clearly under that.
const MAX_PLUGIN_PROOF_BYTES = 4 * 1024 * 1024;

/**
 * The full board: every team's tiles, rosters, progress and submissions.
 *
 * This is by far the most expensive response the site produces — five
 * queries and a payload of a hundred kilobytes or more once an event has
 * real submissions on it — and during an event every online plugin wants it
 * again every time anything changes. One person's drop therefore used to
 * cost one full board render *per online member*, which is the wrong shape
 * entirely: the answer is the same for all of them.
 *
 * So it is now byte-identical for every caller and edge-cached. It carries no
 * `myTeamId` and reads no session, which is what makes one cached copy able
 * to serve the whole clan: a single origin render now answers everybody for
 * the length of the cache window instead of being repeated per member. Nothing
 * became more public in the process — this endpoint never required
 * authentication and every team's board was already readable by anyone.
 *
 * Callers that need to know which team is *theirs* ask for it separately and
 * rarely: the website already has it on the session user
 * (`useAuth().user.team`), and the plugin fetches `?resource=my-team` once a
 * session. That is a handful of tiny requests against many large ones.
 */
async function getBoard(res: VercelResponse, slim: boolean) {
  // Short enough that a teammate's drop still lands on everyone's board
  // within about the same minute the plugin would have noticed it anyway,
  // long enough to collapse the simultaneous refetch that a single change
  // triggers across every online member.
  //
  // An environment variable rather than a constant because this is the single
  // most expensive response the site produces, and if compute ever runs hot
  // mid-event this is the fastest thing to turn down - no deploy, no plugin
  // release, effective on the next request. Raising it trades board freshness
  // for compute directly: at double the window the site renders the board half
  // as often.
  res.setHeader("Cache-Control", BOARD_CACHE_CONTROL);

  const config = await getOrCreateBoardConfig();
  const slotCount = config.size * config.size;

  // A bingo board is always size x size — tiles beyond that (left over from
  // a larger board that got shrunk) stay in the database but drop off the
  // board until size grows back to cover them again.
  const tileRows = await sql`
    SELECT id, position, name, icon_url, required_count, category, description,
           item_ids, goal_kind, goal_key, goal_target, icon_item_id, item_requirements
    FROM tiles WHERE position < ${slotCount} ORDER BY position`;
  const tiles = tileRows.map((t) => {
    const itemIds = (t.item_ids ?? []) as number[];
    const goalKind = t.goal_kind as "item" | "xp" | "kc";
    const goalKey = t.goal_key as string;
    const iconItemId = t.icon_item_id === null ? null : Number(t.icon_item_id);
    return {
      id: t.id,
      position: t.position,
      name: t.name,
      iconUrl: deriveTileIconUrl({
        iconItemId,
        itemIds,
        goalKind,
        goalKey,
        legacyIconUrl: t.icon_url ?? "",
      }),
      requiredCount: t.required_count,
      category: t.category,
      description: t.description,
      itemIds,
      goalKind,
      goalKey,
      goalTarget: t.goal_target === null ? null : Number(t.goal_target),
      iconItemId,
      itemRequirements: parseItemRequirements(t.item_requirements),
    };
  });

  // Only fetched/summed when at least one tile actually needs it — most
  // boards are item-only and this avoids the extra query and join for them.
  // The reconcile pass runs first (throttled — see maybeReconcileGoalProgress)
  // so a correction it makes shows up in this same response instead of
  // waiting for the next request.
  //
  // The plugin poll endpoint now triggers this too, and is the *primary*
  // trigger — it runs unconditionally, whereas this fetch only happens when
  // the board has changed, and this pass is itself one of the things that
  // changes it. Keeping it here as well costs one throttled row read and
  // covers the case the poll endpoint can't: somebody opening the bingo page
  // in a browser at a moment when no plugin anywhere is online to have kept
  // the numbers current.
  const hasGoalTiles = tiles.some((t) => t.goalKind !== "item");
  if (hasGoalTiles) {
    try {
      await maybeReconcileGoalProgress();
    } catch (err) {
      // A WOM hiccup should never take the board down with it — this pass
      // just gets retried on a later request.
      console.error("goal-progress reconciliation failed:", err);
    }
  }
  const goalProgressByGoal = hasGoalTiles
    ? await getTeamGoalProgress()
    : new Map<string, Map<number, number>>();
  function teamProgressFor(tile: (typeof tiles)[number], teamId: number) {
    return (
      goalProgressByGoal
        .get(`${tile.goalKind}:${tile.goalKey.trim().toLowerCase()}`)
        ?.get(teamId) ?? 0
    );
  }

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
    SELECT s.id, s.team_id, s.tile_id, s.status, s.proof_url, s.created_at, s.item_id,
           u.discord_global_name, u.discord_username, u.runescape_name,
           u.discord_id, u.discord_avatar_hash
    FROM submissions s
    LEFT JOIN users u ON u.id = s.submitted_by
    WHERE s.team_id IN (SELECT id FROM teams)
    ORDER BY s.created_at ASC, s.id ASC`;

  // Per-item counts backing item_requirements tiles' completion check below —
  // built from the same submissionRows already fetched for the aggregate
  // above, not a separate query per team+tile (this endpoint is edge-cached
  // and shared by the whole clan; see the hosting-cost notes in this
  // project's CLAUDE.md on why it stays a fixed number of queries).
  const itemCountsByTeamTile = new Map<string, Map<number, number>>();
  for (const row of submissionRows) {
    if (row.item_id == null || row.status !== "approved") {
      continue;
    }
    const key = `${row.team_id}:${row.tile_id}`;
    const byItem = itemCountsByTeamTile.get(key) ?? new Map<number, number>();
    byItem.set(row.item_id, (byItem.get(row.item_id) ?? 0) + 1);
    itemCountsByTeamTile.set(key, byItem);
  }

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

  const submissionsByTeam = new Map<
    number,
    Map<number, TileSubmissionAggregate>
  >();
  for (const row of submissionRows) {
    const teamSubmissions =
      submissionsByTeam.get(row.team_id) ??
      new Map<number, TileSubmissionAggregate>();
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
    current.latestSubmittedBy =
      row.runescape_name ??
      row.discord_global_name ??
      row.discord_username ??
      null;
    current.proofs.push({
      id: row.id,
      status: row.status,
      proofUrl: row.proof_url,
      submittedBy:
        row.runescape_name ??
        row.discord_global_name ??
        row.discord_username ??
        null,
      submittedByAvatarUrl:
        row.discord_id && row.discord_avatar_hash
          ? `https://cdn.discordapp.com/avatars/${row.discord_id}/${row.discord_avatar_hash}.png?size=64`
          : null,
      createdAt: row.created_at,
    });

    teamSubmissions.set(row.tile_id, current);
    submissionsByTeam.set(row.team_id, teamSubmissions);
  }

  // Item tiles go through the submissions/proof-review pipeline;
  // xp/kc tiles have no proof to review and complete the instant the
  // server-computed team total (see teamProgressFor) crosses the goal.
  function buildTiles(teamId: number) {
    const subByTile =
      submissionsByTeam.get(teamId) ??
      new Map<number, TileSubmissionAggregate>();
    return tiles.map((t) => {
      if (t.goalKind !== "item") {
        const teamProgress = teamProgressFor(t, teamId);
        return {
          tileId: t.id,
          position: t.position,
          name: t.name,
          iconUrl: t.iconUrl,
          requiredCount: t.requiredCount,
          category: t.category,
          description: t.description,
          itemIds: t.itemIds,
          goalKind: t.goalKind,
          goalKey: t.goalKey,
          goalTarget: t.goalTarget,
          iconItemId: t.iconItemId,
          itemRequirementsStatus: null,
          teamProgress,
          approvedCount: 0,
          pendingCount: 0,
          rejectedCount: 0,
          status:
            t.goalTarget !== null && teamProgress >= t.goalTarget
              ? "approved"
              : "none",
          latestProofUrl: null,
          latestSubmittedBy: null,
          proofs: [],
        };
      }

      const agg = subByTile.get(t.id);
      const approvedCount = agg?.approvedCount ?? 0;
      const pendingCount = agg?.pendingCount ?? 0;
      const rejectedCount = agg?.rejectedCount ?? 0;
      // item_requirements tiles (AND/OR item conditions — see db/schema.sql)
      // decide completeness per-item/per-group rather than a flat approved
      // count; every other tile keeps the count-based check exactly as
      // before.
      const itemRequirementsStatus = t.itemRequirements
        ? evaluateItemRequirements(
            t.itemRequirements,
            itemCountsByTeamTile.get(`${teamId}:${t.id}`) ?? new Map(),
          )
        : null;
      const isComplete = itemRequirementsStatus
        ? itemRequirementsStatus.complete
        : approvedCount >= t.requiredCount;
      return {
        tileId: t.id,
        position: t.position,
        name: t.name,
        iconUrl: t.iconUrl,
        requiredCount: t.requiredCount,
        category: t.category,
        description: t.description,
        itemIds: t.itemIds,
        goalKind: t.goalKind,
        goalKey: t.goalKey,
        goalTarget: t.goalTarget,
        iconItemId: t.iconItemId,
        itemRequirementsStatus,
        teamProgress: null,
        approvedCount,
        pendingCount,
        rejectedCount,
        status: isComplete
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

  const tilesByTeam = new Map(teamRows.map((t) => [t.id, buildTiles(t.id)]));
  const totalTiles = tiles.length;
  const teamsWithPct = teamRows.map((t) => {
    const completeCount = (tilesByTeam.get(t.id) ?? []).filter(
      (tile) => tile.status === "approved",
    ).length;
    const pct =
      totalTiles > 0 ? Math.round((completeCount / totalTiles) * 100) : 0;
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
      tiles: tilesByTeam.get(t.id) ?? [],
    };
  });
  const leaderPct =
    teamsWithPct.length > 0 ? Math.max(...teamsWithPct.map((t) => t.pct)) : 0;
  const teams = teamsWithPct.map((t) => ({
    ...t,
    isLeading: t.pct === leaderPct && leaderPct > 0,
  }));

  res.status(200).json({
    config: {
      name: config.name,
      size: config.size,
    },
    // The stamp this particular render corresponds to, so a caller can record
    // what it actually received rather than what it expected to receive.
    //
    // Without it there is a race: the plugin learns a new stamp from the poll
    // endpoint, asks for the board, and gets a cached copy rendered *just*
    // before the change — then files it under the new stamp and, seeing that
    // same stamp on every later poll, never corrects itself. A board stuck one
    // change behind, indefinitely. Echoing the stamp closes it: a stale copy
    // arrives carrying its own older stamp, still doesn't match the poll's,
    // and gets re-fetched on the next tick.
    boardChangedAt: config.board_changed_at,
    teams: slim ? teams.map(slimTeam) : teams,
    // Always null: see this function's doc. Kept in the payload so older
    // plugin builds, which read it, get a defined value rather than a
    // missing field.
    myTeamId: null,
  });
}

/**
 * The board with everything the RuneLite plugin doesn't read stripped out.
 *
 * The plugin's own parser already ignores these fields — it just wasn't
 * stopping the site from sending them. That is not free: the heavy part of a
 * board response is the per-proof detail (a blob URL and a Discord avatar URL
 * are each about a hundred characters, and there is one set per proof, per
 * tile, per team), and during an event that response goes out again on every
 * change, to everyone. Dropping what nobody reads takes the payload down by
 * most of its size for exactly zero behaviour change.
 *
 * Kept deliberately as a projection of the full response rather than a second
 * query path: there is then no way for the two to disagree about a tile's
 * status or a team's standing, which is the failure that would actually
 * matter.
 */
function slimTeam(team: {
  id: number;
  name: string;
  accentColor: string | null;
  completeCount: number;
  totalTiles: number;
  pct: number;
  isLeading: boolean;
  tiles: ReturnType<typeof buildSlimTile>[] | unknown[];
}) {
  return {
    id: team.id,
    name: team.name,
    accentColor: team.accentColor,
    completeCount: team.completeCount,
    totalTiles: team.totalTiles,
    pct: team.pct,
    isLeading: team.isLeading,
    tiles: (team.tiles as Parameters<typeof buildSlimTile>[0][]).map(
      buildSlimTile,
    ),
  };
}

function buildSlimTile(tile: {
  tileId: number;
  position: number;
  name: string;
  requiredCount: number;
  approvedCount: number;
  pendingCount: number;
  status: string;
  itemIds: number[];
  goalKind: string;
  goalKey: string;
  goalTarget: number | null;
  iconItemId: number | null;
  teamProgress: number | null;
}) {
  return {
    tileId: tile.tileId,
    position: tile.position,
    name: tile.name,
    requiredCount: tile.requiredCount,
    approvedCount: tile.approvedCount,
    pendingCount: tile.pendingCount,
    status: tile.status,
    itemIds: tile.itemIds,
    goalKind: tile.goalKind,
    goalKey: tile.goalKey,
    goalTarget: tile.goalTarget,
    // The plugin prefers this over itemIds[0] for its icon — see
    // api/_lib/icons.ts. Previously dropped here, so the admin-set override
    // never actually reached the RuneLite client despite working on the
    // website's own board view.
    iconItemId: tile.iconItemId,
    teamProgress: tile.teamProgress,
  };
}

/**
 * Which team the caller is on — the one genuinely per-member thing the board
 * response used to carry, split out so the board itself can be cached once
 * for everybody.
 *
 * Tiny and uncacheable by nature, but also asked for very rarely: the plugin
 * fetches it on startup, on an API key change, and then at most every half
 * hour. Team assignment happens before an event rather than during one, so
 * that is comfortably prompt.
 */
async function getMyTeam(req: VercelRequest, res: VercelResponse) {
  const user = await getRequestUser(req);
  res.status(200).json({ teamId: user?.teamId ?? null });
}

/**
 * A deliberately tiny, cheap, public check for "is a bingo event running
 * right now" — the plugin polls this every minute regardless of whether
 * bingo is active, so it needs to cost almost nothing (unlike getBoard,
 * which queries tiles/teams/submissions and can't be blanket-cached since
 * its response is personalized per viewer via myTeamId). Cached at the
 * edge for 30s: this is what lets the plugin check every minute for
 * practically free, rather than needing to slow down or back off polling
 * this specific check to control cost.
 */
/**
 * Superseded by GET /api/plugin-poll, which carries the same two fields.
 * Kept for plugin installs that haven't updated yet — they'll keep polling
 * this until they do.
 *
 * Cache header is set before the read and the read can no longer produce a
 * 5xx, because Vercel's edge won't cache an error response: an endpoint this
 * heavily polled that starts failing stops absorbing traffic at precisely
 * the moment it needs to most, and every polling client is promoted to a
 * real function invocation. See api/plugin-poll.ts.
 */
async function getBingoStatus(res: VercelResponse) {
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=90");
  const { row } = await getBoardConfigMemoised();
  res.status(200).json({
    bingoActive: row?.bingo_active ?? false,
    boardChangedAt: row?.board_changed_at ?? null,
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
  const proofUrl =
    typeof req.body?.proofUrl === "string" ? req.body.proofUrl : "";
  if (!Number.isInteger(tileId) || !proofUrl) {
    res.status(400).json({ error: "tileId and proofUrl are required" });
    return;
  }
  // Only meaningful for a tile using item_requirements (or the older
  // require_unique_items) — the browser form only sends this when the tile
  // actually asked for it (see TileDetailPanel); every other manual upload
  // omits it exactly as before.
  const rawItemId = Number(req.body?.itemId);
  const itemId = Number.isInteger(rawItemId) && rawItemId > 0 ? rawItemId : undefined;

  const validation = await validateProofSubmission({ teamId: user.teamId, tileId, itemId });
  if (!validation.ok) {
    res.status(validation.status).json({ error: validation.error });
    return;
  }

  await recordProofSubmission({
    teamId: user.teamId,
    tileId,
    proofUrl,
    submittedBy: user.id,
    itemId,
  });

  res.status(200).json({ ok: true });
}

/**
 * The RuneLite plugin's proof upload. Unlike the browser flow (which gets a
 * client token and streams the image straight to Blob storage), a plugin just
 * POSTs the raw bytes here and this function stores them.
 *
 * POST /api/board?resource=plugin-proof&tileId=<id>&contentType=image/png
 *   Authorization: Bearer <plugin token>
 *   Content-Type: application/octet-stream   <- required, see below
 *   body: raw image bytes
 *
 * The real image type travels in the `contentType` query param because
 * @vercel/node only exposes req.body as a Buffer for
 * `application/octet-stream`; sending `image/png` as the literal Content-Type
 * leaves req.body undefined.
 */
async function submitPluginProof(req: VercelRequest, res: VercelResponse) {
  const user = await requireRequestUser(req, res);
  if (!user) return;

  if (!user.teamId) {
    res.status(400).json({ error: "You are not assigned to a team yet" });
    return;
  }

  const tileId = Number(req.query.tileId);
  if (!Number.isInteger(tileId)) {
    res.status(400).json({ error: "A valid tileId query param is required" });
    return;
  }

  const contentType = String(req.query.contentType ?? "");
  const extension = PROOF_CONTENT_TYPES[contentType];
  if (!extension) {
    res.status(400).json({
      error: `contentType must be one of ${Object.keys(PROOF_CONTENT_TYPES).join(", ")}`,
    });
    return;
  }

  const body: unknown = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({
      error:
        "Request body must be raw image bytes sent as application/octet-stream",
    });
    return;
  }
  if (body.length > MAX_PLUGIN_PROOF_BYTES) {
    res.status(413).json({
      error: `Screenshot is too large (max ${MAX_PLUGIN_PROOF_BYTES / (1024 * 1024)}MB)`,
    });
    return;
  }

  // Validate everything (tile exists, item matches, unique-item and
  // required-count rules) before uploading: catching a rejection only after
  // the upload would leave an orphaned blob behind for no reason.
  const reportedItemId = Number(req.query.itemId);
  const itemId = Number.isInteger(reportedItemId) ? reportedItemId : undefined;

  const validation = await validateProofSubmission({
    teamId: user.teamId,
    tileId,
    itemId,
  });
  if (!validation.ok) {
    res.status(validation.status).json({ error: validation.error });
    return;
  }

  let blob: Awaited<ReturnType<typeof put>>;
  try {
    blob = await put(`proofs/plugin-${tileId}.${extension}`, body, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
  } catch (err) {
    // Without this the plugin gets an opaque FUNCTION_INVOCATION_FAILED 500
    // and no way to tell a transient storage failure from a bad request.
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to store screenshot",
    });
    return;
  }

  await recordProofSubmission({
    teamId: user.teamId,
    tileId,
    proofUrl: blob.url,
    submittedBy: user.id,
    itemId,
  });

  res.status(200).json({ ok: true, proofUrl: blob.url });
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
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
}

// Reading the board (incl. the public donor leaderboard), submitting a
// tile, the Blob upload-token handshake, and the RuneLite plugin's direct
// proof upload are combined into one function to stay under the Vercel Hobby
// plan's 12-function-per-deployment cap.
// Vercel Blob's client SDK always posts a `type` field (e.g.
// "blob.generate-client-token"); our own submit body never has one, so
// that's what distinguishes those two POST actions. The plugin upload is
// picked out first by its explicit `resource` query param, since its body is
// raw bytes rather than JSON.
export default withErrorHandling(async function handler(req, res) {
  if (req.method === "GET") {
    if (req.query.resource === "donors") {
      await getDonors(res);
    } else if (req.query.resource === "status") {
      await getBingoStatus(res);
    } else if (req.query.resource === "my-team") {
      await getMyTeam(req, res);
    } else {
      // A separate cache entry from the full board, which is fine: two origin
      // renders per cache window instead of one, against a payload several
      // times smaller for every plugin in the clan.
      await getBoard(res, req.query.view === "plugin");
    }
    return;
  }

  if (req.method === "POST") {
    if (req.query.resource === "plugin-proof") {
      await submitPluginProof(req, res);
    } else if (typeof req.body?.type === "string") {
      await uploadToken(req, res);
    } else {
      await submitTile(req, res);
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
});
