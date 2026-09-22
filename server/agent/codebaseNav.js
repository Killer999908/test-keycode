// ============================================================
// KEYCODE Agent Runtime — Codebase Navigation Layer
// ============================================================
// Gives the agent IDE-grade awareness of a repository: file tree,
// content search, symbol extraction (functions, classes, routes,
// exports), and file summaries. Queries run against a cached index
// rebuilt on demand — never blocks the ReAct loop for long.

import fs from 'fs';
import path from 'path';
import { execInSandbox, createWorkspace } from './sandbox.js';

const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.venv', 'venv', '__pycache__', 'preview', 'exports', 'uploads', '.logs']);
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.rb', '.php', '.c', '.cpp', '.h', '.cs', '.html', '.css', '.scss', '.json', '.md', '.yml', '.yaml', '.sql', '.sh', '.env.example']);

function walk(dir, base, out, depth = 0, maxDepth = 8) {
  if (depth > maxDepth) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.env.example') continue;
    if (IGNORE.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    const rel = path.relative(base, abs);
    if (e.isDirectory()) walk(abs, base, out, depth + 1, maxDepth);
    else if (TEXT_EXT.has(path.extname(e.name))) {
      // dirent has no size on Linux — stat the file for the size cap
      let size = 0;
      try { size = fs.statSync(abs).size; } catch { continue; }
      if (size < 500000) out.push({ rel, abs, size });
    }
  }
}

// ─────────────────────────────────────────────
// Symbol extraction (regex-based, fast, language-aware enough)
// ─────────────────────────────────────────────
const SYMBOL_PATTERNS = [
  { kind: 'function', re: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm },
  { kind: 'function', re: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/gm },
  { kind: 'class', re: /^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm },
  { kind: 'route', re: /\.(get|post|put|delete|patch|use)\s*\(\s*[`'"]([^`'"]+)[`'"]/g },
  { kind: 'export', re: /^export\s+(?:default\s+)?(?:function|class|const)\s+([A-Za-z_$][\w$]*)/gm },
];

export function extractSymbols(code, relPath) {
  const symbols = [];
  for (const { kind, re } of SYMBOL_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code))) {
      const line = code.slice(0, m.index).split('\n').length;
      if (kind === 'route') symbols.push({ kind, name: m[1].toUpperCase() + ' ' + m[2], line });
      else symbols.push({ kind, name: m[1], line });
      if (symbols.length > 200) return symbols;
    }
  }
  return symbols;
}

// ─────────────────────────────────────────────
// Repository index (cached per root, TTL 60s)
// ─────────────────────────────────────────────
const _indexCache = new Map();

export function getRepoIndex(root = process.cwd(), { force = false } = {}) {
  const cached = _indexCache.get(root);
  if (!force && cached && Date.now() - cached.at < 60000) return cached;

  const files = [];
  walk(root, root, files);
  const byExt = {};
  for (const f of files) {
    const ext = path.extname(f.rel) || '(none)';
    byExt[ext] = (byExt[ext] || 0) + 1;
  }
  const index = {
    at: Date.now(),
    root,
    fileCount: files.length,
    files,
    byExt,
    // symbol index is built lazily per-file
    _symbols: new Map(),
  };
  _indexCache.set(root, index);
  return index;
}

function symbolsFor(index, file) {
  if (index._symbols.has(file.rel)) return index._symbols.get(file.rel);
  let symbols = [];
  try {
    const stat = fs.statSync(file.abs);
    if (stat.size < 300000) symbols = extractSymbols(fs.readFileSync(file.abs, 'utf8'), file.rel);
  } catch {}
  index._symbols.set(file.rel, symbols);
  return symbols;
}

// ─────────────────────────────────────────────
// Agent-facing tools
// ─────────────────────────────────────────────
export const codebaseTools = {
  /** File tree overview / filtered listing. */
  repo_tree(args = {}) {
    const index = getRepoIndex(args.root);
    const q = (args.filter || '').toLowerCase();
    let files = index.files.map((f) => f.rel);
    if (q) files = files.filter((f) => f.toLowerCase().includes(q));
    const limit = args.limit || 200;
    const shown = files.slice(0, limit);
    return {
      ok: true,
      result: `repo: ${index.root}\nfiles: ${index.fileCount}${q ? ` (matching "${args.filter}": ${files.length})` : ''}\nbyExt: ${JSON.stringify(index.byExt)}\n\n${shown.join('\n')}${files.length > limit ? `\n… +${files.length - limit} more (use filter)` : ''}`,
    };
  },

  /** Content search across the repo (ripgrep when available). */
  async repo_search(args = {}) {
    if (!args.pattern) return { ok: false, result: 'pattern required' };
    const index = getRepoIndex(args.root);
    const ws = createWorkspace('nav');
    try {
      const r = await execInSandbox({
        cmd: 'rg',
        args: ['-n', '--max-count', '5', '--max-filesize', '300K', args.pattern, index.root],
        ws, timeoutMs: 15000,
      });
      let out = r.stdout;
      if (!out.trim()) {
        // rg missing or no matches — naive fallback over indexed files
        const hits = [];
        for (const f of index.files) {
          try {
            const code = fs.readFileSync(f.abs, 'utf8');
            const lines = code.split('\n');
            for (let i = 0; i < lines.length && hits.length < 60; i++) {
              if (lines[i].includes(args.pattern)) hits.push(`${f.rel}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
            }
          } catch {}
        }
        out = hits.join('\n');
      }
      return { ok: true, result: (out || '(no matches)').slice(0, 6000) };
    } finally { try { fs.rmSync(ws.dir, { recursive: true, force: true }); } catch {} }
  },

  /** Symbol map for a file or the whole repo. */
  repo_symbols(args = {}) {
    const index = getRepoIndex(args.root);
    if (args.file) {
      const file = index.files.find((f) => f.rel.endsWith(args.file) || f.rel === args.file);
      if (!file) return { ok: false, result: 'file not found in index: ' + args.file };
      const symbols = symbolsFor(index, file);
      return { ok: true, result: symbols.map((s) => `${s.kind.padEnd(8)} L${String(s.line).padEnd(5)} ${s.name}`).join('\n') || '(no symbols)' };
    }
    // repo-wide: top symbols per file (capped)
    const out = [];
    for (const f of index.files.slice(0, 80)) {
      const symbols = symbolsFor(index, f).filter((s) => s.kind !== 'export');
      if (symbols.length) out.push(f.rel + '\n  ' + symbols.slice(0, 8).map((s) => `${s.kind} ${s.name}`).join(' · '));
    }
    return { ok: true, result: out.slice(0, 60).join('\n').slice(0, 6000) || '(no symbols found)' };
  },

  /** Read a file (path-relative), optionally a line window. */
  repo_read(args = {}) {
    const index = getRepoIndex(args.root);
    const file = index.files.find((f) => f.rel.endsWith(args.file) || f.rel === args.file);
    if (!file) return { ok: false, result: 'file not found: ' + args.file };
    let code = '';
    try { code = fs.readFileSync(file.abs, 'utf8'); } catch (e) { return { ok: false, result: 'read failed: ' + e.message }; }
    if (args.startLine) {
      const lines = code.split('\n');
      const end = Math.min(lines.length, (args.endLine || args.startLine + 80));
      return { ok: true, result: lines.slice(args.startLine - 1, end).map((l, i) => `${args.startLine + i}: ${l}`).join('\n').slice(0, 8000) };
    }
    return { ok: true, result: code.slice(0, 12000) };
  },

  /** One-paragraph summary of a file: purpose + symbols + size. */
  repo_summarize(args = {}) {
    const index = getRepoIndex(args.root);
    const file = index.files.find((f) => f.rel.endsWith(args.file) || f.rel === args.file);
    if (!file) return { ok: false, result: 'file not found: ' + args.file };
    let code = '';
    try { code = fs.readFileSync(file.abs, 'utf8'); } catch (e) { return { ok: false, result: 'read failed: ' + e.message }; }
    const symbols = symbolsFor(index, file);
    const routes = symbols.filter((s) => s.kind === 'route').map((s) => s.name);
    const fns = symbols.filter((s) => s.kind === 'function').map((s) => s.name).slice(0, 10);
    const classes = symbols.filter((s) => s.kind === 'class').map((s) => s.name);
    const head = code.split('\n').slice(0, 3).map((l) => l.trim()).filter((l) => l && !l.startsWith('//!')).join(' ');
    const parts = [
      `${file.rel} (${(file.size / 1024).toFixed(1)}KB, ${code.split('\n').length} lines)`,
      head ? `header: ${head.slice(0, 140)}` : '',
      classes.length ? `classes: ${classes.join(', ')}` : '',
      fns.length ? `functions: ${fns.join(', ')}` : '',
      routes.length ? `routes: ${routes.join(', ')}` : '',
    ].filter(Boolean);
    return { ok: true, result: parts.join('\n') };
  },
};

export const codebaseToolDefs = [
  { name: 'repo_tree', description: 'List repository files (optionally filtered) + type stats', args: { filter: 'string?', limit: 'number?' } },
  { name: 'repo_search', description: 'Search file contents across the repo', args: { pattern: 'string' } },
  { name: 'repo_symbols', description: 'Extract functions/classes/routes from a file or repo', args: { file: 'string?' } },
  { name: 'repo_read', description: 'Read a file or line window', args: { file: 'string', startLine: 'number?', endLine: 'number?' } },
  { name: 'repo_summarize', description: 'One-paragraph purpose + symbol summary of a file', args: { file: 'string' } },
];
