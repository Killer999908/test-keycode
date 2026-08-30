import * as THREE from 'three';

/* Stable semi-implicit Euler spring (Theo Orange / "Spring Roll Call"). */
function springVec(dt, x, v, target, omega, zeta) {
  const f = 1 + 2 * dt * zeta * omega;
  const o = omega * omega;
  const hoo = dt * o;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  const detX = f * x + dt * v + hhoo * target;
  const detV = v + hhoo * (target - x);
  return { x: detX * detInv, v: detV * detInv };
}

export class CinematicCamera {
  constructor(camera, acts) {
    this.camera = camera;
    this.acts = acts;
    this.scrollProgress = 0;
    this.lastProgress = 0;
    this.scrollVelocity = 0;
    this.pointerOffset = new THREE.Vector2();
    this.currentActIndex = 0;

    // Position / rotation / fov state + velocities
    this.pos = new THREE.Vector3();
    this.posV = new THREE.Vector3();
    this.rot = new THREE.Euler();
    this.rotV = new THREE.Vector3();
    this.fov = 50;
    this.fovV = 0;

    // Tuning
    this.P_OMEGA = 9.5; this.P_ZETA = 0.85;
    this.R_OMEGA = 6.5; this.R_ZETA = 0.8;
    this.F_OMEGA = 6.0; this.F_ZETA = 0.75;

    this.keyframes = [
      // Act 0 · Hero (0.00 - 0.18) — minimal
      { p: 0.00, pos: [0, 0, 14],    rot: [0, 0, 0],    fov: 50 },
      { p: 0.09, pos: [0, 0.4, 11],  rot: [-0.05, 0, 0], fov: 53 },
      { p: 0.18, pos: [0, 1.0, 9],    rot: [-0.08, 0, 0],     fov: 54 },
      // Act 1 · Flagships (0.18 - 0.43)
      { p: 0.25, pos: [1.2, 1.6, 7],  rot: [-0.1, 0.06, 0],  fov: 52 },
      { p: 0.35, pos: [-1.0, 1.9, 6.5], rot: [-0.08, -0.06, 0], fov: 50 },
      { p: 0.43, pos: [0, 2.0, 6],    rot: [-0.06, 0, 0],      fov: 48 },
      // Act 2 · Works (0.43 - 0.69) — image grid
      { p: 0.50, pos: [0, 3.5, 2],      rot: [-0.04, 0, 0], fov: 56 },
      { p: 0.60, pos: [0, 4.5, -1],     rot: [0.04, 0, 0],  fov: 60 },
      { p: 0.69, pos: [0, 4.8, -3],    rot: [0.08, 0, 0],     fov: 54 },
      // Act 3 · Studio CTA (0.69 - 1.00) — minimal close
      { p: 0.80, pos: [0, 4.2, -5],    rot: [0.06, 0, 0],    fov: 52 },
      { p: 0.92, pos: [0, 3.5, -7],      rot: [0, 0, 0], fov: 50 },
      { p: 1.00, pos: [0, 2.5, -8],      rot: [0, 0, 0], fov: 46 }
    ];

    this.spline = new THREE.CatmullRomCurve3(
      this.keyframes.map(k => new THREE.Vector3(...k.pos)),
      false, 'centripetal', 0.5
    );
  }

  update(scrollProgress, pointerX, pointerY, dt) {
    dt = Math.min(dt, 1 / 30);
    this.scrollProgress = scrollProgress;
    this.scrollVelocity = (scrollProgress - this.lastProgress) / Math.max(dt, 1e-4);
    this.lastProgress = scrollProgress;

    const raw = this.spline.getPointAt(this.scrollProgress);
    const tgt = this.interpolateKeyframes();

    // Pointer look-around + subtle roll
    const look = pointerX || 0;
    const pitch = pointerY || 0;
    const tRotX = tgt.rot[0] - pitch * 0.12;
    const tRotY = tgt.rot[1] + look * 0.18;
    const tRotZ = tgt.rot[2] - look * 0.02 * (pointerX ? 1 : 0);
    const tFov = tgt.fov + Math.min(Math.abs(this.scrollVelocity) * 60, 4) + Math.min(Math.abs(look) * 2, 3);

    // Springs
    const px = springVec(dt, this.pos.x, this.posV.x, raw.x, this.P_OMEGA, this.P_ZETA);
    const py = springVec(dt, this.pos.y, this.posV.y, raw.y, this.P_OMEGA, this.P_ZETA);
    const pz = springVec(dt, this.pos.z, this.posV.z, raw.z, this.P_OMEGA, this.P_ZETA);
    this.pos.x = px.x; this.posV.x = px.v;
    this.pos.y = py.x; this.posV.y = py.v;
    this.pos.z = pz.x; this.posV.z = pz.v;

    const rx = springVec(dt, this.rot.x, this.rotV.x, tRotX, this.R_OMEGA, this.R_ZETA);
    const ry = springVec(dt, this.rot.y, this.rotV.y, tRotY, this.R_OMEGA, this.R_ZETA);
    const rz = springVec(dt, this.rot.z, this.rotV.z, tRotZ, this.R_OMEGA, this.R_ZETA);
    this.rot.x = rx.x; this.rotV.x = rx.v;
    this.rot.y = ry.x; this.rotV.y = ry.v;
    this.rot.z = rz.x; this.rotV.z = rz.v;

    const f = springVec(dt, this.fov, this.fovV, tFov, this.F_OMEGA, this.F_ZETA);
    this.fov = f.x; this.fovV = f.v;

    // Apply
    this.camera.position.copy(this.pos);
    this.camera.rotation.set(this.rot.x, this.rot.y, this.rot.z);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    this.updateActIndex();
  }

  interpolateKeyframes() {
    const p = this.scrollProgress;
    const a = this.keyframes[0];
    let b = this.keyframes[this.keyframes.length - 1];
    let eased = 1;
    for (let i = 0; i < this.keyframes.length - 1; i++) {
      const k0 = this.keyframes[i];
      const k1 = this.keyframes[i + 1];
      if (p >= k0.p && p <= k1.p) {
        const t = (p - k0.p) / (k1.p - k0.p);
        eased = this.easeInOutCubic(t);
        return {
          rot: [
            THREE.MathUtils.lerp(k0.rot[0], k1.rot[0], eased),
            THREE.MathUtils.lerp(k0.rot[1], k1.rot[1], eased),
            THREE.MathUtils.lerp(k0.rot[2], k1.rot[2], eased)
          ],
          fov: THREE.MathUtils.lerp(k0.fov, k1.fov, eased)
        };
      }
    }
    return { rot: a.rot.slice(), fov: a.fov };
  }

  updateActIndex() {
    const boundaries = [0.18, 0.43, 0.69, 1.0];
    for (let i = 0; i < boundaries.length; i++) {
      if (this.scrollProgress <= boundaries[i]) {
        this.currentActIndex = i;
        return;
      }
    }
    this.currentActIndex = 3;
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  getActIndex() { return this.currentActIndex; }
  getProgress() { return this.scrollProgress; }
}
