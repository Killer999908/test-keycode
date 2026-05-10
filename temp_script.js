    let currentStep = 1;
    let selectedService = null;
    let selectedDomain = null;
    let projectData = {};

    function openBuilder() {
      document.getElementById('builderModal').classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeBuilder() {
      document.getElementById('builderModal').classList.remove('active');
      document.body.style.overflow = '';
    }

    function nextStep(step) {
      document.querySelectorAll('.builder-step').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.builder-section').forEach(s => s.classList.remove('active'));
      
      document.querySelector(`.builder-step[data-step="${step}"]`).classList.add('active');
      document.querySelector(`.builder-section[data-step="${step}"]`).classList.add('active');
      
      if (step === 2 && document.getElementById('livePreviewContent').innerHTML) {
        document.getElementById('step2Preview').innerHTML = document.getElementById('livePreviewContent').innerHTML;
      }
      
      currentStep = step;
    }

    function quickPromptBuilder(text) {
      document.getElementById('aiBuilderInput').value = text;
      sendToAI();
    }

    async function sendToAI() {
      const input = document.getElementById('aiBuilderInput');
      const container = document.getElementById('aiBuilderMessages');
      if (!input || !container) return;
      
      const message = input.value.trim();
      if (!message) return;
      
      projectData.description = message;
      
      addBuilderMessage(message, 'user');
      input.value = '';
      
      const typingId = addBuilderMessage('<i class="fas fa-spinner fa-spin"></i> OpenCode AI is generating your real website...', 'bot');
      
      try {
        // Use OpenCode AI to generate real website
        const response = await fetch('/api/ai/generate-website', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: message })
        });
        
        const result = await response.json();
        projectData = { ...projectData, ...result };
        
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();
        
        if (result.success) {
          addBuilderMessage(`<strong>OpenCode AI</strong> has generated your real website! Click Continue to see exactly how it will look deployed!`, 'bot');
          document.getElementById('previewBadge').innerHTML = '<i class="fas fa-check"></i> Live Preview Ready!';
          document.getElementById('previewBadge').style.background = 'var(--success)';
        } else {
          throw new Error('Generation failed');
        }
        
        generatePreviewHTML(result, message);
        
      } catch (error) {
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();
        addBuilderMessage("Great! I've got your idea. Click Continue to see the preview!", 'bot');
        generatePreviewHTML({ type: 'Website', style: 'Modern' }, message);
      }
    }

    function addBuilderMessage(text, sender) {
      const container = document.getElementById('aiBuilderMessages');
      const div = document.createElement('div');
      div.className = 'ai-builder-message ' + sender;
      div.id = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      div.innerHTML = '<div class="ai-builder-avatar"><i class="fas fa-' + (sender === 'bot' ? 'robot' : 'user') + '"></i></div><div class="ai-builder-text">' + text + '</div>';
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
      return div.id;
    }

    function generatePreviewHTML(data, description) {
      const preview = document.getElementById('livePreviewContent');
      
      // If we have actual generated code, display in iframe
      if (data.code) {
        preview.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width: 100%; height: 100%; border: none; border-radius: 10px; background: white;';
        iframe.srcdoc = data.code;
        preview.appendChild(iframe);
        return;
      }
      
      // Fallback
      const colors = ['#6366f1', '#ec4899', '#22d3ee', '#10b981'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      
      preview.innerHTML = '<div style="background: linear-gradient(135deg, ' + randomColor + '22 0%, ' + randomColor + '11 100%); height: 100%; border-radius: 10px; padding: 30px;"><div style="background: white; border-radius: 8px; padding: 15px; margin-bottom: 20px; display: flex; gap: 8px;"><span style="width: 12px; height: 12px; border-radius: 50%; background: #ff5f56;"></span><span style="width: 12px; height: 12px; border-radius: 50%; background: #ffbd2e;"></span><span style="width: 12px; height: 12px; border-radius: 50%; background: #27ca40;"></span></div><h2 style="color: #333; margin-bottom: 10px;">' + (data.type || 'My Website') + '</h2><p style="color: #666; font-size: 14px;">' + description.substring(0, 100) + '...</p><div style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap;"><span style="background: ' + randomColor + '; color: white; padding: 5px 12px; border-radius: 5px; font-size: 12px;">' + (data.style || 'Modern') + '</span><span style="background: #eee; color: #333; padding: 5px 12px; border-radius: 5px; font-size: 12px;">Responsive</span><span style="background: #eee; color: #333; padding: 5px 12px; border-radius: 5px; font-size: 12px;">SEO Ready</span></div></div>';
    }

    async function checkDomain() {
      const domain = document.getElementById('domainInput').value.trim();
      if (!domain) return;
      
      const resultDiv = document.getElementById('domainResult');
      resultDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Checking availability...</p>';
      
      try {
        const response = await fetch('/api/domains/check?domain=' + encodeURIComponent(domain));
        const result = await response.json();
        
        if (result.available) {
          selectedDomain = domain;
          resultDiv.innerHTML = '<div class="domain-result available"><i class="fas fa-check-circle"></i> ' + domain + ' is available! - $12/year</div>';
          document.getElementById('cartDomain').innerHTML = '<span>' + domain + '</span><span>$12/year</span>';
        } else {
          resultDiv.innerHTML = '<div class="domain-result unavailable"><i class="fas fa-times-circle"></i> ' + domain + ' is not available. Try a different name.</div>';
        }
        updateCart();
      } catch (error) {
        resultDiv.innerHTML = '<div class="domain-result"><p>Could not check domain. Please try again.</p></div>';
      }
    }

    function selectService(element, plan) {
      document.querySelectorAll('.service-option').forEach(function(o) { o.classList.remove('selected'); });
      element.classList.add('selected');
      
      var prices = { starter: 5, professional: 15, enterprise: 35 };
      selectedService = { plan: plan, price: prices[plan] };
      
      document.getElementById('cartHosting').innerHTML = '<span>' + plan.charAt(0).toUpperCase() + plan.slice(1) + ' Hosting</span><span>$' + prices[plan] + '/mo</span>';
      updateCart();
    }

    function updateCart() {
      var total = 299;
      if (selectedDomain) total += 12;
      if (selectedService) total += selectedService.price;
      document.getElementById('cartTotal').textContent = '$' + total;
    }

    async function completeOrder() {
      var name = document.getElementById('checkoutName').value;
      var email = document.getElementById('checkoutEmail').value;
      
      if (!name || !email) {
        alert('Please fill in all fields');
        return;
      }
      
      // Calculate total
      var total = 299;
      if (selectedDomain) total += 12;
      if (selectedService) total += selectedService.price;
      
      // Send order to server
      try {
        const res = await fetch('/api/website-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: name,
            customerEmail: email,
            project: projectData,
            hosting: selectedService,
            domains: selectedDomain ? [selectedDomain] : [],
            total: total,
            paymentMethod: 'card'
          })
        });
        const data = await res.json();
        
        if (data.success) {
          alert('Thank you! Your order has been placed.\n\nOrder: ' + data.order.orderNumber + '\nTotal: $' + total + '\n\nWe will contact you shortly!');
        } else {
          alert('Thank you! Your order has been placed. We will contact you shortly!');
        }
      } catch (err) {
        alert('Thank you! Your order has been placed. We will contact you shortly!');
      }
      
      closeBuilder();
    }

    // Sound Toggle
    const video = document.getElementById('video-bg');
    const soundBtn = document.getElementById('sound-toggle');
    const canvas = document.getElementById('video-canvas');
    
    soundBtn.classList.add('muted');
    video.muted = true;
    
    // Force play video with error handling
    const playVideo = () => {
      video.play().then(() => {
        canvas.style.display = 'none'; // Hide canvas when video plays
      }).catch(err => {
        console.log('Video auto-play blocked, showing animated background');
        canvas.style.display = 'block';
      });
    };
    
    // Try to play immediately and on user interaction
    playVideo();
    document.addEventListener('click', playVideo, { once: true });
    document.addEventListener('touchstart', playVideo, { once: true });
    
    soundBtn.addEventListener('click', function() {
      if (video.muted) {
        video.muted = false;
        video.play().catch(() => {});
        soundBtn.classList.remove('muted');
        canvas.style.display = 'none';
      } else {
        video.muted = true;
        soundBtn.classList.add('muted');
      }
    });

    // ================================================
    // WORLD-CLASS 3D EFFECTS
    // ================================================
    
    // 3D Parallax on Scroll
    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset;
      const parallaxElements = document.querySelectorAll('.parallax-three-d, #video-bg-container, #canvas-container');
      
      parallaxElements.forEach(el => {
        const speed = el.id === 'video-bg-container' ? 0.3 : 0.1;
        el.style.transform = `translateY(${scrolled * speed}px)`;
      });
    });
    
    // 3D Section Reveal
    const observer3d = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'perspective(1000px) rotateX(0) translateY(0) translateZ(0)';
        }
      });
    }, { threshold: 0.1 });
    
    document.querySelectorAll('.glass-three-d, .pricing-card-three-d, .feature-card').forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'perspective(1000px) rotateX(10deg) translateY(50px) translateZ(-50px)';
      el.style.transition = 'all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      observer3d.observe(el);
    });
    
    // 3D Nav Links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('mouseenter', () => {
        link.style.transform = 'translateY(-3px) translateZ(10px)';
      });
      link.addEventListener('mouseleave', () => {
        link.style.transform = 'translateY(0) translateZ(0)';
      });
    });

    // Initialize 3D elements
    document.querySelectorAll('.hero-content, .hero-title, .hero-subtitle').forEach(el => {
      el.classList.add('hero-three-d');
    });

    // 3D Button Hover Effects
    document.querySelectorAll('.btn, .three-d-btn, button').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'translateY(-4px) translateZ(10px)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translateY(0) translateZ(0)';
      });
    });

    // Disable Service Worker on deployment (no sw.js on GitHub Pages)
    console.log('Platform:', window.location.hostname);
    
    // Handle PWA install prompt
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
    });
  
