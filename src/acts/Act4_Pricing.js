import * as THREE from 'three';

export class PricingPanels {
  constructor(scene, envMap) {
    this.scene = scene;
    this.envMap = envMap;
    this.panels = [];
    this.createPanels();
  }

  createPanels() {
    const tiers = [
      {
        id: 'build',
        name: 'Build',
        price: '$1,299',
        period: '/project',
        features: ['1 AI Build Sprint', 'Full-Stack App', 'Deploy to Cloud', '30 Days Support', 'Source Code Delivery'],
        cta: 'Start Build',
        href: '/checkout.html?plan=build',
        color: 0x8b5cf6,
        position: [-4.5, 0, -4]
      },
      {
        id: 'studio',
        name: 'Studio',
        price: '$2,899',
        period: '/project',
        features: ['3 AI Build Sprints', 'Full-Stack + 3D/Game', 'Custom Integrations', '90 Days Support', 'Priority Queue', 'Architecture Review'],
        cta: 'Start Studio',
        href: '/checkout.html?plan=studio',
        color: 0x22d3ee,
        position: [0, 0, -4],
        popular: true
      },
      {
        id: 'unlimited',
        name: 'Unlimited',
        price: '$4,999',
        period: '/month',
        features: ['Unlimited AI Builds', 'All Flagship Services', 'Dedicated Agent Pod', '24/7 Support', 'Custom SLA', 'Co-Development'],
        cta: 'Contact Sales',
        href: '/checkout.html?plan=unlimited',
        color: 0xf472b6,
        position: [4.5, 0, -4]
      }
    ];

    tiers.forEach((tier, i) => {
      const group = new THREE.Group();
      group.position.set(...tier.position);
      group.userData = { ...tier, index: i };

      // Panel glass
      const panelGeom = new THREE.PlaneGeometry(2.8, 4.2);
      const panelMat = new THREE.MeshPhysicalMaterial({
        color: tier.color,
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.9,
        thickness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0,
        ior: 1.5,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        envMap: this.envMap
      });
      const panel = new THREE.Mesh(panelGeom, panelMat);
      panel.rotation.y = Math.PI;
      group.add(panel);

      // Panel frame
      const frameGeom = new THREE.PlaneGeometry(2.9, 4.3);
      const frameMat = new THREE.MeshBasicMaterial({
        color: tier.color,
        transparent: true,
        opacity: tier.popular ? 0.6 : 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const frame = new THREE.Mesh(frameGeom, frameMat);
      frame.rotation.y = Math.PI;
      frame.position.z = -0.02;
      group.add(frame);

      // Content plane (for CSS overlay positioning)
      const contentGeom = new THREE.PlaneGeometry(2.6, 4.0);
      const contentMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const content = new THREE.Mesh(contentGeom, contentMat);
      content.rotation.y = Math.PI;
      content.position.z = 0.05;
      content.userData = { tier, isContent: true };
      group.add(content);

      // Glow
      const glowGeom = new THREE.PlaneGeometry(3.2, 4.6);
      const glowMat = new THREE.MeshBasicMaterial({
        color: tier.color,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const glow = new THREE.Mesh(glowGeom, glowMat);
      glow.rotation.y = Math.PI;
      glow.position.z = -0.05;
      group.add(glow);

      this.scene.add(group);
      this.panels.push(group);
    });

    // Create CSS overlay for panel content
    this.createCSSOverlays();
  }

  createCSSOverlays() {
    const overlayContainer = document.createElement('div');
    overlayContainer.id = 'pricing-overlays';
    overlayContainer.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 20;
    `;
    document.body.appendChild(overlayContainer);
    this.overlayContainer = overlayContainer;

    this.panels.forEach((group, i) => {
      const tier = group.userData;
      const overlay = document.createElement('div');
      overlay.className = 'pricing-panel-overlay';
      if (tier.popular) overlay.classList.add('popular');
      overlay.style.cssText = `
        position: absolute; pointer-events: auto;
        transform: translate(-50%, -50%);
        opacity: 0; transition: opacity 0.3s;
      `;

      overlay.innerHTML = `
        ${tier.popular ? `<span class="pp-badge">Most popular</span>` : ''}
        <h3 class="pp-name">${tier.name}</h3>
        <div class="pp-price">${tier.price}<span class="pp-period">${tier.period}</span></div>
        <ul class="pp-features">
          ${tier.features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <a href="${tier.href}" class="btn pp-cta ${tier.popular ? 'btn-primary' : 'btn-ghost'}">${tier.cta}</a>
      `;

      this.overlayContainer.appendChild(overlay);
      group.userData.overlay = overlay;
    });
  }

  hexToCss(hex) {
    return '#' + hex.toString(16).padStart(6, '0');
  }

  update(time, dt, scrollProgress) {
    // Act 5 range: 0.86 - 1.0
    const actProgress = THREE.MathUtils.clamp((scrollProgress - 0.86) / 0.14, 0, 1);

    this.panels.forEach((group, i) => {
      const tier = group.userData;
      const panel = group.children[0];
      const frame = group.children[1];
      const glow = group.children[3];
      const overlay = tier.overlay;

      // Entrance
      if (actProgress < 1) {
        const eased = 1 - Math.pow(1 - actProgress, 3);
        group.scale.setScalar(eased);
        panel.material.opacity = 0.3 * eased;
        frame.material.opacity = (tier.popular ? 0.6 : 0.3) * eased;
        glow.material.opacity = 0.08 * eased;
        if (overlay) overlay.style.opacity = eased;
      }

      if (actProgress > 0.2) {
        // Float animation
        group.position.y += Math.sin(time * 0.7 + i) * 0.003;
        group.rotation.y = Math.sin(time * 0.2 + i) * 0.05;

        // Glow pulse
        glow.material.opacity = 0.08 + 0.04 * Math.sin(time * 1.5 + i);
        glow.scale.setScalar(1 + 0.05 * Math.sin(time * 1.2 + i));

        // Popular panel highlight
        if (tier.popular) {
          frame.material.opacity = 0.6 + 0.2 * Math.sin(time * 2);
          panel.material.emissiveIntensity = 0.2 + 0.1 * Math.sin(time * 2);
        }

        // Update CSS overlay position (project 3D to 2D)
        if (overlay && this.camera && this.renderer) {
          const vector = new THREE.Vector3();
          vector.setFromMatrixPosition(group.children[2].matrixWorld);
          vector.project(this.camera);
          const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
          const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
          overlay.style.left = x + 'px';
          overlay.style.top = y + 'px';
        }
      }
    });
  }

  setCameraAndRenderer(camera, renderer) {
    this.camera = camera;
    this.renderer = renderer;
  }

  onResize(w, h) {}
}