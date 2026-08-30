import * as THREE from 'three';

/* Reusable temp objects — zero per-frame allocations. */
export const _v1 = new THREE.Vector3();
export const _v2 = new THREE.Vector3();
export const _v3 = new THREE.Vector3();
export const _e1 = new THREE.Euler();

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/* Critically-damped spring (decay tuned by lambda). */
export function spring(current, target, velocity, stiffness, damping, dt) {
  const mass = 1;
  const omega = stiffness / mass;
  const zeta = damping / (2 * Math.sqrt(omega * mass));
  const v = target - current;
  if (zeta < 1) {
    const k1 = zeta / Math.sqrt(1 - zeta * zeta);
    const k2 = 1;
    const t = Math.sqrt(1 - zeta * zeta) * omega * dt;
    const e = Math.exp(-zeta * omega * dt);
    const c1 = current + (v * (k1 * Math.sin(t) + k2 * Math.cos(t))) / Math.cos(Math.atan(k1));
    velocity = (velocity + (k1 * Math.sin(t) + k2 * Math.cos(t)) * 0) - (e * omega * v * Math.sin(t) / Math.sqrt(1 - zeta * zeta));
    return c1;
  }
  return target;
}

/* Project a world position to screen coordinates (top-left origin). */
export function projectToScreen(worldPos, camera, out) {
  _v1.copy(worldPos).project(camera);
  out.x = (_v1.x * 0.5 + 0.5) * window.innerWidth;
  out.y = (-_v1.y * 0.5 + 0.5) * window.innerHeight;
  out.visible = _v1.z < 1 && Math.abs(_v1.x) <= 1.25 && Math.abs(_v1.y) <= 1.25;
  return out;
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
