'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

const SERVER = 'http://localhost:5000';

const navGroups = [
  {
    label: 'Platform',
    items: [
      { label: 'Control Panel', href: `${SERVER}/control-panel.html` },
      { label: 'Dashboard', href: `${SERVER}/dashboard.html` },
      { label: 'Pricing', href: `${SERVER}/pricing.html` },
      { label: 'Shop', href: `${SERVER}/shop.html` },
    ],
  },
  {
    label: 'AI Tools',
    items: [
      { label: 'AI Builder', href: `${SERVER}/ai-builder.html` },
      { label: 'AI Health', href: `${SERVER}/ai-health.html` },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Login', href: `${SERVER}/login.html` },
      { label: 'Register', href: `${SERVER}/register.html` },
      { label: 'Profile', href: `${SERVER}/profile.html` },
    ],
  },
  {
    label: 'More',
    items: [
      { label: 'Blog', href: `${SERVER}/blog.html` },
      { label: 'Gallery', href: `${SERVER}/gallery.html` },
      { label: 'Docs', href: `${SERVER}/docs.html` },
      { label: 'Support', href: `${SERVER}/support.html` },
    ],
  },
];

function Dropdown({ label, items }: { label: string; items: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen(!open)}
        className="font-inter text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1"
      >
        {label}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-[8px]"
        >
          ▾
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-44 bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/[0.06] rounded-xl overflow-hidden"
          >
            {items.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="block px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/[0.04] transition-colors font-inter"
              >
                {item.label}
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? 'bg-[#0a0a0a]/80 backdrop-blur-md' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="font-syne text-sm tracking-[0.3em] uppercase hover:opacity-80 transition-opacity">
          KEYCODE
        </Link>
        <div className="flex items-center gap-8">
          <Link href="/#work" className="font-inter text-sm text-white/60 hover:text-white transition-colors">Work</Link>
          {navGroups.map((group) => (
            <Dropdown key={group.label} label={group.label} items={group.items} />
          ))}
          <a href={`${SERVER}/login.html`} className="px-4 py-1.5 rounded-full border border-white/20 text-sm text-white/80 hover:bg-white hover:text-black transition-all font-inter">
            Sign In
          </a>
        </div>
      </div>
    </motion.nav>
  );
}
