import { CONTENT, clamp01, smoothstep } from '../ui/Content.js';
import { damp } from '../three/helpers.js';

/**
 * HybridScroll — vertical × horizontal × parallax in one scroll gesture.
 *  · Panels inside [data-hscroll] travel horizontally while you scroll
 *    vertically (driven by page progress — no native horizontal bars).
 *  · Scroll velocity tilts the content in 3D perspective (inertial feel).
 *  · [data-parallax] elements ride their own local timelines
 *    (data-depth, data-rot) for multi-plane depth.
 *  · [data-deep] sections scale down and fade as the page dives away.
 * Only transforms/opacity are mutated — compositing stays on the GPU.
 */
let spanDirty = false;
addEventListener('resize', () => { spanDirty = true; });

export class HybridScroll {
  constructor({ reducedMotion = false } = {}) {
    this.reduced = reducedMotion;
    this.hWrap = null;
    this.hTrack = null;
    this.hPanels = [];
    this.parallaxEls = [];
    this.deepEls = [];
    this.skew = 0;
    this.active = false;
    this.built = false;
  }

  /* ---------- Build: wrap horizontal panels into a pinned track ---------- */
  build() {
    if (this.built) return;
    this.built = true;
    const wrap = document.querySelector('[data-hscroll]');
    if (!wrap || !wrap.children.length) return;
    wrap.hidden = false;
    // Live outside .content — a transformed ancestor would break position:fixed
    const uiRoot = document.getElementById('ui');
    if (uiRoot && wrap.parentElement !== uiRoot) uiRoot.appendChild(wrap);

    const track = document.createElement('div');
    track.className = 'kc-htrack';
    while (wrap.firstChild) track.appendChild(wrap.firstChild);
    wrap.appendChild(track);

    const rail = document.createElement('div');
    rail.className = 'kc-hrail';
    rail.innerHTML = '<span></span><em>' + (wrap.dataset.hscrollLabel || CONTENT.horizontalActLabel || 'scroll') + '</em>';
    wrap.appendChild(rail);

    this.hWrap = wrap;
    this.hTrack = track;
    this.hPanels = Array.from(track.children);
    this.hSpan = null;
    wrap.classList.add('kc-hwrap');
    // Measure once fonts/layout settle
    setTimeout(() => this.recalcSpan(), 120);
    addEventListener('load', () => this.recalcSpan());

    this.parallaxEls = Array.from(document.querySelectorAll('[data-parallax]')).map(el => ({
      el,
      depth: parseFloat(el.dataset.depth || el.getAttribute('data-parallax')) || 0.3,
      rot: parseFloat(el.dataset.rot || 0) || 0
    }));
    this.deepEls = Array.from(document.querySelectorAll('[data-deep]'));

    if (!this.reduced) {
      [track, ...this.parallaxEls.map(p => p.el)].forEach(el => {
        el.style.willChange = 'transform';
        el.style.backfaceVisibility = 'hidden';
      });
    }
    this.active = true;
  }

  /* ---------- Per-frame ---------- */
  /** Horizontal travel distance in px (track width − viewport) */
  recalcSpan() {
    if (!this.hTrack || !this.hWrap) return;
    this.hSpan = Math.max(0, this.hTrack.scrollWidth - this.hWrap.clientWidth);
  }

  onResize() { this.recalcSpan(); }

  update(p, rawVelocity, dt) {
    if (!this.active) return;
    const v = clamp01(Math.abs(rawVelocity) / 30);
    this.skew = damp(this.skew, v, 7, dt);

    /* -- Velocity tilt: content flexes in 3D while you scroll -- */
    if (!this.reduced && this.skew > 0.015) {
      const stage = document.querySelector('.content');
      if (stage) {
        const dir = rawVelocity > 0 ? -1 : 1;
        const sk = this.skew * 2.2 * dir;
        stage.style.transform = 'perspective(1600px) skewY(' + sk.toFixed(3) + 'deg) rotateX(' + (this.skew * 1.1).toFixed(3) + 'deg)';
      }
    } else {
      const stage = document.querySelector('.content');
      if (stage && stage.style.transform) stage.style.transform = '';
    }

    /* -- Horizontal traversal between vertical acts (0.32 → 0.54) -- */
    const H_IN = 0.32, H_OUT = 0.54;
    if (this.hWrap && this.hPanels.length) {
      const hAmt = smoothstep(H_IN, H_OUT, p);
      const vis = smoothstep(H_IN - 0.03, H_IN + 0.06, p) * (1 - smoothstep(H_OUT + 0.05, H_OUT + 0.11, p));
      const w = this.hWrap;
      w.style.pointerEvents = vis > 0.5 ? 'auto' : 'none';
      w.style.opacity = vis.toFixed(3);
      w.style.visibility = vis <= 0.001 ? 'hidden' : 'visible';

      if (this.hSpan == null || spanDirty) { this.recalcSpan(); spanDirty = false; }
      const x = -hAmt * (this.hSpan || 0);
      this.hTrack.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';

      this.hPanels.forEach((panel, i) => {
        const center = total > 1 ? i / (total - 1) : 0.5;
        const d = Math.abs(hAmt - center);
        const near = clamp01(1 - d * 1.6);
        const ry = (hAmt - center) * -9;
        const sc = 0.82 + near * 0.18;
        panel.style.transform = 'perspective(1100px) rotateY(' + ry.toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';
        panel.style.filter = 'brightness(' + (0.55 + near * 0.45).toFixed(3) + ')';
        panel.style.zIndex = String(100 - Math.round(d * 10));
      });

      const fill = w.querySelector('.kc-hrail span');
      if (fill) fill.style.setProperty('--w', (hAmt * 100).toFixed(1) + '%');
      w.setAttribute('aria-hidden', vis <= 0.5 ? 'true' : 'false');
    }

    /* -- Per-element parallax + deep dive -- */
    if (!this.reduced) {
      for (const item of this.parallaxEls) {
        const local = clamp01(p * (1 + item.depth) - item.depth * 0.5);
        const y = (0.5 - local) * item.depth * 260;
        const r = item.rot ? (0.5 - local) * item.rot : 0;
        item.el.style.transform = r
          ? 'translate3d(0,' + y.toFixed(2) + 'px,0) rotateX(' + r.toFixed(2) + 'deg)'
          : 'translate3d(0,' + y.toFixed(2) + 'px,0)';
      }
      for (const el of this.deepEls) {
        const local = clamp01((p - 0.8) / 0.2);
        const s = 1 - smoothstep(0, 1, local) * 0.22;
        const o = 1 - smoothstep(0, 0.7, local);
        el.style.transform = 'scale(' + s.toFixed(4) + ')';
        el.style.opacity = o.toFixed(3);
      }
    }
  }
}
