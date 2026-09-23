'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function LoadingGate({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState(false);
  const startTime = useRef<number | null>(null);
  if (startTime.current === null) startTime.current = Date.now();

  useEffect(() => {
    let ready = false;

    function tryDismiss() {
      const elapsed = Date.now() - (startTime.current ?? Date.now());
      if (ready && elapsed >= 2500) {
        setDone(true);
        return true;
      }
      return false;
    }

    function waitAndDismiss() {
      if (!tryDismiss()) requestAnimationFrame(waitAndDismiss);
    }

    const onLoad = () => {
      ready = true;
      waitAndDismiss();
    };

    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad);

    const fallback = setTimeout(() => {
      ready = true;
      setDone(true);
    }, 6000);

    return () => {
      window.removeEventListener('load', onLoad);
      clearTimeout(fallback);
    };
  }, []);

  return (
    <>
      <AnimatePresence>
        {!done && (
          <motion.div
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="fixed inset-0 z-[9999] bg-[#0a0a0a] flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-16 h-[1px] bg-white/30 origin-left"
            />
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="mt-6 font-syne text-xs tracking-[0.35em] text-white/40"
            >
              KEYCODE
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
