import mongoose from "mongoose";

const SubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    plan: {
      type: String,
      required: true,
      enum: ["starter", "business", "corporate"],
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "active", "expired", "cancelled"],
      default: "pending",
    },
    jobLimit: {
      type: Number,
      required: true,
    },
    priceGel: {
      type: Number,
      required: true,
    },
    activatedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

export const Subscription =
  mongoose.models.Subscription ||
  mongoose.model("Subscription", SubscriptionSchema);
