'use strict';
// ============================================================
//  AGENT TOOL LIBRARY — lib/agent-tools.js
//  Sandboxed, auditable tools the KEYCODE agent can call.
//  Every tool: { name, group, desc, danger, args, run(args, ctx) }
//  ctx = { log(line), workdir, requestId }
//  Filesystem tools are confined to a per-run workspace. The shell tool is
//  available only to trusted local CLI runs, not hosted agent API requests.
//  Network tools use fetch with size/time limits.
// ============================================================
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_OUT = 200000;   // bytes captured per command
const MAX_FILE_READ = 512 * 1024;

function REGISTRY_BY_NAME(name) { return TOOLS.find(function (t) { return t.name === name; }); }

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

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
    desc: 'Run an allowed program in a trusted local CLI session. This is not an OS sandbox; hosted agent API runs cannot access this tool. args: {cmd, args[], cwd?}',
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
        const name = escapeHtml(String(a.name || 'My Site'));
        const prompt = escapeHtml(String(a.prompt || '').slice(0, 2000));
        html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + name + '</title>' +
          '<style>body{font-family:system-ui,sans-serif;margin:0;background:#0a0a0f;color:#e2e8f0;line-height:1.6}main{max-width:960px;margin:0 auto;padding:64px 24px}h1{font-size:42px}</style></head>' +
          '<body><main><h1>' + name + '</h1><p>' + prompt + '</p><section id="features"></section><section id="pricing"></section><section id="faq"></section><section id="contact"><form onsubmit="event.preventDefault();this.reset();alert(\'sent\')"><input required placeholder="Email"><textarea required placeholder="Message"></textarea><button>Send</button></form></section></main></body></html>';
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
  // ---------- GitHub repo mining (free, keyless) ----------
  {
    name: 'github_search_repos', group: 'github', danger: false,
    desc: 'Search GitHub repositories (no auth needed, 10 req/min). args: {query, sort? (stars|forks|updated), limit?}. Returns {name, stars, language, url, desc}.',
    args: { query: 'string', sort: 'string?', limit: 'number?' },
    run: async function (a) {
      const q = String(a.query || '').slice(0, 200);
      if (!q.trim()) return { ok: false, error: 'query required' };
      const params = new URLSearchParams({ q: q, per_page: String(Math.min(Number(a.limit) || 8, 30)) });
      if (a.sort) params.set('sort', String(a.sort));
      try {
        const r = await fetch('https://api.github.com/search/repositories?' + params, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KEYCODE-Agent' } });
        if (!r.ok) return { ok: false, error: 'GitHub HTTP ' + r.status };
        const j = await r.json();
        return { ok: true, total: j.total_count, repos: (j.items || []).map(function (x) { return { name: x.full_name, stars: x.stargazers_count, language: x.language, url: x.html_url, desc: (x.description || '').slice(0, 200) }; }) };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    },
  },
  {
    name: 'github_read_file', group: 'github', danger: false,
    desc: 'Read a raw file from any public GitHub repo (keyless). args: {repo (owner/name), path, ref?}. Returns text content up to 512KB.',
    args: { repo: 'string', path: 'string', ref: 'string?' },
    run: async function (a) {
      const repo = String(a.repo || '').replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { ok: false, error: 'repo must be owner/name' };
      const ref = encodeURIComponent(String(a.ref || 'HEAD'));
      const url = 'https://raw.githubusercontent.com/' + repo + '/' + ref + '/' + String(a.path || '').replace(/^\//, '');
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'KEYCODE-Agent' } });
        if (!r.ok) return { ok: false, error: 'HTTP ' + r.status + ' for ' + url };
        const body = await r.text();
        return { ok: true, url: url, content: body.slice(0, MAX_FILE_READ) };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    },
  },
  {
    name: 'github_trending', group: 'github', danger: false,
    desc: 'List today/this-week trending GitHub repos by language (scraped, keyless). args: {language?, since? (daily|weekly|monthly)}. Useful to discover new free tools/servers.',
    args: { language: 'string?', since: 'string?' },
    run: async function (a) {
      const lang = String(a.language || '').trim();
      const since = ['daily', 'weekly', 'monthly'].includes(a.since) ? a.since : 'daily';
      const url = 'https://github.com/trending' + (lang ? '/' + encodeURIComponent(lang) : '') + '?since=' + since;
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 KEYCODE-Agent' } });
        const html = await r.text();
        const out = [];
        const re = /<h2[^>]*>\s*<a[^>]+href="\/([\w.-]+\/[\w.-]+)"[\s\S]*?<\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
        let m;
        while ((m = re.exec(html)) && out.length < 12) {
          out.push({ repo: m[1], desc: m[2].replace(/<[^>]+>/g, '').trim().slice(0, 160) });
        }
        return { ok: true, url: url, repos: out };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    },
  },

  // ---------- free public APIs (keyless, from public APIs catalogs) ----------
  {
    name: 'free_api_weather', group: 'apis', danger: false,
    desc: 'Current weather for a city via the free open-meteo.com geocoding+forecast APIs (no key). args: {city}',
    args: { city: 'string' },
    run: async function (a) {
      try {
        const g = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(String(a.city || '')) + '&count=1');
        const gj = await g.json();
        const loc = gj.results && gj.results[0];
        if (!loc) return { ok: false, error: 'city not found' };
        const w = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + loc.latitude + '&longitude=' + loc.longitude + '&current=temperature_2m,wind_speed_10m,weather_code');
        const wj = await w.json();
        return { ok: true, city: loc.name + ', ' + (loc.country || ''), weather: wj.current };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    },
  },
  {
    name: 'free_api_convert', group: 'apis', danger: false,
    desc: 'Convert currency or units via free keyless APIs. args: {amount, from, to?} — from/to are ISO codes (USD, EUR, BTC, m, km, lb, kg…).',
    args: { amount: 'number', from: 'string', to: 'string?' },
    run: async function (a) {
      const from = String(a.from || '').toLowerCase(), to = String(a.to || 'usd').toLowerCase();
      const UNITS = { m: { km: 0.001, cm: 100, ft: 3.28084, mi: 0.000621371 }, km: { m: 1000, mi: 0.621371, ft: 3280.84 }, kg: { lb: 2.20462, g: 1000 }, lb: { kg: 0.453592 } };
      if (UNITS[from] && UNITS[from][to] != null) return { ok: true, type: 'unit', result: Number(a.amount) * UNITS[from][to] };
      try {
        const r = await fetch('https://api.frankfurter.app/latest?from=' + encodeURIComponent(from.toUpperCase()) + '&to=' + encodeURIComponent(to.toUpperCase()));
        if (!r.ok) return { ok: false, error: 'unsupported codes' };
        const j = await r.json();
        const rate = j.rates && j.rates[to.toUpperCase()];
        if (!rate) return { ok: false, error: 'unsupported currency pair' };
        return { ok: true, type: 'currency', result: Number(a.amount) * rate, rate: rate, date: j.date };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    },
  },
  {
    name: 'free_api_fact', group: 'apis', danger: false,
    desc: 'Random trivia/number fact via free keyless APIs. args: {number?} — omit for random trivia.',
    args: { number: 'number?' },
    run: async function (a) {
      try {
        const n = a.number == null ? 'random/trivia' : (Number(a.number) + '/trivia');
        const r = await fetch('http://numbersapi.com/' + n + '?json');
        if (!r.ok) return { ok: false, error: 'HTTP ' + r.status };
        const j = await r.json();
        return { ok: true, number: j.number, text: j.text };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    },
  },

  // ---------- MCP bridge ----------
  {
    name: 'mcp_list', group: 'mcp', danger: false,
    desc: 'List MCP (Model Context Protocol) servers configured for this agent. Reads data/mcp-servers.json entries and reports connection state.',
    args: {},
    run: async function () {
      const cfgPath = path.join(process.cwd(), 'data', 'mcp-servers.json');
      let servers = [];
      try { servers = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (_) { }
      return { ok: true, count: servers.length, servers: servers.map(function (s) { return { name: s.name, transport: s.transport, command: s.command, url: s.url, note: s.note || '' }; }),
        hint: servers.length ? '' : 'Add MCP servers to data/mcp-servers.json: [{name, transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"]}]' };
    },
  },
  {
    name: 'mcp_call', group: 'mcp', danger: false,
    desc: 'Call a tool on a configured MCP stdio server: spawns the server process, performs a JSON-RPC tools/call handshake. args: {server (name), tool, args?}. Configure servers in data/mcp-servers.json first.',
    args: { server: 'string', tool: 'string', args: 'object?' },
    run: async function (a) {
      const cfgPath = path.join(process.cwd(), 'data', 'mcp-servers.json');
      let servers = [];
      try { servers = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (_) { }
      const srv = servers.find(function (s) { return s.name === a.server; });
      if (!srv) return { ok: false, error: 'unknown MCP server: ' + a.server + ' — run mcp_list' };
      if (srv.transport !== 'stdio' || !srv.command) return { ok: false, error: 'only stdio MCP servers are supported by mcp_call' };
      const { spawn } = require('child_process');
      return await new Promise(function (resolve) {
        let buf = '';
        const child = spawn(srv.command, (srv.args || []).map(String), { cwd: process.cwd(), env: Object.assign({}, process.env, srv.env || {}) });
        const timer = setTimeout(function () { try { child.kill(); } catch (_) { } resolve({ ok: false, error: 'MCP call timed out after 30s' }); }, 30000);
        function send(obj) { child.stdin.write(JSON.stringify(obj) + '\n'); }
        child.stdout.on('data', function (c) {
          buf += c;
          let idx;
          while ((idx = buf.indexOf('\n')) !== -1) {
            const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
            if (!line.trim()) continue;
            let msg; try { msg = JSON.parse(line); } catch (_) { continue; }
            if (msg.id === 1) { send({ jsonrpc: '2.0', method: 'tools/call', params: { name: String(a.tool || ''), arguments: a.args || {} }, id: 2 }); }
            else if (msg.id === 2) {
              clearTimeout(timer);
              try { child.kill(); } catch (_) { }
              const content = msg.result && msg.result.content;
              resolve({ ok: !msg.error, result: msg.error || content, isError: Boolean(msg.result && msg.result.isError) });
            }
          }
        });
        child.on('error', function (e) { clearTimeout(timer); resolve({ ok: false, error: 'spawn failed: ' + e.message }); });
        send({ jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'keycode-agent', version: '1.0.0' } }, id: 1 });
      });
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
