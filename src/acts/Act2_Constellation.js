import * as THREE from 'three';

export class Constellation {
  constructor(scene, envMap) {
    this.scene = scene;
    this.envMap = envMap;
    this.nodes = null;
    this.lines = null;
    this.categories = [
      { id: 'AI', color: 0x8b5cf6, count: 6, services: ['AI Full-Stack Coding', 'Real-Time Code Streaming', 'Autonomous Agent Deploy', 'Prompt Engineering as a Service', 'Model Tuning (Vision/Code)', 'AI Support Bots'] },
      { id: 'GAME', color: 0x22d3ee, count: 4, services: ['3D Game Generation', 'Playable Web Games', 'Procedural Environments', 'Physics Sandboxes'] },
      { id: 'SCAN', color: 0x6ee7b7, count: 4, services: ['3D Scan → CAD', 'CAD Reconstruction', 'Mesh Repair & Retopo', 'Photogrammetry Service'] },
      { id: 'MAKE', color: 0x4ade80, count: 5, services: ['3D Print Model Generation', 'STL → Printable Parts', 'PCB Design & Fabrication', 'PCB DFM Check', 'Drone / Robotics Builds'] },
      { id: 'DESIGN', color: 0xf472b6, count: 4, services: ['Brand Identity Systems', 'Premium Web Experiences', '3D Product Visuals', 'Interaction Design'] },
      { id: 'AUTO', color: 0xf59e0b, count: 4, services: ['Workflow Automation', 'Browser Automations', 'Data Pipelines', 'Agent Orchestration'] },
      { id: 'SHOP', color: 0x34d399, count: 3, services: ['Digital Products', 'Custom Billing', 'Subscriptions'] }
    ];
    this.visibleCategories = new Set(this.categories.map(c => c.id));
    this.createConstellation();
  }

  createConstellation() {
    const totalNodes = this.categories.reduce((sum, c) => sum + c.count, 0);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(totalNodes * 3);
    const colors = new Float32Array(totalNodes * 3);
    const sizes = new Float32Array(totalNodes);
    const categoryIds = new Float32Array(totalNodes);
    const serviceIndices = new Float32Array(totalNodes);
    const phases = new Float32Array(totalNodes);

    let idx = 0;
    const centerRadius = 8;
    this.categories.forEach((cat, catIdx) => {
      const center = this.getCategoryCenter(cat.id);
      for (let i = 0; i < cat.count; i++) {
        const angle = (i / cat.count) * Math.PI * 2 + catIdx * 0.5;
        const radius = centerRadius + Math.random() * 3;
        const height = (Math.random() - 0.5) * 4;
        positions[idx * 3] = center[0] + Math.cos(angle) * radius;
        positions[idx * 3 + 1] = center[1] + height;
        positions[idx * 3 + 2] = center[2] + Math.sin(angle) * radius;

        const color = new THREE.Color(cat.color);
        colors[idx * 3] = color.r;
        colors[idx * 3 + 1] = color.g;
        colors[idx * 3 + 2] = color.b;

        sizes[idx] = 0.15 + Math.random() * 0.1;
        categoryIds[idx] = catIdx;
        serviceIndices[idx] = i;
        phases[idx] = Math.random() * Math.PI * 2;
        idx++;
      }
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('categoryId', new THREE.BufferAttribute(categoryIds, 1));
    geometry.setAttribute('serviceIndex', new THREE.BufferAttribute(serviceIndices, 1));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

    const material = new THREE.PointsMaterial({
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      size: 1
    });

    this.nodes = new THREE.Points(geometry, material);
    this.nodes.renderOrder = 5;
    this.scene.add(this.nodes);

    // Filament lines between related nodes
    this.createFilaments();

    // Category label sprites
    this.createLabels();
  }

  getCategoryCenter(catId) {
    const centers = {
      AI: [-6, 3, 0],
      GAME: [6, 3, -2],
      SCAN: [-6, -1, 0],
      MAKE: [6, -1, 2],
      DESIGN: [0, 4, -3],
      AUTO: [0, -3, 0],
      SHOP: [-2, -5, 1]
    };
    return centers[catId] || [0, 0, 0];
  }

  createFilaments() {
    const filamentGeom = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];

    this.categories.forEach((cat, catIdx) => {
      const center = this.getCategoryCenter(cat.id);
      const color = new THREE.Color(cat.color);
      // Connect to nearby categories
      this.categories.forEach((other, otherIdx) => {
        if (otherIdx <= catIdx) return;
        const otherCenter = this.getCategoryCenter(other.id);
        const dist = Math.sqrt(
          Math.pow(center[0] - otherCenter[0], 2) +
          Math.pow(center[1] - otherCenter[1], 2) +
          Math.pow(center[2] - otherCenter[2], 2)
        );
        if (dist < 12) {
          // Add filament line
          const steps = 20;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = THREE.MathUtils.lerp(center[0], otherCenter[0], t) + (Math.random() - 0.5) * 0.5;
            const y = THREE.MathUtils.lerp(center[1], otherCenter[1], t) + (Math.random() - 0.5) * 0.5;
            const z = THREE.MathUtils.lerp(center[2], otherCenter[2], t) + (Math.random() - 0.5) * 0.5;
            positions.push(x, y, z);
            colors.push(color.r, color.g, color.b);
          }
        }
      });
    });

    filamentGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    filamentGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const filamentMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.lines = new THREE.Line(filamentGeom, filamentMat);
    this.scene.add(this.lines);
  }

  createLabels() {
    this.labels = [];
    this.categories.forEach((cat, catIdx) => {
      const center = this.getCategoryCenter(cat.id);
      const sprite = this.createLabelSprite(cat.id, cat.color);
      sprite.position.set(center[0], center[1] + 2.5, center[2]);
      sprite.scale.set(3, 1, 1);
      this.scene.add(sprite);
      this.labels.push({ sprite, categoryId: cat.id, catIdx });
    });
  }

  createLabelSprite(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    const r = 26;
    ctx.beginPath();
    ctx.roundRect(128 - 70, 8, 140, 48, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#f5f5f4';
    ctx.font = '600 24px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    });
    return new THREE.Sprite(mat);
  }

  setCategoryVisibility(catId, visible) {
    if (visible) this.visibleCategories.add(catId);
    else this.visibleCategories.delete(catId);
    this.updateVisibility();
  }

  setAllCategoriesVisible(visible) {
    this.categories.forEach(c => {
      if (visible) this.visibleCategories.add(c.id);
      else this.visibleCategories.delete(c.id);
    });
    this.updateVisibility();
  }

  updateVisibility() {
    if (!this.nodes) return;
    const categoryIds = this.nodes.geometry.attributes.categoryId.array;
    const colors = this.nodes.geometry.attributes.color.array;
    const sizes = this.nodes.geometry.attributes.size.array;

    for (let i = 0; i < categoryIds.length; i++) {
      const catIdx = categoryIds[i];
      const cat = this.categories[catIdx];
      const visible = this.visibleCategories.has(cat.id);
      const baseIdx = i * 3;
      if (visible) {
        colors[baseIdx] *= 1;
        colors[baseIdx + 1] *= 1;
        colors[baseIdx + 2] *= 1;
        sizes[i] = sizes[i] || 0.2;
      } else {
        colors[baseIdx] *= 0.1;
        colors[baseIdx + 1] *= 0.1;
        colors[baseIdx + 2] *= 0.1;
        sizes[i] = 0.02;
      }
    }
    this.nodes.geometry.attributes.color.needsUpdate = true;
    this.nodes.geometry.attributes.size.needsUpdate = true;

    // Update labels
    this.labels.forEach(label => {
      label.sprite.visible = this.visibleCategories.has(label.categoryId);
    });
  }

  update(time, dt, scrollProgress) {
    // Act 2 range: 0.31 - 0.52
    const actProgress = THREE.MathUtils.clamp((scrollProgress - 0.31) / 0.21, 0, 1);

    if (actProgress < 1) {
      const eased = 1 - Math.pow(1 - actProgress, 2);
      this.nodes.material.opacity = 0.9 * eased;
      if (this.lines) this.lines.material.opacity = 0.15 * eased;
      this.labels.forEach(l => l.sprite.material.opacity = eased);
    }

    if (actProgress > 0.2) {
      // Node pulse animation
      const sizes = this.nodes.geometry.attributes.size.array;
      const phases = this.nodes.geometry.attributes.phase.array;
      const positions = this.nodes.geometry.attributes.position.array;
      const categoryIds = this.nodes.geometry.attributes.categoryId.array;

      for (let i = 0; i < sizes.length; i++) {
        const phase = phases[i];
        const pulse = 0.5 + 0.5 * Math.sin(time * 1.5 + phase);
        sizes[i] = (0.15 + 0.1 * pulse) * (this.visibleCategories.has(this.categories[Math.floor(categoryIds[i])].id) ? 1 : 0.1);
      }
      this.nodes.geometry.attributes.size.needsUpdate = true;

      // Slow rotation
      this.nodes.rotation.y += dt * 0.02;
      if (this.lines) this.lines.rotation.y += dt * 0.02;

      // Filament pulse
      if (this.lines) {
        const positions = this.lines.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
          positions[i + 1] += Math.sin(time * 2 + i) * 0.001;
        }
        this.lines.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  checkIntersection(camera, pointer) {
    // GPU picking would be better, but for now use raycaster on points
    // This is simplified - in production use color-ID picking
    return null;
  }

  onResize(w, h) {
    // Labels face camera handled in render loop
  }
}