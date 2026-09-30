'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { AgentEngine } from '../useAgentEngine';

const BUILDER_COPY: Record<
  string,
  { tagline: string; placeholder: string; suggestions: string[]; accent: string }
> = {
  web: {
    tagline: 'Describe a site or web app — the frontend, backend & database agents assemble it live.',
    placeholder: 'e.g. A landing page for my coffee startup with pricing and testimonials…',
    suggestions: ['SaaS landing page with dark mode', 'Blog with CMS', 'REST API + admin panel'],
    accent: '#9b6dff',
  },
  cad: {
    tagline: 'Describe a mechanical part or product — get parametric 3D geometry you can inspect and export.',
    placeholder: 'e.g. A drone frame with foldable arms and motor mounts…',
    suggestions: ['Camera gimbal bracket', 'Custom enclosure with vents', 'Gearbox housing'],
    accent: '#38d6ff',
  },
  pcb: {
    tagline: 'Describe a circuit — components are picked, the board is auto-routed, and gerbers are validated for fabrication.',
    placeholder: 'e.g. An ESP32 temperature logger with USB-C and a small OLED…',
    suggestions: ['555 LED flasher', 'Drone flight controller', 'Smart home sensor node'],
    accent: '#ff5d6c',
  },
  game: {
    tagline: 'Describe a game — scene, physics, and gameplay loop generated and playable in the preview.',
    placeholder: 'e.g. A neon endless runner with a grappling hook…',
    suggestions: ['Space shooter with waves', 'Physics puzzle platformer', 'Top-down roguelike'],
    accent: '#ffc46b',
  },
};

/**
 * Builder panes (Web / CAD / PCB / Game) — a focused prompt surface that
 * routes the description into the live build workbench (engine.startBuild).
 */
export default function BuilderPane({ kind, engine }: { kind: string; engine: AgentEngine }) {
  const copy = BUILDER_COPY[kind] ?? BUILDER_COPY.web;
  const [value, setValue] = useState('');
  const [focus, setFocus] = useState(false);

  const launch = (prompt: string) => {
    const p = prompt.trim();
    if (!p) return;
    engine.setActiveNav('dashboard');
    engine.startBuild(p);
  };

  const title = kind === 'web' ? 'Web Builder' : kind === 'cad' ? 'CAD Studio' : kind === 'pcb' ? 'PCB Studio' : 'Game Studio';

  return (
    <div className="h-full overflow-y-auto os-scrollbar flex flex-col items-center justify-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl"
      >
        <div className="text-center mb-8">
          <div className="os-display text-3xl mb-2">
            <span className="os-grad-text">{title}</span>
          </div>
          <p className="text-[12.5px] text-[var(--os-text-dim)] max-w-md mx-auto leading-relaxed">{copy.tagline}</p>
        </div>

        <div
          className={`relative transition-all duration-500 rounded-2xl ${
            focus
              ? 'border shadow-[0_0_80px_-20px_var(--os-glow)]'
              : 'border border-[var(--os-border)]'
          }`}
          style={{
            borderColor: focus ? `${copy.accent}80` : undefined,
            background: 'linear-gradient(180deg, rgba(13,16,26,0.85), rgba(8,10,18,0.9))',
            backdropFilter: 'blur(24px)',
          }}
        >
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                launch(value);
              }
            }}
            rows={3}
            placeholder={copy.placeholder}
            className="w-full bg-transparent outline-none resize-none px-5 pt-5 pb-2 text-[15px] text-white placeholder:text-[var(--os-text-faint)] leading-relaxed"
          />
          <div className="flex items-center justify-between px-5 pb-4 pt-1">
            <span className="font-mono text-[10px] text-[var(--os-text-faint)]">
              Enter to build · Shift+Enter for newline
            </span>
            <button
              onClick={() => launch(value)}
              disabled={!value.trim()}
              className="os-btn os-btn-primary flex items-center gap-2 text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>⟶</span>
              <span>Build it</span>
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3 text-center">
            Or start from
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {copy.suggestions.map((s, i) => (
              <motion.button
                key={s}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.45 }}
                whileHover={{ y: -2 }}
                onClick={() => launch(s)}
                className="os-panel os-panel-hover px-3.5 py-2 text-[12px] text-[var(--os-text-dim)] hover:text-white rounded-full"
              >
                {s}
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
