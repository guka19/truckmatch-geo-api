import { Router } from "express";
import bcrypt from "bcryptjs";
import { requireAdmin } from "../lib/requireAdmin.js";
import { User } from "../models/User.js";
import { Job } from "../models/Job.js";
import { Subscription } from "../models/Subscription.js";
import { signAccessToken, signRefreshToken } from "../lib/auth.js";

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

function requireBootstrapToken(req, res) {
  const token = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!token) {
    res.status(500).json({ error: "ADMIN_BOOTSTRAP_TOKEN is not set" });
    return false;
  }
  const provided = req.headers["x-admin-bootstrap-token"];
  if (!provided || String(provided) !== String(token)) {
    res.status(401).json({ error: "Invalid bootstrap token" });
    return false;
  }
  return true;
}

router.post("/bootstrap", async (req, res) => {
  try {
    if (!requireBootstrapToken(req, res)) return;

    const { email, username, password, name } = req.body || {};
    if (!email || !username || !password) {
      return res.status(400).json({ error: "email, username, password საჭიროა" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "პაროლი უნდა იყოს მინიმუმ 6 სიმბოლო" });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);

    const admin = await User.findOneAndUpdate(
      {
        $or: [
          { email: String(email).toLowerCase().trim() },
          { username: String(username).toLowerCase().trim() },
        ],
      },
      {
        $set: {
          email: String(email).toLowerCase().trim(),
          username: String(username).toLowerCase().trim(),
          name: typeof name === "string" && name.trim() ? name.trim() : "Admin",
          role: "admin",
          passwordHash,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(201).json({
      ok: true,
      user: {
        id: String(admin._id),
        email: admin.email,
        username: admin.username,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error("[Admin:bootstrap]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body || {};
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: "მომხმარებელი და პაროლი საჭიროა" });
    }

    const key = String(usernameOrEmail).toLowerCase().trim();
    const admin = await User.findOne({
      $or: [{ email: key }, { username: key }],
      role: "admin",
    });

    if (!admin) return res.status(401).json({ error: "არასწორი მონაცემები" });

    const valid = await bcrypt.compare(String(password), admin.passwordHash);
    if (!valid) return res.status(401).json({ error: "არასწორი მონაცემები" });

    const payload = {
      sub: admin._id.toString(),
      email: admin.email,
      role: admin.role,
      name: admin.name,
    };

    const accessToken = await signAccessToken(payload);
    const refreshToken = await signRefreshToken(payload);
    setAuthCookies(res, accessToken, refreshToken);

    return res.json({
      user: { id: admin._id, email: admin.email, name: admin.name, role: admin.role },
    });
  } catch (err) {
    console.error("[Admin:login]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [usersCount, driversCount, ownersCount, jobsCount] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: "driver" }),
      User.countDocuments({ role: "owner" }),
      Job.countDocuments({}),
    ]);

    const latestUsers = await User.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select("email name role createdAt")
      .lean();

    const latestJobs = await Job.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select("title route type price createdAt")
      .lean();

    return res.json({
      counts: { users: usersCount, drivers: driversCount, owners: ownersCount, jobs: jobsCount },
      latestUsers: latestUsers.map((u) => ({
        id: String(u._id),
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt,
      })),
      latestJobs: latestJobs.map((j) => ({
        id: String(j._id),
        title: j.title,
        route: j.route,
        type: j.type,
        price: j.price,
        createdAt: j.createdAt,
      })),
    });
  } catch (err) {
    console.error("[Admin:stats]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { q, role } = req.query;

    const filter = {};
    if (role && String(role) !== "all") filter.role = String(role);
    if (q) {
      filter.$or = [
        { email: { $regex: String(q), $options: "i" } },
        { name: { $regex: String(q), $options: "i" } },
        { username: { $regex: String(q), $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .select("email username name role companyName licenseCategory verified phone createdAt")
      .lean();

    return res.json({
      users: users.map((u) => ({
        id: String(u._id),
        email: u.email,
        username: u.username,
        name: u.name,
        role: u.role,
        companyName: u.companyName,
        licenseCategory: u.licenseCategory,
        verified: u.verified,
        phone: u.phone,
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    console.error("[Admin:users:list]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.patch("/users/:id", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const updates = {};
    const { role, verified, name, phone, companyName, licenseCategory } = req.body || {};

    if (typeof role === "string" && ["driver", "owner", "admin"].includes(role)) updates.role = role;
    if (typeof verified === "boolean") updates.verified = verified;
    if (typeof name === "string") updates.name = name.trim();
    if (typeof phone === "string") updates.phone = phone.trim();
    if (typeof companyName === "string") updates.companyName = companyName.trim();
    if (typeof licenseCategory === "string") updates.licenseCategory = licenseCategory.trim();

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { returnDocument: "after" }
    ).lean();

    if (!updated) return res.status(404).json({ error: "მომხმარებელი ვერ მოიძებნა" });

    return res.json({
      user: {
        id: String(updated._id),
        email: updated.email,
        username: updated.username,
        name: updated.name,
        role: updated.role,
        verified: updated.verified,
        phone: updated.phone,
      },
    });
  } catch (err) {
    console.error("[Admin:users:patch]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.post("/users/:id/reset-password", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: "ახალი პაროლი მინიმუმ 6 სიმბოლო უნდა იყოს" });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 12);

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { passwordHash } },
      { returnDocument: "after" }
    ).lean();

    if (!updated) return res.status(404).json({ error: "მომხმარებელი ვერ მოიძებნა" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("[Admin:users:reset]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const deleted = await User.findByIdAndDelete(req.params.id).lean();
    if (!deleted) return res.status(404).json({ error: "მომხმარებელი ვერ მოიძებნა" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[Admin:users:delete]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.get("/jobs", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { q, type } = req.query;

    const filter = {};
    if (q) {
      filter.$or = [
        { title: { $regex: String(q), $options: "i" } },
        { route: { $regex: String(q), $options: "i" } },
        { owner: { $regex: String(q), $options: "i" } },
      ];
    }
    if (type && String(type) !== "all") filter.type = String(type);

    const jobs = await Job.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .select("title route price type date owner phone createdBy createdAt")
      .lean();

    return res.json({
      jobs: jobs.map((j) => ({
        id: String(j._id),
        title: j.title,
        route: j.route,
        price: j.price,
        type: j.type,
        date: j.date,
        owner: j.owner,
        phone: j.phone,
        createdBy: j.createdBy ? String(j.createdBy) : null,
        createdAt: j.createdAt,
      })),
    });
  } catch (err) {
    console.error("[Admin:jobs:list]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.patch("/jobs/:id", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { title, route, price, type, date, description, requirements, owner, phone } = req.body || {};
    const updates = {};

    if (typeof title === "string") updates.title = title.trim();
    if (typeof route === "string") updates.route = route.trim();
    if (typeof price === "string") updates.price = price.trim();
    if (typeof type === "string") updates.type = type.trim();
    if (typeof date === "string") updates.date = date.trim();
    if (typeof description === "string") updates.description = description;
    if (Array.isArray(requirements)) updates.requirements = requirements.map(String);
    if (typeof owner === "string") updates.owner = owner.trim();
    if (typeof phone === "string") updates.phone = phone.trim();

    const updated = await Job.findByIdAndUpdate(req.params.id, { $set: updates }, { returnDocument: "after" }).lean();
    if (!updated) return res.status(404).json({ error: "ვაკანსია ვერ მოიძებნა" });

    return res.json({
      job: {
        id: String(updated._id),
        title: updated.title,
        route: updated.route,
        price: updated.price,
        type: updated.type,
        date: updated.date,
      },
    });
  } catch (err) {
    console.error("[Admin:jobs:patch]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.delete("/jobs/:id", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const deleted = await Job.findByIdAndDelete(req.params.id).lean();
    if (!deleted) return res.status(404).json({ error: "ვაკანსია ვერ მოიძებნა" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("[Admin:jobs:delete]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.get("/drivers", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { q } = req.query;
    const filter = { role: "driver" };
    if (q) {
      filter.$or = [
        { email: { $regex: String(q), $options: "i" } },
        { name: { $regex: String(q), $options: "i" } },
        { location: { $regex: String(q), $options: "i" } },
      ];
    }

    const drivers = await User.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .select("email name location experience categories verified trips phone workZone createdAt")
      .lean();

    return res.json({
      drivers: drivers.map((d) => ({
        id: String(d._id),
        email: d.email,
        name: d.name,
        location: d.location,
        experience: d.experience,
        categories: d.categories,
        verified: d.verified,
        trips: d.trips,
        phone: d.phone,
        workZone: d.workZone,
        createdAt: d.createdAt,
      })),
    });
  } catch (err) {
    console.error("[Admin:drivers:list]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.patch("/drivers/:id", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const updates = {};
    const { verified, location, experience, categories, bio, phone, workZone, trips } = req.body || {};

    if (typeof verified === "boolean") updates.verified = verified;
    if (typeof location === "string") updates.location = location.trim();
    if (typeof experience === "string") updates.experience = experience.trim();
    if (Array.isArray(categories)) updates.categories = categories.map(String);
    if (typeof bio === "string") updates.bio = bio;
    if (typeof phone === "string") updates.phone = phone.trim();
    if (typeof workZone === "string") updates.workZone = workZone.trim();
    if (typeof trips === "number" && Number.isFinite(trips)) updates.trips = trips;

    const updated = await User.findOneAndUpdate(
      { _id: req.params.id, role: "driver" },
      { $set: updates },
      { returnDocument: "after" }
    ).lean();

    if (!updated) return res.status(404).json({ error: "მძღოლი ვერ მოიძებნა" });

    return res.json({
      driver: {
        id: String(updated._id),
        name: updated.name,
        email: updated.email,
        verified: updated.verified,
      },
    });
  } catch (err) {
    console.error("[Admin:drivers:patch]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.delete("/drivers/:id", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const deleted = await User.findOneAndDelete({ _id: req.params.id, role: "driver" }).lean();
    if (!deleted) return res.status(404).json({ error: "მძღოლი ვერ მოიძებნა" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("[Admin:drivers:delete]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

// ── Subscriptions management ──

router.get("/subscriptions", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { status } = req.query;
    const filter = {};
    if (status && String(status) !== "all") filter.status = String(status);

    const subs = await Subscription.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate("user", "email name companyName role")
      .lean();

    return res.json({
      subscriptions: subs.map((s) => ({
        id: String(s._id),
        plan: s.plan,
        status: s.status,
        jobLimit: s.jobLimit,
        priceGel: s.priceGel,
        activatedAt: s.activatedAt,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        user: s.user
          ? {
              id: String(s.user._id),
              email: s.user.email,
              name: s.user.name,
              companyName: s.user.companyName,
            }
          : null,
      })),
    });
  } catch (err) {
    console.error("[Admin:subscriptions:list]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.patch("/subscriptions/:id", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { status } = req.body || {};
    if (!status || !["active", "cancelled", "expired"].includes(status)) {
      return res.status(400).json({ error: "სტატუსი უნდა იყოს: active, cancelled, expired" });
    }

    const updates = { status };
    if (status === "active") {
      updates.activatedAt = new Date();
      updates.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    }

    const updated = await Subscription.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { returnDocument: "after" }
    )
      .populate("user", "email name companyName")
      .lean();

    if (!updated) return res.status(404).json({ error: "გამოწერა ვერ მოიძებნა" });

    return res.json({
      subscription: {
        id: String(updated._id),
        plan: updated.plan,
        status: updated.status,
        jobLimit: updated.jobLimit,
        priceGel: updated.priceGel,
        activatedAt: updated.activatedAt,
        expiresAt: updated.expiresAt,
        user: updated.user
          ? {
              id: String(updated.user._id),
              email: updated.user.email,
              name: updated.user.name,
              companyName: updated.user.companyName,
            }
          : null,
      },
    });
  } catch (err) {
    console.error("[Admin:subscriptions:patch]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

export default router;
