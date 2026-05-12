import type { VercelRequest, VercelResponse } from "@vercel/node";

const RP_BASE = "https://api.runeprofile.com/v1";
const API_KEY = process.env.RUNEPROFILE_API_KEY ?? "";

const ALLOWED_PATHS = [
  /^\/accounts\/[^/]+\/full$/,
  /^\/accounts\/[^/]+\/combat-achievements\/tasks$/,
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { path } = req.query;
  if (typeof path !== "string" || !ALLOWED_PATHS.some((re) => re.test(path))) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(API_KEY ? { "x-api-key": API_KEY } : {}),
  };

  const upstream = await fetch(`${RP_BASE}${path}`, { headers });

  if (upstream.status === 404) {
    res.status(404).json({ error: "Account not found on RuneProfile." });
    return;
  }
  if (upstream.status === 429) {
    res
      .status(429)
      .json({ error: "Rate limit hit — wait a moment and try again." });
    return;
  }
  if (!upstream.ok) {
    res
      .status(upstream.status)
      .json({ error: `RuneProfile API error (${upstream.status}).` });
    return;
  }

  res.status(200).json(await upstream.json());
}
