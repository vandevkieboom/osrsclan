import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import {
  destroySession,
  generateToken,
  getSessionUser,
  hashToken,
  requireUser,
} from "../_lib/auth.js";
import { withErrorHandling } from "../_lib/handler.js";
import {
  handleDiscordInteraction,
  normalizeRsn,
  rsnKey,
  syncClanRoles,
} from "../_lib/discord.js";

const MAX_TOKEN_LABEL_LENGTH = 60;

function serializeUser(
  user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>,
) {
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

/**
 * Manages the caller's RuneLite plugin tokens (list / create / revoke).
 *
 * Cookie-authenticated only, on purpose: creating a token is a
 * credential-issuing action, so a plugin token must never be able to mint
 * another one.
 */
async function handlePluginTokens(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const rows = await sql`
      SELECT id, label, created_at, last_used_at, revoked_at
      FROM plugin_tokens
      WHERE user_id = ${user.id} AND revoked_at IS NULL
      ORDER BY created_at DESC`;
    res.status(200).json({
      tokens: rows.map((r) => ({
        id: r.id,
        label: r.label,
        createdAt: r.created_at,
        lastUsedAt: r.last_used_at,
      })),
    });
    return;
  }

  if (req.method === "POST") {
    const label =
      typeof req.body?.label === "string" ? req.body.label.trim() : "";
    if (label.length > MAX_TOKEN_LABEL_LENGTH) {
      res.status(400).json({
        error: `Label must be ${MAX_TOKEN_LABEL_LENGTH} characters or fewer`,
      });
      return;
    }

    // Only the hash is stored, so this raw token is returned here and then
    // never retrievable again — same trade-off as a personal access token.
    const token = generateToken();
    const rows = await sql`
      INSERT INTO plugin_tokens (user_id, token_hash, label)
      VALUES (${user.id}, ${hashToken(token)}, ${label})
      RETURNING id, label, created_at`;

    res.status(200).json({
      token,
      id: rows[0].id,
      label: rows[0].label,
      createdAt: rows[0].created_at,
    });
    return;
  }

  if (req.method === "DELETE") {
    const id = Number(req.query.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "A valid id query param is required" });
      return;
    }
    await sql`
      UPDATE plugin_tokens SET revoked_at = now()
      WHERE id = ${id} AND user_id = ${user.id} AND revoked_at IS NULL`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

// "Who am I", "log out", "update my settings" (RSN + rankings remember-me
// preference), and RuneLite plugin token management are combined into one
// function to stay under the Vercel Hobby plan's 12-function-per-deployment
// cap. So are the Discord bot's interactions endpoint (the
// #member-verification button) and its daily clan-role sync, which belong
// here because they set a member's RSN and the roles that go with it.
export default withErrorHandling(async function handler(req, res) {
  if (req.query.resource === "discord-interactions") {
    await handleDiscordInteraction(req, res);
    return;
  }

  if (req.query.resource === "discord-sync") {
    // Vercel sends this header on cron-triggered invocations when
    // CRON_SECRET is set — same auth as the other crons in vercel.json.
    const expected = process.env.CRON_SECRET;
    if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    await syncClanRoles(res);
    return;
  }

  if (req.query.resource === "plugin-tokens") {
    await handlePluginTokens(req, res);
    return;
  }

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
      // Empty clears the name.
      const rsn = raw ? normalizeRsn(raw) : null;
      if (raw && !rsn) {
        res.status(400).json({
          error:
            "That doesn't look like a RuneScape name: 1-12 characters, only letters, numbers, spaces, - and _.",
        });
        return;
      }
      // The Verify button treats a name on someone's website profile as
      // theirs, so it must not be claimable here by anyone else. Compared the
      // way the button compares names (rsnKey). Re-saving the name you
      // already have is always allowed, so an old duplicate can't lock
      // either account out of saving.
      if (
        rsn &&
        rsnKey(rsn) !== rsnKey(user.runescapeName ?? "")
      ) {
        const taken = await sql`
          SELECT 1 FROM users
          WHERE id <> ${user.id}
            AND lower(btrim(regexp_replace(runescape_name, '[-_[:space:]]+', ' ', 'g'))) = ${rsnKey(rsn)}
          LIMIT 1`;
        if (taken.length > 0) {
          res.status(409).json({
            error: `Someone else already uses ${rsn}. If that really is your name, contact a mod.`,
          });
          return;
        }
      }
      await sql`UPDATE users SET runescape_name = ${rsn} WHERE id = ${user.id}`;
      next = { ...next, runescapeName: rsn };
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
});
