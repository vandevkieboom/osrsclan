import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { SITE_ORIGIN } from "./board-cache.js";
import { botFetch, postLog, readRawBody } from "./discord.js";
import {
  STREAMED_GAME,
  TWITCH_CHANNELS,
  eventSubSecret,
  helix,
  twitchConfigured,
} from "./twitch.js";

/**
 * Announces clan streamers in Discord when they go live with Old School
 * RuneScape, replacing Streamcord (which announced every game).
 *
 * Twitch pushes to us (EventSub webhooks) instead of anything polling Twitch:
 * one request when a channel goes live or changes title/category, nothing in
 * between. Two topics per channel, because a stream that starts in another
 * category and switches to OSRS only shows up as a `channel.update`.
 *
 * No database: "was this stream already announced" is answered from the
 * announcement channel's own recent messages, and Discord's `enforce_nonce`
 * (the stream id) stops a `stream.online` and a `channel.update` arriving
 * together from both posting.
 */

const ANNOUNCE_CHANNEL_ID = "1500796159784914974";
const BROADCASTS_ROLE_ID = "1501202331948290130";

const CALLBACK_URL = `${SITE_ORIGIN}/api/twitch-live?resource=eventsub`;

const TOPICS = [
  { type: "stream.online", version: "1" },
  { type: "channel.update", version: "2" },
];

// Twitch's advice: refuse older notifications, so a captured one can't be
// replayed later.
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

// A stream that drops and restarts gets a new stream id; an announcement this
// shortly before the new start still counts, so a reconnect doesn't ping
// everyone again.
const RESTART_GRACE_MS = 10 * 60 * 1000;

const TWITCH_PURPLE = 0x9146ff;

interface EventSubSubscription {
  id: string;
  type: string;
  version: string;
  status: string;
  condition: { broadcaster_user_id?: string };
  transport: { method: string; callback?: string };
}

interface StreamOnlineEvent {
  id: string;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  type: string;
  started_at: string;
}

interface ChannelUpdateEvent {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  title: string;
  category_name: string;
}

interface EventSubMessage {
  challenge?: string;
  subscription: EventSubSubscription;
  event?: StreamOnlineEvent | ChannelUpdateEvent;
}

interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
}

interface DiscordMessage {
  timestamp: string;
  author: { id: string };
  embeds?: { url?: string }[];
}

interface LiveStream {
  streamId: string;
  startedAt: string;
  userId: string;
  login: string;
  name: string;
  title: string;
}

function isValidSignature(req: VercelRequest, body: Buffer): boolean {
  const id = req.headers["twitch-eventsub-message-id"];
  const timestamp = req.headers["twitch-eventsub-message-timestamp"];
  const signature = req.headers["twitch-eventsub-message-signature"];
  if (
    typeof id !== "string" ||
    typeof timestamp !== "string" ||
    typeof signature !== "string"
  ) {
    return false;
  }
  const ageMs = Math.abs(Date.now() - Date.parse(timestamp));
  if (!(ageMs <= MAX_MESSAGE_AGE_MS)) return false;
  const expected = Buffer.from(
    "sha256=" +
      createHmac("sha256", eventSubSecret())
        .update(id + timestamp)
        .update(body)
        .digest("hex"),
  );
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function helixData<T>(path: string): Promise<T[] | null> {
  const r = await helix(path);
  if (!r?.ok) return null;
  return ((await r.json()) as { data: T[] }).data;
}

async function fetchUsers(query: string): Promise<TwitchUser[] | null> {
  return helixData<TwitchUser>(`/users?${query}`);
}

function twitchUrl(login: string): string {
  return `https://www.twitch.tv/${login}`;
}

// Twitch names may contain underscores, which Discord reads as italics.
function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_~`|>])/g, "\\$1");
}

let botUserId: string | null = null;

async function fetchBotUserId(): Promise<string | null> {
  if (botUserId) return botUserId;
  const r = await botFetch("/users/@me");
  if (!r.ok) return null;
  botUserId = ((await r.json()) as { id: string }).id;
  return botUserId;
}

// Null when the channel couldn't be read, which callers treat as "don't
// post": without the check every title change during an OSRS stream would
// ping @Broadcasts again.
async function alreadyAnnounced(stream: LiveStream): Promise<boolean | null> {
  const [selfId, r] = await Promise.all([
    fetchBotUserId(),
    botFetch(`/channels/${ANNOUNCE_CHANNEL_ID}/messages?limit=100`),
  ]);
  if (!selfId || !r.ok) return null;
  const since = Date.parse(stream.startedAt) - RESTART_GRACE_MS;
  const url = twitchUrl(stream.login);
  const messages = (await r.json()) as DiscordMessage[];
  return messages.some(
    (m) =>
      m.author.id === selfId &&
      Date.parse(m.timestamp) >= since &&
      m.embeds?.some((e) => e.url === url),
  );
}

async function announce(stream: LiveStream) {
  const announced = await alreadyAnnounced(stream);
  if (announced !== false) {
    if (announced === null) {
      console.error(
        `Stream announcement for ${stream.login} skipped: couldn't read the announcement channel`,
      );
    }
    return;
  }

  const user = (await fetchUsers(`id=${stream.userId}`))?.[0];
  const url = twitchUrl(stream.login);
  const r = await botFetch(`/channels/${ANNOUNCE_CHANNEL_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: `<@&${BROADCASTS_ROLE_ID}> **${escapeMarkdown(stream.name)}** is live with Old School RuneScape!`,
      allowed_mentions: { roles: [BROADCASTS_ROLE_ID] },
      // Discord returns the existing message instead of posting a second
      // one with the same nonce from the last few minutes.
      nonce: stream.streamId,
      enforce_nonce: true,
      embeds: [
        {
          title: stream.title || `${stream.name} on Twitch`,
          url,
          color: TWITCH_PURPLE,
          author: {
            name: stream.name,
            url,
            ...(user ? { icon_url: user.profile_image_url } : {}),
          },
          // The stream id makes Discord fetch this stream's preview rather
          // than a cached one from the channel's previous stream.
          image: {
            url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${stream.login}-1280x720.jpg?s=${stream.streamId}`,
          },
          fields: [{ name: "Game", value: STREAMED_GAME, inline: true }],
        },
      ],
    }),
  });
  if (!r.ok) {
    console.error(
      `Stream announcement for ${stream.login} failed: Discord answered ${r.status} ${await r.text()}`,
    );
  }
}

async function handleNotification(message: EventSubMessage) {
  const event = message.event;
  if (!event) return;
  const login = event.broadcaster_user_login.toLowerCase();
  // A subscription for a channel taken off TWITCH_CHANNELS lives on until
  // the daily sync deletes it.
  if (!TWITCH_CHANNELS.includes(login)) return;

  if (message.subscription.type === "stream.online") {
    const online = event as StreamOnlineEvent;
    // Reruns, premieres and the like aren't someone playing right now.
    if (online.type !== "live") return;
    const channel = (
      await helixData<{ game_name: string; title: string }>(
        `/channels?broadcaster_id=${online.broadcaster_user_id}`,
      )
    )?.[0];
    if (channel?.game_name !== STREAMED_GAME) return;
    await announce({
      streamId: online.id,
      startedAt: online.started_at,
      userId: online.broadcaster_user_id,
      login,
      name: online.broadcaster_user_name,
      title: channel.title,
    });
    return;
  }

  if (message.subscription.type === "channel.update") {
    const update = event as ChannelUpdateEvent;
    if (update.category_name !== STREAMED_GAME) return;
    // Offline: the category was set ahead of a stream, and stream.online
    // will announce it once it starts.
    const live = (
      await helixData<{ id: string; started_at: string }>(
        `/streams?user_id=${update.broadcaster_user_id}`,
      )
    )?.[0];
    if (!live) return;
    await announce({
      streamId: live.id,
      startedAt: live.started_at,
      userId: update.broadcaster_user_id,
      login,
      name: update.broadcaster_user_name,
      title: update.title,
    });
  }
}

async function reportRevocation(subscription: EventSubSubscription) {
  const id = subscription.condition.broadcaster_user_id ?? "?";
  const login = (await fetchUsers(`id=${id}`))?.[0]?.login ?? `channel ${id}`;
  await postLog([
    `⚠️ Twitch stopped sending \`${subscription.type}\` for ${login} (${subscription.status}). The daily check subscribes again; until then their streams may not be announced.`,
  ]);
}

/**
 * Twitch's EventSub webhook: `/api/twitch-live?resource=eventsub`. Answers
 * straight away and announces after the reply, since Twitch wants a 2xx
 * within a few seconds and treats repeated slow answers as failures.
 */
export async function handleEventSub(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!twitchConfigured) {
    res.status(500).json({ error: "Twitch is not configured" });
    return;
  }

  // Twitch signs the raw bytes; req.body must not be touched before this.
  const body = await readRawBody(req);
  if (!isValidSignature(req, body)) {
    res.status(403).json({ error: "Invalid signature" });
    return;
  }

  const message = JSON.parse(body.toString("utf8")) as EventSubMessage;
  const messageType = req.headers["twitch-eventsub-message-type"];

  if (messageType === "webhook_callback_verification") {
    res.setHeader("Content-Type", "text/plain");
    res.status(200).send(message.challenge ?? "");
    return;
  }
  if (messageType === "notification") {
    waitUntil(
      handleNotification(message).catch((err) =>
        console.error("Stream announcement failed:", err),
      ),
    );
  } else if (messageType === "revocation") {
    waitUntil(
      reportRevocation(message.subscription).catch((err) =>
        console.error("Reporting an EventSub revocation failed:", err),
      ),
    );
  }
  res.status(204).end();
}

async function listOurSubscriptions(): Promise<EventSubSubscription[] | null> {
  const subscriptions: EventSubSubscription[] = [];
  let cursor: string | undefined;
  do {
    const r = await helix(
      `/eventsub/subscriptions${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (!r?.ok) return null;
    const page = (await r.json()) as {
      data: EventSubSubscription[];
      pagination?: { cursor?: string };
    };
    subscriptions.push(...page.data);
    cursor = page.pagination?.cursor;
  } while (cursor);
  return subscriptions.filter((s) => s.transport.callback === CALLBACK_URL);
}

const HEALTHY_STATUSES = new Set([
  "enabled",
  "webhook_callback_verification_pending",
]);

/**
 * Daily cron, `/api/twitch-live?resource=eventsub-sync`: makes Twitch's
 * subscriptions match TWITCH_CHANNELS. Subscribes channels that were added
 * (or whose subscription Twitch revoked, e.g. after our endpoint failed too
 * often) and unsubscribes channels that were removed. Also how the feature
 * is first switched on: run this cron once by hand after deploying. Reports
 * in #logging only when it changed something or failed.
 */
export async function syncStreamSubscriptions(res: VercelResponse) {
  if (!twitchConfigured) {
    res.status(500).json({ error: "Twitch is not configured" });
    return;
  }

  const [users, existing] = await Promise.all([
    fetchUsers(
      TWITCH_CHANNELS.map((c) => `login=${encodeURIComponent(c)}`).join("&"),
    ),
    listOurSubscriptions(),
  ]);
  if (!users || !existing) {
    await postLog([
      "⚠️ Stream announcements: couldn't reach Twitch to check the subscriptions. Trying again tomorrow.",
    ]);
    res.status(502).json({ error: "Twitch API unavailable" });
    return;
  }

  const log: string[] = [];
  const found = new Set(users.map((u) => u.login.toLowerCase()));
  const missing = TWITCH_CHANNELS.filter((c) => !found.has(c));
  if (missing.length > 0) {
    log.push(
      `⚠️ Stream announcements: Twitch has no channel called ${missing.join(", ")} (check TWITCH_CHANNELS on Vercel).`,
    );
  }

  const key = (type: string, broadcasterId: string | undefined) =>
    `${type}:${broadcasterId}`;
  const wanted = new Map<
    string,
    { type: string; version: string; user: TwitchUser }
  >();
  for (const user of users) {
    for (const topic of TOPICS) {
      wanted.set(key(topic.type, user.id), { ...topic, user });
    }
  }

  const healthy = new Set<string>();
  let removed = 0;
  for (const sub of existing) {
    const k = key(sub.type, sub.condition.broadcaster_user_id);
    const target = wanted.get(k);
    if (
      target &&
      target.version === sub.version &&
      HEALTHY_STATUSES.has(sub.status) &&
      !healthy.has(k)
    ) {
      healthy.add(k);
      continue;
    }
    const r = await helix(`/eventsub/subscriptions?id=${sub.id}`, {
      method: "DELETE",
    });
    if (r?.ok) removed++;
  }

  const added: string[] = [];
  const failed: string[] = [];
  for (const [k, target] of wanted) {
    if (healthy.has(k)) continue;
    const r = await helix("/eventsub/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        type: target.type,
        version: target.version,
        condition: { broadcaster_user_id: target.user.id },
        transport: {
          method: "webhook",
          callback: CALLBACK_URL,
          secret: eventSubSecret(),
        },
      }),
    });
    // 409: it already exists, which is what we wanted.
    if (r?.ok || r?.status === 409) {
      added.push(target.user.login);
    } else {
      failed.push(
        `${target.user.login} (${target.type}: ${r ? `${r.status} ${await r.text()}` : "no token"})`,
      );
    }
  }

  const addedChannels = [...new Set(added)];
  if (addedChannels.length > 0) {
    log.push(
      `📺 Stream announcements: now listening to Twitch for ${addedChannels.join(", ")}.`,
    );
  }
  if (failed.length > 0) {
    log.push(
      `⚠️ Stream announcements: couldn't subscribe ${failed.join("; ")}.`,
    );
  }
  if (log.length > 0) await postLog(log);

  res.status(200).json({
    channels: users.length,
    kept: healthy.size,
    added: added.length,
    removed,
    failed: failed.length,
  });
}
