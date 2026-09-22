import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { PMREMGenerator } from 'three/src/extras/PMREMGenerator.js';
import { CinematicCamera } from './CinematicCamera.js';
import { HybridScroll } from './HybridScroll.js';
import { BackgroundField } from '../acts/Act0_VoidCore.js';
import { InteractiveServiceGraph } from '../acts/Act2_Interactive.js';
import { WorksShowcase } from '../acts/Act3_Works.js';
import { AgentSwarm } from '../acts/Act3_Agents.js';
import { UI } from '../ui/UI.js';
import { Effects, Soundscape } from '../ui/effects.js';
import { clamp01 } from '../three/helpers.js';

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

const HDRI_TIMEOUT = 12000;

export class CinematicExperience {
  constructor(appRoot, { lenis, gsap } = {}) {
    this.appRoot = appRoot;
    this.lenis = lenis || null;
    this.gsap = gsap || null;
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.composer = null;
    this.cameraRig = null;
    this.timer = new THREE.Timer();
    this.scrollY = 0;
    this.scrollVelocity = 0;
    this.lastScrollY = 0;
    this.maxScroll = 0;
    this.acts = [];
    this.ui = null;
    this.loaded = false;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.dpr = Math.min(window.devicePixelRatio, 2);
    this.assets = { hdris: [] };
    this.qualityTier = 2;
    this.fpsAccum = 0;
    this.fpsSamples = 0;
    this.smoothProgress = 0;
    this.lastSmooth = 0;
    this.smoothVel = 0;
  }

  async init() {
    this.setupCanvas();
    this.setupRenderer();
    this.setupScene();
    this.setupCamera();
    this.startLoader();
    this.updateLoaderProgress(12);
    await this.loadHDRIs();
    this.updateLoaderProgress(62);
    this.setupPostProcessing();
    this.createActs();
    this.setupCameraRig();
    this.setupUI();
    this.setupEffects();
    // Hybrid scroll (horizontal act + velocity tilt + parallax) — after UI DOM exists
    this.hybrid = new HybridScroll({ reducedMotion: this.reducedMotion });
    this.hybrid.build();
    this.bindEvents();
    this.initLiveData();
    this.updateLoaderProgress(88);
    this.loaded = true;
    this.updateLoaderProgress(100);
    this.animate();
  }

  setupCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'stage';
    this.canvas.setAttribute('aria-label', 'Cinematic 3D background');
    this.appRoot.appendChild(this.canvas);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0b);
  }

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 0, 14);
  }

  async loadHDRIs() {
    const hdriUrls = [
      'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/venice_sunset_1k.hdr',
      'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_07_1k.hdr',
      'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kiara_1_dawn_1k.hdr'
    ];
    const hdrLoader = new HDRLoader();
    const pmrem = new PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const fallbackEnvMap = pmrem.fromScene(new THREE.Scene()).texture;
    this.assets.hdris = [fallbackEnvMap, fallbackEnvMap, fallbackEnvMap];

    await Promise.all(hdriUrls.map(async (url, i) => {
      try {
        const texture = await withTimeout(hdrLoader.loadAsync(url), HDRI_TIMEOUT);
        this.assets.hdris[i] = pmrem.fromEquirectangular(texture).texture;
        texture.dispose();
      } catch (e) {
        console.warn('HDRI load failed, using fallback:', url, e);
      }
    }));
    pmrem.dispose();
  }

  setupPostProcessing() {
    const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      colorSpace: THREE.SRGBColorSpace
    });

    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.8, 0.4, 0.85
    );
    bloomPass.threshold = 0.6;
    bloomPass.strength = 0.9;
    bloomPass.radius = 0.5;
    this.composer.addPass(bloomPass);
    this.bloomPass = bloomPass;

    const chromaticShader = {
      uniforms: {
        tDiff: { value: null },
        uAmount: { value: 0.0022 }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D tDiff; uniform float uAmount; varying vec2 vUv;
        void main(){ vec2 o=uAmount*(vUv-0.5); vec3 c; c.r=texture2D(tDiff,vUv+o).r; c.g=texture2D(tDiff,vUv).g; c.b=texture2D(tDiff,vUv-o).b; gl_FragColor=vec4(c,1.0); }`
    };
    this.composer.addPass(new ShaderPass(chromaticShader));

    const filmShader = {
      uniforms: {
        tDiff: { value: null },
        uTime: { value: 0 },
        uIntensity: { value: 0.025 }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D tDiff; uniform float uTime; uniform float uIntensity; varying vec2 vUv;
        float rand(vec2 co){ return fract(sin(dot(co.xy,vec2(12.9898,78.233)))*43758.5453); }
        void main(){ vec3 c=texture2D(tDiff,vUv).rgb; float g=rand(vUv*100.0+uTime)*2.0-1.0; c+=g*uIntensity; float v=1.0-length(vUv-0.5)*1.15; c*=clamp(v,0.0,1.0); gl_FragColor=vec4(c,1.0); }`
    };
    const filmPass = new ShaderPass(filmShader);
    this.filmPass = filmPass;
    this.composer.addPass(filmPass);

    this.fxaaPass = new FXAAPass(window.innerWidth * this.dpr, window.innerHeight * this.dpr);
    this.composer.addPass(this.fxaaPass);

    this.composer.addPass(new OutputPass());
  }

  createActs() {
    this.backgroundField = new BackgroundField(this.scene, this.assets.hdris[1]);
    this.acts.push(this.backgroundField);

    // Interactive service graph — hover tooltips + click-to-focus filtering
    this.serviceGraph = new InteractiveServiceGraph(this.scene, this.assets.hdris[1], {
      reducedMotion: this.reducedMotion,
      camera: this.camera
    });
    this.serviceGraph.onClick(node => {
      if (node && node.href) window.location.href = node.href;
    });
    this.acts.push(this.serviceGraph);

    this.works = new WorksShowcase(this.scene, this.assets.hdris[0], { reducedMotion: this.reducedMotion });
    this.acts.push(this.works);

    this.agentSwarm = new AgentSwarm(this.scene, this.assets.hdris[0]);
    this.acts.push(this.agentSwarm);

    this.setupLighting();
  }

  setupLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(10, 20, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 80;
    keyLight.shadow.camera.left = -30;
    keyLight.shadow.camera.right = 30;
    keyLight.shadow.camera.top = 30;
    keyLight.shadow.camera.bottom = -30;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-15, 5, -10);
    this.scene.add(fillLight);

    const rimLight = new THREE.SpotLight(0xffffff, 1.0);
    rimLight.position.set(0, 30, -20);
    rimLight.target.position.set(0, 0, 0);
    rimLight.angle = Math.PI / 6;
    rimLight.penumbra = 0.5;
    this.scene.add(rimLight);
    this.scene.add(rimLight.target);
  }

  setupCameraRig() {
    this.cameraRig = new CinematicCamera(this.camera, this.acts);
  }

  setupUI() {
    this.ui = new UI(this);
    this.appRoot.appendChild(this.ui.element);

    this.ui.renderWorks([]);
  }

  setupEffects() {
    this.effects = new Effects(this.appRoot);
    this.sound = new Soundscape();
    const soundBtn = this.ui.element.querySelector('#sound-btn');
    this.sound.attach(soundBtn);
  }

  bindEvents() {
    window.addEventListener('resize', () => this.onResize());
    const onScroll = () => {
      const sy = window.scrollY;
      this.scrollVelocity = sy - this.lastScrollY;
      this.lastScrollY = sy;
      this.scrollY = sy;
      this.maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      this.updateProgressBar();
    };
    if (this.lenis) this.lenis.on('scroll', onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });

    window.addEventListener('pointermove', (e) => {
      this.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointerY = -(e.clientY / window.innerHeight) * 2 + 1;
      if (this.serviceGraph) this.serviceGraph.setPointer(this.pointerX, this.pointerY);
    }, { passive: true });

    // Click (not drag) on a service node → navigate to its pipeline
    let downX = 0, downY = 0;
    window.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
    window.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      if (!this.serviceGraph || !this.serviceGraph.hovered) return;
      if (this.serviceGraph.group.scale.x < 0.6) return;
      const node = this.serviceGraph.hovered;
      this.serviceGraph.clickCallbacks.forEach(cb => cb(node));
    });

    let dragging = false, lastX = 0, dragRot = 0;
    window.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; document.body.style.cursor = 'grabbing'; });
    window.addEventListener('pointerup', () => { dragging = false; document.body.style.cursor = ''; });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      dragRot += dx * 0.004;
      if (this.scene) this.scene.rotation.y += dx * 0.003;
      this.pointerX = Math.max(-1, Math.min(1, this.pointerX + dx*0.002));
    }, { passive: true });
    window.addEventListener('wheel', (e) => {
      if (this.camera) this.camera.position.z = Math.max(8, Math.min(22, this.camera.position.z + e.deltaY * 0.01));
    }, { passive: true });
  }

  initLiveData() {
    import('../api/client.js').then(({ api }) => {
      Promise.all([api.featuredServices(), api.health().catch(() => ({}))])
        .then(([services, health]) => {
          if (services.length) {
            this.ui.renderWorks(services);
            if (this.works) this.works.setWorks(services);
          }
          this.ui.setLive((health.status && health.status !== 'ok') ? health.status : '');
          this.liveStatus = health.status;
        })
        .catch(() => {});
      api.me().then(user => { if (user) this.ui.setNavAuth(user); }).catch(() => {});
    }).catch(() => {});
  }

  updateProgressBar() {
    const progress = this.maxScroll > 0 ? Math.min(this.scrollY / this.maxScroll, 1) : 0;
    const bar = document.querySelector('.progress span');
    if (bar) bar.style.width = (progress * 100).toFixed(1) + '%';
  }

  startLoader() {
    this.loaderEl = document.querySelector('.loader');
    this.loaderBar = document.querySelector('.loader-bar span');
    this.loaderPctEl = document.querySelector('.loader-pct');
    this.loaderTextEl = document.querySelector('.loader-text');
    this.loaderPct = 0;
    const tick = () => {
      if (this.loaderBar) {
        const display = parseFloat(this.loaderBar.style.width) || 0;
        if (display < this.loaderPct) {
          const next = Math.min(this.loaderPct, display + 2.6 + Math.random()*3.2);
          this.loaderBar.style.width = next.toFixed(1) + '%';
          if (this.loaderPctEl) this.loaderPctEl.textContent = Math.round(next).toString().padStart(2,'0') + '%';
          if (this.loaderTextEl) this.loaderTextEl.textContent = next < 30 ? 'Crafting 3D world…' : next < 60 ? 'Loading shards…' : next < 85 ? 'Compiling shaders…' : 'Ready to explore';
        }
      }
      if (!(this.loaderPct >= 100 && this.loaded)) setTimeout(tick, 90);
      else this.finishLoader();
    };
    tick();
  }

  finishLoader() {
    if (this.loaderBar) this.loaderBar.style.width = '100%';
    if (this.loaderEl) { this.loaderEl.classList.add('hidden'); document.body.classList.add('ready'); }
  }

  updateLoaderProgress(pct) {
    this.loaderPct = Math.max(this.loaderPct, Math.min(100, pct));
    if (!this.loaderEl) this.loaderEl = document.querySelector('.loader');
    if (this.loaderPct >= 100 && this.loaded) this.finishLoader();
  }

  adaptiveQuality(dt) {
    this.fpsAccum += dt;
    this.fpsSamples++;
    if (this.fpsSamples >= 60) {
      const avgDt = this.fpsAccum / this.fpsSamples;
      const fps = 1 / Math.max(avgDt, 1e-4);
      this.fpsAccum = 0;
      this.fpsSamples = 0;

      let tier = 2;
      if (fps < 42) tier = 0;
      else if (fps < 55) tier = 1;

      if (tier !== this.qualityTier) {
        this.qualityTier = tier;
        const strength = [0.35, 0.6, 0.9][tier];
        if (this.bloomPass) this.bloomPass.strength = strength;
        if (this.filmPass) this.filmPass.uniforms.uIntensity.value = [0, 0.015, 0.025][tier];
        const dpr = tier === 0 ? 1 : Math.min(window.devicePixelRatio, 2);
        if (dpr !== this.renderer.getPixelRatio()) {
          this.renderer.setPixelRatio(dpr);
          this.renderer.setSize(window.innerWidth, window.innerHeight);
          this.composer.setPixelRatio(dpr);
          this.composer.setSize(window.innerWidth, window.innerHeight);
        }
      }
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.acts.forEach(act => act.onResize?.(window.innerWidth, window.innerHeight));
    if (this.hybrid) this.hybrid.onResize();
    this.maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 1 / 30);
    const time = this.timer.getElapsed();

    const rawProgress = this.maxScroll > 0 ? clamp01(this.scrollY / this.maxScroll) : 0;

    // Damped progress: eases the whole experience (camera, sections, labels) into
    // smooth transitions on scroll instead of snapping to the raw position.
    let scrollProgress = rawProgress;
    if (!this.reducedMotion) {
      this.smoothProgress += (rawProgress - this.smoothProgress) * (1 - Math.exp(-dt * 6.5));
      scrollProgress = this.smoothProgress;
    }
    this.smoothVel = Math.abs(scrollProgress - this.lastSmooth) / Math.max(dt, 1e-4);
    this.lastSmooth = scrollProgress;

    // Camera
    this.cameraRig.update(scrollProgress, this.pointerX || 0, this.pointerY || 0, dt);
    const scrollVel = Math.max(0, Math.abs(this.scrollVelocity || 0));

    // Interactive graph: raycast hover
    if (this.serviceGraph) {
      const hit = this.serviceGraph.pick(this.camera);
      this.serviceGraph.setHovered(hit);
    }
    // Feed pointer + hover to the acts that react
    if (this.backgroundField) this.backgroundField.setPointer(this.pointerX || 0, this.pointerY || 0);
    if (this.works) {
      this.works.setPointer(this.pointerX || 0, this.pointerY || 0);
      this.works.setHovered(this.works.pick(this.camera));
    }

    // Acts
    this.acts.forEach(act => act.update?.(time, dt, scrollProgress));

    // Hybrid scroll choreography
    if (this.hybrid) this.hybrid.update(scrollProgress, this.scrollVelocity || 0, dt);

    // UI
    if (this.ui) {
      this.ui.updateScroll(scrollProgress, this.smoothVel);
      this.ui.updateActIndicator(this.cameraRig.getActIndex());
    }

    // Effects + sound
    if (this.effects && !this.reducedMotion) this.effects.update(dt, time);
    if (this.sound) this.sound.setIntensity(scrollVel);
    this.adaptiveQuality(dt);

    // Post
    if (this.filmPass) this.filmPass.uniforms.uTime.value = time;

    this.composer.render();
  }
}
