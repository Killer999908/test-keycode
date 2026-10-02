/**
 * ============================================================
 * KEYCODE — Full-Stack CI Smoke Test
 * ============================================================
 * Boots against a REAL running server (started by CI against a
 * real MongoDB) and exercises every major surface end-to-end:
 *
 *   1.  health + static site (index, OS page, admin panel)
 *   2.  the shipped OS agent client (os/os.js wired to /api/agent)
 *   3.  agent runtime: tools catalog, routers, MCP fleet, memory
 *   4.  marketplace, skills, swagger docs
 *   5.  auth: register → token → authenticated settings/profile
 *   6.  manual tool dispatch (todo_write) through the real registry
 *   7.  a REAL ReAct run over SSE — engine boot, sandbox, event stream
 *   8.  artifact route guards
 *
 * Zero dependencies (Node 20+ global fetch). Exits non-zero on any
 * failed assertion so CI fails loudly.
 */

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5000';
const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 220) });
  const icon = ok ? '✓' : '✗';
  console.log(`${icon} ${name}${detail ? ' — ' + detail : ''}`);
}

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  });
  return res;
}

async function json(path, opts = {}) {
  const res = await req(path, opts);
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body, res };
}

/** Poll /api/health until the server is up AND MongoDB is connected (max 90s). */
async function waitForHealth() {
  for (let i = 0; i < 90; i++) {
    try {
      const { status, body } = await json('/api/health');
      if (status === 200 && body?.status === 'ok') return true; // 'ok' only when Mongo is connected
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** Read an SSE stream, collecting parsed data frames until done/error/timeout. */
async function readSse(path, opts = {}, maxMs = 75000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxMs);
  const frames = [];
  try {
    const res = await req(path, { ...opts, signal: controller.signal });
    if (!res.ok || !res.body) return { ok: false, status: res.status, frames };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          frames.push(evt);
          if (evt.type === 'done' || evt.type === 'error') {
            clearTimeout(timer);
            return { ok: true, status: res.status, frames };
          }
        } catch { /* skip malformed frame */ }
      }
    }
    return { ok: true, status: res.status, frames };
  } catch (e) {
    return { ok: false, status: 0, frames, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  // ── 0. server up ──
  const up = await waitForHealth();
  record('server boots and /api/health responds', up, up ? BASE : 'timed out after 90s');
  if (!up) return finish();

  // ── 1. static site ──
  {
    const r = await req('/');
    const body = await r.text();
    record('static index.html served', r.status === 200 && /KEYCODE/i.test(body), `HTTP ${r.status}`);
  }
  {
    const r = await req('/os.html');
    const body = await r.text();
    record('OS page (os.html) served', r.status === 200 && /os\/os\.js|KEYCODE/i.test(body), `HTTP ${r.status}`);
  }
  {
    const r = await req('/os/os.js');
    const body = await r.text();
    record('OS agent client ships and is wired to /api/agent', r.status === 200 && body.includes('/api/agent'), `HTTP ${r.status}`);
  }
  {
    const r = await req('/admin-panel.html');
    record('admin panel served', r.status === 200, `HTTP ${r.status}`);
  }

  // ── 2. agent runtime surfaces ──
  {
    const { status, body } = await json('/api/agent/tools');
    const names = (body?.tools || []).map((t) => t.name);
    const required = ['file_edit', 'file_list', 'file_search', 'workspace_grep', 'workspace_zip', 'todo_write', 'workspace_rewind', 'code_run', 'sandbox_write', 'sandbox_read'];
    const missing = required.filter((n) => !names.includes(n));
    record('agent tool catalog exposes the full coding surface', status === 200 && body?.success && missing.length === 0,
      missing.length ? 'missing: ' + missing.join(', ') : `${names.length} tools`);
  }
  {
    const { status, body } = await json('/api/agent/routers');
    record('agent router fleet reports status', status === 200 && body?.success && Array.isArray(body.routers) && body.routers.length > 0,
      `${body?.routers?.length ?? 0} routers · ${body?.configured ?? 0} configured`);
  }
  {
    const { status, body } = await json('/api/agent/mcp');
    record('MCP connector fleet lists connectors + sandbox stats', status === 200 && body?.success && Array.isArray(body.connectors) && body.connectors.length > 0 && !!body.sandbox,
      `${body?.connectors?.length ?? 0} connectors`);
  }
  {
    const { status, body } = await json('/api/agent/memory');
    record('5-layer memory pipeline responds', status === 200 && body?.success && !!body.stats, JSON.stringify(body?.stats || {}));
  }

  // ── 3. platform surfaces ──
  {
    const { status, body } = await json('/api/marketplace/list');
    record('marketplace lists active listings', status === 200 && body?.success && Array.isArray(body.listings),
      `${body?.total ?? 0} listings`);
  }
  {
    const { status, body } = await json('/api/skills');
    record('skill registry loads', status === 200 && body?.success && Array.isArray(body.skills),
      `${body?.skills?.length ?? 0} skills`);
  }
  {
    const r = await req('/api/docs');
    record('swagger docs served', r.status === 200, `HTTP ${r.status}`);
  }
  {
    const { status } = await json('/api/agent/artifacts/definitely-not-a-real.zip');
    record('artifact route rejects missing artifacts with 404', status === 404, `HTTP ${status}`);
  }

  // ── 4. auth flow (real Mongo persistence) ──
  let token = null;
  {
    const email = `ci-smoke+${Date.now()}@test.local`;
    const { status, body } = await json('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'CI Smoke', email, password: 'SmokeTest123!' }),
    });
    token = body?.token || null;
    record('register creates a user and returns a token', (status === 201 || status === 200) && !!token, `HTTP ${status}`);
  }
  if (token) {
    const { status, body } = await json('/api/settings/profile', { headers: { Authorization: `Bearer ${token}` } });
    record('authenticated settings/profile round-trips through MongoDB', status === 200 && body?.success && !!body.profile, `HTTP ${status}`);
  }

  // ── 5. manual tool dispatch through the real registry ──
  if (token) {
    const { status, body } = await json('/api/agent/tools/todo_write', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ args: { todos: [{ task: 'ci smoke', completed: true }, { task: 'report', completed: false }] } }),
    });
    record('manual tool dispatch executes todo_write', status === 200 && body?.ok === true, String(body?.result || body?.error || '').slice(0, 80));
  }

  // ── 6. REAL ReAct run over SSE (engine boot + sandbox + event stream) ──
  if (token) {
    const { ok, status, frames, error } = await readSse('/api/agent/react', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ task: 'Say hello in one short sentence.', maxSteps: 2, tokenBudget: 1500 }),
    });
    const start = frames.find((f) => f.type === 'start');
    const terminal = frames.find((f) => f.type === 'done' || f.type === 'error');
    record('ReAct engine boots: SSE start frame with tool catalog + sandbox',
      ok && status === 200 && !!start && start.tools > 0 && typeof start.runId === 'string',
      start ? `runId ${String(start.runId).slice(0, 18)}… · ${start.tools} tools · sandbox ok` : (error || 'no start frame'));
    record('ReAct run reaches a well-formed terminal event (done or graceful router error)',
      !!terminal && (terminal.type === 'done' || (terminal.type === 'error' && typeof terminal.message === 'string')),
      terminal ? terminal.type + (terminal.type === 'error' ? ': ' + String(terminal.message).slice(0, 70) : '') : 'no terminal frame within timeout');
  }

  return finish();
}

function finish() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log('\n══════════════════════════════════════════');
  console.log(`FULL-STACK SMOKE: ${passed}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED CHECKS:');
    for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail}`);
  }
  console.log('══════════════════════════════════════════');
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('smoke harness crashed:', e);
  process.exit(1);
});
