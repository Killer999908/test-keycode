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
  //  Create website order  (used by checkout.html)
  //  POST /api/website-order
  //    { service, serviceName, customerName, customerEmail, customerPhone,
  //      company, project:{name,description,budget,timeline},
  //      subtotal, discount, discountCode, total, paymentMethod, paymentStatus,
  //      userId? }
  // ---------------------------------------------------------------------------
  app.post('/api/website-order', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const user  = req.user;

      const order = {
        id:             rand(16),
        orderNumber:    orderNumber(),
        user_id:        user.userId || user.id,
        user_email:     (body.customerEmail || user.email || '').toLowerCase().trim(),
        user_name:      body.customerName || user.name || '',
        user_phone:     body.customerPhone || (body.phone) || '',
        company:        body.company || '',
        service:        body.service || body.id || 'custom',
        service_name:   body.serviceName || body.name || 'Custom Project',
        project: {
          name:        body.project?.name || body.projectName || 'Untitled project',
          description: body.project?.description || body.projectDescription || '',
          budget:      body.project?.budget || body.budget || '',
          timeline:    body.project?.timeline || body.timeline || '',
        },
        subtotal:        Number(body.subtotal || 0),
        discount:        Number(body.discount || 0),
        discount_code:   (body.discountCode || '').toUpperCase(),
        total:           Number(body.total || 0),
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
            currency:       'usd',
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
