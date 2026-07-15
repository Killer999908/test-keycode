import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  action: { type: String, required: true },
  resource: { type: String, required: true },
  resourceId: String,
  details: mongoose.Schema.Types.Mixed,
  ip: String,
  userAgent: String,
  status: { type: String, enum: ["success", "failure"], default: "success" },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
