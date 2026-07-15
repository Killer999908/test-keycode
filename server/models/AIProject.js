import mongoose from "mongoose";

const aiProjectSchema = new mongoose.Schema({
  projectId: { type: String, required: true, unique: true },
  userId: mongoose.Schema.Types.ObjectId,
  customerName: String,
  customerEmail: String,
  title: { type: String, required: true },
  description: String,
  projectType: String,
  encryptedFiles: { type: String, default: '' },
  encryptionIv: { type: String, default: '' },
  encryptionTag: { type: String, default: '' },
  demoHtml: { type: String, default: '' },
  status: { type: String, enum: ['generating', 'locked', 'paid', 'released'], default: 'generating' },
  price: { type: Number, default: 0 },
  paymentId: String,
  paidAt: Date,
  releaseAt: Date,
  fileTree: [{ path: String, size: Number, type: { type: String } }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.models.AIProject || mongoose.model("AIProject", aiProjectSchema);
