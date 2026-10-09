'use strict';
// ============================================================
//  AGENT CORE — lib/agent-core.js
//  A ReAct (Reason + Act) agent loop with:
//   · tool use over lib/agent-tools.js (shell, fs, web, LLM, code, build skills)
//   · persistent memory (data/agent-memory.json: facts, projects, skills learned)
//   · session transcripts (data/agent-sessions.json)
//   · skill library (reusable prompts saved by the agent itself)
//   · self-critique + plan/verify/repair cycle
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

// ---------------- memory ----------------
function loadMemory() {
  return readJSON(MEMORY_FILE, { facts: [], skills: [], projects: [], updatedAt: null });
}
function saveMemory(m) { m.updatedAt = now(); writeJSON(MEMORY_FILE, m); }

function rememberFact(text) {
  const m = loadMemory();
  const t = String(text || '').slice(0, 500);
  if (!t) return false;
  if (m.facts.some(function (f) { return f.text === t; })) return false;
  m.facts.unshift({ id: 'fac_' + nid(), text: t, at: now() });
  m.facts = m.facts.slice(0, 500);
  saveMemory(m);
  return true;
}

function learnSkill(name, prompt, notes) {
  const m = loadMemory();
  const skill = { id: 'skl_' + nid(), name: String(name || 'skill').slice(0, 80), prompt: String(prompt || '').slice(0, 4000), notes: String(notes || '').slice(0, 2000), at: now() };
  m.skills.unshift(skill);
  m.skills = m.skills.slice(0, 200);
  saveMemory(m);
  return skill;
}

// ---------------- skills library ----------------
// Skills are named prompt templates saved in memory. When a run starts,
// each skill is exposed to the agent as a callable tool `skill_<name>`
// that expands the template with args and calls the LLM.
function skillToolName(name) {
  return 'skill_' + String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function buildSkillTools() {
  const m = loadMemory();
  return m.skills.map(function (s) {
    const toolName = skillToolName(s.name);
    if (REGISTRY_EXTRA[toolName]) return null;
    const tmpl = String(s.prompt || '');
    const tool = {
      name: toolName, group: 'skill', danger: false,
      desc: 'Learned skill "' + s.name + '": ' + String(s.notes || tmpl).slice(0, 120),
      args: { input: 'string' },
      run: async function (a) {
        const filled = tmpl.replace(/\{\{\s*input\s*\}\}/g, String(a.input || ''));
        const r = await ai.llmComplete(filled, { system: 'You are KEYCODE Agent executing a learned skill. Produce the requested output only.', maxTokens: 8000 });
        if (!r) return { ok: false, error: 'no LLM configured or call failed' };
        return { ok: true, skill: s.name, text: r.text.slice(0, 20000) };
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

function extractJson(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch (_) { }
  const starts = [t.indexOf('{'), t.indexOf('[')].filter(function (i) { return i !== -1; });
  for (const start of starts) {
    const open = t[start], close = open === '{' ? '}' : ']';
    const end = t.lastIndexOf(close);
    if (end > start) { try { return JSON.parse(t.slice(start, end + 1)); } catch (_) { } }
  }
  return null;
}

// ---------------- context compaction ----------------
// Observations dominate the transcript. Once it passes CONTEXT_LIMIT chars,
// summarize older steps into a digest and keep only the most recent
// RECENT_STEPS act/observation pairs verbatim.
const CONTEXT_LIMIT = 120000;
const RECENT_STEPS = 4;

function compactTranscript(transcript) {
  const total = transcript.reduce(function (n, m) { return n + m.content.length; }, 0);
  if (total < CONTEXT_LIMIT) return false;
  const head = transcript.slice(0, 2);
  const body = transcript.slice(2);
  const keep = RECENT_STEPS * 2;
  const older = body.slice(0, Math.max(0, body.length - keep));
  const recent = body.slice(body.length - keep);
  if (!older.length) return false;
  const digest = older.map(function (m) {
    if (m.role === 'assistant') {
      const d = extractJson(m.content);
      return d && d.tool ? '- ACT: ' + d.tool + ' ' + JSON.stringify(d.args || {}).slice(0, 300) : '- invalid assistant reply';
    }
    return '- OBS: ' + m.content.replace(/^OBSERVATION \(tool [^)]+\): /, '').slice(0, 500);
  }).join('\n').slice(0, 40000);
  head[1] = { role: 'user', content: head[1].content + '\n\nCOMPACTED HISTORY (earlier steps summarized — details lost, trust these digests):\n' + digest };
  transcript.length = 0;
  transcript.push(head[0], head[1]);
  for (const m of recent) transcript.push(m);
  return true;
}

// ---------------- self-critique / verify / repair ----------------
// After a plan/act phase, ask the LLM to critique its own work. If the
// critique finds issues, they are fed back as a repair instruction.
async function selfCritique(goal, steps, toolFor) {
  const info = ai.llmInfo();
  if (!info.configured) return null;
  const summary = steps.slice(-10).map(function (s) {
    return 'step ' + s.n + ' tool=' + s.tool + ' ok=' + (s.result && s.result.ok !== undefined ? s.result.ok : '?') + ' args=' + JSON.stringify(s.args || {}).slice(0, 200);
  }).join('\n');
  const r = await ai.llmComplete(
    'TASK: ' + goal + '\n\nSTEPS TAKEN:\n' + summary + '\n\nCritique the work: is the task complete and correct? Respond with ONLY JSON: {"complete":true|false,"issues":["..."],"repair":"next tool call {tool, args} if incomplete"}. Never invent tool results.',
    { system: 'You are KEYCODE Agent in self-verification mode. Be strict but fair.', maxTokens: 1000, temperature: 0.1, timeoutMs: 30000 }
  );
  const c = r && extractJson(r.text);
  if (!c || typeof c !== 'object') return null;
  return { complete: c.complete === true, issues: Array.isArray(c.issues) ? c.issues.slice(0, 5) : [], repair: c.repair || null };
}


// ---------------- subagents ----------------
// registerSubagent(name, desc) exposes a tool that runs a delegated runTask
// with its own budget and workspace; results return as a summary to the parent.
const SUBAGENTS = [];
function registerSubagent(name, desc) {
  const toolName = 'subagent_' + String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
  if (SUBAGENTS.find(function (s) { return s.name === toolName; })) return SUBAGENTS.find(function (s) { return s.name === toolName; });
  const tool = {
    name: toolName, group: 'subagent', danger: false,
    desc: 'Delegated subagent: ' + String(desc || name).slice(0, 160),
    args: { goal: 'string', maxSteps: 'number?' },
    run: async function (a, ctx) {
      const sub = await runTask({ goal: String(a.goal || ''), maxSteps: Math.min(Number(a.maxSteps || 8), 16), timeoutMs: 180000, userId: ctx && ctx.userId || null }, function () { });
      return {
        ok: sub.status === 'done',
        summary: String(sub.final || '').slice(0, 4000),
        subSessionId: sub.id,
        status: sub.status,
        stepsUsed: sub.steps.length,
      };
    },
  };
  SUBAGENTS.push(tool);
  return tool;
}
// Default subagents available out of the box
registerSubagent('researcher', 'Searches the web and returns findings for a goal.');
registerSubagent('builder', 'Builds a website or code artifact from a prompt.');
registerSubagent('tester', 'Runs tests / verification steps for a goal.');

// ---------------- the loop ----------------
/**
 * runTask(opts, onEvent)
 *  opts: { goal, sessionId?, userId?, maxSteps?, timeoutMs?, allowedTools? }
 *  onEvent(evt): {type:'step'|'tool'|'final'|'error'|'done', ...}
 * Returns the final session object.
 */
async function runTask(opts, onEvent) {
  const emit = typeof onEvent === 'function' ? onEvent : function () { };
  const goal = String(opts.goal || '').trim();
  if (!goal) throw new Error('goal required');

  const maxSteps = Math.min(Number(opts.maxSteps || 24), 64);
  const timeoutMs = Math.min(Number(opts.timeoutMs || 5 * 60000), 15 * 60000);
  const deadline = Date.now() + timeoutMs;

  // per-run workspace
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-agent-'));
  const ctx = { workdir: workdir, hostRoot: process.cwd(), log: function () { } };

  const session = {
    id: opts.sessionId || 'ags_' + nid(),
    userId: opts.userId || null,
    goal: goal.slice(0, 2000),
    steps: [],
    final: null,
    status: 'running',
    createdAt: now(),
    workdirFiles: [],
  };
  saveSession(session);

  const memory = loadMemory();
  buildSkillTools();
  const toolManifest = tools.manifest().concat(
    SUBAGENTS.map(function (t) { return { name: t.name, group: t.group, desc: t.desc, danger: t.danger, args: t.args }; }),
    Object.values(REGISTRY_EXTRA).map(function (t) { return { name: t.name, group: t.group, desc: t.desc, danger: t.danger, args: t.args }; })
  ).filter(function (t) {
    return !Array.isArray(opts.allowedTools) || opts.allowedTools.indexOf(t.name) !== -1;
  });
  const toolFor = function (name) { return tools.get(name) || REGISTRY_EXTRA[name] || null; };

  const transcript = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: 'TOOLS: ' + JSON.stringify(toolManifest) + '\n\nRELEVANT MEMORY: ' + JSON.stringify({ facts: memory.facts.slice(0, 10).map(function (f) { return f.text; }), skills: memory.skills.slice(0, 10).map(function (s) { return s.name; }) }) + '\n\nTASK: ' + goal },
  ];

  let errors = 0;
  try {
    for (let step = 1; step <= maxSteps && Date.now() < deadline; step++) {
      const info = ai.llmInfo();
      compactTranscript(transcript);
      const prompt = transcript.map(function (m) { return '[' + m.role + '] ' + m.content; }).join('\n\n');
      let decision = null;
      if (info.configured) {
        const r = await ai.llmComplete(prompt, { system: SYSTEM_PROMPT, maxTokens: 2000, temperature: 0.2, timeoutMs: 30000 });
        if (r) decision = extractJson(r.text);
      }
      if (!decision) {
        // Local fallback policy: build the goal directly, then finish.
        decision = step === 1
          ? { thought: 'No LLM configured — using local build skill.', tool: 'build_website', args: { prompt: goal } }
          : { thought: 'Work complete (local engine).', final: 'Built from your goal using the local engine: ' + goal.slice(0, 200) };
      }
      if (!decision || typeof decision !== 'object') {
        if (++errors > 3) { session.status = 'failed'; session.final = 'Agent could not produce a valid decision.'; break; }
        transcript.push({ role: 'assistant', content: '{"thought":"invalid decision, retrying"}' });
        continue;
      }

      const stepRec = { n: step, thought: String(decision.thought || '').slice(0, 400), tool: decision.tool || null, args: decision.args || null, result: null, at: now() };

      if (decision.final) {
        // Verify before finishing: critique the work; if incomplete, repair instead.
        const critique = await selfCritique(goal, session.steps, toolFor);
        if (critique && !critique.complete) {
          transcript.push({ role: 'assistant', content: JSON.stringify({ thought: decision.thought || '', final: decision.final }) });
          transcript.push({ role: 'user', content: 'VERIFIER: work is NOT complete. Issues: ' + JSON.stringify(critique.issues) + (critique.repair ? ' Repair instruction: ' + critique.repair : '') + '. Continue with the next tool call.' });
          continue;
        }
        stepRec.result = 'final';
        session.steps.push(stepRec);
        session.final = String(decision.final).slice(0, 8000);
        session.status = 'done';
        emit({ type: 'final', text: session.final });
        break;
      }

      // Support both {"tool":..., "args":...} and {"tools":[{tool,args},...]} (parallel calls)
      const calls = Array.isArray(decision.tools) && decision.tools.length
        ? decision.tools.slice(0, 5)
        : [{ tool: decision.tool, args: decision.args }];

      const runOne = async function (call) {
        const toolName = String((call && call.tool) || '');
        const tool = toolFor(toolName);
        if (!tool || toolManifest.every(function (t) { return t.name !== toolName; })) {
          return { ok: false, data: { error: 'unknown tool: ' + toolName + '. Available: ' + toolManifest.map(function (t) { return t.name; }).join(', ') } };
        }
        try {
          const r = await tool.run((call && call.args) || {}, ctx);
          return { ok: r && r.ok !== false, data: r };
        } catch (e) {
          return { ok: false, data: { error: String(e && e.message || e) } };
        }
      };

      let results;
      if (calls.length === 1) {
        results = [await runOne(calls[0])];
      } else {
        // Parallel execution: Promise.allSettled so one failure can't kill siblings
        const settled = await Promise.allSettled(calls.map(runOne));
        results = settled.map(function (s) {
          return s.status === 'fulfilled' ? s.value : { ok: false, data: { error: String(s.reason && s.reason.message || s.reason) } };
        });
      }
      for (const r of results) { if (!r.ok) errors++; }
      stepRec.result = results.length === 1 ? results[0] : results;
      session.steps.push(stepRec);
      emit({ type: 'step', step: stepRec });

      transcript.push({ role: 'assistant', content: JSON.stringify(decision) });
      const obsText = calls.length === 1
        ? 'OBSERVATION (tool ' + String(calls[0].tool) + '): ' + JSON.stringify(results[0]).slice(0, 12000)
        : 'OBSERVATIONS (parallel ' + calls.length + '): ' + results.map(function (r, i) { return '[' + calls[i].tool + '] ' + JSON.stringify(r).slice(0, 6000); }).join(' | ');
      transcript.push({ role: 'user', content: obsText.slice(0, 24000) });
      if (errors > 8) { session.status = 'failed'; session.final = 'Too many tool errors; stopping.'; break; }
    }
    if (!session.final) {
      session.status = session.status === 'failed' ? 'failed' : 'timeout';
      session.final = session.final || ('Stopped after ' + session.steps.length + ' steps.');
    }
  } finally {
    try { session.workdirFiles = (tools.get('fs_list').run({}, ctx).data.files || []).map(function (f) { return f.path; }); } catch (_) { }
    try { fs.rmSync(workdir, { recursive: true, force: true }); } catch (_) { }
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
  listSessions: function () { return readJSON(SESSIONS_FILE, []).map(function (s) { return { id: s.id, goal: s.goal, status: s.status, steps: s.steps.length, createdAt: s.createdAt }; }); },
  getSession: function (id) { return readJSON(SESSIONS_FILE, []).find(function (s) { return s.id === id; }) || null; },
  compactTranscript: compactTranscript,
  selfCritique: selfCritique,
  SYSTEM_PROMPT: SYSTEM_PROMPT,
  registerSubagent: registerSubagent,
  SUBAGENTS: SUBAGENTS,
};
