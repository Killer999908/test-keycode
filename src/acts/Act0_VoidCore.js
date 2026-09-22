import * as THREE from 'three';
import { BACKGROUND_VERTEX, BACKGROUND_FRAGMENT } from '@shaders/background.js';

export class BackgroundField {
  constructor(scene, envMap) {
    this.scene = scene;
    this.envMap = envMap;
    this.time = 0;
    this.intensity = 1;
    this.pointerTarget = new THREE.Vector2(0.5, 0.5);
    this.pointerSmooth = new THREE.Vector2(0.5, 0.5);
    this.createField();
  }

  /** NDC pointer, fed from the experience loop for reactive motion */
  setPointer(ndcX, ndcY) {
    if (!this.reducedMotion) {
      this.pointerTarget.set(ndcX * 0.5 + 0.5, ndcY * 0.5 + 0.5);
    }
  }

  createField() {
    // Volumetric background plane with custom shader
    const geometry = new THREE.PlaneGeometry(200, 200);
    this.material = new THREE.ShaderMaterial({
      vertexShader: BACKGROUND_VERTEX,
      fragmentShader: BACKGROUND_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uColorA: { value: new THREE.Color('#3b0d95') },
        uColorB: { value: new THREE.Color('#0e7490') },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uEnvMap: { value: this.envMap },
        uScrollProgress: { value: 0 }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.z = -50;
    this.mesh.renderOrder = -10;
    this.scene.add(this.mesh);

    // Core geometry (Act 0 centerpiece) — pointer-reactive
    this.createCore();

    // Particle field
    this.createParticles();
    this.createAlcheShards();
  }

  createAlcheShards() {
    this.alcheGroup = new THREE.Group();
    this.scene.add(this.alcheGroup);
    this.shards = [];
    for (let i = 0; i < 10; i++) {
      const geo = new THREE.IcosahedronGeometry(0.5 + Math.random()*0.9, 0);
      const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setHSL(0.68+Math.random()*0.1, 0.7, 0.62), metalness: 0.12, roughness: 0.07, transmission: 0.9, thickness: 0.35, ior: 1.45, clearcoat: 1, transparent: true, opacity: 0.5, envMap: this.envMap });
      const mesh = new THREE.Mesh(geo, mat);
      const r = 9 + Math.random()*14;
      const theta = (i/10)*Math.PI*2 + Math.random()*0.4;
      const y = (Math.random()-0.5)*10;
      mesh.position.set(Math.cos(theta)*r, y, Math.sin(theta)*r);
      mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0);
      mesh.userData = { rot: new THREE.Vector3((Math.random()-0.5)*0.009, (Math.random()-0.5)*0.011, (Math.random()-0.5)*0.007), baseY: y, phase: Math.random()*Math.PI*2 };
      this.alcheGroup.add(mesh);
      this.shards.push(mesh);
    }
    const ringGeo = new THREE.TorusGeometry(18, 0.07, 12, 100);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
    this.alcheRing = new THREE.Mesh(ringGeo, ringMat);
    this.alcheRing.rotation.x = Math.PI/2.2;
    this.alcheGroup.add(this.alcheRing);
  }

  createCore() {
    const coreGroup = new THREE.Group();

    // Outer iridescent shell
    const shellGeom = new THREE.IcosahedronGeometry(2.5, 2);
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0x8b5cf6,
      metalness: 0.2,
      roughness: 0.1,
      transmission: 0.3,
      thickness: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      iridescence: 1,
      iridescenceIOR: 1.3,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      envMap: this.envMap
    });
    this.coreShell = new THREE.Mesh(shellGeom, shellMat);
    coreGroup.add(this.coreShell);

    // Inner crystal
    const crystalGeom = new THREE.OctahedronGeometry(1.2, 1);
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x22d3ee,
      metalness: 0.8,
      roughness: 0.05,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.5,
      envMap: this.envMap
    });
    this.coreCrystal = new THREE.Mesh(crystalGeom, crystalMat);
    coreGroup.add(this.coreCrystal);

    // Energy rings
    this.energyRings = [];
    for (let i = 0; i < 3; i++) {
      const ringGeom = new THREE.RingGeometry(2.8 + i * 0.4, 3.2 + i * 0.4, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x8b5cf6 : 0x22d3ee,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = i * 0.5;
      ring.userData.speed = 0.15 + i * 0.08;
      coreGroup.add(ring);
      this.energyRings.push(ring);
    }

    // Pulse particles
    const particleCount = 500;
    const particlesGeom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const phases = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      const r = 1.5 + Math.random() * 2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      sizes[i] = 0.02 + Math.random() * 0.04;
      phases[i] = Math.random() * Math.PI * 2;
    }
    particlesGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    particlesGeom.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    const particlesMat = new THREE.PointsMaterial({
      color: 0x22d3ee,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: false
    });
    this.coreParticles = new THREE.Points(particlesGeom, particlesMat);
    coreGroup.add(this.coreParticles);

    coreGroup.scale.setScalar(0.01);
    this.coreGroup = coreGroup;
    this.scene.add(coreGroup);
  }

  createParticles() {
    const count = this.reducedMotion ? 0 : 1500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    this.particleBase = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 30 + Math.random() * 70;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      const colorChoice = Math.random();
      if (colorChoice < 0.5) { colors[i*3]=0.55; colors[i*3+1]=0.36; colors[i*3+2]=0.96; }
      else if (colorChoice < 0.75) { colors[i*3]=0.13; colors[i*3+1]=0.83; colors[i*3+2]=0.93; }
      else { colors[i*3]=0.43; colors[i*3+1]=0.91; colors[i*3+2]=0.72; }
      sizes[i] = 0.05 + Math.random() * 0.15;
    }
    this.particleBase.set(positions);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.PointsMaterial({
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  update(time, dt, scrollProgress) {
    this.time = time;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uScrollProgress.value = scrollProgress;

    // Smoothed pointer → background shader + crystal parallax
    this.pointerSmooth.lerp(this.pointerTarget, Math.min(dt * 3.5, 1));
    this.material.uniforms.uMouse.value.copy(this.pointerSmooth);

    // Core entrance animation (Act 0)
    if (scrollProgress < 0.13) {
      const actProgress = scrollProgress / 0.13;
      const eased = 1 - Math.pow(1 - actProgress, 3);
      this.coreGroup.scale.setScalar(eased);
      this.coreShell.material.opacity = 0.4 * eased;
      this.coreCrystal.material.emissiveIntensity = 0.5 * eased;
      this.coreParticles.material.opacity = 0.8 * eased;
    }

    // Core rotation and pulse (crystal leans toward the cursor)
    if (this.coreGroup.scale.x > 0.5) {
      this.coreGroup.rotation.y += dt * 0.05;
      this.coreGroup.rotation.x += dt * 0.03;
      this.coreCrystal.rotation.y -= dt * 0.08;
      this.coreCrystal.rotation.x += dt * 0.04;
      if (!this.reducedMotion) {
        this.coreGroup.position.x += ((this.pointerSmooth.x - 0.5) * 1.6 - this.coreGroup.position.x) * Math.min(dt * 3, 1);
        this.coreGroup.position.y += ((this.pointerSmooth.y - 0.5) * -1.1 - this.coreGroup.position.y) * Math.min(dt * 3, 1);
      }

      this.energyRings.forEach((ring, i) => {
        ring.rotation.z += dt * ring.userData.speed;
        ring.material.opacity = 0.15 * (0.5 + 0.5 * Math.sin(time * 2 + i));
        ring.scale.setScalar(1 + 0.1 * Math.sin(time * 1.5 + i));
      });

      // Pulse particles
      const positions = this.coreParticles.geometry.attributes.position.array;
      const phases = this.coreParticles.geometry.attributes.phase.array;
      for (let i = 0; i < positions.length / 3; i++) {
        const phase = phases[i];
        const r = 1.5 + 2 * (0.5 + 0.5 * Math.sin(time * 0.8 + phase));
        const theta = time * 0.3 + phase;
        const phi = Math.acos(2 * ((i / (positions.length/3)) % 1) - 1);
        positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i*3+2] = r * Math.cos(phi);
      }
      this.coreParticles.geometry.attributes.position.needsUpdate = true;
    }

    // Particle field slow rotation + cursor wake (parting-sea effect)
    if (this.particles) {
      this.particles.rotation.y += dt * 0.002;
      this.particles.rotation.x += dt * 0.001;
      if (!this.reducedMotion) {
        const pos = this.particles.geometry.attributes.position.array;
        const px = (this.pointerSmooth.x - 0.5) * 60;
        const py = (this.pointerSmooth.y - 0.5) * 36;
        for (let i = 0; i < this.particleBase.length; i += 3) {
          const dx = pos[i] - px, dy = pos[i + 1] - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < 400) {
            const push = (1 - d2 / 400) * 6;
            const len = Math.max(Math.hypot(dx, dy), 0.001);
            pos[i] += (dx / len) * push * dt * 4;
            pos[i + 1] += (dy / len) * push * dt * 4;
          } else {
            // drift home
            const hx = this.particleBase[i], hy = this.particleBase[i + 1];
            pos[i] += (hx - pos[i]) * dt * 0.6;
            pos[i + 1] += (hy - pos[i + 1]) * dt * 0.6;
          }
        }
        this.particles.geometry.attributes.position.needsUpdate = true;
      }
    }
    if (this.alcheGroup) {
      this.alcheGroup.rotation.y += dt * 0.012;
      this.shards.forEach(s => {
        s.rotation.x += s.userData.rot.x;
        s.rotation.y += s.userData.rot.y;
        s.rotation.z += s.userData.rot.z;
        s.position.y = s.userData.baseY + Math.sin(time*0.7 + s.userData.phase)*0.6;
        // Shards drift away from the cursor like startled fish
        if (!this.reducedMotion) {
          const dx = s.position.x - (this.pointerSmooth.x - 0.5) * 16;
          const dy = s.position.y - (this.pointerSmooth.y - 0.5) * 8;
          const d2 = dx*dx + dy*dy;
          const push = Math.max(0, 1 - d2 / 9);
          if (push > 0) {
            const len = Math.max(Math.hypot(dx, dy), 0.001);
            s.position.x += (dx / len) * push * dt * 2.2;
            s.position.y += (dy / len) * push * dt * 1.4;
          }
        }
      });
      if (this.alcheRing) { this.alcheRing.rotation.z += dt*0.04; this.alcheRing.material.opacity = 0.12 + 0.06*Math.sin(time*0.6); }
    }
  }

  onResize(w, h) {
    this.material.uniforms.uResolution.value.set(w, h);
  }

  get reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}