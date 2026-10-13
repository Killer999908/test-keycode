'use strict';

const fs = require('fs');
const path = require('path');

function createSubscriptionStore(projectRoot) {
  const subscriptionsPath = path.join(projectRoot, 'data', 'mock-subscriptions.json');
  const checkoutsPath = path.join(projectRoot, 'data', 'mock-subscription-checkouts.json');

  function read(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return {};
      throw err;
    }
  }

  function write(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, file);
  }

  function get(userId) {
    return read(subscriptionsPath)[userId] || null;
  }

  function getCheckout(sessionId) {
    return read(checkoutsPath)[sessionId] || null;
  }

  function saveCheckout(sessionId, checkout) {
    const checkouts = read(checkoutsPath);
    checkouts[sessionId] = checkout;
    write(checkoutsPath, checkouts);
  }

  function completeCheckout(sessionId) {
    const checkouts = read(checkoutsPath);
    if (!checkouts[sessionId]) return;
    checkouts[sessionId].status = 'completed';
    write(checkoutsPath, checkouts);
  }

  function activate(session, now) {
    if (!session || session.mode !== 'subscription' || session.payment_status !== 'paid') {
      throw new Error('Only paid subscription checkout sessions can activate a plan.');
    }
    const metadata = session.metadata || {};
    const userId = String(session.client_reference_id || metadata.userId || '');
    const plan = String(metadata.plan || '');
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription && session.subscription.id;
    if (!userId || !plan || !subscriptionId) {
      throw new Error('Paid subscription checkout is missing its user, plan, or subscription ID.');
    }

    const interval = metadata.interval === 'yearly' ? 'yearly' : 'monthly';
    const startedAt = now || new Date().toISOString();
    const subscriptions = read(subscriptionsPath);
    const current = subscriptions[userId];
    const renewsAt = stripeSubscriptionEnd(session) || new Date(
      new Date(startedAt).getTime() + (interval === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000
    ).toISOString();
    const record = {
      plan,
      status: 'active',
      interval,
      price: Number(metadata.unitAmount) / 100,
      currency: String(session.currency || 'usd').toLowerCase(),
      startedAt: current && current.stripeSubscriptionId === subscriptionId
        ? current.startedAt
        : startedAt,
      renewsAt,
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
      stripeSubscriptionId: subscriptionId,
      stripeCheckoutSessionId: session.id || null,
    };
    subscriptions[userId] = record;
    write(subscriptionsPath, subscriptions);
    return record;
  }

  function updateStripeSubscription(stripeSubscription, now) {
    const metadata = stripeSubscription && stripeSubscription.metadata || {};
    const userId = String(metadata.userId || '');
    if (!userId) return null;
    const subscriptions = read(subscriptionsPath);
    const current = subscriptions[userId];
    if (!current || current.stripeSubscriptionId !== stripeSubscription.id) return null;

    const status = stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing'
      ? 'active'
      : stripeSubscription.status === 'canceled' || stripeSubscription.status === 'incomplete_expired'
        ? 'canceled'
        : 'past_due';
    const periodEnd = stripeSubscription.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
      : current.renewsAt || now || new Date().toISOString();
    subscriptions[userId] = { ...current, status, renewsAt: periodEnd };
    write(subscriptionsPath, subscriptions);
    return subscriptions[userId];
  }

  return { get, getCheckout, saveCheckout, completeCheckout, activate, updateStripeSubscription };
}

function stripeSubscriptionEnd(session) {
  const subscription = session && session.subscription;
  const end = subscription && typeof subscription === 'object' && subscription.current_period_end;
  return end ? new Date(end * 1000).toISOString() : null;
}

module.exports = { createSubscriptionStore };
