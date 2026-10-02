'use client';

import { useRef, useEffect } from 'react';
import { useAgentEngine } from './useAgentEngine';
import Universe from './Universe';
import OsShell from './OsShell';
import Workbench from './Workbench';
import { PANES, PLACEHOLDER_NAV } from './panes';
import PlaceholderPane from './panes/PlaceholderPane';
import { AnimatePresence } from 'framer-motion';

export default function OsRoot() {
  const engine = useAgentEngine();
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (glowRef.current) {
        glowRef.current.style.transform = `translate(${e.clientX - 300}px, ${e.clientY - 300}px)`;
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const Pane = PANES[engine.activeNav];

  let stage: React.ReactNode;
  if (engine.mode === 'workbench') {
    // A build is streaming — the workbench owns the stage no matter which nav item is active.
    stage = <Workbench key="workbench" engine={engine} />;
  } else if (Pane) {
    stage = <Pane key={engine.activeNav} engine={engine} />;
  } else {
    const ph = PLACEHOLDER_NAV[engine.activeNav];
    stage = <PlaceholderPane key={engine.activeNav} label={ph?.label ?? engine.activeNav} icon={ph?.icon ?? '◌'} />;
  }

  const padded = engine.mode !== 'workbench' && engine.activeNav !== 'dashboard';

  return (
    <>
      {/* Cursor ambient glow */}
      <div ref={glowRef} className="os-cursor-glow" style={{ opacity: engine.mode === 'workbench' ? 0.5 : 1 }} />

      {/* Living universe background */}
      <Universe mode={engine.mode === 'workbench' ? 'workbench' : 'home'} />

      {/* OS chrome */}
      <OsShell engine={engine} />

      {/* Main stage */}
      <main className="relative z-10 min-h-screen pt-11 pl-[216px]">
        <AnimatePresence mode="wait">
          <div key="stage" className={padded ? 'h-full p-3' : 'h-full'}>
            {stage}
          </div>
        </AnimatePresence>
      </main>
    </>
  );
}
