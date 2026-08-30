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
  float t = uTime * 0.055;

  vec2 q = uv*2.4;
  float f = fbm(q + vec2(t*0.12, -t*0.09));
  vec2 p = q + vec2(f*0.38, f*0.28);
  float neb = fbm(p*1.65 - vec2(0.0, t*0.18));
  float neb2 = fbm(p*2.8 + vec2(t*0.08, t*0.11)) * 0.5;

  vec3 col = mix(uColorA, uColorB, clamp(neb*1.35 + neb2*0.35, 0.0, 1.0));
  col += vec3(0.04, 0.02, 0.08) * neb2;

  float star = pow(hash(uv*420.0 + t*0.3), 18.0) * 0.9;
  float grid = sin(uv.x*42.0 + t*1.8) * sin(uv.y*42.0 + t*1.3) * 0.025;
  float vig = 1.0 - length(uv - 0.5)*1.45;
  vig = pow(clamp(vig, 0.0, 1.0), 1.15);

  vec3 outC = col * (0.32 + neb*0.85 + grid) * vig + star;
  outC = pow(outC, vec3(0.96));
  outC *= uIntensity;

  gl_FragColor = vec4(outC, 0.88);
}