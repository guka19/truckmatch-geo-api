import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
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
    role: { type: String, required: true, enum: ["driver", "owner"] },
    licenseCategory: { type: String, trim: true },
    companyName: { type: String, trim: true },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", UserSchema);
