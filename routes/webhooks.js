'use strict';
// ============================================================
//  WEBHOOKS  —  /api/webhooks/*
//  Stripe events · admin audit entry
// ============================================================
module.exports = function WebhookRoutes(opts) {
  const {
    app,
    SUPABASE,
    SUPABASE_ADMIN,
    STRIPE,
    hash,
    now,
    getSession,
    requireAuth,
  } = opts;

  const store = require('../data/mockStore');
  const fs   = require('fs');
  const path = require('path');
  const projectRoot = process.cwd();
  const ORDERS_PATH = store.ordersPath();
  const PAYMENTS_PATH = store.paymentsPath();
  const loadOrders = store.loadOrders;
  const saveOrders = (list) => store.write(ORDERS_PATH, list);
  const loadPayments = store.loadPayments;
  const savePayments = (list) => store.write(PAYMENTS_PATH, list);

  // ---------------------------------------------------------------------------
  //  Stripe webhook
  //    Verified with STRIPE_WEBHOOK_SECRET when set, otherwise trusted in dev.
  // ---------------------------------------------------------------------------
  app.post('/api/webhooks/stripe', async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const rawBody   = req.rawBody || req.body; // Express json middleware already parsed
    let event;

    if (STRIPE && signature && process.env.STRIPE_WEBHOOK_SECRET) {
      try {
        event = STRIPE.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.warn('[webhook.stripe] signature verification failed:', err && err.message);
        return res.status(400).json({ error: 'Invalid signature' });
      }
    } else {
      // Dev / no-secret mode: trust the payload shape.
      event = (typeof rawBody === 'object' && rawBody) ? rawBody : {};
      if (!event.type) {
        return res.status(400).json({ error: 'No event type' });
      }
    }

    console.log(`[webhook.stripe] ${event.type}`);

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const pi = event.data.object;
          await reconcilePayment(pi.id, 'completed', pi.amount ? pi.amount / 100 : null);
          break;
        }
        case 'payment_intent.payment_failed': {
          const pi = event.data.object;
          await reconcilePayment(pi.id, 'failed');
          break;
        }
        case 'charge.refunded': {
          const ch = event.data.object;
          await reconcilePayment(ch.payment_intent, 'refunded');
          break;
        }
        case 'checkout.session.completed': {
          const s = event.data.object;
          // Link the session to an order by metadata.orderId
          const orderId = s.metadata && s.metadata.orderId;
          if (orderId) {
            await linkOrderPayment(orderId, s.payment_intent, 'completed', s.amount_total ? s.amount_total / 100 : null);
          }
          break;
        }
        default:
          console.log(`[webhook.stripe] unhandled event type: ${event.type}`);
      }
      res.json({ received: true });
    } catch (err) {
      console.error('[webhook.stripe] handler error:', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Generic admin audit-log entry (for the admin panel / control panel)
  // ---------------------------------------------------------------------------
  app.post('/api/admin/audit', requireAuth, requireAuthAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.action) return res.status(400).json({ error: 'action is required' });

      const entry = {
        id:         rand(16),
        user_id:    (req.user && req.user.userId) || (req.user && req.user.id) || null,
        action:     body.action,
        resource:   body.resource || 'manual',
        resource_id: body.resource_id || null,
        details:    body.details || {},
        ip_address: req.ip || req.connection?.remoteAddress || null,
        created_at: now(),
      };

      // Persist into Supabase audit_logs if available
      if (SUPABASE_ADMIN) {
        try {
          await SUPABASE_ADMIN.from('audit_logs').insert({
            id: entry.id, user_id: entry.user_id, action: entry.action,
            resource: entry.resource, resource_id: entry.resource_id,
            details: entry.details, ip_address: entry.ip_address,
          });
        } catch (_) {}
      }

      const PATH = path.join(projectRoot, 'data', 'mock-audit.json');
      let store = {};
      try { store = JSON.parse(fs.readFileSync(PATH, 'utf8')); } catch (_) { store = {}; }
      if (!store.entries) store.entries = [];
      store.entries.push(entry);
      fs.mkdirSync(path.dirname(PATH), { recursive: true });
      fs.writeFileSync(PATH, JSON.stringify(store, null, 2));

      res.status(201).json({ audit: entry });
    } catch (err) {
      console.error('[admin.audit]', err);
      res.status(500).json({ error: 'Audit entry failed.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Helpers
  // ---------------------------------------------------------------------------
  async function reconcilePayment(providerTxId, status, amount) {
    // Update the mock payment record (serialized with other writes)
    const match = await store.update(PAYMENTS_PATH, (payments) => {
      const i = payments.findIndex(p => p.provider_tx_id === providerTxId);
      if (i < 0) return payments;
      payments[i] = {
        ...payments[i],
        status,
        amount: amount !== null && amount !== undefined ? amount : payments[i].amount,
      };
      return payments;
    });
    const payments = Array.isArray(match) ? match : loadPayments();
    const idx = payments.findIndex(p => p.provider_tx_id === providerTxId);

    // Also update the Supabase payments table if present
    if (SUPABASE_ADMIN) {
      try {
        await SUPABASE_ADMIN.from('payments')
          .update({ status })
          .eq('provider_tx_id', providerTxId);
      } catch (_) {}
    }

    // Update the associated order's payment_status
    let orderIdMatch = payments[idx] ? payments[idx].order_id : null;
    // Mock record missing — fall back to the Supabase payments row so the
    // order still gets reconciled.
    if (!orderIdMatch && SUPABASE_ADMIN) {
      try {
        const { data } = await SUPABASE_ADMIN.from('payments')
          .select('order_id')
          .eq('provider_tx_id', providerTxId)
          .single();
        if (data && data.order_id) orderIdMatch = data.order_id;
      } catch (_) {}
    }
    if (orderIdMatch) {
      let orders = loadOrders();
      const oidx = orders.findIndex(o => o.id === orderIdMatch);
      if (oidx >= 0) {
        orders[oidx].payment_status = status;
        orders[oidx].updated_at = now();
        if (status === 'completed') orders[oidx].status = 'in_progress';
        saveOrders(orders);
      }
      if (SUPABASE_ADMIN) {
        try {
          await SUPABASE_ADMIN.from('orders')
            .update({ payment_status: status, updated_at: now() })
            .eq('id', orderIdMatch);
        } catch (_) {}
      }
    }
  }

  async function linkOrderPayment(orderId, paymentIntentId, status, amount) {
    let orders = loadOrders();
    const oidx = orders.findIndex(o => o.id === orderId || o.orderNumber === orderId);
    if (oidx < 0) return;

    orders[oidx].payment_status = status;
    orders[oidx].updated_at = now();
    if (status === 'completed') orders[oidx].status = 'in_progress';
    saveOrders(orders);

    // Create / update the payment record
    let payments = loadPayments();
    const existing = payments.find(p => p.order_id === orderId && p.provider_tx_id === paymentIntentId);
    if (!existing) {
      payments.push({
        id:         rand(16),
        user_id:    orders[oidx].user_id,
        order_id:   orderId,
        amount:     amount !== null && amount !== undefined ? amount : orders[oidx].total || orders[oidx].subtotal,
        currency:   'usd',
        provider:   'stripe',
        status,
        provider_tx_id: paymentIntentId,
        metadata:   { type: 'website_order', method: 'card' },
        created_at: now(),
      });
      savePayments(payments);
    }
  }

  function requireAuthAdmin(req, res, next) {
    const role = (req.user && req.user.role) || '';
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Admins only.' });
    }
    next();
  }
  // Suppress no-unused-vars for rand in this module scope.
  void rand;

  function rand(n = 16) { return require('crypto').randomBytes(n).toString('hex'); }

  return {};
};
