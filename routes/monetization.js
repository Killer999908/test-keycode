'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function MonetizationRoutes(opts) {
  const { app, requireAuth, projectRoot } = opts;
  const dataDir = path.join(projectRoot, 'data');
  const settingsFile = path.join(dataDir, 'monetization.json');
  const revenueFile = path.join(dataDir, 'monetization-revenue.json');
  const defaults = {
    enabled: false,
    ads: {
      enabled: false,
      network: 'none',
      networkClientId: '',
      headerEnabled: false,
      headerSlotId: '',
      footerEnabled: false,
      footerSlotId: '',
      inFeedEnabled: false,
      inFeedSlotId: '',
    },
    donations: { enabled: false, kofi: '', buymeacoffee: '', paypal: '', upiId: '' },
    premium: { enabled: false, monthlyPriceINR: 199, yearlyPriceINR: 1499 },
    affiliate: { items: [] },
  };

  function readJson(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  function readSettings() {
    const stored = readJson(settingsFile, {});
    return Object.assign({}, defaults, stored, {
      ads: Object.assign({}, defaults.ads, stored.ads || {}),
      donations: Object.assign({}, defaults.donations, stored.donations || {}),
      premium: Object.assign({}, defaults.premium, stored.premium || {}),
      affiliate: Object.assign({}, defaults.affiliate, stored.affiliate || {}),
    });
  }

  function writeJson(file, value) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  }

  function requireAdmin(req, res, next) {
    const role = req.user && req.user.role;
    if (role !== 'admin' && role !== 'super_admin') return res.status(403).json({ success: false, error: 'Admins only.' });
    next();
  }

  function normalizedAds(input) {
    const ads = input && typeof input === 'object' ? input : {};
    const network = String(ads.network || 'none');
    if (network !== 'none' && network !== 'adsense') throw new Error('Supported ad networks are none and adsense.');
    const publisherId = String(ads.networkClientId || '').trim();
    if (network === 'adsense' && publisherId && !/^ca-pub-\d{16}$/.test(publisherId)) {
      throw new Error('AdSense publisher ID must use the format ca-pub- followed by 16 digits.');
    }
    const slot = function (value) {
      const id = String(value || '').trim();
      if (id && !/^\d{6,20}$/.test(id)) throw new Error('AdSense ad slot IDs must contain 6–20 digits.');
      return id;
    };
    return {
      enabled: ads.enabled === true,
      network: network,
      networkClientId: publisherId,
      headerEnabled: ads.headerEnabled === true,
      headerSlotId: slot(ads.headerSlotId),
      footerEnabled: ads.footerEnabled === true,
      footerSlotId: slot(ads.footerSlotId),
      inFeedEnabled: ads.inFeedEnabled === true,
      inFeedSlotId: slot(ads.inFeedSlotId),
    };
  }

  app.get('/api/monetization/config', function (req, res) {
    try {
      const settings = readSettings();
      let ads;
      try { ads = normalizedAds(settings.ads); }
      catch (_) { ads = defaults.ads; }
      const isConfigured = settings.enabled && ads.enabled && ads.network === 'adsense' &&
        /^ca-pub-\d{16}$/.test(ads.networkClientId);
      const placement = function (enabled, slotId) { return Boolean(isConfigured && enabled && slotId); };
      res.set('Cache-Control', 'public, max-age=60');
      res.json({
        enabled: isConfigured,
        network: isConfigured ? 'adsense' : 'none',
        publisherId: isConfigured ? ads.networkClientId : '',
        placements: {
          header: placement(ads.headerEnabled, ads.headerSlotId) ? ads.headerSlotId : '',
          footer: placement(ads.footerEnabled, ads.footerSlotId) ? ads.footerSlotId : '',
          inFeed: placement(ads.inFeedEnabled, ads.inFeedSlotId) ? ads.inFeedSlotId : '',
        },
      });
    } catch (err) {
      console.error('[monetization.config]', err);
      res.status(500).json({ success: false, error: 'Could not load ad configuration.' });
    }
  });

  app.get('/api/admin/monetization', requireAuth, requireAdmin, function (_req, res) {
    try { res.json(readSettings()); }
    catch (err) {
      console.error('[monetization.admin.get]', err);
      res.status(500).json({ success: false, error: 'Could not load monetization settings.' });
    }
  });

  app.put('/api/admin/monetization', requireAuth, requireAdmin, function (req, res) {
    try {
      const body = req.body || {};
      const existing = readSettings();
      const settings = {
        enabled: body.enabled === true,
        ads: normalizedAds(body.ads),
        donations: Object.assign({}, existing.donations, body.donations || {}),
        premium: Object.assign({}, existing.premium, body.premium || {}),
        affiliate: existing.affiliate,
      };
      writeJson(settingsFile, settings);
      res.json({ success: true });
    } catch (err) {
      const status = err instanceof SyntaxError ? 500 : 400;
      if (status === 500) console.error('[monetization.admin.save]', err);
      res.status(status).json({ success: false, error: status === 400 ? err.message : 'Could not save monetization settings.' });
    }
  });

  app.get('/api/admin/monetization/revenue', requireAuth, requireAdmin, function (_req, res) {
    try {
      const entries = readJson(revenueFile, []);
      res.json({ entries: entries, totals: { sum: entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), count: entries.length } });
    } catch (err) {
      console.error('[monetization.revenue.list]', err);
      res.status(500).json({ success: false, error: 'Could not load revenue entries.' });
    }
  });

  app.post('/api/admin/monetization/revenue', requireAuth, requireAdmin, function (req, res) {
    const body = req.body || {};
    const amount = Number(body.amount);
    const source = String(body.source || '').trim().slice(0, 80);
    if (!source || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, error: 'A source and positive amount are required.' });
    try {
      const entries = readJson(revenueFile, []);
      const entry = { id: require('crypto').randomBytes(12).toString('hex'), source: source, amount: Math.round(amount * 100) / 100, note: String(body.note || '').slice(0, 500), at: new Date().toISOString() };
      entries.unshift(entry);
      writeJson(revenueFile, entries.slice(0, 1000));
      res.status(201).json({ success: true, entry: entry });
    } catch (err) {
      console.error('[monetization.revenue.add]', err);
      res.status(500).json({ success: false, error: 'Could not record revenue.' });
    }
  });

  app.post('/api/admin/monetization/affiliate', requireAuth, requireAdmin, function (req, res) {
    const body = req.body || {};
    const title = String(body.title || '').trim().slice(0, 120);
    let url;
    try { url = new URL(String(body.url || '')); }
    catch (_) { return res.status(400).json({ success: false, error: 'A valid HTTPS affiliate URL is required.' }); }
    if (!title || url.protocol !== 'https:') return res.status(400).json({ success: false, error: 'A title and HTTPS affiliate URL are required.' });
    try {
      const settings = readSettings();
      const item = { _id: require('crypto').randomBytes(12).toString('hex'), title: title, url: url.toString(), image: String(body.image || '').slice(0, 1000) };
      settings.affiliate.items.push(item);
      writeJson(settingsFile, settings);
      res.status(201).json({ success: true, item: item });
    } catch (err) {
      console.error('[monetization.affiliate.add]', err);
      res.status(500).json({ success: false, error: 'Could not add affiliate item.' });
    }
  });

  app.delete('/api/admin/monetization/affiliate/:id', requireAuth, requireAdmin, function (req, res) {
    try {
      const settings = readSettings();
      const items = settings.affiliate.items || [];
      const filtered = items.filter(item => item._id !== req.params.id);
      if (filtered.length === items.length) return res.status(404).json({ success: false, error: 'Affiliate item not found.' });
      settings.affiliate.items = filtered;
      writeJson(settingsFile, settings);
      res.json({ success: true });
    } catch (err) {
      console.error('[monetization.affiliate.delete]', err);
      res.status(500).json({ success: false, error: 'Could not remove affiliate item.' });
    }
  });
};
