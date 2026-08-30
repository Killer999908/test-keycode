/* Centralized copy + section timing for the KEYCODE editorial overlay. */

export const CONTENT = {
  brand: 'KEYCODE',
  hero: {
    eyebrow: 'KEYCODE STUDIO',
    title: 'We architect<br><em>worlds.</em>',
    sub: 'AI-native studio — apps, 3D, CAD, PCBs. Minimal, professional, interactive.',
    primary: { label: 'Start Building', href: '/register.html' },
    secondary: { label: 'Explore', scroll: 1 },
    live: 'Drag 3D · Scroll'
  },
  acts: [
    {
      id: 'flagships',
      eyebrow: '01 · FLAGSHIPS',
      title: 'Four pipelines. One pod.',
      sub: 'AI · Game · 3D · Fab — each a complete system. Explore each on its dedicated page.',
      flagships: [
        { cat: 'AI', name: 'AI Full-Stack', tag: 'Code in real time', href: '/ai-builder.html' },
        { cat: 'GAME', name: 'Game Engine', tag: 'Fortnite-grade worlds', href: '/game-builder.html' },
        { cat: 'SCAN', name: '3D + CAD', tag: 'Scan → fab-ready', href: '/scan-3d.html' },
        { cat: 'MAKE', name: 'PCB Fab', tag: 'HDI + Gerber', href: '/tools.html' }
      ]
    },
    {
      id: 'works',
      eyebrow: '02 · WORKS',
      title: 'Selected ships.',
      sub: 'Three highlights — see all on Works. Each is a real, live deployment.',
      worksLink: '/gallery.html'
    },
    {
      id: 'cta',
      eyebrow: '03 · STUDIO',
      title: 'More inside.',
      sub: 'Services, agents, pricing, news — each on its own page, beautifully crafted.',
      ctaLinks: [
        { label: 'Services', href: '/tools.html', desc: 'All 7 categories →' },
        { label: 'Agents', href: '/docs.html', desc: '6 specialists →' },
        { label: 'Pricing', href: '/pricing.html', desc: 'Plans →' },
        { label: 'News', href: '/news.html', desc: 'Press →' }
      ]
    }
  ],
  worksFallback: [
    { name: 'KizunaAI — Hello, Fortnite', cat: 'Fortnite · Metaverse', href: '/ai-builder.html', note: '2026.01', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&q=80', desc: 'In-Game Concert' },
    { name: 'WEAR GO LAND — Fashion Metaverse', cat: 'Unreal · stellla', href: '/game-builder.html', note: '2025.05', image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&q=80', desc: '15 brands · IS:SUE ambassador' },
    { name: 'DISCOAT 2025SS — Virtual Exhibition', cat: 'Metaverse · Cloud', href: '/scan-3d.html', note: '2025.02', image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=80', desc: 'Virtual fashion show' },
    { name: 'Matsuken Samba II — World Tour', cat: 'Fortnite · Concert', href: '/tools.html?service=pcb', note: '30M PV', image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80', desc: 'Rise Up the World' },
    { name: 'Real-time Trading Dashboard', cat: 'AI · Web App', href: '/realtime-builder', note: 'Live', image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80', desc: 'Sub-second · 6 agents' },
    { name: 'PCB Fab — Drone Fleet', cat: 'Hardware · Fab', href: '/shop.html', note: 'Shipped', image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&q=80', desc: 'Fab-ready · DFM checked' }
  ],
  press: [
    { date: '2025.06', title: 'Unreal Fest Bali 2025 — Keynote on AI+Unreal', href: '/news' },
    { date: '2025.05', title: 'TechCrunch: KEYCODE raises to architect worlds that move hearts', href: '/news' },
    { date: '2024.10', title: 'Hakuhodo ReIMAGINE — creative team formed', href: '/news' }
  ],
  trust: {
    logos: ['TechStart', 'GreenLeaf', 'FutureTech', 'Hakuhodo'],
    testimonial: { quote: 'KEYCODE transformed our online presence — AI approach exceeded expectations.', author: 'Sarah Johnson, TechStart Inc.', rating: 5 },
    metrics: [
      { value: '99.99%', label: 'Uptime' },
      { value: '<1s', label: 'LCP' },
      { value: '6', label: 'Agents' },
      { value: '500+', label: 'Ships' }
    ]
  },
  footer: {
    tagline: 'A studio of AI engineers building across every medium — one pod, every discipline.',
    newsletter: 'One build, every month. Straight to your inbox.',
    columns: [
      {
        heading: 'Products',
        links: [
          { label: 'AI Builder', href: '/ai-builder.html' },
          { label: 'Game Builder', href: '/game-builder.html' },
          { label: '3D Scan → CAD', href: '/scan-3d.html' },
          { label: 'PCB Studio', href: '/tools.html' },
          { label: 'Real-time Builder', href: '/realtime-builder' }
        ]
      },
      {
        heading: 'Studio',
        links: [
          { label: 'Pricing', href: '/pricing.html' },
          { label: 'Works', href: '/gallery.html' },
          { label: 'News', href: '/news.html' },
          { label: 'Blog', href: '/blog.html' },
          { label: 'Docs', href: '/docs.html' }
        ]
      },
      {
        heading: 'Legal',
        links: [
          { label: 'Privacy', href: '/privacy.html' },
          { label: 'Cookies', href: '/cookies.html' },
          { label: 'Status', href: '/status.html' },
          { label: 'Changelog', href: '/changelog.html' }
        ]
      }
    ]
  }
};

/* Section visibility windows — minimal 3 acts + hero */
export const SECTION_WINDOWS = {
  hero: { in: -0.05, out: 0.18 },
  flagships: { in: 0.18, out: 0.42 },
  works: { in: 0.43, out: 0.68 },
  cta: { in: 0.69, out: 0.92 },
  footer: { in: 0.93 }
};
export const ACT_STARTS = [0, 0.18, 0.43, 0.69];

export function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/* Opacity of a section at scroll progress p. */
export function sectionOpacity(p, win) {
  const fadeIn = smoothstep(win.in, win.in + 0.045, p);
  const fadeOut = win.out == null ? 1 : 1 - smoothstep(win.out, win.out + 0.045, p);
  return clamp01(Math.min(fadeIn, fadeOut));
}
