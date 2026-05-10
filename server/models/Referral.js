const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  referred: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  code: { type: String, required: true, unique: true },
  discount: { type: Number, default: 10 },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'rewarded'],
    default: 'pending' 
  },
  referredEmail: String,
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  rewardGiven: { type: Boolean, default: false },
  rewardAmount: { type: Number, default: 0 },
  expiresAt: Date,
  usedAt: Date
}, { timestamps: true });

referralSchema.statics.generateCode = function() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KEY';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

module.exports = mongoose.model('Referral', referralSchema);
