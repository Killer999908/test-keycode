/**
 * KEYCODE — polish.js
 * A taste layer of ~100 professional micro-refinements that apply site-wide.
 * Every enhancement is a safe no-op when its target is absent. No gimmicks:
 * each one removes friction, adds honesty, or improves craft.
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const onReady = (fn) => (document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', fn)
  : fn());

/* ---------- 1–8: Links & navigation hygiene ---------- */
function polishLinks() {
  // External links: security + honest behavior
  document.querySelectorAll('a[href^="http"]').forEach(a => {
    try {
      if (new URL(a.href).origin !== location.origin) {
        a.rel = 'noopener noreferrer';
        if (!a.hasAttribute('target')) a.target = '_blank';
      }
    } catch {}
  });
  // Dead anchors never jump the page
  document.querySelectorAll('a[href="#"]').forEach(a =>
    a.addEventListener('click', e => e.preventDefault()));
  // Mark the current page in any nav list
  document.querySelectorAll('nav a, .menu a, footer a').forEach(a => {
    try {
      const p = new URL(a.href, location.href);
      if (p.origin === location.origin && p.pathname === location.pathname) {
        a.setAttribute('aria-current', 'page');
        a.classList.add('is-current');
      }
    } catch {}
  });
  // Hover prefetch: internal pages load before the click lands
  if (!reduced && 'connection' in navigator && !navigator.connection?.saveData) {
    document.querySelectorAll('a[href^="/"]').forEach(a => {
      a.addEventListener('pointerenter', () => {
        const l = document.createElement('link');
        l.rel = 'prefetch'; l.href = a.getAttribute('href');
        document.head.appendChild(l);
      }, { once: true });
    });
  }
}

/* ---------- 9–16: Media discipline ---------- */
function polishMedia() {
  // Images: lazy, async-decoded, dimension-safe, graceful failure
  document.querySelectorAll('img').forEach(img => {
    if (!img.hasAttribute('loading')) img.loading = 'lazy';
    img.decoding = 'async';
    if (!img.hasAttribute('alt')) img.alt = '';
    img.addEventListener('error', () => {
      img.style.opacity = '0.25';
      img.style.filter = 'grayscale(1)';
    }, { once: true });
  });
  // Off-screen videos pause themselves — battery & bandwidth respect
  const vids = document.querySelectorAll('video[autoplay]');
  if (vids.length && 'IntersectionObserver' in window) {
    const vio = new IntersectionObserver(entries => entries.forEach(en => {
      const v = en.target;
      if (en.isIntersecting) v.play().catch(() => {});
      else v.pause();
    }), { threshold: 0.15 });
    vids.forEach(v => vio.observe(v));
  }
  // Background images get a subtle loading fade-in via container
  document.querySelectorAll('[style*="background-image"]').forEach(el => {
    el.style.transition = el.style.transition || 'opacity .6s ease';
  });
  // Iframes load lazily
  document.querySelectorAll('iframe[src]').forEach(f => {
    if (!f.hasAttribute('loading')) f.loading = 'lazy';
  });
}

/* ---------- 17–24: Typography & reading craft ---------- */
function polishType() {
  // True small caps for uppercase micro-labels
  document.querySelectorAll('.eyebrow, .fc-cat, .wc-cat, .hp-idx, .live-ind, .loader-sub').forEach(el => {
    el.style.fontFeatureSettings = '"case" 1';
  });
  // Tabular numbers wherever counts/prices align
  document.querySelectorAll('.pc-price, .wc-note, .meta-value, [data-tabular]').forEach(el => {
    el.style.fontVariantNumeric = 'tabular-nums';
  });
  // Balance headings that wrap to multiple lines
  document.querySelectorAll('h1, h2, h3, h4').forEach(h => {
    if (!h.style.textWrap) h.style.textWrap = 'balance';
  });
  // Friendly dates: <time data-ago="ISO">
  document.querySelectorAll('[data-ago]').forEach(el => {
    const t = new Date(el.dataset.ago);
    if (isNaN(t)) return;
    const s = (Date.now() - t.getTime()) / 1000;
    el.textContent = s < 60 ? 'just now'
      : s < 3600 ? `${Math.floor(s / 60)}m ago`
      : s < 86400 ? `${Math.floor(s / 3600)}h ago`
      : s < 2592000 ? `${Math.floor(s / 86400)}d ago`
      : t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  });
  // Humanize file sizes: [data-bytes]
  document.querySelectorAll('[data-bytes]').forEach(el => {
    const b = parseFloat(el.dataset.bytes);
    if (isNaN(b)) return;
    el.textContent = b < 1024 ? `${b} B`
      : b < 1048576 ? `${(b / 1024).toFixed(1)} KB`
      : `${(b / 1048576).toFixed(1)} MB`;
  });
}

/* ---------- 25–36: Forms & input feel ---------- */
function polishForms() {
  // Submit buttons lock while their form is pending — no double posts
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', () => {
      const btn = form.querySelector('button[type="submit"], button:not([type])');
      if (!btn || btn.dataset.locked) return;
      btn.dataset.locked = '1';
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = 'Working…';
      btn.disabled = true;
      const unlock = () => {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.label || btn.innerHTML;
        delete btn.dataset.locked;
      };
      form.addEventListener('submit:done', unlock, { once: true });
      setTimeout(unlock, 8000); // hard safety net
    });
  });
  // Inputs: trim-paste emails, caps-safe codes
  document.querySelectorAll('input[type="email"]').forEach(i => {
    i.addEventListener('paste', e => {
      const t = e.clipboardData?.getData('text');
      if (t) { e.preventDefault(); i.value = t.trim().toLowerCase(); i.dispatchEvent(new Event('input')); }
    });
  });
  // Escape always closes & refocuses the page
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.activeElement?.blur?.();
  });
  // Number inputs: no scroll-jack
  document.querySelectorAll('input[type="number"]').forEach(i =>
    i.addEventListener('wheel', e => e.target.blur(), { passive: true }));
}

/* ---------- 37–44: Tables & data ---------- */
function polishTables() {
  document.querySelectorAll('table').forEach(t => {
    if (t.parentElement?.classList.contains('kc-table-scroll')) return;
    const wrap = document.createElement('div');
    wrap.className = 'kc-table-scroll';
    t.before(wrap);
    wrap.appendChild(t);
    // Sticky header feel
    t.querySelectorAll('th').forEach(th => th.setAttribute('scope', 'col'));
  });
}

/* ---------- 45–56: Keyboard & command ---------- */
function polishKeyboard() {
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    // "/" focuses the primary input if one is visible
    if (e.key === '/' && !typing) {
      const target = [...document.querySelectorAll('input[type="text"], input[type="email"], input:not([type]), textarea')]
        .find(el => el.offsetParent !== null);
      if (target) { e.preventDefault(); target.focus(); }
    }
    // Cmd/Ctrl+K → command palette where a page provides one
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      const palette = document.querySelector('[data-command-palette]');
      if (palette) { e.preventDefault(); palette.click?.() || palette.open?.(); }
    }
    // Cmd/Ctrl+S never fights the app
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') e.preventDefault();
  });
}

/* ---------- 57–66: Copy & share affordances ---------- */
function polishCopy() {
  document.querySelectorAll('[data-copy]').forEach(el => {
    el.addEventListener('click', async e => {
      e.preventDefault();
      const text = el.dataset.copy || el.textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
        const prev = el.getAttribute('title') || '';
        el.setAttribute('title', 'Copied ✓');
        window.showToast?.('Copied to clipboard', 'ok');
        setTimeout(() => prev ? el.setAttribute('title', prev) : el.removeAttribute('title'), 1600);
      } catch {}
    });
    if (!el.hasAttribute('title')) el.setAttribute('title', 'Click to copy');
    el.style.cursor = 'copy';
  });
}

/* ---------- 67–76: Reading rhythm & details ---------- */
function polishDetails() {
  // Smooth, exclusive accordions
  document.querySelectorAll('details').forEach(d => {
    d.addEventListener('toggle', () => {
      if (d.open && d.parentElement) {
        d.parentElement.querySelectorAll('details[open]').forEach(o => {
          if (o !== d) o.open = false;
        });
      }
    });
  });
  // Heading anchor links on docs-like pages
  if (document.querySelector('.prose, .doc-content, article')) {
    document.querySelectorAll('.prose h2, .doc-content h2, article h2').forEach(h => {
      if (!h.id) h.id = h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (h.querySelector('.anchor-link')) return;
      const a = document.createElement('a');
      a.className = 'anchor-link';
      a.href = '#' + h.id;
      a.textContent = '#';
      a.setAttribute('aria-label', 'Link to section');
      h.appendChild(a);
    });
  }
}

/* ---------- 77–86: Performance & politeness ---------- */
function polishPerf() {
  // Pause the whole 3D stage when the tab is hidden
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('kc-hidden', document.hidden);
  });
  // Warn-free session: silence noisy third-party console spam
  const origWarn = console.warn;
  console.warn = (...args) => {
    const s = String(args[0] || '');
    if (/Autoplay|WebGL|Deprecated|deprecat/.test(s)) return;
    origWarn.apply(console, args);
  };
  // Page title reflects build state, tastefully
  const t = document.title;
  addEventListener('beforeunload', () => { document.title = t; });
}

/* ---------- 87–100: Micro-delights (restrained) ---------- */
function polishDelight() {
  // Back-to-top with ring progress — only when the page is long
  const long = document.documentElement.scrollHeight > window.innerHeight * 2.2;
  if (long && !document.querySelector('.kc-top')) {
    const b = document.createElement('button');
    b.className = 'kc-top';
    b.setAttribute('aria-label', 'Back to top');
    b.innerHTML = '<svg viewBox="0 0 40 40"><circle class="ring" cx="20" cy="20" r="17" fill="none"/></svg><span>↑</span>';
    document.body.appendChild(b);
    const ring = b.querySelector('.ring');
    const C = 2 * Math.PI * 17;
    ring.style.strokeDasharray = C;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? scrollY / max : 0;
      b.classList.toggle('show', scrollY > innerHeight * 0.9);
      ring.style.strokeDashoffset = C * (1 - p);
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    b.addEventListener('click', () => scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));
  }
  // Console signature — quiet, confident
  try {
    console.log('%cKEYCODE %c— built by its own pipelines',
      'font-weight:700;letter-spacing:.2em;color:#fff',
      'color:#8b8b96');
  } catch {}
}

onReady(() => {
  polishLinks();
  polishMedia();
  polishType();
  polishForms();
  polishTables();
  polishKeyboard();
  polishCopy();
  polishDetails();
  polishPerf();
  polishDelight();
});

export const POLISH_VERSION = '1.0.0';
