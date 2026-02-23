import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "../lib/auth.js";

const router = Router();
const ACCESS_COOKIE = "tm_access";
const REFRESH_COOKIE = "tm_refresh";

function setAuthCookies(res, accessToken, refreshToken) {
  const isProd = process.env.NODE_ENV === "production";
  const cookieOpts = (maxAge) => ({
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge,
  });
  res.cookie(ACCESS_COOKIE, accessToken, cookieOpts(60 * 15 * 1000));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts(60 * 60 * 24 * 7 * 1000));
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
}

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "ელფოსტა და პაროლი საჭიროა" });
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: "არასწორი ელფოსტა ან პაროლი" });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "არასწორი ელფოსტა ან პაროლი" });
    }
    const payload = { sub: user._id.toString(), email: user.email, role: user.role, name: user.name };
    const accessToken = await signAccessToken(payload);
    const refreshToken = await signRefreshToken(payload);
    setAuthCookies(res, accessToken, refreshToken);
    return res.json({ user: { id: user._id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error("[Login]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { email, password, name, role, licenseCategory, companyName } = req.body;
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: "სახელი, ელფოსტა, პაროლი და როლი საჭიროა" });
    }
    if (!["driver", "owner"].includes(role)) {
      return res.status(400).json({ error: "არასწორი როლი" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "პაროლი უნდა იყოს მინიმუმ 6 სიმბოლო" });
    }
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ error: "ამ ელფოსტით უკვე რეგისტრირებულია ანგარიში" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: email.trim().toLowerCase(),
      passwordHash,
      name: name.trim(),
      role,
      licenseCategory: licenseCategory?.trim() || undefined,
      companyName: companyName?.trim() || undefined,
    });
    const payload = { sub: user._id.toString(), email: user.email, role: user.role, name: user.name };
    const accessToken = await signAccessToken(payload);
    const refreshToken = await signRefreshToken(payload);
    setAuthCookies(res, accessToken, refreshToken);
    return res.json({ user: { id: user._id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error("[Register]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      return res.status(401).json({ error: "აუცილებელია ავტორიზაცია" });
    }
    const payload = await verifyRefreshToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ error: "სესია ვადაგასულია" });
    }
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "მომხმარებელი ვერ მოიძებნა" });
    }
    const newPayload = { sub: user._id.toString(), email: user.email, role: user.role, name: user.name };
    const accessToken = await signAccessToken(newPayload);
    const newRefreshToken = await signRefreshToken(newPayload);
    setAuthCookies(res, accessToken, newRefreshToken);
    return res.json({ user: { id: user._id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error("[Refresh]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const accessToken = req.cookies?.[ACCESS_COOKIE];
    if (accessToken) {
      const payload = await verifyAccessToken(accessToken);
      if (payload) {
        const user = await User.findById(payload.sub);
        if (user) {
          return res.json({ user: { id: user._id, email: user.email, name: user.name, role: user.role } });
        }
      }
    }
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      const payload = await verifyRefreshToken(refreshToken);
      if (payload) {
        const user = await User.findById(payload.sub);
        if (user) {
          return res.json({ user: { id: user._id, email: user.email, name: user.name, role: user.role } });
        }
      }
    }
    return res.json({ user: null });
  } catch (err) {
    console.error("[Me]", err);
    return res.json({ user: null });
  }
});

router.post("/logout", (req, res) => {
  clearAuthCookies(res);
  return res.json({ ok: true });
});

router.get("/db-check", async (req, res) => {
  try {
    const count = await User.countDocuments();
    const users = await User.find({}).select("email name role createdAt").lean();
    return res.json({
      ok: true,
      database: "truckmatch",
      collection: "users",
      userCount: count,
      users: users.map((u) => ({
        id: String(u._id),
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    console.error("[DB Check]", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
