import mongoose from "mongoose";

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  items: [{
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
    addons: [String],
    customizations: mongoose.Schema.Types.Mixed
  }],
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.models.Cart || mongoose.model("Cart", cartSchema);
