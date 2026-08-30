/* Micro-interaction effects: custom cursor, magnetic buttons, 3D tilt, sound. */

import { damp, clamp01 } from '../three/helpers.js';

export class Effects {
  constructor(root) {
    this.root = root;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.mouse = { x: 0, y: 0, px: 0, py: 0, sx: 0, sy: 0 };
    this.dots = { x: -100, y: -100, rx: -100, ry: -100 };
    this.magnetics = [];
    this.tilts = [];
    this.initCursor();
    this.initListeners();
  }

  initCursor() {
    const d = document.createElement('div');
    d.className = 'cursor-dot';
    const r = document.createElement('div');
    r.className = 'cursor-ring';
    this.root.appendChild(d);
    this.root.appendChild(r);
    this.dot = d;
    this.ring = r;
  }

  initListeners() {
    window.addEventListener('pointermove', (e) => {
      this.mouse.px = this.mouse.x;
      this.mouse.py = this.mouse.y;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.sx = e.clientX / window.innerWidth;
      this.mouse.sy = e.clientY / window.innerHeight;
    }, { passive: true });

    if (this.reduced) return;

    document.addEventListener('mouseover', (e) => {
      const magnetic = e.target.closest('.magnetic');
      if (magnetic && !this.magnetics.includes(magnetic)) this.magnetics.push(magnetic);
      const interactive = e.target.closest('a, button, .flagship-card, .flagship-card .fc-cta');
      if (interactive) this.ring.classList.add('grow');
    });

    document.addEventListener('mouseout', (e) => {
      const magnetic = e.target.closest('.magnetic');
      if (magnetic) {
        const i = this.magnetics.indexOf(magnetic);
        if (i >= 0) this.magnetics.splice(i, 1);
        magnetic.style.transform = '';
      }
      const interactive = e.target.closest('a, button, .flagship-card, .flagship-card .fc-cta');
      if (interactive) this.ring.classList.remove('grow');
    });
  }

  registerTilt(el, strength = 10) {
    if (this.reduced) return;
    this.tilts.push({ el, strength });
    el.classList.add('panel3d');
  }

  update(dt, time) {
    // Cursor follow (springy)
    this.dots.x = damp(this.dots.x, this.mouse.x, 28, dt);
    this.dots.y = damp(this.dots.y, this.mouse.y, 28, dt);
    this.dots.rx = damp(this.dots.rx, this.mouse.x, 10, dt);
    this.dots.ry = damp(this.dots.ry, this.mouse.y, 10, dt);

    if (this.dot) {
      this.dot.style.transform = `translate(${this.dots.x}px, ${this.dots.y}px) translate(-50%,-50%)`;
    }
    if (this.ring) {
      this.ring.style.transform = `translate(${this.dots.rx}px, ${this.dots.ry}px) translate(-50%,-50%)`;
    }

    // Magnetic buttons — premium stronger pull + scale
    for (const el of this.magnetics) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = this.mouse.x - cx;
      const dy = this.mouse.y - cy;
      const dist = Math.hypot(dx, dy);
      const pull = dist < 120 ? 14 : 8;
      const s = dist < 100 ? 1.04 : 1;
      el.style.transform = `translate(${dx * pull / 48}px, ${dy * pull / 48}px) scale(${s})`;
    }

    // 3D tilt cards
    for (const t of this.tilts) {
      const r = t.el.getBoundingClientRect();
      const nx = ((this.mouse.x - r.left) / r.width) * 2 - 1;
      const ny = ((this.mouse.y - r.top) / r.height) * 2 - 1;
      const s = t.strength;
      t.el.style.transform = `perspective(900px) rotateY(${(nx * s).toFixed(2)}deg) rotateX(${(-ny * s).toFixed(2)}deg)`;
    }
  }
}

/* Procedural Web Audio ambient soundscape. Autoplay-safe; starts on first gesture. */
export class Soundscape {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.started = false;
    this.gain = 0;
    this.btn = null;
  }

  attach(button) {
    this.btn = button;
    button.addEventListener('click', () => this.toggle());
    document.addEventListener('pointerdown', () => this.start(), { once: true });
  }

  start() {
    if (this.started) return;
    this.started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0.0001;
      this.gain.connect(this.ctx.destination);

      // Drone: two detuned saw-ish oscillators through a lowpass
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 240;
      lp.connect(this.gain);

      const o1 = this.ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 55;
      const o2 = this.ctx.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = 55.7;
      o1.connect(lp);
      o2.connect(lp);
      o1.start();
      o2.start();

      // Airy noise bed
      const noise = this.createNoise();
      const nf = this.ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 800;
      nf.Q.value = 0.4;
      noise.connect(nf);
      nf.connect(this.gain);
      noise.start();

      // Slow LFO breathing on the filter
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.06;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 80;
      lfo.connect(lfoGain);
      lfoGain.connect(lp.frequency);
      lfo.start();

      this.ctx.suspend();
    } catch {
      this.started = false;
    }
  }

  createNoise() {
    const length = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  toggle() {
    this.start();
    if (!this.ctx) return;
    this.enabled = !this.enabled;
    const now = this.ctx.currentTime;
    this.ctx.resume();
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.linearRampToValueAtTime(this.enabled ? 0.14 : 0.0001, now + 0.8);
    if (this.btn) this.btn.classList.toggle('off', !this.enabled);
  }

  setIntensity(scrollVelocity) {
    if (!this.ctx || !this.enabled) return;
    const target = 0.14 + clamp01(scrollVelocity / 3000) * 0.12;
    this.gain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.5);
  }
}
