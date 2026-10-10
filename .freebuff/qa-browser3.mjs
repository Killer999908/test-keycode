// Durable page sweeper. Run: QA_TOKEN=<jwt> node .freebuff/qa-browser3.mjs "page1.html,page2.html"
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3000';
const TOKEN = process.env.QA_TOKEN || '';
const PAGES = (process.argv[2] || '').split(',').filter(Boolean);
const NOISE = /favicon|google|gstatic|fonts\.|net::ERR_|analytics|adservice|doubleclick|manifest\.json|service[- ]?worker|sentry/i;

let user = { name: 'QA', email: 'qa@test.io', role: 'user' };
try {
  const p = JSON.parse(Buffer.from(TOKEN.split('.')[1] || '', 'base64').toString());
  if (p?.email) user = { name: p.name || 'QA', email: p.email, role: p.role || 'user', id: p.userId };
} catch (_) {}

const collect = (page, errs) => {
  page.on('pageerror', (x) => errs.push('pageerror: ' + (x.message || x)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
};

const checkPage = async (ctx, name, out) => {
  const errs = [];
  const page = await ctx.newPage();
  collect(page, errs);
  let status = 'NAV-FAIL';
  try {
    const resp = await page.goto(`${BASE}/${name}`, { waitUntil: 'networkidle', timeout: 15000 });
    status = resp ? `HTTP ${resp.status()}` : 'NAV-TIMEOUT';
  } catch (e) {
    status = 'NAV-TIMEOUT';
  }
  await page.waitForTimeout(400).catch(() => {});
  const real = errs.filter((x) => !NOISE.test(x));
  const navOk = status === 'HTTP 200' || status === 'HTTP 204' || status === 'HTTP 304';
  const verdict = real.length || !navOk
    ? `FAIL ${name} [${real[0] || ('nav-failed: ' + status)}] (${status})`
    : `PASS ${name} (${status})`;
  out.push(verdict);
  await page.close().catch(() => {});
  return real.length || (navOk ? 0 : 1);
};

const results = [];
let totalErrors = 0;
let pagesWithIssues = 0;

const br = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await br.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addInitScript(
  ([tok, usr]) => {
    try {
      localStorage.setItem('token', tok);
      localStorage.setItem('keycode_token', tok);
      localStorage.setItem('user', JSON.stringify(usr));
      localStorage.setItem('keycode_user', JSON.stringify(usr));
    } catch (_) {}
  },
  [TOKEN, user]
);

for (const name of PAGES) {
  const n = await checkPage(ctx, name, results);
  totalErrors += n;
  if (n > 0) pagesWithIssues++;
}

await ctx.close().catch(() => {});
await br.close().catch(() => {});

for (const line of results) console.log(line);
console.log(`TOTAL: ${PAGES.length} pages, JS-error count: ${totalErrors}, pages with issues: ${pagesWithIssues}`);
