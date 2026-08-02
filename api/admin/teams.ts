import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    const rows = await sql`
      SELECT t.id, t.name, t.slug, COUNT(u.id)::int AS member_count
      FROM teams t
      LEFT JOIN users u ON u.team_id = t.id
      GROUP BY t.id
      ORDER BY t.name`;
    res.status(200).json({
      teams: rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, memberCount: r.member_count })),
    });
    return;
  }

  if (req.method === "POST") {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "Team name is required" });
      return;
    }
    const slug = slugify(name);
    try {
      const rows = await sql`
        INSERT INTO teams (name, slug) VALUES (${name}, ${slug}) RETURNING id, name, slug`;
      res.status(201).json({ team: { ...rows[0], memberCount: 0 } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("duplicate key")) {
        res.status(409).json({ error: "A team with that name already exists" });
        return;
      }
      res.status(500).json({ error: "Failed to create team" });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
