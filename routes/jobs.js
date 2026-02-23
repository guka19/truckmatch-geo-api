import { Router } from "express";
import { Job } from "../models/Job.js";
import { User } from "../models/User.js";
import { getAuthUser, requireAuth } from "../lib/requireAuth.js";
import { Subscription } from "../models/Subscription.js";
import nodemailer from "nodemailer";

const router = Router();

function buildTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const port = process.env.SMTP_PORT ? Number(String(process.env.SMTP_PORT).trim()) : undefined;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ? String(process.env.SMTP_PASS).replace(/\s+/g, "") : undefined;

  if (!host || !port || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

router.get("/mine", async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (user.role !== "owner") {
      return res.status(403).json({ error: "წვდომა აკრძალულია" });
    }

    const jobs = await Job.find({ createdBy: user._id })
      .sort({ createdAt: -1 })
      .select("title route price type date")
      .lean();

    return res.json({
      jobs: jobs.map((j) => ({
        id: String(j._id),
        title: j.title,
        route: j.route,
        price: j.price,
        type: j.type,
        date: j.date,
      })),
    });
  } catch (err) {
    console.error("[Jobs:mine]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.post("/", async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (user.role !== "owner") {
      return res.status(403).json({ error: "წვდომა აკრძალულია" });
    }

    // Check active subscription
    const sub = await Subscription.findOne({ user: user._id, status: "active" });
    if (!sub) {
      return res.status(403).json({ error: "ვაკანსიის გამოსაქვეყნებლად საჭიროა აქტიური გამოწერა. გადადით ტარიფების გვერდზე." });
    }

    // Check job limit
    const currentJobCount = await Job.countDocuments({ createdBy: user._id });
    if (currentJobCount >= sub.jobLimit) {
      return res.status(403).json({ error: `თქვენი გეგმით დაშვებულია მაქსიმუმ ${sub.jobLimit} ვაკანსია. განაახლეთ გეგმა მეტი ვაკანსიისთვის.` });
    }

    const { title, route, price, type, date, description, requirements, phone } = req.body || {};
    if (!title || !route || !price || !type || !date) {
      return res.status(400).json({ error: "სათაური, მარშრუტი, ფასი, ტიპი და თარიღი საჭიროა" });
    }

    const job = await Job.create({
      title: String(title).trim(),
      route: String(route).trim(),
      price: String(price).trim(),
      type: String(type).trim(),
      date: String(date).trim(),
      description: typeof description === "string" ? description : "",
      requirements: Array.isArray(requirements) ? requirements.map(String) : [],
      owner: user.companyName || user.name,
      phone: typeof phone === "string" ? phone.trim() : user.phone || "",
      createdBy: user._id,
    });

    return res.status(201).json({
      job: {
        id: String(job._id),
        title: job.title,
        route: job.route,
        price: job.price,
        type: job.type,
        date: job.date,
      },
    });
  } catch (err) {
    console.error("[Jobs:create]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.post("/:id/apply", async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (user.role !== "driver") {
      return res.status(403).json({ error: "წვდომა აკრძალულია" });
    }

    const job = await Job.findById(req.params.id).lean();
    if (!job) return res.status(404).json({ error: "ვაკანსია ვერ მოიძებნა" });

    if (!job.createdBy) {
      return res.status(400).json({ error: "ვაკანსიის მფლობელი ვერ მოიძებნა" });
    }

    const owner = await User.findById(job.createdBy).select("email name companyName").lean();
    const ownerEmail = owner?.email;
    if (!ownerEmail) {
      return res.status(400).json({ error: "ვაკანსიის მფლობელის ელ-ფოსტა ვერ მოიძებნა" });
    }

    const transport = buildTransport();

    if (transport) {
      const from = process.env.SMTP_FROM || process.env.SMTP_USER;
      const subject = `TruckMatch განაცხადი: ${job.title} (${job.route})`;

      const driverLine = [
        user.name ? `სახელი: ${user.name}` : null,
        user.email ? `ელ-ფოსტა: ${user.email}` : null,
        user.phone ? `ტელ: ${user.phone}` : null,
        user.location ? `ლოკაცია: ${user.location}` : null,
        user.experience ? `გამოცდილება: ${user.experience}` : null,
        Array.isArray(user.categories) && user.categories.length ? `კატეგორიები: ${user.categories.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const jobLine = [
        `სათაური: ${job.title}`,
        `მარშრუტი: ${job.route}`,
        `ტიპი: ${job.type}`,
        `ფასი: ${job.price}`,
        `თარიღი: ${job.date}`,
        job.phone ? `კონტაქტი (ვაკანსიაზე): ${job.phone}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const text = `გამარჯობა!\n\nმიღებულია ახალი განაცხადი TruckMatch-დან.\n\nვაკანსია:\n${jobLine}\n\nმძღოლი:\n${driverLine}\n`;

      transport.sendMail({ from, to: ownerEmail, subject, text }).catch((err) => {
        console.error("[Jobs:apply] email send failed:", err);
      });
    } else {
      console.warn("[Jobs:apply] SMTP not configured, skipping email notification");
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[Jobs:apply]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { q, type } = req.query;

    const authUser = await getAuthUser(req);

    const filter = {};
    if (q) {
      filter.$or = [
        { title: { $regex: String(q), $options: "i" } },
        { route: { $regex: String(q), $options: "i" } },
      ];
    }
    if (type && String(type) !== "ყველა") {
      filter.type = String(type);
    }

    const isPreview = !authUser;
    const limit = isPreview ? 8 : 200;

    const jobs = await Job.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("title route price type date")
      .lean();

    return res.json({
      preview: isPreview,
      jobs: jobs.map((j) => ({
        id: String(j._id),
        title: j.title,
        route: j.route,
        price: j.price,
        type: j.type,
        date: j.date,
      })),
    });
  } catch (err) {
    console.error("[Jobs:list]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return res.status(401).json({ error: "აუცილებელია ავტორიზაცია" });

    const job = await Job.findById(req.params.id).lean();
    if (!job) return res.status(404).json({ error: "ვაკანსია ვერ მოიძებნა" });

    return res.json({
      job: {
        id: String(job._id),
        title: job.title,
        route: job.route,
        price: job.price,
        type: job.type,
        date: job.date,
        description: job.description,
        requirements: job.requirements,
        owner: job.owner,
        phone: job.phone,
      },
    });
  } catch (err) {
    console.error("[Jobs:detail]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

export default router;
