'use strict';
// ============================================================
//  AI PROVIDER LAYER — lib/ai-provider.js
//  Optional real-LLM integration for KEYCODE Studio AI endpoints.
//  Supports any OpenAI-compatible API (OpenAI, Groq, OpenRouter,
//  DeepSeek, Together, Ollama/LM Studio, ...), Google Gemini and
//  Anthropic. When nothing is configured, llmComplete/llmJSON
//  resolve to null and callers fall back to the local engine.
//
//  Env:
//    AI_PROVIDER   'openai' | 'openai-compatible' | 'gemini' | 'anthropic'  (auto-detected if unset)
//    AI_API_KEY    API key (aliases: OPENAI_API_KEY, GEMINI_API_KEY, GOOGLE_AI_API_KEY,
//                  ANTHROPIC_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY)
//    AI_MODEL      model id, e.g. gpt-4o-mini / gemini-2.0-flash / claude-3-5-haiku-latest
//    AI_BASE_URL   override base URL (required for openai-compatible third parties, e.g. https://api.groq.com/openai/v1)
//    AI_TIMEOUT_MS per-call timeout, default 45000
// ============================================================

const KEY_ALIASES = [
  'AI_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_AI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'DEEPSEEK_API_KEY',
];

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  'openai-compatible': '',
  gemini: 'gemini-flash-latest',
  anthropic: 'claude-3-5-haiku-latest',
  pollinations: 'openai',
};

const PROVIDER_BY_KEY_ENV = {
  OPENAI_API_KEY: 'openai',
  GEMINI_API_KEY: 'gemini',
  GOOGLE_AI_API_KEY: 'gemini',
  ANTHROPIC_API_KEY: 'anthropic',
  GROQ_API_KEY: 'openai-compatible',
  OPENROUTER_API_KEY: 'openai-compatible',
  DEEPSEEK_API_KEY: 'openai-compatible',
};

const DEFAULT_BASE_URLS = {
  'openai-compatible': '',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  deepseek: 'https://api.deepseek.com/v1',
  ollama: 'http://localhost:11434/v1',
  pollinations: 'https://text.pollinations.ai/openai',
};

function firstEnv(names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

// ---- key pool: AI_POOL="provider|key|baseUrl|model;provider2|key2|..." ----
// Multiple keys/providers round-robin so a single key's rate limit never
// blocks a user run. The pool cools down a key for 60s after a 429/402/5xx.
const POOL = [];
(function buildPool() {
  const raw = (process.env.AI_POOL || '').trim();
  if (!raw) return;
  for (const entry of raw.split(';')) {
    const parts = entry.split('|').map(function (s) { return s.trim(); });
    if (!parts[0] || !parts[1]) continue;
    POOL.push({
      id: 'pool' + POOL.length,
      provider: parts[0],
      key: parts[1],
      baseUrl: parts[2] || DEFAULT_BASE_URLS[parts[0]] || '',
      model: parts[3] || DEFAULT_MODELS[parts[0]] || '',
      cooldownUntil: 0,
      fails: 0,
    });
  }
  if (POOL.length > 1) console.log('[ai-provider] key pool: ' + POOL.length + ' keys loaded');
})();
let poolCursor = 0;

function pickPoolEntry() {
  const nowMs = Date.now();
  for (let i = 0; i < POOL.length; i++) {
    const e = POOL[(poolCursor + i) % POOL.length];
    if (e.cooldownUntil <= nowMs) { poolCursor = (poolCursor + i + 1) % POOL.length; return e; }
  }
  return null; // all cooling down
}

function markPoolResult(entry, ok) {
  if (!entry) return;
  if (ok) { entry.fails = 0; return; }
  entry.fails++;
  // exponential cooldown: 60s, 120s, 240s…
  entry.cooldownUntil = Date.now() + Math.min(60000 * Math.pow(2, entry.fails - 1), 15 * 60000);
}

function llmInfo() {
  const providerEnv = (process.env.AI_PROVIDER || '').toLowerCase().trim();
  const key = firstEnv(KEY_ALIASES);
  let provider = providerEnv;
  let source = 'AI_PROVIDER';

  if (!provider) {
    // auto-detect from whichever key alias is present
    for (const envName of Object.keys(PROVIDER_BY_KEY_ENV)) {
      const v = process.env[envName];
      if (v && String(v).trim()) {
        provider = PROVIDER_BY_KEY_ENV[envName];
        source = envName;
        break;
      }
    }
    if (provider && providerEnv === '' && process.env.AI_BASE_URL) source = 'AI_BASE_URL';
  }

  // special-case: AI_BASE_URL given but no explicit provider + generic AI_API_KEY → openai-compatible
  if (!provider && key && process.env.AI_BASE_URL) provider = 'openai-compatible';
  if (provider === 'groq' || provider === 'openrouter' || provider === 'deepseek' || provider === 'ollama') {
    provider = 'openai-compatible';
  }

  // keyless real-AI default: Pollinations (OpenAI-compatible, no key required)
  if (!provider) { provider = 'pollinations'; source = 'default'; }

  const model = (process.env.AI_MODEL || '').trim() || DEFAULT_MODELS[provider] || '';
  const baseUrl = (process.env.AI_BASE_URL || '').trim() || DEFAULT_BASE_URLS[provider] || '';
  const keyless = provider === 'pollinations';
  const configured = Boolean(provider && (keyless || key) && (provider !== 'openai-compatible' || baseUrl)) && !providerDisabled(provider);
  return {
    configured: configured,
    provider: provider || null,
    model: configured ? model : null,
    baseUrl: configured && baseUrl ? baseUrl : null,
    keySource: configured ? source : null,
  };
}

// Auto-cooldown: a provider that just hit a quota/paywall error (402) is
// disabled for 10 minutes so callers immediately fall back to the local
// engine instead of burning time on a request that cannot succeed.
const PROVIDER_COOLDOWN_MS = 10 * 60 * 1000;
const providerCooldownUntil = {}; // provider -> epoch ms

function markProviderFailure(provider, errMessage) {
  if (!provider) return;
  const msg = String(errMessage || '');
  if (/HTTP 40[12]\b/.test(msg)) { // 401 unauthorized / 402 payment required
    providerCooldownUntil[provider] = Date.now() + PROVIDER_COOLDOWN_MS;
    console.warn('[ai-provider] ' + provider + ' quota/auth error — cooling down for 10 minutes, falling back to local engine');
  }
}

function providerDisabled(provider) {
  return (providerCooldownUntil[provider] || 0) > Date.now();
}

// ---- fallback chain: AI_FALLBACK="provider|key|baseUrl|model;..." ----
// Tried in order when the primary provider fails (quota/auth/5xx). Example:
// AI_FALLBACK=openai-compatible|sk-or-...|https://openrouter.ai/api/v1|openai/gpt-4o-mini;gemini|AIza...||gemini-2.0-flash
const FALLBACKS = [];
(function buildFallbacks() {
  const raw = (process.env.AI_FALLBACK || '').trim();
  if (!raw) return;
  for (const entry of raw.split(';')) {
    const parts = entry.split('|').map(function (s) { return s.trim(); });
    if (!parts[0] || !parts[1]) continue;
    FALLBACKS.push({
      provider: (parts[0] === 'openrouter' || parts[0] === 'groq') ? 'openai-compatible' : parts[0],
      key: parts[1],
      baseUrl: parts[2] || DEFAULT_BASE_URLS[parts[0]] || '',
      model: parts[3] || DEFAULT_MODELS[parts[0]] || '',
      cooldownUntil: 0,
    });
  }
  if (FALLBACKS.length) console.log('[ai-provider] fallback chain: ' + FALLBACKS.length + ' provider(s) configured');
})();

/** Try the fallback chain. Returns the first successful completion, or null. */
async function tryFallbacks(prompt, o) {
  for (const fb of FALLBACKS) {
    if (fb.cooldownUntil > Date.now()) continue;
    if (!fb.model) continue;
    const info = { configured: true, provider: fb.provider, model: fb.model, baseUrl: fb.baseUrl || null, keySource: 'AI_FALLBACK' };
    try {
      const text = await callProvider(info, fb.model, prompt, o, function (names) { return fb.key; });
      if (!text || !String(text).trim()) throw new Error('empty completion');
      fb.cooldownUntil = 0;
      return { text: String(text), model: fb.model, provider: fb.provider, via: 'fallback' };
    } catch (e) {
      const msg = e && e.message ? String(e.message).split('\n')[0] : String(e);
      if (/HTTP 40[129]\b/.test(msg)) fb.cooldownUntil = Date.now() + 5 * 60 * 1000;
      console.warn('[ai-provider] fallback ' + fb.provider + '/' + fb.model + ' failed: ' + msg);
    }
  }
  return null;
}

function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch (_) {}
  // first {...} or [...] block
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const start = t.indexOf(open);
    const end = t.lastIndexOf(close);
    if (start !== -1 && end > start) {
      try { return JSON.parse(t.slice(start, end + 1)); } catch (_) {}
    }
  }
  return null;
}

async function callProvider(info, model, prompt, o, firstEnv) {
  const timeoutMs = Number(o.timeoutMs || process.env.AI_TIMEOUT_MS || 45000);
  const controller = new AbortController();
  const timer = setTimeout(function () { try { controller.abort(); } catch (_) {} }, timeoutMs);
  // firstEnv may be the real env lookup OR a pool/fallback closure returning
  // that entry's explicit key — either way it resolves names -> key.
  try {
    if (info.provider === 'gemini') {
      const url = (info.baseUrl || 'https://generativelanguage.googleapis.com') +
        '/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(firstEnv(['AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_AI_API_KEY']));
      const body = {
        contents: [{ role: 'user', parts: [{ text: String(prompt) }] }],
        generationConfig: {
          temperature: typeof o.temperature === 'number' ? o.temperature : 0.7,
          maxOutputTokens: Math.max(o.maxTokens || 8192, 1024),
        },
      };
      if (o.system) body.systemInstruction = { parts: [{ text: String(o.system) }] };
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error('gemini HTTP ' + r.status + ': ' + (await r.text()).slice(0, 300));
      const j = await r.json();
      const parts = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
      return Array.isArray(parts) ? parts.map(function (p) { return p.text || ''; }).join('') : null;
    }
    if (info.provider === 'anthropic') {
      const r = await fetch((info.baseUrl || 'https://api.anthropic.com') + '/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': firstEnv(['AI_API_KEY', 'ANTHROPIC_API_KEY']),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model,
          max_tokens: Math.max(o.maxTokens || 8192, 1024),
          system: o.system || undefined,
          messages: [{ role: 'user', content: String(prompt) }],
        }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error('anthropic HTTP ' + r.status + ': ' + (await r.text()).slice(0, 300));
      const j = await r.json();
      return Array.isArray(j.content) ? j.content.map(function (c) { return c.text || ''; }).join('') : null;
    }
    // pollinations: keyless plain-text GET endpoint (POST /openai is deprecated for anonymous use)
    if (info.provider === 'pollinations') {
      const q = (o.system ? String(o.system) + '\n\n' : '') + String(prompt);
      const url = 'https://text.pollinations.ai/' + encodeURIComponent(q) +
        '?model=' + encodeURIComponent(model || 'openai') + '&referrer=keycode-studio';
      const r = await fetch(url, { signal: controller.signal });
      if (!r.ok) throw new Error('pollinations HTTP ' + r.status);
      return await r.text();
    }
    // openai + openai-compatible
    const base = info.baseUrl || 'https://api.openai.com/v1';
    const messages = [];
    if (o.system) messages.push({ role: 'system', content: String(o.system) });
    messages.push({ role: 'user', content: String(prompt) });
    const headers = { 'Content-Type': 'application/json' };
    const apiKey = firstEnv(['AI_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY']);
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey; // keyless providers (e.g. Pollinations) work without it
    const r = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: typeof o.temperature === 'number' ? o.temperature : 0.7,
        max_tokens: Math.max(o.maxTokens || 8192, 1024),
      }),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error('openai HTTP ' + r.status + ': ' + (await r.text()).slice(0, 300));
    const j = await r.json();
    return j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Complete a prompt. Resolves to { text, model, provider } on success,
 * or null when no provider is configured or the call fails
 * (callers are expected to fall back to the local engine).
 */
async function llmComplete(prompt, opts) {
  const o = opts || {};
  // AI_PROVIDER="disabled" forces the local engine (used by tests / offline runs)
  if ((process.env.AI_PROVIDER || '').trim().toLowerCase() === 'disabled') return null;
  // ---- pool mode: try each non-cooling key, rotating on failure ----
  if (POOL.length) {
    const tries = Math.min(POOL.length, 5);
    for (let i = 0; i < tries; i++) {
      const entry = pickPoolEntry();
      if (!entry) break; // all keys cooling down
      const info = {
        configured: true, provider: entry.provider, model: entry.model,
        baseUrl: entry.baseUrl || null, keySource: entry.id,
      };
      if (!entry.model) continue;
      try {
        const text = await callProvider(info, entry.model, prompt, o, function (names) { return entry.key; });
        if (!text || !String(text).trim()) throw new Error('empty completion');
        markPoolResult(entry, true);
        return { text: String(text), model: entry.model, provider: entry.provider };
      } catch (e) {
        markPoolResult(entry, false);
        console.warn('[ai-provider] pool[' + entry.id + '] ' + entry.provider + '/' + entry.model + ' failed: ' + (e && e.message ? String(e.message).split('\n')[0] : e) + ' — rotating to next key');
      }
    }
    return null; // every key rate-limited/cooling; caller falls back
  }
  const info = llmInfo();
  if (!info.configured) return FALLBACKS.length ? tryFallbacks(prompt, o) : null;
  const model = o.model || info.model;
  if (!model) return FALLBACKS.length ? tryFallbacks(prompt, o) : null;
  const timeoutMs = Number(o.timeoutMs || process.env.AI_TIMEOUT_MS || 45000);
  const controller = new AbortController();
  const timer = setTimeout(function () { try { controller.abort(); } catch (_) {} }, timeoutMs);

  // Pollinations anonymous tier: single fast attempt — 402s don't heal with retries,
  // and the local engine fallback keeps the UI snappy.
  const attempts = info.provider === 'pollinations' ? 1 : 3;
  const backoffs = info.provider === 'pollinations' ? [0] : [0, 2500, 6000];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (backoffs[attempt - 1]) await new Promise(function (r) { setTimeout(r, backoffs[attempt - 1]); });
    try {
      const text = await callProvider(info, model, prompt, o, firstEnv);
      if (!text || !String(text).trim()) throw new Error('empty completion');
      return { text: String(text), model: model, provider: info.provider };
    } catch (e) {
      const msg0 = e && e.message ? String(e.message).split('\n')[0] : String(e);
      markProviderFailure(info.provider, msg0);
      console.warn('[ai-provider] ' + (info.provider || '?') + '/' + (model || '?') + ' attempt ' + attempt + '/' + attempts + ' failed: ' + msg0 +
        (attempt === attempts && FALLBACKS.length ? ' — trying fallback chain' : ''));
    }
  }
  // Primary provider exhausted — try the configured fallback chain.
  if (FALLBACKS.length) return await tryFallbacks(prompt, o);
  return null;
}

/** JSON-mode completion. Resolves to parsed JSON or null. */
async function llmJSON(prompt, opts) {
  const o = opts || {};
  const r = await llmComplete(prompt, Object.assign({}, o, {
    temperature: typeof o.temperature === 'number' ? o.temperature : 0.2,
  }));
  if (!r) return null;
  const parsed = extractJson(r.text);
  if (!parsed) console.warn('[ai-provider] could not parse JSON from ' + r.provider + '/' + r.model);
  return parsed;
}

module.exports = {
  llmInfo: llmInfo, llmComplete: llmComplete, llmJSON: llmJSON, extractJson: extractJson,
  poolStatus: function () { return POOL.map(function (e) { return { id: e.id, provider: e.provider, model: e.model, cooling: e.cooldownUntil > Date.now(), fails: e.fails }; }); },
};
