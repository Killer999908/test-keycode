'use client';

import { motion } from 'framer-motion';

const socialLinks = [
  { label: 'Twitter', href: '#' },
  { label: 'GitHub', href: '#' },
  { label: 'Dribbble', href: '#' },
  { label: 'LinkedIn', href: '#' },
];

const pageLinks = [
  { label: 'Work', href: '#work' },
  { label: 'Services', href: '#services' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
];

function FooterLink({ href, children }: { href: string; children: string }) {
  return (
    <motion.a
      href={href}
      className="text-sm text-white/40 hover:text-white transition-colors inline-block"
      whileHover={{ x: 4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {children}
    </motion.a>
  );
}

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-3 gap-12 mb-16">
          <div>
            <motion.span
              className="font-syne text-lg tracking-[0.3em] uppercase inline-block"
              whileHover={{ letterSpacing: '0.4em' }}
              transition={{ duration: 0.3 }}
            >
              KEYCODE
            </motion.span>
            <p className="mt-4 text-sm text-white/40 leading-relaxed max-w-xs">
              Award-winning digital creation studio. We build immersive, performant web experiences.
            </p>
          </div>
          <div>
            <h4 className="font-syne text-sm tracking-[0.2em] uppercase text-white/60 mb-6">Pages</h4>
            <div className="flex flex-col gap-3">
              {pageLinks.map((link) => (
                <FooterLink key={link.label} href={link.href}>
                  {link.label}
                </FooterLink>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-syne text-sm tracking-[0.2em] uppercase text-white/60 mb-6">Social</h4>
            <div className="flex flex-col gap-3">
              {socialLinks.map((link) => (
                <FooterLink key={link.label} href={link.href}>
                  {link.label}
                </FooterLink>
              ))}
            </div>
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="pt-8 border-t border-white/[0.06] text-center text-xs text-white/20"
        >
          &copy; {new Date().getFullYear()} KEYCODE. All rights reserved.
        </motion.div>
      </div>
    </footer>
  );
}
