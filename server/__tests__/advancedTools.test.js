/**
 * Tests for advancedTools — the coding-agent capability layer:
 * surgical file edits + checkpoints, glob/grep search, zip packaging,
 * todo tracking, and the rewind undo ladder.
 *
 * Handlers take (args, runCtx) where runCtx.workspace.dir is a real
 * temp directory, mirroring how toolDispatch invokes them.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Importing the module registers tools as a side effect (guarded, idempotent)
import { registerAdvancedTools, ADVANCED_TOOL_HINTS } from '../agent/advancedTools.js';

// Reach into the registry through dispatch — same path the ReAct engine uses
import { dispatchTool, toolCatalog } from '../agent/toolDispatch.js';

registerAdvancedTools();

function makeCtx() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-adv-test-'));
  return { workspace: { dir }, journal: [], checkpointSeq: 0, toolCounts: {}, grantedPermissions: ['*'] };
}

let ctx;
beforeEach(() => { ctx = makeCtx(); });
afterEach(() => { try { fs.rmSync(ctx.workspace.dir, { recursive: true, force: true }); } catch {} });

describe('advanced tools registration', () => {
  it('registers the new tool surface', () => {
    const names = toolCatalog().map((t) => t.name);
    for (const n of ['file_edit', 'file_list', 'file_search', 'workspace_grep', 'todo_write', 'workspace_rewind']) {
      expect(names).toContain(n);
    }
  });

  it('ships JIT hints for the model', () => {
    expect(ADVANCED_TOOL_HINTS.length).toBeGreaterThan(3);
    expect(ADVANCED_TOOL_HINTS[0]).toHaveProperty('tool');
    expect(ADVANCED_TOOL_HINTS[0]).toHaveProperty('hint');
  });
});

describe('file_edit — write mode', () => {
  it('creates a new file', async () => {
    const r = await dispatchTool('file_edit', { path: 'src/app.js', content: 'console.log(1);\n' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.result).toMatch(/^created src\/app\.js/);
    expect(fs.readFileSync(path.join(ctx.workspace.dir, 'src/app.js'), 'utf8')).toBe('console.log(1);\n');
  });

  it('blocks path traversal', async () => {
    const r = await dispatchTool('file_edit', { path: '../evil.txt', content: 'x' }, ctx);
    expect(r.ok).toBe(false);
  });
});

describe('file_edit — surgical edit mode', () => {
  const FILE = 'app.py';
  const ORIGINAL = 'def main():\n    print("hello")\n    return 0\n';

  beforeEach(async () => {
    await dispatchTool('file_edit', { path: FILE, content: ORIGINAL }, ctx);
  });

  it('replaces a unique occurrence', async () => {
    const r = await dispatchTool('file_edit', { path: FILE, old_string: 'print("hello")', new_string: 'print("goodbye")' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.result).toMatch(/^edited /);
    const after = fs.readFileSync(path.join(ctx.workspace.dir, FILE), 'utf8');
    expect(after).toContain('print("goodbye")');
    expect(after).not.toContain('print("hello")');
    // untouched lines survive
    expect(after).toContain('return 0');
  });

  it('refuses to edit a missing file', async () => {
    const r = await dispatchTool('file_edit', { path: 'nope.txt', old_string: 'a', new_string: 'b' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.result).toMatch(/does not exist/);
  });

  it('errors with a helpful hint when old_string is not found', async () => {
    const r = await dispatchTool('file_edit', { path: FILE, old_string: 'print("zzz")', new_string: 'x' }, ctx);
    expect(r.ok).toBe(false);
  });

  it('refuses ambiguous (non-unique) old_string', async () => {
    await dispatchTool('file_edit', { path: FILE, content: 'a b a b\n' }, ctx);
    const r = await dispatchTool('file_edit', { path: FILE, old_string: 'a', new_string: 'c' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.result).toMatch(/matches 2 times/);
  });
});

describe('search tools', () => {
  beforeEach(async () => {
    await dispatchTool('file_edit', { path: 'src/index.js', content: 'const x = 42;\nconsole.log(x);\n' }, ctx);
    await dispatchTool('file_edit', { path: 'docs/readme.md', content: '# Title\nsome text\n' }, ctx);
  });

  it('file_list shows structure', async () => {
    const r = await dispatchTool('file_list', {}, ctx);
    expect(r.ok).toBe(true);
    expect(r.result).toContain('src/index.js');
    expect(r.result).toContain('docs/readme.md');
  });

  it('file_search matches globs', async () => {
    const r = await dispatchTool('file_search', { pattern: '**/*.js' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.result).toContain('src/index.js');
    const r2 = await dispatchTool('file_search', { pattern: '**/*.py' }, ctx);
    expect(r2.ok).toBe(false);
  });

  it('workspace_grep finds contents with line numbers', async () => {
    const r = await dispatchTool('workspace_grep', { pattern: 'const x' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.result).toContain('src/index.js:1');
  });
});

describe('todo_write', () => {
  it('stores the checklist on runCtx', async () => {
    const r = await dispatchTool('todo_write', {
      todos: [
        { task: 'scaffold project', completed: true },
        { task: 'write tests', completed: false },
      ],
    }, ctx);
    expect(r.ok).toBe(true);
    expect(r.result).toContain('1/2 done');
    expect(ctx.todos).toHaveLength(2);
    expect(ctx.todos[0].completed).toBe(true);
  });
});

describe('workspace_rewind — undo ladder', () => {
  it('undoes the last edit', async () => {
    await dispatchTool('file_edit', { path: 'f.txt', content: 'v1\n' }, ctx);
    await dispatchTool('file_edit', { path: 'f.txt', content: 'v2\n' }, ctx);
    const r = await dispatchTool('workspace_rewind', { steps: 1 }, ctx);
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(path.join(ctx.workspace.dir, 'f.txt'), 'utf8')).toBe('v1\n');
  });

  it('removes files that were created after the checkpoint', async () => {
    await dispatchTool('file_edit', { path: 'keep.txt', content: 'kept\n' }, ctx);
    await dispatchTool('file_edit', { path: 'temp.txt', content: 'temporary\n' }, ctx);
    const r = await dispatchTool('workspace_rewind', { steps: 1 }, ctx);
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(ctx.workspace.dir, 'temp.txt'))).toBe(false);
    expect(fs.existsSync(path.join(ctx.workspace.dir, 'keep.txt'))).toBe(true);
  });

  it('undoes a surgical edit back to original', async () => {
    await dispatchTool('file_edit', { path: 'g.txt', content: 'alpha beta\n' }, ctx);
    await dispatchTool('file_edit', { path: 'g.txt', old_string: 'alpha', new_string: 'ALPHA' }, ctx);
    await dispatchTool('workspace_rewind', { steps: 1 }, ctx);
    expect(fs.readFileSync(path.join(ctx.workspace.dir, 'g.txt'), 'utf8')).toBe('alpha beta\n');
  });

  it('reports when there is nothing to rewind', async () => {
    const r = await dispatchTool('workspace_rewind', { steps: 1 }, ctx);
    expect(r.ok).toBe(false);
    expect(r.result).toMatch(/nothing to rewind/);
  });
});
