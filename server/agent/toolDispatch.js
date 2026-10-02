// ============================================================
// KEYCODE Agent Runtime — Tool Dispatch Registry
// ============================================================
// One uniform surface the ReAct engine calls tools through:
// schemas for prompting, permission gates, timeouts, and a live
// call log. Combines: codebase navigation, the MCP connector
// fleet, and sandboxed code execution.

import fs from 'fs';
import path from 'path';
import { codebaseToolDefs, codebaseTools } from './codebaseNav.js';
import { connectorManager, CONNECTORS } from './mcpClient.js';
import { createWorkspace, destroyWorkspace, execInSandbox, RingBuffer } from './sandbox.js';

// ─────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────
const registry = new Map(); // name → { def, handler, permissions, timeoutMs, group }

export function registerTool(def, handler, opts = {}) {
  registry.set(def.name, {
    def,
    handler,
    group: opts.group || 'core',
    permissions: opts.permissions || [],
    timeoutMs: opts.timeoutMs || 30000,
    maxCallsPerRun: opts.maxCallsPerRun || 20,
  });
}

// ── codebase navigation tools ──
for (const def of codebaseToolDefs) {
  registerTool(def, (args) => codebaseTools[def.name](args), { group: 'codebase', timeoutMs: 20000 });
}

// ── MCP connector tools (namespace: connector.tool) ──
for (const [connId, conn] of Object.entries(CONNECTORS)) {
  for (const tool of conn.tools) {
    const fullName = `${connId}.${tool.name}`;
    registerTool(
      { name: fullName, description: `[${conn.label}] ${tool.description}`, args: tool.args },
      async (args, runCtx) => {
        const r = await connectorManager.call(fullName, args, { timeoutMs: 60000 });
        return { ok: r.ok, result: r.result, transport: r.transport };
      },
      { group: 'connector', permissions: conn.category === 'enterprise' ? ['comms'] : ['external'], timeoutMs: 60000 }
    );
  }
}

// ── sandboxed code execution ──
registerTool(
  {
    name: 'code_run',
    description: 'Execute code inside the ephemeral sandbox (node/python/sh). Files written persist for the current run only.',
    args: { language: "'node'|'python'|'sh'", code: 'string' },
  },
  async (args, runCtx) => {
    const lang = args.language || 'node';
    const ws = runCtx.workspace;
    const buffer = runCtx.ioBuffer;
    let cmd, scriptPath, argsList = [];
    if (lang === 'node') { scriptPath = 'main.js'; cmd = 'node'; argsList = [scriptPath]; }
    else if (lang === 'python') { scriptPath = 'main.py'; cmd = 'python3'; argsList = [scriptPath]; }
    else if (lang === 'sh') { scriptPath = 'main.sh'; cmd = 'bash'; argsList = [scriptPath]; }
    else return { ok: false, result: 'language must be node|python|sh' };
    fs.writeFileSync(path.join(ws.dir, scriptPath), String(args.code || ''), 'utf8');
    const r = await execInSandbox({ cmd, args: argsList, ws, timeoutMs: runCtx.toolTimeoutMs || 30000, buffer });
    const output = (r.stdout + (r.stderr ? '\n[stderr]\n' + r.stderr : '')).trim();
    return { ok: r.code === 0 && !r.timedOut, result: (output || '(no output)').slice(0, 8000), meta: { exitCode: r.code, durationMs: r.durationMs, timedOut: r.timedOut } };
  },
  { group: 'sandbox', permissions: ['exec'], timeoutMs: 60000, maxCallsPerRun: 30 }
);

registerTool(
  {
    name: 'sandbox_write',
    description: 'Write a file into the run sandbox (visible to code_run).',
    args: { path: 'string (relative)', content: 'string' },
  },
  (args, runCtx) => {
    const rel = String(args.path || '').replace(/^\/+/, '');
    if (rel.includes('..')) return { ok: false, result: 'path traversal blocked' };
    const target = path.join(runCtx.workspace.dir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Meta mirrors file_edit so the ReAct engine can stream real file bytes
    // to UIs (OS code panel, previews) for every write — not just edits.
    const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    const after = String(args.content ?? '');
    fs.writeFileSync(target, after, 'utf8');
    return { ok: true, result: `wrote ${rel} (${after.length} bytes)`, meta: { rel, exists: before != null, writeMode: true, before, after } };
  },
  { group: 'sandbox', timeoutMs: 10000 }
);

registerTool(
  {
    name: 'sandbox_read',
    description: 'Read a file from the run sandbox.',
    args: { path: 'string (relative)' },
  },
  (args, runCtx) => {
    const rel = String(args.path || '').replace(/^\/+/, '');
    if (rel.includes('..')) return { ok: false, result: 'path traversal blocked' };
    try {
      return { ok: true, result: fs.readFileSync(path.join(runCtx.workspace.dir, rel), 'utf8').slice(0, 12000) };
    } catch (e) { return { ok: false, result: 'read failed: ' + e.message }; }
  },
  { group: 'sandbox', timeoutMs: 10000 }
);

// ─────────────────────────────────────────────
// Dispatch
// ─────────────────────────────────────────────
const callLog = []; // last N calls for /api/agent/tools observability

export function toolCatalog() {
  return Array.from(registry.entries()).map(([name, t]) => ({
    name,
    description: t.def.description,
    args: t.def.args,
    group: t.group,
    permissions: t.permissions,
    timeoutMs: t.timeoutMs,
  }));
}

export function recentCalls(limit = 30) {
  return callLog.slice(-limit);
}

export function toolStats() {
  return {
    total: registry.size,
    byGroup: Array.from(registry.values()).reduce((acc, t) => { acc[t.group] = (acc[t.group] || 0) + 1; return acc; }, {}),
    callsLogged: callLog.length,
  };
}

/**
 * dispatchTool — validate → gate → execute → log. Never throws.
 */
export async function dispatchTool(name, args, runCtx = {}) {
  const entry = registry.get(name);
  const t0 = Date.now();
  if (!entry) {
    return { tool: name, ok: false, result: `unknown tool "${name}". Available: ${Array.from(registry.keys()).slice(0, 40).join(', ')}…`, durationMs: 0 };
  }
  // operator permission gate (CLI / desktop prompts, --yolo auto-approve)
  if (typeof runCtx.toolGate === 'function') {
    const a = args || {};
    const subject = a.path || a.pattern || a.task || a.code || a.name || a.objective || '';
    const info = { summary: String(subject).slice(0, 100) || undefined, risky: false };
    let allowed = false;
    try { allowed = await Promise.resolve(runCtx.toolGate(name, a, info)); }
    catch (e) { allowed = false; }
    if (!allowed) {
      return { tool: name, ok: false, result: 'DENIED by operator — the human said no. Do not retry this same action; change approach or emit final.', durationMs: 0 };
    }
  }
  // per-run call limit
  const count = (runCtx.toolCounts ||= {})[name] = ((runCtx.toolCounts[name] || 0) + 1);
  if (count > entry.maxCallsPerRun) {
    return { tool: name, ok: false, result: `tool call limit reached (${entry.maxCallsPerRun}) for ${name}`, durationMs: 0 };
  }
  // permission gate
  if (entry.permissions.length && runCtx.grantedPermissions && !entry.permissions.every((p) => runCtx.grantedPermissions.includes(p) || runCtx.grantedPermissions.includes('*'))) {
    return { tool: name, ok: false, result: `permission denied: requires [${entry.permissions.join(', ')}]`, durationMs: 0 };
  }

  let outcome;
  try {
    const timeoutMs = runCtx.toolTimeoutMs || entry.timeoutMs;
    const result = await Promise.race([
      entry.handler(args || {}, runCtx),
      new Promise((_, reject) => setTimeout(() => reject(new Error('tool timeout after ' + timeoutMs + 'ms')), timeoutMs)),
    ]);
    outcome = typeof result === 'object' && result !== null && 'ok' in result ? result : { ok: true, result: String(result) };
  } catch (e) {
    outcome = { ok: false, result: 'tool error: ' + e.message };
  }
  const log = { tool: name, args: JSON.stringify(args || {}).slice(0, 200), ok: outcome.ok, durationMs: Date.now() - t0, at: Date.now() };
  callLog.push(log);
  if (callLog.length > 200) callLog.shift();
  return { ...outcome, tool: name, durationMs: log.durationMs };
}
