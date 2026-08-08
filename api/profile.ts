import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import { requireAdmin } from "./_lib/auth.js";

const MAX_LABEL_LENGTH = 120;
const MAX_DATE_LABEL_LENGTH = 40;

// Trophies are keyed by lowercased RSN rather than user id — a profile (and
// thus its trophy case) can be looked up for any RSN in the WOM group, not
// just ones with a linked Discord/site account. Trophies represent event
// wins awarded by the clan, so only admins can add or remove them — not the
// profile's own account.
async function listTrophies(req: VercelRequest, res: VercelResponse) {
  const rsn = typeof req.query.rsn === "string" ? req.query.rsn.trim() : "";
  if (!rsn) {
    res.status(400).json({ error: "rsn is required" });
    return;
  }
  const rsnKey = rsn.toLowerCase();

  const [trophyRows, memberRows] = await Promise.all([
    sql`SELECT id, label, date_label, created_at FROM trophies WHERE rsn_key = ${rsnKey} ORDER BY created_at DESC`,
    sql`SELECT created_at, discord_id, discord_avatar_hash FROM users WHERE lower(runescape_name) = ${rsnKey} LIMIT 1`,
  ]);
  const member = memberRows[0];

  res.status(200).json({
    trophies: trophyRows.map((r) => ({ id: r.id, label: r.label, date: r.date_label, createdAt: r.created_at })),
    memberSince: member?.created_at ?? null,
    avatarUrl:
      member?.discord_id && member?.discord_avatar_hash
        ? `https://cdn.discordapp.com/avatars/${member.discord_id}/${member.discord_avatar_hash}.png?size=64`
        : null,
  });
}

async function addTrophy(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const rsn = typeof req.body?.rsn === "string" ? req.body.rsn.trim() : "";
  const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";
  const date = typeof req.body?.date === "string" ? req.body.date.trim() : "";
  if (!rsn || !label) {
    res.status(400).json({ error: "rsn and label are required" });
    return;
  }
  if (label.length > MAX_LABEL_LENGTH || date.length > MAX_DATE_LABEL_LENGTH) {
    res.status(400).json({ error: "label or date is too long" });
    return;
  }

  const rows = await sql`
    INSERT INTO trophies (rsn_key, label, date_label)
    VALUES (${rsn.toLowerCase()}, ${label}, ${date || "Undated"})
    RETURNING id, label, date_label, created_at`;
  const t = rows[0];
  res.status(201).json({ trophy: { id: t.id, label: t.label, date: t.date_label, createdAt: t.created_at } });
}

async function removeTrophy(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const rows = await sql`SELECT rsn_key FROM trophies WHERE id = ${id}`;
  if (rows.length === 0) {
    res.status(404).json({ error: "Trophy not found" });
    return;
  }

  await sql`DELETE FROM trophies WHERE id = ${id}`;
  res.status(200).json({ ok: true });
}

// Listing (public), adding, and removing trophies are combined into one
// function to stay under the Vercel Hobby plan's 12-function-per-deployment
// cap, dispatched by HTTP method.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    await listTrophies(req, res);
    return;
  }
  if (req.method === "POST") {
    await addTrophy(req, res);
    return;
  }
  if (req.method === "DELETE") {
    await removeTrophy(req, res);
    return;
  }
  res.status(405).json({ error: "Method not allowed" });
}
