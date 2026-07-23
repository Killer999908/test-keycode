'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

const particles = [
  { x: -35, y: -30, delay: 0 },
  { x: 35, y: -25, delay: 0.08 },
  { x: -25, y: 30, delay: 0.16 },
  { x: 30, y: 28, delay: 0.24 },
  { x: -40, y: 0, delay: 0.32 },
  { x: 40, y: 5, delay: 0.4 },
  { x: 0, y: -35, delay: 0.48 },
  { x: 0, y: 35, delay: 0.56 },
];

export default function AiButton({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`relative px-10 py-4 rounded-full text-sm tracking-wider uppercase font-semibold overflow-hidden group ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="absolute inset-0 bg-white rounded-full" />

      <motion.div
        animate={{
          opacity: hovered ? 1 : 0,
          scale: hovered ? 1 : 0.8,
        }}
        transition={{ duration: 0.4 }}
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.5), transparent 70%)',
          filter: 'blur(20px)',
        }}
      />

      <motion.div
        animate={{
          boxShadow: hovered
            ? '0 0 40px rgba(255,255,255,0.25), 0 0 80px rgba(255,255,255,0.1)'
            : '0 0 0px rgba(255,255,255,0)',
        }}
        transition={{ duration: 0.5 }}
        className="absolute inset-0 rounded-full"
      />

      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute w-[2px] h-[2px] rounded-full bg-white top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={
            hovered
              ? {
                  x: p.x,
                  y: p.y,
                  opacity: [0, 0.9, 0],
                  scale: [0, 1, 0],
                  transition: {
                    duration: 0.7,
                    delay: p.delay,
                    repeat: Infinity,
                    ease: 'easeOut',
                  },
                }
              : { x: 0, y: 0, opacity: 0, scale: 0 }
          }
        />
      ))}

      <span className="relative text-black font-inter mix-blend-difference">{children}</span>
    </motion.button>
  );
}
