import mongoose from "mongoose";

export async function connectDB() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!MONGO_URI) {
    throw new Error("MONGO_URI or MONGODB_URI required in .env");
  }

  await mongoose.connect(MONGO_URI);
  console.log("MongoDB connected");
}
