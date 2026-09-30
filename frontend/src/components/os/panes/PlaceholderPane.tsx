'use client';

import { motion } from 'framer-motion';

/**
 * Placeholder for system modules that exist in the nav but are not wired to
 * a backend yet (Terminal, Deployments, Marketplace, Team, Analytics,
 * Memory, Settings).
 */
export default function PlaceholderPane({ label, icon }: { label: string; icon: string }) {
  return (
    <div className="h-full flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="os-panel os-hud p-10 text-center max-w-sm"
      >
        <div
          className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center text-xl mb-4"
          style={{ background: 'rgba(109,124,255,0.1)', border: '1px solid rgba(109,124,255,0.3)', color: 'var(--os-accent)' }}
        >
          {icon}
        </div>
        <div className="os-display text-lg mb-1.5 text-white">{label}</div>
        <p className="text-[11.5px] text-[var(--os-text-dim)] leading-relaxed">
          This module is on the roadmap. Until it ships, the Dashboard, Projects,
          AI Chat, and the four builders are fully operational.
        </p>
        <div className="os-loading-bar w-32 mx-auto mt-5" />
      </motion.div>
    </div>
  );
}
