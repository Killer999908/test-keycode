'use strict';
// ============================================================
//  ORDERS ROUTES  —  /api/orders/*
//  create · list (mine / admin) · get · update
// ============================================================
module.exports = function OrdersRoutes(opts) {
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

  // Local mock store for orders when Supabase is not wired.
  const ORDERS_PATH = path.join(projectRoot, 'data', 'mock-orders.json');
  function loadOrders() {
    if (!fs.existsSync(ORDERS_PATH)) return [];
    try { return JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8')); } catch (_) { return []; }
  }
  function saveOrders(list) {
    fs.mkdirSync(path.dirname(ORDERS_PATH), { recursive: true });
    fs.writeFileSync(ORDERS_PATH, JSON.stringify(list, null, 2));
  }

  // Human-readable order number: KC-<6 char>-<4 char>
  function orderNumber() {
    const a = rand(3).slice(0, 6).toUpperCase();
    const b = rand(2).slice(0, 4).toUpperCase();
    return `KC-${a}-${b}`;
  }

  // ---------------------------------------------------------------------------
  //  Create order
  //  Payload shape matches checkout.html:
  //    { service, serviceName, customerName, customerEmail, customerPhone,
  //      company, project:{name,description,budget,timeline},
  //      subtotal, discount, discountCode, total, paymentMethod, paymentStatus,
  //      userId? }
  // ---------------------------------------------------------------------------
  app.post('/api/orders', requireAuth, async (req, res) => {
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
            console.warn('[orders.create] Supabase insert warn:', error.message);
          }

          // Also persist the richer fields into our own store so listing/
          // admin panels have the full checkout payload.
          const list = loadOrders();
          list.push({ ...order, supabase_id: data?.id });
          saveOrders(list);

          return res.status(201).json({ order });
        } catch (supErr) {
          console.warn('[orders.create] Supabase failure, using mock:', supErr && supErr.message);
        }
      }

      // --- Mock path ---
      const list = loadOrders();
      list.push(order);
      saveOrders(list);
      res.status(201).json({ order });
    } catch (err) {
      console.error('[orders.create]', err);
      res.status(500).json({ error: 'Could not create order.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  List MY orders
  // ---------------------------------------------------------------------------
  app.get('/api/orders', requireAuth, async (req, res) => {
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
      console.error('[orders.list]', err);
      res.status(500).json({ error: 'Could not list orders.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Get one order  (by id OR orderNumber)
  // ---------------------------------------------------------------------------
  app.get('/api/orders/:id', optionalAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user;

      const findInSupabase = async () => {
        if (!SUPABASE) return null;
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('orders')
            .select('*')
            .or(`id.eq.${id},order_number.eq.${id}`)
            .single();
          if (!error && data) return data;
        } catch (_) {}
        return null;
      };

      let order = await findInSupabase();
      if (!order) {
        const list = loadOrders();
        order = list.find(o => o.id === id || o.orderNumber === id) || null;
      }

      if (!order) return res.status(404).json({ error: 'Order not found.' });

      // Only the owner or an admin may see full details.
      const isOwner = order.user_email === (user?.email || '').toLowerCase()
        || order.user_id === user?.userId || order.user_id === user?.id;
      const isAdmin  = (user?.role || '') === 'admin' || (user?.role || '') === 'super_admin';

      if (!isOwner && !isAdmin) {
        // Public: return only the bare confirmable fields.
        return res.json({
          order: {
            id:          order.id,
            orderNumber: order.orderNumber,
            status:      order.status,
            total:       order.total,
            created_at:  order.created_at,
          },
        });
      }

      res.json({ order: normalizeOrder(order) });
    } catch (err) {
      console.error('[orders.get]', err);
      res.status(500).json({ error: 'Could not fetch order.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Update order  (status / notes / due_date) — owner OR admin
  // ---------------------------------------------------------------------------
  app.patch('/api/orders/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const body  = req.body || {};
      const user  = req.user;

      let order = null;

      // Supabase path
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('orders')
            .select('*')
            .eq('id', id)
            .single();
          if (!error && data) {
            // authorization
            const isOwner = data.user_id === user.userId || data.user_id === user.id;
            const isAdmin  = (user.role || '') === 'admin' || (user.role || '') === 'super_admin';
            if (!isOwner && !isAdmin) {
              return res.status(403).json({ error: 'Forbidden' });
            }
            const allowed = {};
            if (body.status !== undefined) allowed.status = body.status;
            if (body.notes !== undefined)  allowed.notes = body.notes;
            if (body.due_date !== undefined) allowed.due_date = body.due_date;
            if (body.payment_status !== undefined) allowed.payment_status = body.payment_status;
            if (Object.keys(allowed).length) {
              await SUPABASE_ADMIN.from('orders').update(allowed).eq('id', id);
            }
            order = { ...data, ...allowed };
          }
        } catch (_) {}
      }

      // Mock path
      if (!order) {
        const list = loadOrders();
        const idx  = list.findIndex(o => o.id === id);
        if (idx < 0) return res.status(404).json({ error: 'Order not found.' });
        order = list[idx];

        const isOwner = order.user_email === (user.email || '').toLowerCase()
          || order.user_id === user.userId || order.user_id === user.id;
        const isAdmin  = (user.role || '') === 'admin' || (user.role || '') === 'super_admin';
        if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

        if (body.status !== undefined)      order.status        = body.status;
        if (body.notes !== undefined)       order.notes         = body.notes;
        if (body.due_date !== undefined)    order.due_date      = body.due_date;
        if (body.payment_status !== undefined) order.payment_status = body.payment_status;
        order.updated_at = now();
        list[idx] = order;
        saveOrders(list);
      }

      res.json({ order: normalizeOrder(order) });
    } catch (err) {
      console.error('[orders.update]', err);
      res.status(500).json({ error: 'Could not update order.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Admin: list ALL orders with optional filters
  // ---------------------------------------------------------------------------
  app.get('/api/admin/orders', requireAuth, async (req, res) => {
    try {
      const user = req.user;
      const role = user.role || '';
      if (role !== 'admin' && role !== 'super_admin') {
        return res.status(403).json({ error: 'Admins only.' });
      }

      const query = req.query;
      let list = loadOrders();

      if (query.status)      list = list.filter(o => o.status === query.status);
      if (query.payment_status) list = list.filter(o => o.payment_status === query.payment_status);
      if (query.service)    list = list.filter(o => o.service === query.service);
      if (query.email)      list = list.filter(o => o.user_email === query.email.toLowerCase());

      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      res.json({ orders: list.map(normalizeOrder) });
    } catch (err) {
      console.error('[orders.admin.list]', err);
      res.status(500).json({ error: 'Could not list orders.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Normalize helper (used by every response)
  // ---------------------------------------------------------------------------
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
