import mongoose from "mongoose";

const webhookSchema = new mongoose.Schema({
  url: { type: String, required: true },
  secret: String,
  events: [String],
  isActive: { type: Boolean, default: true },
  lastTriggered: Date,
  failureCount: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Webhook || mongoose.model("Webhook", webhookSchema);
