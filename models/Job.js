import mongoose from "mongoose";

const JobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    route: { type: String, required: true, trim: true },
    price: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    date: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    requirements: { type: [String], default: [] },
    owner: { type: String, default: "" },
    phone: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  },
  { timestamps: true }
);

export const Job = mongoose.model("Job", JobSchema);
