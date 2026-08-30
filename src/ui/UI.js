import { CONTENT, SECTION_WINDOWS, ACT_STARTS, sectionOpacity, smoothstep, clamp01 } from './Content.js';

export class UI {
  constructor(experience) {
    this.experience = experience;
    this.element = this.createElement();
    this.bindEvents();
  }

  createElement() {
    const container = document.createElement('div');
    container.id = 'ui';
    container.innerHTML = `
      <div class="progress"><span></span></div>

      <div class="loader">
        <div class="loader-inner">
          <div class="loader-wordmark">KEYCODE</div>
          <div class="loader-sub">ALCHE GRADE · WORLD CLASS</div>
          <div class="loader-bar"><span></span></div>
          <div class="loader-pct">00%</div>
          <div class="loader-text">Crafting 3D world…</div>
          <div class="loader-sound-choice" id="loader-sound-choice" style="display:none">
            <p>This site contains sound. Enable?</p>
            <button class="btn btn-primary magnetic" id="loader-sound-on">Sound On</button>
            <button class="btn btn-ghost magnetic" id="loader-sound-off">Continue without sound</button>
          </div>
        </div>
      </div>

      <nav class="nav">
        <a class="nav-logo" href="/">
          <svg class="logo-mark" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="10" fill="#ffffff"/>
            <path d="M10 18h6l4-10 6 20 4-10h6" stroke="#0a0a0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
          <span class="logo-word">KEYCODE</span>
        </a>
        <div class="nav-mid">
          <a href="/gallery.html">Works</a>
          <a href="/tools.html">Services</a>
          <a href="/pricing.html">Pricing</a>
          <a href="/ai-builder.html" style="color:var(--ink)">Forge</a>
        </div>
        <div class="nav-right">
          <button class="sound-btn" id="sound-btn" aria-label="Toggle sound">
            <svg class="ico-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8 8 0 0 1 0 12"/></svg>
            <svg class="ico-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><line x1="15" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="15" y2="15"/></svg>
          </button>
          <a class="nav-link" href="/login.html" data-auth="login">Login</a>
          <a class="btn btn-primary magnetic" href="/register.html" data-auth="signup">Start Building</a>
          <button class="btn" id="menu-btn" aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
      </nav>

       <div class="content">
        <!-- HERO — LIVE AI FORGE (ONE & ONLY) -->
        <section class="ovl ovl-hero" data-act="0">
          <div class="forge-layout">
            <div class="forge-left">
              <p class="eyebrow"><span>${CONTENT.hero.eyebrow}</span> <span class="forge-badge">● LIVE FORGE</span></p>
              <h1 class="h-display">${CONTENT.hero.title}</h1>
              <p class="sub">${CONTENT.hero.sub}</p>
              <div class="forge-prompt glass">
                <div class="forge-prompt-head"><span>✦ AI FORGE — describe anything</span><span class="forge-live-dot"></span></div>
                <textarea id="forge-input" placeholder="e.g. A Fortnite-style island with neon city, drift racing, power-ups — or a luxury e-commerce for watches"></textarea>
                <div class="forge-prompt-actions">
                  <button class="btn btn-primary magnetic" id="forge-build">Forge with 6 Agents →</button>
                  <button class="btn btn-ghost" id="forge-random">Random prompt</button>
                </div>
                <div class="forge-agents" id="forge-agents">
                  <span class="forge-agent active" data-agent="Core">Core</span>
                  <span class="forge-agent" data-agent="Builder">Builder</span>
                  <span class="forge-agent" data-agent="Designer">Designer</span>
                  <span class="forge-agent" data-agent="QA">QA</span>
                  <span class="forge-agent" data-agent="Scout">Scout</span>
                  <span class="forge-agent" data-agent="Sweeper">Sweeper</span>
                </div>
                <div class="forge-code" id="forge-code"><span class="forge-code-hint">Agents idle — waiting for prompt…</span></div>
              </div>
              <div class="cta-row" style="margin-top:1.2rem">
                <a class="btn btn-primary magnetic" href="${CONTENT.hero.primary.href}" data-auth="cta">${CONTENT.hero.primary.label} <span class="arrow">→</span></a>
                <a class="btn btn-ghost magnetic" href="#" data-scroll="${CONTENT.hero.secondary.scroll}">${CONTENT.hero.secondary.label}</a>
              </div>
              <div class="live-ind"><span class="dot"></span><span class="live-text">${CONTENT.hero.live}</span></div>
            </div>
            <div class="forge-right glass-strong" id="forge-preview-wrap">
              <div class="forge-preview-head">Live Preview <span id="forge-status">idle</span></div>
              <iframe id="forge-preview" sandbox="allow-scripts allow-same-origin"></iframe>
              <div class="forge-preview-actions">
                <a class="btn btn-ghost" href="/ai-builder.html" target="_blank">Open full Forge</a>
                <button class="btn btn-primary" id="forge-deploy">Deploy</button>
              </div>
            </div>
          </div>
          <div class="scroll-hint"><span>Scroll to explore — drag 3D to orbit</span><div class="mouse"></div></div>
        </section>

        ${CONTENT.acts.map((act, i) => {
          const side = i === 0 ? ' act-flagships' : i === 1 ? ' center' : ' center';
          const list = act.list ? `
            <ul class="ed-list">
              ${act.list.map(item => `<li><span class="idx">${item.idx}</span><span class="nm">${item.name}</span><span class="ds">${item.desc}</span></li>`).join('')}
            </ul>` : '';
          const flagships = act.flagships ? `
            <div class="flagship-grid">
              ${act.flagships.map((f, i) => `
              <a class="flagship-card panel3d magnetic" href="${f.href}">
                <span class="fc-idx">0${i + 1}</span>
                <span class="fc-cat">${f.cat}</span>
                <span class="fc-name">${f.name}</span>
                <span class="fc-tag">${f.tag}</span>
                <span class="fc-cta">Explore</span>
              </a>`).join('')}
            </div>` : '';
          const pricing = act.pricing ? `
            <div class="pricing-grid">
              ${act.pricing.map((p) => `
              <div class="pricing-card${p.popular ? ' popular' : ''}">
                ${p.popular ? '<span class="fc-idx">MOST POPULAR</span>' : ''}
                <span class="pc-cat">${p.cta}</span>
                <span class="pc-price">${p.price}<span class="pc-period">${p.period}</span></span>
                <ul class="pc-features">
                  ${p.features.map(f => `<li>${f}</li>`).join('')}
                </ul>
                <a class="btn ${p.popular ? 'btn-primary' : 'btn-ghost'} pc-cta" href="${p.href}">${p.cta}</a>
              </div>`).join('')}
            </div>` : '';
          const ctaLinks = act.ctaLinks ? `
            <div class="cta-links-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:1.5rem">
              ${act.ctaLinks.map(l=>`<a class="glass" href="${l.href}" style="padding:16px;border-radius:12px;text-decoration:none;display:flex;flex-direction:column;gap:4px"><span style="font-weight:600;color:var(--ink)">${l.label}</span><small style="color:var(--ink-dim);font-size:12px">${l.desc}</small></a>`).join('')}
            </div>` : '';
          const worksLink = act.worksLink ? `<div style="margin-top:1.2rem"><a class="btn btn-ghost" href="${act.worksLink}">View all works →</a></div>` : '';
          return `
          <section class="ovl act-header${side}" data-act="${i + 1}">
            <div class="inner">
              <p class="eyebrow">${act.eyebrow}</p>
              <h2 class="h2">${act.title}</h2>
              <p class="sub">${act.sub}</p>
              ${list}
              ${ctaLinks}
              ${worksLink}
            </div>
            ${flagships}
            ${pricing}
          </section>`;
        }).join('')}

        <!-- WORKS GRID (act 3) -->
        <div id="works-grid" class="works-grid"></div>

        <!-- FOOTER -->
        <footer class="footer">
          <div class="footer-grid">
            <div class="f-brand">
              <a class="nav-logo" href="/">
                <svg class="logo-mark" viewBox="0 0 36 36" fill="none">
                  <rect width="36" height="36" rx="10" fill="#ffffff"/>
                  <path d="M10 18h6l4-10 6 20 4-10h6" stroke="#0a0a0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                </svg>
                <span class="logo-word">KEYCODE</span>
              </a>
              <p class="f-tagline">${CONTENT.footer.tagline}</p>
            </div>
            ${CONTENT.footer.columns.map(col => `
              <div>
                <h4>${col.heading}</h4>
                ${col.links.map(l => `<a class="plain" href="${l.href}">${l.label}</a>`).join('')}
              </div>`).join('')}
            <div>
              <h4>Newsletter</h4>
              <p class="f-tagline">${CONTENT.footer.newsletter}</p>
              <form class="newsletter-form" novalidate>
                <input type="email" placeholder="you@studio.dev" aria-label="Email" required>
                <button class="btn btn-primary" type="submit">Join</button>
              </form>
              <div class="newsletter-msg"></div>
            </div>
          </div>
          <div class="footer-bottom">
            <span>© 2026 KEYCODE Studio · The website no one can copy</span>
            <span class="legal">
              <a href="/privacy.html">Privacy</a>
              <a href="/cookies.html">Cookies</a>
              <a href="/status.html">Status</a>
              <a href="/changelog.html">v2.0</a>
            </span>
          </div>
        </footer>
      </div>

      <div class="menu" id="menu">
        <div class="menu-back"></div>
        <div class="menu-panel">
          <p class="menu-kicker">Navigate the studio</p>
          <a href="/ai-builder.html"><b>01</b> AI Builder</a>
          <a href="/game-builder.html"><b>02</b> Game Builder</a>
          <a href="/realtime-builder"><b>03</b> Real-time Builder</a>
          <a href="/scan-3d.html"><b>04</b> 3D Scan → CAD</a>
          <a href="/tools.html"><b>05</b> 3D / PCB Studio</a>
          <a href="/pricing.html"><b>06</b> Pricing</a>
          <a href="/shop.html"><b>07</b> Shop</a>
          <a href="/docs.html"><b>08</b> Docs</a>
          <a href="/login.html"><b>09</b> Login</a>
          <a href="/register.html"><b>10</b> Get Started</a>
        </div>
      </div>

      <div class="act-indicators" id="act-indicators">
        <div class="act-dot active" data-act="0" data-label="Home"></div>
        <div class="act-dot" data-act="1" data-label="Flagships"></div>
        <div class="act-dot" data-act="2" data-label="Works"></div>
        <div class="act-dot" data-act="3" data-label="Studio"></div>
      </div>
    `;
    return container;
  }

  bindEvents() {
    const menuBtn = this.element.querySelector('#menu-btn');
    const menu = this.element.querySelector('#menu');
    const menuBack = this.element.querySelector('.menu-back');
    menuBtn?.addEventListener('click', () => menu.classList.toggle('open'));
    menuBack?.addEventListener('click', () => menu.classList.remove('open'));
    this.element.querySelectorAll('.menu-panel a').forEach(a => {
      a.addEventListener('click', () => menu.classList.remove('open'));
    });

    // Nav links + act indicators + scroll buttons
    const scrollables = [
      ...this.element.querySelectorAll('.nav-mid a[data-act]'),
      ...this.element.querySelectorAll('.act-dot[data-act]'),
      ...this.element.querySelectorAll('[data-scroll]')
    ];
    scrollables.forEach(el => {
      el.addEventListener('click', (e) => {
        const act = Number(el.dataset.act ?? el.dataset.scroll);
        e.preventDefault();
        this.scrollToAct(act);
      });
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') menu?.classList.remove('open');
    });

    this.sections = {};
    this.element.querySelectorAll('.ovl[data-act]').forEach(el => {
      this.sections[Number(el.dataset.act)] = el;
    });
    this.footerEl = this.element.querySelector('.footer');
    this.liveText = this.element.querySelector('.live-text');

    // Newsletter
    this.bindNewsletter();
    this.bindForge();
  }

  bindForge() {
    const input = this.element.querySelector('#forge-input');
    const buildBtn = this.element.querySelector('#forge-build');
    const randomBtn = this.element.querySelector('#forge-random');
    const codeEl = this.element.querySelector('#forge-code');
    const preview = this.element.querySelector('#forge-preview');
    const status = this.element.querySelector('#forge-status');
    const agents = this.element.querySelectorAll('.forge-agent');
    if (!input || !buildBtn) return;
    const prompts = [
      'A luxury watch e-commerce with 3D product viewer, glassmorphism, dark',
      'Fortnite-style neon racing island with power-ups and drift',
      'AI dashboard with live charts, glass cards, and chat',
      'Portfolio for photographer with masonry, lightbox, and booking'
    ];
    randomBtn?.addEventListener('click', () => { input.value = prompts[Math.floor(Math.random()*prompts.length)]; input.focus(); });
    let agentIdx = 0;
    const cycleAgents = () => {
      agents.forEach((a,i) => a.classList.toggle('active', i===agentIdx));
      agentIdx = (agentIdx+1)%agents.length;
    };
    let agentTimer = null;
    buildBtn.addEventListener('click', async () => {
      const prompt = input.value.trim();
      if (!prompt) { input.focus(); input.style.borderColor = '#ef4444'; setTimeout(()=>input.style.borderColor='',1200); return; }
      buildBtn.textContent = 'Forging…';
      buildBtn.disabled = true;
      if (status) status.textContent = 'agents working…';
      if (codeEl) codeEl.innerHTML = '<span style="color:#10b981">● Core orchestrating…</span>';
      agentTimer = setInterval(cycleAgents, 500);
      try {
        const res = await fetch('/api/generate-code', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ projectType:'website', features:[], pages:5, designLevel:'premium', projectName: prompt.slice(0,40) , description: prompt }) });
        const data = await res.json();
        clearInterval(agentTimer);
        agents.forEach(a=>a.classList.remove('active'));
        if (status) status.textContent = data.aiGenerated ? 'real AI ✓' : 'forged';
        if (codeEl) codeEl.textContent = (data.code||'').slice(0,800) + '…';
        if (preview && data.code) { preview.srcdoc = data.code; }
        buildBtn.textContent = 'Forged ✓ — scroll down';
        setTimeout(()=>{ buildBtn.textContent='Forge with 6 Agents →'; buildBtn.disabled=false; },2000);
      } catch(e) {
        clearInterval(agentTimer);
        if (status) status.textContent = 'error';
        if (codeEl) codeEl.textContent = 'Forge failed: ' + e.message;
        buildBtn.textContent='Try again';
        buildBtn.disabled=false;
      }
    });
    this.element.querySelector('#forge-deploy')?.addEventListener('click', () => {
      if (preview?.srcdoc) {
        const blob = new Blob([preview.srcdoc], {type:'text/html'});
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    });
  }

  bindNewsletter() {
    const form = this.element.querySelector('.newsletter-form');
    const msg = this.element.querySelector('.newsletter-msg');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      const email = input.value.trim();
      msg.textContent = '';
      msg.className = 'newsletter-msg';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msg.textContent = 'Enter a valid email.';
        msg.classList.add('err');
        return;
      }
      const btn = form.querySelector('button');
      btn.disabled = true;
      btn.textContent = '…';
      try {
        const { api } = await import('../api/client.js');
        await api.subscribe(email);
        msg.textContent = 'You’re on the list. First build ships soon.';
        msg.classList.add('ok');
        input.value = '';
      } catch (err) {
        msg.textContent = err.message || 'Could not subscribe — try again.';
        msg.classList.add('err');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Join';
      }
    });
  }

  scrollToAct(act) {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const start = ACT_STARTS[act] ?? 0;
    window.scrollTo({ top: maxScroll * start, behavior: this.experience.reducedMotion ? 'auto' : 'smooth' });
  }

  updateScroll(scrollProgress, scrollVelocity = 0) {
    const keys = ['hero', 'flagships', 'works', 'cta'];
    keys.forEach((key, i) => {
      const el = this.sections[i];
      if (!el) return;
      const win = SECTION_WINDOWS[key];
      if (!win) return;
      const o = sectionOpacity(scrollProgress, win);
      const dy = (1 - o) * 26 + (scrollVelocity / 5000) * 8;
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate3d(0, ${dy.toFixed(2)}px, 0)`;
      el.querySelectorAll('.inner, .scroll-hint, .flagship-grid, .pricing-grid').forEach(child => {
        child.style.pointerEvents = o > 0.05 ? 'auto' : 'none';
      });
      if (key === 'works' && this.worksGrid) {
        this.worksGrid.style.opacity = o.toFixed(3);
        this.worksGrid.style.pointerEvents = o > 0.05 ? 'auto' : 'none';
        this.worksGrid.style.transform = `translate(-50%, -50%) translateY(${((1 - o) * 30).toFixed(2)}px)`;
      }
    });

    // Footer
    if (this.footerEl) {
      const o = smoothstep(SECTION_WINDOWS.footer.in, SECTION_WINDOWS.footer.in + 0.05, scrollProgress);
      this.footerEl.classList.toggle('show', o > 0.5);
    }

    // Nav scrolled state
    const nav = this.element.querySelector('.nav');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 8);
  }

  /* ----- Works grid ----- */
  renderWorks(items) {
    const grid = this.element.querySelector('#works-grid');
    if (!grid) return;
    this.worksGrid = grid;
    const data = items && items.length ? items : CONTENT.worksFallback;
    grid.innerHTML = data.map((w, i) => {
      const href = w.href || (w.slug ? `/tools.html?service=${encodeURIComponent(w.slug)}` : '#');
      const img = w.image ? `<div class="wc-img" style="background-image:url('${w.image}')"></div>` : '';
      return `
      <a class="work-card panel3d has-img" href="${href}" style="--i:${i}">
        ${img}
        <span class="wc-idx">0${i + 1}</span>
        <span class="wc-cat">${w.cat || w.category || 'WORK'}</span>
        <span class="wc-name">${w.name}</span>
        <span class="wc-desc">${w.desc || ''}</span>
        <span class="wc-note">${w.note || (w.shortDescription || '')}</span>
      </a>`;
    }).join('') + `<a class="work-card more-card" href="/gallery.html" style="--i:${data.length}"><span class="wc-name">More Works →</span><span class="wc-note">Explore all ${data.length}+ ships</span></a>`;
  }

  setLive(status) {
    if (this.liveText) this.liveText.textContent = status ? `Cloud live · ${status}` : CONTENT.hero.live;
  }

  setNavAuth(user) {
    const login = this.element.querySelector('[data-auth="login"]');
    const signup = this.element.querySelector('[data-auth="signup"]');
    const cta = this.element.querySelector('[data-auth="cta"]');
    if (user) {
      if (login) {
        login.textContent = 'Dashboard';
        login.href = '/dashboard.html';
      }
      if (signup) {
        signup.textContent = user.name || user.email || 'Account';
        signup.href = '/control-panel.html';
      }
      if (cta) {
        cta.textContent = 'Open Dashboard';
        cta.href = '/control-panel.html';
      }
    }
  }

  updateActIndicator(actIndex) {
    this.element.querySelectorAll('.act-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === actIndex);
    });
    this.element.querySelectorAll('.nav-mid a').forEach((link, i) => {
      link.classList.toggle('active', i === actIndex - 1);
    });
  }
}
