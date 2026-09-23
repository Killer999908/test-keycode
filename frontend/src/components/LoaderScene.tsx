'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import gsap from 'gsap';
import * as THREE from 'three';

export default function LoaderScene() {
  const meshRef = useRef<THREE.Mesh>(null);
  const mesh2Ref = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);

  const particles = useMemo(() => {
    const count = 600;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 12;
    const geo = new THREE.BufferGeometry();
    // impure only on first build
    // eslint-disable-next-line react-hooks/purity
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.015, transparent: true, opacity: 0 })
    );
  }, []);
  // the particle field is generated once and never regenerated

  useEffect(() => {
    if (!meshRef.current || !mesh2Ref.current) return;
    gsap.to(meshRef.current.scale, { x: 1, y: 1, z: 1, duration: 1.8, ease: 'power3.out' });
    gsap.to((meshRef.current.material as THREE.MeshBasicMaterial), { opacity: 0.3, duration: 1.2, ease: 'power2.out' });
    gsap.to(mesh2Ref.current.scale, { x: 0.85, y: 0.85, z: 0.85, duration: 1.8, ease: 'power3.out', delay: 0.1 });
    gsap.to((mesh2Ref.current.material as THREE.MeshBasicMaterial), { opacity: 0.12, duration: 1.2, ease: 'power2.out', delay: 0.1 });
    gsap.to((particles.material as THREE.PointsMaterial), { opacity: 0.25, duration: 1.5, ease: 'power2.out', delay: 0.3 });
  }, [particles]);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.008;
      meshRef.current.rotation.y += 0.015;
    }
    if (mesh2Ref.current) {
      mesh2Ref.current.rotation.x -= 0.005;
      mesh2Ref.current.rotation.y += 0.01;
    }
    if (particlesRef.current) {
      particlesRef.current.rotation.y += 0.0008;
    }
  });

  return (
    <>
      <mesh ref={meshRef} scale={[0.01, 0.01, 0.01]}>
        <torusKnotGeometry args={[1, 0.35, 180, 24]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0} />
      </mesh>
      <mesh ref={mesh2Ref} scale={[0.01, 0.01, 0.01]}>
        <torusKnotGeometry args={[0.7, 0.25, 120, 20]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0} />
      </mesh>
      <primitive object={particles} ref={particlesRef} />
    </>
  );
}
