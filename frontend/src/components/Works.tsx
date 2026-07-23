'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

function NovaMockup() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#1e1b4b] to-[#0f0a1a] flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.04]">
        <div className="absolute top-[10%] left-[15%] w-[1px] h-[80%] bg-white" />
        <div className="absolute top-[10%] left-[55%] w-[1px] h-[80%] bg-white" />
        <div className="absolute top-[30%] left-[10%] h-[1px] w-[80%] bg-white" />
        <div className="absolute top-[60%] left-[10%] h-[1px] w-[80%] bg-white" />
      </div>
      {[30, 50, 70].map((x, i) => (
        <div key={i} className="absolute w-10 h-10 rounded-full border border-[#818cf8]" style={{ left: `${x}%`, top: `${30 + i * 18}%`, opacity: 0.15 + i * 0.05 }} />
      ))}
      <div className="absolute top-[25%] left-[35%] w-3 h-3 rounded-full bg-[#818cf8] opacity-40 shadow-lg shadow-[#818cf8]/30" />
      <div className="absolute top-[45%] left-[60%] w-2 h-2 rounded-full bg-[#a78bfa] opacity-30" />
      <div className="absolute top-[55%] left-[25%] w-2.5 h-2.5 rounded-full bg-[#6366f1] opacity-35" />
      <div className="absolute bottom-[20%] right-[15%] w-16 h-8 rounded border border-[#818cf8]/20">
        <div className="h-full w-[60%] bg-[#818cf8]/10 rounded-l" />
      </div>
      <span className="relative font-syne text-5xl font-bold text-white/[0.06]">N</span>
    </div>
  );
}

function EthelMockup() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#064e3b] to-[#022c22] flex items-center justify-center relative overflow-hidden">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="absolute border border-[#34d399] rounded"
          style={{
            width: `${100 - i * 20}px`,
            height: `${80 - i * 16}px`,
            opacity: 0.3 - i * 0.08,
            transform: `rotate(${15 + i * 5}deg)`,
            top: `${40 + i * 8}%`,
            left: `${30 + i * 8}%`,
          }}
        />
      ))}
      <div className="absolute w-px h-16 bg-[#34d399]/30 top-[25%] left-[50%]" />
      <div className="absolute w-16 h-px bg-[#34d399]/30 top-[40%] left-[30%]" />
      <div className="absolute w-px h-12 bg-[#34d399]/20 top-[55%] left-[60%]" />
      <div className="absolute bottom-[20%] left-[20%] flex gap-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-4 h-1.5 rounded-full bg-[#34d399]/30" />
        ))}
      </div>
      <span className="relative font-syne text-5xl font-bold text-white/[0.06]">E</span>
    </div>
  );
}

function SolarisMockup() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#422006] to-[#1c0f00] flex items-center justify-center relative overflow-hidden">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 140" preserveAspectRatio="none">
        <defs>
          <linearGradient id="solaris-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb923c" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points="0,120 20,80 40,95 60,55 80,70 100,30 120,55 140,40 160,60 180,35 200,50"
          fill="none"
          stroke="#fb923c"
          strokeWidth="1.5"
          opacity="0.5"
        />
        <polygon
          points="0,120 20,80 40,95 60,55 80,70 100,30 120,55 140,40 160,60 180,35 200,50 200,120"
          fill="url(#solaris-gradient)"
        />
      </svg>
      <div className="absolute top-[20%] right-[15%] flex flex-col gap-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-6 h-1 rounded bg-[#fb923c]/20" />
        ))}
      </div>
      <div className="absolute bottom-[20%] left-[15%] w-8 h-8 rounded-full border border-[#fb923c]/20" />
      <span className="relative font-syne text-5xl font-bold text-white/[0.06]">S</span>
    </div>
  );
}

function AuraMockup() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#4c0519] to-[#1a0005] flex items-center justify-center relative overflow-hidden">
      {[35, 55, 75, 95, 115].map((r, i) => (
        <div
          key={i}
          className="absolute rounded-full border border-[#f43f5e]"
          style={{
            width: r * 2,
            height: r * 2,
            opacity: 0.2 - i * 0.03,
            top: `calc(50% - ${r}px)`,
            left: `calc(50% - ${r}px)`,
          }}
        />
      ))}
      <div className="absolute bottom-[25%] left-[20%] right-[20%] flex items-end gap-[2px]">
        {[4, 8, 6, 12, 9, 15, 11, 7, 10, 5].map((h, i) => (
          <div key={i} className="flex-1 bg-gradient-to-t from-[#f43f5e]/30 to-transparent rounded-t" style={{ height: `${h * 3}px` }} />
        ))}
      </div>
      <span className="relative font-syne text-5xl font-bold text-white/[0.06]">A</span>
    </div>
  );
}

function VertexMockup() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#083344] to-[#041a24] flex items-center justify-center relative overflow-hidden">
      <div className="grid grid-cols-2 gap-2 p-4 w-full h-full">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded border border-[#22d3ee]/10 bg-[#155e75]/10 p-2 flex flex-col gap-1">
            <div className="flex-1 rounded bg-[#0e7490]/20" />
            <div className="h-1 w-[60%] rounded bg-[#22d3ee]/20" />
            <div className="h-1 w-[40%] rounded bg-[#22d3ee]/10" />
          </div>
        ))}
      </div>
      <span className="absolute font-syne text-5xl font-bold text-white/[0.04]">V</span>
    </div>
  );
}

function LumenMockup() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#3b0764] to-[#1a0030] flex items-center justify-center relative overflow-hidden">
      <div className="flex flex-col gap-2 p-4 w-full h-full">
        <div className="flex gap-2">
          <div className="h-3 flex-1 rounded bg-[#a855f7]/15" />
          <div className="h-3 w-12 rounded bg-[#a855f7]/10" />
          <div className="h-3 w-8 rounded bg-[#a855f7]/8" />
        </div>
        <div className="flex-1 rounded border border-[#a855f7]/10 p-2 flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-4 w-8 rounded bg-[#a855f7]/10" />
          ))}
        </div>
        <div className="flex gap-2">
          <div className="h-6 flex-1 rounded-full bg-[#a855f7]/15" />
          <div className="h-6 w-20 rounded-full border border-[#a855f7]/10" />
        </div>
      </div>
      <span className="absolute font-syne text-5xl font-bold text-white/[0.04]">L</span>
    </div>
  );
}

const projects = [
  { title: 'NOVA', category: 'AI Branding Platform', date: '2026', tags: ['AI', 'Branding', 'Next.js'], mockup: NovaMockup, description: 'Full-service AI branding platform with real-time generation and iterative refinement.' },
  { title: 'ETHEL', category: '3D Product Configurator', date: '2025', tags: ['Three.js', 'WebGL', 'R3F'], mockup: EthelMockup, description: 'Interactive 3D configurator for customizable product visualization at scale.' },
  { title: 'SOLARIS', category: 'Data Visualization', date: '2025', tags: ['D3', 'Canvas', 'Real-time'], mockup: SolarisMockup, description: 'Real-time data visualization dashboard handling millions of data points.' },
  { title: 'AURA', category: 'Immersive Web Experience', date: '2026', tags: ['WebGL', 'GSAP', '3D'], mockup: AuraMockup, description: 'Cinematic brand experience with scroll-driven 3D animations and transitions.' },
  { title: 'VERTEX', category: 'E-commerce Platform', date: '2025', tags: ['Next.js', 'Stripe', 'Tailwind'], mockup: VertexMockup, description: 'High-performance e-commerce platform serving tens of thousands of daily active users.' },
  { title: 'LUMEN', category: 'Design System', date: '2026', tags: ['React', 'Storybook', 'Figma'], mockup: LumenMockup, description: 'Comprehensive design system powering products across the entire organization.' },
];

function ProjectCard({ project, index }: { project: typeof projects[0]; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const Mockup = project.mockup;

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = cardRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.from(el, {
        scrollTrigger: {
          trigger: el,
          start: 'top 90%',
          end: 'top 30%',
          toggleActions: 'play none none reverse',
        },
        opacity: 0,
        y: 60,
        scale: 0.9,
        duration: 0.7,
        delay: index * 0.1,
        ease: 'power3.out',
      });
    });
    return () => ctx.revert();
  }, [index]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (y - 0.5) * -16, y: (x - 0.5) * 16 });
  };

  const handleMouseLeave = () => setTilt({ x: 0, y: 0 });

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="group cursor-pointer"
      style={{ perspective: '1000px' }}
    >
      <motion.div
        className="relative rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02]"
        animate={{
          rotateX: tilt.x,
          rotateY: tilt.y,
          scale: tilt.x !== 0 || tilt.y !== 0 ? 1.02 : 1,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div className="h-48 relative overflow-hidden">
          <Mockup />
          <span className="absolute top-4 right-4 text-[10px] font-mono text-white/40 bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">
            {project.date}
          </span>
        </div>
        <div className="p-6">
          <h3 className="font-syne text-xl font-bold mb-1">{project.title}</h3>
          <p className="text-sm text-white/40 mb-3">{project.category}</p>
          <p className="text-xs text-white/30 leading-relaxed mb-4">{project.description}</p>
          <div className="flex flex-wrap gap-2">
            {project.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-1 rounded-full border border-white/[0.08] text-white/30">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function Works() {
  return (
    <section id="work" className="py-32 px-6 border-t border-white/[0.06]">
      <div className="max-w-6xl mx-auto">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-xs tracking-[0.35em] text-white/30 mb-4 font-syne uppercase"
        >
          Portfolio
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl md:text-6xl font-syne font-bold mb-4"
        >
          Selected Work
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-white/40 text-base md:text-lg mb-16 max-w-xl"
        >
          A curated selection of projects that push the boundaries of digital design and technology.
        </motion.p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project, i) => (
            <ProjectCard key={i} project={project} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
