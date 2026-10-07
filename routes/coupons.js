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
  } = opts;

  const fs   = require('fs');
  const path = require('path');
  const projectRoot = process.cwd();
  const PATH = path.join(projectRoot, 'data', 'mock-coupons.json');

  function loadAll() {
    if (!fs.existsSync(PATH)) return [];
    try { return JSON.parse(fs.readFileSync(PATH, 'utf8')); } catch (_) { return []; }
  }
  function saveAll(list) {
    fs.mkdirSync(path.dirname(PATH), { recursive: true });
    fs.writeFileSync(PATH, JSON.stringify(list, null, 2));
  }

  // seed a couple of built-in coupons so the checkout flow has something to
  // validate against even without a Supabase table.
  const SEED = [
    { id: 'seed_save20', code: 'SAVE20', description: '20% off any order', discount_percent: 20, discount_amount: 0, min_order_amount: 0, max_uses: 0, used_count: 0, expires_at: null, is_active: true, created_at: '2026-01-01T00:00:00Z' },
    { id: 'seed_welcome10', code: 'WELCOME10', description: '$10 off your first order', discount_percent: 0, discount_amount: 10, min_order_amount: 50, max_uses: 100, used_count: 0, expires_at: null, is_active: true, created_at: '2026-01-01T00:00:00Z' },
  ];

  // ---------------------------------------------------------------------------
  //  Validate a coupon code (public — no auth required)
  //
  //  Request:  { code, subtotal (optional) }
  //  Response: { valid, code, discount_type, discount_value, discount_amount,
  //              min_order_amount, expires_at, message }
  // ---------------------------------------------------------------------------
  app.post('/api/coupons/validate', async (req, res) => {
    try {
      const { code, subtotal } = req.body || {};
      if (!code) return res.status(400).json({ valid: false, message: 'code is required' });

      const normalized = code.toString().trim().toUpperCase();
      let coupons = [];
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE
            .from('coupons')
            .select('*')
            .eq('code', normalized)
            .single();
          if (!error && data) coupons = [data];
        } catch (_) {}
      }
      if (!coupons.length) {
        const list = loadAll();
        coupons = list.filter(c => c.code === normalized);
      }

      const coupon = coupons[0];
      if (!coupon) {
        return res.json({ valid: false, code: normalized, message: 'Invalid coupon code.' });
      }
      if (!coupon.is_active) {
        return res.json({ valid: false, code: normalized, message: 'This coupon is no longer active.' });
      }
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return res.json({ valid: false, code: normalized, message: 'This coupon has expired.' });
      }
      if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
        return res.json({ valid: false, code: normalized, message: 'This coupon has reached its usage limit.' });
      }

      const subtotalNum = Number(subtotal || 0);
      if (coupon.min_order_amount && subtotalNum < coupon.min_order_amount) {
        return res.json({
          valid: false,
          code: normalized,
          message: `Minimum order of $${coupon.min_order_amount} required.`,
          min_order_amount: coupon.min_order_amount,
        });
      }

      const discountPercent = Number(coupon.discount_percent || 0);
      const discountAmount  = Number(coupon.discount_amount || 0);
      let finalDiscount = 0;
      if (discountPercent > 0) {
        finalDiscount = subtotalNum * (discountPercent / 100);
      } else {
        finalDiscount = discountAmount;
      }
      finalDiscount = Math.max(0, finalDiscount);

      return res.json({
        valid: true,
        code: normalized,
        discount_type: discountPercent > 0 ? 'percent' : 'fixed',
        discount_value: discountPercent || discountAmount,
        discount_amount: finalDiscount,
        min_order_amount: coupon.min_order_amount || 0,
        expires_at: coupon.expires_at || null,
        message: coupon.description ? `Coupon applied: ${coupon.description}` : 'Coupon applied.',
      });
    } catch (err) {
      console.error('[coupons.validate]', err);
      res.status(500).json({ valid: false, message: 'Could not validate coupon.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Admin: list all coupons
  // ---------------------------------------------------------------------------
  app.get('/api/admin/coupons', requireAuthAdmin, async (req, res) => {
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
  app.post('/api/admin/coupons', requireAuthAdmin, async (req, res) => {
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
  app.patch('/api/admin/coupons/:id', requireAuthAdmin, async (req, res) => {
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
  app.delete('/api/admin/coupons/:id', requireAuthAdmin, async (req, res) => {
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

  // Expose the validate function for use by other modules if needed
  return { validate: (code, subtotal) => null };
};
