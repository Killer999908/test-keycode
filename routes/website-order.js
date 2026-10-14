'use strict';
// ============================================================
//  WEBSITE ORDER ROUTES  —  /api/website-order/*
//  create (public-ish, requires auth) — maps to orders flow
// ============================================================
module.exports = function WebsiteOrderRoutes(opts) {
  const {
    app,
    SUPABASE,
    SUPABASE_ADMIN,
    STRIPE,
    rand,
    now,
    getSession,
    requireAuth,
    optionalAuth,
    IS_PROD,
  } = opts;

  const fs     = require('fs');
  const path   = require('path');
  const projectRoot = process.cwd();
  const ORDERS_PATH = path.join(projectRoot, 'data', 'mock-orders.json');
  const pricing = require('../lib/pricing');
  const paymentConfig = require('../lib/payment-config');
  const websiteOrders = require('../lib/website-orders');
  const coupons = require('../lib/coupons');

  function regionPayload(region) {
    return {
      key: region.key, label: region.label, country: region.country,
      currency: region.currency, symbol: region.symbol, regional: region.regional,
    };
  }

  function loadOrders() {
    if (!fs.existsSync(ORDERS_PATH)) return [];
    try { return JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8')); } catch (_) { return []; }
  }
  function saveOrders(list) {
    fs.mkdirSync(path.dirname(ORDERS_PATH), { recursive: true });
    fs.writeFileSync(ORDERS_PATH, JSON.stringify(list, null, 2));
  }

  function orderNumber() {
    const a = rand(3).slice(0, 6).toUpperCase();
    const b = rand(2).slice(0, 4).toUpperCase();
    return `KC-${a}-${b}`;
  }

  // ---------------------------------------------------------------------------
  //  Quote  —  GET /api/website-order/quote?service=<slug>&region=<CC>
  //
  //  The price the page shows and the price that gets charged both come from
  //  lib/pricing-regions.json, so they cannot drift apart. Public, because the
  //  checkout page needs a price before anyone signs in. No amount is ever taken
  //  from the caller.
  // ---------------------------------------------------------------------------
  app.get('/api/website-order/quote', function (req, res) {
    const region = pricing.resolve(req);
    const quote = websiteOrders.quote((req.query || {}).service, region);
    const methods = paymentConfig.methodsFor(region, STRIPE, process.env);
    const priced = Number.isFinite(Number(quote.amount));
    res.json({
      success: true,
      service: {
        slug: quote.slug,
        name: quote.name,
        matched: quote.matched,
        requested: quote.requested,
      },
      amount: priced ? quote.amount : null,
      currency: region.currency,
      symbol: region.symbol,
      unavailableReason: priced
        ? null
        : 'This service is not priced for ' + region.label + ' yet, so it cannot be ordered there.',
      region: regionPayload(region),
      methods: {
        card: { available: priced && methods.card.available, reason: methods.card.reason },
        upi: { available: priced && methods.upi.available, reason: methods.upi.reason },
      },
      anyAvailable: priced && paymentConfig.anyAvailable(methods),
    });
  });

  // ---------------------------------------------------------------------------
  //  Create website order  (used by checkout.html)
  //  POST /api/website-order
  //    { service, customerName, customerEmail, customerPhone,
  //      company, project:{name,description,budget,timeline},
  //      discountCode, paymentMethod, paymentStatus, userId? }
  //
  //  subtotal / discount / total from the request are IGNORED: the catalog is
  //  the price list, so the amount stored on the order is computed here. Custom
  //  or negotiated work is scoped over email (the Enterprise plan), not priced
  //  by the browser.
  // ---------------------------------------------------------------------------
  app.post('/api/website-order', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const user  = req.user;

      const region = pricing.resolve(req);
      const currency = String(region.currency || 'USD').toUpperCase();
      const quote = websiteOrders.quote(body.service, region);
      const subtotal = quote.amount;
      if (!Number.isFinite(Number(subtotal))) {
        return res.status(503).json({ error: 'This service is not priced for your region yet, so it cannot be ordered there.' });
      }

      let discount = 0;
      if (body.discountCode) {
        const applied = await coupons.evaluate(
          { code: body.discountCode, subtotal: subtotal, currency: currency },
          { supabase: SUPABASE, projectRoot: projectRoot }
        );
        if (!applied.valid) {
          return res.status(409).json({ error: applied.message || 'That coupon is not valid.' });
        }
        discount = applied.discount_amount;
      }
      const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);

      const order = {
        id:             rand(16),
        orderNumber:    orderNumber(),
        user_id:        user.userId || user.id,
        user_email:     (body.customerEmail || user.email || '').toLowerCase().trim(),
        user_name:      body.customerName || user.name || '',
        user_phone:     body.customerPhone || (body.phone) || '',
        company:        body.company || '',
        service:        quote.slug,
        service_name:   quote.name,
        currency:       currency,
        project: {
          name:        body.project?.name || body.projectName || 'Untitled project',
          description: body.project?.description || body.projectDescription || '',
          budget:      body.project?.budget || body.budget || '',
          timeline:    body.project?.timeline || body.timeline || '',
        },
        subtotal:        subtotal,
        discount:        discount,
        discount_code:   (body.discountCode || '').toUpperCase(),
        total:           total,
        payment_method:  body.paymentMethod || 'card',
        payment_status:  (body.paymentStatus || 'pending').toLowerCase(),
        status:          'pending',
        notes:           body.notes || '',
        created_at:      now(),
        updated_at:      now(),
      };

      // --- Supabase path ---
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN.from('orders').insert({
            id:             order.id,
            user_id:        order.user_id,
            service:        order.service,
            description:    order.project.description,
            status:         order.status,
            amount:         order.total || order.subtotal,
            currency:       String(order.currency || 'usd').toLowerCase(),
            payment_status: order.payment_status,
            due_date:       null,
            notes:          order.notes,
          }).select().single();

          if (error && !error.message.includes('duplicate')) {
            console.warn('[website-order.create] Supabase insert warn:', error.message);
          }

          const list = loadOrders();
          list.push({ ...order, supabase_id: data?.id });
          saveOrders(list);

          return res.status(201).json({ order });
        } catch (supErr) {
          console.warn('[website-order.create] Supabase failure, using mock:', supErr && supErr.message);
        }
      }

      // --- Mock path ---
      const list = loadOrders();
      list.push(order);
      saveOrders(list);
      res.status(201).json({ order });
    } catch (err) {
      console.error('[website-order.create]', err);
      res.status(500).json({ error: 'Could not create website order.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  List website orders (alias for /api/orders)
  // ---------------------------------------------------------------------------
  app.get('/api/website-order', requireAuth, async (req, res) => {
    try {
      const user = req.user;
      const email = (user.email || '').toLowerCase().trim();

      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('orders')
            .select('*')
            .eq('user_id', user.userId || user.id)
            .order('created_at', { ascending: false });
          if (!error && data) {
            return res.json({ orders: data.map(normalizeOrder) });
          }
        } catch (_) {}
      }

      const list = loadOrders().filter(
        o => o.user_email === email || o.user_id === user.userId || o.user_id === user.id
      );
      res.json({ orders: list.map(normalizeOrder) });
    } catch (err) {
      console.error('[website-order.list]', err);
      res.status(500).json({ error: 'Could not list orders.' });
    }
  });

  function normalizeOrder(o) {
    if (!o) return null;
    return {
      id:             o.id,
      orderNumber:    o.orderNumber,
      user_id:        o.user_id,
      user_email:     o.user_email,
      user_name:      o.user_name,
      user_phone:     o.user_phone,
      company:        o.company || '',
      service:        o.service,
      service_name:   o.service_name,
      project:        o.project || {},
      currency:       o.currency || 'USD',
      subtotal:       Number(o.subtotal || 0),
      discount:       Number(o.discount || 0),
      discount_code:  (o.discount_code || '').toUpperCase(),
      total:          Number(o.total || 0),
      payment_method: o.payment_method || 'card',
      payment_status: o.payment_status || 'pending',
      status:         o.status || 'pending',
      notes:          o.notes || '',
      created_at:     o.created_at,
      updated_at:     o.updated_at,
      due_date:       o.due_date || null,
    };
  }

  return {};
};
