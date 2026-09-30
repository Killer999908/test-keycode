'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface MemoryStats {
  entries?: number;
  [k: string]: unknown;
}

interface Match {
  key?: string;
  text?: string;
  tags?: string[];
  at?: string | number;
  score?: number;
  [k: string]: unknown;
}

/**
 * Memory — the agent's 5-layer L4 store.
 * GET  /api/agent/memory?q=…  → stats + semantic matches (open endpoint)
 * POST /api/agent/memory      → manual write { key, text, tags } (auth)
 */
export default function MemoryPane() {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // write form
  const [wKey, setWKey] = useState('');
  const [wText, setWText] = useState('');
  const [wTags, setWTags] = useState('');
  const [writing, setWriting] = useState(false);
  const [wMsg, setWMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/memory');
      const j = await res.json().catch(() => null);
      if (j?.success) setStats(j.stats ?? {});
      else setError('memory endpoint unavailable');
    } catch {
      setError('could not reach the agent server');
    }
  }, []);

  useEffect(() => {
    setAuthed(Boolean(localStorage.getItem('token')));
    loadStats();
  }, [loadStats]);

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setMatches(null);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent/memory?q=${encodeURIComponent(q)}`);
      const j = await res.json().catch(() => null);
      if (j?.success) setMatches(Array.isArray(j.matches) ? j.matches : []);
      else setError('search failed');
    } catch {
      setError('could not reach the agent server');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const write = useCallback(async () => {
    if (!wKey.trim() || !wText.trim() || writing) return;
    setWriting(true);
    setWMsg(null);
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/agent/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          key: wKey.trim(),
          text: wText.trim(),
          tags: wTags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 5),
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 401) {
        setWMsg({ ok: false, text: 'Sign in on the main site to write memories.' });
      } else if (j?.success) {
        setWMsg({ ok: true, text: `Stored "${wKey.trim()}".` });
        setWKey('');
        setWText('');
        setWTags('');
        loadStats();
      } else {
        setWMsg({ ok: false, text: j?.error || 'write failed' });
      }
    } catch {
      setWMsg({ ok: false, text: 'could not reach the agent server' });
    } finally {
      setWriting(false);
    }
  }, [wKey, wText, wTags, writing, loadStats]);

  const statEntries = stats ? Object.entries(stats).filter(([, v]) => typeof v === 'number' || typeof v === 'string') : [];

  return (
    <div className="h-full overflow-y-auto os-scrollbar p-3 max-w-4xl mx-auto space-y-3">
      <div className="os-panel px-4 py-2.5 flex items-center gap-3 sticky top-0 z-10">
        <span className="text-[12px] text-white font-medium">Memory</span>
        <span className="text-[10.5px] font-mono text-[var(--os-text-faint)] ml-auto">
          GET · POST /api/agent/memory
        </span>
      </div>

      {error && (
        <div className="os-panel p-4 text-[12px] text-[var(--os-amber)] font-mono">⚠ {error}</div>
      )}

      {/* Stats strip */}
      {statEntries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {statEntries.map(([k, v], i) => (
            <motion.div
              key={k}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.45 }}
              className="os-panel p-3"
            >
              <div className="text-[9px] tracking-[0.25em] uppercase text-[var(--os-text-faint)] mb-1">{k}</div>
              <div className="text-xl font-mono text-white">{String(v)}</div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="os-panel p-4">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">Recall</div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Search agent memory…"
            className="flex-1 bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[var(--os-text-faint)] outline-none focus:border-[var(--os-border-bright)] transition-colors"
          />
          <button onClick={search} disabled={!query.trim() || searching} className="os-btn os-btn-primary text-[12px] px-4 disabled:opacity-40 disabled:cursor-not-allowed">
            {searching ? '…' : 'Search'}
          </button>
        </div>
        {matches !== null && (
          <div className="mt-3 space-y-2">
            {matches.length === 0 && <div className="text-[12px] text-[var(--os-text-faint)] font-mono">no matches</div>}
            {matches.map((m, i) => (
              <motion.div
                key={String(m.key ?? i)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35 }}
                className="rounded-lg border border-[var(--os-border)] bg-[rgba(255,255,255,0.02)] p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-mono text-[var(--os-accent-3)]">{m.key}</span>
                  {typeof m.score === 'number' && (
                    <span className="text-[9px] font-mono text-[var(--os-text-faint)]">score {m.score.toFixed(2)}</span>
                  )}
                </div>
                <p className="text-[12px] text-[var(--os-text-dim)] leading-relaxed whitespace-pre-wrap">{m.text}</p>
                {m.tags && m.tags.length > 0 && (
                  <div className="flex gap-1.5 mt-2">
                    {m.tags.map((t) => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full border border-[var(--os-border)] text-[var(--os-text-faint)]">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Write */}
      <div className="os-panel p-4">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">
          Teach the agent {authed === false && <span className="text-[var(--os-amber)] normal-case tracking-normal">· sign in required</span>}
        </div>
        <div className="space-y-2">
          <input
            value={wKey}
            onChange={(e) => setWKey(e.target.value)}
            placeholder="key — e.g. user:prefers-dark-terminals"
            className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[var(--os-text-faint)] outline-none focus:border-[var(--os-border-bright)] transition-colors"
          />
          <textarea
            value={wText}
            onChange={(e) => setWText(e.target.value)}
            rows={3}
            placeholder="what should the agent remember?"
            className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[var(--os-text-faint)] outline-none resize-none focus:border-[var(--os-border-bright)] transition-colors"
          />
          <div className="flex gap-2">
            <input
              value={wTags}
              onChange={(e) => setWTags(e.target.value)}
              placeholder="tags, comma-separated (optional)"
              className="flex-1 bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[12px] text-white placeholder:text-[var(--os-text-faint)] outline-none focus:border-[var(--os-border-bright)] transition-colors"
            />
            <button
              onClick={write}
              disabled={!wKey.trim() || !wText.trim() || writing}
              className="os-btn os-btn-primary text-[12px] px-4 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {writing ? '…' : 'Remember'}
            </button>
          </div>
          {wMsg && (
            <div className={`text-[11.5px] font-mono ${wMsg.ok ? 'text-[var(--os-green)]' : 'text-[var(--os-red)]'}`}>
              {wMsg.ok ? '✓ ' : '✗ '}
              {wMsg.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
