import mongoose from "mongoose";

const appStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.models.AppState || mongoose.model("AppState", appStateSchema);
