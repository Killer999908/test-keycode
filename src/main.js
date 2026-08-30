import './style.css';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CinematicExperience } from './cinematic/index.js';

gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
  touchMultiplier: 1.8,
});

lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

const app = document.getElementById('app');
(function addVideoBg(){
  const v = document.createElement('video');
  v.className = 'video-bg';
  v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
  v.poster = '/og-image.png';
  const sources = ['/bc.mp4', '/video-bg-new.mp4'];
  for(const s of sources){ const src=document.createElement('source'); src.src=s; src.type='video/mp4'; v.appendChild(src); }
  v.addEventListener('error', ()=>{ v.style.display='none'; });
  app.prepend(v);
  const overlay = document.createElement('div');
  overlay.className = 'video-overlay';
  app.prepend(overlay);
  v.play().catch(()=>{});
})();
const experience = new CinematicExperience(app, { lenis, gsap });
experience.init();

window.__LENIS__ = lenis;
window.__GSAP__ = gsap;