// Registers the bot's slash commands (/rank, /profile) on the clan server.
// Run again after changing a command's name, description or options:
//
//   pnpm discord:register-commands
//
// Replaces the full list each time, so a command removed here disappears from
// Discord too. Guild commands (not global ones) so changes show up instantly.
// Answered by /api/auth/me?resource=discord-interactions (handleCommand in
// api/_lib/discord.ts).

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  throw new Error(
    "DISCORD_BOT_TOKEN and DISCORD_GUILD_ID must be set. Run `vercel env pull .env.local` first.",
  );
}

const API = "https://discord.com/api/v10";
const headers = {
  Authorization: `Bot ${BOT_TOKEN}`,
  "Content-Type": "application/json",
};

const rsnOption = {
  type: 3, // string
  name: "rsn",
  description: "In-game name (leave empty for yourself)",
  required: false,
  max_length: 12,
};

const commands = [
  {
    name: "rank",
    description: "Clan rank progress: which rank someone qualifies for, and what's next",
    options: [rsnOption],
  },
  {
    name: "profile",
    description: "Someone's stats and a link to their clan website profile",
    options: [rsnOption],
  },
];

const app = await fetch(`${API}/applications/@me`, { headers }).then((r) =>
  r.json(),
);
const res = await fetch(
  `${API}/applications/${app.id}/guilds/${GUILD_ID}/commands`,
  { method: "PUT", headers, body: JSON.stringify(commands) },
);
if (!res.ok) {
  throw new Error(`Discord answered ${res.status}: ${await res.text()}`);
}
console.log(
  "Registered:",
  (await res.json()).map((c) => `/${c.name}`).join(", "),
);
