'use strict';
// ============================================================
//  KEYCODE Studio — Backend API Server
//  Single-process Express server. Talks to Supabase for auth
//  (via the Admin SDK so we can create users / sign JWTs) and
//  uses the same Supabase client for all data plumbing.
//
//  Env vars (see .env.example):
//    PORT                – optional, default 3000
//    NODE_ENV            – 'production' disables mock fallbacks
//    SUPABASE_URL
//    SUPABASE_ANON_KEY  – used for Row-Level-Security queries from the server
//    SUPABASE_SERVICE_KEY– used for admin ops (create user, bypass RLS)
//    JWT_SECRET          – signs our session tokens handed to the browser
//    JWT_EXPIRY         – default '7d'
//    STRIPE_SECRET_KEY   – optional; when absent card payments are gracefully declined
//    STRIPE_WEBHOOK_SECRET
//    UPI_QR_TEMPLATE     – optional UPI QR fallback
//    ALLOWED_ORIGINS     – comma-separated, default includes localhost + your production domain
// ============================================================
const path = require('path');
const fs   = require('fs');

const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');

let SUPABASE, SUPABASE_ADMIN;
let STRIPE = null;

// ---------------------------------------------------------------------------
//  Bootstrap: try to load .env from project root before anything else
// ---------------------------------------------------------------------------
const projectRoot = path.resolve(__dirname);
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(projectRoot, '.env') });
} catch (_) { /* dotenv optional */ }

const PORT        = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV    = process.env.NODE_ENV || 'development';
const IS_PROD     = NODE_ENV === 'production';
const JWT_SECRET  = process.env.JWT_SECRET || (IS_PROD ? undefined : crypto.randomBytes(32).toString('hex'));
const JWT_EXPIRY  = process.env.JWT_EXPIRY || '7d';

if (IS_PROD && !JWT_SECRET) {
  console.error('[keycode] FATAL: JWT_SECRET is required in production.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
//  Supabase clients
// ---------------------------------------------------------------------------
function initSupabase() {
  const url  = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const svc  = process.env.SUPABASE_SERVICE_KEY;

  if (!url) {
    console.warn('[keycode] SUPABASE_URL unset — data API will return graceful errors.');
    return;
  }
  const { createClient } = require('@supabase/supabase-js');
  if (anon) SUPABASE     = createClient(url, anon);
  if (svc)  SUPABASE_ADMIN = createClient(url, svc);
}

// ---------------------------------------------------------------------------
//  Stripe (optional)
// ---------------------------------------------------------------------------
function initStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return;
  try {
    STRIPE = require('stripe')(key);
  } catch (err) {
    console.warn('[keycode] Stripe init failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
//  App
// ---------------------------------------------------------------------------
const app = express();

app.use(cors({
  origin: (origin, cb) => {
    const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://yourdomain.com')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!origin || allowed.includes(origin)) return cb(null, true);
    cb(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Tiny cookie parser (no extra dependency): exposes req.cookies so the
// kc_token session cookie set at login works for API auth.
app.use((req, _res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie;
  if (raw) {
    for (const part of raw.split(';')) {
      const i = part.indexOf('=');
      if (i > 0) req.cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  next();
});

// ---- small helpers ---------------------------------------------------------
const rand = (n = 16) => crypto.randomBytes(n).toString('hex');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const now  = () => new Date().toISOString();

// cookies helper (sameSite Lax, httpOnly, secure in prod)
function setSessionCookie(res, token) {
  res.cookie('kc_token', token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}
function clearSessionCookie(res) {
  res.cookie('kc_token', '', { maxAge: 0, path: '/' });
}

// decode + VERIFY the session JWT we issue (not Supabase's anon token).
// Unsigned/forged tokens are rejected instead of trusted.
function decodeSession(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return null;
  }
}

// extract session from Authorization header OR kc_token cookie
function getSession(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return decodeSession(auth.split(' ')[1]);
  const ck = req.cookies && req.cookies.kc_token;
  if (ck) return decodeSession(ck);
  return null;
}

// Resolve a bearer token that is an API key (kc_sk_...) to its owner's session.
// Used by the CLI agent / terminal clients that don't hold a browser JWT.
function resolveApiKey(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer kc_sk_')) return null;
  try {
    const keys = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'api-keys.json'), 'utf8'));
    const entry = keys[auth.slice(7)];
    if (!entry) return null;
    return { userId: entry.userId, email: entry.email, name: entry.name, role: entry.role || 'user', via: 'api-key' };
  } catch (_) { return null; }
}

// require a valid session; sets req.user
function requireAuth(req, res, next) {
  const user = getSession(req) || resolveApiKey(req);
  if (!user || !user.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  req.user = user;
  next();
}

// optional auth — attaches req.user if present
function optionalAuth(req, res, next) {
  req.user = getSession(req) || null;
  next();
}

// ---- JSON error catcher ---------------------------------------------------
app.use((err, req, res, _next) => {
  console.error('[keycode error]', req.path, err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: IS_PROD ? 'Internal error' : err.message || 'Internal error',
  });
});

// ===========================================================================
//  HEALTH
// ===========================================================================
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'keycode-api',
    version: '1.0.0',
    supabase: SUPABASE ? 'connected' : 'unset',
    stripe: STRIPE ? 'configured' : 'unset',
    mode: NODE_ENV,
  });
});

// ===========================================================================
//  AUTH  (register / login / logout / oauth / otp / magic link / passkey)
// ===========================================================================

  const AUTH = require('./routes/auth')({
    app,
    SUPABASE,
    SUPABASE_ADMIN,
    STRIPE,
    crypto,
    rand,
    hash,
    now,
    JWT_SECRET,
    JWT_EXPIRY,
    setSessionCookie,
    clearSessionCookie,
    optionalAuth,
    requireAuth,
    IS_PROD,
    projectRoot,
  });

// ===========================================================================
//  ORDERS
// ===========================================================================
  const Orders = require('./routes/orders')({
    app,
    SUPABASE,
    SUPABASE_ADMIN,
    rand,
    now,
    getSession,
    requireAuth,
    optionalAuth,
    IS_PROD,
  });

// ===========================================================================
//  PAYMENTS
// ===========================================================================
const Payments = require('./routes/payments')({
  app,
  SUPABASE,
  SUPABASE_ADMIN,
  STRIPE,
  rand,
  now,
  getSession,
  requireAuth,
  IS_PROD,
  projectRoot,
});

// ===========================================================================
//  SUPPORT TICKETS
// ===========================================================================
const Tickets = require('./routes/tickets')({
  app,
  SUPABASE,
  SUPABASE_ADMIN,
  now,
  getSession,
  requireAuth,
  IS_PROD,
});

// ===========================================================================
//  NOTIFICATIONS
// ===========================================================================
const Notifications = require('./routes/notifications')({
  app,
  SUPABASE,
  SUPABASE_ADMIN,
  now,
  getSession,
  requireAuth,
  IS_PROD,
});

// ===========================================================================
//  COUPONS (public validation + admin management)
// ===========================================================================
const Coupons = require('./routes/coupons')({
  app,
  SUPABASE,
  SUPABASE_ADMIN,
  now,
  IS_PROD,
});

// ===========================================================================
//  APP DATA + LOCAL AI ENGINE  (dashboard /api/user/*, builder /api/ai/*)
// ===========================================================================
const AppData = require('./routes/appdata')({
  app,
  SUPABASE,
  SUPABASE_ADMIN,
  requireAuth,
  rand,
  now,
  hash,
  JWT_SECRET,
  IS_PROD,
  PORT,
});

// ===========================================================================
//  AUTONOMOUS AGENT  (/api/agent/*)
// ===========================================================================
const AgentRoutes = require('./routes/agent')({
  app,
  requireAuth,
  now,
});

// ===========================================================================
//  WEBSITE ORDERS  (checkout flow)
// ===========================================================================
const WebsiteOrders = require('./routes/website-order')({
  app,
  SUPABASE,
  SUPABASE_ADMIN,
  rand,
  now,
  getSession,
  requireAuth,
  optionalAuth,
  IS_PROD,
});

// ===========================================================================
//  WEBHOOKS
// ===========================================================================
const Webhooks = require('./routes/webhooks')({
  app,
  SUPABASE,
  SUPABASE_ADMIN,
  STRIPE,
  hash,
  now,
  getSession,
  requireAuth,
});

// ===========================================================================
//  Static catch-all: serve the frontend for any non-API path.
//  This makes the SPA feel "real" even though it is a static export.
// ===========================================================================

// Static assets & real HTML pages (/, /checkout.html, /assets/*, /js/*...).
// MUST precede the SPA catch-all below, otherwise every non-API path
// (e.g. /checkout.html) would wrongly return index.html.
app.use(express.static(projectRoot, { extensions: ['html'], index: 'index.html' }));

const serveIndex = (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexPath = path.join(projectRoot, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
};
app.use(serveIndex);

// ===========================================================================
//  Start
// ===========================================================================
async function boot() {
  initSupabase();
  initStripe();

  // If an HTTP server is available, favour that over direct listen so we
  // can attach to a port the runtime controls; otherwise fallback.
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[keycode] API listening on :${PORT}  (mode=${NODE_ENV})`);
    console.log(`[keycode] health -> http://0.0.0.0:${PORT}/api/health`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[keycode] port ${PORT} in use — try PORT=3001`);
    } else {
      console.error('[keycode] server error:', err);
    }
    process.exit(1);
  });

  // graceful shutdown
  const shutdown = (signal) => {
    console.log(`[keycode] ${signal} — shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

// Export the app for tests (jest + supertest); only listen when run directly.
if (require.main === module) {
  boot().catch((err) => {
    console.error('[keycode] boot failed:', err);
    process.exit(1);
  });
}

module.exports = { app };
