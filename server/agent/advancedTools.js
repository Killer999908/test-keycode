// ============================================================
// KEYCODE Agent Runtime — Advanced Tools
// ============================================================
// The capability layer that makes the ReAct loop feel like a real
// coding agent instead of a chatbot with a shell:
//
//   file_edit        — surgical old→new string replacement (with
//                      uniqueness enforcement + rollback journal)
//   file_list        — recursive workspace listing with size/mtime
//   file_search      — glob-style filename search (** / * / ?)
//   workspace_grep   — regex content search across workspace files
//   workspace_zip    — package deliverables into a downloadable ZIP
//   todo_write       — structured task checklist the model must keep
//                      updated (drives plan fidelity + UI checklist)
//   workspace_rewind — restore any checkpoint (undo ladder)
//   spawn_agent      — depth-limited sub-agent runs (mini ReAct)
//
// All state lives in runCtx (workspace + journal + todos), so runs
// stay isolated and cleanup stays simple.
// ─────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { registerTool } from './toolDispatch.js';
import { runReAct } from './reactEngine.js';

// Stable anchor for artifacts: <project root>/exports/agent-artifacts
// (cwd-independent — the download route resolves the same directory).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.resolve(__dirname, '..', '..', 'exports', 'agent-artifacts');

// ─────────────────────────────────────────────
// Checkpoint / journal state (per runCtx)
// ─────────────────────────────────────────────
function journalOf(runCtx) {
  if (!runCtx.journal) runCtx.journal = [];
  if (!runCtx.checkpointSeq) runCtx.checkpointSeq = 0;
  return runCtx.journal;
}

function toRel(runCtx, p) {
  const rel = String(p || '').replace(/^\/+/, '');
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) return null;
  return rel;
}

function resolveInWs(runCtx, rel) {
  const target = path.resolve(runCtx.workspace.dir, rel);
  const base = path.resolve(runCtx.workspace.dir);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

/** Snapshot a file (or its absence) before mutation — enables undo. */
function snapshot(runCtx, rel) {
  const abs = resolveInWs(runCtx, rel);
  if (!abs) return;
  let before = null;
  try {
    before = fs.readFileSync(abs, 'utf8');
  } catch { /* file doesn't exist yet — before = null */ }
  journalOf(runCtx).push({ at: Date.now(), rel, before, after: null });
}

function lastJournalEntry(runCtx, rel) {
  const j = journalOf(runCtx);
  for (let i = j.length - 1; i >= 0; i--) if (j[i].rel === rel) return j[i];
  return null;
}

// ─────────────────────────────────────────────
// Glob → RegExp (supports **, *, ?, {a,b})
// ─────────────────────────────────────────────
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;   // `**/` matches zero dirs too
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      // simple brace expansion: {a,b,c} (no nesting)
      const end = glob.indexOf('}', i);
      if (end === -1) { re += '\\{'; continue; }
      const alts = glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      re += '(?:' + alts.join('|') + ')';
      i = end;
    } else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

function listFilesRecursive(dir, baseRel = '') {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const rel = baseRel ? baseRel + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...listFilesRecursive(path.join(dir, e.name), rel));
    else out.push({ rel, size: e.size ?? 0, mtime: 0 });
  }
  return out;
}

// ─────────────────────────────────────────────
// Unified diff (LCS-based, minimal + readable)
// ─────────────────────────────────────────────
function diffLines(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  const n = A.length, m = B.length;
  // LCS table (fine for workspace-file sizes)
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push('-' + A[i++]); }
    else { out.push('+' + B[j++]); }
  }
  while (i < n) out.push('-' + A[i++]);
  while (j < m) out.push('+' + B[j++]);
  return out;
}

/** Compact diff — collapse long runs of unchanged context, cap output. */
function renderDiff(before, after, maxHunks = 40) {
  const lines = diffLines(before, after);
  const hunks = lines.filter((l) => /^[+-]/.test(l));
  const context = lines.length - hunks.length;
  const body = hunks.slice(0, maxHunks).join('\n');
  const more = hunks.length > maxHunks ? `\n… ${hunks.length - maxHunks} more changed lines` : '';
  return `${hunks.length} changed line(s)${context ? `, ${context} unchanged` : ''}\n${body}${more}`;
}

// ─────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────
export function registerAdvancedTools() {
  if (registerAdvancedTools._done) return;
  registerAdvancedTools._done = true;

  // ── file_edit — the surgical editor ──
  registerTool(
    {
      name: 'file_edit',
      description: 'Create, overwrite, or surgically edit a workspace file. Provide `content` to write/replace the whole file, OR `old_string`+`new_string` for an exact, unique in-place replacement (errors helpfully if not unique). Every change is checkpointed for undo.',
      args: {
        path: 'string (relative)',
        content: 'string? — full file content (write mode)',
        old_string: 'string? — exact text to find (edit mode)',
        new_string: 'string? — replacement text (edit mode)',
      },
    },
    (args, runCtx) => {
      const rel = toRel(runCtx, args.path);
      if (!rel) return { ok: false, result: 'invalid path' };
      const abs = resolveInWs(runCtx, rel);
      if (!abs) return { ok: false, result: 'path traversal blocked' };

      const exists = fs.existsSync(abs);
      const writeMode = args.content != null;

      // Edit mode validation
      if (!writeMode) {
        if (!args.old_string) return { ok: false, result: 'file_edit needs `content` (write) or `old_string`+`new_string` (edit)' };
        if (!exists) return { ok: false, result: `cannot edit: ${rel} does not exist yet (use content= to create it)` };
        let current;
        try { current = fs.readFileSync(abs, 'utf8'); } catch (e) { return { ok: false, result: 'read failed: ' + e.message }; }
        const occurrences = current.split(args.old_string).length - 1;
        if (occurrences === 0) {
          // help the model recover: show closest line
          const lines = current.split('\n');
          const probe = String(args.old_string).slice(0, 40);
          const near = lines.findIndex((l) => l.includes(probe.slice(0, 20)));
          return { ok: false, result: `old_string not found in ${rel}${near >= 0 ? ` — closest match at line ${near + 1}: ${lines[near].slice(0, 120)}` : ''}` };
        }
        if (occurrences > 1) return { ok: false, result: `old_string matches ${occurrences} times in ${rel} — add surrounding context to make it unique` };
      }

      snapshot(runCtx, rel);
      const before = exists ? fs.readFileSync(abs, 'utf8') : '';

      let after;
      if (writeMode) {
        after = String(args.content);
      } else {
        after = before.replace(args.old_string, args.new_string ?? '');
      }

      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, after, 'utf8');
      const entry = lastJournalEntry(runCtx, rel);
      if (entry) entry.after = after;

      const verb = !exists ? 'created' : writeMode ? 'rewrote' : 'edited';
      const change = exists ? renderDiff(before, after) : after.split('\n').length + ' lines written';
      return { ok: true, result: `${verb} ${rel} — ${change}`, meta: { rel, exists, writeMode, before, after } };
    },
    { group: 'advanced', permissions: ['*'], timeoutMs: 10000 }
  );

  // ── file_list ──
  registerTool(
    {
      name: 'file_list',
      description: 'List all files in the run workspace recursively (name + bytes). Use after writes to verify project structure.',
      args: {},
    },
    (args, runCtx) => {
      const files = listFilesRecursive(runCtx.workspace.dir);
      if (!files.length) return { ok: true, result: '(workspace empty)' };
      const total = files.length;
      const shown = files.slice(0, 60).map((f) => `${f.rel} (${f.size}B)`);
      return { ok: true, result: shown.join('\n') + (total > 60 ? `\n… ${total - 60} more` : '') };
    },
    { group: 'advanced', timeoutMs: 10000 }
  );

  // ── file_search ──
  registerTool(
    {
      name: 'file_search',
      description: 'Find files by glob pattern, e.g. **/*.py, src/*.js, *.{html,css}.',
      args: { pattern: 'string' },
    },
    (args, runCtx) => {
      if (!args.pattern) return { ok: false, result: 'pattern required' };
      const re = globToRegExp(String(args.pattern).replace(/^\.\//, ''));
      const hits = listFilesRecursive(runCtx.workspace.dir).filter((f) => re.test(f.rel)).map((f) => f.rel);
      return { ok: hits.length > 0, result: hits.length ? hits.slice(0, 80).join('\n') : 'no files match ' + args.pattern };
    },
    { group: 'advanced', timeoutMs: 10000 }
  );

  // ── workspace_grep ──
  registerTool(
    {
      name: 'workspace_grep',
      description: 'Search file CONTENTS across the workspace with a regex. Returns file:line: match (trimmed).',
      args: { pattern: 'string (regex)', max: 'number? results (default 40)' },
    },
    (args, runCtx) => {
      if (!args.pattern) return { ok: false, result: 'pattern required' };
      let re;
      try { re = new RegExp(String(args.pattern)); } catch (e) { return { ok: false, result: 'bad regex: ' + e.message }; }
      const max = Math.min(200, Math.max(1, +args.max || 40));
      const hits = [];
      for (const f of listFilesRecursive(runCtx.workspace.dir)) {
        if (f.size > 512 * 1024) continue;
        let text;
        try { text = fs.readFileSync(path.join(runCtx.workspace.dir, f.rel), 'utf8'); } catch { continue; }
        const lines = text.split('\n');
        for (let i = 0; i < lines.length && hits.length < max; i++) {
          if (re.test(lines[i])) hits.push(`${f.rel}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
        }
        if (hits.length >= max) break;
      }
      return { ok: hits.length > 0, result: hits.length ? hits.join('\n') : 'no matches for /' + args.pattern + '/' };
    },
    { group: 'advanced', timeoutMs: 15000 }
  );

  // ── workspace_zip — deliverables ──
  registerTool(
    {
      name: 'workspace_zip',
      description: 'Package workspace files into a ZIP the user can download. Call at the END of a build task. Returns a token; the UI turns it into a download link.',
      args: { name: 'string? — zip filename (default: keycode-build)' },
    },
    async (args, runCtx) => {
      const files = listFilesRecursive(runCtx.workspace.dir);
      if (!files.length) return { ok: false, result: 'workspace is empty — nothing to zip' };
      fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
      const name = (String(args.name || 'keycode-build').replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 60) || 'keycode-build') + '-' + Date.now() + '.zip';
      const zipPath = path.join(ARTIFACTS_DIR, name);
      try {
        const zip = new JSZip();
        for (const f of files) {
          zip.file(f.rel, fs.readFileSync(path.join(runCtx.workspace.dir, f.rel)));
        }
        const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
        fs.writeFileSync(zipPath, buf);
      } catch (e) {
        return { ok: false, result: 'zip failed: ' + e.message };
      }
      const size = fs.statSync(zipPath).size;
      const token = 'artifact:' + name;
      return { ok: true, result: `packaged ${files.length} file(s) → download token ${token} (${(size / 1024).toFixed(1)}KB)`, meta: { artifact: name, size } };
    },
    { group: 'advanced', timeoutMs: 35000 }
  );

  // ── todo_write — structured plan tracking ──
  registerTool(
    {
      name: 'todo_write',
      description: 'Maintain your task checklist. Call with the FULL todo list each time state changes (completed items stay listed). The user sees this checklist live.',
      args: {
        todos: 'array of {task: string, completed: boolean}',
      },
    },
    (args, runCtx) => {
      if (!Array.isArray(args.todos) || !args.todos.length) return { ok: false, result: 'todos array required' };
      const clean = args.todos.slice(0, 24).map((t) => ({ task: String(t.task || '').slice(0, 200), completed: !!t.completed }));
      runCtx.todos = clean;
      const done = clean.filter((t) => t.completed).length;
      return { ok: true, result: `todo list updated: ${done}/${clean.length} done` };
    },
    { group: 'advanced', timeoutMs: 5000 }
  );

  // ── workspace_rewind — undo ladder ──
  registerTool(
    {
      name: 'workspace_rewind',
      description: 'Undo workspace file changes back to a checkpoint. args: {steps:1} undoes the last change; {to_step:N} restores files to their state just before agent step N. Use when an approach failed.',
      args: { steps: 'number?', to_step: 'number?' },
    },
    (args, runCtx) => {
      const j = journalOf(runCtx);
      if (!j.length) return { ok: false, result: 'nothing to rewind — no file changes yet' };

      let restoreFrom;
      if (args.to_step != null) {
        const s = +args.to_step;
        if (!Number.isFinite(s) || s < 0) return { ok: false, result: 'bad to_step' };
        restoreFrom = j.findIndex((e) => e.step >= s);
        if (restoreFrom === -1) return { ok: true, result: `no changes were made at or after step ${s} — nothing to rewind` };
      } else {
        const steps = Math.max(1, +args.steps || 1);
        restoreFrom = Math.max(0, j.length - steps);
      }

      const affected = j.slice(restoreFrom);
      const byRel = new Map();
      for (const e of affected) byRel.set(e.rel, e);   // earliest entry per file wins (index order preserved)
      let restored = 0;
      for (const e of byRel.values()) {
        const abs = resolveInWs(runCtx, e.rel);
        if (!abs) continue;
        try {
          if (e.before == null) {
            if (fs.existsSync(abs)) { fs.unlinkSync(abs); restored++; }
          } else {
            fs.writeFileSync(abs, e.before, 'utf8');
            restored++;
          }
        } catch { /* best effort */ }
      }
      runCtx.journal = j.slice(0, restoreFrom);
      return { ok: true, result: `rewound ${restored} file(s) to checkpoint (step ${restoreFrom === 0 ? 'start' : affected[0].step})` };
    },
    { group: 'advanced', timeoutMs: 10000 }
  );

  // ── spawn_agent — sub-agents ──
  registerTool(
    {
      name: 'spawn_agent',
      description: 'Run an independent sub-agent for a self-contained subtask (research, one file, one test). It gets its own sandbox and returns a text report. It cannot see this workspace.',
      args: { task: 'string', max_steps: 'number? (default 5)' },
    },
    async (args, runCtx) => {
      if (!args.task) return { ok: false, result: 'task required' };
      runCtx.agentDepth = runCtx.agentDepth || 0;
      if (runCtx.agentDepth >= 1) return { ok: false, result: 'max sub-agent depth reached (1)' };
      runCtx.agentDepth++;
      try {
        let final = null, steps = 0;
        for await (const evt of runReAct({ task: String(args.task).slice(0, 2000), maxSteps: Math.min(8, Math.max(1, +args.max_steps || 5)), permissions: [] })) {
          if (evt.type === 'done') { final = evt.answer; steps = evt.stepsUsed; }
          if (evt.type === 'error') { final = null; break; }
        }
        if (final == null) return { ok: false, result: 'sub-agent failed or returned no answer' };
        return { ok: true, result: `sub-agent (${steps} steps): ${String(final).slice(0, 4000)}` };
      } finally {
        runCtx.agentDepth--;
      }
    },
    { group: 'advanced', permissions: ['*'], timeoutMs: 180000, maxCallsPerRun: 6 }
  );
}

// ============================================================
// JIT help text — injected into the tool menu at runtime
// ============================================================
export const ADVANCED_TOOL_HINTS = [
  ['file_edit', 'EDITING FILES: prefer old_string/new_string surgical edits over rewriting whole files. old_string must be UNIQUE — include surrounding lines for context. Every edit is checkpointed; use workspace_rewind {steps:1} to undo a bad move.'],
  ['workspace_zip', 'FINISHING: when your build is complete, call workspace_zip so the user gets a download link.'],
  ['todo_write', 'PLANNING: for multi-step tasks, call todo_write FIRST with your plan, then keep it updated as you complete items.'],
  ['spawn_agent', 'DELEGATION: for self-contained research or a focused subtask, spawn_agent it instead of bloating your own context.'],
  ['workspace_grep', 'SEARCHING: use file_search for filenames (globs) and workspace_grep for contents (regex).'],
].map(([tool, hint]) => ({ tool, hint }));
