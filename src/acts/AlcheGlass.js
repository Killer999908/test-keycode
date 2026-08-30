import * as THREE from 'three';

export class AlcheGlass {
  constructor(scene, envMap) {
    this.scene = scene;
    this.envMap = envMap;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.createShards();
    this.createOrbs();
  }

  createShards() {
    const shardCount = 14;
    this.shards = [];
    for (let i = 0; i < shardCount; i++) {
      const geo = new THREE.IcosahedronGeometry(0.6 + Math.random() * 1.2, 0);
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color().setHSL(0.68 + Math.random()*0.12, 0.7, 0.6),
        metalness: 0.15,
        roughness: 0.08,
        transmission: 0.92,
        thickness: 0.4,
        ior: 1.45,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        transparent: true,
        opacity: 0.55,
        envMap: this.envMap,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      const r = 8 + Math.random() * 18;
      const theta = (i / shardCount) * Math.PI * 2 + Math.random()*0.5;
      const y = (Math.random() - 0.5) * 12;
      mesh.position.set(Math.cos(theta)*r, y, Math.sin(theta)*r);
      mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0);
      mesh.userData = {
        rotSpeed: new THREE.Vector3((Math.random()-0.5)*0.008, (Math.random()-0.5)*0.012, (Math.random()-0.5)*0.006),
        floatSpeed: 0.0006 + Math.random()*0.0008,
        floatAmp: 0.4 + Math.random()*0.8,
        baseY: mesh.position.y,
        phase: Math.random()*Math.PI*2
      };
      this.group.add(mesh);
      this.shards.push(mesh);
    }

    const torusGeo = new THREE.TorusGeometry(22, 0.08, 16, 120);
    const torusMat = new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ring = new THREE.Mesh(torusGeo, torusMat);
    this.ring.rotation.x = Math.PI/2.3;
    this.ring.position.y = -2;
    this.group.add(this.ring);

    const torusGeo2 = new THREE.TorusGeometry(16, 0.06, 16, 100);
    const torusMat2 = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ring2 = new THREE.Mesh(torusGeo2, torusMat2);
    this.ring2.rotation.x = -Math.PI/2.5;
    this.ring2.position.y = 3;
    this.group.add(this.ring2);
  }

  createOrbs() {
    const orbGeo = new THREE.SphereGeometry(1, 32, 32);
    this.orbs = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshPhysicalMaterial({
        color: i===0?0x6366f1 : i===1?0xec4899 : 0x22d3ee,
        emissive: i===0?0x6366f1 : i===1?0xec4899 : 0x22d3ee,
        emissiveIntensity: 0.6,
        metalness: 0.1,
        roughness: 0.2,
        transparent: true,
        opacity: 0.35,
        envMap: this.envMap
      });
      const orb = new THREE.Mesh(orbGeo, mat);
      orb.position.set((Math.random()-0.5)*6, (Math.random()-0.5)*4, -8 - Math.random()*4);
      orb.scale.setScalar(0.7 + Math.random()*0.6);
      orb.userData.phase = Math.random()*Math.PI*2;
      this.group.add(orb);
      this.orbs.push(orb);
      const light = new THREE.PointLight(mat.color, 3, 12);
      light.position.copy(orb.position);
      this.group.add(light);
      orb.userData.light = light;
    }
  }

  update(time, dt, progress) {
    this.group.rotation.y += dt * 0.015;
    this.shards.forEach(s => {
      s.rotation.x += s.userData.rotSpeed.x;
      s.rotation.y += s.userData.rotSpeed.y;
      s.rotation.z += s.userData.rotSpeed.z;
      s.position.y = s.userData.baseY + Math.sin(time * s.userData.floatSpeed * 1000 + s.userData.phase) * s.userData.floatAmp;
      s.material.opacity = 0.45 + 0.15 * Math.sin(time*0.5 + s.userData.phase);
    });
    if (this.ring) { this.ring.rotation.z += dt * 0.04; this.ring.material.opacity = 0.12 + 0.06*Math.sin(time*0.6); }
    if (this.ring2) { this.ring2.rotation.z -= dt * 0.06; this.ring2.material.opacity = 0.10 + 0.05*Math.sin(time*0.7+1); }
    this.orbs.forEach(o => {
      const s = 1 + 0.08*Math.sin(time*0.8 + o.userData.phase);
      o.scale.setScalar(o.userData.baseScale || o.scale.x * s);
      if (!o.userData.baseScale) o.userData.baseScale = o.scale.x;
      o.position.y += Math.sin(time + o.userData.phase)*0.002;
      o.userData.light.position.copy(o.position);
      o.userData.light.intensity = 2.5 + 1.5*Math.sin(time*1.2 + o.userData.phase);
    });
    this.group.position.y = Math.sin(progress * Math.PI * 2) * 0.6;
  }

  onResize(){}
}
