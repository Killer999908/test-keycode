    // ============================================
    // ADVANCED 3D BACKGROUND
    // ============================================
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Create enhanced particles with multiple colors
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 3000;
    const posArray = new Float32Array(particlesCount * 3);
    const colorsArray = new Float32Array(particlesCount * 3);
    
    const colors = [
      new THREE.Color(0x6366f1), // Indigo
      new THREE.Color(0x8b5cf6), // Purple
      new THREE.Color(0xec4899), // Pink
      new THREE.Color(0x22d3ee), // Cyan
      new THREE.Color(0xffffff)  // White
    ];
    
    for(let i = 0; i < particlesCount * 3; i += 3) {
      posArray[i] = (Math.random() - 0.5) * 8;
      posArray[i+1] = (Math.random() - 0.5) * 8;
      posArray[i+2] = (Math.random() - 0.5) * 8;
      
      const color = colors[Math.floor(Math.random() * colors.length)];
      colorsArray[i] = color.r;
      colorsArray[i+1] = color.g;
      colorsArray[i+2] = color.b;
    }
    
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colorsArray, 3));
    
    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.015,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true
    });
    
    const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particlesMesh);

    // Create connection lines between nearby particles
    const lineGeometry = new THREE.BufferGeometry();
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.15
    });
    const linesMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(linesMesh);

    // Create floating animated geometry
    const geometries = [];
    for (let i = 0; i < 20; i++) {
      let geometry;
      const shapeType = Math.floor(Math.random() * 3);
      if (shapeType === 0) {
        geometry = new THREE.IcosahedronGeometry(Math.random() * 0.15 + 0.05, 0);
      } else if (shapeType === 1) {
        geometry = new THREE.OctahedronGeometry(Math.random() * 0.15 + 0.05, 0);
      } else {
        geometry = new THREE.TetrahedronGeometry(Math.random() * 0.15 + 0.05, 0);
      }
      
      const material = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * 3)].getHex(),
        transparent: true,
        opacity: 0.4,
        wireframe: true
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 4
      );
      mesh.userData = {
        rotationSpeed: {
          x: (Math.random() - 0.5) * 0.01,
          y: (Math.random() - 0.5) * 0.01,
          z: (Math.random() - 0.5) * 0.01
        },
        floatSpeed: {
          x: (Math.random() - 0.5) * 0.003,
          y: (Math.random() - 0.5) * 0.003,
          z: (Math.random() - 0.5) * 0.003
        },
        originalPos: mesh.position.clone()
      };
      geometries.push(mesh);
      scene.add(mesh);
    }

    camera.position.z = 3;

    // Mouse interaction with smooth following
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;
    
    document.addEventListener('mousemove', (event) => {
      mouseX = (event.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    });

    // Generate connection lines
    function updateConnections() {
      const positions = particlesGeometry.attributes.position.array;
      const linePositions = [];
      const maxDistance = 0.5;
      const maxConnections = 50;
      
      for (let i = 0; i < particlesCount && linePositions.length < maxConnections * 6; i++) {
        for (let j = i + 1; j < particlesCount; j++) {
          const dx = positions[i*3] - positions[j*3];
          const dy = positions[i*3+1] - positions[j*3+1];
          const dz = positions[i*3+2] - positions[j*3+2];
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
          
          if (dist < maxDistance) {
            linePositions.push(positions[i*3], positions[i*3+1], positions[i*3+2]);
            linePositions.push(positions[j*3], positions[j*3+1], positions[j*3+2]);
          }
        }
      }
      
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    }
    updateConnections();

    let time = 0;
    function animate() {
      requestAnimationFrame(animate);
      time += 0.001;
      
      // Smooth mouse following
      targetX += (mouseX * 0.5 - targetX) * 0.02;
      targetY += (mouseY * 0.5 - targetY) * 0.02;
      camera.position.x = targetX;
      camera.position.y = targetY;
      camera.lookAt(scene.position);
      
      // Rotate particles
      particlesMesh.rotation.y += 0.0003;
      particlesMesh.rotation.x += 0.0001;
      
      // Animate geometries
      geometries.forEach(mesh => {
        mesh.rotation.x += mesh.userData.rotationSpeed.x;
        mesh.rotation.y += mesh.userData.rotationSpeed.y;
        mesh.rotation.z += mesh.userData.rotationSpeed.z;
        
        // Floating motion
        mesh.position.x = mesh.userData.originalPos.x + Math.sin(time + mesh.position.y) * 0.3;
        mesh.position.y = mesh.userData.originalPos.y + Math.cos(time + mesh.position.x) * 0.3;
      });
      
      // Pulse effect on particles
      const scale = 1 + Math.sin(time * 2) * 0.1;
      particlesMesh.scale.set(scale, scale, scale);
      
      renderer.render(scene, camera);
    }
    
    animate();

    // Resize handler
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ============================================
    // NAVBAR SCROLL EFFECT
    // ============================================
    window.addEventListener('scroll', () => {
      const navbar = document.getElementById('navbar');
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });

    // ============================================
    // SMOOTH SCROLL
    // ============================================
    function scrollToSection(sectionId) {
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
      }
    }

    function toggleMobileMenu() {
      const navLinks = document.getElementById('navLinks');
      navLinks.classList.toggle('active');
    }

    // Close mobile menu when clicking outside
    document.addEventListener('click', function(e) {
      const navLinks = document.getElementById('navLinks');
      const menuBtn = document.querySelector('.mobile-menu-btn');
      if (navLinks && navLinks.classList.contains('active')) {
        if (!navLinks.contains(e.target) && !menuBtn.contains(e.target)) {
          navLinks.classList.remove('active');
        }
      }
    });

    // ============================================
    // AI BUILDER FUNCTIONALITY
    // ============================================
    let aiProjectData = {};
    let aiProjectDescription = '';

    function handleAIInput(event) {
      if (event.key === 'Enter') {
        sendAIMessage();
      }
    }

    function quickPrompt(text) {
      document.getElementById('aiInput').value = text;
      sendAIMessage();
    }

    async function sendAIMessage() {
      const input = document.getElementById('aiInput');
      const message = input.value.trim();
      if (!message) return;
      
      aiProjectDescription = message;
      
      // Add user message
      addAIMessage(message, 'user');
      input.value = '';
      
      // Show typing indicator
      const typingId = addAIMessage('<i class="fas fa-spinner fa-spin"></i> Generating your website with OpenCode AI...', 'bot');
      
      try {
        // Use OpenCode AI to generate real website
        const response = await fetch('/api/ai/generate-website', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: message })
        });
        
        const result = await response.json();
        aiProjectData = result;
        
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();
        
        if (result.success) {
          addAIMessage(`<strong>OpenCode AI</strong> has generated a real website for you! Check the preview on the right. This is exactly how your website will look!`, 'bot');
          generateLivePreview(result, message);
        } else {
          throw new Error('Generation failed');
        }
        
      } catch (error) {
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();
        addAIMessage("Great! I've got your idea. Generating your custom preview now!", 'bot');
        
        aiProjectData = {
          type: 'Website',
          style: 'Modern & Clean',
          name: message.split(' ').slice(0, 2).join(' ')
        };
        generateLivePreview(aiProjectData, message);
      }
    }

    function addAIMessage(content, sender) {
      const messagesContainer = document.getElementById('aiMessages');
      const messageDiv = document.createElement('div');
      messageDiv.className = `ai-message ${sender}`;
      messageDiv.id = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      messageDiv.innerHTML = `
        <div class="ai-avatar"><i class="fas fa-${sender === 'user' ? 'user' : 'robot'}"></i></div>
        <div class="ai-message-content">${content}</div>
      `;
      messagesContainer.appendChild(messageDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return messageDiv.id;
    }

    function generateLivePreview(data, description) {
      const previewFrame = document.getElementById('previewFrame');
      const previewUrl = document.getElementById('previewUrl');
      
      const projectName = data.name || data.description ? data.description.split(' ').slice(0, 2).join('-').toLowerCase().replace(/[^a-z0-9]/g, '') : description.split(' ').slice(0, 2).join('-').toLowerCase().replace(/[^a-z0-9]/g, '');
      previewUrl.textContent = projectName + '.keycode.studio';
      
      // If we have actual generated code from OpenCode AI, display it in an iframe
      if (data.code) {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width: 100%; height: 100%; border: none; border-radius: 10px; background: white;';
        iframe.srcdoc = data.code;
        iframe.id = 'websitePreviewIframe';
        
        previewFrame.innerHTML = '';
        previewFrame.appendChild(iframe);
        
        // Add a badge showing it's a real preview
        const badge = document.createElement('div');
        badge.style.cssText = 'position: absolute; top: 10px; right: 10px; background: #10b981; color: white; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; z-index: 10;';
        badge.innerHTML = '<i class="fas fa-check-circle"></i> Real Preview';
        previewFrame.style.position = 'relative';
        previewFrame.appendChild(badge);
        
        return;
      }
      
      // Fallback to simple preview if no code
      const features = [
        { icon: 'fa-check', title: 'Responsive', desc: 'All devices' },
        { icon: 'fa-bolt', title: 'Fast', desc: 'Optimized' },
        { icon: 'fa-shield-alt', title: 'Secure', desc: 'SSL Ready' },
        { icon: 'fa-chart-line', title: 'SEO', desc: 'Search ready' },
        { icon: 'fa-mobile-alt', title: 'Mobile', desc: 'First design' }
      ];
      
      if (description.toLowerCase().includes('shop') || description.toLowerCase().includes('store')) {
        features[1] = { icon: 'fa-shopping-cart', title: 'Cart', desc: 'E-commerce' };
        features[2] = { icon: 'fa-credit-card', title: 'Payments', desc: 'Secure' };
      } else if (description.toLowerCase().includes('restaurant')) {
        features[1] = { icon: 'fa-utensils', title: 'Menu', desc: 'Digital' };
        features[2] = { icon: 'fa-calendar', title: 'Booking', desc: 'Tables' };
      }
      
      previewFrame.innerHTML = `
        <div class="generated-site">
          <div class="generated-site-header">
            <div class="generated-site-logo">${projectName}</div>
            <div class="generated-site-nav">
              <span>Home</span><span>About</span><span>Services</span><span>Contact</span>
            </div>
          </div>
          <div class="generated-site-hero">
            <h1>${data.style || 'Modern'} ${data.type || 'Website'}</h1>
            <p>${description.slice(0, 80)}...</p>
            <span class="generated-site-cta">Get Started</span>
          </div>
          <div class="generated-site-features">
            ${features.map(f => `
              <div class="generated-feature">
                <i class="fas ${f.icon}"></i>
                <h4>${f.title}</h4>
                <p>${f.desc}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    function openAIBuilder() {
      openBuilder();
    }

    // ============================================
    // GSAP ANIMATIONS
    // ============================================
    gsap.registerPlugin(ScrollTrigger);
    
    // Animate sections on scroll
    document.querySelectorAll('.service-card, .pricing-card').forEach((el, i) => {
      gsap.fromTo(el, 
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          delay: i * 0.1,
          scrollTrigger: {
            trigger: el,
            start: 'top 80%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    });

    // Hero animations with staggered reveal
    gsap.from('.hero-badge', { 
      opacity: 0, 
      y: 20, 
      duration: 0.8, 
      delay: 0.2,
      ease: 'power3.out'
    });
    
    // Text reveal for hero heading
    const heroTitle = document.querySelector('.hero h1');
    if (heroTitle) {
      heroTitle.innerHTML = heroTitle.textContent.split(' ').map((word, i) => 
        `<span class="word" style="display:inline-block;margin-right:0.3em">${word.split('').map(char => `<span class="char" style="display:inline-block">${char}</span>`).join('')}</span>`
      ).join(' ');
      
      gsap.from('.hero h1 .char', {
        opacity: 0,
        y: 50,
        duration: 0.8,
        stagger: 0.02,
        delay: 0.4,
        ease: 'back.out(1.7)'
      });
    }
    
    gsap.from('.hero-subtitle', { 
      opacity: 0, 
      y: 20, 
      duration: 0.8, 
      delay: 1.2,
      ease: 'power3.out'
    });
    gsap.from('.hero-cta', { 
      opacity: 0, 
      y: 20, 
      duration: 0.8, 
      delay: 1.4,
      ease: 'power3.out'
    });
    gsap.from('.hero-stats', { 
      opacity: 0, 
      y: 20, 
      duration: 0.8, 
      delay: 1.6,
      ease: 'power3.out'
    });
    
    // Parallax on scroll
    gsap.utils.toArray('.hero-content').forEach(section => {
      gsap.to(section, {
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: 'bottom top',
          scrub: 1
        },
        y: 100,
        opacity: 0
      });
    });
    
    // Loading screen
    window.addEventListener('load', () => {
      gsap.to('#loaderScreen', {
        opacity: 0,
        duration: 0.5,
        delay: 1,
        onComplete: () => {
          document.getElementById('loaderScreen').classList.add('hidden');
        }
      });
    });
    
    // Counter animation
    gsap.utils.toArray('.stat-number').forEach(counter => {
      const target = parseInt(counter.textContent);
      if (!isNaN(target)) {
        gsap.fromTo(counter, 
          { textContent: 0 },
          {
            textContent: target,
            duration: 2,
            delay: 0.5,
            snap: { textContent: 1 },
            scrollTrigger: {
              trigger: counter,
              start: 'top 85%'
            }
          }
        );
      }
    });
    
    // Progress bar animations
    gsap.utils.toArray('.progress-bar-fill').forEach(bar => {
      gsap.to(bar, {
        scrollTrigger: {
          trigger: bar,
          start: 'top 85%'
        },
        scaleX: 1,
        duration: 1,
        ease: 'power2.out'
      });
    });
    
    // Staggered section animations
    gsap.utils.toArray('.section-header, .service-card, .pricing-card, .ai-message').forEach((el, i) => {
      gsap.fromTo(el,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          delay: i * 0.1,
          scrollTrigger: {
            trigger: el,
            start: 'top 85%'
          }
        }
      );
    });

    // ============================================
    // USER LOGIN & DASHBOARD
    // ============================================
    let authToken = localStorage.getItem('keycode_token');

    // ==================== USER LOGIN ====================
    function openUserLoginModal() {
      document.getElementById('userLoginModal').classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeUserLoginModal() {
      document.getElementById('userLoginModal').classList.remove('active');
      document.body.style.overflow = '';
    }

    async function handleUserLogin(e) {
      e.preventDefault();
      const email = document.getElementById('userLoginEmail').value;
      const password = document.getElementById('userLoginPassword').value;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (data.success) {
          authToken = data.token;
          localStorage.setItem('keycode_token', data.token);
          localStorage.setItem('keycode_user', JSON.stringify(data.user));
          localStorage.setItem('keycode_user_type', 'user');
          closeUserLoginModal();
          loadDashboard();
        } else {
          alert(data.error || 'Login failed');
        }
      } catch (err) {
        alert('Login error: ' + err.message);
      }
    }

    // ==================== ADMIN LOGIN ====================
    function openAdminLoginModal() {
      document.getElementById('adminLoginModal').classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeAdminLoginModal() {
      document.getElementById('adminLoginModal').classList.remove('active');
      document.body.style.overflow = '';
    }

    async function handleAdminLogin(e) {
      e.preventDefault();
      const adminCode = document.getElementById('adminCodeInput').value;
      
      if (!adminCode) {
        alert('Please enter your admin code');
        return;
      }
      
      try {
        const res = await fetch('/api/auth/admin-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminCode })
        });
        const data = await res.json();
        
        if (data.success) {
          authToken = data.token;
          localStorage.setItem('keycode_token', data.token);
          localStorage.setItem('keycode_user', JSON.stringify(data.user));
          localStorage.setItem('keycode_user_type', 'admin');
          closeAdminLoginModal();
          loadDashboard();
        } else {
          alert(data.error || 'Invalid admin code');
        }
      } catch (err) {
        alert('Login error: ' + err.message);
      }
    }

    // ==================== REGISTRATION ====================
    function switchToRegister() {
      closeUserLoginModal();
      document.getElementById('registerModal').classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeRegisterModal() {
      document.getElementById('registerModal').classList.remove('active');
      document.body.style.overflow = '';
    }

    async function handleRegister(e) {
      e.preventDefault();
      const name = document.getElementById('regName').value;
      const email = document.getElementById('regEmail').value;
      const phone = document.getElementById('regPhone').value;
      const password = document.getElementById('regPassword').value;

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, password })
        });
        const data = await res.json();
        
        if (data.success) {
          alert('Account created! Your Admin No: ' + data.user.adminNo + '\nAdmin Code: ' + data.user.adminCode + '\n\nSave these for your admin access!');
          authToken = data.token;
          localStorage.setItem('keycode_token', data.token);
          localStorage.setItem('keycode_user', JSON.stringify(data.user));
          localStorage.setItem('keycode_user_type', 'user');
          closeRegisterModal();
          loadDashboard();
        } else {
          alert(data.error || 'Registration failed');
        }
      } catch (err) {
        alert('Registration error: ' + err.message);
      }
    }

    // ==================== DASHBOARD ====================
    async function loadDashboard() {
      if (!authToken) {
        openUserLoginModal();
        return;
      }
      
      const userType = localStorage.getItem('keycode_user_type') || 'user';
      
      document.getElementById('dashboardModal').classList.add('active');
      document.body.style.overflow = 'hidden';
      
      try {
        const res = await fetch('/api/user/dashboard', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const data = await res.json();
        
        if (data.success) {
          const user = JSON.parse(localStorage.getItem('keycode_user') || '{}');
          document.getElementById('dashboardUserName').textContent = user.name || 'User';
          document.getElementById('dashboardUserEmail').textContent = user.email || '';
          
          document.getElementById('statOrders').textContent = data.stats.totalOrders;
          document.getElementById('statCompleted').textContent = data.stats.completedOrders;
          document.getElementById('statPending').textContent = data.stats.pendingOrders;
          document.getElementById('statRevenue').textContent = '$' + (data.stats.totalRevenue || 0);
          
          // Load orders
          const ordersHtml = data.orders.length > 0 
            ? data.orders.map(o => `<div style="padding: 15px; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between;"><span>Order #${o._id?.slice(-6) || 'N/A'}</span><span style="color: var(--primary);">$${o.total || 0}</span></div>`).join('')
            : '<p style="color: var(--ash); text-align: center;">No orders yet</p>';
          document.getElementById('recentOrders').innerHTML = ordersHtml;
          
          // Load website orders (projects)
          loadUserProjects();
          
          // Load profile for settings
          document.getElementById('profileName').value = user.name || '';
          document.getElementById('profilePhone').value = user.phone || '';
        }
      } catch (err) {
        console.error('Dashboard error:', err);
      }
      
      loadSalesData();
    }
    
    async function loadUserProjects() {
      if (!authToken) return;
      
      try {
        const res = await fetch('/api/user/website-orders', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const data = await res.json();
        
        if (data.success && data.orders.length > 0) {
          const projectsHtml = data.orders.map(order => {
            const statusColor = order.status === 'completed' ? 'var(--success)' : 
                              order.status === 'processing' ? 'var(--primary)' : 'var(--ash)';
            const deployed = order.deployment?.deployed;
            const liveUrl = order.deployment?.liveUrl || '#';
            
            return `
              <div style="padding: 20px; border-bottom: 1px solid var(--glass-border);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                  <h4 style="margin: 0;">${order.project?.name || 'Website Project'}</h4>
                  <span style="background: ${statusColor}; padding: 4px 12px; border-radius: 20px; font-size: 12px;">${order.status}</span>
                </div>
                <p style="color: var(--ash); font-size: 14px; margin-bottom: 10px;">Order: ${order.orderNumber}</p>
                ${deployed ? `
                  <div style="margin-top: 15px;">
                    <a href="${liveUrl}" target="_blank" style="color: var(--primary); margin-right: 15px;">
                      <i class="fas fa-external-link-alt"></i> View Live Website
                    </a>
                  </div>
                ` : `
                  <p style="color: var(--ash); font-size: 13px; margin-top: 10px;">
                    <i class="fas fa-clock"></i> Deployment in progress...
                  </p>
                `}
              </div>
            `;
          }).join('');
          document.getElementById('userProjects').innerHTML = projectsHtml;
        } else {
          document.getElementById('userProjects').innerHTML = '<p style="color: var(--ash); text-align: center;">No projects yet. Build your first website!</p>';
        }
      } catch (err) {
        console.error('Load projects error:', err);
        document.getElementById('userProjects').innerHTML = '<p style="color: var(--ash); text-align: center;">Could not load projects</p>';
      }
    }

    async function loadSalesData() {
      if (!authToken) return;
      
      try {
        const res = await fetch('/api/user/sales?period=30', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const data = await res.json();
        
        if (data.success) {
          document.getElementById('salesTotal').textContent = '$' + (data.totalSales || 0);
          document.getElementById('salesCount').textContent = data.orderCount || 0;
          document.getElementById('salesAvg').textContent = '$' + (data.avgOrderValue || 0).toFixed(2);
          
          // Simple bar chart
          const chartContainer = document.getElementById('salesChart');
          const dailyData = Object.entries(data.dailySales || {}).slice(-10);
          
          if (dailyData.length > 0) {
            chartContainer.innerHTML = dailyData.map(([date, amount]) => {
              const height = Math.max(20, Math.min(180, amount * 2));
              return `<div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px;">
                <div style="width: 100%; background: var(--gradient-1); border-radius: 4px; height: ${height}px;"></div>
                <span style="font-size: 10px; color: var(--ash);">${date.slice(5)}</span>
              </div>`;
            }).join('');
          }
        }
      } catch (err) {
        console.error('Sales error:', err);
      }
    }

    function showDashboardSection(section) {
      document.querySelectorAll('.dash-section').forEach(el => el.style.display = 'none');
      document.getElementById('dash' + section.charAt(0).toUpperCase() + section.slice(1)).style.display = 'block';
    }

    async function updateProfile(e) {
      e.preventDefault();
      if (!authToken) return;
      
      const name = document.getElementById('profileName').value;
      const phone = document.getElementById('profilePhone').value;
      const adminNo = document.getElementById('profileAdminNo').value;

      try {
        const res = await fetch('/api/user/profile', {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({ name, phone, adminNo })
        });
        const data = await res.json();
        
        if (data.success) {
          alert('Profile updated successfully!');
          localStorage.setItem('keycode_user', JSON.stringify(data.user));
        } else {
          alert(data.error || 'Update failed');
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    function logout() {
      authToken = null;
      localStorage.removeItem('keycode_token');
      localStorage.removeItem('keycode_user');
      closeDashboard();
    }

    function closeDashboard() {
      document.getElementById('dashboardModal').classList.remove('active');
      document.body.style.overflow = '';
    }

    // Check if user is logged in on page load
    if (authToken) {
      loadDashboard();
    }
  
