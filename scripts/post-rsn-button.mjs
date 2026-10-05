// Posts the "Set my RSN" button message to a Discord channel. Run once (or
// again after deleting the old message to change its text):
//
//   pnpm discord:post-rsn-button <channel id>
//
// The button's custom_id must match SET_RSN_BUTTON_ID in api/_lib/discord.ts;
// clicks are answered by /api/auth/me?resource=discord-interactions, so the
// message keeps working forever without this script or any bot process.

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const channelId = process.argv[2];

if (!BOT_TOKEN) {
  throw new Error(
    "DISCORD_BOT_TOKEN is not set. Run `vercel env pull .env.local` first.",
  );
}
if (!channelId) {
  throw new Error("Usage: pnpm discord:post-rsn-button <channel id>");
}

const res = await fetch(
  `https://discord.com/api/v10/channels/${channelId}/messages`,
  {
    method: "POST",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content:
        "**Set your Discord nickname to your in-game name**\n" +
        "This is how we find you in the server and how the clan website knows who you are.\n\n" +
        "Click the button below, type your exact OSRS name, and your nickname is changed for you. " +
        "If you're in the clan, you also get the **Time Served** role straight away.",
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 1, label: "Set my RSN", custom_id: "set-rsn" },
          ],
        },
      ],
    }),
  },
);

if (!res.ok) {
  throw new Error(`Discord answered ${res.status}: ${await res.text()}`);
}
console.log("Posted the Set my RSN message.");
