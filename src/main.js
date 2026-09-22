import './style.css';
import './professional-100.css';
import './professional-100.js';
import './pro-1000.css';
import './pro-1000.js';
import './polish.js';
import './creative.js';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CinematicExperience } from './cinematic/index.js';

gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis({
  duration: 1.6,
  easing: (t) => 1 - Math.pow(1 - t, 4),
  smoothWheel: true,
  touchMultiplier: 1.4,
});

lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

const app = document.getElementById('app');
const experience = new CinematicExperience(app, { lenis, gsap });
experience.init();

window.__LENIS__ = lenis;
window.__GSAP__ = gsap;
