import { Router } from "express";
import { Subscription } from "../models/Subscription.js";
import { requireAuth } from "../lib/requireAuth.js";

const router = Router();

const PLANS = {
  starter: { jobLimit: 2, priceGel: 20 },
  business: { jobLimit: 10, priceGel: 50 },
  corporate: { jobLimit: 999999, priceGel: 100 },
};

// GET /subscriptions/me — get current user's active subscription
router.get("/me", async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    if (user.role !== "owner") {
      return res.json({ subscription: null });
    }

    const sub = await Subscription.findOne({
      user: user._id,
      status: "active",
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!sub) return res.json({ subscription: null });

    return res.json({
      subscription: {
        id: String(sub._id),
        plan: sub.plan,
        status: sub.status,
        jobLimit: sub.jobLimit,
        priceGel: sub.priceGel,
        activatedAt: sub.activatedAt,
        expiresAt: sub.expiresAt,
        createdAt: sub.createdAt,
      },
    });
  } catch (err) {
    console.error("[Subscriptions:me]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

// POST /subscriptions/pay — simulate payment and auto-activate subscription
router.post("/pay", async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    if (user.role !== "owner") {
      return res.status(403).json({ error: "მხოლოდ მფლობელებისთვის" });
    }

    const { plan } = req.body || {};
    if (!plan || !PLANS[plan]) {
      return res.status(400).json({ error: "არასწორი გეგმა" });
    }

    // Cancel any existing active subscription
    await Subscription.updateMany(
      { user: user._id, status: "active" },
      { $set: { status: "expired" } }
    );

    // Cancel any pending ones too
    await Subscription.updateMany(
      { user: user._id, status: "pending" },
      { $set: { status: "cancelled" } }
    );

    const now = new Date();
    const sub = await Subscription.create({
      user: user._id,
      plan,
      status: "active",
      jobLimit: PLANS[plan].jobLimit,
      priceGel: PLANS[plan].priceGel,
      activatedAt: now,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    });

    return res.status(201).json({
      subscription: {
        id: String(sub._id),
        plan: sub.plan,
        status: sub.status,
        jobLimit: sub.jobLimit,
        priceGel: sub.priceGel,
        activatedAt: sub.activatedAt,
        expiresAt: sub.expiresAt,
      },
    });
  } catch (err) {
    console.error("[Subscriptions:pay]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

export default router;
