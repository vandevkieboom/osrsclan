import type { VercelRequest, VercelResponse } from "@vercel/node";
import { destroySession } from "../_lib/auth.ts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  await destroySession(req, res);
  res.status(200).json({ ok: true });
}
