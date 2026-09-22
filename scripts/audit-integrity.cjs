#!/usr/bin/env node
/* KEYCODE integrity audit: links ↔ files, fetches ↔ routes, precache ↔ disk */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const htmlFiles = fs.readdirSync(root).filter(f => f.endsWith('.html'));
const srcJs = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!/node_modules|dist|\.git|exports|preview|uploads|generated/.test(f)) walk(p); }
    else if (f.endsWith('.js')) srcJs.push(p);
  }
})(path.join(root, 'src'));
const sharedJs = ['js/site.js', 'js/k-scroll.js', 'js/loading-screen.js', 'js/scroll-3d-animations.js', 'public/sw.js'].map(f => path.join(root, f));

const problems = { links: [], fetches: [], precache: [] };

/* ---------- 1. Server route inventory ---------- */
const serverSrc = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
const routes = new Set();
for (const m of serverSrc.matchAll(/app\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
  routes.add(m[2]);
}
const hasRoute = (p) => {
  if (routes.has(p)) return true;
  for (const r of routes) {
    if (r.includes(':')) {
      const rx = new RegExp('^' + r.replace(/:[^/]+/g, '[^/]+') + '$');
      if (rx.test(p)) return true;
    }
  }
  return false;
};

/* ---------- 2. File existence helper ---------- */
const fileExists = (p) => {
  const clean = decodeURIComponent(p.split('?')[0].split('#')[0]);
  if (!clean || clean === '/') return fs.existsSync(path.join(root, 'index.html'));
  return ['.', 'public', 'dist'].some(base => fs.existsSync(path.join(root, base, clean)));
};

/* ---------- 3. Link audit in all HTML + UI templates ---------- */
const linkSources = htmlFiles.map(f => ({ file: f, src: fs.readFileSync(path.join(root, f), 'utf8') }));
for (const p of [...srcJs, ...sharedJs]) linkSources.push({ file: path.relative(root, p), src: fs.readFileSync(p, 'utf8') });
for (const { file, src } of linkSources) {
  if (/404\.html|offline\.html/.test(file) && /\.html/.test(file)) { /* still audit links */ }
  for (const m of src.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|tel:|data:|blob:|javascript:|#|\/\/)/.test(url)) continue;
    // Runtime templates are resolved from application data, not literal paths.
    // Their source strings cannot be validated as filesystem links here.
    if (url.includes('${')) continue;
    if (url.startsWith('/api/')) continue; // checked via fetch audit
    const target = url.split('?')[0].split('#')[0] || '/';
    if (target.startsWith('/api/')) continue;
    // .html pages and assets must exist on disk; bare dirs are server routes
    if (/\.[a-z0-9]+$/i.test(target)) {
      if (!fileExists(target)) problems.links.push(`${file} → ${url} (missing file)`);
    } else if (target !== '/') {
      if (!hasRoute(target) && !fileExists(target) && !fileExists(target + '/index.html')) problems.links.push(`${file} → ${url} (no route/file)`);
    }
  }
}

/* ---------- 4. Frontend fetch() ↔ server route audit ---------- */
for (const { file, src } of linkSources) {
  for (const m of src.matchAll(/fetch\(\s*[`'"]([^`'"]+)[`'"]/g)) {
    let url = m[1];
    // resolve simple template literals like /api/x/${id}
    url = url.replace(/\$\{[^}]+\}/g, ':param');
    if (!url.startsWith('/api/')) continue;
    const target = url.split('?')[0];
    if (hasRoute(target) || hasRoute(target.replace(/:param/g, 'x'))) continue;
    // prefix match for template paths
    const base = target.split(':param')[0];
    let ok = false;
    for (const r of routes) { if (r.startsWith(base) && r.includes(':')) { ok = true; break; } }
    if (!ok) problems.fetches.push(`${file} → fetch ${url} (no server route)`);
  }
}

/* ---------- 5. Service-worker precache audit ---------- */
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const pm = sw.match(/PRECACHE\s*=\s*\[([\s\S]*?)\]/);
if (pm) {
  for (const m of pm[1].matchAll(/['"]([^'"]+)['"]/g)) {
    const p = m[1];
    if (!fileExists(p) && !hasRoute(p)) problems.precache.push(p);
  }
}

/* ---------- 6. Report ---------- */
const count = problems.links.length + problems.fetches.length + problems.precache.length;
console.log(`Routes: ${routes.size} · HTML pages: ${htmlFiles.length} · JS audited: ${linkSources.length}`);
if (!count) { console.log('✅ ALL LINKS, FETCHES & PRECACHE RESOLVE'); process.exit(0); }
console.log(`\n❌ ${count} problems:\n`);
console.log('-- Missing link/file targets --'); problems.links.forEach(x => console.log('  ' + x));
console.log('-- Fetches without server routes --'); problems.fetches.forEach(x => console.log('  ' + x));
console.log('-- SW precache missing --'); problems.precache.forEach(x => console.log('  ' + x));
process.exit(1);
