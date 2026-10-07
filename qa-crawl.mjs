import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3000';
const pages = [
  '404.html', 'admin-access.html', 'admin-login.html', 'admin-panel.html', 'ai-health.html',
  'api-keys.html', 'blog.html', 'changelog.html', 'checkout.html', 'client-panel.html',
  'control-panel.html', 'cookies.html', 'dashboard.html', 'deployments.html', 'docs.html',
  'downloads.html', 'gallery.html', 'game-builder.html', 'game.html', 'index.html',
  'login.html', 'news.html', 'notifications.html', 'offline.html', 'os.html',
  'otp-login.html', 'playground.html', 'preview.html', 'pricing.html', 'privacy.html',
  'profile.html', 'project-preview.html', 'realtime-game-builder.html', 'register.html', 'reset-password.html',
  'scan-3d.html', 'shop.html', 'signup.html', 'status.html', 'support.html',
  'terms.html', 'tools.html', 'verify-email.html', 'viewer.html', 'os.html', 'index.html',
];
const unique = [...new Set(pages)];

// Fresh auth token for authed pages
const email = `qa_crawl_${Date.now()}@test.local`;
const reg = await fetch(BASE + '/api/auth/register', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: 'Test1234!', name: 'QA Crawl' }),
}).then(r => r.json()).catch(() => ({}));
const token = reg.token || reg.accessToken;
console.log('token_ok=' + !!token, '| crawling', unique.length, 'pages');

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const report = [];

for (const p of unique) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const local = [], external = [];
  page.on('response', r => { if (r.status() >= 400) (r.url().startsWith(BASE) ? local : external).push(`${r.status()} ${r.url().replace(BASE, '')}`); });
  page.on('requestfailed', r => (r.url().startsWith(BASE) ? local : external).push('FAILED ' + r.url().replace(BASE, '')));
  page.on('pageerror', e => local.push('JS ' + String(e).split('\n')[0].slice(0, 140)));
  try {
    await page.addInitScript(t => { localStorage.setItem('token', t); localStorage.setItem('keycode_token', t); }, token);
  } catch {}
  try { await page.goto(BASE + '/' + p, { waitUntil: 'load', timeout: 20000 }); await page.waitForTimeout(1600); }
  catch (e) { local.push('goto ' + String(e).split('\n')[0].slice(0, 100)); }
  if (local.length) report.push({ page: p, local, external: external.length });
  await ctx.close();
}
await browser.close();

for (const r of report) {
  console.log(`\n== /${r.page} (ext_blocked=${r.external})`);
  r.local.slice(0, 6).forEach(x => console.log('   ' + x));
}
console.log(`\nCRAWL: ${report.length} pages with local errors / ${unique.length} crawled`);
process.exit(report.length ? 1 : 0);
