'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AgentEngine } from './useAgentEngine';

function RotatingModel({ type }: { type: 'cad' | 'pcb' | 'product' | 'game' }) {
  const group = useRef<THREE.Group>(null);
  const wireGroup = useRef<THREE.Group>(null);
  const mouse = useRef({ x: 0, y: 0 });

  const geometry = useMemo(() => {
    switch (type) {
      case 'cad':
        return <torusKnotGeometry args={[1, 0.32, 180, 24]} />;
      case 'pcb':
        return <boxGeometry args={[2.4, 1.6, 0.14]} />;
      case 'product':
        return <icosahedronGeometry args={[1.1, 1]} />;
      default:
        return <octahedronGeometry args={[1.2, 1]} />;
    }
  }, [type]);

  const material = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: '#6d7cff', metalness: 0.9, roughness: 0.25, transparent: true, opacity: 0.9 }),
    []
  );

  const wireMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#38d6ff', wireframe: true, transparent: true, opacity: 0.35 }),
    []
  );

  useFrame((state) => {
    if (!group.current || !wireGroup.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y += 0.008;
    group.current.rotation.x = Math.sin(t * 0.4) * 0.25;
    group.current.position.y = Math.sin(t * 0.8) * 0.15;
    wireGroup.current.rotation.y -= 0.006;
    wireGroup.current.rotation.x += 0.004;
    wireGroup.current.scale.setScalar(1.35 + Math.sin(t * 1.2) * 0.05);
  });

  return (
    <group
      onPointerMove={(e) => {
        mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
        mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
      }}
    >
      <mesh ref={group} geometry={geometry as never} material={material} castShadow />
      <mesh ref={wireGroup} geometry={geometry as never} material={wireMaterial} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
        <ringGeometry args={[1.6, 2.2, 48]} />
        <meshBasicMaterial color="#6d7cff" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export default function Viewer3DPane({ type, pcb }: { type: 'cad' | 'pcb' | 'product' | 'game'; pcb?: AgentEngine['pcb'] }) {
  const showPcbOverlay = type === 'pcb' && pcb?.pcbSvg;
  return (
    <div className="h-full bg-[#07080d] flex flex-col">
      <div className="flex items-center gap-3 px-4 h-9 border-b border-[var(--os-border)] text-[11px] text-[var(--os-text-faint)]">
        <span>3D Viewer</span>
        <div className="flex gap-1 ml-auto">
          {(['cad', 'pcb', 'product', 'game'] as const).map((t) => (
            <span
              key={t}
              className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                type === t ? 'bg-[rgba(109,124,255,0.15)] text-white' : 'text-[var(--os-text-faint)]'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
        <span className="flex items-center gap-1.5 ml-2">
          <span className="os-live-dot" /> live
        </span>
      </div>
      <div className="flex-1 relative">
        <Canvas camera={{ position: [0, 1.5, 4.5], fov: 45 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[4, 4, 4]} intensity={2.5} color="#6d7cff" />
          <pointLight position={[-4, -3, 3]} intensity={2} color="#ff5db1" />
          <RotatingModel type={type} />
        </Canvas>
        {showPcbOverlay && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
            <div className="max-w-full max-h-full overflow-auto rounded-lg border border-[var(--os-border)] bg-[rgba(0,0,0,0.6)] p-2" dangerouslySetInnerHTML={{ __html: pcb.pcbSvg! }} />
          </div>
        )}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-mono text-[var(--os-text-faint)] pointer-events-none">
          drag to inspect · auto-rotate on
        </div>
      </div>
    </div>
  );
}
