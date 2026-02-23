import { requireAuth } from "./requireAuth.js";

export async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    res.status(403).json({ error: "წვდომა აკრძალულია" });
    return null;
  }
  return user;
}
