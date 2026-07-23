'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { cameraOrbitRef } from '@/lib/cameraOrbit';

export default function CameraOrbitSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.to(cameraOrbitRef, {
        current: 1,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1,
        },
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative h-[200vh]">
      <div className="sticky top-0 h-screen flex flex-col items-center justify-center">
        <span className="font-syne text-[10px] tracking-[0.3em] uppercase text-white/20 mb-4">
          Scroll to explore
        </span>
        <p className="font-syne text-4xl md:text-6xl font-bold text-center">
          Rotate &amp; Explore
        </p>
        <p className="mt-4 text-sm text-white/30 max-w-md text-center">
          Scroll to orbit the view around the KEYCODE insignia.
        </p>
      </div>
    </section>
  );
}
