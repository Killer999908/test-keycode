import mongoose from "mongoose";

const referralSchema = new mongoose.Schema({
  referrer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  referred: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  code: { type: String, required: true, unique: true },
  discount: { type: Number, default: 10 },
  status: { type: String, enum: ["pending", "completed", "rewarded"], default: "pending" },
  referredEmail: String,
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  rewardGiven: { type: Boolean, default: false },
  rewardAmount: { type: Number, default: 0 },
  expiresAt: Date,
  usedAt: Date
}, { timestamps: true });

export default mongoose.models.Referral || mongoose.model("Referral", referralSchema);
