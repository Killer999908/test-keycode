import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const parentDir = path.resolve(__dirname, '..');

const ADMIN_PORT = parseInt(process.env.ADMIN_PORT || '5001', 10);
const API_PORT = parseInt(process.env.API_PORT || '5000', 10);
if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is required');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// ===== SECURITY CONFIG =====
// Obfuscated admin URL — random 32-char hex token, regenerated on restart
const BASIC_AUTH_USER = process.env.ADMIN_BASIC_USER || 'keycode';
const BASIC_AUTH_PASS = process.env.ADMIN_BASIC_PASS || crypto.randomBytes(12).toString('hex');
const ADMIN_SECRET_PATH = crypto.randomBytes(16).toString('hex');
const ADMIN_PANEL_PATH = `/admin-${ADMIN_SECRET_PATH}`;
console.log(`[Security] Admin panel: http://localhost:${ADMIN_PORT}${ADMIN_PANEL_PATH}`);
if (process.env.NODE_ENV !== 'production') {
  console.log(`[Security] Basic Auth: ${BASIC_AUTH_USER}:${BASIC_AUTH_PASS}`);
}

// Tailscale IP range
const ADMIN_IP_WHITELIST = new Set(process.env.ADMIN_IP_WHITELIST?.split(',').map(s => s.trim()).filter(Boolean) || []);

const app = express();

// Security headers
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://kit.fontawesome.com"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
    connectSrc: ["'self'", "http://localhost:5000", "http://localhost:5001"],
    imgSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com", "https://api.qrserver.com"],
    objectSrc: ["'none'"],
    frameSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"]
  }
}));
app.use(express.json());
app.use(cookieParser());

// ===== LAYER 1: Tailscale / IP whitelist gate =====
app.set('trust proxy', true);
app.use((req, res, next) => {
  const ip = req.ip;
  if (!ip) {
    console.warn('[Gate] Blocked request with no identifiable IP');
    return res.status(403).send('Access denied.');
  }
  // Always allow localhost
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost') return next();
  // Allow Tailscale IPs (CGNAT range 100.64.0.0/10)
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}/.test(ip)) return next();
  // Allow whitelisted IPs
  if (ADMIN_IP_WHITELIST.has(ip)) return next();
  // Block everything else
  console.warn(`[Gate] Blocked access from non-Tailscale IP: ${ip}`);
  return res.status(403).send('Access denied. Admin portal is only accessible via authorized networks.');
});

// Health check endpoint (no auth required for load balancers)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ===== LAYER 2: HTTP Basic Authentication =====
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', `Basic realm="KEYCODE Admin", charset="UTF-8"`);
    return res.status(401).send('Authentication required');
  }
  const base64 = authHeader.split(' ')[1];
  const decoded = Buffer.from(base64, 'base64').toString('utf-8');
  const [user, pass] = decoded.split(':');
  if (user !== BASIC_AUTH_USER || pass !== BASIC_AUTH_PASS) {
    return res.status(403).send('Invalid credentials');
  }
  next();
});

// ===== LAYER 3: Session validation / obfuscated URL =====
app.get('/', (req, res) => {
  res.redirect(ADMIN_PANEL_PATH);
});

app.get(ADMIN_PANEL_PATH, (req, res) => {
  const token = req.cookies?.adminToken;
  if (!token) return res.redirect('/login');
  try {
    jwt.verify(token, JWT_SECRET);
    res.sendFile(path.join(parentDir, 'admin-panel.html'));
  } catch (e) {
    res.clearCookie('adminToken');
    res.redirect('/login');
  }
});

// Also serve admin panel at /admin-{secret}
app.get('/admin-panel.html', (req, res) => {
  res.redirect(ADMIN_PANEL_PATH);
});

// Login page
app.get('/login', (req, res) => {
  const token = req.cookies?.adminToken;
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return res.redirect(ADMIN_PANEL_PATH);
    } catch (e) {}
  }
  res.sendFile(path.join(parentDir, 'admin-login.html'));
});

// ===== LAYER 4: Auth API handlers (proxy with cookie injection) =====
const isProduction = process.env.NODE_ENV === 'production';
const cookieSecure = isProduction;
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const apiRes = await fetch(`http://localhost:${API_PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await apiRes.json();
    if (data.token && data.user?.role === 'admin') {
      res.cookie('adminToken', data.token, {
        httpOnly: true, secure: cookieSecure, sameSite: 'strict',
        maxAge: 15 * 60 * 1000
      });
    }
    res.status(apiRes.status).json(data);
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Auth proxy timed out' : 'Auth proxy failed';
    console.error('[AdminServer] Login proxy error:', e.message);
    res.status(502).json({ error: msg });
  }
});

app.post('/api/auth/admin-login', authLimiter, async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const apiRes = await fetch(`http://localhost:${API_PORT}/api/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await apiRes.json();
    if (data.token) {
      res.cookie('adminToken', data.token, {
        httpOnly: true, secure: cookieSecure, sameSite: 'strict',
        maxAge: 15 * 60 * 1000
      });
    }
    res.status(apiRes.status).json(data);
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Auth proxy timed out' : 'Auth proxy failed';
    console.error('[AdminServer] Admin-login proxy error:', e.message);
    res.status(502).json({ error: msg });
  }
});

// Block non-admin static pages
app.use((req, res, next) => {
  const allowedPaths = [ADMIN_PANEL_PATH, '/login', '/admin-login.html'];
  const isAllowed = allowedPaths.some(p => req.path === p || req.path.startsWith(p));
  const isApiCall = req.path.startsWith('/api');
  const isStatic = req.path.match(/\.(css|js|svg|png|jpg|ico|woff2?)$/);
  if (isApiCall || isStatic || isAllowed) return next();
  res.status(403).send(`
    <!DOCTYPE html>
    <html><head><title>Access Denied</title>
    <style>body{background:#030305;color:#fff;font-family:Arial;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;text-align:center;padding:20px;}
    h1{color:#6366f1;font-size:48px;margin-bottom:16px;}p{color:#888;margin-bottom:24px;}
    a{padding:14px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;color:#fff;text-decoration:none;font-weight:600;}</style>
    </head><body>
    <h1>🔒 Admin Portal</h1>
    <p>This is the admin-only website.</p>
    </body></html>
  `);
});

// Serve only whitelisted static files (no filesystem exposure)
const ALLOWED_STATIC_FILES = new Set([
  'admin-login.html',
  'admin-panel.html',
  'favicon.ico',
  'apple-touch-icon.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png'
]);
app.use((req, res, next) => {
  const filename = path.basename(req.path);
  if (ALLOWED_STATIC_FILES.has(filename)) {
    const filePath = path.join(parentDir, filename);
    if (filePath.startsWith(parentDir)) {
      return res.sendFile(filePath);
    }
  }
  next();
});

// Inject auth header from cookie before proxy (overrides Basic Auth)
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/login') || req.path.startsWith('/auth/admin-login')) return next();
  if (req.cookies?.adminToken) {
    req.headers.authorization = `Bearer ${req.cookies.adminToken}`;
  }
  next();
});

// Proxy API calls to main server
app.use(createProxyMiddleware({
  target: `http://localhost:${API_PORT}`,
  changeOrigin: true,
  pathFilter: (path) => path.startsWith('/api') && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/admin-login'),
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('X-Admin-Proxy', 'true');
    if (req.headers.authorization) {
      proxyReq.setHeader('Authorization', req.headers.authorization);
    }
  }
}));

const server = app.listen(ADMIN_PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║                                           ║
║   🔐 Admin Server is running!             ║
║                                           ║
║   URL: http://localhost:${ADMIN_PORT}       ║
║   Panel: http://localhost:${ADMIN_PORT}${ADMIN_PANEL_PATH} ║
║                                           ║
║   SECURITY LAYERS:                        ║
║   Layer 1: Tailscale VPN gate             ║
║   Layer 2: HTTP Basic Auth                ║
║   Layer 3: Obfuscated URL                 ║
║   Layer 4: JWT + 15min timeout            ║
║   Layer 5: IP whitelist                   ║
║                                           ║
╚═══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[AdminServer] ${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('[AdminServer] All connections closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[AdminServer] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));