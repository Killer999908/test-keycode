'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { motion } from 'framer-motion';
import AiButton from './AiButton';

const services = [
  {
    title: 'AI & Automation',
    description: 'Leverage specialized AI models to generate production-ready designs, automate creative workflows, and accelerate your entire creative process.',
  },
  {
    title: '3D & WebGL',
    description: 'Immersive 3D experiences built with React Three Fiber and Three.js — performant, interactive, and visually stunning at a silky 60 FPS.',
  },
  {
    title: 'Design Systems',
    description: 'Scalable, responsive design systems with Tailwind CSS, Framer Motion, and GSAP — animated with purpose, consistent by design, built to last.',
  },
];

function ServiceCard({ title, description, index }: { title: string; description: string; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = cardRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.from(el, {
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          end: 'top 25%',
          toggleActions: 'play none none reverse',
        },
        opacity: 0,
        rotationY: 10,
        rotationX: 5,
        y: 40,
        z: -30,
        scale: 0.92,
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
    setTilt({ x: (y - 0.5) * -12, y: (x - 0.5) * 12 });
  };

  const handleMouseLeave = () => setTilt({ x: 0, y: 0 });

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: '1000px' }}
    >
      <motion.div
        className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-8 md:p-10 backdrop-blur-sm group hover:bg-white/[0.04] transition-colors"
        animate={{
          rotateX: tilt.x,
          rotateY: tilt.y,
          scale: tilt.x !== 0 || tilt.y !== 0 ? 1.02 : 1,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <span className="text-5xl font-syne font-bold text-white/5 block mb-6" style={{ transform: 'translateZ(20px)' }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <h3 className="text-2xl font-syne font-bold mb-4" style={{ transform: 'translateZ(15px)' }}>{title}</h3>
        <p className="text-white/50 leading-relaxed text-sm" style={{ transform: 'translateZ(10px)' }}>{description}</p>
      </motion.div>
    </div>
  );
}

export default function Sections() {
  const visionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      if (visionRef.current) {
        gsap.from(visionRef.current.querySelectorAll<HTMLElement>('.vision-line'), {
          scrollTrigger: {
            trigger: visionRef.current,
            start: 'top 80%',
            end: 'top 30%',
            toggleActions: 'play none none reverse',
          },
          opacity: 0,
          y: 60,
          stagger: 0.2,
          duration: 1,
          ease: 'power3.out',
        });
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <>
      <section ref={visionRef} className="py-48 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-xs tracking-[0.35em] text-white/30 mb-12 font-syne uppercase"
          >
            Our Vision
          </motion.p>
          <p className="vision-line text-4xl md:text-7xl font-syne font-bold leading-[1.1]">
            Architect digital worlds
          </p>
          <p className="vision-line text-4xl md:text-7xl font-syne font-bold leading-[1.1] text-white/70 mt-4">
            that move hearts
          </p>
          <p className="vision-line text-4xl md:text-7xl font-syne font-bold leading-[1.1] text-white/40 mt-4">
            and spark hope.
          </p>
        </div>
      </section>

      <section className="py-32 px-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-xs tracking-[0.35em] text-white/30 mb-4 font-syne uppercase"
          >
            Expertise
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 40, rotateX: -10 }}
            whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl md:text-6xl font-syne font-bold mb-16"
            style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
          >
            What We Do
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-6">
            {services.map((service, i) => (
              <ServiceCard key={i} {...service} index={i} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-48 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-xs tracking-[0.35em] text-white/30 mb-8 font-syne uppercase"
          >
            Let&apos;s Create
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 40, rotateX: -15 }}
            whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl md:text-8xl font-syne font-bold mb-6 leading-[1.1]"
            style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
          >
            Ready to Build
            <br />
            Something Extraordinary?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-white/40 text-base md:text-lg mb-12 max-w-lg mx-auto"
          >
            Partner with us to create award-winning digital experiences that push the boundaries of what&apos;s possible on the web.
          </motion.p>
          <AiButton>Get in Touch</AiButton>
        </div>
      </section>
    </>
  );
}
