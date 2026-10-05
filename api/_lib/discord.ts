import { createPublicKey, verify } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { sql } from "./db.js";

// The same Discord application the website's OAuth login uses, with a bot
// user added. The bot does not run anywhere: Discord POSTs button clicks and
// form submissions to the Interactions Endpoint URL set in the developer
// portal (`/api/auth/me?resource=discord-interactions`), and this answers
// them like any other request. One request per click, nothing on a timer.
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY ?? "";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
const GUILD_ID = process.env.DISCORD_GUILD_ID ?? "";

const API = "https://discord.com/api/v10";

export const SET_RSN_BUTTON_ID = "set-rsn";
const SET_RSN_MODAL_ID = "set-rsn-modal";
const RSN_INPUT_ID = "rsn";

// OSRS display names: 1-12 characters, letters, digits, spaces, hyphens and
// underscores. Anything else in a nickname ("Zezima | Admin", emoji) is not
// an RSN, so it must never be copied onto a website profile.
const RSN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,11}$/;

export function normalizeRsn(raw: string): string | null {
  const rsn = raw.trim().replace(/\s+/g, " ");
  return RSN_PATTERN.test(rsn) ? rsn : null;
}

const InteractionType = { PING: 1, COMPONENT: 3, MODAL_SUBMIT: 5 } as const;
const ResponseType = { PONG: 1, MESSAGE: 4, MODAL: 9 } as const;
const EPHEMERAL = 1 << 6;

interface Interaction {
  type: number;
  guild_id?: string;
  member?: { nick?: string | null; user: { id: string } };
  data?: {
    custom_id?: string;
    components?: { components: { custom_id: string; value: string }[] }[];
  };
}

// Discord signs the raw bytes, so the body has to be read before (and
// instead of) the runtime's JSON parsing - re-serialising req.body would not
// reproduce them.
function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Node takes Ed25519 public keys as SPKI DER; this prefix wraps Discord's raw
// 32-byte hex key into one.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function isValidSignature(req: VercelRequest, body: Buffer): boolean {
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  if (typeof signature !== "string" || typeof timestamp !== "string") {
    return false;
  }
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(PUBLIC_KEY, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.concat([Buffer.from(timestamp), body]),
      key,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

function reply(res: VercelResponse, content: string) {
  res.status(200).json({
    type: ResponseType.MESSAGE,
    data: { content, flags: EPHEMERAL },
  });
}

const MANUAL_NICKNAME_STEPS =
  "• PC: click the server name (top left) → Edit Per-server Profile → Server Nickname\n" +
  "• Mobile: tap the server name → ⋯ → Edit Per-server Profile";

function showRsnModal(res: VercelResponse, interaction: Interaction) {
  const current = normalizeRsn(interaction.member?.nick ?? "");
  res.status(200).json({
    type: ResponseType.MODAL,
    data: {
      custom_id: SET_RSN_MODAL_ID,
      title: "Set your in-game name",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: RSN_INPUT_ID,
              label: "Your exact Old School RuneScape name",
              style: 1,
              min_length: 1,
              max_length: 12,
              required: true,
              ...(current ? { value: current } : {}),
            },
          ],
        },
      ],
    },
  });
}

async function applyRsn(res: VercelResponse, interaction: Interaction) {
  const userId = interaction.member?.user.id;
  const guildId = interaction.guild_id;
  const raw =
    interaction.data?.components
      ?.flatMap((row) => row.components)
      .find((c) => c.custom_id === RSN_INPUT_ID)?.value ?? "";
  const rsn = normalizeRsn(raw);

  if (!userId || !guildId) {
    reply(res, "This only works inside the server.");
    return;
  }
  if (!rsn) {
    reply(
      res,
      "That doesn't look like a RuneScape name: 1-12 characters, only letters, numbers, spaces, `-` and `_`. Click the button to try again.",
    );
    return;
  }

  const patch = await fetch(`${API}/guilds/${guildId}/members/${userId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
      "X-Audit-Log-Reason": "Set RSN via button",
    },
    body: JSON.stringify({ nick: rsn }),
    signal: AbortSignal.timeout(2000),
  });

  if (!patch.ok) {
    // 403 is the expected failure: Discord never lets a bot rename the
    // server owner, or anyone whose highest role sits above the bot's.
    console.error("Discord nickname update failed:", patch.status, await patch.text());
    reply(
      res,
      `I couldn't change your nickname, please set it to **${rsn}** yourself:\n${MANUAL_NICKNAME_STEPS}`,
    );
    return;
  }

  // Discord wants an answer within 3 seconds and a cold database can eat most
  // of that, so the website profile is updated after replying. Only an
  // existing account is touched; someone who never logged in to the site gets
  // the nickname picked up at their first login (`fetchGuildNickname`).
  waitUntil(
    sql`UPDATE users SET runescape_name = ${rsn} WHERE discord_id = ${userId}`.catch(
      (err) => console.error("Saving RSN from Discord failed:", err),
    ),
  );

  reply(res, `Done! Your nickname is now **${rsn}**.`);
}

export async function handleDiscordInteraction(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!PUBLIC_KEY || !BOT_TOKEN) {
    res.status(500).json({ error: "Discord bot is not configured" });
    return;
  }

  const body = await readRawBody(req);
  // Discord deliberately sends badly-signed requests when the endpoint URL is
  // saved, and refuses the URL unless they are rejected.
  if (!isValidSignature(req, body)) {
    res.status(401).json({ error: "Invalid request signature" });
    return;
  }

  const interaction = JSON.parse(body.toString("utf8")) as Interaction;

  if (interaction.type === InteractionType.PING) {
    res.status(200).json({ type: ResponseType.PONG });
    return;
  }
  if (
    interaction.type === InteractionType.COMPONENT &&
    interaction.data?.custom_id === SET_RSN_BUTTON_ID
  ) {
    showRsnModal(res, interaction);
    return;
  }
  if (
    interaction.type === InteractionType.MODAL_SUBMIT &&
    interaction.data?.custom_id === SET_RSN_MODAL_ID
  ) {
    await applyRsn(res, interaction);
    return;
  }

  reply(res, "Unknown action.");
}

/**
 * The member's nickname in the clan server, if it is shaped like an RSN, for
 * filling an empty `runescape_name` at login. Uses the bot token rather than
 * the user's OAuth token so the login doesn't need an extra scope (and an
 * extra line on Discord's consent screen). Never throws: a missing nickname
 * just means the profile field stays empty, as it always did.
 */
export async function fetchGuildNickname(
  discordId: string,
): Promise<string | null> {
  if (!BOT_TOKEN || !GUILD_ID) return null;
  try {
    const r = await fetch(`${API}/guilds/${GUILD_ID}/members/${discordId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const member = (await r.json()) as { nick?: string | null };
    return member.nick ? normalizeRsn(member.nick) : null;
  } catch {
    return null;
  }
}
