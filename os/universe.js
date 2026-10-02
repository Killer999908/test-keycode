/* ============================================================
   KEYCODE OS — Living AI Universe (Three.js)
   Neural network core, orbiting holograms, particle field,
   floating code blocks, camera parallax responding to mouse.
   ============================================================ */
export class Universe {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouse = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    this.time = 0;
    this.groups = [];
    this.ambience = 1;          // live control: 0.3 (dim, during builds) → 1 (full)
    this.fps = 60;
    this._raf = null;
    this._lastFrame = performance.now();

    this._init();
    this._bind();
    this._start();
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    this._probeWebGPU();
  }

  /** WebGPU capability probe — real, future-proof renderer detection. */
  async _probeWebGPU() {
    try {
      if (!navigator.gpu) { this.gpu = 'unavailable'; return; }
      const adapter = await navigator.gpu.requestAdapter();
      this.gpu = adapter ? 'ready' : 'no-adapter';
    } catch { this.gpu = 'error'; }
    const el = document.getElementById('st-gpu-backend');
    if (el) el.textContent = this.gpu === 'ready' ? 'WebGPU ✓' : 'WebGL2';
  }

  _init() {
    const canvas = this.canvas;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      // WebGL unavailable — degrade gracefully (CSS background persists)
      this.disabled = true;
      console.warn('KEYCODE OS: WebGL unavailable, running without 3D universe.', e);
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x04060c, 0.045);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.set(0, 0, 16);

    this._makeLights();
    this._makeCore();
    this._makeParticles();
    this._makeNeuralNetwork();
    this._makeHolograms();
    this._makeCodeBlocks();
    this._makeGrid();
  }

  _makeLights() {
    const a = new THREE.AmbientLight(0x404080, 0.5);
    this.scene.add(a);
    const d1 = new THREE.DirectionalLight(0x6d5cff, 1.2);
    d1.position.set(6, 8, 10);
    this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x22d3ee, 0.8);
    d2.position.set(-8, -4, 6);
    this.scene.add(d2);
  }

  _makeCore() {
    // Central energy core
    const coreGeo = new THREE.IcosahedronGeometry(2.2, 2);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x6d5cff,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    });
    this.core = new THREE.Mesh(coreGeo, coreMat);
    this.scene.add(this.core);

    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.25,
    });
    this.coreInner = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), innerMat);
    this.core.add(this.coreInner);

    // Orbiting ring 1
    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.02, 8, 90),
      new THREE.MeshBasicMaterial({ color: 0x6d5cff, transparent: true, opacity: 0.6 })
    );
    this.scene.add(ring1);
    // Orbiting ring 2 (tilted)
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(4.2, 0.014, 8, 90),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.45 })
    );
    ring2.rotation.x = Math.PI / 2.2;
    this.scene.add(ring2);

    this.core.rings = [ring1, ring2];

    // Satellite node orbiting
    const satGeo = new THREE.SphereGeometry(0.14, 16, 16);
    const satMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    this.satellite = new THREE.Mesh(satGeo, satMat);
    this.scene.add(this.satellite);

    this.groups.push({ rings: [ring1, ring2], satellite: this.satellite });
  }

  _makeParticles() {
    const count = 2600;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [
      new THREE.Color(0x6d5cff),
      new THREE.Color(0x22d3ee),
      new THREE.Color(0xa78bfa),
      new THREE.Color(0xffffff),
    ];
    for (let i = 0; i < count; i++) {
      const r = 18 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7;
      positions[i * 3 + 2] = r * Math.cos(phi) - 12;
      const c = palette[(Math.random() * palette.length) | 0];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  _makeNeuralNetwork() {
    // A field of neural nodes with glowing connections
    const nodes = [];
    const nodeCount = 60;
    for (let i = 0; i < nodeCount; i++) {
      const r = 10 + Math.random() * 34;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      nodes.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta) * 0.7,
        z: r * Math.cos(phi) - 10,
        vx: (Math.random() - 0.5) * 0.02,
        vy: (Math.random() - 0.5) * 0.02,
      });
    }
    this.netNodes = nodes;

    // Points for nodes
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(nodeCount * 3);
    nodes.forEach((n, i) => {
      pos[i * 3] = n.x; pos[i * 3 + 1] = n.y; pos[i * 3 + 2] = n.z;
    });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.5,
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.netPoints = new THREE.Points(geo, mat);
    this.scene.add(this.netPoints);

    // Build connection lines (static set, rebuilt occasionally)
    this.netLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      color: 0x6d5cff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.netLines);
    this._rebuildConnections();
  }

  _rebuildConnections() {
    const lines = [];
    const nodes = this.netNodes;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dz = nodes[i].z - nodes[j].z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 9 && Math.random() < 0.35) {
          lines.push(nodes[i].x, nodes[i].y, nodes[i].z, nodes[j].x, nodes[j].y, nodes[j].z);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.netLines.geometry.dispose();
    this.netLines.geometry = geo;
  }

  _makeHolograms() {
    // Floating wireframe shapes at various depths
    const defs = [
      { geo: new THREE.TorusGeometry(1.4, 0.02, 8, 40), pos: [-7, 3.5, -6], col: 0x22d3ee, rot: [0.8, 0.4, 0] },
      { geo: new THREE.OctahedronGeometry(1.3), pos: [6.5, -3, -8], col: 0x6d5cff, rot: [0.3, 0.7, 0.1] },
      { geo: new THREE.TorusKnotGeometry(1.1, 0.28, 60, 8), pos: [7.5, 3.8, -10], col: 0xa78bfa, rot: [0.5, 0.9, 0.2] },
      { geo: new THREE.BoxGeometry(2, 2, 2), pos: [-6.5, -3.6, -7], col: 0x22d3ee, rot: [0.6, 0.3, 0.5] },
      { geo: new THREE.IcosahedronGeometry(1.1, 0), pos: [0, 4.6, -12], col: 0xffffff, rot: [0.2, 0.5, 0.3] },
      { geo: new THREE.TetrahedronGeometry(1.5), pos: [-8.5, 0, -12], col: 0x6d5cff, rot: [0.4, 0.2, 0.9] },
      { geo: new THREE.TorusGeometry(1.1, 0.3, 8, 30), pos: [4.5, 4.6, -14], col: 0x34d399, rot: [1.2, 0.1, 0.4] },
    ];
    this.holos = defs.map((d) => {
      const mat = new THREE.MeshBasicMaterial({
        color: d.col,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
      });
      const mesh = new THREE.Mesh(d.geo, mat);
      mesh.position.set(...d.pos);
      mesh.rotation.set(...d.rot);
      mesh.userData = d;
      this.scene.add(mesh);
      return mesh;
    });
  }

  _makeCodeBlocks() {
    // Floating glyph "code blocks" — small planes with shimmering rects
    const blocks = [];
    for (let i = 0; i < 26; i++) {
      const w = 2.4 + Math.random() * 2.4;
      const h = 1.1 + Math.random() * 1.2;
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x6d5cff,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const r = 14 + Math.random() * 40;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 14;
      mesh.position.set(r * Math.cos(theta), y, r * Math.sin(theta) * 0.7 - 14);
      mesh.rotation.set(Math.random() * 0.4, theta, Math.random() * 0.4);
      mesh.userData = { spin: (Math.random() - 0.5) * 0.4, bob: Math.random() * 6.28 };
      this.scene.add(mesh);
      blocks.push(mesh);
    }
    this.codeBlocks = blocks;
  }

  _makeGrid() {
    // Infinite floor grid for depth
    const grid = new THREE.GridHelper(120, 60, 0x6d5cff, 0x223);
    grid.material.transparent = true;
    grid.material.opacity = 0.14;
    grid.position.y = -8;
    this.scene.add(grid);
    this.grid = grid;
  }

  _bind() {
    this._onMove = (e) => {
      this.target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      this.target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', this._onMove);
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _start() {
    const loop = () => {
      const now = performance.now();
      const dt = now - this._lastFrame;
      this._lastFrame = now;
      if (dt > 0 && dt < 1000) this.fps = this.fps * 0.95 + (1000 / dt) * 0.05;
      this._tick();
      if (this.renderer) this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _tick() {
    this.time += 0.01;
    this._applyAmbience();

    // Smooth camera parallax
    this.mouse.x += (this.target.x - this.mouse.x) * 0.03;
    this.mouse.y += (this.target.y - this.mouse.y) * 0.03;
    this.camera.position.x = this.mouse.x * 1.6;
    this.camera.position.y = this.mouse.y * 1.1;
    this.camera.lookAt(0, 0, -6);

    // Core rotation + pulse
    this.core.rotation.x += 0.002;
    this.core.rotation.y += 0.003;
    this.coreInner.rotation.y -= 0.006;
    const s = 1 + Math.sin(this.time * 2) * 0.05;
    this.core.scale.set(s, s, s);
    this.core.rings[0].rotation.z += 0.004;
    this.core.rings[0].rotation.x += 0.0015;
    this.core.rings[1].rotation.y += 0.003;

    // Satellite orbit
    const t = this.time * 0.8;
    this.satellite.position.set(
      Math.cos(t) * 5.2,
      Math.sin(t * 1.3) * 2.4,
      Math.sin(t) * 5.2
    );

    // Particles drift
    this.particles.rotation.y += 0.00018;

    // Neural nodes drift + connections
    if (this.netNodes) {
      const pos = this.netNodes;
      const attr = this.netPoints.geometry.attributes.position;
      for (let i = 0; i < pos.length; i++) {
        pos[i].x += pos[i].vx;
        pos[i].y += pos[i].vy;
        if (Math.abs(pos[i].x) > 50) pos[i].vx *= -1;
        if (Math.abs(pos[i].y) > 30) pos[i].vy *= -1;
        attr.array[i * 3] = pos[i].x;
        attr.array[i * 3 + 1] = pos[i].y;
        attr.array[i * 3 + 2] = pos[i].z;
      }
      attr.needsUpdate = true;
      // Pulse connection opacity
      this.netLines.material.opacity = 0.1 + Math.sin(this.time * 1.4) * 0.05;
    }

    // Holograms rotate
    for (const h of this.holos) {
      h.rotation.x += 0.004;
      h.rotation.y += 0.006;
      h.rotation.z += 0.002;
      h.position.y += Math.sin(this.time * 0.7 + h.position.x) * 0.002;
    }

    // Code blocks float
    for (const b of this.codeBlocks) {
      b.rotation.y += b.userData.spin * 0.01;
      b.position.y += Math.sin(this.time * 0.5 + b.userData.bob) * 0.003;
    }

    // Grid subtle movement
    this.grid.position.z = (this.time * 0.4) % 1;
  }

  /* ---- Ambient intensity control — REAL, drives scene + materials ----
     intensity: 0.3 (dim, focus on build) → 1 (full, home screen).
     Ramps core, particles, neural lines, holograms and fog each frame. */
  setAmbience(intensity) {
    this.ambience = Math.max(0.3, Math.min(1, intensity));
  }

  _applyAmbience() {
    const k = this.ambience;
    if (this._amb === undefined) this._amb = k;
    // ease toward the target so transitions feel alive, not snapped
    if (Math.abs(k - this._amb) > 0.002) this._amb += (k - this._amb) * 0.04;
    else this._amb = k;
    const a = this._amb;
    if (this.core) {
      this.core.material.opacity = 0.55 * a;
      if (this.coreInner) this.coreInner.material.opacity = 0.25 * a;
    }
    if (this.particles) this.particles.material.opacity = 0.85 * a;
    if (this.netLines) this.netLines.material.opacity = (0.1 + Math.sin(this.time * 1.4) * 0.05) * a;
    for (const h of this.holos || []) h.material.opacity = 0.35 * a;
    if (this.scene?.fog) this.scene.fog.density = 0.045 + (1 - a) * 0.02;
  }

  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('pointermove', this._onMove);
    // Free every GPU resource we allocated
    this.scene?.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const m of mats) m.dispose();
    });
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
  }
}
