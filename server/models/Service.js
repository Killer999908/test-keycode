import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  description: { type: String, required: true },
  shortDescription: String,
  basePrice: { type: Number, required: true },
  image: String,
  features: [String],
  addons: [{
    name: String,
    price: Number,
    description: String
  }],
  isActive: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  sortOrder: Number,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Service || mongoose.model("Service", serviceSchema);
