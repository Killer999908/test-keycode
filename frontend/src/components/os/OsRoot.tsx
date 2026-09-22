'use client';

import { useRef, useEffect } from 'react';
import { useAgentEngine } from './useAgentEngine';
import Universe from './Universe';
import OsShell from './OsShell';
import HomePrompt from './HomePrompt';
import Workbench from './Workbench';
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

  return (
    <>
      {/* Cursor ambient glow */}
      <div ref={glowRef} className="os-cursor-glow" style={{ opacity: engine.mode === 'workbench' ? 0.5 : 1 }} />

      {/* Living universe background */}
      <Universe mode={engine.mode === 'workbench' ? 'workbench' : 'home'} />

      {/* OS chrome */}
      <OsShell engine={engine} />

      {/* Main stage */}
      <main className="relative z-10 min-h-screen">
        <AnimatePresence mode="wait">
          {engine.mode !== 'workbench' ? (
            <HomePrompt key="home" onBuild={engine.startBuild} bootPhase={engine.bootPhase} />
          ) : (
            <Workbench key="workbench" engine={engine} />
          )}
        </AnimatePresence>
      </main>
    </>
  );
}
