import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, enum: ["driver", "owner", "admin"] },
    licenseCategory: { type: String, trim: true },
    companyName: { type: String, trim: true },

    // Driver profile fields (used when role === "driver")
    location: { type: String, trim: true },
    experience: { type: String, trim: true },
    categories: { type: [String], default: [] },
    rating: { type: Number, default: 0 },
    bio: { type: String, default: "" },
    verified: { type: Boolean, default: false },
    trips: { type: Number, default: 0 },
    phone: { type: String, default: "" },
    workZone: { type: String, default: "" },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", UserSchema);
