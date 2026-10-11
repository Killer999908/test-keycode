'use strict';

const fs = require('fs');
const path = require('path');
const ai = require('../lib/ai-provider');

module.exports = function AdminRoutes(opts) {
  const { app, requireAuth, projectRoot, SUPABASE_ADMIN } = opts;
  const dataDir = path.join(projectRoot, 'data');

  function requireAdmin(req, res, next) {
    const role = req.user && req.user.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Admins only.' });
    }
    next();
  }

  function readJson(name, fallback) {
    const file = path.join(dataDir, name);
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return fallback;
      throw err;
    }
  }

  async function listUsers() {
    if (SUPABASE_ADMIN && SUPABASE_ADMIN.auth && SUPABASE_ADMIN.auth.admin) {
      const { data, error } = await SUPABASE_ADMIN.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;
      return (data.users || []).map(function (user) {
        const metadata = user.user_metadata || {};
        return {
          id: user.id,
          name: metadata.full_name || metadata.name || '',
          email: user.email || '',
          role: metadata.role || 'user',
          isActive: user.banned_until ? new Date(user.banned_until).getTime() <= Date.now() : true,
          createdAt: user.created_at || null,
        };
      });
    }

    const records = readJson('mock-users.json', {});
    return Object.values(records).filter(Boolean).map(function (user) {
      return {
        id: user.id || user.userId || '',
        name: user.name || user.full_name || '',
        email: user.email || '',
        role: user.role || 'user',
        isActive: user.isActive !== false,
        createdAt: user.created_at || user.createdAt || null,
      };
    });
  }

  function newestFirst(a, b, dateKey) {
    return new Date(b[dateKey] || 0).getTime() - new Date(a[dateKey] || 0).getTime();
  }

  app.get('/api/admin/overview', requireAuth, requireAdmin, async function (_req, res) {
    try {
      const [users, orders] = await Promise.all([
        listUsers(),
        Promise.resolve(readJson('mock-orders.json', [])),
      ]);
      const inquiries = readJson('mock-inquiries.json', []);
      const tickets = readJson('mock-tickets.json', []);
      const projects = readJson('ai-projects.json', []);
      const payments = readJson('mock-payments.json', []);
      const paidOrders = orders.filter(function (order) {
        return ['paid', 'completed', 'succeeded'].includes(String(order.payment_status || '').toLowerCase());
      });
      const revenue = paidOrders.reduce(function (sum, order) {
        return sum + Number(order.total || order.amount || 0);
      }, 0);
      const pendingPayments = payments.filter(function (payment) {
        return ['pending', 'processing'].includes(String(payment.status || '').toLowerCase());
      }).length;
      const recentOrders = orders.slice().sort(function (a, b) { return newestFirst(a, b, 'created_at'); }).slice(0, 8)
        .map(function (order) {
          return {
            id: order.id || order._id || '',
            orderNumber: order.orderNumber || '',
            customer: order.user_name || order.customerName || order.billingAddress?.name || '',
            service: order.service_name || order.service || order.project?.name || 'Project',
            total: Number(order.total || order.amount || 0),
            paymentStatus: order.payment_status || order.paymentStatus || 'pending',
            status: order.status || 'pending',
            createdAt: order.created_at || order.createdAt || null,
          };
        });
      res.json({
        asOf: new Date().toISOString(),
        source: SUPABASE_ADMIN ? 'supabase-auth-and-local-app-data' : 'local-app-data',
        totals: {
          users: users.length,
          orders: orders.length,
          paidOrders: paidOrders.length,
          revenue: Math.round(revenue * 100) / 100,
          openTickets: tickets.filter(function (ticket) { return !['resolved', 'closed'].includes(String(ticket.status || '').toLowerCase()); }).length,
          newInquiries: inquiries.filter(function (inquiry) { return String(inquiry.status || 'new').toLowerCase() === 'new'; }).length,
          projects: projects.length,
          pendingPayments: pendingPayments,
        },
        orderStatuses: orders.reduce(function (counts, order) {
          const status = String(order.status || 'pending');
          counts[status] = (counts[status] || 0) + 1;
          return counts;
        }, {}),
        recentOrders: recentOrders,
      });
    } catch (err) {
      console.error('[admin.overview]', err);
      res.status(500).json({ error: 'Could not load platform overview.' });
    }
  });

  app.get('/api/admin/users', requireAuth, requireAdmin, async function (req, res) {
    try {
      const users = await listUsers();
      const query = String(req.query.q || '').trim().toLowerCase();
      const filtered = query ? users.filter(function (user) {
        return user.email.toLowerCase().includes(query) || user.name.toLowerCase().includes(query);
      }) : users;
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
      res.json({
        users: filtered.slice((page - 1) * limit, page * limit),
        total: filtered.length,
        page: page,
        pages: Math.max(1, Math.ceil(filtered.length / limit)),
      });
    } catch (err) {
      console.error('[admin.users.list]', err);
      res.status(500).json({ error: 'Could not list users.' });
    }
  });

  app.get('/api/admin/inquiries', requireAuth, requireAdmin, function (_req, res) {
    try {
      const inquiries = readJson('mock-inquiries.json', []);
      inquiries.sort(function (a, b) { return newestFirst(a, b, 'createdAt'); });
      res.json({ inquiries: inquiries });
    } catch (err) {
      console.error('[admin.inquiries.list]', err);
      res.status(500).json({ error: 'Could not list inquiries.' });
    }
  });

  app.patch('/api/admin/inquiries/:id', requireAuth, requireAdmin, function (req, res) {
    const status = String((req.body || {}).status || '');
    if (!['new', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Status must be new, in_progress, or resolved.' });
    }
    try {
      const inquiries = readJson('mock-inquiries.json', []);
      const inquiry = inquiries.find(function (item) { return item.id === req.params.id; });
      if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' });
      inquiry.status = status;
      inquiry.updatedAt = new Date().toISOString();
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(path.join(dataDir, 'mock-inquiries.json'), JSON.stringify(inquiries, null, 2));
      res.json({ success: true, inquiry: inquiry });
    } catch (err) {
      console.error('[admin.inquiries.update]', err);
      res.status(500).json({ error: 'Could not update inquiry.' });
    }
  });

  app.get('/api/admin/audit', requireAuth, requireAdmin, function (req, res) {
    try {
      const store = readJson('mock-audit.json', { entries: [] });
      const query = String(req.query.action || '').trim().toLowerCase();
      const entries = (Array.isArray(store) ? store : store.entries || [])
        .filter(function (entry) { return !query || String(entry.action || '').toLowerCase().includes(query); })
        .sort(function (a, b) { return newestFirst(a, b, 'created_at'); });
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
      res.json({
        logs: entries.slice((page - 1) * limit, page * limit).map(function (entry) {
          return {
            id: entry.id,
            createdAt: entry.created_at || entry.createdAt || null,
            user: { name: entry.user_name || entry.email || 'Admin' },
            action: entry.action || '',
            resource: entry.resource || '',
            status: entry.status || 'success',
            ip: entry.ip_address || entry.ip || '',
          };
        }),
        page: page,
        pages: Math.max(1, Math.ceil(entries.length / limit)),
        total: entries.length,
      });
    } catch (err) {
      console.error('[admin.audit.list]', err);
      res.status(500).json({ error: 'Could not load audit history.' });
    }
  });

  app.get('/api/admin/system', requireAuth, requireAdmin, function (_req, res) {
    const aiInfo = ai.llmInfo();
    const memory = process.memoryUsage();
    res.json({
      checkedAt: new Date().toISOString(),
      process: {
        status: 'running',
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        memory: {
          rssBytes: memory.rss,
          heapUsedBytes: memory.heapUsed,
          heapTotalBytes: memory.heapTotal,
        },
      },
      integrations: {
        supabase: Boolean(SUPABASE_ADMIN),
        stripe: Boolean(process.env.STRIPE_SECRET_KEY),
        email: Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY),
        configuredAiProvider: aiInfo.configured ? aiInfo.provider : null,
        aiConfigured: Boolean(aiInfo.configured),
      },
    });
  });
};
