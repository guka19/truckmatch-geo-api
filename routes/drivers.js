import { Router } from "express";
import { User } from "../models/User.js";
import { Subscription } from "../models/Subscription.js";
import { getAuthUser } from "../lib/requireAuth.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { q, category } = req.query;

    const authUser = await getAuthUser(req);

    // Drivers cannot view the drivers list — prompt to create owner account
    if (authUser && authUser.role === "driver") {
      return res.status(403).json({
        gate: "driver",
        error: "მძღოლებს არ აქვთ წვდომა ამ გვერდზე. შექმენით მფლობელის ანგარიში მძღოლების სანახავად.",
      });
    }

    // Owners must have active subscription
    if (authUser && authUser.role === "owner") {
      const sub = await Subscription.findOne({ user: authUser._id, status: "active" });
      if (!sub) {
        return res.status(403).json({
          gate: "no_subscription",
          error: "მძღოლების სანახავად საჭიროა აქტიური გამოწერა.",
        });
      }
    }

    const filter = { role: "driver" };
    if (q) {
      filter.$or = [
        { name: { $regex: String(q), $options: "i" } },
        { location: { $regex: String(q), $options: "i" } },
        { categories: { $regex: String(q), $options: "i" } },
      ];
    }
    if (category) {
      filter.categories = String(category).toUpperCase();
    }

    const isPreview = !authUser;
    const limit = isPreview ? 8 : 200;

    const query = User.find(filter).sort({ verified: -1, rating: -1, createdAt: -1 }).limit(limit);

    if (isPreview) {
      query.select("name location experience categories rating");
    } else {
      query.select("name location experience categories rating verified trips phone");
    }

    const drivers = await query.lean();

    return res.json({
      preview: isPreview,
      drivers: drivers.map((d) => ({
        id: String(d._id),
        name: d.name,
        location: d.location,
        experience: d.experience,
        categories: d.categories,
        rating: d.rating,
        verified: isPreview ? undefined : d.verified,
        trips: isPreview ? undefined : d.trips,
        phone: isPreview ? undefined : d.phone,
      })),
    });
  } catch (err) {
    console.error("[Drivers:list]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return res.status(401).json({ error: "აუცილებელია ავტორიზაცია" });

    if (authUser.role === "driver") {
      return res.status(403).json({ error: "მძღოლებს არ აქვთ წვდომა ამ გვერდზე." });
    }

    if (authUser.role === "owner") {
      const sub = await Subscription.findOne({ user: authUser._id, status: "active" });
      if (!sub) {
        return res.status(403).json({ error: "მძღოლების სანახავად საჭიროა აქტიური გამოწერა." });
      }
    }

    const driver = await User.findOne({ _id: req.params.id, role: "driver" }).lean();
    if (!driver) return res.status(404).json({ error: "მძღოლი ვერ მოიძებნა" });

    return res.json({
      driver: {
        id: String(driver._id),
        name: driver.name,
        location: driver.location,
        experience: driver.experience,
        categories: driver.categories,
        rating: driver.rating,
        bio: driver.bio,
        verified: driver.verified,
        trips: driver.trips,
        phone: driver.phone,
        email: driver.email,
        workZone: driver.workZone,
      },
    });
  } catch (err) {
    console.error("[Drivers:detail]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

export default router;
