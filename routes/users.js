import { Router } from "express";
import { requireAuth } from "../lib/requireAuth.js";
import { User } from "../models/User.js";

const router = Router();

router.get("/me", async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    return res.json({
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
        companyName: user.companyName,
        licenseCategory: user.licenseCategory,
        location: user.location,
        experience: user.experience,
        categories: user.categories,
        rating: user.rating,
        bio: user.bio,
        verified: user.verified,
        trips: user.trips,
        phone: user.phone,
        workZone: user.workZone,
      },
    });
  } catch (err) {
    console.error("[Users:me]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.patch("/me", async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const updates = {};

    if (user.role === "driver") {
      const { location, experience, categories, bio, phone, workZone } = req.body || {};

      if (typeof location === "string") updates.location = location.trim();
      if (typeof experience === "string") updates.experience = experience.trim();
      if (Array.isArray(categories)) updates.categories = categories.map(String);
      if (typeof bio === "string") updates.bio = bio;
      if (typeof phone === "string") updates.phone = phone.trim();
      if (typeof workZone === "string") updates.workZone = workZone.trim();
    }

    if (user.role === "owner") {
      const { companyName, phone } = req.body || {};
      if (typeof companyName === "string") updates.companyName = companyName.trim();
      if (typeof phone === "string") updates.phone = phone.trim();
    }

    const updated = await User.findByIdAndUpdate(user._id, { $set: updates }, { returnDocument: "after" }).lean();

    return res.json({
      user: {
        id: String(updated._id),
        email: updated.email,
        name: updated.name,
        role: updated.role,
        companyName: updated.companyName,
        licenseCategory: updated.licenseCategory,
        location: updated.location,
        experience: updated.experience,
        categories: updated.categories,
        rating: updated.rating,
        bio: updated.bio,
        verified: updated.verified,
        trips: updated.trips,
        phone: updated.phone,
        workZone: updated.workZone,
      },
    });
  } catch (err) {
    console.error("[Users:patch]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

export default router;
