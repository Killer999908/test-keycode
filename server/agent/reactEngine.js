// ============================================================
// KEYCODE Agent Runtime — ReAct Engine
// ============================================================
// Classic Reason + Act loop with streamed narration:
//
//   THOUGHT      — model reasons about the current state
//   ACTION       — model picks ONE tool with JSON args
//   OBSERVATION  — dispatcher executes, result is compacted in
//   … loops until FINAL ANSWER, max steps, or budget exhaustion
//
// Every run gets: an ephemeral sandbox workspace, a decoupled
// ring-buffer I/O pipe, the 5-layer context pipeline, and swarm
// routing through the 9-provider agent router.

import crypto from 'crypto';
import { swarmRun } from '../services/agentRouterService.js';
import { dispatchTool, toolCatalog } from './toolDispatch.js';
import { fitPrompt, remember, persistRun, estTokens } from './contextPipeline.js';
import { createWorkspace, destroyWorkspace, RingBuffer, reapStale } from './sandbox.js';

const DEFAULT_MAX_STEPS = 12;
const DEFAULT_TOKEN_BUDGET = 6000;

const SYSTEM_RULES = `You are KEYCODE Forge — an autonomous ReAct agent.

Respond with EXACTLY ONE of:
A) {"thought":"...","action":{"tool":"<tool name>","args":{...}}}
B) {"thought":"...","final":"your complete answer to the user"}

RULES:
- One action per turn. Wait for its OBSERVATION before deciding the next step.
- Prefer tools over guessing. If code must run, use code_run.
- When the task is complete, or you genuinely cannot proceed, emit final.
- Never invent tool results. Never loop on a failing call without changing approach.`;

function buildToolMenu(catalog) {
  return catalog.map((t) => `- ${t.name} — ${t.description}${t.args && Object.keys(t.args).length ? ' | args: ' + JSON.stringify(t.args) : ''}`).join('\n');
}

/** Parse the model's ReAct turn; tolerate markdown fences and prose. */
function parseTurn(text) {
  if (!text) return null;
  let cleaned = String(text).replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  let candidate = cleaned.slice(start, end + 1);
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let parsed = tryParse(candidate);
  if (!parsed) {
    // trailing comma tolerance
    parsed = tryParse(candidate.replace(/,(\s*[}\]])/g, '$1'));
  }
  if (!parsed) return null;
  if (parsed.final != null) return { kind: 'final', thought: parsed.thought || '', final: String(parsed.final) };
  if (parsed.action?.tool) return { kind: 'action', thought: parsed.thought || '', action: parsed.action };
  return null;
}

/**
 * runReAct — full agent run.
 * @returns async generator of events: {type: 'step'|'tool'|'token'|'done'|'error', ...}
 */
export async function* runReAct({
  task,
  facts = [],
  maxSteps = DEFAULT_MAX_STEPS,
  tokenBudget = DEFAULT_TOKEN_BUDGET,
  preferRouters = [],
  permissions = ['*'],
  memoryQuery = '',
  runId = null,
}) {
  runId = runId || ('react_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'));
  const ioBuffer = new RingBuffer(2000);
  const workspace = createWorkspace('react');
  const runCtx = {
    workspace,
    ioBuffer,
    toolCounts: {},
    toolTimeoutMs: 60000,
    grantedPermissions: permissions,
    observations: [],
    transcript: [],
  };

  const catalog = toolCatalog();
  const toolMenu = buildToolMenu(catalog);
  const events = [];

  const emit = (evt) => { events.push(evt); return evt; };

  try {
    yield emit({ type: 'start', runId, sandbox: workspace.dir, tools: catalog.length, maxSteps });

    for (let step = 1; step <= maxSteps; step++) {
      // ── 5-layer context assembly ──
      const fitted = fitPrompt({
        task,
        facts,
        systemRules: SYSTEM_RULES + '\n\nAVAILABLE TOOLS:\n' + toolMenu,
        messages: runCtx.transcript,
        observations: runCtx.observations,
        memoryQuery: memoryQuery || task,
        maxTokens: tokenBudget,
      });

      // ── THOUGHT + ACTION (one router call) ──
      const routed = await swarmRun(fitted.prompt, {
        prefer: preferRouters,
        maxTokens: 1600,
        system: 'You are a precise ReAct agent. Output ONLY the JSON object, nothing else.',
        timeoutMs: 90000,
      });
      if (!routed.ok) {
        yield emit({ type: 'error', step, message: 'all routers failed: ' + JSON.stringify(routed.attempts?.slice(-3)) });
        break;
      }
      const turn = parseTurn(routed.text);
      runCtx.transcript.push({ role: 'assistant', content: routed.text.slice(0, 4000) });

      if (!turn) {
        // Model ignored the contract — nudge once, then bail
        runCtx.transcript.push({ role: 'user', content: 'Invalid response format. Reply with {"thought":"...","final":"..."} or {"thought":"...","action":{"tool":"...","args":{...}}}' });
        yield emit({ type: 'step', step, kind: 'malformed', raw: routed.text.slice(0, 300), router: routed.router });
        if (step === maxSteps) break;
        continue;
      }

      yield emit({ type: 'step', step, kind: turn.kind, thought: turn.thought, router: routed.router });

      if (turn.kind === 'final') {
        const doneEvt = emit({ type: 'done', step, answer: turn.final, stepsUsed: step, layers: fitted.layers });
        persistRun(runId, { task, answer: turn.final, steps: step, events, at: Date.now() });
        if (turn.thought) remember('final:' + task.slice(0, 60), turn.thought.slice(0, 300), ['final']);
        yield doneEvt;
        return;
      }

      // ── OBSERVATION (dispatch) ──
      yield emit({ type: 'tool', step, tool: turn.action.tool, args: turn.action.args });
      const obs = await dispatchTool(turn.action.tool, turn.action.args, runCtx);
      runCtx.observations.push({ tool: turn.action.tool, args: turn.action.args, result: obs.result, ok: obs.ok });
      runCtx.transcript.push({ role: 'user', content: `OBSERVATION [${turn.action.tool}]: ${String(obs.result).slice(0, 1500)}` });
      yield emit({ type: 'observation', step, tool: turn.action.tool, ok: obs.ok, durationMs: obs.durationMs, result: String(obs.result).slice(0, 1200) });

      // step-budget guard inside loop (hard ceiling)
      if (step === maxSteps) {
        const last = emit({ type: 'done', step, answer: null, stepsUsed: step, exhausted: true, partial: runCtx.observations.slice(-3) });
        persistRun(runId, { task, exhausted: true, steps: step, events, at: Date.now() });
        yield last;
      }
    }
  } catch (e) {
    yield emit({ type: 'error', message: e.message });
  } finally {
    destroyWorkspace(workspace);
    reapStale();
  }
}

/** Non-generator convenience wrapper collecting the final result. */
export async function runReActOnce(options) {
  let final = null;
  const trace = [];
  for await (const evt of runReAct(options)) {
    trace.push(evt);
    if (evt.type === 'done') final = evt;
  }
  return { final, trace };
}
