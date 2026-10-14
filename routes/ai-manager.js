'use strict';
// ============================================================
//  AI MANAGER ROUTES — routes/ai-manager.js
//  Admin-only control surface for the autonomous business manager
//  (lib/ai-manager.js). All state lives in data/ai-manager.json.
// ============================================================

const fs = require('fs');
const path = require('path');
const { createStore } = require('../lib/ai-manager');

module.exports = function AiManagerRoutes(opts) {
  const { app, requireAuth, projectRoot } = opts;
  const store = createStore(projectRoot);
  const dataDir = path.join(projectRoot, 'data');
  const inquiriesPath = path.join(dataDir, 'mock-inquiries.json');

  function requireAdmin(req, res, next) {
    const role = req.user && req.user.role;
    if (role !== 'admin' && role !== 'super_admin') return res.status(403).json({ error: 'Admins only.' });
    next();
  }

  function readInquiries() {
    try { return JSON.parse(fs.readFileSync(inquiriesPath, 'utf8')); }
    catch (err) { return err.code === 'ENOENT' ? [] : []; }
  }

  function writeInquiries(list) {
    const tmp = inquiriesPath + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, inquiriesPath);
  }

  // ---- status + log + config ----
  app.get('/api/admin/manager', requireAuth, requireAdmin, function (_req, res) {
    const state = store.readState();
    const inquiries = readInquiries().filter(function (i) { return i.manager; })
      .map(function (i) {
        return {
          id: i.id, name: i.name, email: i.email, company: i.company,
          status: i.status, source: i.source, createdAt: i.createdAt,
          kind: i.manager.kind, priority: i.manager.priority,
          suggestedPackage: i.manager.suggestedPackage,
          replyDraft: i.manager.replyDraft,
          replySent: Boolean(i.manager.replySent),
          previewFileId: i.manager.previewFileId,
        };
      });
    res.json({
      success: true,
      config: state.config,
      log: state.log.slice(0, 60),
      sent: state.sent.slice(0, 40),
      inquiries,
      counts: {
        leads: inquiries.filter(function (i) { return i.kind === 'lead'; }).length,
        support: inquiries.filter(function (i) { return i.kind === 'support'; }).length,
        spam: inquiries.filter(function (i) { return i.kind === 'spam'; }).length,
        previews: inquiries.filter(function (i) { return i.previewFileId; }).length,
        repliesSent: state.sent.filter(function (s) { return s.delivered; }).length,
      },
    });
  });

  // ---- config update (validated) ----
  app.put('/api/admin/manager', requireAuth, requireAdmin, function (req, res) {
    const b = req.body || {};
    const state = store.readState();
    if (b.enabled !== undefined) state.config.enabled = Boolean(b.enabled);
    if (b.autoReply !== undefined) state.config.autoReply = Boolean(b.autoReply);
    if (b.autoPreview !== undefined) state.config.autoPreview = Boolean(b.autoPreview);
    const minutes = Number(b.intervalMinutes);
    if (Number.isFinite(minutes)) state.config.intervalMinutes = Math.min(180, Math.max(5, Math.round(minutes)));
    const max = Number(b.maxPreviewsPerSweep);
    if (Number.isFinite(max)) state.config.maxPreviewsPerSweep = Math.min(5, Math.max(0, Math.round(max)));
    store.writeState(state);
    res.json({ success: true, config: state.config });
  });

  // ---- manual sweep ----
  app.post('/api/admin/manager/sweep', requireAuth, requireAdmin, async function (req, res) {
    try {
      const result = await store.sweep('manual');
      res.json(Object.assign({ success: true }, result));
    } catch (err) {
      console.error('[ai-manager.sweep]', err);
      res.status(500).json({ error: 'Manager sweep failed.' });
    }
  });

  // ---- send (or re-send) a prepared reply for one inquiry ----
  app.post('/api/admin/manager/reply/:inquiryId', requireAuth, requireAdmin, async function (req, res) {
    const inquiries = readInquiries();
    const inquiry = inquiries.find(function (i) { return i.id === req.params.inquiryId; });
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' });
    if (!inquiry.manager || !inquiry.manager.replyDraft) {
      return res.status(400).json({ error: 'No reply draft prepared for this inquiry yet — run a sweep first.' });
    }
    if (!inquiry.email) return res.status(400).json({ error: 'This inquiry has no email address to reply to.' });
    const result = await store.sendReply(inquiry);
    inquiry.manager.replySent = true;
    inquiry.status = 'resolved';
    writeInquiries(inquiries);
    res.json({ success: true, delivered: Boolean(result && result.delivered), provider: result && result.provider ? result.provider : null });
  });

  // ---- daily digest on demand ----
  app.post('/api/admin/manager/digest', requireAuth, requireAdmin, async function (_req, res) {
    try {
      res.json({ success: true, digest: await store.digest() });
    } catch (err) {
      console.error('[ai-manager.digest]', err);
      res.status(500).json({ error: 'Could not build digest.' });
    }
  });

  return { store };
};
