/* ============================================================
   KEYCODE OS — 3D Model Viewer
   Rotates a procedural model (CAD/PCB/product/game preview)
   with OrbitControls + glow materials.
   ============================================================ */
export class Viewer3D {
  constructor(canvasSelector) {
    this.canvas = document.querySelector(canvasSelector);
    if (!this.canvas) return;
    this.stage = this.canvas.parentElement;
    this.mode = 'cad';
    this._init();
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
      this.disabled = true;
      console.warn('KEYCODE OS: WebGL unavailable, 3D viewer disabled.', e);
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x04060c, 1);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this.camera.position.set(5, 4, 8);

    this.controls = new THREE.OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.4;
    this.controls.enablePan = false;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 24;

    // Lights
    const a = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(a);
    const d1 = new THREE.DirectionalLight(0x6d5cff, 1.4);
    d1.position.set(6, 8, 6);
    this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x22d3ee, 0.9);
    d2.position.set(-6, -3, 4);
    this.scene.add(d2);
    const spot = new THREE.SpotLight(0xa78bfa, 0.6);
    spot.position.set(0, 12, 0);
    this.scene.add(spot);

    // Subtle ground grid
    const grid = new THREE.GridHelper(14, 20, 0x6d5cff, 0x223355);
    grid.material.transparent = true;
    grid.material.opacity = 0.25;
    this.scene.add(grid);

    this._buildMesh();

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._animate();
  }

  _buildMesh() {
    // Clear old
    const old = this.scene.getObjectByName('model');
    if (old) this.scene.remove(old);

    const group = new THREE.Group();
    group.name = 'model';

    // Main body — smoothed box with beveled feel
    const bodyGeo = new THREE.BoxGeometry(2.2, 1.1, 1.4, 6, 6, 6);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x5b6cff,
      metalness: 0.75,
      roughness: 0.18,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      emissive: 0x1a1440,
      emissiveIntensity: 0.25,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // Top shell
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.5, 1.0, 4, 4, 4),
      new THREE.MeshPhysicalMaterial({
        color: 0x22d3ee,
        metalness: 0.4,
        roughness: 0.3,
        transparent: true,
        opacity: 0.75,
        emissive: 0x06333b,
        emissiveIntensity: 0.3,
      })
    );
    shell.position.y = 0.72;
    group.add(shell);

    // Glow edges (wireframe overlay)
    const wire = new THREE.Mesh(
      new THREE.BoxGeometry(2.24, 1.14, 1.44),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true, transparent: true, opacity: 0.35 })
    );
    group.add(wire);

    // Four pillars (product / game feel)
    for (let i = 0; i < 4; i++) {
      const x = i % 2 === 0 ? 0.85 : -0.85;
      const z = i < 2 ? 0.5 : -0.5;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 1.3, 12),
        new THREE.MeshStandardMaterial({ color: 0xe8ecff, metalness: 0.9, roughness: 0.2 })
      );
      pillar.position.set(x, 0.1, z);
      group.add(pillar);
    }

    // Orbiting glow node
    const node = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xa78bfa })
    );
    node.position.set(1.6, 0.9, 1.0);
    group.add(node);

    this.modelNode = node;
    this.modelGroup = group;
    this.scene.add(group);
  }

  setMode(mode) {
    this.mode = mode;
    // Different mode → different material tint & camera distance
    const tints = {
      cad: 0x5b6cff,
      pcb: 0x22d3ee,
      game: 0xa78bfa,
      web: 0x6d5cff,
    };
    const mesh = this.modelGroup.children[0];
    if (mesh) mesh.material.color.setHex(tints[mode] || 0x5b6cff);
    const name = document.querySelector('#v3d-name');
    if (name) name.textContent = mode.toUpperCase() + ' PREVIEW';
  }

  _resize() {
    if (!this.stage) return;
    const w = this.stage.clientWidth || 400;
    const h = this.stage.clientHeight || 300;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    if (!this.canvas || this.disabled) return;
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    // subtle float
    if (this.modelGroup) {
      this.modelGroup.position.y = Math.sin(performance.now() * 0.0012) * 0.08;
      this.modelGroup.rotation.y += 0.0006;
      if (this.modelNode) {
        const t = performance.now() * 0.001;
        this.modelNode.position.set(
          Math.cos(t * 0.8) * 1.8,
          0.9 + Math.sin(t * 1.3) * 0.2,
          Math.sin(t * 0.8) * 1.2
        );
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
