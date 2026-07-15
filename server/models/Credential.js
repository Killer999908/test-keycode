import mongoose from "mongoose";

const credentialSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  credentialId: { type: String, required: true },
  publicKey: { type: String, required: true },
  counter: { type: Number, default: 0 },
  transports: { type: [String], default: [] },
  deviceName: { type: String, default: "" },
  isHardwareBacked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastUsed: { type: Date, default: Date.now }
});

export default mongoose.models.Credential || mongoose.model("Credential", credentialSchema);
