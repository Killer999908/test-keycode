'use strict';
// ============================================================
//  PAYMENT CONFIG — lib/payment-config.js
//  ONE answer to "can this deployment actually take this payment?".
//
//  The checkout UI and /api/payment/create-intent both read this module, so a
//  rail that cannot settle money is never offered and never silently faked:
//    card -> only when a real Stripe key is configured
//    UPI  -> only when UPI_ID is a real, valid VPA and the region is priced in INR
//  A rail that is unavailable comes with the reason, which is what the UI shows.
// ============================================================

// Values copied from .env.example that mean "nobody set this up yet". Paying
// them would send a customer's money to a stranger, so they are refused.
const PLACEHOLDER_UPI_IDS = [
  'keycodestudio@upi',
  'yourname@upi',
  'example@upi',
  'test@upi',
  'name@upi',
];

// VPA shape: local-part@handle, e.g. killer@okhdfcbank / 9876543210@ybl
const VPA_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,63})@[a-z][a-z0-9]{1,63}$/i;

/**
 * upiConfig(env) -> { configured, id, reason }
 * `reason` is null when configured, otherwise a sentence safe to show a visitor.
 */
function upiConfig(env) {
  const source = env || process.env;
  const raw = String(source.UPI_ID || '').trim();
  if (!raw) {
    return {
      configured: false,
      id: null,
      reason: 'UPI is not configured yet, so no QR can be generated. Set UPI_ID in .env to the UPI ID that should receive payments.',
    };
  }
  if (PLACEHOLDER_UPI_IDS.indexOf(raw.toLowerCase()) !== -1) {
    return {
      configured: false,
      id: null,
      reason: 'UPI_ID is still the placeholder "' + raw + '". Set it to your own UPI ID — otherwise every QR would pay that account, not yours.',
    };
  }
  if (!VPA_PATTERN.test(raw)) {
    return {
      configured: false,
      id: null,
      reason: 'UPI_ID "' + raw + '" is not a valid UPI ID. It should look like yourname@okhdfcbank.',
    };
  }
  return { configured: true, id: raw, reason: null };
}

/** Card rail: real Stripe keys are required before a card can be charged. */
function cardConfig(stripe, env) {
  const source = env || process.env;
  if (!stripe) {
    const webhookReady = Boolean(String(source.STRIPE_WEBHOOK_SECRET || '').trim());
    return {
      available: false,
      reason: webhookReady
        ? 'Card payments need STRIPE_SECRET_KEY configured.'
        : 'Card payments need STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET configured, plus a Stripe webhook pointed at /api/webhooks/stripe.',
    };
  }
  return { available: true, reason: null };
}

/**
 * methodsFor(region, stripe, env) -> { card, upi }
 * Each entry: { available, reason }.
 */
function methodsFor(region, stripe, env) {
  const source = env || process.env;
  const card = cardConfig(stripe, source);
  const upi = upiConfig(source);
  const currency = String((region && region.currency) || 'USD').toUpperCase();

  let upiReason = upi.reason;
  let upiAvailable = upi.configured;
  if (upiAvailable && currency !== 'INR') {
    // The QR always charges INR; asking for it while the page shows USD would
    // under-charge by roughly 100x, so it is refused instead.
    upiAvailable = false;
    upiReason = 'UPI charges in INR, but this region is priced in ' + currency + '. Pay by card instead.';
  }

  return {
    card: card,
    upi: { available: upiAvailable, reason: upiReason, id: upi.configured ? upi.id : null },
  };
}

/** True when at least one rail can actually settle money. */
function anyAvailable(methods) {
  return Boolean(methods && ((methods.card && methods.card.available) || (methods.upi && methods.upi.available)));
}

module.exports = {
  upiConfig: upiConfig,
  cardConfig: cardConfig,
  methodsFor: methodsFor,
  anyAvailable: anyAvailable,
  PLACEHOLDER_UPI_IDS: PLACEHOLDER_UPI_IDS,
};
