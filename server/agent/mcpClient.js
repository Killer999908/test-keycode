// ============================================================
// KEYCODE Agent Runtime — MCP Client + Connector Registry
// ============================================================
// Model Context Protocol (stdio JSON-RPC 2.0) client that hosts
// tool servers as child processes and exposes their tools through
// one interface. Ships with a registry of connector definitions
// and NATIVE in-process fallbacks so the agent keeps working when
// a given MCP server is not installed/configured.
//
// Connector categories covered:
//   dev tooling + git : github, git-local, filesystem
//   live info / web   : brave-search, fetch, browser (puppeteer/playwright)
//   databases         : postgres, redis
//   enterprise comms  : slack, jira, confluence

import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execInSandbox, createWorkspace, RingBuffer } from './sandbox.js';

// ─────────────────────────────────────────────
// MCP stdio transport
// ─────────────────────────────────────────────
class McpServerProcess {
  constructor({ name, command, args = [], env = {} }) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.env = env;
    this.child = null;
    this.pending = new Map();
    this.buffer = '';
    this.tools = [];
    this.status = 'stopped';
    this.lastError = null;
  }

  async start(timeoutMs = 20000) {
    if (this.child) return;
    this.status = 'starting';
    try {
      this.child = spawn(this.command, this.args, {
        env: { ...process.env, ...this.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      this.status = 'error';
      this.lastError = e.message;
      throw e;
    }
    this.child.stdout.on('data', (d) => this._onData(d));
    this.child.stderr.on('data', () => { /* MCP servers log to stderr; ignore */ });
    this.child.on('exit', (code) => {
      this.status = 'stopped';
      this.child = null;
      for (const [, p] of this.pending) p.reject(new Error(`${this.name} exited (${code})`));
      this.pending.clear();
    });

    const init = await this._request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'keycode-forge', version: '1.0.0' },
    }, timeoutMs);
    this._notify('notifications/initialized', {});
    this.status = 'running';
    try {
      const tl = await this._request('tools/list', {}, 15000);
      this.tools = (tl?.tools || []).map((t) => ({ name: t.name, description: t.description || '', inputSchema: t.inputSchema || {} }));
    } catch { this.tools = []; }
    return init;
  }

  _onData(chunk) {
    this.buffer += chunk.toString('utf8');
    let idx;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message || 'MCP error'));
          else p.resolve(msg.result);
        }
      } catch { /* not JSON — skip */ }
    }
  }

  _request(method, params, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      if (!this.child) return reject(new Error(this.name + ' not running'));
      const id = crypto.randomBytes(4).toString('hex');
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.name} ${method} timeout`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      try { this.child.stdin.write(payload); } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }

  _notify(method, params) {
    try { this.child?.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); } catch {}
  }

  async callTool(toolName, args, timeoutMs = 60000) {
    const r = await this._request('tools/call', { name: toolName, arguments: args }, timeoutMs);
    const content = (r?.content || []).map((c) => (c.type === 'text' ? c.text : JSON.stringify(c))).join('\n');
    return { ok: !r?.isError, result: content };
  }

  stop() {
    try { this.child?.kill('SIGTERM'); } catch {}
    this.child = null;
    this.status = 'stopped';
  }
}

// ─────────────────────────────────────────────
// Registry: server definitions + native fallbacks
// ─────────────────────────────────────────────
const env = (k, d = '') => (process.env[k] ?? d);

/** Native helpers used when MCP servers are absent. */
const native = {
  async fsTool(tool, args) {
    const ROOT = path.resolve(env('AGENT_FS_ROOT', process.cwd()));
    const safe = (p) => {
      const abs = path.resolve(ROOT, p);
      if (!abs.startsWith(ROOT)) throw new Error('path escapes sandbox root');
      return abs;
    };
    switch (tool) {
      case 'list_directory': {
        const dir = safe(args.path || '.');
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        return entries.map((e) => (e.isDirectory() ? '[dir] ' : '[file] ') + e.name).join('\n');
      }
      case 'read_file': {
        const stat = fs.statSync(safe(args.path));
        if (stat.size > 512 * 1024) throw new Error('file too large for inline read');
        return fs.readFileSync(safe(args.path), 'utf8');
      }
      case 'write_file': {
        const target = safe(args.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, args.content ?? '', 'utf8');
        return 'wrote ' + (args.content ?? '').length + ' bytes to ' + args.path;
      }
      case 'search_files': {
        // ripgrep if present, else naive recursive grep
        const ws = createWorkspace('rg');
        try {
          const r = await execInSandbox({
            cmd: 'rg', args: ['-n', '--max-count', '40', args.pattern || '', ROOT], ws, timeoutMs: 15000,
          });
          return r.stdout || '(no matches)';
        } finally { try { fs.rmSync(ws.dir, { recursive: true, force: true }); } catch {} }
      }
      default: throw new Error('unknown fs tool ' + tool);
    }
  },

  async gitTool(tool, args) {
    const cwd = env('AGENT_GIT_ROOT', process.cwd());
    const ws = createWorkspace('git');
    try {
      const run = (gitArgs) => execInSandbox({ cmd: 'git', args: gitArgs, ws: { ...ws, dir: cwd }, timeoutMs: 20000 });
      switch (tool) {
        case 'status': { const r = await run(['status', '--short', '--branch']); return r.stdout || '(clean)'; }
        case 'log': { const r = await run(['log', '--oneline', '-' + (args.limit || 10)]); return r.stdout; }
        case 'diff': { const r = await run(['diff', '--stat']); return r.stdout || '(no unstaged changes)'; }
        case 'branch': { const r = await run(['branch', '-a']); return r.stdout; }
        case 'add': { const r = await run(['add', ...(args.paths || ['.'])]); return r.stdout || 'staged'; }
        default: throw new Error('unknown git tool ' + tool);
      }
    } finally { try { fs.rmSync(ws.dir, { recursive: true, force: true }); } catch {} }
  },

  async githubTool(tool, args) {
    const token = env('GITHUB_TOKEN') || env('GH_TOKEN');
    if (!token) throw new Error('GITHUB_TOKEN not set');
    const api = async (path_, body, method = 'GET') => {
      const r = await fetch('https://api.github.com' + path_, {
        method,
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'keycode-forge' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) throw new Error('GitHub ' + r.status + ': ' + (await r.text()).slice(0, 160));
      return r.json();
    };
    switch (tool) {
      case 'get_repo': return JSON.stringify(await api(`/repos/${args.owner}/${args.repo}`), null, 1).slice(0, 1200);
      case 'list_issues': return JSON.stringify(await api(`/repos/${args.owner}/${args.repo}/issues?per_page=${args.limit || 10}`)).slice(0, 3000);
      case 'create_issue': return JSON.stringify(await api(`/repos/${args.owner}/${args.repo}/issues`, { title: args.title, body: args.body }, 'POST')).slice(0, 600);
      case 'search_code': return JSON.stringify(await api(`/search/code?q=${encodeURIComponent(args.query)}`)).slice(0, 2500);
      default: throw new Error('unknown github tool ' + tool);
    }
  },

  async braveTool(tool, args) {
    const key = env('BRAVE_API_KEY');
    if (!key) throw new Error('BRAVE_API_KEY not set');
    const q = encodeURIComponent(args.query || '');
    const r = await fetch('https://api.search.brave.com/res/v1/web/search?q=' + q + '&count=' + (args.count || 5), {
      headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
    });
    if (!r.ok) throw new Error('Brave ' + r.status);
    const j = await r.json();
    return (j.web?.results || []).map((x) => `• ${x.title}\n  ${x.url}\n  ${x.description || ''}`).join('\n').slice(0, 3000);
  },

  async fetchTool(tool, args) {
    const url = args.url;
    if (!url || !/^https?:\/\//.test(url)) throw new Error('valid http(s) url required');
    const r = await fetch(url, {
      headers: { 'User-Agent': 'keycode-forge-agent/1.0', Accept: 'text/html,application/json,text/plain' },
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    });
    const type = r.headers.get('content-type') || '';
    const text = await r.text();
    if (type.includes('json')) return ('HTTP ' + r.status + ' (json)\n' + text).slice(0, 6000);
    // crude HTML → text
    const plain = text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return ('HTTP ' + r.status + ' (' + (type.split(';')[0] || 'text') + ')\n' + plain).slice(0, 6000);
  },

  async browserTool(tool, args) {
    // Delegate to the project's Playwright/Puppeteer if installed; otherwise honest failure.
    const ws = createWorkspace('browser');
    try {
      const script = `
        const candidate = require.resolve('playwright', { paths: ['${process.cwd()}', '${path.join(process.cwd(), 'node_modules')}'] });
      `;
      // Simplest robust route: dynamic import from this process (playwright/puppeteer are devDeps if present)
      let pw = null;
      try { pw = await import('playwright'); } catch {}
      let puppeteer = null;
      if (!pw) { try { puppeteer = await import('puppeteer'); } catch {} }
      if (!pw && !puppeteer) throw new Error('neither playwright nor puppeteer installed — npm i -D playwright && npx playwright install chromium');
      if (pw) {
        const browser = await pw.chromium.launch({ headless: true });
        try {
          const page = await browser.newPage();
          await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          if (tool === 'browser_screenshot') {
            const shot = args.path || path.join(ws.dir, 'shot.png');
            await page.screenshot({ path: shot, fullPage: !!args.fullPage });
            return 'screenshot saved: ' + shot;
          }
          const text = await page.evaluate(/* istanbul ignore next */ () => (globalThis.document ? globalThis.document.body.innerText.slice(0, 6000) : ''));
          return 'URL: ' + args.url + '\nTITLE: ' + (await page.title()) + '\n\n' + text;
        } finally { await browser.close().catch(() => {}); }
      }
      const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage();
        await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (tool === 'browser_screenshot') {
          const shot = args.path || path.join(ws.dir, 'shot.png');
          await page.screenshot({ path: shot, fullPage: !!args.fullPage });
          return 'screenshot saved: ' + shot;
        }
        return 'URL: ' + args.url + '\nTITLE: ' + (await page.title()) + '\n\n' + (await page.evaluate(/* istanbul ignore next */ () => (globalThis.document ? globalThis.document.body.innerText.slice(0, 6000) : '')));
      } finally { await browser.close().catch(() => {}); }
    } finally { setTimeout(() => destroyQuiet(ws), 5000); }
  },

  async postgresTool(tool, args) {
    const url = env('POSTGRES_URL') || env('DATABASE_URL');
    if (!url) throw new Error('POSTGRES_URL not set');
    const pg = await import('pg').catch(() => null);
    if (!pg) throw new Error('pg package not installed');
    const client = new pg.default.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
    await client.connect();
    try {
      if (tool === 'postgres_query') {
        if (!/^\s*(select|with|explain|show)/i.test(args.sql || '')) throw new Error('only read-only SELECT/WITH/EXPLAIN allowed');
        const res = await client.query(args.sql, args.params || []);
        return JSON.stringify({ rowCount: res.rowCount, rows: res.rows.slice(0, 50) }, null, 1).slice(0, 5000);
      }
      if (tool === 'postgres_schema') {
        const res = await client.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position LIMIT 200`);
        return JSON.stringify(res.rows, null, 1).slice(0, 5000);
      }
      throw new Error('unknown postgres tool ' + tool);
    } finally { await client.end().catch(() => {}); }
  },

  async redisTool(tool, args) {
    const url = env('REDIS_URL');
    if (!url) throw new Error('REDIS_URL not set');
    const redis = await import('redis').catch(() => null);
    if (!redis) throw new Error('redis package not installed');
    const client = redis.createClient({ url, socketTimeout: 8000 });
    await client.connect();
    try {
      if (tool === 'redis_get') return JSON.stringify(await client.get(args.key));
      if (tool === 'redis_set') { await client.set(args.key, String(args.value)); return 'set ' + args.key; }
      if (tool === 'redis_keys') { const keys = await client.keys((args.pattern || '*').slice(0, 200)); return JSON.stringify(keys.slice(0, 100)); }
      if (tool === 'redis_ttl') return JSON.stringify(await client.ttl(args.key));
      throw new Error('unknown redis tool ' + tool);
    } finally { await client.disconnect().catch(() => {}); }
  },

  async slackTool(tool, args) {
    const token = env('SLACK_BOT_TOKEN');
    if (!token) throw new Error('SLACK_BOT_TOKEN not set');
    const call = async (method, body) => {
      const r = await fetch('https://slack.com/api/' + method, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return r.json();
    };
    if (tool === 'slack_post_message') {
      const j = await call('chat.postMessage', { channel: args.channel, text: args.text });
      return j.ok ? 'posted to ' + args.channel : 'slack error: ' + j.error;
    }
    if (tool === 'slack_list_channels') {
      const j = await call('conversations.list', { limit: args.limit || 30 });
      return j.ok ? j.channels.map((c) => c.id + ' ' + c.name).join('\n') : 'slack error: ' + j.error;
    }
    throw new Error('unknown slack tool ' + tool);
  },

  async jiraTool(tool, args) {
    const host = env('ATLASSIAN_HOST'); const email = env('ATLASSIAN_EMAIL'); const token = env('ATLASSIAN_API_TOKEN');
    if (!host || !email || !token) throw new Error('ATLASSIAN_HOST / EMAIL / API_TOKEN not set');
    const auth = Buffer.from(email + ':' + token).toString('base64');
    const call = async (p, method = 'GET', body) => {
      const r = await fetch(host.replace(/\/$/, '') + p, { method, headers: { Authorization: 'Basic ' + auth, Accept: 'application/json', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) throw new Error('Jira ' + r.status + ': ' + (await r.text()).slice(0, 160));
      return r.json();
    };
    if (tool === 'jira_search') return JSON.stringify(await call(`/rest/api/3/search?jql=${encodeURIComponent(args.jql)}&maxResults=${args.limit || 10}`)).slice(0, 3000);
    if (tool === 'jira_get_issue') return JSON.stringify(await call(`/rest/api/3/issue/${args.key}`)).slice(0, 3000);
    if (tool === 'jira_create_issue') return JSON.stringify(await call('/rest/api/3/issue', 'POST', { fields: { project: { key: args.project }, summary: args.summary, issuetype: { name: args.type || 'Task' }, description: args.description ? { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: args.description }] }] } : undefined } })).slice(0, 600);
    throw new Error('unknown jira tool ' + tool);
  },

  async confluenceTool(tool, args) {
    const host = env('ATLASSIAN_HOST'); const email = env('ATLASSIAN_EMAIL'); const token = env('ATLASSIAN_API_TOKEN');
    if (!host || !email || !token) throw new Error('ATLASSIAN_HOST / EMAIL / API_TOKEN not set');
    const auth = Buffer.from(email + ':' + token).toString('base64');
    const call = async (p) => {
      const r = await fetch(host.replace(/\/$/, '') + p, { headers: { Authorization: 'Basic ' + auth, Accept: 'application/json' } });
      if (!r.ok) throw new Error('Confluence ' + r.status + ': ' + (await r.text()).slice(0, 160));
      return r.json();
    };
    if (tool === 'confluence_search') {
      const j = await call(`/wiki/rest/api/content/search?cql=${encodeURIComponent(args.cql)}&limit=${args.limit || 10}`);
      return JSON.stringify((j.results || []).map((x) => ({ id: x.id, title: x.title, type: x.type })), null, 1);
    }
    if (tool === 'confluence_get_page') {
      const j = await call(`/wiki/rest/api/content/${args.id}?expand=body.storage`);
      return (j.title || '') + '\n\n' + String(j.body?.storage?.value || '').replace(/<[^>]+>/g, ' ').slice(0, 4000);
    }
    throw new Error('unknown confluence tool ' + tool);
  },
};

function destroyQuiet(ws) { try { fs.rmSync(ws.dir, { recursive: true, force: true }); } catch {} }

/**
 * Connector registry. `mcp` describes how to launch the official MCP
 * server (npx-based, per Model Context Protocol conventions). When
 * `configured()` is false, tools fall back to the native implementations.
 */
export const CONNECTORS = {
  github: {
    label: 'GitHub MCP', category: 'dev-tooling',
    mcp: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: () => ({ GITHUB_TOKEN: env('GITHUB_TOKEN') || env('GH_TOKEN') }) },
    configured: () => !!(env('GITHUB_TOKEN') || env('GH_TOKEN')),
    tools: [
      { name: 'get_repo', description: 'Get repository metadata', args: { owner: 'string', repo: 'string' } },
      { name: 'list_issues', description: 'List repository issues', args: { owner: 'string', repo: 'string', limit: 'number?' } },
      { name: 'create_issue', description: 'Create an issue', args: { owner: 'string', repo: 'string', title: 'string', body: 'string?' } },
      { name: 'search_code', description: 'Search code across GitHub', args: { query: 'string' } },
    ],
    native: native.githubTool,
  },
  'git-local': {
    label: 'Git (local)', category: 'dev-tooling',
    mcp: null, // always native — the repo is right here
    configured: () => true,
    tools: [
      { name: 'status', description: 'Git status (short)', args: {} },
      { name: 'log', description: 'Recent commits', args: { limit: 'number?' } },
      { name: 'diff', description: 'Unstaged diff stat', args: {} },
      { name: 'branch', description: 'List branches', args: {} },
      { name: 'add', description: 'Stage paths', args: { paths: 'string[]?' } },
    ],
    native: native.gitTool,
  },
  filesystem: {
    label: 'Filesystem MCP', category: 'dev-tooling',
    mcp: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', env('AGENT_FS_ROOT', process.cwd())], env: () => ({}) },
    configured: () => true, // native fallback always available
    tools: [
      { name: 'list_directory', description: 'List a directory', args: { path: 'string' } },
      { name: 'read_file', description: 'Read a file (≤512KB)', args: { path: 'string' } },
      { name: 'write_file', description: 'Write a file inside the sandbox root', args: { path: 'string', content: 'string' } },
      { name: 'search_files', description: 'Ripgrep-style content search', args: { pattern: 'string' } },
    ],
    native: native.fsTool,
  },
  brave: {
    label: 'Brave Search MCP', category: 'live-info',
    mcp: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], env: () => ({ BRAVE_API_KEY: env('BRAVE_API_KEY') }) },
    configured: () => !!env('BRAVE_API_KEY'),
    tools: [{ name: 'web_search', description: 'Live web search', args: { query: 'string', count: 'number?' } }],
    native: native.braveTool,
  },
  fetch: {
    label: 'Fetch MCP', category: 'live-info',
    mcp: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'], env: () => ({}) },
    configured: () => true,
    tools: [{ name: 'fetch_url', description: 'Fetch a URL → readable text', args: { url: 'string' } }],
    native: (t, a) => native.fetchTool(t, a),
  },
  browser: {
    label: 'Browser MCP (Playwright/Puppeteer)', category: 'live-info',
    mcp: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'], env: () => ({}) },
    configured: () => true, // honest error if neither lib is installed
    tools: [
      { name: 'browser_navigate', description: 'Open a page and extract readable text', args: { url: 'string' } },
      { name: 'browser_screenshot', description: 'Screenshot a page', args: { url: 'string', path: 'string?', fullPage: 'boolean?' } },
    ],
    native: native.browserTool,
  },
  postgres: {
    label: 'PostgreSQL MCP', category: 'databases',
    mcp: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', env('POSTGRES_URL', '')], env: () => ({}), enabled: () => !!env('POSTGRES_URL') },
    configured: () => !!(env('POSTGRES_URL') || env('DATABASE_URL')),
    tools: [
      { name: 'postgres_query', description: 'Read-only SQL query', args: { sql: 'string', params: 'array?' } },
      { name: 'postgres_schema', description: 'List tables/columns', args: {} },
    ],
    native: native.postgresTool,
  },
  redis: {
    label: 'Redis MCP', category: 'databases',
    mcp: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-redis', env('REDIS_URL', '')], env: () => ({}), enabled: () => !!env('REDIS_URL') },
    configured: () => !!env('REDIS_URL'),
    tools: [
      { name: 'redis_get', description: 'GET a key', args: { key: 'string' } },
      { name: 'redis_set', description: 'SET a key', args: { key: 'string', value: 'string' } },
      { name: 'redis_keys', description: 'List keys by pattern', args: { pattern: 'string?' } },
      { name: 'redis_ttl', description: 'TTL of a key', args: { key: 'string' } },
    ],
    native: native.redisTool,
  },
  slack: {
    label: 'Slack MCP', category: 'enterprise',
    mcp: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'], env: () => ({ SLACK_BOT_TOKEN: env('SLACK_BOT_TOKEN'), SLACK_TEAM_ID: env('SLACK_TEAM_ID') }) },
    configured: () => !!env('SLACK_BOT_TOKEN'),
    tools: [
      { name: 'slack_post_message', description: 'Post a message to a channel', args: { channel: 'string', text: 'string' } },
      { name: 'slack_list_channels', description: 'List channels', args: { limit: 'number?' } },
    ],
    native: native.slackTool,
  },
  jira: {
    label: 'Atlassian Jira MCP', category: 'enterprise',
    mcp: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-atlassian'], env: () => ({ ATLASSIAN_HOST: env('ATLASSIAN_HOST'), ATLASSIAN_EMAIL: env('ATLASSIAN_EMAIL'), ATLASSIAN_API_TOKEN: env('ATLASSIAN_API_TOKEN') }) },
    configured: () => !!(env('ATLASSIAN_HOST') && env('ATLASSIAN_EMAIL') && env('ATLASSIAN_API_TOKEN')),
    tools: [
      { name: 'jira_search', description: 'JQL search', args: { jql: 'string', limit: 'number?' } },
      { name: 'jira_get_issue', description: 'Get issue by key', args: { key: 'string' } },
      { name: 'jira_create_issue', description: 'Create an issue', args: { project: 'string', summary: 'string', type: 'string?', description: 'string?' } },
    ],
    native: native.jiraTool,
  },
  confluence: {
    label: 'Atlassian Confluence MCP', category: 'enterprise',
    mcp: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-atlassian'], env: () => ({ ATLASSIAN_HOST: env('ATLASSIAN_HOST'), ATLASSIAN_EMAIL: env('ATLASSIAN_EMAIL'), ATLASSIAN_API_TOKEN: env('ATLASSIAN_API_TOKEN') }) },
    configured: () => !!(env('ATLASSIAN_HOST') && env('ATLASSIAN_EMAIL') && env('ATLASSIAN_API_TOKEN')),
    tools: [
      { name: 'confluence_search', description: 'CQL search', args: { cql: 'string', limit: 'number?' } },
      { name: 'confluence_get_page', description: 'Read a page by id', args: { id: 'string' } },
    ],
    native: native.confluenceTool,
  },
};

// ─────────────────────────────────────────────
// Connector manager: own MCP subprocesses, fall back to native
// ─────────────────────────────────────────────
export class ConnectorManager {
  constructor() {
    this.servers = new Map(); // id → McpServerProcess
    this.callCounts = new Map();
  }

  listConnectors() {
    return Object.entries(CONNECTORS).map(([id, c]) => ({
      id, label: c.label, category: c.category,
      configured: c.configured(),
      transport: c.mcp ? 'mcp-or-native' : 'native',
      tools: c.tools.map((t) => t.name),
      serverStatus: this.servers.get(id)?.status || (c.mcp ? 'stopped' : 'native'),
    }));
  }

  /** Resolve a tool like "github.create_issue" → { connector, tool }. */
  resolveTool(fullName) {
    const [connId, ...rest] = String(fullName || '').split('.');
    const toolName = rest.join('.');
    const conn = CONNECTORS[connId];
    if (!conn) return null;
    const tool = conn.tools.find((t) => t.name === toolName);
    if (!tool) return null;
    return { connector: conn, connectorId: connId, tool };
  }

  async call(fullName, args = {}, { preferMcp = true, timeoutMs = 60000 } = {}) {
    const resolved = this.resolveTool(fullName);
    if (!resolved) throw new Error('unknown tool: ' + fullName + ' — see /api/agent/tools');
    const { connector, connectorId, tool } = resolved;
    this.callCounts.set(fullName, (this.callCounts.get(fullName) || 0) + 1);

    const useMcp = preferMcp && connector.mcp && connector.configured();
    if (useMcp) {
      try {
        let srv = this.servers.get(connectorId);
        if (!srv) {
          srv = new McpServerProcess({ name: connectorId, command: connector.mcp.command, args: connector.mcp.args, env: connector.mcp.env() });
          this.servers.set(connectorId, srv);
        }
        if (srv.status !== 'running') await srv.start();
        const r = await srv.callTool(tool.name, args, timeoutMs);
        if (r.ok) return { ok: true, transport: 'mcp', connector: connectorId, tool: tool.name, result: r.result };
        throw new Error(r.result || 'mcp tool error');
      } catch (e) {
        // fall through to native — never let transport death kill the agent
        if (!connector.native) throw e;
      }
    }
    if (!connector.native) throw new Error(`connector ${connectorId} has no native fallback and MCP is unavailable`);
    const result = await connector.native(tool.name, args);
    return { ok: true, transport: 'native', connector: connectorId, tool: tool.name, result: String(result) };
  }

  mcpStatus() {
    return Object.entries(CONNECTORS).map(([id, c]) => ({
      id, label: c.label, category: c.category,
      configured: c.configured(),
      mcpAvailable: !!c.mcp,
      status: this.servers.get(id)?.status || (c.mcp ? 'stopped' : 'native-only'),
      tools: c.tools.length,
      calls: this.callCounts.get(id) ? Array.from(this.callCounts.entries()).filter(([k]) => k.startsWith(id + '.')).map(([k, v]) => ({ tool: k, calls: v })) : [],
    }));
  }

  async shutdown() {
    for (const s of this.servers.values()) s.stop();
    this.servers.clear();
  }
}

export const connectorManager = new ConnectorManager();
