const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: ['signup', 'purchase', 'referral', 'review', 'milestone'],
    required: true 
  },
  points: { type: Number, required: true },
  balance: { type: Number, default: 0 },
  history: [{
    type: String,
    points: Number,
    description: String,
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    createdAt: { type: Date, default: Date.now }
  }],
  lifetimeEarned: { type: Number, default: 0 },
  lifetimeRedeemed: { type: Number, default: 0 }
}, { timestamps: true });

rewardSchema.methods.addPoints = async function(points, description, orderId = null) {
  this.points += points;
  this.balance += points;
  this.lifetimeEarned += points;
  this.history.push({
    type: 'earned',
    points,
    description,
    order: orderId
  });
  await this.save();
  return this;
};

rewardSchema.methods.redeemPoints = async function(points, description) {
  if (this.balance < points) {
    throw new Error('Insufficient points');
  }
  this.balance -= points;
  this.lifetimeRedeemed += points;
  this.history.push({
    type: 'redeemed',
    points: -points,
    description
  });
  await this.save();
  return this;
};

rewardSchema.statics.POINTS_CONFIG = {
  signup: 100,
  purchase: 10,
  referral: 500,
  review: 50,
  perDollar: 1
};

module.exports = mongoose.model('Reward', rewardSchema);
