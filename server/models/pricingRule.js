const mongoose = require("mongoose");

const PricingRuleSchema = new mongoose.Schema({
  service: String,
  basePrice: Number,
  perPage: Number,
  ecommerce: Number,
  seo: Number
});

module.exports = mongoose.model("PricingRule", PricingRuleSchema);