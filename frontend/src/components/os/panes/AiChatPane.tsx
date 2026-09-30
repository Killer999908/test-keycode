'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

type Role = 'user' | 'thought' | 'observation' | 'answer' | 'error';

interface ChatMsg {
  id: number;
  role: Role;
  text: string;
  meta?: string;
}

/**
 * AI Chat — real agent conversations via POST /api/agent/react (SSE).
 * Streams the ReAct loop: thought → action → observation → … → final answer.
 * Auth matches the legacy os.js contract: Bearer token from localStorage.
 */
export default function AiChatPane() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const push = useCallback((role: Role, text: string, meta?: string) => {
    idRef.current += 1;
    setMessages((prev) => [...prev.slice(-80), { id: idRef.current, role, text, meta }]);
  }, []);

  useEffect(() => {
    setAuthed(Boolean(localStorage.getItem('token')));
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = useCallback(async () => {
    const task = input.trim();
    if (!task || streaming) return;
    setInput('');
    push('user', task);
    setStreaming(true);

    const token = localStorage.getItem('token') || '';
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/agent/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ task, maxSteps: 12, tokenBudget: 8000 }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        push('error', 'Not signed in — login on the main site, then come back.', '401');
        return;
      }
      if (!res.ok || !res.body) {
        push('error', `Agent request failed (${res.status}).`, String(res.status));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'step' && evt.kind !== 'malformed' && evt.thought) {
              push('thought', evt.thought, `step ${evt.step}`);
            } else if (evt.type === 'observation') {
              push('observation', evt.result || '(no output)', `${evt.ok === false ? '✗' : '✓'} ${evt.tool} · ${evt.durationMs ?? '?'}ms`);
            } else if (evt.type === 'done') {
              push('answer', evt.answer || (evt.partial ? 'Run exhausted without a final answer.' : 'Done.'), evt.stepsUsed != null ? `${evt.stepsUsed} steps` : undefined);
            } else if (evt.type === 'error') {
              push('error', evt.message || 'Agent error.');
            }
          } catch {
            /* skip invalid JSON frames */
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        push('error', 'Could not reach the agent server. Is it running?', 'network');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, push]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const ROLE_STYLE: Record<Role, string> = {
    user: 'ml-auto max-w-[80%] text-white',
    thought: 'mr-auto max-w-[85%] text-[var(--os-text-dim)] border-l-2 border-[var(--os-accent)]/50 pl-3',
    observation: 'mr-auto max-w-[90%] font-mono text-[11.5px] text-[var(--os-text-faint)] bg-[rgba(255,255,255,0.03)] rounded-lg',
    answer: 'mr-auto max-w-[85%] text-[var(--os-text)] bg-[rgba(109,124,255,0.12)] border border-[rgba(109,124,255,0.3)]',
    error: 'mr-auto max-w-[85%] text-[var(--os-red)] bg-[rgba(255,93,108,0.08)] border border-[rgba(255,93,108,0.25)]',
  };

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto p-3 gap-3">
      <div className="os-panel px-4 py-2.5 flex items-center gap-3 shrink-0">
        <span className="os-live-dot" />
        <span className="text-[12px] text-white font-medium">AI Chat</span>
        <span className="text-[10.5px] font-mono text-[var(--os-text-faint)] ml-auto">
          {streaming ? 'streaming · react loop' : 'POST /api/agent/react · SSE'}
        </span>
      </div>

      <div ref={scrollRef} className="os-panel flex-1 overflow-y-auto os-scrollbar p-4 space-y-2.5">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3">
            <div className="os-display text-2xl">
              <span className="os-grad-text">Ask the core.</span>
            </div>
            <p className="text-[12px] text-[var(--os-text-dim)] max-w-sm leading-relaxed">
              Talk to the ReAct agent — it can search, read/write files, run code in a sandbox,
              and answer with real tool output streamed live.
            </p>
            {authed === false && (
              <p className="text-[11px] text-[var(--os-amber)] font-mono">
                ⚠ no auth token found — sign in on the main site first
              </p>
            )}
          </div>
        )}
        {messages.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className={`px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words rounded-2xl ${ROLE_STYLE[m.role]} ${
              m.role === 'user' || m.role === 'answer' || m.role === 'error' ? 'rounded-br-sm' : ''
            }`}
          >
            {m.role === 'user' && (
              <span
                className="block px-4 py-2.5 rounded-2xl rounded-br-sm"
                style={{ background: 'linear-gradient(120deg, #6d7cff, #9b6dff)' }}
              >
                {m.text}
              </span>
            )}
            {m.role !== 'user' && (
              <>
                {m.meta && <span className="block text-[9.5px] font-mono tracking-wider uppercase opacity-60 mb-1">{m.meta}</span>}
                {m.text}
              </>
            )}
          </motion.div>
        ))}
        {streaming && (
          <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--os-text-faint)] pl-1">
            <span className="os-live-dot" /> agent working…
          </div>
        )}
      </div>

      <div className="os-panel p-2 flex items-end gap-2 shrink-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={authed === false ? 'Sign in on the main site to chat…' : 'Ask anything — Enter to send, Shift+Enter for newline'}
          disabled={streaming}
          className="flex-1 bg-transparent outline-none resize-none px-3 py-2 text-[13px] text-white placeholder:text-[var(--os-text-faint)] disabled:opacity-50 max-h-32"
        />
        {streaming ? (
          <button onClick={stop} className="os-btn text-[12px] px-3 py-2 shrink-0 text-[var(--os-red)]">
            ■ Stop
          </button>
        ) : (
          <button onClick={send} disabled={!input.trim()} className="os-btn os-btn-primary text-[12px] px-4 py-2 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
            Send ⟶
          </button>
        )}
      </div>
    </div>
  );
}
