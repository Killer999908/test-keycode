(function() {
  'use strict';

  if (typeof THREE === 'undefined') {
    console.warn('[3D-Scroll] Three.js not loaded');
    return;
  }

  let scene, camera, renderer;
  let mouseX = 0, mouseY = 0, targetMouseX = 0, targetMouseY = 0;
  let mouseScreenX = 0, mouseScreenY = 0;
  let scrollY = 0, targetScrollY = 0;
  let particles, glowParticles;
  let animationId;
  let clock = new THREE.Clock();
  let meshes = [];
  let connectionLines = null;
  let heroLogo, heroOrbitParticles, heroLogoMesh;
  let composer = null;
  let isVisible = true;
  let frameCount = 0, lastFpsCheck = 0, fps = 60;
  let maxParticles = 5000;
  let raycaster = new THREE.Raycaster();
  let mouseVec = new THREE.Vector2();
  let hoveredMesh = null;
  let glassPanels = [];
  let targetBloomIntensity = 0.3;

  const COLORS = [
    0x6366f1, 0x22d3ee, 0x10b981, 0xf59e0b,
    0xef4444, 0x8b5cf6, 0xec4899, 0x14b8a6,
    0xf472b6, 0x818cf8, 0x34d399, 0xfb923c
  ];

  function createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }

  const CYCLE_COLORS = [0x6366f1, 0x22d3ee, 0xec4899, 0x8b5cf6];

  function getCycleColor(offset, elapsed) {
    const t = ((offset + elapsed * 3) / 400) % 1;
    const idx = Math.floor(t * (CYCLE_COLORS.length - 1));
    const frac = (t * (CYCLE_COLORS.length - 1)) % 1;
    const c1 = new THREE.Color(CYCLE_COLORS[idx]);
    const c2 = new THREE.Color(CYCLE_COLORS[Math.min(idx + 1, CYCLE_COLORS.length - 1)]);
    c1.lerp(c2, frac);
    return c1;
  }

  function init() {
    if (document.getElementById('three-scroll-canvas')) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'three-scroll-canvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:0;display:block';

    document.body.prepend(canvas);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.002);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 18);

    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;

    const ambientLight = new THREE.AmbientLight(0x222244, 0.6);
    scene.add(ambientLight);

    const light1 = new THREE.DirectionalLight(0x6366f1, 2.0);
    light1.position.set(5, 5, 5);
    scene.add(light1);

    const light2 = new THREE.DirectionalLight(0x22d3ee, 1.2);
    light2.position.set(-5, -3, 5);
    scene.add(light2);

    const pointLight = new THREE.PointLight(0x8b5cf6, 1.0, 30);
    pointLight.position.set(0, 0, 5);
    scene.add(pointLight);

    const pointLight2 = new THREE.PointLight(0xec4899, 0.8, 30);
    pointLight2.position.set(0, 0, -5);
    scene.add(pointLight2);

    createGeometricObjects();
    createParticles();
    createGlowParticles();
    createGrid();
    setupConnectionLines();
    createGlassPanels();
    createHeroLogo();
    setupBloom();

    window.addEventListener('resize', onResize);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('scroll', onScroll);
    document.addEventListener('visibilitychange', () => {
      isVisible = !document.hidden;
      if (isVisible) clock.start();
    });

    setupScrollReveal();
    initAnimationEngine();
    animate();
  }

  function createGeometricObjects() {
    const geometries = [
      new THREE.IcosahedronGeometry(0.4, 0),
      new THREE.OctahedronGeometry(0.35, 0),
      new THREE.TorusKnotGeometry(0.25, 0.1, 64, 8),
      new THREE.TetrahedronGeometry(0.35, 0),
      new THREE.DodecahedronGeometry(0.3, 0),
      new THREE.TorusGeometry(0.3, 0.12, 16, 32),
      new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.ConeGeometry(0.3, 0.5, 6),
      new THREE.IcosahedronGeometry(0.5, 1),
      new THREE.CylinderGeometry(0.2, 0.3, 0.5, 6),
      new THREE.RingGeometry(0.2, 0.4, 24),
      new THREE.SphereGeometry(0.3, 12, 8)
    ];

    const layers = [
      { zMin: -20, zMax: -10, count: 30, speedMul: 0.4 },
      { zMin: -10, zMax: -3, count: 40, speedMul: 0.7 },
      { zMin: -3, zMax: 3, count: 30, speedMul: 1.0 },
      { zMin: 3, zMax: 10, count: 20, speedMul: 1.4 }
    ];

    let idx = 0;
    layers.forEach((layer) => {
      for (let i = 0; i < layer.count; i++) {
        const geo = geometries[idx % geometries.length];
        idx++;
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        const colorObj = new THREE.Color(color);
        const mat = new THREE.MeshPhysicalMaterial({
          color: color,
          metalness: 0.1 + Math.random() * 0.4,
          roughness: 0.1 + Math.random() * 0.3,
          transparent: true,
          opacity: 0.3 + Math.random() * 0.5,
          wireframe: Math.random() > 0.75,
          emissive: color,
          emissiveIntensity: 0.05 + Math.random() * 0.1,
          clearcoat: Math.random() > 0.5 ? 0.1 : 0,
          clearcoatRoughness: 0.3
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 35,
          layer.zMin + Math.random() * (layer.zMax - layer.zMin)
        );
        mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);

        const speed = (0.15 + Math.random() * 0.4) * layer.speedMul;
        const rotSpeed = {
          x: (Math.random() - 0.5) * 0.015,
          y: (Math.random() - 0.5) * 0.015,
          z: (Math.random() - 0.5) * 0.01
        };
        const floatOffset = Math.random() * Math.PI * 2;
        const floatSpeed = 0.2 + Math.random() * 0.6;
        const floatAmp = 0.1 + Math.random() * 0.5;
        const startY = mesh.position.y;
        const startX = mesh.position.x;
        const startZ = mesh.position.z;
        const orbitRadius = 0.5 + Math.random() * 2;
        const orbitSpeed = 0.1 + Math.random() * 0.3;
        const orbitPhase = Math.random() * Math.PI * 2;
        const colorShift = Math.random() * 100;
        const baseScale = 0.6 + Math.random() * 0.8;
        const pulseAmp = 0.05 + Math.random() * 0.12;

        mesh.userData = {
          speed, rotSpeed, floatOffset, floatSpeed, floatAmp,
          startY, startX, startZ, orbitRadius, orbitSpeed, orbitPhase,
          colorShift, baseScale, pulseAmp, layer: layer,
          colorObj, color,
          mouseInfluence: 0.5 + Math.random() * 1.0
        };

        mesh.scale.set(baseScale, baseScale, baseScale);
        scene.add(mesh);
        meshes.push(mesh);
      }
    });
  }

  function createParticles() {
    const count = maxParticles;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const velocities = [];
    const particleColors = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 50;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30 - 5;
      sizes[i] = 0.015 + Math.random() * 0.08;

      const c = new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      particleColors.push(c);

      velocities.push({
        x: (Math.random() - 0.5) * 0.005,
        y: (Math.random() - 0.5) * 0.005,
        z: (Math.random() - 0.5) * 0.002
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });

    particles = new THREE.Points(geo, mat);
    particles.userData.velocities = velocities;
    particles.userData.particleColors = particleColors;
    scene.add(particles);
  }

  function createGlowParticles() {
    const count = 300;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 35;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 5;
      sizes[i] = 0.3 + Math.random() * 0.8;
      const c = new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const tex = createGlowTexture();
    const mat = new THREE.PointsMaterial({
      size: 0.4,
      map: tex,
      vertexColors: true,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });

    glowParticles = new THREE.Points(geo, mat);
    scene.add(glowParticles);
  }

  function createGrid() {
    const gridHelper = new THREE.GridHelper(40, 50, 0x6366f1, 0x22d3ee);
    gridHelper.position.y = -10;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.12;
    scene.add(gridHelper);

    const gridHelper2 = new THREE.GridHelper(40, 50, 0x8b5cf6, 0xec4899);
    gridHelper2.position.y = -10;
    gridHelper2.position.z = -8;
    gridHelper2.material.transparent = true;
    gridHelper2.material.opacity = 0.06;
    scene.add(gridHelper2);
  }

  function setupConnectionLines() {
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending
    });
    const positions = new Float32Array(12000);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 0);
    connectionLines = new THREE.LineSegments(geo, lineMat);
    scene.add(connectionLines);
  }

  function setupBloom() {
    if (typeof THREE.EffectComposer !== 'undefined' &&
        typeof THREE.RenderPass !== 'undefined' &&
        typeof THREE.UnrealBloomPass !== 'undefined') {
      composer = new THREE.EffectComposer(renderer);
      var renderPass = new THREE.RenderPass(scene, camera);
      composer.addPass(renderPass);
      var bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.4, 0.25, 0.15
      );
      composer.addPass(bloomPass);
    }
  }

  function createGlassPanels() {
    var panelMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.1,
      transparent: true,
      opacity: 0.03,
      side: THREE.DoubleSide,
      envMapIntensity: 0.2,
      depthWrite: false
    });
    var edgeMat = new THREE.LineBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.06
    });
    var shapes = [
      { w: 4, h: 6, x: -8, y: 2, z: -6, ry: 0.3 },
      { w: 3, h: 8, x: 9, y: -3, z: -8, ry: -0.4 },
      { w: 5, h: 4, x: -10, y: -5, z: 2, ry: 0.6 },
      { w: 6, h: 5, x: 10, y: 4, z: -4, ry: -0.2 },
      { w: 3.5, h: 3.5, x: 0, y: -8, z: -10, ry: 0.5 }
    ];
    shapes.forEach(function(s) {
      var geo = new THREE.PlaneGeometry(s.w, s.h);
      var mesh = new THREE.Mesh(geo, panelMat);
      mesh.position.set(s.x, s.y, s.z);
      mesh.rotation.y = s.ry;
      mesh.rotation.x = 0.1;
      scene.add(mesh);
      glassPanels.push(mesh);
      var edgeGeo = new THREE.EdgesGeometry(geo);
      var edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
      edgeLine.position.copy(mesh.position);
      edgeLine.rotation.copy(mesh.rotation);
      scene.add(edgeLine);
      glassPanels.push(edgeLine);
    });
  }

  function createHeroLogo() {
    var geometry = new THREE.TorusKnotGeometry(1.2, 0.4, 164, 20);
    var material = new THREE.MeshPhysicalMaterial({
      color: 0x6366f1,
      metalness: 0.4,
      roughness: 0.15,
      transparent: true,
      opacity: 0.95,
      emissive: 0x6366f1,
      emissiveIntensity: 0.3,
      wireframe: false,
      clearcoat: 0.4,
      clearcoatRoughness: 0.15
    });
    heroLogoMesh = new THREE.Mesh(geometry, material);
    heroLogoMesh.position.set(0, 0, 0);
    var wireframeMat = new THREE.MeshPhysicalMaterial({
      color: 0x22d3ee,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.15
    });
    var wireframeMesh = new THREE.Mesh(geometry.clone(), wireframeMat);
    wireframeMesh.position.set(0, 0, 0);
    wireframeMesh.scale.set(1.03, 1.03, 1.03);
    heroLogo = new THREE.Group();
    heroLogo.add(heroLogoMesh);
    heroLogo.add(wireframeMesh);
    var particleCount = 400;
    var positions = new Float32Array(particleCount * 3);
    var sizes = new Float32Array(particleCount);
    var particleData = [];
    for (var i = 0; i < particleCount; i++) {
      var ring = i < 200 ? 0 : 1;
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos(2 * Math.random() - 1);
      var radius = ring === 0 ? 1.8 + Math.random() * 1.5 : 3.5 + Math.random() * 2;
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      sizes[i] = 0.02 + Math.random() * 0.08;
      particleData.push({
        theta: theta, phi: phi, radius: radius,
        speed: (0.001 + Math.random() * 0.004) * (ring === 0 ? 1 : -0.6),
        phase: Math.random() * Math.PI * 2,
        ring: ring
      });
    }
    var particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    var particleTex = createGlowTexture();
    var particleMat = new THREE.PointsMaterial({
      size: 0.1,
      map: particleTex,
      color: 0x818cf8,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
    heroOrbitParticles = new THREE.Points(particleGeo, particleMat);
    heroOrbitParticles.userData.particleData = particleData;
    heroLogo.add(heroOrbitParticles);
    var glowRingMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    var ringGeo = new THREE.RingGeometry(2.8, 3.2, 64);
    var glowRing = new THREE.Mesh(ringGeo, glowRingMat);
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.z = -0.5;
    heroLogo.add(glowRing);
    var glowRing2 = new THREE.Mesh(ringGeo.clone(), glowRingMat);
    glowRing2.rotation.x = Math.PI / 3;
    glowRing2.rotation.z = 0.5;
    glowRing2.position.z = 0.3;
    heroLogo.add(glowRing2);
    scene.add(heroLogo);
  }

  function updateConnectionLines(elapsed) {
    const maxDist = 7;
    const meshCount = meshes.length;
    const positions = connectionLines.geometry.attributes.position.array;
    let idx = 0;
    const maxLines = Math.min(2000, meshCount * 3);

    for (let i = 0; i < meshCount && idx < maxLines * 2; i++) {
      const m1 = meshes[i];
      for (let j = i + 1; j < meshCount && idx < maxLines * 2; j++) {
        const m2 = meshes[j];
        const dx = m1.position.x - m2.position.x;
        const dy = m1.position.y - m2.position.y;
        const dz = m1.position.z - m2.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < maxDist && dist > 0.5) {
          const baseIdx = idx * 3;
          positions[baseIdx] = m1.position.x;
          positions[baseIdx + 1] = m1.position.y;
          positions[baseIdx + 2] = m1.position.z;
          positions[baseIdx + 3] = m2.position.x;
          positions[baseIdx + 4] = m2.position.y;
          positions[baseIdx + 5] = m2.position.z;
          idx += 2;
        }
      }
    }

    // Connection from mouse to nearest shapes
    if (hoveredMesh && idx < maxLines * 2 - 2) {
      var baseIdx = idx * 3;
      var mx = -mouseX * 8;
      var my = -mouseY * 5;
      var mz = 2;
      positions[baseIdx] = mx;
      positions[baseIdx + 1] = my;
      positions[baseIdx + 2] = mz;
      positions[baseIdx + 3] = hoveredMesh.position.x;
      positions[baseIdx + 4] = hoveredMesh.position.y;
      positions[baseIdx + 5] = hoveredMesh.position.z;
      idx += 2;
      connectionLines.material.color.setHex(0x818cf8);
      connectionLines.material.opacity = 0.3 + Math.sin(elapsed * 0.5) * 0.15;
    } else {
      connectionLines.material.color.setHex(0x6366f1);
      connectionLines.material.opacity = 0.06 + Math.sin(elapsed * 0.15) * 0.04;
    }

    connectionLines.geometry.attributes.position.needsUpdate = true;
    connectionLines.geometry.setDrawRange(0, idx);
  }

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) {
      composer.setSize(w, h);
    }
  }

  function onMouseMove(e) {
    targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
    targetMouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    mouseScreenX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseScreenY = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  function onTouchMove(e) {
    if (e.touches.length > 0) {
      targetMouseX = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
      targetMouseY = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
      mouseScreenX = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
      mouseScreenY = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
    }
  }

  function onScroll() {
    targetScrollY = window.scrollY;
  }

  function reduceParticles() {
    if (maxParticles <= 1000) return;
    maxParticles = Math.max(1000, Math.floor(maxParticles * 0.7));
    if (particles) {
      scene.remove(particles);
      particles.geometry.dispose();
      particles.material.dispose();
    }
    createParticles();
  }

  function animate() {
    if (!isVisible) {
      animationId = requestAnimationFrame(animate);
      return;
    }

    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();

    frameCount++;
    if (elapsed - lastFpsCheck > 1) {
      fps = frameCount;
      frameCount = 0;
      lastFpsCheck = elapsed;
      if (fps < 30) {
        reduceParticles();
      }
    }

    mouseX += (targetMouseX - mouseX) * 0.08;
    mouseY += (targetMouseY - mouseY) * 0.08;
    scrollY += (targetScrollY - scrollY) * 0.06;

    const scrollRad = scrollY * 0.0012;
    const autoRotateAngle = elapsed * 0.04;
    const orbitX = Math.sin(autoRotateAngle + scrollRad) * 3 + mouseX * 4;
    const orbitY = -mouseY * 3 + Math.sin(autoRotateAngle * 0.4) * 0.8;
    const orbitZ = 18 + Math.cos(autoRotateAngle + scrollRad) * 3;

    camera.position.x += (orbitX - camera.position.x) * 0.015;
    camera.position.y += (orbitY - camera.position.y) * 0.015;
    camera.position.z += (orbitZ - camera.position.z) * 0.015;
    camera.lookAt(0, scrollY * 0.0015, 0);

    // Raycasting for hover detection
    mouseVec.x = mouseScreenX;
    mouseVec.y = mouseScreenY;
    raycaster.setFromCamera(mouseVec, camera);
    var intersects = raycaster.intersectObjects(meshes);
    var newHovered = null;
    if (intersects.length > 0) {
      newHovered = intersects[0].object;
    }
    if (newHovered !== hoveredMesh) {
      if (hoveredMesh && hoveredMesh.material) {
        hoveredMesh.material.emissiveIntensity = hoveredMesh.userData.origEmissiveIntensity || 0.05;
      }
      hoveredMesh = newHovered;
      if (hoveredMesh && hoveredMesh.material) {
        if (!hoveredMesh.userData.origEmissiveIntensity) {
          hoveredMesh.userData.origEmissiveIntensity = hoveredMesh.material.emissiveIntensity;
        }
      }
    }

    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i];
      const {
        rotSpeed, floatOffset, floatSpeed, floatAmp,
        startY, startX, startZ, orbitRadius, orbitSpeed, orbitPhase,
        colorShift, baseScale, pulseAmp, mouseInfluence
      } = mesh.userData;

      mesh.rotation.x += rotSpeed.x;
      mesh.rotation.y += rotSpeed.y;
      mesh.rotation.z += rotSpeed.z;

      const floatY = Math.sin(elapsed * floatSpeed + floatOffset) * floatAmp;
      const floatX = Math.cos(elapsed * floatSpeed * 0.7 + floatOffset * 1.3) * floatAmp * 0.3;

      const orbitXOffset = Math.sin(elapsed * orbitSpeed + orbitPhase) * orbitRadius;
      const orbitZOffset = Math.cos(elapsed * orbitSpeed * 0.8 + orbitPhase) * orbitRadius;

      const isHovered = mesh === hoveredMesh;
      const hoverBoost = isHovered ? 1.5 : 0;

      const mousePullX = mouseX * mouseInfluence * (0.5 + hoverBoost);
      const mousePullY = mouseY * mouseInfluence * (0.35 + hoverBoost);
      const mousePullZ = (mouseX + mouseY) * mouseInfluence * 0.15;

      const scrollZOffset = scrollY * 0.0008 * mesh.userData.layer.speedMul;

      mesh.position.x = startX + floatX + orbitXOffset + mousePullX;
      mesh.position.y = startY + floatY + orbitYOffset(mesh, elapsed) + mousePullY + scrollY * 0.0008;
      mesh.position.z = startZ + orbitZOffset + mousePullZ - scrollZOffset;

      const pulse = 1 + Math.sin(elapsed * (0.5 + floatSpeed * 0.5) + floatOffset) * pulseAmp;
      const hoverScale = isHovered ? 1.4 : 1;
      const scale = baseScale * pulse * hoverScale;
      mesh.scale.set(scale, scale, scale);

      if (mesh.material.emissive) {
        const cycleColor = getCycleColor(colorShift, elapsed);
        mesh.material.color.lerp(cycleColor, isHovered ? 0.05 : 0.005);
        mesh.material.emissive.lerp(cycleColor, isHovered ? 0.03 : 0.003);
        if (isHovered) {
          mesh.material.emissiveIntensity += (0.8 - mesh.material.emissiveIntensity) * 0.1;
          mesh.material.opacity += (0.9 - mesh.material.opacity) * 0.1;
        } else {
          mesh.material.emissiveIntensity += (mesh.userData.origEmissiveIntensity || 0.05 - mesh.material.emissiveIntensity) * 0.05;
          mesh.material.opacity += (0.4 - mesh.material.opacity) * 0.05;
        }
      }
    }

    if (particles) {
      const pos = particles.geometry.attributes.position.array;
      const vel = particles.userData.velocities;
      const count = pos.length / 3;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        vel[i].x += (Math.random() - 0.5) * 0.003;
        vel[i].y += (Math.random() - 0.5) * 0.003;
        vel[i].z += (Math.random() - 0.5) * 0.001;

        vel[i].x *= 0.98;
        vel[i].y *= 0.98;
        vel[i].z *= 0.99;

        pos[i3] += vel[i].x + mouseX * 0.0005;
        pos[i3 + 1] += vel[i].y + mouseY * 0.0005;
        pos[i3 + 2] += vel[i].z;

        if (pos[i3] > 30) pos[i3] = -30;
        if (pos[i3] < -30) pos[i3] = 30;
        if (pos[i3 + 1] > 25) pos[i3 + 1] = -25;
        if (pos[i3 + 1] < -25) pos[i3 + 1] = 25;
        if (pos[i3 + 2] > 15) pos[i3 + 2] = -15;
        if (pos[i3 + 2] < -15) pos[i3 + 2] = 15;
      }
      particles.geometry.attributes.position.needsUpdate = true;
    }

    if (glowParticles) {
      const gpos = glowParticles.geometry.attributes.position.array;
      const gcount = gpos.length / 3;
      for (let i = 0; i < gcount; i++) {
        const i3 = i * 3;
        gpos[i3] += Math.sin(elapsed * 0.15 + i) * 0.003;
        gpos[i3 + 1] += Math.cos(elapsed * 0.12 + i * 0.5) * 0.003;
        gpos[i3 + 2] += Math.sin(elapsed * 0.1 + i * 0.3) * 0.002;
        if (gpos[i3] > 25) gpos[i3] = -25;
        if (gpos[i3] < -25) gpos[i3] = 25;
        if (gpos[i3 + 1] > 20) gpos[i3 + 1] = -20;
        if (gpos[i3 + 1] < -20) gpos[i3 + 1] = 20;
      }
      glowParticles.geometry.attributes.position.needsUpdate = true;
      glowParticles.material.opacity = 0.25 + Math.sin(elapsed * 0.4) * 0.12;
    }

    updateConnectionLines(elapsed);

    // Animate glass panels
    for (var gi = 0; gi < glassPanels.length; gi++) {
      var panel = glassPanels[gi];
      if (panel.isMesh) {
        panel.material.opacity = 0.02 + Math.sin(elapsed * 0.15 + gi) * 0.015;
      } else if (panel.isLineSegments) {
        panel.material.opacity = 0.04 + Math.sin(elapsed * 0.2 + gi * 1.5) * 0.03;
      }
    }

    if (heroLogo) {
      heroLogo.rotation.x += 0.002;
      heroLogo.rotation.y += 0.01;
      heroLogo.rotation.z += 0.001;
      var heroBob = Math.sin(elapsed * 0.3) * 0.1;
      heroLogo.position.y = heroBob;
      if (heroLogoMesh && heroLogoMesh.material) {
        var pulse = 0.2 + Math.sin(elapsed * 0.6) * 0.15;
        heroLogoMesh.material.emissiveIntensity = pulse;
        heroLogoMesh.material.opacity = 0.85 + Math.sin(elapsed * 0.4) * 0.1;
      }
      if (heroOrbitParticles) {
        var pos = heroOrbitParticles.geometry.attributes.position.array;
        var data = heroOrbitParticles.userData.particleData;
        for (var i = 0; i < data.length; i++) {
          var d = data[i];
          var t = d.theta + elapsed * d.speed;
          var p = d.phi + elapsed * d.speed * 0.3;
          var r = d.radius + Math.sin(elapsed * 0.25 + d.phase) * 0.3;
          pos[i * 3] = r * Math.sin(p) * Math.cos(t);
          pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
          pos[i * 3 + 2] = r * Math.cos(p);
        }
        heroOrbitParticles.geometry.attributes.position.needsUpdate = true;
      }
    }

    // Dynamic bloom based on scroll
    targetBloomIntensity = 0.2 + Math.min(scrollY / 3000, 0.6);
    if (composer && composer.passes.length > 1) {
      var bloomPass = composer.passes[1];
      bloomPass.strength += (targetBloomIntensity - bloomPass.strength) * 0.02;
    }

    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
    animationId = requestAnimationFrame(animate);
  }

  function orbitYOffset(mesh, elapsed) {
    return Math.sin(elapsed * 0.2 + mesh.userData.orbitPhase) * 0.2;
  }

  function setupScrollReveal() {
    const style = document.createElement('style');
    style.textContent = `
      .scroll-reveal-3d {
        opacity: 0;
        transform: translateY(60px) rotateX(15deg) scale(0.9);
        transition: opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1),
                    transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
        perspective: 1000px;
      }
      .scroll-reveal-3d.revealed {
        opacity: 1;
        transform: translateY(0) rotateX(0) scale(1);
      }
      .scroll-reveal-3d.revealed-left {
        opacity: 1;
        transform: translateY(0) rotateX(0) scale(1);
      }
      .scroll-reveal-3d.revealed-right {
        opacity: 1;
        transform: translateY(0) rotateX(0) scale(1);
      }
      .scroll-reveal-3d[data-direction="left"] {
        transform: translateX(-80px) translateY(40px) rotateY(15deg) scale(0.9);
      }
      .scroll-reveal-3d[data-direction="right"] {
        transform: translateX(80px) translateY(40px) rotateY(-15deg) scale(0.9);
      }
      .scroll-reveal-3d[data-direction="scale"] {
        transform: translateY(40px) scale(0.5);
      }
      .reveal-3d-card {
        transition: all 0.6s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .reveal-3d-card:hover {
        transform: translateY(-8px) scale(1.02) rotateX(2deg);
        box-shadow: 0 20px 60px rgba(99,102,241,0.3);
      }
      [data-reveal] {
        position: relative;
        overflow: hidden;
      }
      [data-reveal]::after {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(99,102,241,0.15), transparent);
        transition: left 1.2s cubic-bezier(0.22, 1, 0.36, 1);
        pointer-events: none;
      }
      [data-reveal].revealed::after {
        left: 200%;
      }
      .cursor-dot {
        position: fixed;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #6366f1;
        pointer-events: none;
        z-index: 99999;
        transform: translate(-50%, -50%);
        transition: width 0.2s, height 0.2s, background 0.3s;
        mix-blend-mode: screen;
      }
      .cursor-dot.active {
        width: 20px;
        height: 20px;
        background: rgba(99,102,241,0.5);
      }
    `;
    document.head.appendChild(style);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const dir = entry.target.dataset.direction || 'up';
          const delay = parseInt(entry.target.dataset.delay) || 0;
          setTimeout(() => {
            entry.target.classList.add('revealed');
          }, delay);
          observer.unobserve(entry.target);

          if (entry.target.classList.contains('ai-feature-card') ||
              entry.target.classList.contains('service-card') ||
              entry.target.tagName === 'SECTION') {
            entry.target.style.transition = 'all 0.8s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.3s ease';
          }
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.scroll-reveal-3d').forEach((el) => observer.observe(el));

    const cardObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const cards = entry.target.querySelectorAll('.ai-feature-card, .service-card, .pricing-card, .stat-card');
          cards.forEach((card, i) => {
            setTimeout(() => {
              card.classList.add('visible');
            }, i * 100);
          });
          cardObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.ai-features-grid, .services-grid, .pricing-grid, .stats-grid, .works-grid')
      .forEach((el) => {
        if (el) cardObserver.observe(el);
      });
  }

  function initAnimationEngine() {
    const cursorDot = document.createElement('div');
    cursorDot.className = 'cursor-dot';
    document.body.appendChild(cursorDot);

    let cursorX = 0, cursorY = 0;

    document.addEventListener('mousemove', (e) => {
      cursorX = e.clientX;
      cursorY = e.clientY;
      cursorDot.style.left = cursorX + 'px';
      cursorDot.style.top = cursorY + 'px';

      document.querySelectorAll('[data-magnetic]').forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / rect.width;
        const dy = (e.clientY - cy) / rect.height;
        const strength = parseFloat(btn.dataset.magnetic) || 10;
        btn.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
      });

      document.querySelectorAll('[data-tilt]').forEach((card) => {
        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / rect.width;
        const dy = (e.clientY - cy) / rect.height;
        const maxTilt = parseFloat(card.dataset.tilt) || 8;
        card.style.transform = `perspective(800px) rotateY(${dx * maxTilt}deg) rotateX(${-dy * maxTilt}deg)`;
      });
    });

    document.addEventListener('mouseleave', () => {
      cursorDot.style.opacity = '0';
    });

    document.addEventListener('mouseenter', () => {
      cursorDot.style.opacity = '1';
    });

    document.querySelectorAll('a, button, [data-magnetic]').forEach((el) => {
      el.addEventListener('mouseenter', () => cursorDot.classList.add('active'));
      el.addEventListener('mouseleave', () => cursorDot.classList.remove('active'));
    });

    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('[data-reveal]').forEach((el) => revealObserver.observe(el));

    const parallaxElements = [];
    document.querySelectorAll('[data-parallax]').forEach((el) => {
      const speed = parseFloat(el.dataset.parallax) || 0.3;
      parallaxElements.push({ el, speed, startY: 0 });
    });

    let rafId;
    function updateParallax() {
      const sy = window.scrollY;
      parallaxElements.forEach(({ el, speed }) => {
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const viewCenter = window.innerHeight / 2;
        const offset = (center - viewCenter) * speed * 0.1;
        el.style.transform = `translateY(${offset}px)`;
      });
      rafId = requestAnimationFrame(updateParallax);
    }
    if (parallaxElements.length > 0) updateParallax();

    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.dataset.target) || parseInt(el.textContent.replace(/[^0-9]/g, '')) || 100;
          const suffix = el.dataset.suffix || '';
          const duration = parseInt(el.dataset.duration) || 1500;
          const startTime = performance.now();

          function updateCounter() {
            const now = performance.now();
            const progress = Math.min((now - startTime) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(ease * target);
            el.textContent = current + suffix;
            if (progress < 1) requestAnimationFrame(updateCounter);
            else el.textContent = target + suffix;
          }
          updateCounter();
          counterObserver.unobserve(el);
        }
      });
    }, { threshold: 0.3 });

    document.querySelectorAll('[data-counter]').forEach((el) => {
      const text = el.textContent;
      const numMatch = text.match(/[0-9,]+/);
      if (numMatch) {
        el.dataset.target = numMatch[0].replace(/,/g, '');
      }
      counterObserver.observe(el);
    });

    const staggerObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const children = entry.target.children;
          const delay = parseFloat(entry.target.dataset.stagger) || 0.08;
          Array.from(children).forEach((child, i) => {
            setTimeout(() => {
              child.classList.add('revealed');
              child.style.opacity = '1';
              child.style.transform = 'translateY(0)';
            }, i * delay * 1000);
          });
          staggerObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('[data-stagger]').forEach((el) => {
      Array.from(el.children).forEach((child) => {
        child.style.opacity = '0';
        child.style.transform = 'translateY(20px)';
        child.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      });
      staggerObserver.observe(el);
    });

    document.querySelectorAll('[data-scramble], [data-scramble-text]').forEach((el) => {
      const text = el.textContent;
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            window.scrambleText(el, text);
            observer.unobserve(el);
          }
        });
      }, { threshold: 0.3 });
      observer.observe(el);
    });
  }

  window.scrambleText = function(element, finalText) {
    if (!element) return;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+{}[]|:;<>,.?/~`';
    const length = finalText.length;
    const duration = 1200;
    const startTime = performance.now();
    const interval = 50;

    function doScramble() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const visibleCount = Math.floor(progress * length);
      let result = '';
      for (let i = 0; i < length; i++) {
        if (i < visibleCount) {
          result += finalText[i];
        } else {
          result += chars[Math.floor(Math.random() * chars.length)];
        }
      }
      element.textContent = result;
      if (progress < 1) {
        setTimeout(doScramble, interval);
      } else {
        element.textContent = finalText;
      }
    }
    doScramble();
  };

  Object.assign(window, {
    initScene: init,
    animateScene: animate,
    scrambleText: window.scrambleText
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('load', () => {
    document.querySelectorAll('.scroll-reveal-3d').forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) {
        el.classList.add('revealed');
      }
    });
  });
})();
