'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { motion } from 'framer-motion';

const services = [
  { id: 'fullstack-web', icon: '🌐', name: 'Full Stack Web Dev', desc: 'React, Node.js, APIs, databases — complete web apps from scratch', color: '#6366f1' },
  { id: 'game-development', icon: '🎮', name: 'Game Development', desc: 'HTML5, Phaser.js games — platformers, shooters, puzzles, and more', color: '#ec4899' },
  { id: 'ui-ux-design', icon: '🎨', name: 'UI / UX Designing', desc: 'Beautiful interfaces, design systems, wireframes, and prototypes', color: '#f59e0b' },
  { id: 'software-dev', icon: '💻', name: 'Software Development', desc: 'Desktop apps, utilities, tools, and automation software', color: '#22d3ee' },
  { id: 'cad-modeling', icon: '⚙️', name: '3D CAD Modeling', desc: 'Parametric 3D models, mechanical parts, enclosures, brackets', color: '#10b981' },
  { id: '3d-scan-to-cad', icon: '📷', name: '3D Scan to CAD', desc: 'Turn real objects into precise 3D CAD models via photogrammetry', color: '#8b5cf6' },
  { id: '3d-printing', icon: '🖨️', name: '3D Printing Service', desc: 'Upload STL files or generate designs — we print and ship', color: '#06b6d4' },
  { id: 'pcb-fabrication', icon: '🔌', name: 'PCB Fabrication', desc: 'PCB design + manufacturing — from schematic to fabricated board', color: '#ef4444' },
  { id: 'mcu-coding', icon: '🤖', name: 'MCU / Firmware Coding', desc: 'Arduino, ESP32, STM32 firmware with OTA updates and sensors', color: '#14b8a6' },
  { id: 'os-development', icon: '🖥️', name: 'Operating System Dev', desc: 'Custom OS kernels, bootloaders, drivers, and embedded Linux', color: '#a855f7' },
  { id: 'mobile-apps', icon: '📱', name: 'Mobile App Development', desc: 'Cross-platform mobile apps with React Native or Flutter', color: '#f97316' },
  { id: 'api-backend', icon: '🔗', name: 'API & Backend Dev', desc: 'RESTful APIs, GraphQL, serverless functions, microservices', color: '#0ea5e9' },
  { id: 'database-design', icon: '🗄️', name: 'Database Architecture', desc: 'PostgreSQL, MongoDB, Redis — schema design, optimization, migration', color: '#84cc16' },
  { id: 'devops-cloud', icon: '☁️', name: 'DevOps & Cloud', desc: 'CI/CD, Docker, Kubernetes, AWS/GCP deployment, monitoring', color: '#38bdf8' },
  { id: 'ai-ml', icon: '🧠', name: 'AI / ML Integration', desc: 'LLM APIs, RAG pipelines, computer vision, predictive models', color: '#c084fc' },
  { id: 'cybersecurity', icon: '🔒', name: 'Cybersecurity Audit', desc: 'Penetration testing, vulnerability assessment, security hardening', color: '#fb7185' },
  { id: 'blockchain-web3', icon: '⛓️', name: 'Blockchain & Web3', desc: 'Smart contracts, dApps, NFTs, DeFi protocols, and tokenomics', color: '#f0abfc' },
  { id: 'data-science', icon: '📊', name: 'Data Science & Analytics', desc: 'Data pipelines, dashboards, BI tools, statistical modeling', color: '#2dd4bf' },
  { id: 'ar-vr', icon: '🥽', name: 'AR / VR Development', desc: 'Augmented reality, virtual reality, WebXR, and 3D web experiences', color: '#e879f9' },
  { id: 'ecommerce', icon: '🛒', name: 'E-commerce Solutions', desc: 'Online stores, cart systems, payment integration, inventory management', color: '#fbbf24' },
  { id: 'chatbot-dev', icon: '💬', name: 'Chatbot Development', desc: 'AI chatbots, customer service bots, voice assistants, LLM agents', color: '#34d399' },
  { id: 'automation', icon: '⚡', name: 'Workflow Automation', desc: 'Business process automation, Zapier-style flows, RPA bots', color: '#60a5fa' },
  { id: 'cms', icon: '📝', name: 'Content Management Systems', desc: 'Headless CMS, WordPress, custom admin panels, blog platforms', color: '#a78bfa' },
  { id: 'testing-qa', icon: '🧪', name: 'Testing & QA', desc: 'Automated testing, unit/integration/E2E, load testing, CI test suites', color: '#4ade80' },
  { id: 'documentation', icon: '📖', name: 'Technical Documentation', desc: 'API docs, user manuals, architecture diagrams, interactive guides', color: '#f472b6' },
  { id: 'animation', icon: '✨', name: 'Animation & Motion Design', desc: 'GSAP, Lottie, Framer Motion, 3D web animations, micro-interactions', color: '#fb923c' },
  { id: 'pwa', icon: '📲', name: 'Progressive Web Apps', desc: 'Offline-first apps, service workers, push notifications, app install', color: '#2dd4bf' },
  { id: 'voice-assistant', icon: '🎤', name: 'Voice Assistant Dev', desc: 'Alexa skills, Google Actions, custom voice UIs, speech-to-text', color: '#c084fc' },
  { id: 'iot', icon: '📡', name: 'IoT Solutions', desc: 'Sensor networks, MQTT brokers, smart home, industrial IoT dashboards', color: '#06b6d4' },
  { id: 'elearning', icon: '🎓', name: 'E-learning Platforms', desc: 'Course platforms, interactive lessons, quizzes, progress tracking', color: '#a3e635' },
  { id: 'social-integration', icon: '🔗', name: 'Social Media Integration', desc: 'OAuth login, social sharing, feed aggregation, community features', color: '#60a5fa' },
  { id: 'payments', icon: '💳', name: 'Payment Gateway Integration', desc: 'Stripe, Razorpay, PayPal, UPI, subscriptions, invoicing', color: '#10b981' },
  { id: 'realtime-apps', icon: '⚡', name: 'Real-time Applications', desc: 'WebSockets, live collaboration, streaming data, notifications', color: '#f43f5e' },
  { id: 'image-processing', icon: '🖼️', name: 'Image / Video Processing', desc: 'Computer vision, filters, transcoding, thumbnail generation, OCR', color: '#8b5cf6' },
  { id: 'nlp', icon: '📄', name: 'Natural Language Processing', desc: 'Text analysis, translation, sentiment analysis, named entity recognition', color: '#14b8a6' },
  { id: 'robotics', icon: '🦾', name: 'Robotics Programming', desc: 'Robot control, ROS, motion planning, sensor fusion, autonomous nav', color: '#f97316' },
  { id: 'scraping', icon: '🕸️', name: 'Web Scraping & Extraction', desc: 'Data scraping, crawling, ETL pipelines, API wrappers', color: '#78716c' },
  { id: 'maps-location', icon: '📍', name: 'Maps & Location Services', desc: 'Mapbox, Google Maps, geocoding, route optimization, geofencing', color: '#22c55e' },
  { id: 'analytics', icon: '📈', name: 'Analytics & Tracking', desc: 'Event tracking, user analytics, mixpanel/GA integration, dashboards', color: '#eab308' },
  { id: 'migration', icon: '🔄', name: 'System Migration & Upgrade', desc: 'Legacy to modern, cloud migration, database migration, re-platforming', color: '#64748b' },
];

const servicePrompts: Record<string, string> = {
  'fullstack-web': 'Build a complete full-stack web application with:',
  'game-development': 'Design and build an HTML5 game with Phaser.js that has:',
  'ui-ux-design': 'Design a modern UI/UX for a:',
  'software-dev': 'Develop a software application that:',
  'cad-modeling': 'Generate a 3D CAD model of:',
  '3d-scan-to-cad': 'I want to scan a real object and convert it to a 3D CAD model. The object is:',
  '3d-printing': 'Design a 3D printable model of:',
  'pcb-fabrication': 'Design a PCB for:',
  'mcu-coding': 'Write firmware for a microcontroller that:',
  'os-development': 'Develop an operating system component that:',
  'mobile-apps': 'Build a mobile application that:',
  'api-backend': 'Create a backend API that:',
  'database-design': 'Design a database schema for:',
  'devops-cloud': 'Set up a DevOps pipeline for:',
  'ai-ml': 'Build an AI/ML integration that:',
  'cybersecurity': 'Perform a security audit for:',
  'blockchain-web3': 'Build a blockchain/dApp that:',
  'data-science': 'Build a data analytics pipeline for:',
  'ar-vr': 'Create an AR/VR experience that:',
  'ecommerce': 'Build an e-commerce platform that:',
  'chatbot-dev': 'Build a chatbot that:',
  'automation': 'Create an automation workflow that:',
  'cms': 'Build a content management system that:',
  'testing-qa': 'Create a test suite for:',
  'documentation': 'Generate technical documentation for:',
  'animation': 'Create animations for:',
  'pwa': 'Build a progressive web app that:',
  'voice-assistant': 'Build a voice assistant that:',
  'iot': 'Design an IoT system that:',
  'elearning': 'Build an e-learning platform that:',
  'social-integration': 'Add social media integration for:',
  'payments': 'Integrate payment processing for:',
  'realtime-apps': 'Build a real-time application that:',
  'image-processing': 'Build an image/video processing system that:',
  'nlp': 'Build an NLP solution that:',
  'robotics': 'Develop robotics software that:',
  'scraping': 'Build a web scraping system that:',
  'maps-location': 'Build a maps/location service that:',
  'analytics': 'Build an analytics dashboard for:',
  'migration': 'Plan a system migration for:',
};

function ServiceCard({ service, index }: { service: typeof services[0]; index: number }) {
  const cardRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = cardRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start: 'top 88%', end: 'top 25%', toggleActions: 'play none none reverse' },
        opacity: 0, y: 30, scale: 0.95, duration: 0.5, delay: index * 0.03, ease: 'power2.out',
      });
    });
    return () => ctx.revert();
  }, [index]);

  const href = '/ai-builder.html?service=' + service.id;

  return (
    <a ref={cardRef} href={href}
      className="group relative block p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-300 hover:-translate-y-0.5"
      style={{ '--hover-color': service.color } as React.CSSProperties}
    >
      <div className="text-2xl mb-2">{service.icon}</div>
      <h3 className="text-sm font-semibold text-white/90 mb-1 group-hover:text-white transition-colors">{service.name}</h3>
      <p className="text-xs text-white/40 leading-relaxed">{service.desc}</p>
    </a>
  );
}

export default function ServicesGrid() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      if (sectionRef.current) {
        gsap.from(sectionRef.current.querySelectorAll<HTMLElement>('.services-line'), {
          scrollTrigger: { trigger: sectionRef.current, start: 'top 80%', end: 'top 30%', toggleActions: 'play none none reverse' },
          opacity: 0, y: 40, stagger: 0.15, duration: 0.8, ease: 'power3.out',
        });
      }
    });
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-32 px-6 border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-xs tracking-[0.35em] text-white/30 mb-4 font-syne uppercase"
        >
          Everything You Need
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 40, rotateX: -10 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl md:text-6xl font-syne font-bold mb-4"
          style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
        >
          Our Services
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-white/40 text-base mb-16 max-w-2xl"
        >
          Click any service to start building with AI. Describe what you want, and we&apos;ll generate it — from websites and games to 3D models and PCB designs.
        </motion.p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {services.map((s, i) => (
            <ServiceCard key={s.id} service={s} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
