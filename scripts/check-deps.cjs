// Dev-only helper: scans server JS for bare imports not declared in server/package.json.
// These break production Docker builds (npm ci --omit=dev) while hiding behind
// locally hoisted packages. Run: node scripts/check-deps.cjs
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'server', 'package.json'), 'utf8'));
const declared = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
]);
const builtins = new Set(require('module').builtinModules);
// Guarded optional integrations — probed with try/catch or `await import().catch()`.
// Listed here so they don't fail the audit; they are NOT server dependencies.
const OPTIONAL = new Set(['pg', 'playwright', 'puppeteer', 'redis', 'sharp']);
const SKIP_DIRS = new Set([
  'node_modules', '__tests__', 'exports', 'generated',
  'uploads', 'preview', 'data', '.logs', 'models',
]);
const missing = new Map();

function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (!SKIP_DIRS.has(f.name)) walk(p);
    } else if (f.name.endsWith('.js')) {
      const src = fs.readFileSync(p, 'utf8');
      const specs = [...src.matchAll(/(?:import|require)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
// Truncate multi-line import specifiers (e.g. template text captured by the regex)
      for (const r of specs) {
        if (r.length > 100 || /\s\s/.test(r)) continue;
        if (r.startsWith('.') || r.startsWith('/') || r.startsWith('node:')) continue;
        const base = r.startsWith('@') ? r.split('/').slice(0, 2).join('/') : r.split('/')[0];
        if (builtins.has(base) || declared.has(base) || OPTIONAL.has(base)) continue;
        if (!missing.has(base)) missing.set(base, new Set());
        missing.get(base).add(path.relative(root, p));
      }
    }
  }
}

walk(path.join(root, 'server'));
for (const [name, files] of [...missing].sort()) {  console.log(`MISSING: ${name}  <-  ${[...files].slice(0, 3).join(', ')}`);
}
console.log(`total missing: ${missing.size}`);
process.exit(missing.size > 0 ? 1 : 0);
