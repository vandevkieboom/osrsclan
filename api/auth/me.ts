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
    rememberRankings: user.rememberRankings,
  };
}

// "Who am I", "log out", and "update my settings" (RSN + rankings
// remember-me preference) are combined into one function to stay under the
// Vercel Hobby plan's 12-function-per-deployment cap.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "DELETE") {
    await destroySession(req, res);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "PATCH") {
    const user = await requireUser(req, res);
    if (!user) return;

    let next = user;

    if (typeof req.body?.runescapeName === "string") {
      const raw = req.body.runescapeName.trim();
      if (raw.length > MAX_RUNESCAPE_NAME_LENGTH) {
        res.status(400).json({ error: `RuneScape name must be ${MAX_RUNESCAPE_NAME_LENGTH} characters or fewer` });
        return;
      }
      // Trophies and manual item verifications are keyed by lowercased RSN,
      // not user id, so renaming would otherwise silently orphan them — the
      // member loses their trophy case and every admin sign-off on rank items
      // that can't be auto-verified stops counting, with no error anywhere.
      // Carry those rows across so an ordinary name change doesn't cost an
      // admin their work. Clearing the RSN leaves the rows at the old key,
      // where re-setting the same name will pick them up again.
      const oldKey = user.runescapeName?.trim().toLowerCase() ?? "";
      const newKey = raw.toLowerCase();

      await sql`UPDATE users SET runescape_name = ${raw || null} WHERE id = ${user.id}`;

      if (oldKey && newKey && oldKey !== newKey) {
        await sql.transaction([
          sql`UPDATE trophies SET rsn_key = ${newKey} WHERE rsn_key = ${oldKey}`,
          // manual_item_verifications is UNIQUE (rsn_key, item_name), so any
          // row already sitting at the new key would collide — drop those
          // first and let the ones being carried over win.
          sql`DELETE FROM manual_item_verifications
              WHERE rsn_key = ${newKey}
                AND item_name IN (
                  SELECT item_name FROM manual_item_verifications WHERE rsn_key = ${oldKey}
                )`,
          sql`UPDATE manual_item_verifications SET rsn_key = ${newKey} WHERE rsn_key = ${oldKey}`,
        ]);
      }

      next = { ...next, runescapeName: raw || null };
    }

    if (typeof req.body?.rememberRankings === "boolean") {
      await sql`UPDATE users SET remember_rankings = ${req.body.rememberRankings} WHERE id = ${user.id}`;
      next = { ...next, rememberRankings: req.body.rememberRankings };
    }

    res.status(200).json({ user: serializeUser(next) });
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
