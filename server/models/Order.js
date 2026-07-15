import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [{
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
    name: String,
    price: Number,
    addons: [{
      name: String,
      price: Number
    }],
    customizations: mongoose.Schema.Types.Mixed,
    quantity: { type: Number, default: 1 }
  }],
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ["pending", "confirmed", "in_progress", "review", "completed", "cancelled"],
    default: "pending"
  },
  paymentStatus: { type: String, enum: ["pending", "paid", "refunded"], default: "pending" },
  paymentId: String,
  billingAddress: {
    name: String,
    email: String,
    phone: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    country: String
  },
  notes: String,
  adminNotes: String,
  timeline: [{
    status: String,
    note: String,
    date: { type: Date, default: Date.now }
  }],
  deliveryFiles: [{
    filename: String,
    filepath: String,
    size: Number,
    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  projectType: { type: String, enum: ['website', 'cad', 'pcb', 'mcu', 'circuit', 'general'] },
  projectData: { type: mongoose.Schema.Types.Mixed },
  projectFileId: String,
  pricingTier: { type: String, enum: ['basic', 'standard', 'premium'], default: 'basic' },
  complexity: { type: Number, min: 1, max: 10, default: 3 },
  deployment: {
    deployed: { type: Boolean, default: false },
    deployedAt: Date,
    liveUrl: String,
  },
  needsAdminReview: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.models.Order || mongoose.model("Order", orderSchema);
