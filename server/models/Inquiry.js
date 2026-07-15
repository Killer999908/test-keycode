import mongoose from "mongoose";

const inquirySchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  projectType: String,
  message: String,
  status: { type: String, default: "new" },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Inquiry || mongoose.model("Inquiry", inquirySchema);
