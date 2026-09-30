'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface OutLine {
  text: string;
  kind: 'cmd' | 'out' | 'err' | 'sys';
}

const LANGS = ['node', 'python', 'sh'] as const;

/**
 * Terminal — real sandboxed execution via POST /api/agent/tools/code_run
 * (the same dispatch surface the ReAct agent uses). Auth: Bearer token from
 * localStorage, matching the legacy os.js contract.
 */
export default function TerminalPane() {
  const [lines, setLines] = useState<OutLine[]>([
    { text: 'KEYCODE sandbox — node | python | sh · POST /api/agent/tools/code_run', kind: 'sys' },
    { text: 'Ephemeral per-run workspace. Type `help` for details.', kind: 'sys' },
  ]);
  const [input, setInput] = useState('');
  const [lang, setLang] = useState<(typeof LANGS)[number]>('node');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const idRef = useRef(0);

  const push = useCallback((text: string, kind: OutLine['kind'] = 'out') => {
    idRef.current += 1;
    setLines((prev) => [...prev.slice(-400), { text, kind }]);
  }, []);

  useEffect(() => {
    setAuthed(Boolean(localStorage.getItem('token')));
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  const runCode = useCallback(
    async (code: string) => {
      push(`${lang}> ${code}`, 'cmd');
      setHistory((h) => [...h.slice(-50), code]);
      setHIdx(-1);
      setBusy(true);
      const t0 = Date.now();
      try {
        const token = localStorage.getItem('token') || '';
        const res = await fetch('/api/agent/tools/code_run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ args: { language: lang, code } }),
        });
        const j = await res.json().catch(() => null);
        if (res.status === 401) {
          push('auth required — sign in on the main site to execute code', 'err');
        } else if (!res.ok) {
          push(`request failed (${res.status})${j?.error ? ': ' + j.error : ''}`, 'err');
        } else if (j?.ok) {
          push(j.result ?? '(no output)', 'out');
          const ms = j.durationMs != null ? ` · ${j.durationMs}ms` : '';
          push(`exit 0${ms}`, 'sys');
        } else {
          push(j?.result ?? 'execution failed', 'err');
        }
      } catch {
        push('could not reach the agent server — is it running?', 'err');
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [lang, push]
  );

  const submit = () => {
    const code = input.trim();
    if (!code || busy) return;
    setInput('');
    if (code === 'help') {
      push('commands:', 'sys');
      push('  help            this message', 'out');
      push('  clear           clear the terminal', 'out');
      push('  anything else   runs as ' + lang + ' in the sandbox', 'out');
      return;
    }
    if (code === 'clear') {
      setLines([]);
      return;
    }
    runCode(code);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault();
      const next = hIdx < 0 ? history.length - 1 : Math.max(0, hIdx - 1);
      setHIdx(next);
      setInput(history[next]);
    }
    if (e.key === 'ArrowDown' && hIdx >= 0) {
      e.preventDefault();
      const next = hIdx + 1;
      if (next >= history.length) {
        setHIdx(-1);
        setInput('');
      } else {
        setHIdx(next);
        setInput(history[next]);
      }
    }
  };

  const COLOR: Record<OutLine['kind'], string> = {
    cmd: 'text-[#38d6ff]',
    out: 'text-[#c8d0e0]',
    err: 'text-[var(--os-red)]',
    sys: 'text-[var(--os-text-faint)]',
  };

  return (
    <div className="h-full flex flex-col p-3 max-w-5xl mx-auto gap-2">
      <div className="os-panel px-4 py-2.5 flex items-center gap-3 shrink-0 flex-wrap">
        <span className="text-[12px] text-white font-medium">Terminal</span>
        <div className="flex gap-1">
          {LANGS.map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-2.5 py-0.5 rounded-md text-[10.5px] font-mono uppercase tracking-wider transition-colors ${
                lang === l ? 'bg-[rgba(109,124,255,0.18)] text-white' : 'text-[var(--os-text-faint)] hover:text-[var(--os-text-dim)]'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        {authed === false && (
          <span className="text-[10px] font-mono text-[var(--os-amber)]">⚠ sign in to execute</span>
        )}
        <span className="text-[10.5px] font-mono text-[var(--os-text-faint)] ml-auto">
          {busy ? 'executing…' : 'sandbox ready'}
        </span>
      </div>

      <div ref={scrollRef} className="os-panel flex-1 overflow-y-auto os-scrollbar p-4 font-mono text-[12.5px] leading-[1.65] bg-[#05060a]">
        {lines.map((l, i) => (
          <div key={i} className={`whitespace-pre-wrap break-words ${COLOR[l.kind]}`}>
            {l.text}
          </div>
        ))}
        {busy && (
          <div className="text-[var(--os-text-faint)]">
            <span className="os-caret" />
          </div>
        )}
      </div>

      <div className="os-panel p-2 flex items-end gap-2 shrink-0">
        <span className="pl-2 pb-2 font-mono text-[12px] text-[var(--os-accent-3)] shrink-0">{lang}&gt;</span>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={authed === false ? 'sign in on the main site to run code…' : `run ${lang} code — Enter to execute`}
          disabled={busy}
          className="flex-1 bg-transparent outline-none resize-none py-2 text-[13px] font-mono text-white placeholder:text-[var(--os-text-faint)] disabled:opacity-50 max-h-32"
        />
        <button onClick={submit} disabled={!input.trim() || busy} className="os-btn os-btn-primary text-[12px] px-4 py-2 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
          Run ▸
        </button>
      </div>
    </div>
  );
}
