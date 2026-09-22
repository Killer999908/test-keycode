/**
 * KEYCODE — creative.js
 * Creative-direction layer: the extra 1% that separates crafted sites
 * from templates. Everything is restrained, reduced-motion aware,
 * and a safe no-op when its target is missing.
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const onReady = (fn) => (document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', fn)
  : fn());

/* ---------- 1. Rotating hero word (worlds. → games. → boards. → machines.) ---------- */
function heroRotor() {
  const el = document.getElementById('hero-rotor');
  if (!el || reduced) return;
  const words = (() => {
    try { return ['worlds.', 'games.', 'boards.', 'machines.']; } catch { return []; }
  })();
  if (!words.length) return;
  let i = 0;
  setInterval(() => {
    i = (i + 1) % words.length;
    el.classList.add('rotor-out');
    setTimeout(() => {
      el.textContent = words[i];
      el.classList.remove('rotor-out');
      el.classList.add('rotor-in');
      setTimeout(() => el.classList.remove('rotor-in'), 450);
    }, 260);
  }, 3400);
}

/* ---------- 2. Text scramble on view (act headers) ---------- */
function scrambleReveals() {
  if (reduced) return;
  const targets = document.querySelectorAll('.act-header .h2');
  if (!targets.length) return;
  const CHARS = '█▓▒░<>/\\|=+*';
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    io.unobserve(en.target);
    const el = en.target;
    const original = el.innerHTML;
    // Scramble only the plain-text head, keep the <em> tail intact
    const parts = original.split(/(<em[^>]*>.*?<\/em>)/);
    const head = parts[0] || '';
    let frame = 0;
    const total = 14;
    const tick = () => {
      frame++;
      const progress = frame / total;
      const reveal = Math.floor(head.length * progress);
      let out = head.slice(0, reveal);
      for (let i = reveal; i < head.length; i++) {
        out += head[i] === ' ' ? ' ' : CHARS[(Math.random() * CHARS.length) | 0];
      }
      el.innerHTML = out;
      if (frame < total) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { threshold: 0.4 });
  targets.forEach(t => io.observe(t));
}

/* ---------- 3. Count-up stats ---------- */
function countUps() {
  document.querySelectorAll('[data-count-to]').forEach(el => {
    const to = parseFloat(el.dataset.countTo);
    if (isNaN(to)) return;
    const io = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const dur = 1400;
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(to * eased).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.5 });
    io.observe(el);
  });
}

/* ---------- 4. Generative art thumbnails for works without images ---------- */
function generativeThumbs() {
  document.querySelectorAll('.work-card:not(.has-img)').forEach((card, idx) => {
    if (card.querySelector('.gen-art')) return;
    const seeds = ['waves', 'rings', 'grid', 'orbit'];
    const kind = seeds[idx % seeds.length];
    const c = document.createElement('canvas');
    c.className = 'gen-art';
    c.width = 320; c.height = 200;
    const ctx = c.getContext('2d');
    const hues = [262, 190, 152, 45];
    const hue = hues[idx % hues.length];
    if (kind === 'waves') {
      for (let y = 0; y < 8; y++) {
        ctx.beginPath();
        for (let x = 0; x <= 320; x += 8) {
          const yy = 30 + y * 18 + Math.sin(x * 0.02 + y + idx) * 14;
          x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
        }
        ctx.strokeStyle = `hsla(${hue}, 80%, 65%, ${0.12 + y * 0.03})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    } else if (kind === 'rings') {
      for (let r = 14; r < 110; r += 9) {
        ctx.beginPath();
        ctx.arc(160 + Math.sin(r * 0.1 + idx) * 12, 100 + Math.cos(r * 0.13) * 8, r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue + r * 0.3}, 75%, 60%, ${0.28 - r * 0.002})`;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    } else if (kind === 'grid') {
      for (let x = 0; x <= 16; x++) {
        for (let y = 0; y <= 10; y++) {
          if ((x * 7 + y * 13 + idx) % 5 === 0) {
            ctx.fillStyle = `hsla(${hue}, 70%, 62%, 0.35)`;
            ctx.fillRect(x * 20, y * 20, 8, 8);
          }
        }
      }
    } else {
      for (let i = 0; i < 26; i++) {
        const a = i * 0.47 + idx;
        const r = 12 + i * 3.4;
        ctx.beginPath();
        ctx.arc(160 + Math.cos(a) * r, 100 + Math.sin(a) * r * 0.6, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 80%, 68%, ${0.75 - i * 0.02})`;
        ctx.fill();
      }
    }
    card.prepend(c);
    c.style.cssText = 'width:100%;border-radius:14px 14px 0 0;opacity:0.9;display:block;order:-1;margin:-1.3rem -1.4rem 0.9rem;width:calc(100% + 2.8rem);max-width:none;';
  });
}

/* ---------- 5. Footer wordmark (giant type moment) ---------- */
function footerWordmark() {
  const footer = document.querySelector('.footer');
  if (!footer || footer.querySelector('.footer-mark')) return;
  const el = document.createElement('div');
  el.className = 'footer-mark';
  el.textContent = 'KEYCODE';
  el.setAttribute('aria-hidden', 'true');
  footer.appendChild(el);
}

/* ---------- 6. Magnetic-strength tuning + cursor labels ---------- */
function cursorLabels() {
  if (!fine || reduced) return;
  const labels = [
    ['.work-card', 'view'],
    ['.flagship-card', 'open'],
    ['.kc-hpanel', 'drag ↓'],
    ['#works-grid a', 'view'],
    ['.cat-chip', 'filter']
  ];
  const tip = document.createElement('div');
  tip.className = 'kc-cursor-label';
  document.body.appendChild(tip);
  let x = -100, y = -100, tx = x, ty = y, active = false, raf = null;
  document.addEventListener('pointerover', e => {
    const hit = labels.find(([sel]) => e.target.closest(sel));
    if (hit) {
      tip.textContent = hit[1];
      active = true;
      tip.classList.add('show');
    } else if (active) {
      active = false;
      tip.classList.remove('show');
    }
  }, { passive: true });
  document.addEventListener('pointermove', e => {
    tx = e.clientX; ty = e.clientY;
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });
  function loop() {
    x += (tx - x) * 0.2; y += (ty - y) * 0.2;
    tip.style.transform = `translate(${x + 18}px, ${y + 18}px)`;
    raf = Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3 ? requestAnimationFrame(loop) : null;
  }
}

/* ---------- 7. Command palette (Cmd/Ctrl+K) — sitewide keyboard nav ---------- */
function commandPalette() {
  if (document.getElementById('kc-palette')) return;
  const routes = [
    ['Home', '/'], ['AI Builder', '/ai-builder.html'], ['Game Builder', '/ai-builder.html?mode=game'],
    ['3D Scan → CAD', '/ai-builder.html?mode=cad'], ['PCB Studio', '/ai-builder.html?mode=pcb'],
    ['Pricing', '/pricing.html'], ['Works', '/gallery.html'], ['Docs', '/docs.html'],
    ['Dashboard', '/dashboard.html'], ['Sign in', '/login.html'],
    ['Install App', 'install'], ['Hosting & Domains', '/dashboard.html#hosting'],
    ['Version Control', '/dashboard.html#vcs']
  ];
  const root = document.createElement('div');
  root.id = 'kc-palette';
  root.innerHTML = `
    <div class="kc-pal-back"></div>
    <div class="kc-pal" role="dialog" aria-label="Command palette">
      <input class="kc-pal-input" type="text" placeholder="Where to? (try \\"pcb\\")" aria-label="Search pages">
      <div class="kc-pal-list"></div>
      <div class="kc-pal-foot"><kbd>↵</kbd> open · <kbd>esc</kbd> close</div>
    </div>`;
  document.body.appendChild(root);
  const input = root.querySelector('.kc-pal-input');
  const list = root.querySelector('.kc-pal-list');
  let items = routes, sel = 0;
  const render = () => {
    list.innerHTML = items.map(([label, href], i) =>
      `<button class="kc-pal-item${i === sel ? ' sel' : ''}" data-href="${href}">
        <span>${label}</span><span class="kc-pal-hint">${href}</span></button>`).join('');
  };
  const open = () => { root.classList.add('open'); input.value = ''; items = routes; sel = 0; render(); input.focus(); };
  const close = () => root.classList.remove('open');
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); root.classList.contains('open') ? close() : open(); }
    if (e.key === 'Escape') close();
    if (!root.classList.contains('open')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
    if (e.key === 'Enter' && items[sel]) { close(); items[sel][1] === 'install' ? window.KEYCODE_INSTALL?.open() : location.href = items[sel][1]; }
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('.kc-pal-item');
    if (b) { close(); b.dataset.href === 'install' ? window.KEYCODE_INSTALL?.open() : location.href = b.dataset.href; }
    if (e.target.classList.contains('kc-pal-back')) close();
  });
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    items = routes.filter(([label, href]) => (label + ' ' + href).toLowerCase().includes(q));
    sel = 0; render();
  });
}

/* ---------- 8. Film grain overlay (the cinematic finisher) ---------- */
function filmGrain() {
  if (reduced || document.querySelector('.kc-grain')) return;
  const g = document.createElement('div');
  g.className = 'kc-grain';
  g.setAttribute('aria-hidden', 'true');
  document.body.appendChild(g);
}

/* ---------- Boot ---------- */
onReady(() => {
  heroRotor();
  scrambleReveals();
  countUps();
  generativeThumbs();
  footerWordmark();
  cursorLabels();
  commandPalette();
  filmGrain();
});

export const CREATIVE_VERSION = '1.0.0';
