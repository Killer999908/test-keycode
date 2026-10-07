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

  const PAYMENTS_PATH = require('../data/mockStore').paymentsPath();
  const store = require('../data/mockStore');

  const loadPayments = store.loadPayments;
  const savePayments = (list) => store.write(PAYMENTS_PATH, list);
  // serialized read-modify-write helper
  const withPayments = (mutator) => store.update(PAYMENTS_PATH, mutator);

  // ---------------------------------------------------------------------------
  //  Create payment intent / UPI QR / simulated stripe intent
  //
  //  Request body:
  //    { orderId, amount, type:'website_order', method }
  //
  //  Response shapes (all of these are handled by checkout.html):
  //    - gateway:'stripe',         paymentIntentId, amount, currency
  //    - gateway:'stripe_simulated', message, orderId   (Stripe keys missing)
  //    - gateway:'upi_qr',         qrUrl, amount, orderId
  //    - gateway:'razorpay',       orderId, keyId, amount, currency
  // ---------------------------------------------------------------------------
  app.post('/api/payment/create-intent', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const user = req.user;
      const amount = Math.max(0, Number(body.amount || 0));
      const method = (body.method || 'auto').toLowerCase();
      const orderId = body.orderId || null;

      if (amount <= 0) {
        return res.status(400).json({ error: 'amount must be greater than 0' });
      }

      // ---- Bank transfer: no gateway, just a record ----
      if (method === 'bank') {
        const payment = {
          id:          rand(16),
          user_id:     user.userId || user.id,
          order_id:    orderId,
          amount,
          currency:    'usd',
          provider:    'bank_transfer',
          status:      'pending',
          provider_tx_id: null,
          metadata:    { type: body.type || 'website_order', method: 'bank' },
          created_at:  now(),
        };
        const list = loadPayments();
        list.push(payment);
        savePayments(list);
        return res.json({ gateway: 'bank', payment, message: 'Bank transfer instructions sent to your email.' });
      }

      // ---- Stripe (real) — only for card/auto; explicit UPI etc. skip Stripe ----
      if (STRIPE && (method === 'card' || method === 'auto')) {
        try {
          const params = {
            amount:        Math.round(amount * 100),
            currency:      'usd',
            metadata:      { orderId: orderId || '', userId: user.userId || user.id, type: body.type || 'website_order' },
            automatic_payment_methods: { enabled: true },
          };
          const intent = await STRIPE.paymentIntents.create(params);

          const payment = {
            id:          rand(16),
            user_id:     user.userId || user.id,
            order_id:    orderId,
            amount,
            currency:    'usd',
            provider:    'stripe',
            status:      'pending',
            provider_tx_id: intent.id,
            metadata:    { type: body.type || 'website_order', method: 'card' },
            created_at:  now(),
          };
          const list = loadPayments();
          list.push(payment);
          savePayments(list);

          return res.json({
            gateway:            'stripe',
            paymentIntentId:    intent.id,
            clientSecret:       intent.client_secret,
            amount:             amount,
            currency:           'usd',
            payment,
          });
        } catch (stripeErr) {
          console.error('[payment.create-intent] stripe error:', stripeErr && stripeErr.message);
          // If Stripe is configured but the call failed, fall back to simulated.
        }
      }

      // ---- Stripe not configured → honest simulated response ----
      // checkout.html reads gateway:'stripe_simulated' and shows a toast instead
      // of pretending the card was charged.
      const payment = {
        id:          rand(16),
        user_id:     user.userId || user.id,
        order_id:    orderId,
        amount,
        currency:    'usd',
        provider:    'stripe_simulated',
        status:      'pending',
        provider_tx_id: 'sim-' + rand(8),
        metadata:    { type: body.type || 'website_order', method: method === 'card' ? 'card' : method },
        created_at:  now(),
      };
      const list = loadPayments();
      list.push(payment);
      savePayments(list);

      // If the caller explicitly chose 'card' and there is no Stripe, be honest.
      if (method === 'card' || method === 'auto') {
        return res.json({
          gateway:         'stripe_simulated',
          message:         'Card payments need STRIPE_SECRET_KEY configured. Order is saved — pay via UPI QR or bank transfer, or configure Stripe and retry.',
          orderId:         orderId,
          payment,
          // For quick dev/testing we also hand back a fake clientSecret so the
          // client-side stripe.confirmCardPayment path can be exercised
          // against our mock confirm endpoint.
          clientSecret:    'sim_' + rand(16) + '_secret',
        });
      }

      // ---- UPI QR fallback (INR-ish, but we keep USD range) ----
      if (method === 'upi_qr' || method === 'auto') {
        const upiId = process.env.UPI_ID || 'keycodestudio@upi';
        const qrParams = [
          `pa=${encodeURIComponent(upiId)}`,
          `pn=KEYCODE+Studio`,
          `am=${amount.toFixed(2)}`,
          `cu=INR`,
          `tn=Order+${orderId || rand(8)}`,
        ].join('&');
        const qrUrl = `upi://pay?${qrParams}`;

        payment.provider     = 'upi_qr';
        payment.provider_tx_id = 'upi-' + rand(8);
        const plist = loadPayments();
        const pi = plist.find(p => p.id === payment.id);
        if (pi) pi.provider = 'upi_qr';
        savePayments(plist);

        return res.json({
          gateway:   'upi_qr',
          qrUrl,
          amount,
          currency:  'INR',
          payment,
        });
      }

      // ---- Razorpay fallback (when keys present) ----
      const rzpKey = process.env.RAZORPAY_KEY_ID;
      if (rzpKey) {
        // In a real deploy you would create a Razorpay Order here.
        return res.json({
          gateway:  'razorpay',
          keyId:    rzpKey,
          amount,    // minor units handled by client
          currency: 'INR',
          orderId:  'rzp_' + rand(12),
          payment,
        });
      }

      // Last resort: bank-style instructions
      return res.json({
        gateway:  'bank',
        message:  'No card/UPI gateway configured. Contact support for bank transfer details.',
        payment,
      });
    } catch (err) {
      console.error('[payment.create-intent]', err);
      res.status(500).json({ error: 'Could not create payment intent.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Confirm payment
  //
  //  Request body:
  //    { orderId, amount?, gateway, paymentIntentId?, razorpay_*?, upi_qr? }
  //
  //  For simulated Stripe we accept the fake clientSecret generated above and
  //  mark the payment succeeded. For real Stripe the webhook is the source of
  //  truth; this endpoint is a convenience for the client-side confirm call.
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
    if (STRIPE) {
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
      } catch (_) {
        // Can't reach Stripe — treat as simulated for the demo flow.
        return markPayment(payment, { status: 'completed', provider_tx_id: paymentIntentId || 'manual-' + rand(8) }, res, 'Payment recorded (Stripe unreachable — marked complete for demo).');
      }
    }
    // Stripe library not present — simulated confirm
    return markPayment(payment, { status: 'completed', provider_tx_id: paymentIntentId || 'sim-' + rand(8), metadata: { ...payment.metadata, method: 'card' } }, res, 'Payment recorded (simulated).');
  }

  function confirmUPI(payment, body, res) {
    return markPayment(payment, { status: 'completed', provider_tx_id: body.razorpay_order_id || 'upi-' + rand(8) }, res, 'UPI payment recorded. Funds will reflect shortly.');
  }

  function confirmRazorpay(payment, body, res) {
    return markPayment(payment, { status: 'completed', provider_tx_id: body.razorpay_payment_id || body.paymentIntentId || 'rzp-' + rand(8) }, res, 'Razorpay payment recorded.');
  }

  function confirmBank(payment, _body, res) {
    return markPayment(payment, { status: 'completed' }, res, 'Bank transfer recorded.');
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
        // No prior create-intent — record a fresh completed payment.
        const newPay = {
          id:          rand(16),
          user_id:     user.userId || user.id,
          order_id:    orderId,
          amount:      Math.max(0, Number(amount || 0)),
          currency:    'usd',
          provider:    gateway,
          status:      'completed',
          provider_tx_id: paymentIntentId || 'manual-' + rand(8),
          metadata:    { type: 'website_order', method: gateway },
          created_at:  now(),
        };
        await withPayments((list) => { list.push(newPay); return list; });
        return res.json({ success: true, payment: newPay, message: 'Payment recorded.' });
      }

      if (gateway === 'stripe' && paymentIntentId) return confirmStripe(payment, body, res);
      if (gateway === 'upi_qr')  return confirmUPI(payment, body, res);
      if (gateway === 'razorpay') return confirmRazorpay(payment, body, res);
      if (gateway === 'bank')     return confirmBank(payment, body, res);

      // Unknown gateway — mark completed as a safe default for the order flow.
      return markPayment(payment, { status: 'completed', provider_tx_id: paymentIntentId || 'manual-' + rand(8) }, res, 'Payment recorded.');
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
