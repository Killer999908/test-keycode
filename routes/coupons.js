'use strict';
// ============================================================
//  COUPONS  —  /api/coupons/*
//  validate (public) · admin CRUD
// ============================================================
module.exports = function CouponsRoutes(opts) {
  const {
    app,
    SUPABASE,
    SUPABASE_ADMIN,
    now,
    IS_PROD,
    requireAuth,
  } = opts;

  // Coupon lookup and discount maths live in lib/coupons so the public route and
  // the checkout price check can never disagree about what a code is worth.
  const coupons = require('../lib/coupons');
  const projectRoot = process.cwd();

  function loadAll() { return coupons.loadAll(projectRoot); }
  function saveAll(list) { return coupons.saveAll(projectRoot, list); }

  // ---------------------------------------------------------------------------
  //  Validate a coupon code (public — no auth required)
  //
  //  Request:  { code, subtotal (optional), currency (optional) }
  //  Response: { valid, code, discount_type, discount_value, discount_amount,
  //              min_order_amount, expires_at, message }
  // ---------------------------------------------------------------------------
  app.post('/api/coupons/validate', async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.code) return res.status(400).json({ valid: false, message: 'code is required' });
      const result = await coupons.evaluate(
        { code: body.code, subtotal: body.subtotal, currency: body.currency },
        { supabase: SUPABASE, projectRoot: projectRoot }
      );
      res.json(result);
    } catch (err) {
      console.error('[coupons.validate]', err);
      res.status(500).json({ valid: false, message: 'Could not validate coupon.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Admin: list all coupons
  // ---------------------------------------------------------------------------
  app.get('/api/admin/coupons', requireAuth, requireAuthAdmin, async (req, res) => {
    try {
      let list = [];
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('coupons')
            .select('*')
            .order('created_at', { ascending: false });
          if (!error && data) list = data;
        } catch (_) {}
      }
      if (!list.length) {
        list = loadAll();
      }
      res.json({ coupons: list });
    } catch (err) {
      console.error('[coupons.admin.list]', err);
      res.status(500).json({ error: 'Could not list coupons.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Admin: create coupon
  // ---------------------------------------------------------------------------
  app.post('/api/admin/coupons', requireAuth, requireAuthAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.code) return res.status(400).json({ error: 'code is required' });

      const coupon = {
        id:                rand(16),
        code:              body.code.toString().trim().toUpperCase(),
        description:       body.description || '',
        discount_percent:  Number(body.discount_percent || 0),
        discount_amount:   Number(body.discount_amount || 0),
        min_order_amount:  Number(body.min_order_amount || 0),
        max_uses:          body.max_uses ? Number(body.max_uses) : 0,
        used_count:        0,
        expires_at:        body.expires_at || null,
        is_active:         body.is_active !== false,
        created_at:        now(),
      };

      if (SUPABASE) {
        try {
          const { error } = await SUPABASE_ADMIN.from('coupons').insert({
            id: coupon.id, code: coupon.code, description: coupon.description,
            discount_percent: coupon.discount_percent, discount_amount: coupon.discount_amount,
            min_order_amount: coupon.min_order_amount, max_uses: coupon.max_uses,
            used_count: 0, expires_at: coupon.expires_at, is_active: coupon.is_active,
          });
          if (error) console.warn('[coupons.create] supabase insert warn:', error.message);
        } catch (_) {}
      }

      const list = loadAll();
      if (list.find(c => c.code === coupon.code)) {
        return res.status(409).json({ error: 'A coupon with this code already exists.' });
      }
      list.push(coupon);
      saveAll(list);

      res.status(201).json({ coupon });
    } catch (err) {
      console.error('[coupons.create]', err);
      res.status(500).json({ error: 'Could not create coupon.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Admin: update coupon
  // ---------------------------------------------------------------------------
  app.patch('/api/admin/coupons/:id', requireAuth, requireAuthAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const body  = req.body || {};

      let coupon = null;
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('coupons')
            .select('*')
            .eq('id', id)
            .single();
          if (!error && data) coupon = data;
        } catch (_) {}
      }
      if (!coupon) {
        const list = loadAll();
        const idx = list.findIndex(c => c.id === id);
        if (idx < 0) return res.status(404).json({ error: 'Coupon not found.' });
        coupon = list[idx];
      }

      if (body.code !== undefined)              coupon.code             = body.code.toString().trim().toUpperCase();
      if (body.description !== undefined)       coupon.description      = body.description;
      if (body.discount_percent !== undefined)  coupon.discount_percent = Number(body.discount_percent || 0);
      if (body.discount_amount !== undefined)   coupon.discount_amount  = Number(body.discount_amount || 0);
      if (body.min_order_amount !== undefined)  coupon.min_order_amount = Number(body.min_order_amount || 0);
      if (body.max_uses !== undefined)          coupon.max_uses         = body.max_uses ? Number(body.max_uses) : 0;
      if (body.is_active !== undefined)         coupon.is_active        = body.is_active !== false;
      if (body.expires_at !== undefined)        coupon.expires_at       = body.expires_at;

      if (SUPABASE) {
        try {
          await SUPABASE_ADMIN.from('coupons').update({
            code: coupon.code, description: coupon.description,
            discount_percent: coupon.discount_percent, discount_amount: coupon.discount_amount,
            min_order_amount: coupon.min_order_amount, max_uses: coupon.max_uses,
            is_active: coupon.is_active, expires_at: coupon.expires_at,
          }).eq('id', id);
        } catch (_) {}
      } else {
        const list = loadAll();
        const idx = list.findIndex(c => c.id === id);
        if (idx >= 0) list[idx] = coupon;
        saveAll(list);
      }

      res.json({ coupon });
    } catch (err) {
      console.error('[coupons.update]', err);
      res.status(500).json({ error: 'Could not update coupon.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Admin: delete coupon
  // ---------------------------------------------------------------------------
  app.delete('/api/admin/coupons/:id', requireAuth, requireAuthAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      if (SUPABASE) {
        try {
          await SUPABASE_ADMIN.from('coupons').delete().eq('id', id);
        } catch (_) {}
      }
      const list = loadAll();
      const idx = list.findIndex(c => c.id === id);
      if (idx < 0) return res.status(404).json({ error: 'Coupon not found.' });
      list.splice(idx, 1);
      saveAll(list);
      res.json({ success: true });
    } catch (err) {
      console.error('[coupons.delete]', err);
      res.status(500).json({ error: 'Could not delete coupon.' });
    }
  });

  function requireAuthAdmin(req, res, next) {
    const role = (req.user && req.user.role) || '';
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Admins only.' });
    }
    next();
  }

  function rand(n = 16) { return require('crypto').randomBytes(n).toString('hex'); }

  // Callers that need the same answer as the HTTP route use lib/coupons directly.
  return { evaluate: coupons.evaluate };
};
