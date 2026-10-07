'use strict';
// ============================================================
//  SUPPORT TICKETS  —  /api/tickets/*
//  create · list · get · update · reply
// ============================================================
module.exports = function TicketsRoutes(opts) {
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
  const PATH = path.join(projectRoot, 'data', 'mock-tickets.json');

  function load() {
    if (!fs.existsSync(PATH)) return [];
    try { return JSON.parse(fs.readFileSync(PATH, 'utf8')); } catch (_) { return []; }
  }
  function save(list) {
    fs.mkdirSync(path.dirname(PATH), { recursive: true });
    fs.writeFileSync(PATH, JSON.stringify(list, null, 2));
  }

  // ---------------------------------------------------------------------------
  //  Create ticket
  // ---------------------------------------------------------------------------
  app.post('/api/tickets', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const user = req.user;
      if (!body.subject || !body.message) {
        return res.status(400).json({ error: 'subject and message are required' });
      }

      const ticket = {
        id:         rand(16),
        user_id:    user.userId || user.id,
        user_email: (user.email || '').toLowerCase().trim(),
        user_name:  user.name || '',
        subject:    body.subject.trim(),
        message:    body.message.trim(),
        status:     'open',
        priority:   (body.priority || 'normal').toLowerCase(),
        assigned_to: body.assigned_to || null,
        created_at: now(),
        updated_at: now(),
        replies:    [],
      };

      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN.from('support_tickets').insert({
            id:         ticket.id,
            user_id:    ticket.user_id,
            subject:    ticket.subject,
            message:    ticket.message,
            status:     ticket.status,
            priority:   ticket.priority,
            assigned_to: ticket.assigned_to,
          }).select().single();
          if (!error && data) ticket.supabase_id = data.id;
        } catch (_) {}
      }

      const list = load();
      list.push(ticket);
      save(list);

      res.status(201).json({ ticket });
    } catch (err) {
      console.error('[tickets.create]', err);
      res.status(500).json({ error: 'Could not create ticket.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  List MY tickets
  // ---------------------------------------------------------------------------
  app.get('/api/tickets', requireAuth, async (req, res) => {
    try {
      const user = req.user;
      const email = (user.email || '').toLowerCase().trim();

      let list;
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('support_tickets')
            .select('*')
            .or(`user_id.eq.${user.userId},user_id.eq.${user.id}`)
            .order('created_at', { ascending: false });
          if (!error && data) { list = data; }
        } catch (_) {}
      }
      if (!list) {
        list = load().filter(t => t.user_email === email || t.user_id === user.userId || t.user_id === user.id);
      }

      res.json({ tickets: list });
    } catch (err) {
      console.error('[tickets.list]', err);
      res.status(500).json({ error: 'Could not list tickets.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Get one ticket  (owner or admin)
  // ---------------------------------------------------------------------------
  app.get('/api/tickets/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user;

      let ticket = null;
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('support_tickets')
            .select('*')
            .eq('id', id)
            .single();
          if (!error && data) ticket = data;
        } catch (_) {}
      }
      if (!ticket) {
        const list = load();
        ticket = list.find(t => t.id === id) || null;
      }
      if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

      const isOwner = ticket.user_email === (user.email || '').toLowerCase()
        || ticket.user_id === user.userId || ticket.user_id === user.id;
      const isAdmin  = (user.role || '') === 'admin' || (user.role || '') === 'super_admin';
      if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

      res.json({ ticket });
    } catch (err) {
      console.error('[tickets.get]', err);
      res.status(500).json({ error: 'Could not fetch ticket.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Update ticket (status / priority / assigned_to / resolve) — admin only
  // ---------------------------------------------------------------------------
  app.patch('/api/tickets/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const body  = req.body || {};
      const user  = req.user;
      const role  = user.role || '';
      const isAdmin = role === 'admin' || role === 'super_admin';
      if (!isAdmin) return res.status(403).json({ error: 'Admins only.' });

      let ticket = null;
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('support_tickets')
            .select('*')
            .eq('id', id)
            .single();
          if (!error && data) ticket = data;
        } catch (_) {}
      }
      if (!ticket) {
        const list = load();
        const idx = list.findIndex(t => t.id === id);
        if (idx < 0) return res.status(404).json({ error: 'Ticket not found.' });
        ticket = list[idx];
      }

      if (body.status !== undefined)     ticket.status     = body.status;
      if (body.priority !== undefined)  ticket.priority   = body.priority;
      if (body.assigned_to !== undefined) ticket.assigned_to = body.assigned_to;
      if (body.resolve !== undefined && body.resolve === true) {
        ticket.status = 'resolved';
      }
      ticket.updated_at = now();

      if (SUPABASE && ticket.supabase_id) {
        try {
          await SUPABASE_ADMIN.from('support_tickets').update({
            status: ticket.status,
            priority: ticket.priority,
            assigned_to: ticket.assigned_to,
            updated_at: ticket.updated_at,
          }).eq('id', ticket.supabase_id);
        } catch (_) {}
      } else {
        const list = load();
        const idx = list.findIndex(t => t.id === id);
        if (idx >= 0) list[idx] = ticket;
        save(list);
      }

      res.json({ ticket });
    } catch (err) {
      console.error('[tickets.update]', err);
      res.status(500).json({ error: 'Could not update ticket.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Reply to a ticket (creates a reply + a notification for the owner)
  // ---------------------------------------------------------------------------
  app.post('/api/tickets/:id/reply', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const body  = req.body || {};
      const user  = req.user;
      if (!body.message) return res.status(400).json({ error: 'message required' });

      let ticket = null;
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('support_tickets')
            .select('*')
            .eq('id', id)
            .single();
          if (!error && data) ticket = data;
        } catch (_) {}
      }
      if (!ticket) {
        const list = load();
        const idx = list.findIndex(t => t.id === id);
        if (idx < 0) return res.status(404).json({ error: 'Ticket not found.' });
        ticket = list[idx];
      }

      const reply = {
        id:        rand(12),
        author_id: user.userId || user.id,
        author_name: user.name || 'Support',
        author_role: (user.role || 'user'),
        message:   body.message.trim(),
        created_at: now(),
      };

      if (!ticket.replies) ticket.replies = [];
      ticket.replies.push(reply);
      ticket.updated_at = now();
      if (reply.author_role === 'admin' || reply.author_role === 'super_admin') {
        ticket.status = 'in_progress';
      }

      if (SUPABASE && ticket.supabase_id) {
        try {
          await SUPABASE_ADMIN.from('support_tickets').update({
            updated_at: ticket.updated_at,
            status: ticket.status,
          }).eq('id', ticket.supabase_id);
        } catch (_) {}
      } else {
        const list = load();
        const idx = list.findIndex(t => t.id === id);
        if (idx >= 0) list[idx] = ticket;
        save(list);
      }

      // Notify the ticket owner
      try {
        const notifOpts = require('./notifications')({
          app, SUPABASE, SUPABASE_ADMIN, now, getSession, requireAuth, IS_PROD,
        });
        // We inline the notification create here to avoid a circular require;
        // simplest path is a direct insert into the notif table/mock.
        const notif = {
          id:       rand(16),
          user_id:  ticket.user_id,
          user_email: ticket.user_email,
          title:    'Re: ' + ticket.subject,
          body:     (user.name || 'Support') + ' replied: ' + body.message.slice(0, 160),
          type:     'info',
          read:     false,
          created_at: now(),
        };
        const nlist = load().filter(() => true); // placeholder; real notif store is separate
        // Actually write to the notif mock file
        const nPath = path.join(projectRoot, 'data', 'mock-notifications.json');
        let ndata = {};
        try { ndata = JSON.parse(fs.readFileSync(nPath, 'utf8')); } catch (_) { ndata = {}; }
        if (!ndata.notifications) ndata.notifications = [];
        ndata.notifications.push(notif);
        fs.writeFileSync(nPath, JSON.stringify(ndata, null, 2));
      } catch (_) {}

      res.json({ ticket, reply });
    } catch (err) {
      console.error('[tickets.reply]', err);
      res.status(500).json({ error: 'Could not add reply.' });
    }
  });

  function rand(n = 16) { return require('crypto').randomBytes(n).toString('hex'); }

  return {};
};
