import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["order_update", "project_generated", "deploy_complete", "payment_received", "system_alert", "admin_alert"],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  read: { type: Boolean, default: false },
  readAt: Date,
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });

export default mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
