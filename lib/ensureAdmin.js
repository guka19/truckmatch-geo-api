import bcrypt from "bcryptjs";
import { User } from "../models/User.js";

export async function ensureAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !username || !password) {
    console.log("[ensureAdminUser] skipped: missing ADMIN_EMAIL/ADMIN_USERNAME/ADMIN_PASSWORD");
    return;
  }

  const passwordHash = await bcrypt.hash(String(password), 12);

  const admin = await User.findOneAndUpdate(
    { $or: [{ email: String(email).toLowerCase().trim() }, { username: String(username).toLowerCase().trim() }] },
    {
      $set: {
        email: String(email).toLowerCase().trim(),
        username: String(username).toLowerCase().trim(),
        name: "Admin",
        role: "admin",
        passwordHash,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  console.log("[ensureAdminUser] admin ensured:", {
    id: admin?._id?.toString?.() || String(admin?._id),
    email: admin?.email,
    username: admin?.username,
    role: admin?.role,
  });
}
