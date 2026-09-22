import * as THREE from 'three';
import { damp } from '../three/helpers.js';

/**
 * InteractiveServiceGraph
 * A living constellation: 7 category hubs, orbiting service nodes, live
 * filaments, raycast hover with DOM tooltips and click-to-focus filtering
 * driven from the UI layer.
 */
const CATEGORY_DEFS = [
  { id: 'AI',    name: 'AI Engineering', color: 0x8b5cf6, href: '/ai-builder.html',              services: ['AI Full-Stack', 'Real-Time Streaming', 'Agent Deploys', 'Model Tuning', 'Support Bots', 'RAG Systems'] },
  { id: 'GAME',  name: 'Game Worlds',    color: 0x22d3ee, href: '/ai-builder.html?mode=game',    services: ['3D Game Generation', 'Playable Web Games', 'Procedural Worlds', 'Physics Sandboxes'] },
  { id: 'SCAN',  name: '3D + CAD',       color: 0x6ee7b7, href: '/ai-builder.html?mode=cad',     services: ['Scan → CAD', 'Mesh Repair', 'Retopology', 'Photogrammetry'] },
  { id: 'MAKE',  name: 'Fabrication',    color: 0x4ade80, href: '/ai-builder.html?mode=pcb',     services: ['3D Printing', 'STL → Parts', 'PCB Design', 'DFM Checks', 'Robotics'] },
  { id: 'DESIGN',name: 'Design',         color: 0xf472b6, href: '/gallery.html',                 services: ['Brand Systems', 'Web Experiences', 'Product Visuals', 'Interaction Design'] },
  { id: 'AUTO',  name: 'Automation',     color: 0xf59e0b, href: '/tools.html',                   services: ['Workflows', 'Browser Bots', 'Data Pipelines', 'Orchestration'] },
  { id: 'SHOP',  name: 'Commerce',       color: 0x34d399, href: '/shop.html',                    services: ['Digital Products', 'Billing', 'Subscriptions'] }
];

const HUB_CENTERS = {
  AI: [-6.5, 3, 0], GAME: [6.5, 3, -2], SCAN: [-6.5, -1, 0], MAKE: [6.5, -1, 2],
  DESIGN: [0, 4.5, -3.5], AUTO: [0, -3, 0], SHOP: [-2, -5.5, 1]
};

export class InteractiveServiceGraph {
  constructor(scene, envMap, { reducedMotion = false, camera = null } = {}) {
    this.scene = scene;
    this.envMap = envMap;
    this.reducedMotion = reducedMotion;
    this.camera = camera;
    this.categories = CATEGORY_DEFS.map(d => ({ ...d, visible: true }));
    this.catById = Object.fromEntries(this.categories.map(c => [c.id, c]));
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 0.38;
    this.pointer = new THREE.Vector2(-10, -10);
    this.hovered = null;
    this.focused = null;          // category id or null
    this.hoverCallbacks = [];
    this.clickCallbacks = [];
    this.focusCallbacks = [];
    this.hoverLabel3D = null;
    this.tmpColor = new THREE.Color();
    this.build();
  }

  build() {
    this.group = new THREE.Group();
    this.group.scale.setScalar(0.01);
    this.scene.add(this.group);

    const total = this.categories.reduce((s, c) => s + c.services.length, 0);
    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    const sizes = new Float32Array(total);
    const catIdx = new Float32Array(total);
    const phases = new Float32Array(total);

    let idx = 0;
    this.nodes = [];
    this.categories.forEach((cat, ci) => {
      const center = HUB_CENTERS[cat.id];
      cat.services.forEach((svc, si) => {
        const angle = (si / cat.services.length) * Math.PI * 2 + ci * 0.55;
        const radius = 2.1 + Math.random() * 1.4;
        const p = new THREE.Vector3(
          center[0] + Math.cos(angle) * radius,
          center[1] + (Math.random() - 0.5) * 1.8,
          center[2] + Math.sin(angle) * radius
        );
        positions[idx * 3] = p.x; positions[idx * 3 + 1] = p.y; positions[idx * 3 + 2] = p.z;
        this.tmpColor.setHex(cat.color);
        colors[idx * 3] = this.tmpColor.r; colors[idx * 3 + 1] = this.tmpColor.g; colors[idx * 3 + 2] = this.tmpColor.b;
        sizes[idx] = 0.16 + Math.random() * 0.1;
        catIdx[idx] = ci;
        phases[idx] = Math.random() * Math.PI * 2;
        this.nodes.push({ service: svc, catId: cat.id, base: p.clone(), phase: phases[idx], i: idx });
        idx++;
      });
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('catIdx', new THREE.BufferAttribute(catIdx, 1));
    geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    this.nodeGeo = geo;
    this.baseSizes = sizes.slice();
    this.baseColors = colors.slice();

    this.nodeMat = new THREE.PointsMaterial({
      sizeAttenuation: true, vertexColors: true, transparent: true,
      opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, size: 1
    });
    this.nodePoints = new THREE.Points(geo, this.nodeMat);
    this.nodePoints.renderOrder = 6;
    this.group.add(this.nodePoints);

    // Hubs — glowing cores at category centers
    this.hubs = [];
    const hubGeo = new THREE.SphereGeometry(0.34, 24, 24);
    this.categories.forEach(cat => {
      const mat = new THREE.MeshBasicMaterial({ color: cat.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const hub = new THREE.Mesh(hubGeo, mat);
      const c = HUB_CENTERS[cat.id];
      hub.position.set(c[0], c[1], c[2]);
      this.group.add(hub);
      const haloGeo = new THREE.SphereGeometry(0.85, 20, 20);
      const haloMat = new THREE.MeshBasicMaterial({ color: cat.color, transparent: true, opacity: 0.1, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.copy(hub.position);
      this.group.add(halo);
      const sprite = this.makeLabel(cat.name);
      sprite.position.set(c[0], c[1] + 1.15, c[2]);
      this.group.add(sprite);
      this.hubs.push({ id: cat.id, mesh: hub, halo, sprite, mat, haloMat });
    });

    // Filaments: hub → its service nodes
    const linePos = [];
    const lineCol = [];
    this.categories.forEach(cat => {
      const c = HUB_CENTERS[cat.id];
      const col = new THREE.Color(cat.color);
      this.nodes.filter(n => n.catId === cat.id).forEach(n => {
        const mid = n.base.clone().lerp(new THREE.Vector3(c[0], c[1], c[2]), 0.5)
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
        linePos.push(c[0], c[1], c[2], mid.x, mid.y, mid.z, mid.x, mid.y, mid.z, n.base.x, n.base.y, n.base.z);
        for (let k = 0; k < 4; k++) lineCol.push(col.r, col.g, col.b);
      });
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineCol, 3));
    this.lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.LineSegments(lineGeo, this.lineMat);
    this.group.add(this.lines);

    // 3D hover label removed — the DOM tooltip (with click affordance) handles hover UI
  }

  makeLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 96);
    if (text) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      this.roundRect(ctx, 256 - 30 - ctx.measureText(text).width / 2 - 24, 20, 60, 56, 28);
      ctx.font = '600 34px "Space Grotesk", Inter, sans-serif';
      const w = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      this.roundRect(ctx, 256 - w / 2 - 24, 20, w + 48, 56, 28);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.4;
      this.roundRect(ctx, 256 - w / 2 - 24, 20, w + 48, 56, 28);
      ctx.stroke();
      ctx.fillStyle = '#f5f5f4';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 49);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.4, 0.64, 1);
    return sprite;
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------- Public API (UI layer) ---------- */
  onHover(cb) { this.hoverCallbacks.push(cb); }
  onClick(cb) { this.clickCallbacks.push(cb); }
  onFocus(cb) { this.focusCallbacks.push(cb); }

  setPointer(ndcX, ndcY) { this.pointer.set(ndcX, ndcY); }

  pick(camera) {
    if (this.group.scale.x < 0.6) return null;
    this.raycaster.setFromCamera(this.pointer, camera);
    const hits = this.raycaster.intersectObject(this.nodePoints);
    if (hits.length) {
      const hit = hits[0];
      const node = this.nodes[hit.index];
      if (node && (!this.focused || this.focused === node.catId)) return node;
    }
    return null;
  }

  setHovered(node) {
    if (this.hovered === node) return;
    this.hovered = node;
    if (node) {
      document.body.style.cursor = 'pointer';
    } else {
      document.body.style.cursor = '';
    }
    this.hoverCallbacks.forEach(cb => cb(node ? this.withScreenPos(node) : null));
  }

  /** Project the hovered node to screen pixels for DOM tooltips */
  withScreenPos(node) {
    const out = { ...node, href: this.catById[node.catId].href, catName: this.catById[node.catId].name };
    if (this.camera) {
      const v = node.base.clone().add(this.group.position).applyMatrix4(this.group.matrixWorld).project(this.camera);
      out.px = (v.x * 0.5 + 0.5) * window.innerWidth;
      out.py = (-v.y * 0.5 + 0.5) * window.innerHeight;
    }
    return out;
  }

  focusCategory(id) {
    this.focused = (this.focused === id) ? null : id;
    this.applyFilter();
    this.focusCallbacks.forEach(cb => cb(this.focused));
    return this.focused;
  }

  applyFilter() {
    const colors = this.nodeGeo.attributes.color.array;
    const sizes = this.nodeGeo.attributes.size.array;
    this.nodes.forEach((n, i) => {
      const on = !this.focused || n.catId === this.focused;
      const b = i * 3;
      const dim = on ? 1 : 0.06;
      colors[b] = this.baseColors[b] * dim;
      colors[b + 1] = this.baseColors[b + 1] * dim;
      colors[b + 2] = this.baseColors[b + 2] * dim;
      sizes[i] = on ? this.baseSizes[i] : 0.02;
    });
    this.nodeGeo.attributes.color.needsUpdate = true;
    this.nodeGeo.attributes.size.needsUpdate = true;
    this.hubs.forEach(h => {
      const on = !this.focused || h.id === this.focused;
      h.mat.opacity = on ? 0.9 : 0.08;
      h.haloMat.opacity = on ? 0.1 : 0.015;
      h.sprite.material.opacity = on ? 1 : 0.12;
    });
    this.lineMat.opacity = this.focused ? 0.3 : 0.14;
  }

  /* ---------- Per-frame ---------- */
  update(time, dt, scrollProgress) {
    // Visible through the flagships + horizontal bands (0.12 – 0.54)
    const act = THREE.MathUtils.clamp((scrollProgress - 0.12) / 0.42, 0, 1);
    const targetScale = 0.01 + Math.pow(act, 2.2) * 0.99;
    this.group.scale.setScalar(damp(this.group.scale.x, targetScale, 6, dt));
    const active = act > 0.12;

    this.group.rotation.y += dt * (active ? 0.035 : 0.012);

    // Node breathing + gentle orbital drift
    const pos = this.nodeGeo.attributes.position.array;
    const sizes = this.nodeGeo.attributes.size.array;
    if (!this.reducedMotion) {
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        const b = i * 3;
        const wob = 0.18;
        pos[b] = n.base.x + Math.sin(time * 0.5 + n.phase) * wob;
        pos[b + 1] = n.base.y + Math.cos(time * 0.62 + n.phase * 1.3) * wob;
        pos[b + 2] = n.base.z + Math.sin(time * 0.44 + n.phase * 0.7) * wob;
        const pulse = 0.85 + 0.3 * Math.sin(time * 1.6 + n.phase);
        sizes[i] = (this.focused && n.catId !== this.focused ? 0.02 : this.baseSizes[i]) * pulse;
        if (this.hovered === n) sizes[i] *= 2.1;
      }
      this.nodeGeo.attributes.position.needsUpdate = true;
      this.nodeGeo.attributes.size.needsUpdate = true;
    }

    // Hub glow breathing
    this.hubs.forEach((h, i) => {
      if (this.reducedMotion) return;
      const s = 1 + 0.12 * Math.sin(time * 1.8 + i * 1.1);
      h.mesh.scale.setScalar(s);
      h.halo.scale.setScalar(1 + 0.16 * Math.sin(time * 1.3 + i));
    });
  }

  onResize() {}
}
