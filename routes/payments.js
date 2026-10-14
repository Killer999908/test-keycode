'use strict';
// ============================================================
//  PAYMENTS ROUTES  —  /api/payment/*
//  create-intent · confirm · refund · list
// ============================================================
module.exports = function PaymentsRoutes(opts) {
  const {
    app,
    SUPABASE,
    SUPABASE_ADMIN,
    STRIPE,
    rand,
    now,
    getSession,
    requireAuth,
    IS_PROD,
    projectRoot,
  } = opts;

  const PAYMENTS_PATH = require('../lib/mockStore').paymentsPath();
  const store = require('../lib/mockStore');

  const loadPayments = store.loadPayments;
  const savePayments = (list) => store.write(PAYMENTS_PATH, list);
  // serialized read-modify-write helper
  const withPayments = (mutator) => store.update(PAYMENTS_PATH, mutator);

  const paymentConfig = require('../lib/payment-config');
  const pricing = require('../lib/pricing');
  const websiteOrders = require('../lib/website-orders');
  const coupons = require('../lib/coupons');

  function regionPayload(req) {
    const region = pricing.resolve(req);
    return {
      key: region.key, label: region.label, country: region.country,
      currency: region.currency, symbol: region.symbol, regional: region.regional,
    };
  }

  // ---------------------------------------------------------------------------
  //  Payment configuration (public)
  //
  //  Tells the checkout page which rails can actually settle money right now and,
  //  when one cannot, says why. The page disables the rest instead of offering a
  //  method that would silently fail.
  // ---------------------------------------------------------------------------
  app.get('/api/payment/config', function (req, res) {
    const region = pricing.resolve(req);
    // A caller that charges in a currency other than the visitor's regional one
    // (the website-order checkout bills in USD) passes it here, so the answer is
    // about the currency actually being charged, not the visitor's locale.
    const requested = String((req.query || {}).currency || '').trim().toUpperCase();
    const chargingCurrency = requested || region.currency;
    const methods = paymentConfig.methodsFor(
      Object.assign({}, region, { currency: chargingCurrency }),
      STRIPE,
      process.env
    );
    res.json({
      success: true,
      region: regionPayload(req),
      currency: chargingCurrency,
      methods: {
        card: { available: methods.card.available, reason: methods.card.reason },
        upi: { available: methods.upi.available, reason: methods.upi.reason },
      },
      anyAvailable: paymentConfig.anyAvailable(methods),
    });
  });

  // ---------------------------------------------------------------------------
  //  Create payment intent / UPI QR / simulated stripe intent
  //
  //  Request body:
  //    { orderId, amount, type:'website_order', method, currency? }
  //
  //  `currency` is the currency `amount` is expressed in; it defaults to the
  //  visitor's regional currency. A rail is refused with a reason (never a
  //  pretend success) when it cannot settle in that currency.
  //
  //  Response shapes (all of these are handled by checkout.html):
  //    - gateway:'stripe',           paymentIntentId, amount, currency
  //    - gateway:'stripe_simulated', message, orderId   (Stripe keys missing)
  //    - gateway:'upi_qr',           qrUrl, amount, currency:'INR'
  //    - gateway:'unavailable',      rail, reason       (rail cannot settle)
  // ---------------------------------------------------------------------------
  app.post('/api/payment/create-intent', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const user = req.user;
      let amount = Math.max(0, Number(body.amount || 0));
      const method = String(body.method || 'auto').toLowerCase();
      const orderId = body.orderId || null;

      if (amount <= 0) {
        return res.status(400).json({ error: 'amount must be greater than 0' });
      }

      const region = pricing.resolve(req);
      const currency = String(body.currency || region.currency || 'usd').trim().toUpperCase();
      const methods = paymentConfig.methodsFor(region, STRIPE, process.env);
      const userId = user.userId || user.id;

      function recordPayment(provider, extra) {
        const payment = Object.assign({
          id:          rand(16),
          user_id:     userId,
          order_id:    orderId,
          amount,
          currency:    currency.toLowerCase(),
          provider,
          status:      'pending',
          provider_tx_id: null,
          metadata:    { type: body.type || 'website_order', method },
          created_at:  now(),
        }, extra || {});
        const list = loadPayments();
        list.push(payment);
        savePayments(list);
        return payment;
      }

      // ---- Bank transfer: no longer offered (nothing was ever sent) ----
      if (method === 'bank') {
        return res.status(410).json({
          gateway: 'unavailable',
          rail: 'bank',
          reason: 'Bank transfer is no longer offered. Pay by card or UPI.',
          orderId,
        });
      }

      if (method !== 'card' && method !== 'auto' && method !== 'upi_qr') {
        return res.status(400).json({ error: 'Unsupported payment method.' });
      }

      // ---- Website orders are priced by the server, not by the caller ----
      // checkout.html sends the service slug; the amount and any coupon discount
      // come from lib/pricing-regions.json. Trusting the browser's number would
      // let someone pay ₹1 for a ₹12,999 order and have it recorded as paid.
      if (String(body.type || '') === 'website_order') {
        const quote = websiteOrders.quote(body.service, region);
        if (!Number.isFinite(Number(quote.amount))) {
          return res.status(503).json({ error: 'This service is not priced for your region yet.' });
        }
        let expected = quote.amount;
        if (body.discountCode) {
          const applied = await coupons.evaluate(
            { code: body.discountCode, subtotal: expected, currency: currency },
            { supabase: SUPABASE, projectRoot: projectRoot }
          );
          if (!applied.valid) {
            return res.status(409).json({ error: applied.message || 'That coupon is not valid.' });
          }
          expected = Math.max(0, Math.round((expected - applied.discount_amount) * 100) / 100);
        }
        if (currency !== String(quote.currency || '').toUpperCase() || Math.abs(amount - expected) > 0.005) {
          return res.status(409).json({ error: 'The price changed. Reload the checkout page and try again.' });
        }
        // Bill the server's figure, so what is charged is exactly what was quoted.
        amount = expected;
      }

      // ---- Card (real Stripe) ----
      if (method === 'card' || method === 'auto') {
        if (STRIPE) {
          try {
            const intent = await STRIPE.paymentIntents.create({
              amount:        pricing.minorUnits(amount, currency),
              currency:      currency.toLowerCase(),
              metadata:      { orderId: orderId || '', userId, type: body.type || 'website_order' },
              automatic_payment_methods: { enabled: true },
            });
            const payment = recordPayment('stripe', {
              provider_tx_id: intent.id,
              metadata: { type: body.type || 'website_order', method: 'card' },
            });
            return res.json({
              gateway:         'stripe',
              paymentIntentId: intent.id,
              clientSecret:    intent.client_secret,
              amount,
              currency:        currency.toLowerCase(),
              payment,
            });
          } catch (stripeErr) {
            console.error('[payment.create-intent] stripe error:', stripeErr && stripeErr.message);
            // Card rail is configured but the call failed: be honest, do not fake it.
            return res.status(502).json({
              gateway: 'unavailable',
              rail: 'card',
              reason: 'Stripe could not start this card payment. Nothing was charged — try again or pay by UPI.',
              orderId,
            });
          }
        }

        // ---- Stripe not configured → honest simulated response ----
        // checkout.html reads gateway:'stripe_simulated' and shows a toast instead
        // of pretending the card was charged.
        const payment = recordPayment('stripe_simulated', {
          provider_tx_id: 'sim-' + rand(8),
          metadata: { type: body.type || 'website_order', method: 'card' },
        });
        return res.json({
          gateway:         'stripe_simulated',
          message:         methods.card.reason || 'Card payments are not configured. Nothing was charged.',
          orderId:         orderId,
          payment,
        });
      }

      // ---- UPI QR: only when a real UPI ID exists AND we are charging INR ----
      if (method === 'upi_qr') {
        if (!methods.upi.available) {
          return res.status(503).json({
            gateway: 'unavailable',
            rail: 'upi',
            reason: methods.upi.reason || 'UPI is not configured.',
            orderId,
          });
        }
        if (currency !== 'INR') {
          // The QR always asks for INR; charging a USD figure as rupees would
          // under-charge ~100x, so refuse instead of quietly mis-billing.
          return res.status(400).json({
            gateway: 'unavailable',
            rail: 'upi',
            reason: 'UPI charges in INR, but this order is priced in ' + currency + '. Pay by card instead.',
            orderId,
          });
        }
        const qrParams = [
          `pa=${encodeURIComponent(methods.upi.id)}`,
          `pn=KEYCODE+Studio`,
          `am=${Number(amount).toFixed(2)}`,
          `cu=INR`,
          `tn=Order+${orderId || rand(8)}`,
        ].join('&');
        const payment = recordPayment('upi_qr', {
          currency: 'inr',
          provider_tx_id: 'upi-' + rand(8),
        });
        return res.json({
          gateway:  'upi_qr',
          qrUrl:    `upi://pay?${qrParams}`,
          upiId:    methods.upi.id,
          amount,
          currency: 'INR',
          payment,
        });
      }
    } catch (err) {
      console.error('[payment.create-intent]', err);
      res.status(500).json({ error: 'Could not create payment intent.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Confirm payment
  //
  //  Request body:
  //    { orderId, gateway, paymentIntentId?, upiReference? }
  //
  //  Confirming is the second half of a create-intent: without the pending
  //  payment it recorded, there is nothing to confirm. For real Stripe the
  //  webhook stays the source of truth; this endpoint is the client-side check.
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  //  Confirm payment — dispatches to per-gateway confirm functions below
  // ---------------------------------------------------------------------------
  // Shared helper: persist a status update for one payment record and reply.
  function markPayment(payment, fields, res, message, statusOverride) {
    return withPayments((list) => {
      const idx = list.findIndex(p => p.id === payment.id);
      const updated = { ...payment, ...fields, status: statusOverride || fields.status || payment.status };
      if (idx >= 0) list[idx] = updated;
      else list.push(updated);
      return list;
    }).then((list) => {
      const updated = list.find(p => p.id === payment.id) || payment;
      res.json({ success: true, payment: updated, message });
    });
  }

  async function confirmStripe(payment, { paymentIntentId }, res) {
    if (!STRIPE) {
      // Card payments are off, so a card payment cannot have been made. Marking
      // it completed here would hand out a paid order for free.
      return res.status(503).json({
        success: false,
        error: 'Card payments are not configured, so this payment cannot be confirmed.',
        payment,
      });
    }
    try {
      const intent = await STRIPE.paymentIntents.retrieve(paymentIntentId);
      if (intent.status === 'succeeded') {
        return markPayment(payment, { provider_tx_id: intent.id, status: 'completed', metadata: { ...payment.metadata, method: 'card' } }, res, 'Payment confirmed via Stripe.');
      }
      if (intent.status === 'requires_payment_method' || intent.status === 'canceled') {
        await markPayment(payment, { status: 'failed' }, res, '');
        return res.status(400).json({ success: false, error: 'Payment not successful.', payment });
      }
      // Still processing — the webhook will reconcile shortly.
      return markPayment(payment, { status: 'pending' }, res, 'Payment is processing; confirmation email will follow.');
    } catch (err) {
      // Never claim a charge we could not verify with Stripe.
      console.error('[payment.confirm] stripe lookup failed:', err && err.message);
      return res.status(502).json({
        success: false,
        error: 'Could not verify this card payment with Stripe. Your payment status is unchanged.',
        payment,
      });
    }
  }

  // A plain UPI QR has no provider callback, so this records what the payer says
  // happened. The transfer still has to be checked before the order moves on.
  function confirmUPI(payment, body, res) {
    return markPayment(
      payment,
      { status: 'completed', provider_tx_id: body.upiReference || 'upi-' + rand(8) },
      res,
      'UPI payment reported and recorded. It is verified once the transfer reaches the account.'
    );
  }

  app.post('/api/payment/confirm', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const user = req.user;
      const { orderId, amount, gateway, paymentIntentId } = body;

      if (!gateway) return res.status(400).json({ error: 'gateway is required' });

      // Find the pending payment for this user + order
      const payment = loadPayments().find(p =>
        p.order_id === orderId &&
        (p.user_id === user.userId || p.user_id === user.id) &&
        (p.status === 'pending' || p.status === 'failed')
      );

      if (!payment) {
        // Confirmation is only ever the second half of a create-intent. Without
        // that recorded intent there is nothing to confirm, and inventing a
        // "completed" payment here would mark an order paid that nobody paid for.
        return res.status(404).json({ error: 'No pending payment found for this order. Start the payment first.' });
      }

      if (gateway === 'stripe' && paymentIntentId) return confirmStripe(payment, body, res);
      if (gateway === 'upi_qr')  return confirmUPI(payment, body, res);

      return res.status(400).json({ error: 'Unsupported payment gateway.' });
    } catch (err) {
      console.error('[payment.confirm]', err);
      res.status(500).json({ error: 'Could not confirm payment.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Refund
  //    { paymentIntentId or paymentId, amount?, reason }
  // ---------------------------------------------------------------------------
  app.post('/api/payment/refund', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const user = req.user;
      const role = user.role || '';
      const isAdmin = role === 'admin' || role === 'super_admin';

      const targetId = body.paymentIntentId || body.paymentId;
      if (!targetId) return res.status(400).json({ error: 'paymentIntentId or paymentId required' });

      let payment = null;

      // Supabase-backed refund
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('payments')
            .select('*')
            .eq('provider_tx_id', targetId)
            .single();
          if (!error && data) payment = data;
        } catch (_) {}
      }

      // Mock refund
      if (!payment) {
        const list = loadPayments();
        payment = list.find(p => p.provider_tx_id === targetId) || null;
        if (!payment) return res.status(404).json({ error: 'Payment not found.' });
      }

      if (!isAdmin && payment.user_id !== user.userId && payment.user_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const refundAmount = body.amount ? Math.min(Number(body.amount), Number(payment.amount || 0)) : Number(payment.amount || 0);

      // Real Stripe refund
      if (STRIPE && payment.provider === 'stripe' && payment.provider_tx_id && payment.provider_tx_id.startsWith('pi_')) {
        try {
          const refund = await STRIPE.refunds.create({
            payment_intent: payment.provider_tx_id,
            amount: Math.round(refundAmount * 100),
            reason: body.reason || 'requested_by_customer',
          });
          payment.status = 'refunded';
          savePayments(loadPayments().map(p => p.provider_tx_id === payment.provider_tx_id ? { ...p, status: 'refunded' } : p));
          return res.json({ success: true, refund: { id: refund.id, amount: refundAmount }, payment });
        } catch (e) {
          console.error('[payment.refund] stripe refund failed:', e && e.message);
        }
      }

      // Mock refund
      payment.status = 'refunded';
      const mlist = loadPayments();
      const mi = mlist.findIndex(p => p.provider_tx_id === payment.provider_tx_id);
      if (mi >= 0) mlist[mi] = { ...payment, status: 'refunded' };
      savePayments(mlist);
      res.json({ success: true, refund: { id: 'ref-' + rand(8), amount: refundAmount }, payment });
    } catch (err) {
      console.error('[payment.refund]', err);
      res.status(500).json({ error: 'Could not process refund.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  List payments (mine / admin all)
  // ---------------------------------------------------------------------------
  app.get('/api/payment/list', requireAuth, async (req, res) => {
    try {
      const user = req.user;
      const role = user.role || '';
      const isAdmin = role === 'admin' || role === 'super_admin';

      let list = loadPayments();
      if (!isAdmin) {
        list = list.filter(p => p.user_id === user.userId || p.user_id === user.id);
      }
      if (req.query.orderId) list = list.filter(p => p.order_id === req.query.orderId);
      if (req.query.status)  list = list.filter(p => p.status === req.query.status);

      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      res.json({ payments: list });
    } catch (err) {
      console.error('[payment.list]', err);
      res.status(500).json({ error: 'Could not list payments.' });
    }
  });

  return {};
};
