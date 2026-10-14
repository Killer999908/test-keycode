'use strict';
// ============================================================
//  MANUAL UPI VERIFICATION — lib/upi-verification.js
//  A UPI QR has no provider callback, so a UPI payment can only ever be
//  confirmed by a human checking that the transfer actually arrived. This is
//  that bookkeeping: which claims are waiting, and what confirming one does to
//  the order it belongs to.
//
//  It writes the same fields the Stripe webhook reconciler writes, so a UPI
//  order that is confirmed by hand ends up in the same state as a card order
//  Stripe confirmed: order.payment_status = 'completed', order.status =
//  'in_progress', payment.status = 'completed'.
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./mockStore');

const CURRENCY_SYMBOLS = { INR: '\u20b9', USD: '$' };

function symbolFor(currency) {
  const code = String(currency || '').toUpperCase();
  return CURRENCY_SYMBOLS[code] || (code ? code + ' ' : '');
}

function isUpi(payment) {
  return String((payment && payment.provider) || '').toLowerCase() === 'upi_qr';
}

/**
 * verificationState(payment) ->
 *   'awaiting-report'  QR created, the customer has not said they paid yet
 *   'reported'         customer reported paying; nobody has checked the bank
 *   'verified'         an owner confirmed the money arrived
 *   'rejected'         an owner checked and no money arrived
 *   null               not a UPI payment
 */
function verificationState(payment) {
  if (!isUpi(payment)) return null;
  const metadata = payment.metadata || {};
  if (metadata.verifiedAt) return 'verified';
  if (metadata.rejectedAt) return 'rejected';
  return String(payment.status || '').toLowerCase() === 'completed' ? 'reported' : 'awaiting-report';
}

function newestFirst(a, b) {
  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
}

function findOrder(orders, orderId) {
  if (!orderId) return null;
  return orders.find(order => order.id === orderId || order.orderNumber === orderId) || null;
}

function describe(payment, orders) {
  const metadata = payment.metadata || {};
  const order = findOrder(orders, payment.order_id);
  return {
    id: payment.id,
    state: verificationState(payment),
    status: payment.status || null,
    amount: Number(payment.amount || 0),
    currency: String(payment.currency || 'usd').toUpperCase(),
    symbol: symbolFor(payment.currency),
    reference: metadata.reference || payment.provider_tx_id || null,
    createdAt: payment.created_at || null,
    settledAt: metadata.verifiedAt || metadata.rejectedAt || null,
    settledBy: metadata.verifiedBy || metadata.rejectedBy || null,
    rejectionReason: metadata.rejectionReason || null,
    order: order ? {
      id: order.id,
      orderNumber: order.orderNumber || null,
      customer: order.user_name || '',
      email: order.user_email || '',
      service: order.service_name || order.service || '',
      total: Number(order.total || 0),
      currency: String(order.currency || 'USD').toUpperCase(),
      paymentStatus: order.payment_status || 'pending',
      status: order.status || 'pending',
    } : null,
  };
}

/** Everything the screen needs: what needs checking now, and what was decided. */
function list() {
  const orders = store.loadOrders();
  const payments = store.loadPayments().filter(isUpi);
  const open = payments.filter(payment => ['reported', 'awaiting-report'].includes(verificationState(payment)));
  const settled = payments
    .filter(payment => ['verified', 'rejected'].includes(verificationState(payment)))
    .sort((a, b) => {
      const am = (a.metadata || {}).verifiedAt || (a.metadata || {}).rejectedAt || 0;
      const bm = (b.metadata || {}).verifiedAt || (b.metadata || {}).rejectedAt || 0;
      return new Date(bm).getTime() - new Date(am).getTime();
    })
    .slice(0, 25);

  return {
    open: open.sort(newestFirst).map(payment => describe(payment, orders)),
    settled: settled.map(payment => describe(payment, orders)),
    counts: {
      open: open.length,
      reported: open.filter(payment => verificationState(payment) === 'reported').length,
      awaitingReport: open.filter(payment => verificationState(payment) === 'awaiting-report').length,
    },
  };
}

function recordAudit(entry) {
  const file = store.auditPath();
  let audit = {};
  try {
    audit = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    audit = {};
  }
  if (!Array.isArray(audit.entries)) audit.entries = [];
  audit.entries.push(entry);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(audit, null, 2));
}

/**
 * verify({ paymentId, reference, actorId, actorEmail, ip }) ->
 *   { payment, order }  or  { error, status }
 *
 * Allowed from either open state: money can arrive without the customer ever
 * pressing anything, and an owner who has checked their bank account should be
 * able to settle it either way.
 */
async function verify(input) {
  const options = input || {};
  const payment = store.loadPayments().find(item => item.id === options.paymentId);
  if (!payment) return { error: 'Payment not found.', status: 404 };
  if (!isUpi(payment)) return { error: 'That payment is not a UPI payment.', status: 400 };

  const state = verificationState(payment);
  if (state === 'verified') return { error: 'That payment is already verified.', status: 409 };
  if (state === 'rejected') {
    return { error: 'That payment was already rejected. Ask the customer to pay again.', status: 409 };
  }

  const at = new Date().toISOString();
  const reference = String(options.reference || '').trim().slice(0, 120) ||
    (payment.metadata || {}).reference || payment.provider_tx_id || null;
  const actor = options.actorEmail || options.actorId || 'admin';

  let updatedPayment = null;
  await store.update(store.paymentsPath(), function (payments) {
    const index = payments.findIndex(item => item.id === options.paymentId);
    if (index < 0) return payments;
    payments[index] = Object.assign({}, payments[index], {
      status: 'completed',
      metadata: Object.assign({}, payments[index].metadata || {}, {
        verified: true,
        verifiedAt: at,
        verifiedBy: actor,
        reference: reference,
      }),
    });
    updatedPayment = payments[index];
    return payments;
  });

  let updatedOrder = null;
  if (payment.order_id) {
    await store.update(store.ordersPath(), function (orders) {
      const index = orders.findIndex(order => order.id === payment.order_id || order.orderNumber === payment.order_id);
      if (index < 0) return orders;
      const status = String(orders[index].status || 'pending').toLowerCase();
      orders[index] = Object.assign({}, orders[index], {
        payment_status: 'completed',
        // Work can start now, but never drag a finished or cancelled order back.
        status: ['pending', 'confirmed'].includes(status) ? 'in_progress' : orders[index].status,
        updated_at: at,
        verification: {
          method: 'upi',
          verifiedAt: at,
          verifiedBy: actor,
          reference: reference,
        },
      });
      updatedOrder = orders[index];
      return orders;
    });
  }

  recordAudit({
    id: crypto.randomBytes(16).toString('hex'),
    user_id: options.actorId || null,
    action: 'upi.payment.verified',
    resource: 'payment',
    resource_id: payment.id,
    details: {
      orderId: payment.order_id || null,
      amount: Number(payment.amount || 0),
      currency: String(payment.currency || 'inr').toUpperCase(),
      reference: reference,
    },
    ip_address: options.ip || null,
    created_at: at,
  });

  return { payment: updatedPayment, order: updatedOrder };
}

/**
 * reject({ paymentId, reason, actorId, actorEmail, ip }) ->
 *   { payment, order }  or  { error, status }
 * "No money arrived" — the order stays unpaid and is marked as such, so nobody
 * starts work on it.
 */
async function reject(input) {
  const options = input || {};
  const reason = String(options.reason || '').trim().slice(0, 300);
  if (!reason) return { error: 'A reason is required when rejecting a UPI payment.', status: 400 };

  const payment = store.loadPayments().find(item => item.id === options.paymentId);
  if (!payment) return { error: 'Payment not found.', status: 404 };
  if (!isUpi(payment)) return { error: 'That payment is not a UPI payment.', status: 400 };

  const state = verificationState(payment);
  if (state === 'verified') return { error: 'That payment is already verified.', status: 409 };
  if (state === 'rejected') return { error: 'That payment was already rejected.', status: 409 };

  const at = new Date().toISOString();
  const actor = options.actorEmail || options.actorId || 'admin';

  let updatedPayment = null;
  await store.update(store.paymentsPath(), function (payments) {
    const index = payments.findIndex(item => item.id === options.paymentId);
    if (index < 0) return payments;
    payments[index] = Object.assign({}, payments[index], {
      status: 'failed',
      metadata: Object.assign({}, payments[index].metadata || {}, {
        rejectedAt: at,
        rejectedBy: actor,
        rejectionReason: reason,
      }),
    });
    updatedPayment = payments[index];
    return payments;
  });

  let updatedOrder = null;
  if (payment.order_id) {
    await store.update(store.ordersPath(), function (orders) {
      const index = orders.findIndex(order => order.id === payment.order_id || order.orderNumber === payment.order_id);
      if (index < 0) return orders;
      orders[index] = Object.assign({}, orders[index], {
        payment_status: 'failed',
        updated_at: at,
        verification: {
          method: 'upi',
          rejectedAt: at,
          rejectedBy: actor,
          rejectionReason: reason,
        },
      });
      updatedOrder = orders[index];
      return orders;
    });
  }

  recordAudit({
    id: crypto.randomBytes(16).toString('hex'),
    user_id: options.actorId || null,
    action: 'upi.payment.rejected',
    resource: 'payment',
    resource_id: payment.id,
    details: {
      orderId: payment.order_id || null,
      amount: Number(payment.amount || 0),
      currency: String(payment.currency || 'inr').toUpperCase(),
      reason: reason,
    },
    ip_address: options.ip || null,
    created_at: at,
  });

  return { payment: updatedPayment, order: updatedOrder };
}

/** How many claims are sitting unchecked — for the admin overview badge. */
function openCount() {
  return store.loadPayments()
    .filter(payment => isUpi(payment) && ['reported', 'awaiting-report'].includes(verificationState(payment)))
    .length;
}

module.exports = {
  list: list,
  verify: verify,
  reject: reject,
  openCount: openCount,
  verificationState: verificationState,
  symbolFor: symbolFor,
};
