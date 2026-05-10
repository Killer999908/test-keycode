const mongoose = require('mongoose');

const discountCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  value: { type: Number, required: true },
  minOrderValue: { type: Number, default: 0 },
  maxUses: { type: Number, default: 1 },
  usedCount: { type: Number, default: 0 },
  validFrom: { type: Date, default: Date.now },
  validUntil: Date,
  isActive: { type: Boolean, default: true },
  applicableTo: [{ type: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  description: String
}, { timestamps: true });

discountCodeSchema.statics.isValid = async function(code) {
  const discount = await this.findOne({ 
    code: code.toUpperCase(), 
    isActive: true 
  });
  
  if (!discount) return { valid: false, reason: 'Code not found' };
  if (discount.usedCount >= discount.maxUses) return { valid: false, reason: 'Code limit reached' };
  if (discount.validUntil && discount.validUntil < new Date()) return { valid: false, reason: 'Code expired' };
  if (discount.validFrom && discount.validFrom > new Date()) return { valid: false, reason: 'Code not yet valid' };
  
  return { valid: true, discount };
};

discountCodeSchema.statics.calculateDiscount = function(discount, orderTotal) {
  if (orderTotal < discount.minOrderValue) return 0;
  
  if (discount.type === 'percentage') {
    return (orderTotal * discount.value) / 100;
  } else {
    return Math.min(discount.value, orderTotal);
  }
};

module.exports = mongoose.model('DiscountCode', discountCodeSchema);
