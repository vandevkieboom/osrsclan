import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import { requireRequestUser } from "./_lib/auth.js";
import { withErrorHandling } from "./_lib/handler.js";

// This board is members-only with no anonymous case (unlike the bingo
// board's public leaderboard), so every verb here requires a caller —
// browser session or RuneLite plugin token, same as submitPluginProof.
const MAX_AGE_MINUTES = 40;
const MAX_NOTE_LENGTH = 200;
const MAX_PASSPHRASE_LENGTH = 100;
const ACTIVITIES = [
  "tob",
  "cox",
  "toa",
  "inferno",
  "fight_caves",
  "wintertodt",
  "skilling",
  "other",
] as const;
type Activity = (typeof ACTIVITIES)[number];

function isActivity(value: unknown): value is Activity {
  return (
    typeof value === "string" && (ACTIVITIES as readonly string[]).includes(value)
  );
}

async function listActivePosts(req: VercelRequest, res: VercelResponse) {
  const user = await requireRequestUser(req, res);
  if (!user) return;

  // The interval is built via multiplication rather than string-interpolated
  // inside `interval '...'` — a bound parameter placed inside a quoted
  // literal does not get substituted the way a bare value does.
  const rows = await sql`
    SELECT p.id, p.activity, p.spots_needed, p.note, p.party_passphrase,
           p.created_at, p.user_id,
           u.runescape_name, u.discord_global_name, u.discord_username
    FROM lfg_posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.created_at > now() - (${MAX_AGE_MINUTES} * interval '1 minute')
    ORDER BY p.created_at DESC`;

  res.status(200).json({
    posts: rows.map((r) => ({
      id: String(r.id),
      activity: r.activity,
      spotsNeeded: r.spots_needed,
      note: r.note,
      partyPassphrase: r.party_passphrase,
      createdAt: r.created_at,
      postedBy: r.runescape_name ?? r.discord_global_name ?? r.discord_username,
      isMine: r.user_id === user.id,
    })),
  });
}

async function upsertPost(req: VercelRequest, res: VercelResponse) {
  const user = await requireRequestUser(req, res);
  if (!user) return;

  const activity = req.body?.activity;
  const spotsNeeded = Number(req.body?.spotsNeeded);
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  const partyPassphrase =
    typeof req.body?.partyPassphrase === "string"
      ? req.body.partyPassphrase.trim()
      : "";

  if (!isActivity(activity)) {
    res
      .status(400)
      .json({ error: "activity must be one of: " + ACTIVITIES.join(", ") });
    return;
  }
  if (!Number.isInteger(spotsNeeded) || spotsNeeded < 1 || spotsNeeded > 20) {
    res
      .status(400)
      .json({ error: "spotsNeeded must be an integer between 1 and 20" });
    return;
  }
  if (note.length > MAX_NOTE_LENGTH || partyPassphrase.length > MAX_PASSPHRASE_LENGTH) {
    res.status(400).json({ error: "note or partyPassphrase is too long" });
    return;
  }

  await sql`
    INSERT INTO lfg_posts (user_id, activity, spots_needed, note, party_passphrase, created_at)
    VALUES (${user.id}, ${activity}, ${spotsNeeded}, ${note}, ${partyPassphrase}, now())
    ON CONFLICT (user_id) DO UPDATE SET
      activity = EXCLUDED.activity,
      spots_needed = EXCLUDED.spots_needed,
      note = EXCLUDED.note,
      party_passphrase = EXCLUDED.party_passphrase,
      created_at = now()`;

  res.status(200).json({ ok: true });
}

async function cancelPost(req: VercelRequest, res: VercelResponse) {
  const user = await requireRequestUser(req, res);
  if (!user) return;

  await sql`DELETE FROM lfg_posts WHERE user_id = ${user.id}`;
  res.status(200).json({ ok: true });
}

export default withErrorHandling(async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method === "GET") return listActivePosts(req, res);
  if (req.method === "POST") return upsertPost(req, res);
  if (req.method === "DELETE") return cancelPost(req, res);
  res.status(405).json({ error: "Method not allowed" });
});
