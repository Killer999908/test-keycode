#!/usr/bin/env node
'use strict';
// ============================================================================
//  KEYCODE Agent CLI — build websites & games straight from your terminal
//  Install:  curl -fsSL http://localhost:3000/install.sh | bash
//  Usage:    keycode agent "a portfolio site for a photographer"
//            keycode login <your kc_sk_... API key>
//            keycode list
// ============================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = process.env.KEYCODE_URL || 'http://localhost:3000';
const CONFIG = path.join(os.homedir(), '.keycode', 'config.json');

function request(method, p, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(BASE + p, {
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
    if (data) req.write(data);
    req.end();
  });
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
}
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch (_) { return {}; }
}

function die(msg) { console.error('✗ ' + msg); process.exit(1); }

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const cfg = loadConfig();

  if (cmd === 'login') {
    const key = rest[0];
    if (!key || !key.startsWith('kc_sk_')) die('usage: keycode login <kc_sk_...>   (create one at /api-keys.html)');
    const r = await request('GET', '/api/user/dashboard', null, { authorization: 'Bearer ' + key });
    if (r.status !== 200) die('invalid API key');
    saveConfig({ key, baseUrl: BASE });
    console.log('✓ Logged in as ' + (r.json?.stats?.email || 'user') + ' — key saved to ' + CONFIG);
    return;
  }

  if (cmd === 'list') {
    if (!cfg.key) die('not logged in — run: keycode login <kc_sk_...>');
    const r = await request('GET', '/api/user/ai-projects', null, { authorization: 'Bearer ' + cfg.key });
    if (r.status !== 200) die('failed to list projects');
    const projects = r.json?.projects || [];
    if (!projects.length) return console.log('No saved projects yet.');
    projects.forEach(p => console.log(`  ${p.fileId}  ${p.projectType || 'website'}  ${(p.title || '').slice(0, 60)}`));
    return;
  }

  if (cmd === 'agent' || cmd === 'build' || !cmd) {
    const prompt = rest.join(' ') || 'a modern landing page for a tech startup';
    if (!cfg.key) {
      console.log('ℹ No API key configured — using guest mode. Set one with: keycode login <kc_sk_...>');
    }
    const headers = cfg.key ? { authorization: 'Bearer ' + cfg.key } : {};
    console.log('⠿ Planning…');
    const plan = await request('POST', '/api/ai/plan', { prompt });
    if (plan.json?.plan) {
      const p = plan.json.plan;
      console.log(`  plan: ${p.type}${p.name ? ' "' + p.name + '"' : ''} · palette: ${p.palette || 'dark'}`);
    }
    console.log('⠿ Building (streaming)…');

    const stream = await new Promise((resolve, reject) => {
      const data = JSON.stringify({ description: prompt });
      const req = http.request(BASE + '/api/ai/stream-website', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...headers },
      }, resolve);
      req.on('error', reject);
      req.write(data); req.end();
    });

    let html = '';
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
              if (ev.type === 'complete') html = (ev.data && ev.data.html) || '';
            } catch (_) {}
          }
        }
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    if (!html) die('generation failed');
    console.log('\n✓ Built ' + Math.round(html.length / 1024) + 'KB');

    const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'keycode-build';
    const file = slug + '.html';
    fs.writeFileSync(file, html);
    console.log('✓ Saved to ' + path.resolve(file));

    if (cfg.key) {
      const save = await request('POST', '/api/ai/generate-and-order', {
        description: prompt, taskType: 'website', projectData: { code: html },
      }, { authorization: 'Bearer ' + cfg.key });
      const fileId = save.json?.fileId;
      if (fileId) {
        console.log('✓ Saved to your library: ' + BASE + '/preview/' + fileId + '/');
        console.log('  Open locally:  xdg-open ' + file + '   (or open ' + file + ' on macOS)');
      }
    } else {
      console.log('  Login with an API key to also save it to your cloud library.');
    }
    return;
  }

  console.log(`KEYCODE Agent CLI

  Usage:
    keycode agent "a portfolio site for a photographer"   build + save
    keycode login <kc_sk_...>                             authenticate (from /api-keys.html)
    keycode list                                          list your saved builds

  Environment:
    KEYCODE_URL   server base URL (default ${BASE})`);
}

main().catch(e => die(e.message));
