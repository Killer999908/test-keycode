import mongoose from "mongoose";

const rewardSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["signup", "purchase", "referral", "review", "milestone"], required: true },
  points: { type: Number, required: true },
  balance: { type: Number, default: 0 },
  history: [{ type: String, points: Number, description: String, order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" }, createdAt: { type: Date, default: Date.now } }],
  lifetimeEarned: { type: Number, default: 0 },
  lifetimeRedeemed: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.models.Reward || mongoose.model("Reward", rewardSchema);
