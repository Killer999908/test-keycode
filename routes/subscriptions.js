'use strict';

const fs = require('fs');
const path = require('path');
const { createSubscriptionStore } = require('../lib/subscriptions');
const pricing = require('../lib/pricing');

module.exports = function SubscriptionRoutes(opts) {
  const { app, requireAuth, STRIPE, projectRoot } = opts;
  const store = createSubscriptionStore(projectRoot);

  function active(subscription) {
    return Boolean(subscription &&
      subscription.status === 'active' &&
      (!subscription.renewsAt || new Date(subscription.renewsAt).getTime() > Date.now()));
  }

  app.get('/api/subscriptions', requireAuth, function (req, res) {
    try {
      const subscription = store.get(req.user.userId || req.user.id);
      // `subscriptions` keeps older clients (profile.html billing card) working;
      // the flat plan/status/amount fields feed the same card directly.
      res.json({
        success: true,
        subscription,
        subscriptions: subscription,
        active: active(subscription),
        plan: subscription ? subscription.plan : null,
        status: subscription ? subscription.status : null,
        amount: subscription ? subscription.price : null,
        interval: subscription ? subscription.interval : null,
        renewsAt: subscription ? subscription.renewsAt : null,
      });
    } catch (err) {
      console.error('[subscriptions.read]', err);
      res.status(500).json({ error: 'Could not load subscription status.' });
    }
  });

  app.post('/api/subscriptions/checkout', requireAuth, async function (req, res) {
    if (!STRIPE) {
      return res.status(503).json({ error: 'Subscription checkout is unavailable until Stripe is configured.' });
    }
    try {
      const body = req.body || {};
      const planId = String(body.plan || '').trim().toLowerCase();
      const interval = body.interval === 'yearly' ? 'yearly' : body.interval === 'monthly' ? 'monthly' : null;
      if (!interval) return res.status(400).json({ error: 'Choose a monthly or yearly billing interval.' });

      let services;
      try {
        services = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data', 'services.json'), 'utf8'));
      } catch (err) {
        console.error('[subscriptions.checkout] Could not read plan catalog:', err);
        return res.status(503).json({ error: 'Subscription plans are temporarily unavailable.' });
      }
      const plan = services.find(function (item) {
        return item && [item._id, item.slug, item.name]
          .some(value => String(value || '').trim().toLowerCase() === planId);
      });
      const baseMonthly = Number(plan && plan.basePrice);
      if (!plan || !Number.isFinite(baseMonthly) || baseMonthly <= 0) {
        return res.status(400).json({ error: 'Choose an available paid plan from the pricing page.' });
      }
      const userId = String(req.user.userId || req.user.id || '');
      if (!userId) return res.status(401).json({ error: 'Sign in to subscribe.' });

      // Price exactly the way the pricing page does: the visitor's regional price
      // in the region's own currency. One resolver, so page and charge cannot differ.
      // Yearly is 12 months at 20% off, matching the page's monthly-equivalent figure.
      const region = pricing.resolve(req);
      const currency = String(region.currency || 'USD').toLowerCase();
      const monthlyAmount = pricing.priceFor(String(plan.slug || plan._id), region, baseMonthly);
      const unitAmount = pricing.minorUnits(monthlyAmount * (interval === 'yearly' ? 0.8 * 12 : 1), currency);
      if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
        return res.status(503).json({ error: 'That plan is not priced right now. Please try again later.' });
      }
      const origin = (process.env.APP_URL || process.env.FRONTEND_URL || 'https://keycode.studio').replace(/\/$/, '');
      const session = await STRIPE.checkout.sessions.create({
        mode: 'subscription',
        client_reference_id: userId,
        customer_email: req.user.email || undefined,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: currency,
            unit_amount: unitAmount,
            recurring: { interval: interval === 'yearly' ? 'year' : 'month' },
            product_data: { name: 'KEYCODE Studio ' + plan.name + ' plan' },
          },
        }],
        metadata: {
          type: 'subscription',
          userId,
          plan: String(plan.slug || plan._id),
          planName: String(plan.name),
          interval,
          currency,
          unitAmount: String(unitAmount),
        },
        subscription_data: {
          metadata: {
            userId,
            plan: String(plan.slug || plan._id),
            planName: String(plan.name),
            interval,
            currency,
            unitAmount: String(unitAmount),
          },
        },
        success_url: origin + '/subscribe.html?checkout=success&plan=' +
          encodeURIComponent(String(plan.slug || plan._id)) +
          '&interval=' + interval + '&session_id={CHECKOUT_SESSION_ID}',
        cancel_url: origin + '/subscribe.html?checkout=cancel&plan=' +
          encodeURIComponent(String(plan.slug || plan._id)) + '&interval=' + interval,
      });
      if (!session || !session.id || !session.url) {
        throw new Error('Stripe did not return a checkout URL.');
      }
      store.saveCheckout(session.id, {
        userId,
        plan: String(plan.slug || plan._id),
        interval,
        amount: unitAmount / 100,
        unitAmount,
        currency,
        status: 'pending',
      });
      res.status(201).json({ success: true, checkoutUrl: session.url, sessionId: session.id });
    } catch (err) {
      console.error('[subscriptions.checkout]', err);
      res.status(502).json({ error: 'Could not start secure subscription checkout.' });
    }
  });

  app.get('/api/subscriptions/checkout/:sessionId/verify', requireAuth, async function (req, res) {
    if (!STRIPE) {
      return res.status(503).json({ error: 'Subscription verification is unavailable until Stripe is configured.' });
    }
    try {
      const session = await STRIPE.checkout.sessions.retrieve(req.params.sessionId, { expand: ['subscription'] });
      const userId = String(req.user.userId || req.user.id || '');
      if (!session || session.client_reference_id !== userId ||
          !session.metadata || session.metadata.userId !== userId ||
          session.metadata.type !== 'subscription') {
        return res.status(404).json({ error: 'Subscription checkout not found for this account.' });
      }
      if (session.payment_status !== 'paid' || session.mode !== 'subscription') {
        return res.json({ success: true, active: false, status: session.status === 'complete' ? 'processing' : 'pending' });
      }
      const checkout = store.getCheckout(session.id);
      const existing = store.get(userId);
      const alreadyActivated = existing && existing.stripeCheckoutSessionId === session.id && active(existing);
      // Compare minor units directly: a zero-decimal currency would break the
      // naive amount*100 round-trip, and a mismatch must never activate a plan
      // nobody paid for.
      const recordedMinor = checkout && Number.isFinite(Number(checkout.unitAmount))
        ? Number(checkout.unitAmount)
        : (checkout ? Math.round(Number(checkout.amount) * 100) : NaN);
      if (recordedMinor !== session.amount_total && !alreadyActivated) {
        return res.status(409).json({ error: 'Paid amount does not match the recorded checkout. Contact support before retrying.' });
      }
      // The checkout we recorded is the source of truth for plan and interval:
      // a paid session whose metadata disagrees must not activate a different plan.
      const meta = session.metadata || {};
      if (!alreadyActivated && checkout &&
          (String(meta.plan || '') !== String(checkout.plan) || String(meta.interval || '') !== String(checkout.interval))) {
        return res.status(409).json({ error: 'Paid plan does not match the recorded checkout. Contact support before retrying.' });
      }
      const subscription = store.activate(session);
      store.completeCheckout(session.id);
      res.json({ success: true, active: active(subscription), subscription });
    } catch (err) {
      console.error('[subscriptions.verify]', err);
      res.status(502).json({ error: 'Could not verify payment with Stripe. Your plan has not been activated.' });
    }
  });

  // /api/subscribe is the newsletter signup (routes/appdata.js). Plans can only
  // be activated here, from a verified subscription payment.

  return { store };
};
