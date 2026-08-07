import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { destroySession, getSessionUser, requireUser } from "../_lib/auth.js";

const MAX_RUNESCAPE_NAME_LENGTH = 30;

function serializeUser(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) {
  return {
    id: user.id,
    username: user.username,
    globalName: user.globalName,
    runescapeName: user.runescapeName,
    avatarUrl: user.avatarUrl,
    isAdmin: user.isAdmin,
    team: user.teamId ? { id: user.teamId, name: user.teamName } : null,
  };
}

// "Who am I", "log out", and "set my RuneScape name" are combined into one
// function to stay under the Vercel Hobby plan's 12-function-per-deployment cap.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "DELETE") {
    await destroySession(req, res);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "PATCH") {
    const user = await requireUser(req, res);
    if (!user) return;

    const raw = typeof req.body?.runescapeName === "string" ? req.body.runescapeName.trim() : "";
    if (raw.length > MAX_RUNESCAPE_NAME_LENGTH) {
      res.status(400).json({ error: `RuneScape name must be ${MAX_RUNESCAPE_NAME_LENGTH} characters or fewer` });
      return;
    }

    await sql`UPDATE users SET runescape_name = ${raw || null} WHERE id = ${user.id}`;
    res.status(200).json({ user: serializeUser({ ...user, runescapeName: raw || null }) });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await getSessionUser(req);
  if (!user) {
    res.status(200).json({ user: null });
    return;
  }

  res.status(200).json({ user: serializeUser(user) });
}
