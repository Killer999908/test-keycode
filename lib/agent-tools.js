'use strict';
// ============================================================
//  AGENT TOOL LIBRARY — lib/agent-tools.js
//  Sandboxed, auditable tools the KEYCODE agent can call.
//  Every tool: { name, group, desc, danger, args, run(args, ctx) }
//  ctx = { log(line), workdir, requestId }
//  Security: shell/fs tools are confined to a per-run workspace
//  directory; network tools use fetch with size/time limits.
// ============================================================
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_OUT = 200000;   // bytes captured per command
const MAX_FILE_READ = 512 * 1024;

function REGISTRY_BY_NAME(name) { return TOOLS.find(function (t) { return t.name === name; }); }

function safeWorkdir(root, rel) {
  const workspace = path.resolve(root);
  const p = path.resolve(workspace, rel || '.');
  if (p !== workspace && !p.startsWith(workspace + path.sep)) throw new Error('path escapes workspace: ' + rel);
  const rootStat = fs.lstatSync(workspace);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('invalid workspace root');
  let current = workspace;
  for (const part of path.relative(workspace, p).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('symbolic links are not allowed in the workspace: ' + rel);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      break;
    }
  }
  let existing = p;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const real = fs.realpathSync(existing);
  if (real !== workspace && !real.startsWith(workspace + path.sep)) throw new Error('path escapes workspace: ' + rel);
  return p;
}

function sh(cmd, args, opts) {
  return new Promise(function (resolve) {
    execFile(cmd, args, Object.assign({
      timeout: 60000, maxBuffer: 4 * 1024 * 1024, cwd: opts && opts.cwd, env: Object.assign({}, process.env, { LC_ALL: 'C' }),
    }, opts), function (err, stdout, stderr) {
      resolve({ code: err && err.code ? err.code : (err ? 1 : 0), stdout: String(stdout || '').slice(0, MAX_OUT), stderr: String(stderr || '').slice(0, MAX_OUT) });
    });
  });
}

const TOOLS = [
  // ---------- filesystem (workspace-scoped) ----------
  {
    name: 'fs_write', group: 'fs', danger: false,
    desc: 'Create or overwrite a file inside the agent workspace. args: {path, content}',
    args: { path: 'string', content: 'string' },
    run: function (a, ctx) {
      const p = safeWorkdir(ctx.workdir, a.path);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, String(a.content == null ? '' : a.content));
      return { ok: true, path: p, bytes: Buffer.byteLength(String(a.content || '')) };
    },
  },
  {
    name: 'fs_read', group: 'fs', danger: false,
    desc: 'Read a file from the workspace (text, up to 512KB). args: {path}',
    args: { path: 'string' },
    run: function (a, ctx) {
      const p = safeWorkdir(ctx.workdir, a.path);
      const buf = fs.readFileSync(p);
      return { ok: true, path: p, content: buf.length > MAX_FILE_READ ? buf.slice(0, MAX_FILE_READ).toString('utf8') + '\n…[truncated]' : buf.toString('utf8') };
    },
  },
  {
    name: 'fs_list', group: 'fs', danger: false,
    desc: 'List files in a workspace directory (recursive, shallow metadata). args: {path?}',
    args: { path: 'string?' },
    run: function (a, ctx) {
      const root = safeWorkdir(ctx.workdir, a.path || '.');
      const out = [];
      (function walk(dir, depth) {
        if (depth > 6 || out.length > 2000) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isSymbolicLink()) continue;
          if (out.length < 2000) out.push({ path: path.relative(root, full), dir: e.isDirectory(), bytes: e.isDirectory() ? 0 : fs.statSync(full).size });
          if (e.isDirectory()) walk(full, depth + 1);
        }
      })(root, 0);
      return { ok: true, files: out };
    },
  },
  {
    name: 'fs_delete', group: 'fs', danger: true,
    desc: 'Delete a file or directory inside the workspace. args: {path}',
    args: { path: 'string' },
    run: function (a, ctx) {
      const p = safeWorkdir(ctx.workdir, a.path);
      fs.rmSync(p, { recursive: true, force: true });
      return { ok: true, deleted: p };
    },
  },

  // ---------- shell (whitelisted binaries) ----------
  {
    name: 'shell', group: 'shell', danger: true,
    desc: 'Run an allowed program with arguments (node, python3, npm, git, curl are NOT allowed — use http_get; allowed: node, python3, npm, npx, ls, cat, mkdir, echo, sed, grep, find, tar, unzip, pandoc, ffmpeg, convert). args: {cmd, args[], cwd?}',
    args: { cmd: 'string', args: 'array', cwd: 'string?' },
    run: async function (a, ctx) {
      const ALLOW = new Set(['node', 'python3', 'npm', 'npx', 'ls', 'cat', 'mkdir', 'echo', 'sed', 'grep', 'find', 'tar', 'unzip', 'gzip', 'pandoc', 'ffmpeg', 'convert', 'wc', 'head', 'tail', 'sort', 'uniq']);
      const cmd = String(a.cmd || '');
      if (!ALLOW.has(cmd)) return { ok: false, error: 'command not allowed: ' + cmd };
      const cwd = a.cwd ? safeWorkdir(ctx.workdir, a.cwd) : ctx.workdir;
      const r = await sh(cmd, (a.args || []).map(String), { cwd: cwd });
      return { ok: r.code === 0, code: r.code, stdout: r.stdout, stderr: r.stderr };
    },
  },

  // ---------- network ----------
  {
    name: 'http_get', group: 'net', danger: false,
    desc: 'Fetch a URL (http/https) and return text (HTML/JSON) up to 512KB. args: {url, headers?}',
    args: { url: 'string', headers: 'object?' },
    run: async function (a) {
      const url = String(a.url || '');
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'only http(s) URLs allowed' };
      const ac = new AbortController();
      const t = setTimeout(function () { try { ac.abort(); } catch (_) { } }, 30000);
      try {
        const r = await fetch(url, { headers: a.headers || { 'User-Agent': 'KEYCODE-Agent/1.0' }, signal: ac.signal, redirect: 'follow' });
        const buf = Buffer.from(await r.arrayBuffer());
        return { ok: r.ok, status: r.status, contentType: r.headers.get('content-type') || '', body: buf.length > MAX_FILE_READ ? buf.slice(0, MAX_FILE_READ).toString('utf8') + '\n…[truncated]' : buf.toString('utf8') };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      } finally { clearTimeout(t); }
    },
  },
  {
    name: 'web_search', group: 'net', danger: false,
    desc: 'Search the web via DuckDuckGo (instant-answer + HTML scrape). args: {query}',
    args: { query: 'string' },
    run: async function (a) {
      const q = String(a.query || '').slice(0, 300);
      if (!q.trim()) return { ok: false, error: 'query required' };
      try {
        const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), { headers: { 'User-Agent': 'Mozilla/5.0 KEYCODE-Agent' } });
        const html = await r.text();
        const out = [];
        const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        let m;
        while ((m = re.exec(html)) && out.length < 8) {
          const href = m[1].replace(/&amp;/g, '&');
          const u = href.match(/uddg=([^&]+)/) ? decodeURIComponent(href.match(/uddg=([^&]+)/)[1]) : href;
          out.push({ title: m[2].replace(/<[^>]+>/g, '').trim(), url: u });
        }
        return { ok: true, results: out };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    },
  },

  // ---------- LLM ----------
  {
    name: 'llm', group: 'ai', danger: false,
    desc: 'Call the configured LLM for reasoning/summarization/codegen. args: {prompt, system?, maxTokens?, temperature?}',
    args: { prompt: 'string', system: 'string?', maxTokens: 'number?', temperature: 'number?' },
    run: async function (a) {
      const ai = require('./ai-provider');
      const r = await ai.llmComplete(String(a.prompt || ''), { system: a.system, maxTokens: a.maxTokens || 4096, temperature: a.temperature });
      if (!r) return { ok: false, error: 'no LLM configured or call failed (set AI_PROVIDER/AI_API_KEY)' };
      return { ok: true, text: r.text, model: r.model };
    },
  },
  {
    name: 'think', group: 'ai', danger: false,
    desc: 'Private scratchpad: record a reasoning note (no side effects). args: {note}',
    args: { note: 'string' },
    run: async function (a) { return { ok: true, noted: String(a.note || '').slice(0, 2000) }; },
  },

  // ---------- code / QA ----------
  {
    name: 'js_eval', group: 'code', danger: true,
    desc: 'Evaluate a JavaScript expression in a sandboxed vm context (no require, 2s limit). args: {code}',
    args: { code: 'string' },
    run: async function (a) {
      const vm = require('vm');
      try {
        const sandbox = { console: { log: function () { } }, Math, JSON, Date, RegExp, String, Number, Array, Object };
        const r = vm.runInNewContext(String(a.code || ''), sandbox, { timeout: 2000 });
        return { ok: true, result: typeof r === 'object' ? JSON.stringify(r).slice(0, 4000) : String(r) };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    },
  },
  {
    name: 'run_tests', group: 'code', danger: false,
    desc: 'Run npm test inside the project (host repo), not the workspace. args: {}',
    args: {},
    run: async function (a, ctx) {
      const r = await sh('npm', ['test', '--silent'], { cwd: ctx.hostRoot, timeout: 180000 });
      return { ok: r.code === 0, code: r.code, stdout: r.stdout.slice(-8000), stderr: r.stderr.slice(-4000) };
    },
  },

  // ---------- agent-native build skills ----------
  {
    name: 'build_website', group: 'skill', danger: false,
    desc: 'Generate a complete single-file HTML website from a prompt into the workspace (uses LLM when configured, template fallback). args: {prompt, name?}',
    args: { prompt: 'string', name: 'string?' },
    run: async function (a, ctx) {
      const ai = require('./ai-provider');
      const file = path.join(ctx.workdir, 'site.html');
      let html = null, engine = 'template';
      if (ai.llmInfo().configured) {
        const r = await ai.llmComplete('Build a complete production-quality single-file HTML website for: ' + JSON.stringify(String(a.prompt || '')) + '. One HTML5 doc, all CSS in one <style>, all JS in one <script>, responsive, sections hero/features/pricing/faq/contact, no CDNs except Google Fonts, no lorem ipsum.',
          { system: 'You are an expert web developer. Output only the HTML document.', maxTokens: 16000, temperature: 0.8 });
        if (r) {
          let t = r.text.trim();
          const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
          if (fence) t = fence[1].trim();
          if (/<html/i.test(t) && t.length > 300) { html = t; engine = 'llm'; }
        }
      }
      if (!html) {
        const name = String(a.name || 'My Site');
        html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + name + '</title>' +
          '<style>body{font-family:system-ui,sans-serif;margin:0;background:#0a0a0f;color:#e2e8f0;line-height:1.6}main{max-width:960px;margin:0 auto;padding:64px 24px}h1{font-size:42px}</style></head>' +
          '<body><main><h1>' + name + '</h1><p>' + String(a.prompt || '').slice(0, 200) + '</p><section id="features"></section><section id="pricing"></section><section id="faq"></section><section id="contact"><form onsubmit="event.preventDefault();this.reset();alert(\'sent\')"><input required placeholder="Email"><textarea required placeholder="Message"></textarea><button>Send</button></form></section></main></body></html>';
      }
      fs.writeFileSync(file, html);
      return { ok: true, file: 'site.html', engine: engine, bytes: Buffer.byteLength(html) };
    },
  },

  // ---------- browser automation (headless chromium) ----------
  {
    name: 'browser_visit', group: 'browser', danger: false,
    desc: 'Open a URL in headless Chromium; return title, console errors, failed requests and an optional screenshot path. args: {url, waitMs?, screenshot?}',
    args: { url: 'string', waitMs: 'number?', screenshot: 'boolean?' },
    run: async function (a, ctx) {
      const url = String(a.url || '');
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'http(s) url required' };
      let chromium;
      try { ({ chromium } = require('playwright-core')); } catch (_) { try { chromium = require('playwright').chromium; } catch (_) { return { ok: false, error: 'playwright not installed (npm i playwright-core)' }; } }
      let browser;
      try {
        browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
        const page = await (await browser.newContext()).newPage();
        const errors = [], failed = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
        page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
        page.on('requestfailed', (r) => failed.push('FAILED ' + r.url()));
        await page.goto(url, { waitUntil: 'load', timeout: 25000 });
        await page.waitForTimeout(Math.min(Number(a.waitMs) || 1200, 8000));
        const out = { ok: true, title: await page.title(), consoleErrors: errors.slice(0, 20), failedRequests: failed.slice(0, 20) };
        if (a.screenshot) {
          const shot = safeWorkdir(ctx.workdir, 'screenshot.png');
          await page.screenshot({ path: shot, fullPage: false });
          out.screenshot = 'screenshot.png';
        }
        return out;
      } catch (e) {
        return { ok: false, error: String(e && e.message || e).slice(0, 400) };
      } finally { try { await browser.close(); } catch (_) {} }
    },
  },
  {
    name: 'browser_extract', group: 'browser', danger: false,
    desc: 'Open a URL in headless Chromium and extract page text (JS-rendered content included). args: {url, selector?}',
    args: { url: 'string', selector: 'string?' },
    run: async function (a, ctx) {
      let chromium;
      try { ({ chromium } = require('playwright-core')); } catch (_) { try { chromium = require('playwright').chromium; } catch (_) { return { ok: false, error: 'playwright not installed (npm i playwright-core)' }; } }
      let browser;
      try {
        browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
        const page = await (await browser.newContext()).newPage();
        await page.goto(String(a.url || ''), { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(1000);
        const text = await page.evaluate(function (sel) {
          if (sel) { var el = document.querySelector(sel); return el ? el.innerText : null; }
          return document.body ? document.body.innerText : '';
        }, a.selector || null);
        return { ok: true, text: String(text || '').slice(0, 20000) };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e).slice(0, 400) };
      } finally { try { await browser.close(); } catch (_) {} }
    },
  },

  // ---------- git / code hosting ----------
  {
    name: 'git_clone', group: 'git', danger: false,
    desc: 'Clone a public git repo into the workspace. args: {url}',
    args: { url: 'string' },
    run: async function (a, ctx) {
      const url = String(a.url || '');
      if (!/^https:\/\//i.test(url)) return { ok: false, error: 'https git url required' };
      const name = (url.replace(/\.git$/, '').split('/').pop() || 'repo').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'repo';
      const r = await sh('git', ['clone', '--depth', '1', url, name], { cwd: ctx.workdir, timeout: 120000 });
      return { ok: r.code === 0, dir: name, stdout: r.stdout.slice(0, 2000), stderr: r.stderr.slice(0, 2000) };
    },
  },
  {
    name: 'http_post', group: 'net', danger: true,
    desc: 'POST JSON to an API endpoint (webhooks, APIs). args: {url, body, headers?}',
    args: { url: 'string', body: 'object', headers: 'object?' },
    run: async function (a) {
      const url = String(a.url || '');
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'http(s) url required' };
      const ac = new AbortController();
      const t = setTimeout(function () { try { ac.abort(); } catch (_) {} }, 30000);
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json', 'User-Agent': 'KEYCODE-Agent/1.0' }, a.headers || {}),
          body: JSON.stringify(a.body || {}),
          signal: ac.signal,
        });
        const text = (await r.text()).slice(0, MAX_OUT);
        return { ok: r.ok, status: r.status, body: text };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
      finally { clearTimeout(t); }
    },
  },

  // ---------- GitHub (requires GITHUB_TOKEN env) ----------
  {
    name: 'github_call', group: 'github', danger: true,
    desc: 'Authenticated GitHub REST API call (repos, issues, PRs, commits...). args: {method?, path (e.g. /repos/owner/repo/issues), body?}. Needs GITHUB_TOKEN env.',
    args: { method: 'string?', path: 'string', body: 'object?' },
    run: async function (a) {
      const token = process.env.GITHUB_TOKEN;
      if (!token) return { ok: false, error: 'GITHUB_TOKEN not set (github.com/settings/tokens -> repo scope, then add GITHUB_TOKEN=ghp_... to .env)' };
      const p = String(a.path || '');
      if (!/^\/[\w./-]*$/.test(p)) return { ok: false, error: 'path must start with / and contain only word chars, dots, dashes, slashes' };
      const ac = new AbortController();
      const t = setTimeout(function () { try { ac.abort(); } catch (_) {} }, 30000);
      try {
        const r = await fetch('https://api.github.com' + p, {
          method: String(a.method || 'GET').toUpperCase(),
          headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'KEYCODE-Agent', 'Content-Type': 'application/json' },
          body: a.body ? JSON.stringify(a.body) : undefined,
          signal: ac.signal,
        });
        const text = (await r.text()).slice(0, MAX_OUT);
        let data; try { data = JSON.parse(text); } catch (_) { data = text; }
        return { ok: r.ok, status: r.status, data: data };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
      finally { clearTimeout(t); }
    },
  },
  {
    name: 'github_create_issue', group: 'github', danger: true,
    desc: 'Create an issue on a GitHub repo. args: {repo (owner/name), title, body?, labels?}. Needs GITHUB_TOKEN.',
    args: { repo: 'string', title: 'string', body: 'string?', labels: 'array?' },
    run: async function (a) {
      const call = REGISTRY_BY_NAME('github_call');
      const r = await call.run({ method: 'POST', path: '/repos/' + String(a.repo || '').replace(/[^\w./-]/g, '') + '/issues', body: { title: String(a.title || ''), body: String(a.body || ''), labels: Array.isArray(a.labels) ? a.labels : undefined } });
      if (r.ok) return { ok: true, issue: r.data.html_url, number: r.data.number };
      return r;
    },
  },
  {
    name: 'github_create_pr', group: 'github', danger: true,
    desc: 'Open a pull request from an existing branch. args: {repo (owner/name), head (branch), base?, title, body?}. Needs GITHUB_TOKEN. Push the branch first (git_clone + shell + git push with token remote).',
    args: { repo: 'string', head: 'string', base: 'string?', title: 'string', body: 'string?' },
    run: async function (a) {
      const call = REGISTRY_BY_NAME('github_call');
      const repo = String(a.repo || '').replace(/[^\w./-]/g, '');
      const r = await call.run({ method: 'POST', path: '/repos/' + repo + '/pulls', body: { title: String(a.title || ''), head: String(a.head || ''), base: String(a.base || 'main'), body: String(a.body || '') } });
      if (r.ok) return { ok: true, pr: r.data.html_url, number: r.data.number };
      return r;
    },
  },

  // ---------- document / data skills ----------
  {
    name: 'write_report', group: 'skill', danger: false,
    desc: 'Write a structured markdown report file from bullet content. args: {file, title, sections: [{heading, body}]}',
    args: { file: 'string', title: 'string', sections: 'array' },
    run: async function (a, ctx) {
      const file = String(a.file || 'report.md').replace(/[^a-zA-Z0-9._-]/g, '_');
      const parts = ['# ' + String(a.title || 'Report'), '', '_Generated by KEYCODE Agent — ' + new Date().toISOString() + '_', ''];
      for (const s of (Array.isArray(a.sections) ? a.sections : []).slice(0, 30)) {
        parts.push('## ' + String(s.heading || 'Section').slice(0, 120), '', String(s.body || '').slice(0, 20000), '');
      }
      const content = parts.join('\n');
      fs.writeFileSync(safeWorkdir(ctx.workdir, file), content);
      return { ok: true, file: file, bytes: Buffer.byteLength(content) };
    },
  },
  {
    name: 'data_extract', group: 'skill', danger: false,
    desc: 'Extract structured data: fetch a URL, apply a JS mapping function to the response text, save JSON in the workspace. args: {url, map (js fn body: `return items.map(x=>...)` with `text` variable), file?}',
    args: { url: 'string', map: 'string', file: 'string?' },
    run: async function (a, ctx) {
      const fetched = await TOOLS.find(function (t) { return t.name === 'http_get'; }).run({ url: a.url }, ctx);
      if (!fetched.ok) return { ok: false, error: 'fetch failed: ' + (fetched.error || fetched.status) };
      const vm = require('vm');
      let mapped;
      try {
        mapped = vm.runInNewContext('(function(text){' + String(a.map || 'return text.slice(0,2000)') + '})', { JSON: JSON })(fetched.body);
      } catch (e) { return { ok: false, error: 'map failed: ' + String(e && e.message || e) }; }
      const file = String(a.file || 'data.json').replace(/[^a-zA-Z0-9._-]/g, '_');
      const out = JSON.stringify(mapped, null, 2);
      fs.writeFileSync(safeWorkdir(ctx.workdir, file), out);
      return { ok: true, file: file, bytes: Buffer.byteLength(out), preview: out.slice(0, 1000) };
    },
  },
];

const REGISTRY = {};
for (const t of TOOLS) REGISTRY[t.name] = t;

module.exports = {
  tools: TOOLS,
  registry: REGISTRY,
  get: function (name) { return REGISTRY[name]; },
  safeWorkdir: safeWorkdir,
  manifest: function () {
    return TOOLS.map(function (t) { return { name: t.name, group: t.group, desc: t.desc, danger: t.danger, args: t.args }; });
  },
};
