'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { AgentEngine } from './useAgentEngine';

export default function PreviewPane({ prompt, agents }: { prompt: string; agents: AgentEngine['agents'] }) {
  const [stage, setStage] = useState(0);
  const doneCount = agents.filter((a) => a.status === 'done').length;

  useEffect(() => {
    const t = setInterval(() => setStage((s) => Math.min(s + 1, 4)), 1400);
    return () => clearInterval(t);
  }, []);

  const loading = doneCount < agents.length * 0.7;

  return (
    <div className="h-full bg-[#07080d] flex flex-col">
      <div className="flex items-center justify-between px-4 h-9 border-b border-[var(--os-border)] text-[11px] text-[var(--os-text-faint)]">
        <span>Live Preview</span>
        <span className="flex items-center gap-1.5">
          <span className="os-live-dot" />
          {loading ? 'building…' : 'ready'}
        </span>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {/* Holographic build preview */}
        <div className="absolute inset-4 os-panel os-hud overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[var(--os-border)]">
            <div className="text-[11px] text-[var(--os-text-faint)] uppercase tracking-widest">Generating</div>
            <div className="text-white font-medium mt-0.5 truncate text-sm">{prompt || '—'}</div>
          </div>

          <div className="flex-1 relative flex items-center justify-center">
            {/* Animated blueprint rings */}
            {[0, 1, 2].map((r) => (
              <motion.div
                key={r}
                className="absolute rounded-full border"
                style={{ borderColor: 'rgba(109,124,255,0.15)' }}
                animate={{ width: [80 + r * 60, 200 + r * 80, 80 + r * 60], height: [80 + r * 60, 200 + r * 80, 80 + r * 60] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: r * 0.5 }}
              />
            ))}

            {/* Building blocks */}
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-10 h-10 rounded-xl border"
                style={{ borderColor: `rgba(${[109,124,255][i % 3]},${0.3})`, background: `rgba(${[109,124,255][i % 3]},0.06)` }}
                animate={{
                  y: [0, -20 - i * 4, 0],
                  rotate: [0, 10 * (i % 2 === 0 ? 1 : -1), 0],
                  opacity: stage >= 1 ? 0.9 : 0.3,
                }}
                transition={{ duration: 2.4 + i * 0.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
              />
            ))}

            {/* Core */}
            <motion.div
              className="w-20 h-20 rounded-2xl"
              style={{ background: 'linear-gradient(135deg, #6d7cff, #9b6dff)', boxShadow: '0 0 60px rgba(109,124,255,0.5)' }}
              animate={{ scale: [1, 1.12, 1], rotate: [0, 5, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />

            <div className="absolute bottom-6 text-center w-full">
              <motion.p
                className="font-mono text-[11px] text-[var(--os-text-dim)]"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              >
                {loading ? `assembling · ${doneCount}/13 agents` : '✓ build complete — launch preview'}
              </motion.p>
            </div>
          </div>
        </div>

        {/* Fade in real preview when done */}
        <motion.div
          className="absolute inset-4 bg-white"
          initial={false}
          animate={{ opacity: loading ? 0 : 1, y: loading ? 20 : 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <iframe title="preview" src="/ai-builder.html" className="w-full h-full border-0" sandbox="allow-scripts" />
        </motion.div>
      </div>
    </div>
  );
}
