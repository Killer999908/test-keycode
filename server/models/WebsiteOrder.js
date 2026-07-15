import mongoose from "mongoose";

const websiteOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  project: {
    name: { type: String, default: '' },
    type: { type: String, default: '' },
    budget: { type: String, default: '' },
    timeline: { type: String, default: '' },
    description: { type: String, default: '' },
    htmlCode: { type: String, default: '' }
  },
  hosting: {
    id: { type: String, default: '' },
    name: { type: String, default: '' },
    price: { type: Number, default: 0 },
    billing: { type: String, default: 'yearly' }
  },
  domains: [{
    domain: { type: String, default: '' },
    tld: { type: String, default: '' },
    price: { type: Number, default: 0 }
  }],
  addons: [{
    id: { type: String, default: '' },
    name: { type: String, default: '' },
    price: { type: Number, default: 0 },
    billing: { type: String, default: 'yearly' }
  }],
  subtotal: Number,
  discount: Number,
  discountCode: String,
  total: Number,
  paymentMethod: { type: String, default: 'card' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  paymentId: String,
  status: { type: String, enum: ['pending', 'confirmed', 'processing', 'completed', 'cancelled'], default: 'pending' },
  notes: String,
  deployment: {
    deployed: { type: Boolean, default: false },
    deployedAt: Date,
    liveUrl: String,
    cdnUrl: String,
    deployMethod: { type: String, default: 'static' }
  },
  userId: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.models.WebsiteOrder || mongoose.model("WebsiteOrder", websiteOrderSchema);
