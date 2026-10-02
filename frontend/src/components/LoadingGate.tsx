'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const TAGLINE = 'Where excellence meets intelligence';
const MIN_MS = 2200; // let the counter land on 100 and breathe before the wipe
const MAX_MS = 6500; // never trap the visitor behind a stuck loader

const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(t, 1), 3);

/**
 * Alche-Studio-style preloader:
 *  - full black overlay (the page acts as a dark stage for the WebGL scene behind it)
 *  - huge white percentage counter ticking 0 → 100 with a thin hairline progress bar
 *  - letter-spaced tagline that reveals word by word
 *  - exits with a page-wipe: the black panel slides up like a curtain (1.5s transition)
 */
export default function LoadingGate({ children }: { children: React.ReactNode }) {
  const [start] = useState(() => Date.now());
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);
  const readyAt = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;

    const markReady = () => {
      if (readyAt.current === null) readyAt.current = Date.now() - start;
    };
    if (document.readyState === 'complete') markReady();
    else window.addEventListener('load', markReady, { once: true });

    // treat "load" as done even if the event never fires
    const fallback = setTimeout(markReady, MAX_MS - MIN_MS);

    const tick = () => {
      const elapsed = Date.now() - start;
      let p: number;
      if (readyAt.current === null) {
        // crawl toward 88 while assets are still loading
        p = easeOutCubic(elapsed / 1600) * 88;
      } else {
        // glide 88 → 100 in the half-second after load completes
        p = 88 + 12 * easeOutCubic((elapsed - readyAt.current) / 500);
      }
      setProgress(p);
      if (p >= 99.9 && elapsed >= MIN_MS) {
        setDone(true);
        return; // stop the loop — the curtain takes over
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('load', markReady);
      clearTimeout(fallback);
    };
  }, [start]);

  // unmount the overlay once the curtain wipe finishes
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setGone(true), 1900);
    return () => clearTimeout(t);
  }, [done]);

  const shown = Math.round(progress);

  return (
    <>
      <AnimatePresence>
        {!gone && (
          <motion.div
            key="loader"
            initial={{ y: 0 }}
            exit={done ? { y: '-100%' } : undefined}
            transition={{ duration: 1.5, ease: [0.76, 0, 0.24, 1] }}
            className="fixed inset-0 z-[9999] bg-black flex flex-col justify-between p-6 sm:p-10"
            style={{ pointerEvents: done ? 'none' : 'auto' }}
            aria-hidden={done}
          >
            {/* top row — wordmark left, status right */}
            <div className="flex items-center justify-between">
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8 }}
                className="text-[11px] font-medium tracking-[0.45em] text-white"
              >
                KEYCODE
              </motion.span>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="text-[10px] font-medium tracking-[0.3em] text-[#7e7e7e]"
              >
                {done ? 'ENTERING' : 'LOADING'}
              </motion.span>
            </div>

            {/* center — tagline, revealed word by word */}
            <div className="flex flex-col items-center text-center px-4">
              <p className="max-w-xl text-sm sm:text-base leading-relaxed text-[#bababa] overflow-hidden">
                {TAGLINE.split(' ').map((word, i) => (
                  <motion.span
                    key={`${word}-${i}`}
                    initial={{ y: '110%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.35 + i * 0.09, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="inline-block mr-[0.45em] last:mr-0"
                  >
                    {word}
                  </motion.span>
                ))}
              </p>
              {/* thin hairline progress — restraint over spectacle */}
              <div className="mt-8 h-px w-40 bg-white/15 overflow-hidden">
                <div
                  className="h-full bg-white/70 origin-left transition-[width] duration-150 ease-out"
                  style={{ width: `${shown}%` }}
                />
              </div>
            </div>

            {/* bottom row — giant counter left, hairline footer right */}
            <div className="flex items-end justify-between">
              <span
                className="text-[16vw] sm:text-[11vw] leading-[0.8] font-normal text-white tabular-nums select-none"
                style={{ fontFamily: 'var(--font-syne), Inter, sans-serif' }}
              >
                {shown}
                <span className="text-[0.35em] text-[#7e7e7e] ml-1">%</span>
              </span>
              <span className="text-[9px] tracking-[0.35em] text-[#7e7e7e] pb-2 hidden sm:block">
                DIGITAL CREATION STUDIO
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* page content fades up as the curtain lifts */}
      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.35 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
