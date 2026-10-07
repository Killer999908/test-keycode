'use strict';
// ============================================================
//  NOTIFICATIONS  —  /api/notifications/*
//  list · mark-read · mark-all-read · create (admin)
// ============================================================
module.exports = function NotificationsRoutes(opts) {
  const {
    app,
    SUPABASE,
    SUPABASE_ADMIN,
    now,
    getSession,
    requireAuth,
    IS_PROD,
  } = opts;

  const fs   = require('fs');
  const path = require('path');
  const projectRoot = process.cwd();
  const PATH = path.join(projectRoot, 'data', 'mock-notifications.json');

  function loadAll() {
    if (!fs.existsSync(PATH)) return { notifications: [] };
    try { return JSON.parse(fs.readFileSync(PATH, 'utf8')); } catch (_) { return { notifications: [] }; }
  }
  function saveAll(obj) {
    fs.mkdirSync(path.dirname(PATH), { recursive: true });
    fs.writeFileSync(PATH, JSON.stringify(obj, null, 2));
  }

  // ---------------------------------------------------------------------------
  //  List MY notifications
  // ---------------------------------------------------------------------------
  app.get('/api/notifications', requireAuth, async (req, res) => {
    try {
      const user = req.user;
      const email = (user.email || '').toLowerCase().trim();
      const unreadOnly = req.query.unread === 'true';

      let list = [];
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('notifications')
            .select('*')
            .or(`user_id.eq.${user.userId},user_id.eq.${user.id}`)
            .order('created_at', { ascending: false })
            .limit(100);
          if (!error && data) list = data;
        } catch (_) {}
      }
      if (!list.length) {
        const store = loadAll();
        list = (store.notifications || [])
          .filter(n => n.user_email === email || n.user_id === user.userId || n.user_id === user.id)
          .slice(0, 100);
      }

      let out = list;
      if (unreadOnly) out = out.filter(n => !n.read);

      res.json({ notifications: out });
    } catch (err) {
      console.error('[notifications.list]', err);
      res.status(500).json({ error: 'Could not list notifications.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Get unread count
  // ---------------------------------------------------------------------------
  app.get('/api/notifications/unread-count', requireAuth, async (req, res) => {
    try {
      const user = req.user;
      const email = (user.email || '').toLowerCase().trim();

      let list = [];
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('notifications')
            .select('id')
            .or(`user_id.eq.${user.userId},user_id.eq.${user.id}`)
            .eq('read', false);
          if (!error) list = data;
        } catch (_) {}
      }
      if (!list.length) {
        const store = loadAll();
        list = (store.notifications || [])
          .filter(n => !n.read && (n.user_email === email || n.user_id === user.userId || n.user_id === user.id));
      }
      res.json({ count: list.length });
    } catch (err) {
      console.error('[notifications.unread-count]', err);
      res.status(500).json({ error: 'Could not count notifications.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Mark one as read
  // ---------------------------------------------------------------------------
  app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user;
      const email = (user.email || '').toLowerCase().trim();

      let notif = null;
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('notifications')
            .select('*')
            .or(`id.eq.${id}`)
            .single();
          if (!error && data) notif = data;
        } catch (_) {}
      }
      if (!notif) {
        const store = loadAll();
        const list = store.notifications || [];
        const idx = list.findIndex(n => n.id === id && (n.user_email === email || n.user_id === user.userId || n.user_id === user.id));
        if (idx < 0) return res.status(404).json({ error: 'Notification not found.' });
        notif = list[idx];
      }

      if (SUPABASE && notif.id) {
        try {
          await SUPABASE_ADMIN.from('notifications').update({ read: true }).eq('id', notif.id);
        } catch (_) {}
      } else {
        const store = loadAll();
        const list = store.notifications || [];
        const idx = list.findIndex(n => n.id === id);
        if (idx >= 0) list[idx] = { ...list[idx], read: true };
        saveAll({ notifications: list });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[notifications.read]', err);
      res.status(500).json({ error: 'Could not mark notification read.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Mark all as read (mine)
  // ---------------------------------------------------------------------------
  app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
    try {
      const user = req.user;
      const email = (user.email || '').toLowerCase().trim();

      if (SUPABASE) {
        try {
          await SUPABASE_ADMIN
            .from('notifications')
            .update({ read: true })
            .or(`user_id.eq.${user.userId},user_id.eq.${user.id}`);
        } catch (_) {}
      }
      const store = loadAll();
      const list = store.notifications || [];
      let changed = 0;
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if ((n.user_email === email || n.user_id === user.userId || n.user_id === user.id) && !n.read) {
          list[i] = { ...n, read: true };
          changed++;
        }
      }
      saveAll({ notifications: list });
      res.json({ success: true, marked: changed });
    } catch (err) {
      console.error('[notifications.read-all]', err);
      res.status(500).json({ error: 'Could not mark notifications read.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Create a notification (admin)
  // ---------------------------------------------------------------------------
  app.post('/api/notifications', requireAuth, async (req, res) => {
    try {
      const user = req.user;
      const role = user.role || '';
      if (role !== 'admin' && role !== 'super_admin') {
        return res.status(403).json({ error: 'Admins only.' });
      }

      const body = req.body || {};
      if (!body.title) return res.status(400).json({ error: 'title is required' });

      // Support: target a single user by email, or broadcast to everyone
      const targetEmail = (body.user_email || '').toLowerCase().trim();
      const targetId    = body.user_id || null;

      const notif = {
        id:       rand(16),
        user_id:  targetId,
        user_email: targetEmail,
        title:    body.title.trim(),
        body:     body.body || '',
        type:     (body.type || 'info').toLowerCase(),
        read:     false,
        created_at: now(),
      };

      if (SUPABASE) {
        try {
          const { error } = await SUPABASE_ADMIN.from('notifications').insert({
            id:        notif.id,
            user_id:   notif.user_id,
            title:     notif.title,
            body:      notif.body,
            type:      notif.type,
            read:      false,
          });
          if (error) console.warn('[notifications.create] supabase insert warn:', error.message);
        } catch (_) {}
      }

      const store = loadAll();
      if (!store.notifications) store.notifications = [];
      store.notifications.push(notif);
      saveAll(store);

      res.status(201).json({ notification: notif });
    } catch (err) {
      console.error('[notifications.create]', err);
      res.status(500).json({ error: 'Could not create notification.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Admin broadcast — helper that creates a notification for every user.
  //  Used by the admin panel / control-panel.
  // ---------------------------------------------------------------------------
  app.post('/api/admin/broadcast', requireAuth, async (req, res) => {
    try {
      const user = req.user;
      const role = user.role || '';
      if (role !== 'admin' && role !== 'super_admin') {
        return res.status(403).json({ error: 'Admins only.' });
      }

      const body = req.body || {};
      if (!body.title) return res.status(400).json({ error: 'title is required' });

      // Gather all user emails from the mock store (or Supabase)
      let targets = [];
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('users')
            .select('id, email')
            .limit(500);
          if (!error && data) {
            targets = data.map(u => ({ id: u.id, email: u.email }));
          }
        } catch (_) {}
      }
      if (!targets.length) {
        const store = loadAll();
        // mock users are keyed by email in mock-users.json; also scan notif store
        const muPath = path.join(projectRoot, 'data', 'mock-users.json');
        let mu = {};
        try { mu = JSON.parse(fs.readFileSync(muPath, 'utf8')); } catch (_) {}
        targets = Object.values(mu).map(u => ({ id: u.id, email: u.email }));
      }

      const notifs = targets.map(t => ({
        id:         rand(16),
        user_id:    t.id,
        user_email: t.email,
        title:      body.title.trim(),
        body:       body.body || '',
        type:       (body.type || 'info').toLowerCase(),
        read:       false,
        created_at: now(),
      }));

      if (SUPABASE) {
        try {
          const rows = notifs.map(n => ({
            id: n.id, user_id: n.user_id, title: n.title, body: n.body, type: n.type, read: false,
          }));
          // Supabase batch insert
          await SUPABASE_ADMIN.from('notifications').insert(rows);
        } catch (e) {
          console.warn('[admin.broadcast] supabase batch insert warn:', e && e.message);
        }
      }

      const store = loadAll();
      if (!store.notifications) store.notifications = [];
      store.notifications.push(...notifs);
      saveAll(store);

      res.json({ success: true, sent: notifs.length });
    } catch (err) {
      console.error('[admin.broadcast]', err);
      res.status(500).json({ error: 'Broadcast failed.' });
    }
  });

  function rand(n = 16) { return require('crypto').randomBytes(n).toString('hex'); }

  return {};
};
