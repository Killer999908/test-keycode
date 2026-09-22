'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { AgentEngine } from './useAgentEngine';

const NAV_SECTIONS: { section: string; items: { id: string; label: string; icon: string }[] }[] = [
  {
    section: 'Workspace',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: '▦' },
      { id: 'projects', label: 'Projects', icon: '▤' },
      { id: 'ai-chat', label: 'AI Chat', icon: '◈' },
    ],
  },
  {
    section: 'Builders',
    items: [
      { id: 'web', label: 'Web Builder', icon: '⌬' },
      { id: 'cad', label: 'CAD Studio', icon: '▲' },
      { id: 'pcb', label: 'PCB Studio', icon: '⏚' },
      { id: 'game', label: 'Game Studio', icon: '✦' },
    ],
  },
  {
    section: 'System',
    items: [
      { id: 'terminal', label: 'Terminal', icon: '⌁' },
      { id: 'deploy', label: 'Deployments', icon: '↗' },
      { id: 'marketplace', label: 'Marketplace', icon: '⬡' },
      { id: 'team', label: 'Team', icon: '◉' },
      { id: 'analytics', label: 'Analytics', icon: '≋' },
      { id: 'memory', label: 'Memory', icon: '◍' },
      { id: 'settings', label: 'Settings', icon: '⚙' },
    ],
  },
];

function StatusClock() {
  const [now, setNow] = useState(new Date());
  useState(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return t;
  });
  return (
    <span className="font-mono text-[11px] text-[var(--os-text-dim)] tabular-nums">
      {now.toLocaleTimeString('en-US', { hour12: false })}
    </span>
  );
}

export default function OsShell({ engine }: { engine: AgentEngine }) {
  const [activeNav, setActiveNav] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Top status bar */}
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: engine.bootPhase === 'online' ? 0.2 : 3 }}
        className="fixed top-0 left-0 right-0 z-40 h-11 flex items-center justify-between px-4 bg-[rgba(5,6,10,0.6)] backdrop-blur-2xl border-b border-[var(--os-border)]"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5d6c]/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffc46b]/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#34e0a1]/70" />
          </div>
          <span className="ml-2 font-[var(--os-font-display)] text-[11px] tracking-[0.3em] uppercase text-[var(--os-text-dim)]">
            KEYCODE<span className="text-[var(--os-accent)]">OS</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-[11px] text-[var(--os-text-dim)] font-mono">
            <span className="os-live-dot" />
            Core online · 13 agents
          </span>
          <StatusClock />
        </div>
      </motion.header>

      {/* Left sidebar */}
      <motion.aside
        initial={{ x: -48, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: engine.bootPhase === 'online' ? 0.35 : 3 }}
        className="fixed left-0 top-11 bottom-0 z-40 w-[216px] bg-[rgba(5,6,10,0.5)] backdrop-blur-2xl border-r border-[var(--os-border)] flex flex-col os-scrollbar overflow-y-auto"
      >
        <div className="flex-1 py-4">
          {NAV_SECTIONS.map((group) => (
            <div key={group.section} className="mb-5">
              <div className="px-5 mb-1.5 text-[9px] tracking-[0.28em] uppercase text-[var(--os-text-faint)] font-medium">
                {group.section}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`w-full flex items-center gap-3 px-5 py-1.5 text-[13px] text-left transition-all duration-200 ${
                    activeNav === item.id
                      ? 'text-white bg-[rgba(109,124,255,0.1)] border-r-2 border-[var(--os-accent)]'
                      : 'text-[var(--os-text-dim)] hover:text-white hover:bg-[rgba(255,255,255,0.03)] border-r-2 border-transparent'
                  }`}
                >
                  <span className="w-4 text-center text-[var(--os-accent)]/70">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-[var(--os-border)]">
          <div className="os-panel p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="os-live-dot" />
              <span className="text-[11px] text-white/80 font-medium">Build Node</span>
            </div>
            <div className="os-loading-bar" />
            <div className="mt-2 font-mono text-[10px] text-[var(--os-text-faint)]">killer · edge-1 · amd64</div>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
