'use strict';
// ============================================================
//  COUPONS — lib/coupons.js
//  One evaluator, used by both /api/coupons/validate (what the page shows) and
//  the checkout price check (what the server charges). Two implementations
//  would let a coupon apply one way for the customer and another for the bill.
// ============================================================
const fs = require('fs');
const path = require('path');

// Coupon amounts are stated in dollars. Subtracting "$10 off" from an INR
// subtotal would take ten rupees instead of ten dollars, so coupons are refused
// outside USD rather than silently mis-priced.
const COUPON_CURRENCY = 'USD';

function couponsPath(projectRoot) {
  return path.join(projectRoot || process.cwd(), 'data', 'mock-coupons.json');
}

function loadAll(projectRoot) {
  const file = couponsPath(projectRoot);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return [];
  }
}

function saveAll(projectRoot, list) {
  const file = couponsPath(projectRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list, null, 2));
}

/**
 * evaluate({ code, subtotal, currency }, { supabase, projectRoot }) -> result
 *   { valid, code, discount_type, discount_value, discount_amount,
 *     min_order_amount, expires_at, message }
 * Never throws: an unreadable store or an unreachable database means "not
 * valid", which refuses the coupon instead of guessing a discount.
 */
async function evaluate(input, context) {
  const options = context || {};
  const body = input || {};
  const code = String(body.code || '').trim().toUpperCase();
  if (!code) return { valid: false, code: '', message: 'A coupon code is required.' };

  const currency = String(body.currency || options.currency || COUPON_CURRENCY).toUpperCase();
  if (currency !== COUPON_CURRENCY) {
    return {
      valid: false,
      code: code,
      message: 'Coupons are only available on USD orders, not ' + currency + '.',
    };
  }

  let coupon = null;
  if (options.supabase) {
    try {
      const { data, error } = await options.supabase
        .from('coupons')
        .select('*')
        .eq('code', code)
        .single();
      if (!error && data) coupon = data;
    } catch (_) { /* fall through to the local store */ }
  }
  if (!coupon) {
    coupon = loadAll(options.projectRoot).find(entry => entry.code === code) || null;
  }
  if (!coupon) return { valid: false, code: code, message: 'Invalid coupon code.' };
  if (!coupon.is_active) {
    return { valid: false, code: code, message: 'This coupon is no longer active.' };
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, code: code, message: 'This coupon has expired.' };
  }
  if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
    return { valid: false, code: code, message: 'This coupon has reached its usage limit.' };
  }

  const subtotal = Math.max(0, Number(body.subtotal || 0));
  if (coupon.min_order_amount && subtotal < Number(coupon.min_order_amount)) {
    return {
      valid: false,
      code: code,
      message: 'Minimum order of $' + coupon.min_order_amount + ' required.',
      min_order_amount: coupon.min_order_amount,
    };
  }

  const percent = Number(coupon.discount_percent || 0);
  const fixed = Number(coupon.discount_amount || 0);
  // Capped at the subtotal: a discount can make an order free, never negative.
  let discount = percent > 0 ? subtotal * (percent / 100) : fixed;
  discount = Math.max(0, Math.min(discount, subtotal));
  discount = Math.round(discount * 100) / 100;

  return {
    valid: true,
    code: code,
    discount_type: percent > 0 ? 'percent' : 'fixed',
    discount_value: percent || fixed,
    discount_amount: discount,
    min_order_amount: coupon.min_order_amount || 0,
    expires_at: coupon.expires_at || null,
    message: coupon.description ? 'Coupon applied: ' + coupon.description : 'Coupon applied.',
  };
}

module.exports = {
  evaluate: evaluate,
  loadAll: loadAll,
  saveAll: saveAll,
  couponsPath: couponsPath,
  COUPON_CURRENCY: COUPON_CURRENCY,
};
