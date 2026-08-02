import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSessionUser } from "../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await getSessionUser(req);
  if (!user) {
    res.status(200).json({ user: null });
    return;
  }

  res.status(200).json({
    user: {
      id: user.id,
      username: user.username,
      globalName: user.globalName,
      avatarUrl: user.avatarUrl,
      isAdmin: user.isAdmin,
      team: user.teamId ? { id: user.teamId, name: user.teamName } : null,
    },
  });
}
