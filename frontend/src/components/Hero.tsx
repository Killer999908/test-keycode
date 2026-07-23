'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { motion } from 'framer-motion';

export default function Hero() {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      if (titleRef.current) {
        gsap.from(titleRef.current, {
          scrollTrigger: {
            trigger: titleRef.current,
            start: 'top 90%',
            end: 'top 30%',
            toggleActions: 'play none none reverse',
          },
          opacity: 0,
          y: 60,
          rotationX: 10,
          duration: 1.2,
          ease: 'power4.out',
        });
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
        className="text-center"
      >
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.6 }}
          className="text-xs tracking-[0.35em] text-white/40 mb-8 font-syne uppercase"
        >
          Digital Creation Studio
        </motion.p>
        <h1
          ref={titleRef}
          className="font-syne text-8xl md:text-[10rem] font-bold tracking-tight leading-[0.9]"
        >
          <span className="block">KEY</span>
          <span className="block">CODE</span>
        </h1>
        <p className="mt-8 text-base md:text-lg text-white/50 max-w-lg mx-auto font-inter leading-relaxed">
          We craft award-winning digital experiences powered by AI, built with precision, animated with purpose.
        </p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 1.2 }}
          className="mt-12"
        >
          <a
            href="/ai-builder.html"
            className="group relative inline-flex items-center gap-3 px-10 py-4 rounded-2xl text-base font-semibold text-white transition-all duration-300"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
              boxShadow: '0 0 40px rgba(99,102,241,0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 0 60px rgba(99,102,241,0.5)';
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 0 40px rgba(99,102,241,0.3)';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <span className="relative z-10 flex items-center gap-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
              </svg>
              Create with AI
            </span>
            <span className="absolute inset-0 rounded-2xl bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
          </a>
          <p className="text-xs text-white/30 mt-4 font-inter tracking-wide">
            Websites · 3D CAD · PCB Design · Firmware — powered by AI
          </p>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 0.8 }}
        className="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
      >
        <span className="font-syne text-[10px] tracking-[0.3em] text-white/20 uppercase">
          Scroll to explore
        </span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="w-[1px] h-10 bg-gradient-to-b from-white/40 to-transparent"
        />
      </motion.div>
    </section>
  );
}
