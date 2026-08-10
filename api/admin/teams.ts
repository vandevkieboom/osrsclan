import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

// Matches api/board.ts's ACCENT_PALETTE — used only to pick a sensible
// default color for a brand-new team; admins can recolor it afterward.
const ACCENT_PALETTE = ["#e8574a", "#5b9bd5", "#ffb340", "#3fae5c", "#c9c9c9", "#a76ee8"];
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function listTeams(res: VercelResponse) {
  const rows = await sql`
    SELECT t.id, t.name, t.slug, t.accent_color, t.captain_id,
           cap.discord_username AS captain_username, cap.discord_global_name AS captain_global_name,
           cap.runescape_name AS captain_rsn,
           COUNT(u.id)::int AS member_count
    FROM teams t
    LEFT JOIN users u ON u.team_id = t.id
    LEFT JOIN users cap ON cap.id = t.captain_id
    GROUP BY t.id, cap.id
    ORDER BY t.name`;
  res.status(200).json({
    teams: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      accentColor: r.accent_color,
      memberCount: r.member_count,
      captainId: r.captain_id,
      captainName: r.captain_id
        ? (r.captain_rsn ?? r.captain_global_name ?? r.captain_username ?? null)
        : null,
    })),
  });
}

async function createTeam(req: VercelRequest, res: VercelResponse) {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "Team name is required" });
    return;
  }
  const slug = slugify(name);
  try {
    const countRows = await sql`SELECT COUNT(*)::int AS count FROM teams`;
    const accentColor = ACCENT_PALETTE[countRows[0].count % ACCENT_PALETTE.length];
    const rows = await sql`
      INSERT INTO teams (name, slug, accent_color)
      VALUES (${name}, ${slug}, ${accentColor})
      RETURNING id, name, slug, accent_color`;
    res.status(201).json({
      team: {
        id: rows[0].id,
        name: rows[0].name,
        slug: rows[0].slug,
        accentColor: rows[0].accent_color,
        memberCount: 0,
        captainId: null,
        captainName: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("duplicate key")) {
      res.status(409).json({ error: "A team with that name already exists" });
      return;
    }
    res.status(500).json({ error: "Failed to create team" });
  }
}

async function updateTeam(req: VercelRequest, res: VercelResponse) {
  const id = Number(req.body?.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  const hasName = typeof req.body?.name === "string";
  const hasColor = typeof req.body?.accentColor === "string";
  const hasCaptain = "captainId" in (req.body ?? {});
  if (!hasName && !hasColor && !hasCaptain) {
    res.status(400).json({ error: "name, accentColor, or captainId is required" });
    return;
  }

  const name = hasName ? req.body.name.trim() : null;
  if (hasName && !name) {
    res.status(400).json({ error: "name cannot be empty" });
    return;
  }
  const accentColor = hasColor ? req.body.accentColor.trim() : null;
  if (hasColor && !HEX_COLOR_RE.test(accentColor)) {
    res.status(400).json({ error: "accentColor must be a hex color like #e8574a" });
    return;
  }

  let captainId: number | null = null;
  if (hasCaptain) {
    const raw = req.body.captainId;
    captainId = raw === null || raw === undefined ? null : Number(raw);
    if (captainId !== null) {
      if (!Number.isInteger(captainId)) {
        res.status(400).json({ error: "Invalid captainId" });
        return;
      }
      const memberRows = await sql`SELECT team_id FROM users WHERE id = ${captainId}`;
      // team_id is BIGINT — the driver returns it as a string, not a number,
      // so this must be coerced before comparing against `id` or it never matches.
      if (memberRows.length === 0 || Number(memberRows[0].team_id) !== id) {
        res.status(400).json({ error: "Captain must be a member of this team" });
        return;
      }
    }
  }

  try {
    const rows = hasCaptain
      ? await sql`
          UPDATE teams SET
            name = COALESCE(${name}, name),
            slug = COALESCE(${name ? slugify(name) : null}, slug),
            accent_color = COALESCE(${accentColor}, accent_color),
            captain_id = ${captainId}
          WHERE id = ${id}
          RETURNING id, name, slug, accent_color, captain_id`
      : await sql`
          UPDATE teams SET
            name = COALESCE(${name}, name),
            slug = COALESCE(${name ? slugify(name) : null}, slug),
            accent_color = COALESCE(${accentColor}, accent_color)
          WHERE id = ${id}
          RETURNING id, name, slug, accent_color, captain_id`;
    if (rows.length === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    const t = rows[0];
    let captainName: string | null = null;
    if (t.captain_id) {
      const capRows = await sql`
        SELECT discord_username, discord_global_name, runescape_name FROM users WHERE id = ${t.captain_id}`;
      const c = capRows[0];
      captainName = c ? (c.runescape_name ?? c.discord_global_name ?? c.discord_username) : null;
    }
    res.status(200).json({
      team: {
        id: t.id,
        name: t.name,
        slug: t.slug,
        accentColor: t.accent_color,
        captainId: t.captain_id,
        captainName,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("duplicate key")) {
      res.status(409).json({ error: "A team with that name already exists" });
      return;
    }
    res.status(500).json({ error: "Failed to update team" });
  }
}

async function deleteTeam(req: VercelRequest, res: VercelResponse) {
  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await sql`DELETE FROM teams WHERE id = ${id}`;
  res.status(200).json({ ok: true });
}

async function listUsers(res: VercelResponse) {
  const rows = await sql`
    SELECT u.id, u.discord_id, u.discord_username, u.discord_global_name, u.discord_avatar_hash,
           u.is_admin, u.team_id, u.runescape_name, t.name AS team_name
    FROM users u
    LEFT JOIN teams t ON t.id = u.team_id
    ORDER BY u.discord_username`;

  res.status(200).json({
    users: rows.map((r) => ({
      id: r.id,
      username: r.discord_username,
      globalName: r.discord_global_name,
      runescapeName: r.runescape_name,
      avatarUrl: r.discord_avatar_hash
        ? `https://cdn.discordapp.com/avatars/${r.discord_id}/${r.discord_avatar_hash}.png?size=32`
        : null,
      isAdmin: r.is_admin,
      team: r.team_id ? { id: r.team_id, name: r.team_name } : null,
    })),
  });
}

async function assignTeam(req: VercelRequest, res: VercelResponse) {
  const userId = Number(req.body?.userId);
  const teamIdRaw = req.body?.teamId;
  const teamId = teamIdRaw === null || teamIdRaw === undefined ? null : Number(teamIdRaw);

  if (!Number.isInteger(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }
  if (teamId !== null && !Number.isInteger(teamId)) {
    res.status(400).json({ error: "Invalid teamId" });
    return;
  }

  const rows = await sql`
    UPDATE users SET team_id = ${teamId} WHERE id = ${userId}
    RETURNING id, team_id`;

  if (rows.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // If this member captained a different team, moving them off it would
  // leave that team pointing at a captain who's no longer on the roster.
  await sql`UPDATE teams SET captain_id = NULL WHERE captain_id = ${userId} AND id IS DISTINCT FROM ${teamId}`;

  res.status(200).json({ userId: rows[0].id, teamId: rows[0].team_id });
}

// Donations are tracked by free-text name rather than a users.id FK — not
// every clan member has ever logged into the site, so tying a donation to a
// registered account would hide anyone who hasn't.
async function listDonations(res: VercelResponse) {
  const rows = await sql`SELECT id, name, amount_gp FROM donations ORDER BY amount_gp DESC, name ASC`;
  res.status(200).json({
    donations: rows.map((r) => ({ id: r.id, name: r.name, amountGp: Number(r.amount_gp) })),
  });
}

async function addDonation(req: VercelRequest, res: VercelResponse) {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const amountGp = Number(req.body?.amountGp);
  if (!name || !Number.isInteger(amountGp) || amountGp < 0) {
    res.status(400).json({ error: "name and a non-negative integer amountGp are required" });
    return;
  }
  const rows = await sql`
    INSERT INTO donations (name, amount_gp) VALUES (${name}, ${amountGp})
    RETURNING id, name, amount_gp`;
  const d = rows[0];
  res.status(201).json({ donation: { id: d.id, name: d.name, amountGp: Number(d.amount_gp) } });
}

async function updateDonation(req: VercelRequest, res: VercelResponse) {
  const id = Number(req.body?.id);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const amountGp = Number(req.body?.amountGp);
  if (!Number.isInteger(id) || !name || !Number.isInteger(amountGp) || amountGp < 0) {
    res.status(400).json({ error: "id, name, and a non-negative integer amountGp are required" });
    return;
  }
  const rows = await sql`
    UPDATE donations SET name = ${name}, amount_gp = ${amountGp} WHERE id = ${id}
    RETURNING id, name, amount_gp`;
  if (rows.length === 0) {
    res.status(404).json({ error: "Donation not found" });
    return;
  }
  const d = rows[0];
  res.status(200).json({ donation: { id: d.id, name: d.name, amountGp: Number(d.amount_gp) } });
}

async function deleteDonation(req: VercelRequest, res: VercelResponse) {
  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await sql`DELETE FROM donations WHERE id = ${id}`;
  res.status(200).json({ ok: true });
}

// Teams, users, team-assignment, and donations are combined into one
// function — the Vercel Hobby plan caps a deployment at 12 serverless
// functions total, and this project already needed all of auth + board +
// the legacy WOM/RuneProfile proxies, so closely-related admin endpoints
// share a file dispatched by `resource`/method the same way
// api/wom-proxy.ts dispatches on `type`.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return;

  const resource = req.query.resource;

  if (req.method === "GET") {
    if (resource === "users") {
      await listUsers(res);
      return;
    }
    if (resource === "donations") {
      await listDonations(res);
      return;
    }
    await listTeams(res);
    return;
  }

  if (req.method === "POST") {
    if (resource === "assign") {
      await assignTeam(req, res);
      return;
    }
    if (resource === "donations") {
      await addDonation(req, res);
      return;
    }
    await createTeam(req, res);
    return;
  }

  if (req.method === "PUT") {
    if (resource === "donations") {
      await updateDonation(req, res);
      return;
    }
    await updateTeam(req, res);
    return;
  }

  if (req.method === "DELETE") {
    if (resource === "donations") {
      await deleteDonation(req, res);
      return;
    }
    await deleteTeam(req, res);
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
