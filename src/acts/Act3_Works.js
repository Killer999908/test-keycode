import * as THREE from 'three';

export class WorksShowcase {
  constructor(scene, envMap) {
    this.scene = scene;
    this.envMap = envMap;
    this.screens = [];
    this.orbiters = [];
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.create();
  }

  create() {
    const N = 8;

    // Holographic screens arranged in a ring
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
      this.screens.push(screen);

      // Hairline frame
      const edge = new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.1, 1.35));
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
      const frame = new THREE.LineSegments(edge, edgeMat);
      frame.position.copy(screen.position);
      frame.quaternion.copy(screen.quaternion);
      screen.userData.frame = frame;
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
      screen.userData.glow = glowMesh;
      this.group.add(glowMesh);
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

  update(time, dt, scrollProgress) {
    // Act 3 range: 0.52 - 0.71
    const actProgress = THREE.MathUtils.clamp((scrollProgress - 0.52) / 0.19, 0, 1);

    if (actProgress < 1) {
      const eased = 1 - Math.pow(1 - actProgress, 3);
      this.group.scale.setScalar(0.01 + eased * 0.99);
    }

    if (actProgress > 0.2) {
      this.group.rotation.y += dt * 0.08;

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
          d.glow.material.opacity = 0.035 + 0.02 * Math.sin(time * 1.4 + i);
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
