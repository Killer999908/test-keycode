'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const EXAMPLE_PROMPTS = [
  'Build Netflix clone',
  'Create a drone PCB',
  'Generate a 3D engine',
  'Design an electric skateboard',
  'Build an AI startup',
  'Generate an Unreal Engine game',
  'Generate an ERP software',
  'Design a smart home hub',
];

export default function HomePrompt({
  onBuild,
  bootPhase,
}: {
  onBuild: (prompt: string) => void;
  bootPhase: 'offline' | 'booting' | 'online';
}) {
  const [value, setValue] = useState('');
  const [focus, setFocus] = useState(false);
  const [typedGreeting, setTypedGreeting] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const greeting = 'Hello. What would you like to build today?';

  useEffect(() => {
    if (bootPhase !== 'online') return;
    let i = 0;
    const type = setInterval(() => {
      i++;
      setTypedGreeting(greeting.slice(0, i));
      if (i >= greeting.length) clearInterval(type);
    }, 26);
    return () => clearInterval(type);
  }, [bootPhase]);

  const submit = () => {
    const p = value.trim();
    if (!p) return;
    onBuild(p);
  };

  return (
    <div className="relative z-10 w-full max-w-3xl mx-auto px-6 flex flex-col items-center pt-[18vh]">
      <AnimatePresence mode="wait">
        {bootPhase === 'offline' && (
          <motion.div
            key="boot"
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <div className="os-display text-xl tracking-[0.5em] uppercase text-[var(--os-text-dim)]">
              KEYCODE<span className="text-[var(--os-accent)]">OS</span>
            </div>
            <div className="os-loading-bar w-64 mx-auto mt-8" />
          </motion.div>
        )}

        {bootPhase === 'booting' && (
          <motion.div
            key="boot2"
            exit={{ opacity: 0, y: -20, filter: 'blur(8px)' }}
            transition={{ duration: 0.6 }}
            className="text-center font-mono text-sm text-[var(--os-text-dim)]"
          >
            <p>initializing neural core…</p>
            <p className="mt-2 text-[var(--os-text-faint)]">loading 13 agents · mounting universe</p>
          </motion.div>
        )}

        {bootPhase === 'online' && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="w-full text-center"
          >
            <h1 className="os-display text-[clamp(2rem,6vw,4.2rem)] leading-[1.05] text-white">
              <span className="os-grad-text">{typedGreeting || '\u00A0'}</span>
              <span className="os-caret" />
            </h1>

            <p className="mt-4 text-sm text-[var(--os-text-dim)] max-w-md mx-auto">
              Describe any product. KEYCODE assembles an autonomous team to design, build, and deploy it live.
            </p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative mt-10"
            >
              <div
                className={`relative transition-all duration-500 rounded-2xl ${
                  focus
                    ? 'border border-[rgba(109,124,255,0.5)] shadow-[0_0_80px_-20px_var(--os-glow)]'
                    : 'border border-[var(--os-border)]'
                }`}
                style={{
                  background: 'linear-gradient(180deg, rgba(13,16,26,0.85), rgba(8,10,18,0.9))',
                  backdropFilter: 'blur(24px)',
                }}
              >
                <textarea
                  ref={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onFocus={() => setFocus(true)}
                  onBlur={() => setFocus(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  rows={2}
                  placeholder="e.g. Build an electric skateboard with live telemetry…"
                  className="w-full bg-transparent outline-none resize-none px-6 pt-6 pb-2 text-left text-[clamp(1.05rem,2vw,1.35rem)] text-white placeholder:text-[var(--os-text-faint)] font-[var(--os-font-ui)] leading-relaxed"
                />
                <div className="flex items-center justify-between px-6 pb-4 pt-1">
                  <span className="font-mono text-[10px] text-[var(--os-text-faint)]">
                    Enter to build · Shift+Enter for newline
                  </span>
                  <button
                    onClick={submit}
                    disabled={!value.trim()}
                    className="os-btn os-btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="text-sm">⟶</span>
                    <span>Build it</span>
                  </button>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="mt-10"
            >
              <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-4">
                Or try a suggestion
              </div>
              <div className="flex flex-wrap justify-center gap-2.5 max-w-2xl mx-auto">
                {EXAMPLE_PROMPTS.map((p, i) => (
                  <motion.button
                    key={p}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9 + i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    whileHover={{ y: -3, scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onBuild(p)}
                    className="os-panel os-panel-hover px-4 py-2 text-[13px] text-[var(--os-text-dim)] hover:text-white rounded-full"
                  >
                    {p}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
