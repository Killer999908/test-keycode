import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  name: String,
  isActive: { type: Boolean, default: true },
  subscribedAt: { type: Date, default: Date.now },
  unsubscribedAt: Date,
  preferences: {
    newsletter: { type: Boolean, default: true },
    promotions: { type: Boolean, default: true },
    productUpdates: { type: Boolean, default: true }
  },
  source: { type: String, default: "website" }
});

export default mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
