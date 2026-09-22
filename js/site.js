/* KEYCODE shared site utilities + premium interaction layer. Classic script, every page. */
(function () {
  'use strict';

  if (window.KC) return;
  window.KC = { version: '3.0.0' };

  /* ================= Toast ================= */
  window.showToast = window.showToast || function (msg, type) {
    var box = document.getElementById('toast') || document.querySelector('.toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast';
      box.setAttribute('aria-live', 'polite');
      box.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:99999;' +
        'padding:12px 20px;border-radius:10px;background:#0a0a0b;color:#f5f5f4;font:500 0.9rem/1.4 Inter,system-ui,sans-serif;' +
        'border:1px solid rgba(255,255,255,0.14);box-shadow:0 12px 40px rgba(0,0,0,0.55);opacity:0;transition:opacity .3s;max-width:88vw;text-align:center';
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.style.borderColor = type === 'error' ? 'rgba(239,68,68,.6)' : type === 'ok' ? 'rgba(34,197,94,.6)' : 'rgba(255,255,255,.14)';
    box.style.opacity = '1';
    clearTimeout(box._t);
    box._t = setTimeout(function () { box.style.opacity = '0'; }, 3600);
  };

  /* ================= Mobile nav toggle (defensive) ================= */
  document.addEventListener('DOMContentLoaded', function () {
    var burger = document.getElementById('nav-toggle') || document.querySelector('.nav-toggle') || document.querySelector('#menu-btn');
    var nav = document.querySelector('.nav') || document.querySelector('nav.site-nav');
    if (burger && nav) {
      burger.addEventListener('click', function (e) {
        e.preventDefault();
        nav.classList.toggle('nav-open');
        burger.classList.toggle('active');
      });
    }
  });

  /* ================= Same-page anchor smoothing ================= */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute('href');
    if (id.length < 2) return;
    var target = document.getElementById(id.slice(1));
    if (!target) return;
    e.preventDefault();
    try { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (err) { target.scrollIntoView(); }
  });

  /* ================= PREMIUM INTERACTION LAYER ================= */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* -- Pointer spotlight: a soft light that follows the cursor across the whole page -- */
  function initSpotlight() {
    if (reduced || !finePointer) return;
    var el = document.createElement('div');
    el.className = 'kc-spotlight';
    document.body.appendChild(el);
    var x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y, raf = null;
    function loop() {
      x += (tx - x) * 0.12; y += (ty - y) * 0.12;
      el.style.transform = 'translate(' + (x - 300) + 'px,' + (y - 300) + 'px)';
      if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3) raf = requestAnimationFrame(loop);
      else raf = null;
    }
    addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
      el.style.opacity = '1';
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
    document.addEventListener('mouseleave', function () { el.style.opacity = '0'; });
  }

  /* -- 3D tilt: cards physically rotate toward the cursor with a moving glare -- */
  function initTilt() {
    if (reduced || !finePointer) return;
    var SELECTOR = '.card, .kc-card, .pro-card, .pricing-card, .flagship-card, .work-card, .feature-card, .tool-card, .glass, .panel3d, [data-tilt]';
    document.querySelectorAll(SELECTOR).forEach(function (card) {
      if (card._kcTilt) return;
      card._kcTilt = true;
      var glare = document.createElement('div');
      glare.className = 'kc-tilt-glare';
      card.appendChild(glare);
      card.classList.add('kc-tilt');
      var raf = null, rX = 0, rY = 0, tX = 0, tY = 0, gx = 50, gy = 50, tgx = 50, tgy = 50;
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
        tX = (ny - 0.5) * -7; tY = (nx - 0.5) * 9;
        tgx = nx * 100; tgy = ny * 100;
        if (!raf) raf = requestAnimationFrame(step);
      });
      card.addEventListener('pointerleave', function () { tX = 0; tY = 0; tgx = 50; tgy = 50; if (!raf) raf = requestAnimationFrame(step); });
      function step() {
        rX += (tX - rX) * 0.16; rY += (tY - rY) * 0.16;
        gx += (tgx - gx) * 0.16; gy += (tgy - gy) * 0.16;
        card.style.transform = 'perspective(900px) rotateX(' + rX.toFixed(2) + 'deg) rotateY(' + rY.toFixed(2) + 'deg) translateZ(0)';
        glare.style.background = 'radial-gradient(circle at ' + gx.toFixed(1) + '% ' + gy.toFixed(1) + '%, rgba(255,255,255,0.14), transparent 55%)';
        if (Math.abs(tX - rX) > 0.05 || Math.abs(tY - rY) > 0.05) raf = requestAnimationFrame(step);
        else { card.style.transform = ''; glare.style.background = 'none'; raf = null; }
      }
    });
  }
  // Re-scan for new cards when dynamic content renders
  window.KC.rescanTilt = function () { setTimeout(initTilt, 60); };

  /* -- Magnetic buttons: buttons lean toward the cursor before you even click -- */
  function initMagnetic() {
    if (reduced || !finePointer) return;
    document.querySelectorAll('.btn, .fbtn, button[class*="primary"], a[class*="cta"], .send, .tool').forEach(function (btn) {
      if (btn._kcMag) return;
      btn._kcMag = true;
      btn.classList.add('kc-magnetic');
      var raf = null, x = 0, y = 0, tx = 0, ty = 0;
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        tx = (e.clientX - (r.left + r.width / 2)) * 0.22;
        ty = (e.clientY - (r.top + r.height / 2)) * 0.22;
        if (!raf) raf = requestAnimationFrame(step);
      });
      btn.addEventListener('pointerleave', function () { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(step); });
      function step() {
        x += (tx - x) * 0.2; y += (ty - y) * 0.2;
        btn.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        if (Math.abs(tx - x) > 0.2 || Math.abs(ty - y) > 0.2) raf = requestAnimationFrame(step);
        else raf = null;
      }
    });
  }

  /* -- Click ripples: every button press radiates from the exact click point -- */
  function initRipples() {
    document.addEventListener('click', function (e) {
      if (reduced) return;
      var el = e.target.closest('button, .btn, .fbtn, a.btn, [data-ripple]');
      if (!el) return;
      var r = el.getBoundingClientRect();
      var d = Math.max(r.width, r.height) * 2.1;
      var s = document.createElement('span');
      s.className = 'kc-ripple';
      s.style.width = s.style.height = d + 'px';
      s.style.left = (e.clientX - r.left - d / 2) + 'px';
      s.style.top = (e.clientY - r.top - d / 2) + 'px';
      el.style.position = getComputedStyle(el).position === 'static' ? 'relative' : '';
      el.style.overflow = 'hidden';
      el.appendChild(s);
      setTimeout(function () { s.remove(); }, 650);
    }, { passive: true });
  }

  /* -- Scroll reveals: content rises in with spring easing as you scroll -- */
  function initReveals() {
    if (reduced || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('kc-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });
    document.querySelectorAll('section > .container > *, .card, .kc-card, .pro-card, .pricing-card, section h1, section h2, section h3, .feature-card, .tool-card, [data-reveal]').forEach(function (el, i) {
      if (el._kcRev) return;
      el._kcRev = true;
      el.classList.add('kc-reveal');
      el.style.transitionDelay = (Math.min(i % 8, 7) * 55) + 'ms';
      io.observe(el);
    });
  }
  window.KC.rescanReveals = function () { setTimeout(initReveals, 60); };

  /* -- Smart hover lift with depth shadow -- */
  if (!reduced && finePointer) {
    var style = document.createElement('style');
    style.textContent =
      '.kc-tilt{transition:transform .18s cubic-bezier(.16,1,.3,1);will-change:transform}' +
      '.kc-tilt-glare{position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .25s}' +
      '.kc-tilt:hover .kc-tilt-glare{opacity:1}' +
      '.kc-tilt{position:relative;overflow:hidden}' +
      '.kc-magnetic{transition:transform .3s cubic-bezier(.34,1.56,.64,1),box-shadow .3s;will-change:transform}' +
      '.kc-magnetic:hover{z-index:5}' +
      '.kc-ripple{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.28) 0%,transparent 65%);transform:scale(0);animation:kcRipple .65s ease-out forwards;pointer-events:none}' +
      '@keyframes kcRipple{to{transform:scale(1);opacity:0}}' +
      '.kc-reveal{opacity:0;transform:translateY(22px) scale(.985);transition:opacity .7s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1)}' +
      '.kc-reveal.kc-in{opacity:1;transform:none}' +
      '.kc-spotlight{position:fixed;top:0;left:0;width:600px;height:600px;border-radius:50%;pointer-events:none;z-index:1;opacity:0;transition:opacity .5s;' +
      'background:radial-gradient(circle,rgba(139,92,246,.075) 0%,rgba(34,211,238,.04) 35%,transparent 70%);mix-blend-mode:screen}' +
      '.kc-curtain{position:fixed;inset:0;z-index:200000;background:#08080a;display:grid;place-items:center;' +
      'transform-origin:50% 0%;transition:transform .5s cubic-bezier(.76,0,.24,1);}' +
      '.kc-curtain-mark{font:700 42px/1 "Space Grotesk",Inter,sans-serif;color:#fff;opacity:.9;animation:kcCurtainPulse 1.1s ease-in-out infinite}' +
      '@keyframes kcCurtainPulse{0%,100%{opacity:.35;transform:scale(.94)}50%{opacity:.95;transform:scale(1)}}' +
      '.kc-curtain-lift{transform:translateY(-101%)}' +
      '.kc-curtain-cover{transform:translateY(0)!important;transition:transform .42s cubic-bezier(.76,0,.24,1)!important}' +
      '.kc-curtain-done{display:none}';
    document.head.appendChild(style);
  }

  /* ================= Cinematic page transitions ================= */
  function initPageTransitions() {
    if (reduced) return;
    var curtain = document.createElement('div');
    curtain.className = 'kc-curtain';
    curtain.innerHTML = '<div class="kc-curtain-mark">K</div>';
    document.body.appendChild(curtain);
    // Reveal on load: curtain lifts
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { curtain.classList.add('kc-curtain-lift'); });
    });
    setTimeout(function () { curtain.classList.add('kc-curtain-done'); }, 900);
    // Cover on internal navigation
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;
      var dest = new URL(a.href, location.href);
      if (dest.origin !== location.origin || dest.pathname === location.pathname && dest.hash) return;
      e.preventDefault();
      curtain.classList.remove('kc-curtain-lift', 'kc-curtain-done');
      void curtain.offsetWidth;
      curtain.classList.add('kc-curtain-cover');
      setTimeout(function () { location.href = a.href; }, 420);
    });
    // Browsers bfcache: lift the curtain when returning
    addEventListener('pageshow', function (ev) {
      if (ev.persisted) { curtain.classList.remove('kc-curtain-cover'); curtain.classList.add('kc-curtain-done'); }
    });
  }

  /* ================= Auto-rescan for dynamic content ================= */
  function initMutationRescan() {
    if (!('MutationObserver' in window)) return;
    var pending = false;
    var mo = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        window.KC.rescanReveals();
        window.KC.rescanTilt();
      }, 220);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ================= Shared creative pack (palette · grain · labels · human data) ================= */
  function initSharedCreative() {
    // Command palette — keyboard navigation on every page
    if (!document.getElementById('kc-palette')) {
      var routes = [
        ['Home', '/'], ['AI Builder', '/ai-builder.html'], ['Game Builder', '/ai-builder.html?mode=game'],
        ['3D Scan → CAD', '/ai-builder.html?mode=cad'], ['PCB Studio', '/ai-builder.html?mode=pcb'],
        ['Pricing', '/pricing.html'], ['Works', '/gallery.html'], ['Docs', '/docs.html'],
        ['Dashboard', '/dashboard.html'], ['Sign in', '/login.html']
      ];
      var root = document.createElement('div');
      root.id = 'kc-palette';
      root.innerHTML = '<div class="kc-pal-back"></div>' +
        '<div class="kc-pal" role="dialog" aria-label="Command palette">' +
        '<input class="kc-pal-input" type="text" placeholder="Where to?" aria-label="Search pages">' +
        '<div class="kc-pal-list"></div>' +
        '<div class="kc-pal-foot"><kbd>↵</kbd> open · <kbd>esc</kbd> close</div></div>';
      document.body.appendChild(root);
      var input = root.querySelector('.kc-pal-input');
      var list = root.querySelector('.kc-pal-list');
      var items = routes, sel = 0;
      var render = function () {
        list.innerHTML = items.map(function (r, i) {
          return '<button class="kc-pal-item' + (i === sel ? ' sel' : '') + '" data-href="' + r[1] + '">' +
            '<span>' + r[0] + '</span><span class="kc-pal-hint">' + r[1] + '</span></button>';
        }).join('');
      };
      var open = function () { root.classList.add('open'); input.value = ''; items = routes; sel = 0; render(); input.focus(); };
      var close = function () { root.classList.remove('open'); };
      document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); root.classList.contains('open') ? close() : open(); }
        if (e.key === 'Escape') close();
        if (!root.classList.contains('open')) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
        if (e.key === 'Enter' && items[sel]) { close(); location.href = items[sel][1]; }
      });
      root.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.kc-pal-item') : null;
        if (b) { close(); location.href = b.getAttribute('data-href'); }
        if (e.target.classList && e.target.classList.contains('kc-pal-back')) close();
      });
      input.addEventListener('input', function () {
        var q = input.value.toLowerCase();
        items = routes.filter(function (r) { return (r[0] + ' ' + r[1]).toLowerCase().indexOf(q) >= 0; });
        sel = 0; render();
      });
    }

    // Film grain
    if (!reduced && !document.querySelector('.kc-grain')) {
      var g = document.createElement('div');
      g.className = 'kc-grain';
      g.setAttribute('aria-hidden', 'true');
      document.body.appendChild(g);
    }

    // Humanized timestamps & sizes on data-driven pages
    document.querySelectorAll('[data-ago]').forEach(function (el) {
      var t = new Date(el.getAttribute('data-ago'));
      if (isNaN(t)) return;
      var s = (Date.now() - t.getTime()) / 1000;
      el.textContent = s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' :
        s < 86400 ? Math.floor(s / 3600) + 'h ago' : s < 2592000 ? Math.floor(s / 86400) + 'd ago' :
        t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    });
    document.querySelectorAll('[data-bytes]').forEach(function (el) {
      var b = parseFloat(el.getAttribute('data-bytes'));
      if (isNaN(b)) return;
      el.textContent = b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
    });
  }

  // Shared creative styles (once)
  (function sharedStyles() {
    if (document.getElementById('kc-shared-styles')) return;
    var st = document.createElement('style');
    st.id = 'kc-shared-styles';
    st.textContent =
      '.kc-grain{position:fixed;inset:-50%;width:200%;height:200%;pointer-events:none;z-index:9998;opacity:.05;' +
      'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'240\' height=\'240\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\'/%3E%3C/filter%3E%3Crect width=\'240\' height=\'240\' filter=\'url(%23n)\' opacity=\'0.55\'/%3E%3C/svg%3E");' +
      'animation:kcGrain .9s steps(4) infinite}@keyframes kcGrain{0%{transform:translate(0,0)}25%{transform:translate(-2%,1.4%)}50%{transform:translate(1.6%,-1%)}75%{transform:translate(-1%,-1.8%)}100%{transform:translate(0,0)}}' +
      '#kc-palette{position:fixed;inset:0;z-index:100000;display:none}#kc-palette.open{display:block}' +
      '.kc-pal-back{position:absolute;inset:0;background:rgba(4,4,6,.7);backdrop-filter:blur(6px)}' +
      '.kc-pal{position:absolute;top:18vh;left:50%;transform:translateX(-50%);width:min(560px,92vw);background:rgba(14,14,18,.96);border:1px solid rgba(255,255,255,.18);border-radius:18px;box-shadow:0 40px 120px rgba(0,0,0,.7);overflow:hidden}' +
      '.kc-pal-input{width:100%;background:transparent;border:none;outline:none;padding:1.1rem 1.3rem;color:#fafafa;font:500 1.05rem/1.3 "Space Grotesk",Inter,sans-serif;border-bottom:1px solid rgba(255,255,255,.07)}' +
      '.kc-pal-list{max-height:320px;overflow-y:auto;padding:.5rem}' +
      '.kc-pal-item{width:100%;display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.75rem .9rem;border:none;background:transparent;color:#a1a1aa;font:500 .95rem/1.2 "Space Grotesk",Inter,sans-serif;text-align:left;border-radius:10px;cursor:pointer}' +
      '.kc-pal-item.sel,.kc-pal-item:hover{background:rgba(255,255,255,.07);color:#fafafa}' +
      '.kc-pal-hint{font:400 .68rem/1 "JetBrains Mono",monospace;color:#71717a}' +
      '.kc-pal-foot{padding:.6rem 1rem;border-top:1px solid rgba(255,255,255,.07);font:400 .65rem/1 "JetBrains Mono",monospace;color:#71717a;display:flex;gap:.9rem}' +
      '.kc-pal-foot kbd{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.07);border-radius:4px;padding:1px 5px;font-size:.6rem}';
    document.head.appendChild(st);
  })();

  document.addEventListener('DOMContentLoaded', function () {
    initSpotlight();
    initTilt();
    initMagnetic();
    initRipples();
    initReveals();
    initPageTransitions();
    initMutationRescan();
    initSharedCreative();
  });
})();
