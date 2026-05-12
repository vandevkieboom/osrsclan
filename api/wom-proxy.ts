import type { VercelRequest, VercelResponse } from "@vercel/node";

const BASE_URL = "https://api.wiseoldman.net/v2";
const GROUP_ID = 22206;
const CURRENT_EVENT_ID = 138429;
const API_KEY = process.env.WOM_API_KEY ?? "";

const WOM_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent": "vandevkieboom",
  ...(API_KEY ? { "x-api-key": API_KEY } : {}),
};

const METRIC_RE = /^[a-z_]{1,40}$/;
const PERIOD_RE = /^(week|month)$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { type } = req.query;

  if (type === "hiscores") {
    const { metric } = req.query;
    if (typeof metric !== "string" || !METRIC_RE.test(metric)) {
      res.status(400).json({ error: "Invalid metric" });
      return;
    }
    const upstream = await fetch(
      `${BASE_URL}/groups/${GROUP_ID}/hiscores?metric=${metric}&limit=500`,
      { headers: WOM_HEADERS },
    );
    if (upstream.status === 429) {
      res
        .status(429)
        .json({ error: "Rate limit hit — wait a moment and try again." });
      return;
    }
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
    res.status(upstream.status).json(await upstream.json());
  } else if (type === "gained") {
    const { metric, period, limit } = req.query;
    if (typeof metric !== "string" || !METRIC_RE.test(metric)) {
      res.status(400).json({ error: "Invalid metric" });
      return;
    }
    if (typeof period !== "string" || !PERIOD_RE.test(period)) {
      res.status(400).json({ error: "Invalid period" });
      return;
    }
    const limitNum = Number(limit ?? "500");
    if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 500) {
      res.status(400).json({ error: "Invalid limit" });
      return;
    }
    const upstream = await fetch(
      `${BASE_URL}/groups/${GROUP_ID}/gained?metric=${metric}&period=${period}&limit=${limitNum}`,
      { headers: WOM_HEADERS },
    );
    if (upstream.status === 429) {
      res
        .status(429)
        .json({ error: "Rate limit hit — wait a moment and try again." });
      return;
    }
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
    res.status(upstream.status).json(await upstream.json());
  } else if (type === "event") {
    const upstream = await fetch(
      `${BASE_URL}/competitions/${CURRENT_EVENT_ID}`,
      { headers: WOM_HEADERS },
    );
    if (upstream.status === 429) {
      res
        .status(429)
        .json({ error: "Rate limit hit — wait a moment and try again." });
      return;
    }
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
    res.status(upstream.status).json(await upstream.json());
  } else {
    res.status(400).json({ error: "Invalid type" });
  }
}
