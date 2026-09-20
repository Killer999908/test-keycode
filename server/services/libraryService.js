// KEYCODE Unified Library Service — the vast, $0 asset library:
//   1. Electronics components: full KiCad symbol + footprint libraries on disk
//   2. Icons: lucide-static (2,100+ SVG icons)
//   3. Images: Openverse API (800M+ CC-licensed images, no API key required)
// Everything searchable through /api/library/* endpoints.

import fs from 'fs';
import path from 'path';

const KICAD_SYMBOLS_DIR = '/usr/share/kicad/symbols';
const KICAD_FOOTPRINTS_DIR = '/usr/share/kicad/footprints';
const LUCIDE_ICONS_DIR = path.join(process.cwd(), '..', 'node_modules', 'lucide-static', 'icons');

// ── Lazy in-memory indexes (built on first search) ──
let _symbolIndex = null;   // [{ name, lib }]
let _footprintIndex = null; // [{ name, lib }]
let _iconIndex = null;     // [filenames]

function buildSymbolIndex() {
  if (_symbolIndex) return _symbolIndex;
  _symbolIndex = [];
  try {
    for (const f of fs.readdirSync(KICAD_SYMBOLS_DIR)) {
      if (!f.endsWith('.kicad_sym')) continue;
      const lib = f.replace('.kicad_sym', '');
      // Symbols are declared as "(symbol \"NAME\"" at top level; lightweight scan
      const content = fs.readFileSync(path.join(KICAD_SYMBOLS_DIR, f), 'utf8');
      const re = /\(symbol\s+"([^"]+)"\s*\(/g;
      let m;
      while ((m = re.exec(content))) {
        const name = m[1];
        if (name.includes(':')) continue; // nested subsymbols
        _symbolIndex.push({ name, lib, kind: 'symbol' });
      }
    }
  } catch (e) { console.error('[library] symbol index failed:', e.message); }
  return _symbolIndex;
}

function buildFootprintIndex() {
  if (_footprintIndex) return _footprintIndex;
  _footprintIndex = [];
  try {
    for (const lib of fs.readdirSync(KICAD_FOOTPRINTS_DIR)) {
      const libDir = path.join(KICAD_FOOTPRINTS_DIR, lib);
      if (!fs.statSync(libDir).isDirectory() || !lib.endsWith('.pretty')) continue;
      for (const f of fs.readdirSync(libDir)) {
        if (f.endsWith('.kicad_mod')) {
          _footprintIndex.push({ name: f.replace('.kicad_mod', ''), lib: lib.replace('.pretty', ''), kind: 'footprint' });
        }
      }
    }
  } catch (e) { console.error('[library] footprint index failed:', e.message); }
  return _footprintIndex;
}

function buildIconIndex() {
  if (_iconIndex) return _iconIndex;
  _iconIndex = [];
  try {
    _iconIndex = fs.readdirSync(LUCIDE_ICONS_DIR).filter(f => f.endsWith('.svg'));
  } catch (e) { console.error('[library] icon index failed:', e.message); }
  return _iconIndex;
}

function score(name, q) {
  const n = name.toLowerCase();
  const query = q.toLowerCase();
  if (n === query) return 100;
  if (n.startsWith(query)) return 80;
  if (n.includes(query)) return 60;
  // all tokens present
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every(t => n.includes(t))) return 40;
  return 0;
}

export function searchComponents(q, limit = 50) {
  const query = String(q || '').trim();
  if (!query) return { total: 0, results: [] };
  const symbols = buildSymbolIndex();
  const footprints = buildFootprintIndex();
  const scored = [];
  for (const item of symbols) { const s = score(item.name, query); if (s) scored.push({ ...item, score: s }); }
  for (const item of footprints) { const s = score(item.name, query); if (s) scored.push({ ...item, score: s - 1 }); }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return {
    query,
    totalSymbols: symbols.length,
    totalFootprints: footprints.length,
    total: scored.length,
    results: scored.slice(0, limit).map(({ score: _s, ...rest }) => rest),
  };
}

export function searchIcons(q, limit = 60) {
  const query = String(q || '').trim().toLowerCase();
  const icons = buildIconIndex();
  const matches = query
    ? icons.map(f => ({ file: f, s: score(f.replace('.svg', ''), query) })).filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.file)
    : icons.slice(0, limit);
  const results = [];
  for (const f of matches) {
    try {
      results.push({ name: f.replace('.svg', ''), svg: fs.readFileSync(path.join(LUCIDE_ICONS_DIR, f), 'utf8') });
    } catch {}
  }
  return { query, total: icons.length, count: results.length, results };
}

// Openverse — 800M+ CC-licensed images, anonymous access (no key, polite rate)
export async function searchImages(q, limit = 20) {
  const query = String(q || '').trim();
  if (!query) return { query, total: 0, results: [] };
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${Math.min(limit, 50)}&license_type=all-cc&mature=false`;
    const res = await fetch(url, { headers: { 'User-Agent': 'KEYCODE-Studio/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`openverse ${res.status}`);
    const d = await res.json();
    return {
      query,
      total: d.result_count ?? (d.results || []).length,
      provider: 'openverse (CC-licensed)',
      results: (d.results || []).slice(0, limit).map(r => ({
        title: r.title, url: r.url, thumbnail: r.thumbnail, license: r.license, creator: r.creator, source: r.source,
      })),
    };
  } catch (e) {
    return { query, total: 0, results: [], error: e.message };
  }
}

export function libraryStats() {
  return {
    components: {
      symbols: (buildSymbolIndex() || []).length,
      footprints: (buildFootprintIndex() || []).length,
      source: 'KiCad standard libraries (on-disk)',
    },
    icons: { count: (buildIconIndex() || []).length, source: 'lucide-static' },
    images: { source: 'Openverse — 800M+ CC-licensed works (live API)' },
  };
}
