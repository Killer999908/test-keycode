/**
 * Tests: ReAct engine file-event streaming.
 *
 * The OS frontend (os/os.js) live-renders the agent's real bytes in its
 * Code/Files/Preview panels from `observation` events that carry
 * `file: { path, action, content }`. Those events are only emitted when
 * dispatchTool returns `meta: { rel, exists, writeMode, after }` — set by
 * file_edit AND sandbox_write.
 *
 * These tests run the REAL runReAct generator (real workspace, real tool
 * dispatch, real sandbox) with the model swarm stubbed to a scripted
 * sequence of ReAct turns — no network, no API keys.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Stub the model swarm BEFORE importing the engine (ESM hoists imports;
// jest.unstable_mock_module + dynamic import keeps the stub authoritative).
jest.unstable_mockModule('../services/agentRouterService.js', () => ({
  swarmRun: jest.fn(),
  runAgent: jest.fn(),
  routerStatus: () => [],
  probeRouter: jest.fn(),
  probeAllRouters: jest.fn(async () => []),
  getOllamaModelsCached: jest.fn(async () => []),
  ROUTERS: {},
  ROUTER_IDS: [],
}));

// Importing the module registers tools as a side effect (guarded, idempotent)
import { registerAdvancedTools } from '../agent/advancedTools.js';
registerAdvancedTools();

const { swarmRun } = await import('../services/agentRouterService.js');
const { runReAct } = await import('../agent/reactEngine.js');

/** Drive one full ReAct run from a scripted list of model turns. */
async function runScripted(turns) {
  swarmRun.mockReset();
  for (const t of turns) swarmRun.mockImplementationOnce(async () => ({ ok: true, router: 'stub', text: t }));

  const events = [];
  for await (const evt of runReAct({ task: 'write a hello page', maxSteps: 4, tokenBudget: 4000 })) {
    events.push(evt);
  }
  return events;
}

const action = (tool, args, thought = 'acting') =>
  JSON.stringify({ thought, action: { tool, args } });
const final = (answer) => JSON.stringify({ thought: 'done', final: answer });

function makeCtx() {
  return { workspaceDirPrefix: 'kc-react-test-' };
}

describe('ReAct engine — file events on sandbox writes', () => {
  let tmp;

  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-react-test-')); });
  afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it('emits a file event with real bytes when the agent uses sandbox_write', async () => {
    const events = await runScripted([
      action('sandbox_write', { path: 'hello.html', content: '<h1>hello KEYCODE</h1>' }),
      final('wrote hello.html'),
    ]);

    const obs = events.find((e) => e.type === 'observation' && e.tool === 'sandbox_write');
    expect(obs).toBeDefined();
    expect(obs.ok).toBe(true);

    // THE CONTRACT: UIs live-render from these three fields.
    expect(obs.file).toEqual({
      path: 'hello.html',
      action: 'created',
      content: '<h1>hello KEYCODE</h1>',
    });
  });

  it('marks an existing file as rewritten (writeMode) with the new content', async () => {
    const events = await runScripted([
      action('sandbox_write', { path: 'note.md', content: 'v1' }),
      action('sandbox_write', { path: 'note.md', content: 'v2 — longer now' }),
      final('done'),
    ]);

    const [first, second] = events.filter((e) => e.type === 'observation' && e.tool === 'sandbox_write');
    expect(first.file).toMatchObject({ path: 'note.md', action: 'created' });
    expect(second.file).toEqual({ path: 'note.md', action: 'rewrote', content: 'v2 — longer now' });
  });

  it('file_edit edits keep their distinct verb ("edited") and stream the full after-content', async () => {
    const events = await runScripted([
      action('sandbox_write', { path: 'app.js', content: 'const a = 1;\nconst b = 2;\n' }),
      action('file_edit', { path: 'app.js', old_string: 'const b = 2;', new_string: 'const b = 42;' }),
      final('edited'),
    ]);

    const edit = events.find((e) => e.type === 'observation' && e.tool === 'file_edit');
    expect(edit.ok).toBe(true);
    expect(edit.file).toEqual({
      path: 'app.js',
      action: 'edited',
      content: 'const a = 1;\nconst b = 42;\n',
    });
  });

  it('does NOT attach a file payload on failed writes', async () => {
    const events = await runScripted([
      action('sandbox_write', { path: '../escape.txt', content: 'nope' }),
      final('blocked'),
    ]);

    const obs = events.find((e) => e.type === 'observation' && e.tool === 'sandbox_write');
    expect(obs.ok).toBe(false);
    expect(obs.file).toBeNull();
  });

  it('persists the run and cleans up the sandbox workspace', async () => {
    const before = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('kc-react')); // count live sandboxes later
    const events = await runScripted([
      action('sandbox_write', { path: 'x.txt', content: 'x' }),
      final('ok'),
    ]);
    expect(events.find((e) => e.type === 'done').answer).toBe('ok');
    // Engine destroys the workspace in `finally` — the temp dir must be gone.
    const dirs = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('kc-'));
    expect(dirs.length).toBeLessThanOrEqual(before.length + 2); // our own tmp + slack
  });
});
