// ============================================================
// KEYCODE Agent Runtime — 5-Layer Context Compaction Pipeline
// ============================================================
// Keeps any ReAct run inside the model's window no matter how long
// it runs, by distilling history through five layers:
//
//   L1  VERBATIM    — last N raw messages (highest fidelity, smallest span)
//   L2  SUMMARY     — rolling extractive summary of older turns
//   L3  TOOLSIGEST  — compressed tool results (outputs truncated to findings)
//   L4  LONGTERM    — semantic store of durable learnings across runs
//   L5  PINNED      — task definition + hard facts, never compacted
//
// Budget-driven: fitPrompt() walks L5 → L4 → L3 → L2 → L1 and packs
// the window with the richest content that fits the token budget.

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const MEMORY_DIR = path.join(os.tmpdir(), 'keycode-agent-memory');
for (const sub of ['longterm', 'runs']) {
  try { fs.mkdirSync(path.join(MEMORY_DIR, sub), { recursive: true }); } catch {}
}

// ── token estimation (~4 chars/token English+code mix; cheap, no tokenizer) ──
export function estTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

// ─────────────────────────────────────────────
// L5 — PINNED: task + hard facts (never dropped)
// ─────────────────────────────────────────────
export function buildPinned({ task, facts = [], systemRules = '' }) {
  const lines = ['# TASK', task, ''];
  if (facts.length) lines.push('# PINNED FACTS', ...facts.map((f) => '- ' + f), '');
  if (systemRules) lines.push('# RULES', systemRules, '');
  return lines.join('\n');
}

// ─────────────────────────────────────────────
// L1 — VERBATIM: most recent messages as-is
// ─────────────────────────────────────────────
export function takeVerbatim(messages, maxTokens) {
  const taken = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = estTokens(messages[i]);
    if (used + t > maxTokens) break;
    taken.unshift(messages[i]);
    used += t;
  }
  return { messages: taken, tokens: used, covered: taken.length };
}

// ─────────────────────────────────────────────
// L2 — SUMMARY: extractive rolling summary of older turns
// Heuristic distillation (LLM-free so compaction never fails):
// keep first/last sentence of each turn + any line with signal words.
// ─────────────────────────────────────────────
const SIGNAL_RE = /(created|fixed|error|failed|succeed|result|found|decision|use|using|wrote|added|removed|updated|cause|because|key|important|note|todo|next)/i;

function distillTurn(msg) {
  const text = typeof msg === 'string' ? msg : msg.content || '';
  const role = typeof msg === 'string' ? '' : (msg.role || '') + ': ';
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= 2) return role + text;
  const keep = [sentences[0]];
  const mid = sentences.slice(1, -1).filter((s) => SIGNAL_RE.test(s));
  keep.push(...mid.slice(0, 2));
  keep.push(sentences[sentences.length - 1]);
  return role + keep.join(' ');
}

export function summarizeTurns(messages, maxTokens) {
  const distilled = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const d = distillTurn(messages[i]);
    const t = estTokens(d);
    if (used + t > maxTokens) break;
    distilled.unshift(d);
    used += t;
  }
  return { text: distilled.join('\n'), tokens: used, turnsCovered: distilled.length };
}

// ─────────────────────────────────────────────
// L3 — TOOL DIGEST: shrink tool outputs to their signal
// ─────────────────────────────────────────────
export function digestToolObservations(observations, maxTokens) {
  const lines = [];
  let used = 0;
  for (const obs of observations) {
    // obs: { tool, args, result, ok }
    const head = `[${obs.tool}] ${obs.ok ? 'ok' : 'ERR'} ${JSON.stringify(obs.args || {}).slice(0, 120)}`;
    let body = String(obs.result ?? '');
    // keep first meaningful lines, drop stack noise
    const bodyLines = body.split('\n').filter((l) => l.trim()).filter((l) => !/^at /i.test(l));
    let keep = bodyLines.slice(0, 6).join(' | ').slice(0, 400);
    if (bodyLines.length > 6) keep += ` …(+${bodyLines.length - 6} lines)`;
    const line = head + ' → ' + keep;
    const t = estTokens(line);
    if (used + t > maxTokens) break;
    lines.push(line);
    used += t;
  }
  return { text: lines.join('\n'), tokens: used, observationsCovered: lines.length };
}

// ─────────────────────────────────────────────
// L4 — LONGTERM: durable learnings across runs (persisted, relevance-ranked)
// ─────────────────────────────────────────────
export function remember(key, text, tags = []) {
  const entry = { key, text, tags, at: Date.now(), id: crypto.randomBytes(6).toString('hex') };
  try { fs.writeFileSync(path.join(MEMORY_DIR, 'longterm', entry.id + '.json'), JSON.stringify(entry)); } catch {}
  return entry;
}

export function recall(query, { limit = 5, tags = [] } = {}) {
  let entries = [];
  try {
    const files = fs.readdirSync(path.join(MEMORY_DIR, 'longterm')).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      try { entries.push(JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, 'longterm', f), 'utf8'))); } catch {}
    }
  } catch {}
  if (tags.length) entries = entries.filter((e) => e.tags.some((t) => tags.includes(t)));
  const q = String(query || '').toLowerCase();
  const scored = entries.map((e) => {
    const hay = (e.key + ' ' + e.text).toLowerCase();
    let score = 0;
    for (const word of q.split(/\W+/).filter((w) => w.length > 3)) {
      if (hay.includes(word)) score += 2;
    }
    score += Math.max(0, 5 - (Date.now() - e.at) / (24 * 3600 * 1000)); // recency boost
    return { e, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.e);
}

export function memoryStats() {
  try {
    const files = fs.readdirSync(path.join(MEMORY_DIR, 'longterm'));
    return { entries: files.length, dir: MEMORY_DIR };
  } catch { return { entries: 0, dir: MEMORY_DIR }; }
}

export function persistRun(runId, payload) {
  try { fs.writeFileSync(path.join(MEMORY_DIR, 'runs', runId + '.json'), JSON.stringify(payload)); } catch {}
}

// ─────────────────────────────────────────────
// Pipeline assembler: pack the prompt within budget
// ─────────────────────────────────────────────
/**
 * fitPrompt — assemble the highest-fidelity window that fits maxTokens.
 * Order: pinned (always) → longterm → tool digest → summary → verbatim.
 */
export function fitPrompt({ task, facts = [], systemRules = '', messages = [], observations = [], memoryQuery = '', maxTokens = 6000 }) {
  const pinned = buildPinned({ task, facts, systemRules });
  const budgetLeft = () => maxTokens - estTokens(pinned);

  const memHits = memoryQuery ? recall(memoryQuery) : [];
  let memText = '';
  let memTokens = 0;
  if (memHits.length && budgetLeft() > 400) {
    memText = memHits.map((m) => `• (${m.key}) ${m.text}`).join('\n').slice(0, 1500);
    memTokens = estTokens(memText);
  }

  let digest = { text: '', tokens: 0, observationsCovered: 0 };
  if (observations.length && budgetLeft() - memTokens > 300) {
    digest = digestToolObservations(observations, budgetLeft() - memTokens);
  }

  let summary = { text: '', tokens: 0, turnsCovered: 0 };
  if (messages.length && budgetLeft() - memTokens - digest.tokens > 200) {
    summary = summarizeTurns(messages, budgetLeft() - memTokens - digest.tokens);
  }

  const remaining = budgetLeft() - memTokens - digest.tokens - summary.tokens;
  const verbatim = takeVerbatim(messages, remaining);

  const sections = [
    pinned,
    memText ? '# RELEVANT MEMORY\n' + memText : '',
    digest.text ? '# TOOL RESULTS (digested)\n' + digest.text : '',
    summary.text ? '# EARLIER CONVERSATION (summarized)\n' + summary.text : '',
    verbatim.messages.length ? '# RECENT TURNS (verbatim)\n' + verbatim.messages.map((m) => (typeof m === 'string' ? m : `${m.role}: ${m.content}`)).join('\n') : '',
  ].filter(Boolean);

  const total = sections.reduce((a, s) => a + estTokens(s), 0);
  return {
    prompt: sections.join('\n\n'),
    layers: {
      pinned: true,
      longterm: memHits.length,
      toolDigest: digest.observationsCovered,
      summary: summary.turnsCovered,
      verbatim: verbatim.messages.length,
    },
    estTokens: total,
    budget: maxTokens,
    truncatedMessages: messages.length - verbatim.messages.length,
  };
}
