import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tokenHash: { type: String, required: true, index: true },
  family: { type: String, required: true, index: true },
  deviceFingerprint: { type: String, default: "" },
  ip: String,
  userAgent: String,
  expiresAt: { type: Date, required: true },
  revoked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.RefreshToken || mongoose.model("RefreshToken", refreshTokenSchema);
