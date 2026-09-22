import * as THREE from 'three';

/**
 * WorksShowcase — holographic ring of project previews.
 * Interactive: pointer parallax on the ring, per-screen hover raycasting
 * with glow/brighten response, and real image textures when preview
 * images are available (falls back to pristine glass).
 */
export class WorksShowcase {
  constructor(scene, envMap, { reducedMotion = false } = {}) {
    this.scene = scene;
    this.envMap = envMap;
    this.reducedMotion = reducedMotion;
    this.screens = [];
    this.orbiters = [];
    this.group = new THREE.Group();
    this.group.rotation.x = 0.16; // tilt toward the camera for depth
    this.scene.add(this.group);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-10, -10);
    this.hovered = null;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.items = [];
    this.create();
  }

  create() {
    const N = 8;

    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const radius = 4.6 + (i % 2) * 1.2;
      const height = 2.2 + Math.sin(i * 1.7) * 1.4;

      const plane = new THREE.PlaneGeometry(2.1, 1.35);
      const mat = new THREE.MeshPhysicalMaterial({
        color: i % 3 === 0 ? 0xffffff : 0x888888,
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.82,
        thickness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0,
        ior: 1.4,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        envMap: this.envMap
      });
      const screen = new THREE.Mesh(plane, mat);
      screen.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      screen.lookAt(0, height, 0);
      screen.userData = {
        angle,
        radius,
        height,
        bobPhase: i * 0.9,
        spin: (i % 2 === 0 ? 1 : -1) * (0.1 + (i % 3) * 0.02)
      };
      this.group.add(screen);

      // Hairline frame
      const edge = new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.1, 1.35));
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
      const frame = new THREE.LineSegments(edge, edgeMat);
      frame.position.copy(screen.position);
      frame.quaternion.copy(screen.quaternion);
      this.group.add(frame);

      // Soft glow quad behind
      const glow = new THREE.PlaneGeometry(2.6, 1.8);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.04,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const glowMesh = new THREE.Mesh(glow, glowMat);
      glowMesh.position.copy(screen.position).addScaledVector(screen.getWorldDirection(new THREE.Vector3()), -0.15);
      glowMesh.quaternion.copy(screen.quaternion);
      screen.userData.frame = frame;
      screen.userData.glow = glowMesh;
      this.group.add(glowMesh);

      this.screens.push(screen);
    }

    // Small orbiting solids
    const solids = [
      { geo: new THREE.IcosahedronGeometry(0.28, 0), y: 0.6, spd: 0.4 },
      { geo: new THREE.OctahedronGeometry(0.24, 0), y: -0.8, spd: -0.3 },
      { geo: new THREE.TorusKnotGeometry(0.18, 0.06, 48, 8), y: 2.4, spd: 0.55 }
    ];
    solids.forEach((s, i) => {
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.9,
        roughness: 0.15,
        emissive: 0xffffff,
        emissiveIntensity: 0.15,
        envMap: this.envMap
      });
      const mesh = new THREE.Mesh(s.geo, mat);
      mesh.userData = { y: s.y, spd: s.spd, phase: i * 2.1, radius: 3.4 + i * 1.1 };
      this.group.add(mesh);
      this.orbiters.push(mesh);
    });

    this.group.scale.setScalar(0.01);
  }

  setPointer(ndcX, ndcY) {
    this.pointer.set(ndcX, ndcY);
  }

  setWorks(items) {
    this.items = items || [];
    this.applyTextures();
  }

  applyTextures() {
    if (!this.items || !this.screens) return;
    this.screens.forEach((screen, i) => {
      const item = this.items[i % Math.max(1, this.items.length)];
      const url = item && (item.image || item.previewUrl);
      if (!url || screen.userData.textureApplied) return;
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const mat = screen.material;
        mat.map = tex;
        mat.color.setHex(0xffffff);
        mat.opacity = 0.85;
        mat.needsUpdate = true;
      });
      screen.userData.textureApplied = true;
    });
  }

  pick(camera) {
    if (this.group.scale.x < 0.6) return null;
    this.raycaster.setFromCamera(this.pointer, camera);
    const hits = this.raycaster.intersectObjects(this.screens, false);
    return hits.length ? hits[0].object : null;
  }

  setHovered(screen) {
    if (this.hovered === screen) return;
    this.hovered = screen;
    this.screens.forEach((s) => {
      const target = s === screen;
      s.material.opacity = target ? 0.5 : 0.22;
      if (s.userData.frame) s.userData.frame.material.opacity = target ? 0.9 : 0.35;
    });
    document.body.style.cursor = screen ? 'pointer' : '';
  }

  update(time, dt, scrollProgress) {
    // Act 3 range: 0.54 - 0.76 (after the horizontal act)
    const act = THREE.MathUtils.clamp((scrollProgress - 0.54) / 0.22, 0, 1);
    if (act < 1) {
      const eased = 1 - Math.pow(1 - act, 3);
      this.group.scale.setScalar(0.01 + eased * 0.99);
    }

    if (act > 0.2) {
      this.group.rotation.y += dt * 0.08;

      // Pointer parallax — the whole ring leans toward the cursor
      if (!this.reducedMotion) {
        this.group.rotation.x = 0.16 + this.parallaxY * 0.06;
        this.group.position.x = this.parallaxX * 0.5;
        this.parallaxX += ((this.pointer.x * 0.6) - this.parallaxX) * Math.min(dt * 3, 1);
        this.parallaxY += ((this.pointer.y * 0.4) - this.parallaxY) * Math.min(dt * 3, 1);
      }

      this.screens.forEach((screen, i) => {
        const d = screen.userData;
        screen.position.y = d.height + Math.sin(time * 0.7 + d.bobPhase) * 0.12;
        screen.rotation.y += dt * d.spin;
        screen.lookAt(0, screen.position.y, 0);
        if (d.frame) {
          d.frame.position.copy(screen.position);
          d.frame.quaternion.copy(screen.quaternion);
        }
        if (d.glow) {
          const dir = new THREE.Vector3();
          d.glow.position.copy(screen.position).addScaledVector(screen.getWorldDirection(dir), -0.15);
          d.glow.quaternion.copy(screen.quaternion);
          const base = 0.035 + 0.02 * Math.sin(time * 1.4 + i);
          d.glow.material.opacity = this.hovered === screen ? 0.16 : base;
        }
      });

      this.orbiters.forEach((m, i) => {
        const d = m.userData;
        d.phase += dt * d.spd;
        m.position.x = Math.cos(d.phase) * d.radius;
        m.position.z = Math.sin(d.phase) * d.radius;
        m.position.y = d.y + Math.sin(time * 0.5 + i) * 0.2;
        m.rotation.x += dt * 0.4;
        m.rotation.y += dt * 0.5;
      });
    }
  }

  onResize() {}
}
