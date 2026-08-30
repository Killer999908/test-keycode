import * as THREE from 'three';

export class AgentSwarm {
  constructor(scene, envMap) {
    this.scene = scene;
    this.envMap = envMap;
    this.agents = [];
    this.trails = [];
    this.createAgents();
  }

  createAgents() {
    const agentData = [
      { name: 'Core', role: 'Orchestrator', color: 0x8b5cf6, radius: 5 },
      { name: 'Builder', role: 'Code Generation', color: 0x22d3ee, radius: 5.5 },
      { name: 'Designer', role: 'UI/UX Architecture', color: 0xf472b6, radius: 6 },
      { name: 'QA', role: 'Testing & Validation', color: 0x6ee7b7, radius: 6.5 },
      { name: 'Scout', role: 'Research & Discovery', color: 0xf59e0b, radius: 7 },
      { name: 'Sweeper', role: 'Cleanup & Optimization', color: 0xa78bfa, radius: 7.5 }
    ];

    agentData.forEach((data, i) => {
      const group = new THREE.Group();

      // Agent body
      const bodyGeom = new THREE.OctahedronGeometry(0.5, 1);
      const bodyMat = new THREE.MeshPhysicalMaterial({
        color: data.color,
        metalness: 0.8,
        roughness: 0.1,
        emissive: data.color,
        emissiveIntensity: 0.5,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        envMap: this.envMap
      });
      const body = new THREE.Mesh(bodyGeom, bodyMat);
      group.add(body);

      // Glow aura
      const auraGeom = new THREE.SphereGeometry(1.2, 16, 16);
      const auraMat = new THREE.MeshBasicMaterial({
        color: data.color,
        transparent: true,
        opacity: 0.15,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const aura = new THREE.Mesh(auraGeom, auraMat);
      group.add(aura);

      // Trail particles
      const trail = this.createTrail(data.color);
      group.add(trail);

      // Orbit parameters
      group.userData = {
        ...data,
        angle: (i / agentData.length) * Math.PI * 2,
        speed: 0.15 + i * 0.03,
        verticalPhase: i * 1.2,
        verticalAmp: 0.5 + i * 0.2
      };

      this.scene.add(group);
      this.agents.push(group);
      this.trails.push(trail);
    });
  }

  createTrail(color) {
    const count = 100;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const alphas = new Float32Array(count);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      alphas[i] = 1 - i / count;
      sizes[i] = 0.05 * (1 - i / count);
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      color: color,
      sizeAttenuation: true,
      vertexColors: false,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    return new THREE.Points(geom, mat);
  }

  update(time, dt, scrollProgress) {
    // Act 4 range: 0.71 - 0.86
    const actProgress = THREE.MathUtils.clamp((scrollProgress - 0.71) / 0.15, 0, 1);

    this.agents.forEach((group, i) => {
      const data = group.userData;
      const body = group.children[0];
      const aura = group.children[1];
      const trail = group.children[2];

      // Entrance
      if (actProgress < 1) {
        const eased = 1 - Math.pow(1 - actProgress, 3);
        group.scale.setScalar(eased);
        body.material.opacity = eased;
        aura.material.opacity = 0.15 * eased;
        trail.material.opacity = 0.6 * eased;
      }

      if (actProgress > 0.2) {
        // Orbital motion
        data.angle += dt * data.speed;
        group.position.x = Math.cos(data.angle) * data.radius;
        group.position.z = Math.sin(data.angle) * data.radius;
        group.position.y = Math.sin(time * 0.5 + data.verticalPhase) * data.verticalAmp;

        // Body rotation
        body.rotation.x += dt * 0.5;
        body.rotation.y += dt * 0.7;

        // Aura pulse
        aura.scale.setScalar(1 + 0.2 * Math.sin(time * 2 + i));
        aura.material.opacity = 0.15 + 0.1 * Math.sin(time * 1.5 + i);

        // Trail follows position
        this.updateTrail(trail, group.position, time, i);
      }
    });
  }

  updateTrail(trail, position, time, agentIndex) {
    const positions = trail.geometry.attributes.position.array;
    const count = positions.length / 3;

    // Shift trail positions
    for (let i = count - 1; i > 0; i--) {
      positions[i * 3] = positions[(i - 1) * 3];
      positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
      positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
    }
    // Add current position with slight offset
    positions[0] = position.x + (Math.random() - 0.5) * 0.1;
    positions[1] = position.y + (Math.random() - 0.5) * 0.1;
    positions[2] = position.z + (Math.random() - 0.5) * 0.1;

    trail.geometry.attributes.position.needsUpdate = true;
  }

  onResize() {}
}