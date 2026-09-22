'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { cameraOrbitRef } from '@/lib/cameraOrbit';

// ============ Neural Network ============
function NeuralNet() {
  const group = useRef<THREE.Group>(null);
  const lineGroup = useRef<THREE.Group>(null);
  const mouse = useRef({ x: 0, y: 0 });

  const { nodes, lines } = useMemo(() => {
    const nodeCount = 90;
    const pos: THREE.Vector3[] = [];
    for (let i = 0; i < nodeCount; i++) {
      const r = 6 + Math.random() * 10;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos.push(
        new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          (Math.random() - 0.5) * 12,
          r * Math.sin(phi) * Math.sin(theta)
        )
      );
    }
    const linePairs: [THREE.Vector3, THREE.Vector3, number][] = [];
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const d = pos[i].distanceTo(pos[j]);
        if (d < 5.5) {
          const alpha = 1 - d / 5.5;
          linePairs.push([pos[i], pos[j], alpha * alpha * 0.5]);
        }
      }
    }
    return { nodes: pos, lines: linePairs };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y = t * 0.02;
    group.current.position.x += (mouse.current.x * -1.5 - group.current.position.x) * 0.03;
    group.current.position.y += (mouse.current.y * -1.2 - group.current.position.y) * 0.03;
  });

  return (
    <group ref={group}>
      {nodes.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.05 + Math.random() * 0.04, 8, 8]} />
          <meshBasicMaterial
            color={i % 3 === 0 ? '#6d7cff' : i % 3 === 1 ? '#38d6ff' : '#9b6dff'}
            transparent
            opacity={0.6}
          />
        </mesh>
      ))}
      <group ref={lineGroup}>
        {lines.map(([a, b, alpha], i) => (
          <line key={i}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]), 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#6d7cff" transparent opacity={alpha} />
          </line>
        ))}
      </group>
    </group>
  );
}

// ============ Holographic Orbitals ============
function HoloOrbitals() {
  const group = useRef<THREE.Group>(null);
  const items = useRef<{ ref: THREE.Object3D | null; speed: number; radius: number }[]>([]);

  const shapes = useMemo(() => {
    const arr: React.ReactNode[] = [];
    const count = 10;
    for (let i = 0; i < count; i++) {
      const radius = 9 + (i % 5) * 2.2;
      const phase = (i / count) * Math.PI * 2;
      const y = (i % 3 - 1) * 3 + Math.sin(phase) * 1.5;
      const speed = 0.1 + Math.random() * 0.12;
      const isCube = i % 4 === 0;
      const isTorus = i % 4 === 1;
      const isRing = i % 4 === 2;
      const size = 0.35 + (i % 3) * 0.18;
      const color = ['#6d7cff', '#38d6ff', '#9b6dff', '#ff5db1'][i % 4];
      arr.push(
        <group
          key={i}
          position={[Math.cos(phase) * radius, y, Math.sin(phase) * radius]}
          ref={(el: THREE.Group | null) => {
            if (el) items.current[i] = { ref: el, speed, radius };
          }}
        >
          {isCube && (
            <mesh>
              <boxGeometry args={[size, size, size]} />
              <meshBasicMaterial color={color} wireframe transparent opacity={0.5} />
            </mesh>
          )}
          {isTorus && (
            <mesh>
              <torusKnotGeometry args={[size, size * 0.35, 60, 10]} />
              <meshBasicMaterial color={color} wireframe transparent opacity={0.4} />
            </mesh>
          )}
          {isRing && (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[size * 1.4, size * 0.08, 12, 48]} />
              <meshBasicMaterial color={color} transparent opacity={0.6} />
            </mesh>
          )}
          {!isCube && !isTorus && !isRing && (
            <mesh>
              <icosahedronGeometry args={[size, 0]} />
              <meshBasicMaterial color={color} wireframe transparent opacity={0.5} />
            </mesh>
          )}
        </group>
      );
    }
    return arr;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    items.current.forEach((item, i) => {
      if (!item?.ref) return;
      const angle = t * item.speed + i * 0.7;
      item.ref.position.x = Math.cos(angle) * item.radius;
      item.ref.position.z = Math.sin(angle) * item.radius;
      item.ref.rotation.x += 0.005;
      item.ref.rotation.y += 0.008;
      const pulse = 1 + Math.sin(t * 1.2 + i) * 0.08;
      item.ref.scale.setScalar(pulse);
    });
  });

  return <group ref={group}>{shapes}</group>;
}

// ============ Floating Code Fragments ============
const CODE_SNIPPETS = ['const build = () => AI();', '</engine>', 'import { future }', '{ render: true }', 'await generate()', 'vector3(0,0,0)'];

function CodeFragments() {
  const group = useRef<THREE.Group>(null);
  const frags = useRef<{ text: string; pos: THREE.Vector3 }[]>([]);

  const geometry = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    return canvas;
  }, []);

  const sprites = useMemo(() => {
    const arr: { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; text: string }[] = [];
    CODE_SNIPPETS.forEach((text, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.font = 'bold 42px monospace';
      ctx.fillStyle = 'rgba(20,24,40,0.0)';
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = ['#6d7cff', '#38d6ff', '#9b6dff', '#ff5db1', '#34e0a1', '#ffc46b'][i];
      ctx.globalAlpha = 0.85;
      ctx.fillText(text, 16, 72);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      const angle = Math.random() * Math.PI * 2;
      const radius = 7 + Math.random() * 6;
      sprite.position.set(Math.cos(angle) * radius, (Math.random() - 0.5) * 8, Math.sin(angle) * radius);
      sprite.scale.set(4.5, 1.1, 1);
      arr.push({ sprite, mat, text });
    });
    return arr;
  }, []);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    sprites.forEach((f, i) => {
      const angle = t * 0.04 + i * 1.3;
      f.sprite.position.x = Math.cos(angle) * f.sprite.position.length();
      f.sprite.position.z = Math.sin(angle) * f.sprite.position.length();
      f.sprite.position.y += Math.sin(t * 0.5 + i) * 0.004;
      f.mat.opacity = 0.35 + Math.sin(t * 0.7 + i * 2) * 0.15;
    });
  });

  return (
    <group ref={group}>
      {sprites.map((f, i) => (
        <primitive key={i} object={f.sprite} />
      ))}
    </group>
  );
}

// ============ Glowing Particle Field ============
function ParticleField() {
  const ref = useRef<THREE.Points>(null);
  const [points, setPoints] = useState<THREE.Points | null>(null);
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const count = 2600;
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c1 = new THREE.Color('#6d7cff');
    const c2 = new THREE.Color('#38d6ff');
    const c3 = new THREE.Color('#9b6dff');
    for (let i = 0; i < count; i++) {
      const r = 4 + Math.random() * 14;
      const theta = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 2] = Math.sin(theta) * r;
      const c = [c1, c2, c3][Math.floor(Math.random() * 3)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    setPoints(pts);

    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMove, { passive: true });

    return () => {
      geo.dispose();
      mat.dispose();
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.y = t * 0.015;
    ref.current.position.x += (mouse.current.x * -3 - ref.current.position.x) * 0.02;
    ref.current.position.y += (mouse.current.y * -2 - ref.current.position.y) * 0.02;
  });

  return points ? <primitive ref={ref} object={points} /> : null;
}

// ============ Camera Controller (mouse + mode reactive) ============
function CameraRig({ mode }: { mode: 'home' | 'workbench' }) {
  const { camera } = useThree();
  const mouse = useRef({ x: 0, y: 0 });
  const homePos = useRef(new THREE.Vector3(0, 1, 20));
  const workPos = useRef(new THREE.Vector3(0, 1, 14));

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const targetMode = mode === 'workbench' ? workPos.current : homePos.current;

    const scrollBoost = cameraOrbitRef.current * 6;
    const tx = targetMode.x + mouse.current.x * -1.8 + Math.sin(t * 0.1) * 0.4 + scrollBoost;
    const ty = targetMode.y + mouse.current.y * -1.4 + Math.sin(t * 0.07) * 0.5;
    const tz = targetMode.z;

    camera.position.x += (tx - camera.position.x) * 0.04;
    camera.position.y += (ty - camera.position.y) * 0.04;
    camera.position.z += (tz - camera.position.z) * 0.04;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// ============ Main Universe ============
export default function Universe({ mode }: { mode: 'home' | 'workbench' }) {
  const [glReady, setGlReady] = useState(false);

  return (
    <div className="fixed inset-0 z-0">
      <Canvas
        camera={{ position: [0, 1, 20], fov: 55 }}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
        dpr={[1, 1.75]}
        onCreated={() => setGlReady(true)}
      >
        <fog attach="fog" args={['#05060a', 18, 34]} />
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={2} color="#6d7cff" />
        <pointLight position={[-10, -5, 5]} intensity={1.5} color="#ff5db1" />
        <NeuralNet />
        <HoloOrbitals />
        <CodeFragments />
        {glReady && <ParticleField />}
        <CameraRig mode={mode} />
      </Canvas>
    </div>
  );
}
