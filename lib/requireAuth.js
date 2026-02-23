import { verifyAccessToken, verifyRefreshToken } from "./auth.js";
import { User } from "../models/User.js";

const ACCESS_COOKIE = "tm_access";
const REFRESH_COOKIE = "tm_refresh";

export async function getAuthUser(req) {
  const accessToken = req.cookies?.[ACCESS_COOKIE];
  if (accessToken) {
    const payload = await verifyAccessToken(accessToken);
    if (payload?.sub) {
      const user = await User.findById(payload.sub).lean();
      if (user) return user;
    }
  }

  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (refreshToken) {
    const payload = await verifyRefreshToken(refreshToken);
    if (payload?.sub) {
      const user = await User.findById(payload.sub).lean();
      if (user) return user;
    }
  }

  return null;
}

export async function requireAuth(req, res) {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "აუცილებელია ავტორიზაცია" });
    return null;
  }
  return user;
}
