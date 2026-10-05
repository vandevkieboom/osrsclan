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

// The Time Served server's member role and the channels replies point to.
// The member role is granted to anyone whose RSN is in the WOM clan group.
const MEMBER_ROLE_ID = "1501333285421322410";
const VERIFICATION_CHANNEL = "<#1506007935216648212>";
const RANKS_CHANNEL = "<#1503144145404035254>";

// Keep in sync with WOM_GROUP_ID in src/constants.ts, vite.config.ts,
// api/wom-proxy.ts, api/runeprofile-proxy.ts and api/_lib/board.ts.
const WOM_GROUP_ID = 22206;
const WOM_BASE_URL = "https://api.wiseoldman.net/v2";
const WOM_HEADERS: Record<string, string> = {
  "User-Agent": "vandevkieboom",
  ...(process.env.WOM_API_KEY ? { "x-api-key": process.env.WOM_API_KEY } : {}),
};

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
const ResponseType = {
  PONG: 1,
  MESSAGE: 4,
  DEFERRED_MESSAGE: 5,
  MODAL: 9,
} as const;
const EPHEMERAL = 1 << 6;

interface Interaction {
  type: number;
  application_id: string;
  token: string;
  guild_id?: string;
  member?: {
    nick?: string | null;
    roles: string[];
    user: { id: string };
  };
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

function botFetch(path: string, init: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
      "X-Audit-Log-Reason": "Set RSN via button",
    },
    signal: AbortSignal.timeout(5000),
  });
}

// OSRS treats spaces, underscores and hyphens in a name as the same
// character, and so does WOM's lowercased `username`.
function rsnKey(name: string): string {
  return name.replace(/[-_\s]+/g, " ").trim().toLowerCase();
}

// Whether another member of the server already goes by this name. This is the
// only thing stopping a guest from typing a clan member's RSN to get the
// member role, so a failed search counts as taken rather than as free.
async function isNameTaken(
  guildId: string,
  userId: string,
  rsn: string,
): Promise<boolean> {
  const r = await botFetch(
    `/guilds/${guildId}/members/search?query=${encodeURIComponent(rsn)}&limit=100`,
  );
  if (!r.ok) return true;
  const members = (await r.json()) as {
    nick?: string | null;
    user: { id: string; username: string; global_name?: string | null };
  }[];
  return members.some(
    (m) =>
      m.user.id !== userId &&
      rsnKey(m.nick ?? m.user.global_name ?? m.user.username) === rsnKey(rsn),
  );
}

interface ClanMatch {
  // The name with its in-game capitalisation, used as the nickname, so
  // typing "zezima" still ends up as "Zezima".
  displayName: string;
  // The name the clan group still lists, when the match came through a name
  // change WOM hasn't approved yet.
  previousName: string | null;
}

/**
 * Looks the RSN up in the WOM clan group. An approved name change renames
 * the player in the group, so that case is a plain match; a pending one still
 * lists the old name, and is found through the change record's player id.
 * Returns null when the RSN isn't in the clan, and throws when WOM can't be
 * asked, which must not be mistaken for "not a member".
 */
async function findInWomClan(rsn: string): Promise<ClanMatch | null> {
  const [groupRes, changes] = await Promise.all([
    fetch(`${WOM_BASE_URL}/groups/${WOM_GROUP_ID}`, {
      headers: WOM_HEADERS,
      signal: AbortSignal.timeout(8000),
    }),
    // `status=pending` matters: without it this search took 38s when tried.
    fetch(
      `${WOM_BASE_URL}/names?username=${encodeURIComponent(rsn)}&status=pending&limit=20`,
      { headers: WOM_HEADERS, signal: AbortSignal.timeout(5000) },
    )
      .then((r) =>
        r.ok
          ? (r.json() as Promise<
              { playerId: number; oldName: string; newName: string }[]
            >)
          : [],
      )
      .catch(() => []),
  ]);
  if (!groupRes.ok) {
    throw new Error(`WOM group lookup failed: ${groupRes.status}`);
  }

  const group = (await groupRes.json()) as {
    memberships: {
      playerId: number;
      player: { username: string; displayName: string };
    }[];
  };
  const key = rsnKey(rsn);
  const direct = group.memberships.find(
    (m) => rsnKey(m.player.username) === key,
  );
  if (direct) {
    return { displayName: direct.player.displayName, previousName: null };
  }
  const memberIds = new Set(group.memberships.map((m) => m.playerId));
  const change = changes.find(
    (c) => rsnKey(c.newName) === key && memberIds.has(c.playerId),
  );
  return change
    ? { displayName: change.newName, previousName: change.oldName }
    : null;
}

async function processRsn(interaction: Interaction, typed: string) {
  const guildId = interaction.guild_id!;
  const member = interaction.member!;
  const userId = member.user.id;

  if (await isNameTaken(guildId, userId, typed)) {
    return `Someone else in this server already uses **${typed}** as their nickname. If that really is your name, ask a mod in ${VERIFICATION_CHANNEL}.`;
  }

  // undefined: WOM couldn't be asked. null: asked, and not in the clan.
  let clan: ClanMatch | null | undefined;
  try {
    clan = await findInWomClan(typed);
  } catch (err) {
    console.error(err);
  }
  // Anyone can submit a name change to WOM, so a pending one away from a name
  // someone else here goes by would be a way around the check above.
  if (
    clan?.previousName &&
    (await isNameTaken(guildId, userId, clan.previousName))
  ) {
    clan = null;
  }
  const rsn = clan?.displayName ?? typed;

  const lines: string[] = [];
  const renamed = await botFetch(`/guilds/${guildId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ nick: rsn }),
  });
  if (renamed.ok) {
    lines.push(`Done! Your nickname is now **${rsn}**.`);
  } else {
    // 403 is the expected failure: Discord never lets a bot rename the
    // server owner, or anyone whose highest role sits above the bot's.
    console.error(
      "Discord nickname update failed:",
      renamed.status,
      await renamed.text(),
    );
    lines.push(
      `I couldn't change your nickname, please set it to **${rsn}** yourself:\n${MANUAL_NICKNAME_STEPS}`,
    );
  }

  // Only an existing account is touched; someone who never logged in to the
  // site gets the nickname picked up at their first login
  // (`fetchGuildNickname`).
  await sql`UPDATE users SET runescape_name = ${rsn} WHERE discord_id = ${userId}`.catch(
    (err) => console.error("Saving RSN from Discord failed:", err),
  );

  const hasRole = member.roles.includes(MEMBER_ROLE_ID);
  if (clan === undefined) {
    if (!hasRole) {
      lines.push(
        `I couldn't reach Wise Old Man to check your clan membership. Try again in a minute, or ask in ${VERIFICATION_CHANNEL}.`,
      );
    }
  } else if (clan && !hasRole) {
    const granted = await botFetch(
      `/guilds/${guildId}/members/${userId}/roles/${MEMBER_ROLE_ID}`,
      { method: "PUT" },
    );
    if (granted.ok) {
      lines.push(
        `You're in the clan on Wise Old Man, so you now have the **Time Served** role. Next, create a ticket in ${RANKS_CHANNEL} to get your in-game rank.`,
      );
    } else {
      console.error(
        "Granting member role failed:",
        granted.status,
        await granted.text(),
      );
      lines.push(
        `You're in the clan, but I couldn't give you the **Time Served** role. Please ask in ${VERIFICATION_CHANNEL}.`,
      );
    }
  } else if (!clan && !hasRole) {
    lines.push(
      `I couldn't find **${rsn}** in the Time Served clan on Wise Old Man, so you didn't get the **Time Served** role. Check the spelling and try again. Just joined the clan or changed your name? It can take a while to show up, so ask in ${VERIFICATION_CHANNEL}.`,
    );
  } else if (!clan && hasRole) {
    // Deliberately never removes the role: a typo, or a name change WOM
    // doesn't know about yet, would otherwise strip a real member.
    lines.push(
      `Heads up: **${rsn}** isn't in the clan on Wise Old Man. If that's a typo, click the button again.`,
    );
  }
  return lines.join("\n\n");
}

async function applyRsn(res: VercelResponse, interaction: Interaction) {
  const raw =
    interaction.data?.components
      ?.flatMap((row) => row.components)
      .find((c) => c.custom_id === RSN_INPUT_ID)?.value ?? "";
  const rsn = normalizeRsn(raw);

  if (!interaction.member || !interaction.guild_id) {
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

  // Discord wants an answer within 3 seconds, which the member search, WOM
  // and a cold database together can't promise. So the answer is "thinking…"
  // and the real reply replaces it once the work is done.
  res.status(200).json({
    type: ResponseType.DEFERRED_MESSAGE,
    data: { flags: EPHEMERAL },
  });
  waitUntil(
    processRsn(interaction, rsn)
      .catch((err) => {
        console.error("Set RSN failed:", err);
        return `Something went wrong. Try again, or ask in ${VERIFICATION_CHANNEL}.`;
      })
      .then((content) =>
        fetch(
          `${API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          },
        ),
      )
      .catch((err) => console.error("Set RSN follow-up failed:", err)),
  );
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
