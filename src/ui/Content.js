/* Centralized copy + section timing for the KEYCODE editorial overlay. */

export const CONTENT = {
  brand: 'KEYCODE',
  horizontalActLabel: 'drag through the pipelines',
  hero: {
    eyebrow: 'KEYCODE — AI ENGINEERING STUDIO',
    title: 'We build<br><em id="hero-rotor">worlds.</em>',
    rotor: ['worlds.', 'games.', 'boards.', 'machines.'],
    sub: 'One studio, four pipelines. Describe what you want — an app, a game, a CAD part, a circuit board — and watch it get built, live.',
    primary: { label: 'Start building', href: '/ai-builder.html' },
    secondary: { label: 'See the work', scroll: 1 },
    live: 'Drag to orbit · Scroll to travel'
  },
  ticker: [
    'AI FULL-STACK', 'GAME WORLDS', 'SCAN → CAD', 'PCB FAB',
    'LIVE PREVIEW', 'REAL DEPLOY', 'FAB-READY GERBERS',
    'SIX AGENTS', 'ONE STUDIO'
  ],
  acts: [
    {
      id: 'flagships',
      eyebrow: '01 · PIPELINES',
      title: 'Four pipelines.<br><em>One studio.</em>',
      sub: 'Each pipeline is a complete system — research, build, test, ship — run by agents that never sleep.',
      flagships: [
        { cat: 'AI', name: 'AI Full-Stack', tag: 'Code in real time', href: '/ai-builder.html' },
        { cat: 'GAME', name: 'Game Engine', tag: 'Fortnite-grade worlds', href: '/ai-builder.html?mode=game' },
        { cat: 'SCAN', name: '3D + CAD', tag: 'Scan → fab-ready', href: '/ai-builder.html?mode=cad' },
        { cat: 'MAKE', name: 'PCB Fab', tag: 'HDI + Gerber', href: '/ai-builder.html?mode=pcb' }
      ]
    },
    {
      id: 'works',
      eyebrow: '02 · WORKS',
      title: 'Built here.<br><em>Shipped there.</em>',
      sub: 'Every card is a real build from the pipelines. Open one, or start your own.',
      worksLink: '/gallery.html'
    },
    {
      id: 'cta',
      eyebrow: '03 · STUDIO',
      title: 'Everything else<br><em>lives inside.</em>',
      sub: 'Services, agents, pricing, news — each crafted with the same care.',
      ctaLinks: [
        { label: 'Services', href: '/ai-builder.html?mode=tools', desc: 'All 7 categories →' },
        { label: 'Agents', href: '/docs.html', desc: '6 specialists →' },
        { label: 'Pricing', href: '/pricing.html', desc: 'Plans →' },
        { label: 'News', href: '/news.html', desc: 'Press →' }
      ]
    }
  ],
  worksFallback: [
    { name: 'Neon Drift — Racing Game', cat: 'GAME', href: '/ai-builder.html?mode=game', note: 'Playable in browser', desc: 'Drift physics · leaderboard' },
    { name: 'SaaS Starter — AI Notes', cat: 'AI · WEB APP', href: '/ai-builder.html', note: 'Live template', desc: 'Auth · billing · dashboard' },
    { name: 'Scan-to-CAD Bracket', cat: 'CAD', href: '/ai-builder.html?mode=cad', note: 'STEP export', desc: 'Photogrammetry → editable CAD' },
    { name: 'Drone Flight Controller', cat: 'PCB', href: '/ai-builder.html?mode=pcb', note: 'Fab score 92', desc: '4-layer · GPS · telemetry' },
    { name: 'Portfolio Engine', cat: 'AI · WEB APP', href: '/ai-builder.html', note: 'Live template', desc: 'Masonry · lightbox · CMS-free' },
    { name: 'IoT Sensor Board', cat: 'PCB', href: '/ai-builder.html?mode=pcb', note: 'Fab score 88', desc: 'ESP32 · BOM sourced' }
  ],
  press: [
    { date: '2026.01', title: 'KEYCODE ships live PCB fabrication pipeline', href: '/news.html' },
    { date: '2025.11', title: 'Scan-to-CAD opens to all builders', href: '/news.html' },
    { date: '2025.09', title: 'Six-agent orchestration goes realtime', href: '/news.html' }
  ],
  footer: {
    tagline: 'A studio of AI engineers building across every medium — one pod, every discipline.',
    newsletter: 'One build, every month. Straight to your inbox.',
    columns: [
      {
        heading: 'Products',
        links: [
          { label: 'AI Builder', href: '/ai-builder.html' },
          { label: 'Game Builder', href: '/ai-builder.html?mode=game' },
          { label: '3D Scan → CAD', href: '/ai-builder.html?mode=cad' },
          { label: 'PCB Studio', href: '/ai-builder.html?mode=tools' },
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

/* Section visibility — hybrid timeline: hero → flagships → HORIZONTAL act → works → cta */
export const SECTION_WINDOWS = {
  hero: { in: -0.05, out: 0.18 },
  flagships: { in: 0.12, out: 0.32 },
  works: { in: 0.56, out: 0.76 },
  cta: { in: 0.78, out: 0.99 },
  footer: { in: 0.96 }
};
export const ACT_STARTS = [0, 0.12, 0.56, 0.78];

export function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/* Opacity — pro glide, long crossfade */
export function sectionOpacity(p, win) {
  const fadeIn = smoothstep(win.in, win.in + 0.14, p);
  const fadeOut = win.out == null ? 1 : 1 - smoothstep(win.out - 0.14, win.out, p);
  return clamp01(Math.min(fadeIn, fadeOut));
}
