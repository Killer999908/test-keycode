import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true },
  emailHash: { type: String, unique: true, sparse: true, index: true },
  password: { type: String, default: "" },
  phone: { type: String, trim: true },
  adminNo: { type: String, trim: true },
  adminCode: { type: String, unique: true, sparse: true },
  avatar: { type: String, default: "" },
  role: { type: String, enum: ["user", "client", "admin"], default: "user" },
  isActive: { type: Boolean, default: true },
  emailVerified: { type: Boolean, default: false },
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  otp: String,
  otpExpiry: Date,
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  authProvider: { type: String, enum: ["local", "google", "github", "discord", "otp"], default: "local" },
  providerId: { type: String, default: "" },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: String,
  trustedDevices: [{
    deviceId: String,
    userAgent: String,
    addedAt: { type: Date, default: Date.now }
  }],
  github: { type: String, default: '' },
  twitter: { type: String, default: '' },
  linkedin: { type: String, default: '' },
  website: { type: String, default: '' },
  instagram: { type: String, default: '' },
  youtube: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date
});

export default mongoose.models.User || mongoose.model("User", userSchema);
