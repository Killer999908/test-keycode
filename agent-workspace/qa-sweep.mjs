import pkg from '/home/killer/.npm-global/lib/node_modules/playwright/node_modules/playwright-core/index.js';
const { chromium } = pkg;
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BASE = 'http://127.0.0.1:3000';

const pages = [
  '404.html', 'admin-access.html', 'admin-login.html', 'admin-panel.html', 'ai-health.html',
  'api-keys.html', 'blog.html', 'changelog.html', 'checkout.html', 'client-panel.html',
  'control-panel.html', 'cookies.html', 'dashboard.html', 'deployments.html', 'docs.html',
  'downloads.html', 'gallery.html', 'game-builder.html', 'game.html', 'index.html',
  'login.html', 'news.html', 'notifications.html', 'offline.html', 'os.html',
  'otp-login.html', 'playground.html', 'preview.html', 'pricing.html', 'privacy.html',
  'profile.html', 'project-preview.html', 'realtime-game-builder.html', 'register.html', 'reset-password.html',
  'scan-3d.html', 'shop.html', 'signup.html', 'status.html', 'support.html',
  'terms.html', 'tools.html', 'verify-email.html', 'viewer.html',
];
const unique = [...new Set(pages)];

function findBrokenAssetPaths(html) {
  const broken = [];
  const re = /(src|href)=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const attr = m[1];
    let url = m[2];
    if (url.startsWith('#')) continue;
    if (url.startsWith('javascript:')) continue;
    if (url.startsWith('data:')) continue;
    if (url.startsWith('http://') || url.startsWith('https://')) continue;
    if (url.startsWith('//')) continue;
    let filePath = url;
    if (filePath.startsWith('/')) filePath = filePath.slice(1);
    filePath = filePath.split('?')[0].split('#')[0];
    if (!filePath) continue;
    const full = path.join(PROJECT_ROOT, filePath);
    if (!fs.existsSync(full)) {
      broken.push({ attr, url: m[2], file: filePath });
    }
  }
  return broken;
}

async function waitForServer(url, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          resolve(res.statusCode >= 200 && res.statusCode < 500);
        });
        req.on('error', reject);
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return false;
}

async function main() {
  const serverReady = await waitForServer(BASE + '/');
  if (!serverReady) {
    console.error('Server not ready at ' + BASE);
    process.exit(1);
  }

  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const report = [];

  for (const p of unique) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const result = {
      page: p,
      httpStatus: null,
      consoleErrors: [],
      consoleWarnings: [],
      failedResources: [],
      deadLinks: [],
      bodyTextLength: 0,
      buttonCount: 0,
      linkCount: 0,
      brokenAssetPaths: [],
    };

    page.on('console', msg => {
      if (msg.type() === 'error') result.consoleErrors.push(msg.text().slice(0, 200));
      else if (msg.type() === 'warning') result.consoleWarnings.push(msg.text().slice(0, 200));
    });
    page.on('response', async r => {
      if (r.status() >= 400) {
        result.failedResources.push(`${r.status()} ${r.url().replace(BASE, '')}`);
      }
    });
    page.on('requestfailed', r => {
      result.failedResources.push('FAILED ' + r.url().replace(BASE, ''));
    });

    try {
      const resp = await page.goto(BASE + '/' + p, { waitUntil: 'load', timeout: 15000 });
      result.httpStatus = resp ? resp.status() : null;
      await page.waitForTimeout(600);

      const bodyText = await page.locator('body').innerText();
      result.bodyTextLength = bodyText ? bodyText.length : 0;

      result.buttonCount = await page.locator('button, input[type="submit"], input[type="button"]').count();
      result.linkCount = await page.locator('a[href]').count();

      const deadAnchors = await page.evaluate(() => {
        const dead = [];
        document.querySelectorAll('a[href^="#"]').forEach(a => {
          const id = a.getAttribute('href').slice(1);
          if (id && !document.getElementById(id)) {
            dead.push('#' + id);
          }
        });
        return dead;
      });
      result.deadLinks = deadAnchors;

      const html = await page.content();
      result.brokenAssetPaths = findBrokenAssetPaths(html);
    } catch (e) {
      result.httpStatus = 'ERROR';
      result.consoleErrors.push(String(e).split('\n')[0].slice(0, 200));
    }

    report.push(result);
    await ctx.close();
  }

  await browser.close();

  console.log('\n=== KEYCODE QA SWEEP REPORT ===\n');
  for (const r of report) {
    const hasIssues = r.consoleErrors.length || r.failedResources.length || r.deadLinks.length || r.brokenAssetPaths.length || r.httpStatus >= 400 || r.httpStatus === 'ERROR';
    const flag = hasIssues ? ' *** ISSUES ***' : '';
    console.log(`\n-- ${r.page} (status=${r.httpStatus})${flag}`);
    if (r.consoleErrors.length) {
      console.log('   consoleErrors:');
      r.consoleErrors.slice(0, 5).forEach(e => console.log('     ' + e));
    }
    if (r.failedResources.length) {
      console.log('   failedResources:');
      r.failedResources.slice(0, 5).forEach(f => console.log('     ' + f));
    }
    if (r.deadLinks.length) {
      console.log('   deadLinks:');
      r.deadLinks.slice(0, 5).forEach(d => console.log('     ' + d));
    }
    if (r.brokenAssetPaths.length) {
      console.log('   brokenAssetPaths:');
      r.brokenAssetPaths.slice(0, 5).forEach(b => console.log('     ' + b.attr + '="' + b.url + '" -> file not found: ' + b.file));
    }
    console.log(`   bodyTextLength=${r.bodyTextLength} buttons=${r.buttonCount} links=${r.linkCount}`);
  }

  const totalIssues = report.reduce((sum, r) => sum + r.consoleErrors.length + r.failedResources.length + r.deadLinks.length + r.brokenAssetPaths.length + (r.httpStatus >= 400 || r.httpStatus === 'ERROR' ? 1 : 0), 0);
  console.log(`\n=== SUMMARY: ${report.length} pages crawled, ${totalIssues} issues found ===\n`);
  process.exit(totalIssues ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
