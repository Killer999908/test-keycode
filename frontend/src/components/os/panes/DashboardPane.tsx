'use client';

import { motion } from 'framer-motion';
import HomePrompt from '../HomePrompt';
import type { AgentEngine } from '../useAgentEngine';

/**
 * Dashboard — the OS home. Delegates to HomePrompt (boot sequence + build
 * prompt); the Workbench takes over the stage once a build starts.
 */
export default function DashboardPane({ engine }: { engine: AgentEngine }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      <HomePrompt bootPhase={engine.bootPhase} onBuild={engine.startBuild} />
    </motion.div>
  );
}
