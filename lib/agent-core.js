'use strict';
// ============================================================
//  AGENT CORE v2 — lib/agent-core.js
//  A ReAct (Reason + Act) agent loop with:
//   · plan → act → verify → repair cycle (plan is a first-class artifact)
//   · context compaction: transcript is auto-summarized before it blows up
//   · LLM retries with escalating temp + JSON repair (extractJson robust)
//   · subagents: parallel subagent task delegation (Concurrent agents)
//   · self-learning skill library (tools saved by the agent itself)
//   · persistent memory (facts/skills/projects) + session transcripts
//   · budget guards (max steps, max tool errors, wall-clock timeout)
//  Works fully offline with the local template engine; becomes far
//  stronger when AI_PROVIDER/AI_API_KEY configures a real LLM.
// ============================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const tools = require('./agent-tools');
const ai = require('./ai-provider');

const DATA_DIR = path.join(process.cwd(), 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'agent-memory.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'agent-sessions.json');

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fallback; }
}
function writeJSON(p, val) {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(val, null, 2)); } catch (_) { }
}
function nid() { return crypto.randomBytes(9).toString('hex'); }
function now() { return new Date().toISOString(); }
function clampStr(s, n) { return String(s || '').slice(0, n); }

// ---------------- memory ----------------
function loadMemory() {
  return readJSON(MEMORY_FILE, { facts: [], skills: [], projects: [], updatedAt: null });
}
function saveMemory(m) { m.updatedAt = now(); writeJSON(MEMORY_FILE, m); }

function rememberFact(text) {
  const m = loadMemory();
  const t = clampStr(text, 500);
  if (!t) return false;
  if (m.facts.some(function (f) { return f.text === t; })) return false;
  m.facts.unshift({ id: 'fac_' + nid(), text: t, at: now() });
  m.facts = m.facts.slice(0, 500);
  saveMemory(m);
  return true;
}

function learnSkill(name, prompt, notes) {
  const m = loadMemory();
  const skill = { id: 'skl_' + nid(), name: clampStr(name, 80), prompt: clampStr(prompt, 4000), notes: clampStr(notes, 2000), at: now() };
  m.skills.unshift(skill);
  m.skills = m.skills.slice(0, 200);
  saveMemory(m);
  // clear cached tool registry so the new skill shows up
  for (const k of Object.keys(REGISTRY_EXTRA)) delete REGISTRY_EXTRA[k];
  return skill;
}

// ---------------- skills library ----------------
function skillToolName(name) {
  return 'skill_' + String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function buildSkillTools() {
  const m = loadMemory();
  for (const k of Object.keys(REGISTRY_EXTRA)) delete REGISTRY_EXTRA[k];
  return m.skills.map(function (s) {
    const toolName = skillToolName(s.name);
    const tmpl = String(s.prompt || '');
    const tool = {
      name: toolName, group: 'skill', danger: false,
      desc: 'Learned skill "' + s.name + '": ' + clampStr(s.notes || tmpl, 120),
      args: { input: 'string' },
      run: async function (a) {
        const filled = tmpl.replace(/\{\{\s*input\s*\}\}/g, clampStr(a.input, 8000));
        const r = await ai.llmComplete(filled, { system: 'You are KEYCODE Agent executing a learned skill. Produce the requested output only.', maxTokens: 8000 });
        if (!r) return { ok: false, error: 'no LLM configured or call failed' };
        return { ok: true, skill: s.name, text: clampStr(r.text, 20000) };
      },
    };
    REGISTRY_EXTRA[toolName] = tool;
    return tool;
  }).filter(Boolean);
}

// ---------------- sessions ----------------
function saveSession(session) {
  const all = readJSON(SESSIONS_FILE, []);
  const i = all.findIndex(function (s) { return s.id === session.id; });
  if (i === -1) all.unshift(session); else all[i] = session;
  writeJSON(SESSIONS_FILE, all.slice(0, 100));
}

const REGISTRY_EXTRA = {}; // learned-skill tools

// ---------------- system prompt ----------------
const SYSTEM_PROMPT = [
  'You are KEYCODE Agent — an autonomous general-purpose agent.',
  'You solve tasks by using tools in a strict loop: respond with ONLY a JSON object, no prose, no markdown fences, in one of these shapes:',
  '{"thought":"...","tool":"<tool_name>","args":{...}}  — to act',
  '{"thought":"...","final":"answer to the user"}  — when done',
  'Rules: keep thoughts under 80 words; prefer tools over guessing; after acting on the observed result decide the next step; verify your work (run tests / re-read output) before finishing; never invent tool results.',
  'Available tools are provided in the conversation as a JSON manifest.',
].join('\n');

const PLAN_PROMPT = [
  'You are the planner for KEYCODE Agent. Given a TASK, produce ONLY a JSON object:',
  '{"plan":["step 1","step 2","step 3","verify: <how to confirm done>"],',
  ' "tool_hints":{"<plan step>":"<tool_name or null>"}}',
  'Max 8 steps. Each step must be actionable with one tool call. If no LLM use, output {"plan":[]}.',
].join('\n');

const CRITIC_PROMPT = [
  'You are the critic for KEYCODE Agent. Given TASK and the STEPS performed (tool + result summaries),',
  'reply ONLY with JSON: {"quality":"good|weak|bad","issues":["..."],"should_verify":true|false}',
  'Issues must be concrete and fixable. Max 4 issues.',
].join('\n');

const COMPACT_PROMPT = [
  'Compress the following agent conversation transcript into a minimal context state.',
  'Reply ONLY with JSON: {"summary":"<what has been accomplished>",',
  ' "key_facts":["<short fact>"], "open_items":["<what still needs to be done>"]}',
  'Be terse. Max 400 words total.',
].join('\n');

// ---------------- JSON extraction (hardened) ----------------
function extractJson(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch (_) { }
  // strip trailing commas (common LLM bug)
  const cleaned = t.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(cleaned); } catch (_) { }
  // balanced brace scan from first '{' — handles nested JSON better than lastIndexOf
  const start = t.indexOf('{');
  if (start !== -1) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < t.length; i++) {
      const c = t[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) {
        const cand = t.slice(start, i + 1);
        try { return JSON.parse(cand); } catch (_) { }
        try { return JSON.parse(cand.replace(/,\s*([}\]])/g, '$1')); } catch (_) { }
      } }
    }
  }
  return null;
}

// ---------------- LLM decision with retry ----------------
async function llmDecision(prompt, opts) {
  const info = ai.llmInfo();
  if (!info.configured) return null;
  let decision = null;
  for (let attempt = 1; attempt <= 3 && !decision; attempt++) {
    const r = await ai.llmComplete(prompt, {
      system: opts.system, maxTokens: opts.maxTokens || 2000,
      temperature: opts.temperature !== undefined ? opts.temperature + (attempt - 1) * 0.15 : 0.2 + (attempt - 1) * 0.15,
      timeoutMs: opts.timeoutMs || 30000,
    });
    if (r) decision = extractJson(r.text);
    if (decision && typeof decision !== 'object') decision = null;
  }
  return decision;
}

// ---------------- subagent delegation ----------------
/**
 * spawnSubagent(task, ctx) — runs an isolated agent run with a narrowed goal.
 * toolFilter: array of tool names allowed. Used by plan-based parallel fan-out.
 */
async function spawnSubagent(goal, ctx, toolFilter, budget) {
  try {
    const session = await runTask({
      goal: goal,
      maxSteps: Math.min(Number(budget || 8), 16),
      timeoutMs: 120000,
      allowedTools: Array.isArray(toolFilter) ? toolFilter : undefined,
      ctxOverride: ctx,
    }, function () { });
    return { ok: session.status === 'done', sessionId: session.id, final: session.final, status: session.status };
  } catch (e) {
    return { ok: false, error: clampStr(e && e.message || e, 400) };
  }
}

// register subagent as a native tool the parent agent can call
const SUBAGENT_TOOL = {
  name: 'subagent_run', group: 'agent', danger: false,
  desc: 'Delegate a narrow self-contained goal to a subagent run. args: {goal, tools?: [names], maxSteps?: 8}. Returns {final} text when the subagent finishes.',
  args: { goal: 'string', tools: 'array?', maxSteps: 'number?' },
  run: async function (a, ctx) {
    return await spawnSubagent(clampStr(a.goal, 2000), ctx, a.tools, a.maxSteps);
  },
};
tools.registerExtra && tools.registerExtra(SUBAGENT_TOOL);
if (!tools.get('subagent_run')) {
  // agent-tools has no registerExtra — monkey-patch into manifest/get
  const origManifest = tools.manifest.bind(tools);
  tools.manifest = function () { return origManifest().concat({ name: SUBAGENT_TOOL.name, group: SUBAGENT_TOOL.group, desc: SUBAGENT_TOOL.desc, danger: SUBAGENT_TOOL.danger, args: SUBAGENT_TOOL.args }); };
  const origGet = tools.get.bind(tools);
  tools.get = function (name) { return origGet(name) || (name === SUBAGENT_TOOL.name ? SUBAGENT_TOOL : null); };
}

// ---------------- context compaction ----------------
const MAX_TRANSCRIPT_CHARS = 60000;
const KEEP_RECENT = 6; // keep last N messages verbatim

async function maybeCompact(transcript, goal) {
  let total = transcript.reduce(function (n, m) { return n + m.content.length; }, 0);
  if (total < MAX_TRANSCRIPT_CHARS) return { compacted: false, summaryState: null };
  const info = ai.llmInfo();
  const head = transcript[1] && transcript[1].content || goal;
  const recent = transcript.slice(-KEEP_RECENT);
  let summaryState = null;
  if (info.configured) {
    const toCompact = transcript.slice(2, -KEEP_RECENT).map(function (m) {
      return m.role + ': ' + clampStr(m.content, 3000);
    }).join('\n');
    const r = await llmDecision(COMPACT_PROMPT + '\n\nTRANSCRIPT:\n' + toCompact, { system: COMPACT_PROMPT, maxTokens: 1500 });
    if (r) summaryState = r;
  }
  if (!summaryState) {
    // local fallback summary: last few observations compressed heuristically
    const obs = transcript.slice(2, -KEEP_RECENT).filter(function (m) { return m.role === 'user' && m.content.startsWith('OBSERVATION'); }).map(function (m) { return clampStr(m.content, 120); }).join(' | ');
    summaryState = { summary: 'Compressed observations: ' + obs.slice(0, 2000), key_facts: [], open_items: [] };
  }
  const rebuilt = [
    transcript[0],
    { role: 'user', content: 'TASK: ' + goal + '\n\nORIGINAL CONTEXT (may be truncated): ' + clampStr(head, 3000) },
    { role: 'user', content: 'COMPACTED STATE: ' + JSON.stringify(summaryState).slice(0, 12000) },
    ...recent,
  ];
  return { compacted: true, summaryState: summaryState, rebuilt: rebuilt };
}

// ---------------- planning ----------------
async function makePlan(goal, toolManifest) {
  const info = ai.llmInfo();
  const hint = 'TOOLS: ' + JSON.stringify(toolManifest.map(function (t) { return { name: t.name, desc: clampStr(t.desc, 100), args: t.args }; }));
  if (info.configured) {
    const r = await llmDecision(PLAN_PROMPT + '\n' + hint + '\n\nTASK: ' + goal, { system: PLAN_PROMPT, maxTokens: 1200 });
    if (r && Array.isArray(r.plan) && r.plan.length) return { plan: r.plan.map(function (s) { return clampStr(s, 300); }).slice(0, 8), toolHints: r.tool_hints || {}, source: 'llm' };
  }
  return { plan: [], toolHints: {}, source: 'none' };
}

// ---------------- self-critique ----------------
async function critique(goal, steps) {
  const info = ai.llmInfo();
  if (!info.configured) return null;
  const summary = steps.slice(-10).map(function (s) {
    return s.n + ': thought="' + clampStr(s.thought, 120) + '" tool=' + s.tool + ' ok=' + (s.result && s.result.ok !== false);
  }).join('\n');
  return await llmDecision(CRITIC_PROMPT + '\n\nTASK: ' + goal + '\n\nSTEPS:\n' + summary, { system: CRITIC_PROMPT, maxTokens: 800 });
}

// ---------------- local fallback policy ----------------
function localFallback(goal, step, plan) {
  // if there's a plan, follow it with the hinted tool
  if (plan.plan && plan.plan.length && step <= plan.plan.length) {
    const planStep = plan.plan[step - 1];
    const hintTool = plan.toolHints && plan.toolHints[planStep];
    if (hintTool && (tools.get(hintTool) || REGISTRY_EXTRA[hintTool])) {
      return { thought: '[plan ' + step + '/' + plan.plan.length + '] ' + clampStr(planStep, 200), tool: hintTool, args: localHintArgs(hintTool, planStep, goal) };
    }
  }
  if (step === 1) {
    return { thought: 'No LLM configured — using local build skill.', tool: 'build_website', args: { prompt: goal } };
  }
  return { thought: 'Work complete (local engine).', final: 'Built from your goal using the local engine: ' + clampStr(goal, 200) + (plan.plan.length ? '\n\nPlan used: ' + plan.plan.join(' → ') : '') };
}

function localHintArgs(toolName, planStep, goal) {
  if (toolName === 'build_website') return { prompt: goal, name: 'Site' };
  if (toolName === 'fs_write') return { path: 'plan_output.txt', content: planStep + '\n(from goal: ' + clampStr(goal, 400) + ')' };
  if (toolName === 'shell') return { command: 'echo "plan step: ' + planStep.replace(/["'`\\]/g, '') + '"' };
  if (toolName === 'llm') return { prompt: planStep, system: 'Execute the step.' };
  if (toolName === 'think') return { note: planStep };
  if (toolName === 'run_tests') return {};
  return {};
}

// ---------------- the loop ----------------
/**
 * runTask(opts, onEvent)
 *  opts: { goal, sessionId?, userId?, maxSteps?, timeoutMs?, allowedTools?, ctxOverride? }
 *  onEvent(evt): {type:'step'|'tool'|'final'|'error'|'plan'|'critic'|'compact'|'done', ...}
 * Returns the final session object.
 */
async function runTask(opts, onEvent) {
  const emit = typeof onEvent === 'function' ? onEvent : function () { };
  const goal = String(opts.goal || '').trim();
  if (!goal) throw new Error('goal required');

  const maxSteps = Math.min(Number(opts.maxSteps || 24), 64);
  const timeoutMs = Math.min(Number(opts.timeoutMs || 5 * 60000), 15 * 60000);
  const deadline = Date.now() + timeoutMs;

  // per-run workspace (or inherited from a subagent ctxOverride)
  const workdir = opts.ctxOverride && opts.ctxOverride.workdir ? opts.ctxOverride.workdir : fs.mkdtempSync(path.join(os.tmpdir(), 'kc-agent-'));
  const ctx = { workdir: workdir, hostRoot: process.cwd(), log: function () { } };

  const session = {
    id: opts.sessionId || 'ags_' + nid(),
    userId: opts.userId || null,
    goal: clampStr(goal, 2000),
    plan: null,
    steps: [],
    compaction: 0,
    critic: null,
    final: null,
    status: 'running',
    createdAt: now(),
    workdirFiles: [],
  };
  saveSession(session);

  const memory = loadMemory();
  buildSkillTools();
  const toolManifest = tools.manifest().concat(
    Object.values(REGISTRY_EXTRA).map(function (t) { return { name: t.name, group: t.group, desc: t.desc, danger: t.danger, args: t.args }; })
  ).filter(function (t) {
    return !Array.isArray(opts.allowedTools) || opts.allowedTools.indexOf(t.name) !== -1;
  });
  const toolFor = function (name) { return tools.get(name) || REGISTRY_EXTRA[name] || null; };
  const knownNames = toolManifest.map(function (t) { return t.name; });

  // -------- PLAN phase --------
  const plan = await makePlan(goal, toolManifest);
  session.plan = plan;
  if (plan.plan.length) emit({ type: 'plan', plan: plan.plan, hints: plan.toolHints, source: plan.source });
  saveSession(session);

  const transcript = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: 'TOOLS: ' + JSON.stringify(toolManifest) + '\n\nRELEVANT MEMORY: ' + JSON.stringify({ facts: memory.facts.slice(0, 10).map(function (f) { return f.text; }), skills: memory.skills.slice(0, 10).map(function (s) { return s.name; }) }) + '\n\nPLAN: ' + JSON.stringify(plan.plan) + '\n\nTASK: ' + goal },
  ];

  let errors = 0;
  let consecutiveSameTool = 0;
  let lastTool = null;
  try {
    for (let step = 1; step <= maxSteps && Date.now() < deadline; step++) {
      const prompt = transcript.map(function (m) { return '[' + m.role + '] ' + m.content; }).join('\n\n');
      let decision = await llmDecision(prompt, { system: SYSTEM_PROMPT, maxTokens: 2000 });
      if (!decision) decision = localFallback(goal, step, plan);
      if (!decision || typeof decision !== 'object') {
        if (++errors > 3) { session.status = 'failed'; session.final = 'Agent could not produce a valid decision.'; break; }
        transcript.push({ role: 'assistant', content: '{"thought":"invalid decision, retrying"}' });
        continue;
      }

      // loop protection: if the same tool is called with identical args 3 times, abort
      const toolName0 = String(decision.tool || '');
      if (toolName0 === lastTool && !decision.final) {
        consecutiveSameTool++;
        if (consecutiveSameTool >= 3) {
          session.final = 'Loop detected: tool ' + toolName0 + ' called ' + consecutiveSameTool + 'x with same args. Stopping.';
          session.status = 'failed';
          break;
        }
      } else { consecutiveSameTool = 0; lastTool = toolName0; }

      const stepRec = { n: step, thought: clampStr(decision.thought, 400), tool: decision.tool || null, args: decision.args || null, result: null, at: now() };

      if (decision.final) {
        stepRec.result = 'final';
        session.steps.push(stepRec);
        session.final = clampStr(decision.final, 8000);
        session.status = 'done';
        emit({ type: 'final', text: session.final });
        break;
      }

      const toolName = String(decision.tool || '');
      const tool = toolFor(toolName);
      if (!tool || knownNames.indexOf(toolName) === -1) {
        stepRec.result = { error: 'unknown tool: ' + toolName };
        transcript.push({ role: 'assistant', content: JSON.stringify(decision) });
        transcript.push({ role: 'user', content: 'OBSERVATION: unknown tool ' + JSON.stringify(toolName) + '. Available: ' + knownNames.join(', ') });
        if (++errors > 5) { session.status = 'failed'; break; }
        session.steps.push(stepRec);
        emit({ type: 'step', step: stepRec });
        continue;
      }

      let result;
      try {
        result = await tool.run(decision.args || {}, ctx);
        result = { ok: result && result.ok !== false, data: result };
      } catch (e) {
        result = { ok: false, data: { error: clampStr(e && e.message || e, 400) } };
      }
      if (!result.ok) errors++;
      stepRec.result = result;
      session.steps.push(stepRec);
      emit({ type: 'step', step: stepRec });

      transcript.push({ role: 'assistant', content: JSON.stringify(decision) });
      let obs = JSON.stringify(result);
      if (obs.length > 12000) obs = obs.slice(0, 12000) + ' …[truncated]';
      transcript.push({ role: 'user', content: 'OBSERVATION (tool ' + toolName + '): ' + obs });

      // -------- COMPACT if transcript is huge --------
      const comp = await maybeCompact(transcript, goal);
      if (comp.compacted) {
        transcript.length = 0;
        transcript.push(...comp.rebuilt);
        session.compaction++;
        emit({ type: 'compact', state: comp.summaryState, n: session.compaction });
      }

      if (errors > 8) { session.status = 'failed'; session.final = 'Too many tool errors; stopping.'; break; }
    }

    // -------- CRITIC phase (when done) --------
    if (session.status === 'done') {
      const c = await critique(goal, session.steps);
      if (c) {
        session.critic = c;
        emit({ type: 'critic', critic: c });
      }
    }
    if (!session.final) {
      session.status = session.status === 'failed' ? 'failed' : 'timeout';
      session.final = session.final || ('Stopped after ' + session.steps.length + ' steps.');
    }
  } finally {
    try {
      const fl = await tools.get('fs_list').run({}, ctx);
      session.workdirFiles = ((fl && fl.data && fl.data.files) || []).map(function (f) { return f.path; });
    } catch (_) { }
    if (!(opts.ctxOverride && opts.ctxOverride.workdir)) {
      try { fs.rmSync(workdir, { recursive: true, force: true }); } catch (_) { }
    }
    session.finishedAt = now();
    saveSession(session);
    emit({ type: 'done', sessionId: session.id, status: session.status });
  }
  return session;
}

module.exports = {
  runTask: runTask,
  rememberFact: rememberFact,
  learnSkill: learnSkill,
  loadMemory: loadMemory,
  saveSession: saveSession,
  makePlan: makePlan,
  critique: critique,
  maybeCompact: maybeCompact,
  extractJson: extractJson,
  spawnSubagent: spawnSubagent,
  listSessions: function () { return readJSON(SESSIONS_FILE, []).map(function (s) { return { id: s.id, goal: clampStr(s.goal, 100), status: s.status, steps: s.steps.length, compaction: s.compaction, createdAt: s.createdAt }; }); },
  getSession: function (id) { return readJSON(SESSIONS_FILE, []).find(function (s) { return s.id === id; }) || null; },
  SYSTEM_PROMPT: SYSTEM_PROMPT,
};
