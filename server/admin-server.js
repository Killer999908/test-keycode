import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const parentDir = path.resolve(__dirname, '..');

const ADMIN_PORT = 5001;
const API_PORT = 5000;

const app = express();

// Security headers
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://kit.fontawesome.com"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
    connectSrc: ["'self'", "http://localhost:*", "https://*"],
    imgSrc: ["'self'", "data:", "https://*", "blob:"],
    objectSrc: ["'none'"]
  }
}));

// Block non-admin pages
app.use((req, res, next) => {
  const adminOnlyPaths = ['/admin-panel.html', '/admin', '/'];
  const isAdminPage = adminOnlyPaths.some(p => req.path === p);
  const isApiCall = req.path.startsWith('/api');
  const isStatic = req.path.match(/\.(css|js|svg|png|jpg|ico|woff2?)$/);
  
  if (isApiCall || isStatic || isAdminPage) {
    return next();
  }
  
  // Redirect non-admin pages to admin login
  if (req.path === '/login.html' || req.path === '/') {
    return next();
  }
  
  res.status(403).send(`
    <!DOCTYPE html>
    <html><head><title>Access Denied</title>
    <style>body{background:#030305;color:#fff;font-family:Arial;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;text-align:center;padding:20px;}
    h1{color:#6366f1;font-size:48px;margin-bottom:16px;}p{color:#888;margin-bottom:24px;}
    a{padding:14px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;color:#fff;text-decoration:none;font-weight:600;}</style>
    </head><body>
    <h1>🔒 Admin Portal</h1>
    <p>This is the admin-only website. Please use the admin login.</p>
    <a href="/">Go to Admin Login</a>
    </body></html>
  `);
});

// Serve static files (only admin panel + common assets)
app.use(express.static(parentDir, {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('admin-panel.html')) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
  }
}));

// Root redirect to admin panel
app.get('/', (req, res) => {
  res.sendFile(path.join(parentDir, 'admin-panel.html'));
});

// Proxy API calls to main server
app.use(createProxyMiddleware({
  target: `http://localhost:${API_PORT}`,
  changeOrigin: true,
  pathFilter: '/api',
  onProxyReq: (proxyReq) => {
    proxyReq.setHeader('X-Admin-Proxy', 'true');
  }
}));

app.listen(ADMIN_PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║                                           ║
║   🔐 Admin Server is running!             ║
║                                           ║
║   URL: http://localhost:${ADMIN_PORT}       ║
║   API: http://localhost:${API_PORT}         ║
║   Mode: DEVELOPMENT                        ║
║                                           ║
║   ⚠️  Only admin-panel.html is served      ║
║                                           ║
╚═══════════════════════════════════════════╝
  `);
});
