'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { cameraOrbitRef } from '@/lib/cameraOrbit';

function OrbitController() {
  useFrame(({ camera }) => {
    const targetAngle = cameraOrbitRef.current * Math.PI * 2;
    const radius = 12;
    const targetX = Math.sin(targetAngle) * radius;
    const targetZ = Math.cos(targetAngle) * radius;
    camera.position.x += (targetX - camera.position.x) * 0.08;
    camera.position.z += (targetZ - camera.position.z) * 0.08;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function ExtrudedK() {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 0.2;
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * -0.2;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const a = 0.8;
    s.moveTo(-0.5 * a, -1.2 * a);
    s.lineTo(-0.5 * a, 1.2 * a);
    s.lineTo(-0.15 * a, 1.2 * a);
    s.lineTo(-0.15 * a, 0.15 * a);
    s.lineTo(0.65 * a, 1.2 * a);
    s.lineTo(0.9 * a, 1.2 * a);
    s.lineTo(0.15 * a, 0 * a);
    s.lineTo(0.9 * a, -1.2 * a);
    s.lineTo(0.65 * a, -1.2 * a);
    s.lineTo(-0.15 * a, -0.15 * a);
    s.lineTo(-0.15 * a, -1.2 * a);
    s.lineTo(-0.5 * a, -1.2 * a);
    return s;
  }, []);

  const extrudeSettings = {
    depth: 0.35,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.04,
    bevelSegments: 8,
  };

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    if (cameraOrbitRef.current < 0.01) {
      groupRef.current.rotation.y += 0.003;
    }

    groupRef.current.rotation.x += (
      (-0.2 + mouse.current.y) - groupRef.current.rotation.x
    ) * 0.03;
    groupRef.current.rotation.z += (
      mouse.current.x - groupRef.current.rotation.z
    ) * 0.03;

    groupRef.current.position.y = 0.3 + Math.sin(t * 1.2) * 0.15;

    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.08 + Math.sin(t * 1.5) * 0.04;
    }
  });

  const meshes = useMemo(() => (
    <>
      <mesh rotation={[-0.3, -0.8, 0]} position={[0, 0.3, -0.3]} scale={1.15}>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshBasicMaterial color="#4488ff" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
      <mesh rotation={[-0.3, -0.8, 0]} position={[0, 0.3, 0]} scale={1.06}>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshBasicMaterial color="#4488ff" wireframe transparent opacity={0.1} />
      </mesh>
      <mesh rotation={[-0.3, -0.8, 0]} position={[0, 0.3, 0]}>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.35} />
      </mesh>
      <mesh rotation={[-0.3, -0.8, 0]} position={[0, 0.3, 0]} scale={1.005}>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshPhysicalMaterial
          color="#ffffff"
          metalness={0.95}
          roughness={0.05}
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
          envMapIntensity={3}
        />
      </mesh>
    </>
  ), [shape, extrudeSettings]);

  return <group ref={groupRef}>{meshes}</group>;
}

function Particles() {
  const ref = useRef<THREE.Points>(null);

  const points = useMemo(() => {
    const count = 1200;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.5 + Math.random() * 6;
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 7;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 7;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.03,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    }));
  }, []);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.02;
    }
  });

  return <primitive ref={ref} object={points} />;
}

export default function Scene() {
  return (
    <div className="fixed inset-0 z-[-1] pointer-events-none">
      <Canvas camera={{ position: [0, 0, 12], fov: 45 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
        <color attach="background" args={['#0a0a0a']} />
        <OrbitController />
        <ExtrudedK />
        <Particles />
        <Environment preset="city" />
        <EffectComposer multisampling={0}>
          <Bloom
            luminanceThreshold={0.1}
            luminanceSmoothing={0.85}
            intensity={1.5}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.2} darkness={0.7} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
