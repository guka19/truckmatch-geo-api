import mongoose from "mongoose";

const DriverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    experience: { type: String, required: true, trim: true },
    categories: { type: [String], default: [] },
    rating: { type: Number, default: 0 },
    bio: { type: String, default: "" },
    verified: { type: Boolean, default: false },
    trips: { type: Number, default: 0 },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    workZone: { type: String, default: "" },
  },
  { timestamps: true }
);

export const Driver = mongoose.model("Driver", DriverSchema);
