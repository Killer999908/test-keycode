/* ============================================================
   KEYCODE — Cinematic WebGL shader library & helpers
   ============================================================ */
window.__modShaders = (window.__modShaders||0)+1;

// ---- Background field shader (procedural neural nebula) ----
export const BACKGROUND_VERTEX = `
  varying vec2 vUv;
  varying vec3 vPos;
  void main(){
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const BACKGROUND_FRAGMENT = `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec2 uRes;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  varying vec2 vUv;
  varying vec3 vPos;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453123); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x),
               mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);
  }
  float fbm(vec2 p){ float v=0.0; float a=0.5;
    for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=0.5; } return v; }

  void main(){
    vec2 uv = vUv;
    float t = uTime * 0.06;

    vec2 q = uv*2.2;
    float f = fbm(q + vec2(t*0.15, -t*0.1));
    vec2 p = q + vec2(f*0.35, f*0.25);
    float neb = fbm(p*1.6 - vec2(0.0, t*0.2));

    vec3 col = mix(uColorA, uColorB, neb*1.4);
    float grid = sin(uv.x*40.0 + t*2.0) * sin(uv.y*40.0 + t*1.5) * 0.03;
    float vig = 1.0 - length(uv - 0.5)*1.55;
    vec3 outC = col * (0.25 + neb*0.9 + grid) * vig;
    outC *= uIntensity;

    gl_FragColor = vec4(outC, 0.85);
  }
`;

// ---- Soft radial glow sprite (for energies & nodes) ----
export function makeGlowTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// ---- Point shimmer texture ----
export function makeStarTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// ---- sprite helper ----
export function makeGlowSprite(color, scale = 1, opacity = 1) {
  const tex = makeStarTexture();
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(scale);
  return sprite;
}