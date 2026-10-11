#!/usr/bin/env node
'use strict';
// ============================================================================
//  KEYCODE Agent CLI — build websites & games straight from your terminal
//  Install:  curl -fsSL https://keycode.studio/install.sh | bash
//  Usage:    keycode agent "a portfolio site for a photographer"
//            keycode login [your kc_sk_... API key]
//            keycode list
// ============================================================================
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG = path.join(os.homedir(), '.keycode', 'config.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch (_) { return {}; }
}

const initialConfig = loadConfig();
const BASE = (process.env.KEYCODE_URL || initialConfig.baseUrl || 'https://keycode.studio').replace(/\/+$/, '');

function request(method, p, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    let url;
    try {
      url = new URL(p, BASE);
    } catch (_) {
      return reject(new Error('Invalid KEYCODE_URL. Set it to the KEYCODE website URL.'));
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return reject(new Error('KEYCODE_URL must use HTTP or HTTPS.'));
    }
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(data ? { 'content-length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    }, res => {
      let buf = '';
      res.on('data', c => (buf += c));
      res.on('end', () => {
        let json = null; try { json = JSON.parse(buf); } catch (_) {}
        resolve({ status: res.statusCode, json, text: buf });
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('Request timed out after 120 seconds.')));
    if (data) req.write(data);
    req.end();
  });
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  if (process.platform !== 'win32') {
    fs.chmodSync(path.dirname(CONFIG), 0o700);
    fs.chmodSync(CONFIG, 0o600);
  }
}

function readSecret(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      return reject(new Error('Run `keycode login` in a terminal, or pass the key as an argument.'));
    }

    let value = '';
    const finish = (error) => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value.trim());
    };
    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') return finish(new Error('Login cancelled.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
    process.stdout.write(prompt);
  });
}

function die(msg) { console.error('✗ ' + msg); process.exit(1); }

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const cfg = loadConfig();

  if (cmd === 'setup') {
    const url = BASE + '/api-keys.html';
    console.log('⠿ Opening ' + url);
    try {
      const { spawn } = require('child_process');
      if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true }).unref();
      else if (process.platform === 'darwin') spawn('open', [url], { detached: true }).unref();
      else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    } catch (_) {}
    console.log('\nThen finish connecting this terminal:\n');
    console.log('  1. Generate an API key on that page (kc_sk_…).');
    console.log('  2. Come back here and run:');
    console.log('       keycode login <kc_sk_...>');
    console.log('  3. Build something:');
    console.log('       keycode agent "a portfolio site"');
    return;
  }

  if (cmd === 'login') {
    const key = rest[0] || await readSecret('Paste API key (input hidden): ').catch((err) => die(err.message));
    if (!key || !key.startsWith('kc_sk_')) die('API key must start with kc_sk_. Create one from your signed-in account at /api-keys.html.');
    const r = await request('GET', '/api/user/dashboard', null, { authorization: 'Bearer ' + key });
    if (r.status !== 200) die('invalid API key');
    saveConfig({ ...loadConfig(), key, baseUrl: BASE });
    console.log('✓ Logged in as ' + (r.json?.stats?.email || 'user') + ' — key saved to ' + CONFIG);
    return;
  }

  if (cmd === 'list') {
    if (!cfg.key) die('not logged in — run: keycode login');
    const r = await request('GET', '/api/user/ai-projects', null, { authorization: 'Bearer ' + cfg.key });
    if (r.status !== 200) die('failed to list projects');
    const projects = r.json?.projects || [];
    if (!projects.length) return console.log('No saved projects yet.');
    projects.forEach(p => console.log(`  ${p.fileId}  ${p.projectType || 'website'}  ${(p.title || '').slice(0, 60)}`));
    return;
  }

  if (cmd === 'agent' || cmd === 'build' || !cmd) {
    const prompt = rest.join(' ') || 'a modern landing page for a tech startup';
    if (!cfg.key) die('Not logged in. Sign in on the website, create an API key, then run: keycode login');
    const headers = { authorization: 'Bearer ' + cfg.key };
    console.log('⠿ Planning…');
    const plan = await request('POST', '/api/ai/plan', { prompt }, headers);
    if (plan.status !== 200) die(plan.json?.error || `Planning failed (HTTP ${plan.status}).`);
    if (plan.json?.plan) {
      const p = plan.json.plan;
      console.log(`  plan: ${p.type}${p.name ? ' "' + p.name + '"' : ''} · palette: ${p.palette || 'dark'}`);
    }
    console.log('⠿ Building (streaming)…');

    const streamUrl = new URL('/api/ai/stream-website', BASE);
    const streamTransport = streamUrl.protocol === 'https:' ? https : http;
    const stream = await new Promise((resolve, reject) => {
      const data = JSON.stringify({ description: prompt });
      const req = streamTransport.request(streamUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...headers },
      }, resolve);
      req.on('error', reject);
      req.setTimeout(120000, () => req.destroy(new Error('Generation request timed out after 120 seconds.')));
      req.write(data); req.end();
    });

    if (stream.statusCode < 200 || stream.statusCode >= 300) {
      let errorBody = '';
      for await (const chunk of stream) errorBody += chunk.toString('utf8');
      let message = errorBody;
      try { message = JSON.parse(errorBody).error || errorBody; } catch (_) {}
      die(`generation request failed (HTTP ${stream.statusCode}): ${message}`);
    }

    let html = '';
    let generationError = '';
    let project = null;
    await new Promise((resolve, reject) => {
      let buf = '';
      stream.on('data', c => {
        buf += c;
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === 'token') process.stdout.write('.');
              if (ev.type === 'complete') {
                html = (ev.data && ev.data.html) || '';
                project = ev.data || null;
              }
              if (ev.type === 'error') generationError = ev.message || 'Website generation failed.';
            } catch (_) {}
          }
        }
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    if (!html) die(generationError || 'Website generation failed.');
    console.log('\n✓ Built ' + Math.round(html.length / 1024) + 'KB');

    const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'keycode-build';
    const file = slug + '.html';
    fs.writeFileSync(file, html);
    console.log('✓ Saved to ' + path.resolve(file));

    if (project && project.fileId) {
      console.log('✓ Saved to your library: ' + BASE + (project.previewUrl || '/api/ai/preview/' + project.fileId));
    }
    return;
  }

  console.log(`KEYCODE Agent CLI

  Usage:
    keycode agent "a portfolio site for a photographer"   build + save
    keycode login [kc_sk_...]                           authenticate; prompts securely if omitted
    keycode list                                          list your saved builds
    keycode setup                                         open the API-keys page and show next steps

  Environment:
    KEYCODE_URL   server base URL (default ${BASE})`);
}

main().catch(e => die(e.message));
