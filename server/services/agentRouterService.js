// ============================================================
// KEYCODE AgentRouterService — 9-Provider Universal Agent Router
// ============================================================
// One interface to every brain the Forge can reach. Each router
// adapts its provider's native API into a common shape:
//   runAgent(prompt, { system, maxTokens, timeoutMs }) → { text, router }
//
// Routers (in swarm priority order):
//   1. dify             — self-hosted Dify workflow/chatflow app
//   2. langflow         — self-hosted Langflow flow run
//   3. open-interpreter — local Open Interpreter CLI (agentic code execution)
//   4. groq             — Groq Cloud (fastest hosted inference)
//   5. mistral          — Mistral / Codestral
//   6. deepseek         — DeepSeek chat
//   7. openrouter       — OpenRouter auto-routing (200+ models)
//   8. azure-foundry    — Azure AI Foundry (successor to retired GitHub Models)
//   9. ollama           — local Ollama (private, free)
//
// The router never throws into the caller: every adapter catches its own
// errors and returns { ok:false, error }. Dead routers are skipped by the
// swarm until their health check passes again.

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const env = (k, d = '') => (process.env[k] ?? d);

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timeout after ' + ms + 'ms')), ms); }),
  ]).finally(() => clearTimeout(timer));
}

async function postJson(url, body, headers, timeoutMs = 30000) {
  const r = await withTimeout(fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }), timeoutMs, url);
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('HTTP ' + r.status + (t ? ' — ' + t.slice(0, 180) : ''));
  }
  return r.json();
}

/** OpenAI-compatible chat completion against any baseURL. */
async function openAiCompatible({ baseURL, apiKey, model, prompt, system, maxTokens, temperature = 0.4, extraHeaders = {} }) {
  // Reasoning models (gpt-oss, DeepSeek-R1, qwen3…) spend tokens thinking
  // before answering — a tiny max_tokens yields empty content, so keep a floor.
  const safeMaxTokens = Math.max(maxTokens || 0, 64);
  const r = await withTimeout(fetch(baseURL.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey, ...extraHeaders },
    body: JSON.stringify({
      model,
      messages: system ? [{ role: 'system', content: system }, { role: 'user', content: prompt }] : [{ role: 'user', content: prompt }],
      max_tokens: safeMaxTokens,
      temperature,
    }),
  }), 90000, 'chat');
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('HTTP ' + r.status + (t ? ' — ' + t.slice(0, 180) : ''));
  }
  const j = await r.json();
  const msg = j?.choices?.[0]?.message;
  // Some runtimes put the answer in reasoning_content when the answer itself
  // was cut off; prefer real content, fall back to a joined reasoning blob.
  const text = msg?.content || (Array.isArray(msg?.reasoning_content) ? msg.reasoning_content.join('') : msg?.reasoning_content) || '';
  if (!text || !text.trim()) throw new Error('empty completion');
  return text;
}

// ─────────────────────────────────────────────
// Router 1: Dify (self-hosted workflow/chatflow)
// Docs: POST {DIFY_HOST}/v1/chat-messages  Authorization: Bearer {app-key}
// ─────────────────────────────────────────────
async function runDify(prompt, { system, maxTokens, timeoutMs }) {
  const host = env('DIFY_HOST');
  const key = env('DIFY_API_KEY');
  if (!host || !key) throw new Error('DIFY_HOST / DIFY_API_KEY not set');
  const fullPrompt = system ? system + '\n\n' + prompt : prompt;
  const j = await postJson(host.replace(/\/$/, '') + '/v1/chat-messages', {
    // Chatflows define their own start variables; `query` as an input covers
    // apps built with a `query` text-input (like the KEYCODE Forge Agent),
    // while `query` top-level covers plain chat/agent apps.
    inputs: { query: fullPrompt },
    query: fullPrompt,
    response_mode: 'blocking',
    user: 'keycode-forge',
  }, { Authorization: 'Bearer ' + key }, timeoutMs);
  const text = j?.answer || j?.data?.outputs?.text || j?.data?.outputs?.result || '';
  if (!text || !text.trim()) throw new Error('dify returned no answer');
  return text;
}

// ─────────────────────────────────────────────
// Router 2: Langflow (self-hosted flow run)
// Docs: POST {LANGFLOW_HOST}/api/v1/run/{flow_id}
// ─────────────────────────────────────────────
async function runLangflow(prompt, { timeoutMs }) {
  const host = env('LANGFLOW_HOST');
  const flowId = env('LANGFLOW_FLOW_ID');
  if (!host || !flowId) throw new Error('LANGFLOW_HOST / LANGFLOW_FLOW_ID not set');
  const j = await postJson(
    host.replace(/\/$/, '') + '/api/v1/run/' + encodeURIComponent(flowId),
    { input_value: prompt, output_type: 'text', input_type: 'chat' },
    env('LANGFLOW_API_KEY') ? { 'x-api-key': env('LANGFLOW_API_KEY') } : {},
    timeoutMs
  );
  const outs = j?.outputs?.[0]?.outputs?.[0];
  const text = outs?.results?.message?.text || outs?.artifacts?.message || outs?.text || '';
  if (!text) throw new Error('langflow returned no message text');
  return text;
}

// ─────────────────────────────────────────────
// Router 3: Open Interpreter (local CLI agent — writes & executes real code)
// Spawns `interpreter` in offline-safe async mode, reads the final answer.
// ─────────────────────────────────────────────
async function runOpenInterpreter(prompt, { timeoutMs }) {
  const bin = env('INTERPRETER_BIN', 'interpreter');
  // -y = auto-approve code execution. Model is passed via --model (format
  // `provider/model`, e.g. ollama/llama3.2:1b); prompt goes via stdin because
  // 0.4.x only accepts positional messages in interactive mode.
  const args = ['-y'];
  const model = env('INTERPRETER_MODEL');
  if (model) args.push('--model', model);
  // OI is an agent: it plans, writes and executes code before answering —
  // inherently slower than a chat call, so enforce a generous floor.
  const effectiveTimeout = Math.max(timeoutMs || 0, 240000);
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, args, { timeout: effectiveTimeout, env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    } catch (e) {
      return reject(new Error('interpreter spawn failed: ' + e.message));
    }
    let out = '', err = '', settled = false;
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { if (!settled) { settled = true; reject(new Error('interpreter not available: ' + e.message)); } });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      // The CLI paints a terminal UI; keep the last substantive text block.
      const text = out
        .split('\n')
        .map(l => l.replace(/^\s*>\s?/, '').trimEnd())
        .filter(l => l.trim() && l.trim() !== 'Exiting...' && !l.trimStart().startsWith('{"name"'))
        .join('\n')
        .trim();
      if (code === 0 && text) return resolve(text);
      reject(new Error('interpreter exit ' + code + (err ? ' — ' + err.slice(-200) : text ? ' (no output)' : '')));
    });
    // Feed the prompt over stdin, then close so the CLI processes it.
    try { child.stdin.write(prompt + '\n'); child.stdin.end(); } catch (e) {
      if (!settled) { settled = true; reject(new Error('interpreter stdin failed: ' + e.message)); }
    }
  });
}

// ─────────────────────────────────────────────
// Routers 4-9: hosted + local model providers
// ─────────────────────────────────────────────
async function runGroq(prompt, o) {
  const key = env('GROQ_API_KEY');
  if (!key) throw new Error('GROQ_API_KEY not set');
  return openAiCompatible({ baseURL: 'https://api.groq.com/openai/v1', apiKey: key, model: o.models?.groq || env('GROQ_MODEL', 'openai/gpt-oss-20b'), prompt, system: o.system, maxTokens: o.maxTokens });
}
async function runMistral(prompt, o) {
  const key = env('MISTRAL_API_KEY');
  if (!key) throw new Error('MISTRAL_API_KEY not set');
  return openAiCompatible({ baseURL: 'https://api.mistral.ai/v1', apiKey: key, model: o.models?.mistral || env('MISTRAL_MODEL', 'codestral-latest'), prompt, system: o.system, maxTokens: o.maxTokens });
}
async function runDeepSeek(prompt, o) {
  const key = env('DEEPSEEK_API_KEY');
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');
  return openAiCompatible({ baseURL: 'https://api.deepseek.com', apiKey: key, model: o.models?.deepseek || 'deepseek-chat', prompt, system: o.system, maxTokens: o.maxTokens });
}
async function runOpenRouter(prompt, o) {
  const key = env('OPENROUTER_API_KEY');
  if (!key) throw new Error('OPENROUTER_API_KEY not set');
  return openAiCompatible({ baseURL: 'https://openrouter.ai/api/v1', apiKey: key, model: o.models?.openrouter || 'openrouter/auto', prompt, system: o.system, maxTokens: o.maxTokens, extraHeaders: { 'HTTP-Referer': 'https://keycode.studio', 'X-Title': 'KEYCODE Forge' } });
}
async function runAzureFoundry(prompt, o) {
  const key = env('AZURE_FOUNDRY_API_KEY') || env('GITHUB_TOKEN');
  if (!key) throw new Error('AZURE_FOUNDRY_API_KEY / GITHUB_TOKEN not set');
  const base = env('AZURE_FOUNDRY_ENDPOINT', 'https://models.github.ai/inference');
  const model = o.models?.azure || env('AZURE_FOUNDRY_MODEL', 'openai/gpt-4.1-mini');
  return openAiCompatible({ baseURL: base, apiKey: key, model, prompt, system: o.system, maxTokens: o.maxTokens });
}
async function runOllama(prompt, o) {
  const host = env('OLLAMA_HOST', 'http://localhost:11434');
  let model = o.models?.ollama || env('OLLAMA_MODEL', 'qwen2.5-coder:7b');
  // Requested model may not be pulled on this machine — resolve to a local
  // model that actually exists so the router never hard-fails on a tag.
  const installed = await getOllamaModelsCached();
  if (installed.length && !installed.some(n => n === model || n.split(':')[0] === model.split(':')[0])) {
    model = installed[0];
  }
  if (installed.length && !installed.includes(model)) model = installed[0];
  if (!installed.length) throw new Error('no local ollama models installed');
  const r = await withTimeout(fetch(host.replace(/\/$/, '') + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: o.system ? [{ role: 'system', content: o.system }, { role: 'user', content: prompt }] : [{ role: 'user', content: prompt }], stream: false, options: { num_predict: Math.max(o.maxTokens || 0, 64) } }),
  }), 120000, 'ollama');
  if (!r.ok) throw new Error('ollama HTTP ' + r.status);
  const j = await r.json();
  const text = j?.message?.content;
  if (!text || !text.trim()) throw new Error('ollama empty response');
  return text;
}

// ─────────────────────────────────────────────
// Router registry
// ─────────────────────────────────────────────
export const ROUTERS = {
  'dify':             { label: 'Dify Workflow',        kind: 'workflow', run: runDify,             configured: () => !!env('DIFY_HOST') && !!env('DIFY_API_KEY') },
  'langflow':         { label: 'Langflow Flow',        kind: 'workflow', run: runLangflow,         configured: () => !!env('LANGFLOW_HOST') && !!env('LANGFLOW_FLOW_ID') },
  'open-interpreter': { label: 'Open Interpreter',     kind: 'agent',    run: runOpenInterpreter,  configured: () => !!env('INTERPRETER_BIN') || !!env('INTERPRETER_MODEL') },
  'groq':             { label: 'Groq Cloud',           kind: 'model',    run: runGroq,             configured: () => !!env('GROQ_API_KEY') },
  'mistral':          { label: 'Mistral Codestral',    kind: 'model',    run: runMistral,          configured: () => !!env('MISTRAL_API_KEY') },
  'deepseek':         { label: 'DeepSeek',             kind: 'model',    run: runDeepSeek,         configured: () => !!env('DEEPSEEK_API_KEY') },
  'openrouter':       { label: 'OpenRouter',           kind: 'model',    run: runOpenRouter,       configured: () => !!env('OPENROUTER_API_KEY') },
  'azure-foundry':    { label: 'Azure AI Foundry',     kind: 'model',    run: runAzureFoundry,     configured: () => !!(env('AZURE_FOUNDRY_API_KEY') || env('GITHUB_TOKEN')) },
  'ollama':           { label: 'Ollama (local)',       kind: 'model',    run: runOllama,           configured: () => true },
};

export const ROUTER_IDS = Object.keys(ROUTERS);

// ─────────────────────────────────────────────
// Health tracking (dead routers are skipped, then probed back to life)
// ─────────────────────────────────────────────
const health = new Map(); // id → { alive, lastCheck, lastError, lastLatencyMs, successes, failures }
for (const id of ROUTER_IDS) health.set(id, { alive: true, lastCheck: 0, lastError: null, lastLatencyMs: null, successes: 0, failures: 0 });

function isAlive(id) {
  const h = health.get(id);
  if (!h) return false;
  // A dead router gets one probe shot every 90s; alive routers pass through.
  if (!h.alive && Date.now() - h.lastCheck > 90000) return true;
  return h.alive;
}

function mark(id, ok, error = null, latencyMs = null) {
  const h = health.get(id);
  if (!h) return;
  h.lastCheck = Date.now();
  if (ok) { h.alive = true; h.successes++; h.lastError = null; if (latencyMs != null) h.lastLatencyMs = latencyMs; }
  else { h.alive = false; h.failures++; h.lastError = String(error || '').slice(0, 300); }
}

// ─────────────────────────────────────────────
// Single-router execution
// ─────────────────────────────────────────────
export async function runAgent(prompt, options = {}) {
  const { router, system = '', maxTokens = 4096, timeoutMs = 90000 } = options;
  const def = ROUTERS[router];
  if (!def) return { ok: false, router, error: 'unknown router: ' + router };
  if (!def.configured()) return { ok: false, router, error: 'router not configured', unconfigured: true };
  if (!isAlive(router)) return { ok: false, router, error: 'router marked dead (health)', dead: true };
  const t0 = Date.now();
  try {
    // Agentic routers get a longer outer ceiling — they run code, not just chat.
    const outerTimeout = router === 'open-interpreter' ? Math.max(timeoutMs, 240000) : timeoutMs;
    const text = await withTimeout(def.run(prompt, { system, maxTokens, timeoutMs: outerTimeout }), outerTimeout, router);
    const ms = Date.now() - t0;
    mark(router, true, null, ms);
    return { ok: true, router, text, ms };
  } catch (e) {
    mark(router, false, e.message);
    return { ok: false, router, error: e.message, ms: Date.now() - t0 };
  }
}

// ─────────────────────────────────────────────
// Swarm: try routers in priority order until one answers.
// `options.prefer` reorders the swarm (still with the rest as fallback).
// ─────────────────────────────────────────────
export async function swarmRun(prompt, options = {}) {
  const { prefer = [], maxTokens = 4096, system = '', timeoutMs = 90000, onRouter = null } = options;
  const preferred = prefer.filter(id => ROUTERS[id]);
  const order = [
    ...preferred,
    ...ROUTER_IDS.filter(id => !preferred.includes(id)),
  ];
  const attempts = [];
  for (const id of order) {
    if (!ROUTERS[id].configured()) continue;
    if (onRouter) { try { onRouter(id); } catch {} }
    const r = await runAgent(prompt, { router: id, system, maxTokens, timeoutMs });
    attempts.push({ router: id, ok: r.ok, error: r.error || null, ms: r.ms || null });
    if (r.ok && r.text && r.text.trim().length > 0) {
      return { ok: true, text: r.text, router: id, ms: r.ms, attempts };
    }
  }
  return { ok: false, text: '', router: null, attempts };
}

// ─────────────────────────────────────────────
// Health snapshot for /api/agent/routers
// ─────────────────────────────────────────────
export function routerStatus() {
  return ROUTER_IDS.map(id => {
    const def = ROUTERS[id];
    const h = health.get(id);
    return {
      id,
      label: def.label,
      kind: def.kind,
      configured: def.configured(),
      alive: h.alive,
      lastCheck: h.lastCheck ? new Date(h.lastCheck).toISOString() : null,
      lastError: h.lastError,
      lastLatencyMs: h.lastLatencyMs,
      successes: h.successes,
      failures: h.failures,
    };
  });
}

/** Quick liveness probe used by /api/agent/routers?probe=1 and startup warm-up. */
export async function probeRouter(id, timeoutMs = 20000) {
  const def = ROUTERS[id];
  if (!def) return { ok: false, router: id, error: 'unknown router' };
  const r = await runAgent('Reply with exactly: ok', { router: id, maxTokens: 16, timeoutMs });
  return r;
}

export async function probeAllRouters(concurrency = 4) {
  const results = [];
  const queue = [...ROUTER_IDS];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const id = queue.shift();
      if (!ROUTERS[id].configured()) continue;
      const r = await probeRouter(id);
      results.push({ router: id, ok: r.ok, error: r.error || null, ms: r.ms || null });
    }
  }));
  return results;
}

// Cached Ollama model list so callers can pre-sort local models first.
let _ollamaModels = null;
let _ollamaModelsAt = 0;
export async function getOllamaModelsCached() {
  if (_ollamaModels && Date.now() - _ollamaModelsAt < 60000) return _ollamaModels;
  try {
    const host = env('OLLAMA_HOST', 'http://localhost:11434');
    const r = await withTimeout(fetch(host.replace(/\/$/, '') + '/api/tags', { signal: AbortSignal.timeout(2500) }), 4000, 'ollama tags');
    if (!r.ok) throw new Error('tags HTTP ' + r.status);
    const j = await r.json();
    _ollamaModels = (j.models || []).map(m => m.name).filter(Boolean);
  } catch {
    _ollamaModels = [];
  }
  _ollamaModelsAt = Date.now();
  return _ollamaModels;
}
