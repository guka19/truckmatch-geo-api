import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

// Fix MongoDB Atlas DNS (querySrv ECONNREFUSED)
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import driversRoutes from "./routes/drivers.js";
import jobsRoutes from "./routes/jobs.js";
import usersRoutes from "./routes/users.js";
import subscriptionsRoutes from "./routes/subscriptions.js";
import { connectDB } from "./lib/db.js";
import { User } from "./models/User.js";
import { ensureAdminUser } from "./lib/ensureAdmin.js";

const PORT = process.env.PORT || 4000;

const app = express();

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/drivers", driversRoutes);
app.use("/jobs", jobsRoutes);
app.use("/users", usersRoutes);
app.use("/subscriptions", subscriptionsRoutes);

app.use((err, req, res, next) => {
  console.error("[ExpressError]", err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ error: "სერვერის შეცდომა" });
});

app.get("/stats", async (req, res) => {
  try {
    const [driversCount, ownersCount] = await Promise.all([
      User.countDocuments({ role: "driver" }),
      User.countDocuments({ role: "owner" }),
    ]);

    const tripsAgg = await User.aggregate([
      { $match: { role: "driver" } },
      { $group: { _id: null, totalTrips: { $sum: { $ifNull: ["$trips", 0] } } } },
    ]);

    const finishedTrips = tripsAgg?.[0]?.totalTrips || 0;

    return res.json({
      drivers: driversCount,
      companies: ownersCount,
      finishedTrips,
    });
  } catch (err) {
    console.error("[Stats]", err);
    return res.status(500).json({ error: "სერვერის შეცდომა" });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

connectDB()
  .then(() => {
    return ensureAdminUser();
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
