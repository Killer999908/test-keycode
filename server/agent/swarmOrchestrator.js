// ============================================================
// KEYCODE Agent Runtime — Parallel Multi-Agent Orchestrator
// ============================================================
// Thread-swarm style fan-out: a planner decomposes the objective
// into subtasks, N worker agents run them CONCURRENTLY (each with
// its own sandbox, context window, and tool subset), and a
// synthesizer merges the results into the final deliverable.

import crypto from 'crypto';
import { swarmRun } from '../services/agentRouterService.js';
import { runReActOnce } from './reactEngine.js';
import { createWorkspace, destroyWorkspace } from './sandbox.js';
import { dispatchTool } from './toolDispatch.js';

const SWARM_SIZE_CAP = 6;

/**
 * planSwarm — decompose the objective into worker charters.
 * Falls back to a single-task swarm when the planner fails.
 */
async function planSwarm(objective, { workers = 4, preferRouters = [] } = {}) {
  const planPrompt = `Decompose this objective into exactly ${workers} independent subtasks for parallel specialist agents.

OBJECTIVE: ${objective}

Return ONLY a JSON array (no markdown):
[{"id":"w1","charter":"precise self-contained instruction for worker 1","tools":["repo_search","code_run"]}, ...]

Rules: each charter must be executable WITHOUT knowledge of the others; order workers from most critical to least; tools are optional per worker.`;
  const routed = await swarmRun(planPrompt, { prefer: preferRouters, maxTokens: 1200, timeoutMs: 60000 });
  if (routed.ok) {
    try {
      const cleaned = routed.text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
      const start = cleaned.indexOf('['); const end = cleaned.lastIndexOf(']');
      const arr = JSON.parse(cleaned.slice(start, end + 1));
      if (Array.isArray(arr) && arr.length) {
        return arr.slice(0, SWARM_SIZE_CAP).map((w, i) => ({
          id: w.id || ('w' + (i + 1)),
          charter: String(w.charter || objective),
          tools: Array.isArray(w.tools) ? w.tools : null,
        }));
      }
    } catch { /* fall through */ }
  }
  // deterministic fallback: split the objective into research/build/review slices
  return [
    { id: 'w1', charter: 'Research and analyze: ' + objective, tools: ['repo_tree', 'repo_search', 'fetch.fetch_url'] },
    { id: 'w2', charter: 'Design the solution architecture for: ' + objective },
    { id: 'w3', charter: 'Identify risks, edge cases, and open questions for: ' + objective },
  ];
}

/**
 * runWorker — one swarm thread. Uses the full ReAct engine with its
 * own sandbox, or a plain router call when tools aren't needed.
 */
async function runWorker(worker, objective, { preferRouters = [], ioBuffers = new Map() } = {}) {
  const t0 = Date.now();
  const toolSubset = worker.tools;
  try {
    const { final, trace } = await runReActOnce({
      task: worker.charter,
      facts: [`You are worker ${worker.id} in a parallel swarm. Parent objective: ${objective}. Work ONLY on your charter; other workers cover the rest.`],
      maxSteps: 6,
      tokenBudget: 4000,
      preferRouters,
      permissions: ['*'],
      memoryQuery: worker.charter,
    });
    return {
      id: worker.id,
      ok: !!final?.answer,
      answer: final?.answer || (final?.exhausted ? 'step budget exhausted' : 'no answer'),
      stepsUsed: final?.stepsUsed || trace.filter((t) => t.type === 'step').length,
      durationMs: Date.now() - t0,
      toolsUsed: [...new Set(trace.filter((t) => t.type === 'tool').map((t) => t.tool))],
    };
  } catch (e) {
    return { id: worker.id, ok: false, answer: 'worker crashed: ' + e.message, durationMs: Date.now() - t0, stepsUsed: 0, toolsUsed: [] };
  }
}

/**
 * runSwarm — plan → parallel fan-out → synthesize.
 * @returns async generator of orchestrator events.
 */
export async function* runSwarm({ objective, workers = 4, preferRouters = [], runId = null }) {
  runId = runId || ('swarm_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'));
  const capped = Math.min(Math.max(2, workers), SWARM_SIZE_CAP);
  yield { type: 'start', runId, objective, requestedWorkers: capped };

  // ── Phase 1: plan ──
  yield { type: 'phase', phase: 'planning' };
  const plan = await planSwarm(objective, { workers: capped, preferRouters });
  yield { type: 'plan', plan };

  // ── Phase 2: parallel fan-out (thread swarm) ──
  yield { type: 'phase', phase: 'fanout', workers: plan.length };
  const settled = await Promise.allSettled(plan.map((w) => runWorker(w, objective, { preferRouters })));
  const results = settled.map((s, i) => (s.status === 'fulfilled' ? s.value : { id: plan[i].id, ok: false, answer: 'rejected: ' + s.reason, durationMs: 0, stepsUsed: 0, toolsUsed: [] }));
  for (const r of results) yield { type: 'worker_done', ...r };

  // ── Phase 3: synthesize ──
  yield { type: 'phase', phase: 'synthesizing' };
  const contributions = results.map((r) => `--- ${r.id} (${r.ok ? 'ok' : 'FAILED'}, ${r.stepsUsed} steps) ---\n${String(r.answer).slice(0, 2500)}`).join('\n\n');
  const synthPrompt = `You are the swarm synthesizer. Merge these parallel worker reports into ONE deliverable for the objective. Resolve conflicts, deduplicate, and produce the complete answer.

OBJECTIVE: ${objective}

WORKER REPORTS:
${contributions}

Return the final deliverable as plain text/markdown.`;
  const synth = await swarmRun(synthPrompt, { prefer: preferRouters, maxTokens: 3000, timeoutMs: 120000 });

  const done = {
    type: 'done',
    runId,
    ok: synth.ok,
    answer: synth.ok ? synth.text : 'synthesis failed: ' + JSON.stringify(synth.attempts?.slice(-2)),
    router: synth.router,
    plan,
    workers: results,
    stats: {
      workers: results.length,
      workersOk: results.filter((r) => r.ok).length,
      totalToolCalls: results.reduce((a, r) => a + (r.toolsUsed?.length || 0), 0),
      totalDurationMs: Math.max(...results.map((r) => r.durationMs), 0),
    },
  };
  yield done;
}

/** Non-generator convenience wrapper. */
export async function runSwarmOnce(options) {
  let done = null;
  const trace = [];
  for await (const evt of runSwarm(options)) { trace.push(evt); if (evt.type === 'done') done = evt; }
  return { done, trace };
}
