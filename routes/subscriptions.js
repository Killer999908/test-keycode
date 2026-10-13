'use strict';

const fs = require('fs');
const path = require('path');
const { createSubscriptionStore } = require('../lib/subscriptions');

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
      res.json({ success: true, subscription, active: active(subscription) });
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
      const monthlyAmount = Number(plan && plan.basePrice);
      if (!plan || !Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
        return res.status(400).json({ error: 'Choose an available paid plan from the pricing page.' });
      }
      const userId = String(req.user.userId || req.user.id || '');
      if (!userId) return res.status(401).json({ error: 'Sign in to subscribe.' });

      const unitAmount = Math.round(monthlyAmount * (interval === 'yearly' ? 0.8 * 12 : 1) * 100);
      const origin = (process.env.APP_URL || process.env.FRONTEND_URL || 'https://keycode.studio').replace(/\/$/, '');
      const session = await STRIPE.checkout.sessions.create({
        mode: 'subscription',
        client_reference_id: userId,
        customer_email: req.user.email || undefined,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
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
          unitAmount: String(unitAmount),
        },
        subscription_data: {
          metadata: {
            userId,
            plan: String(plan.slug || plan._id),
            planName: String(plan.name),
            interval,
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
      if ((!checkout || Math.round(Number(checkout.amount) * 100) !== session.amount_total) && !alreadyActivated) {
        return res.status(409).json({ error: 'Paid amount does not match the recorded checkout. Contact support before retrying.' });
      }
      const subscription = store.activate(session);
      store.completeCheckout(session.id);
      res.json({ success: true, active: active(subscription), subscription });
    } catch (err) {
      console.error('[subscriptions.verify]', err);
      res.status(502).json({ error: 'Could not verify payment with Stripe. Your plan has not been activated.' });
    }
  });

  app.post('/api/subscribe', requireAuth, function (_req, res) {
    res.status(410).json({ error: 'Plans can only be activated after a verified subscription payment.' });
  });

  return { store };
};
