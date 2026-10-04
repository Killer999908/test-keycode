/* KEYCODE scroll 3D engine — site-wide scroll-triggered 3D animation.
 *
 * Auto-discovers content and animates it with a glass/3D language:
 *   [data-reveal]      → 3D rise + tilt-in (any element; cards/sections auto-opt-in)
 *   [data-parallax]    → depth-scrubbed parallax (value = depth, e.g. 0.15)
 *   [data-tilt]        → pointer-reactive 3D tilt with glare (auto on .card too)
 *   [data-3d-stagger]  → children animate in sequence
 *   [data-3d-scene]    → sticky 3D scene: children rotate as you scroll through
 *
 * Uses GSAP + ScrollTrigger when present; falls back to IntersectionObserver
 * and rAF when not. Honors prefers-reduced-motion. Never throws.
 */
(function () {
  'use strict';
  if (window.KCScroll3D && window.KCScroll3D.version === 3) return;
  window.KCScroll3D = { enabled: false, version: 3 };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GSAP = window.gsap, ST = window.ScrollTrigger;
  var engine = (GSAP && ST && !reduceMotion) ? 'gsap' : 'io';
  window.KCScroll3D.engine = engine;

  /* ---------- helpers ---------- */
  function toArray(sel, root) {
    try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
    catch (e) { return []; }
  }
  function depthOf(el, fallback) {
    var v = parseFloat(el.getAttribute('data-parallax'));
    return isNaN(v) ? fallback : v;
  }

  var CARD_SEL = '.section-card, .card, .stat-card, .op-card, .info-card, .help-card, ' +
                 '.contact-card, .blog-card, .qa-card, [data-3d-stagger] > *';
  var SKIP_SEL = '[data-3d-scene], nav, #kc-nav, .kc-nav, header, .loader, ' +
                 '[data-no-anim], [aria-hidden="true"]';

  function collectRevealTargets() {
    var targets = toArray('[data-reveal]');
    toArray(CARD_SEL).forEach(function (el) {
      if (!el.hasAttribute('data-reveal') && !el.closest(SKIP_SEL)) targets.push(el);
    });
    var seen = new Set();
    return targets.filter(function (el) {
      if (seen.has(el)) return false;
      seen.add(el);
      return !el.closest(SKIP_SEL) && el.offsetParent !== null;
    });
  }

  /* ---------- pointer tilt with glare (shared by both engines) ---------- */
  function attachTilt(el, opts) {
    if (el.__kcTilt || reduceMotion || el.closest('[data-no-tilt]')) return;
    el.__kcTilt = true;
    var rot = opts.rot || 7, lift = opts.lift || 8;

    var glare = document.createElement('div');
    glare.className = 'kc-tilt-glare';
    el.appendChild(glare);

    var raf = 0, tx = 0, ty = 0;
    function frame() {
      raf = 0;
      el.style.transform = 'perspective(900px) rotateX(' + (-ty * rot) + 'deg) rotateY(' +
        (tx * rot) + 'deg) translateZ(' + lift + 'px)';
      glare.style.opacity = '1';
      glare.style.background =
        'radial-gradient(420px circle at ' + ((tx + 1) / 2) * 100 + '% ' + ((ty + 1) / 2) * 100 + '%, ' +
        'rgba(255,255,255,0.14), transparent 55%)';
    }
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(frame);
    });
    el.addEventListener('pointerleave', function () {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      el.style.transform = '';
      glare.style.opacity = '0';
    });
  }

  /* ---------- GSAP engine ---------- */
  function initGsap() {
    GSAP.registerPlugin(ST);

    var revealTargets = collectRevealTargets();

    // Staggered children first; mark them so the single-target pass skips them
    toArray('[data-3d-stagger]').forEach(function (parent) {
      var kids = revealTargets.filter(function (el) { return el.parentElement === parent; });
      if (!kids.length) return;
      GSAP.from(kids, {
        y: 48, opacity: 0, rotateX: -8, z: -60, transformPerspective: 900,
        duration: 0.9, ease: 'power3.out', stagger: 0.08,
        scrollTrigger: { trigger: parent, start: 'top 85%', once: true }
      });
      kids.forEach(function (k) { k.__kcHandled = true; });
    });

    revealTargets.forEach(function (el) {
      if (el.__kcHandled) return;
      var delay = parseFloat(el.getAttribute('data-reveal-delay')) || 0;
      GSAP.from(el, {
        y: 42, opacity: 0, rotateX: -7, z: -50, transformPerspective: 900,
        duration: 0.85, ease: 'power3.out', delay: delay,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });

    // Depth parallax
    toArray('[data-parallax]').forEach(function (el) {
      GSAP.to(el, {
        y: function () { return -el.offsetHeight * depthOf(el, 0.18); },
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 0.6 }
      });
    });

    // Sticky 3D scene: children rotate in as you scroll through
    toArray('[data-3d-scene]').forEach(function (scene) {
      var items = toArray(':scope > *', scene);
      if (!items.length) return;
      var tl = GSAP.timeline({
        scrollTrigger: {
          trigger: scene, start: 'top top', end: '+=140%',
          scrub: 0.8, pin: items.length === 1
        }
      });
      items.forEach(function (el, i) {
        tl.from(el, {
          rotateY: (i % 2 ? 14 : -14), rotateX: 10, y: 60, opacity: 0.001,
          transformPerspective: 1200, ease: 'power2.out'
        }, i * 0.6);
      });
    });

    // Tilt
    toArray('[data-tilt]').forEach(function (el) { attachTilt(el, { rot: 9, lift: 10 }); });
    toArray('.card, .section-card, .stat-card').forEach(function (el) {
      attachTilt(el, { rot: 6, lift: 6 });
    });

    window.KCScroll3D.enabled = true;
  }

  /* ---------- IntersectionObserver engine (no GSAP needed) ---------- */
  function initIo() {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        io.unobserve(el);
        var delay = el.getAttribute('data-reveal-delay');
        if (delay) el.style.transitionDelay = delay + 'ms';
        el.classList.add('kc3d-in');
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    collectRevealTargets().forEach(function (el) { io.observe(el); });

    // Stagger: assign incremental transition-delay to children
    toArray('[data-3d-stagger]').forEach(function (parent) {
      toArray(':scope > *', parent).forEach(function (kid, i) {
        kid.style.transitionDelay = (i * 80) + 'ms';
      });
    });

    // rAF depth parallax
    if (!reduceMotion) {
      var items = toArray('[data-parallax]').map(function (el) {
        return { el: el, depth: depthOf(el, 0.18), cur: 0 };
      });
      if (items.length) {
        var ticking = false;
        function tick() {
          ticking = false;
          var vh = window.innerHeight;
          items.forEach(function (it) {
            var r = it.el.getBoundingClientRect();
            var progress = (vh - r.top) / (vh + r.height); // 0..1 through viewport
            var target = (progress - 0.5) * -2 * it.depth * 120;
            it.cur += (target - it.cur) * 0.12;
            it.el.style.transform = 'translate3d(0,' + it.cur.toFixed(2) + 'px,0)';
          });
          if (items.length && !ticking) { ticking = true; requestAnimationFrame(tick); }
        }
        window.addEventListener('scroll', function () {
          if (!ticking) { ticking = true; requestAnimationFrame(tick); }
        }, { passive: true });
        ticking = true; requestAnimationFrame(tick);
      }
    }

    // Tilt
    toArray('[data-tilt]').forEach(function (el) { attachTilt(el, { rot: 9, lift: 10 }); });
    toArray('.card, .section-card, .stat-card').forEach(function (el) {
      attachTilt(el, { rot: 6, lift: 6 });
    });

    window.KCScroll3D.enabled = true;
  }

  /* ---------- boot ---------- */
  function boot() {
    if (reduceMotion) {
      // Reveal everything immediately; no motion.
      document.documentElement.classList.add('kc3d-reduced');
      toArray('[data-reveal], .card, .section-card, .stat-card').forEach(function (el) {
        el.classList.add('kc3d-in');
      });
      window.KCScroll3D.enabled = false;
      return;
    }
    try {
      if (engine === 'gsap') initGsap();
      else initIo();
    } catch (err) {
      // Last resort: make sure nothing stays invisible
      document.documentElement.classList.add('kc3d-reduced');
      toArray('[data-reveal], .card, .section-card, .stat-card').forEach(function (el) {
        el.classList.add('kc3d-in');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
