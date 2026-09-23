import { CONTENT, SECTION_WINDOWS, ACT_STARTS, sectionOpacity, smoothstep, clamp01 } from './Content.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
          <div class="loader-sub">AI ENGINEERING STUDIO</div>
          <div class="loader-bar"><span></span></div>
          <div class="loader-pct">00%</div>
          <div class="loader-text">Preparing the stage</div>
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
          <a href="/ai-builder.html?mode=tools">Services</a>
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
        <!-- HERO — BEYOND IMAGINATION -->
        <section class="ovl ovl-hero" data-act="0">
          <div class="video-bg-wrap">
            <video class="hero-bg-video" autoplay muted loop playsinline preload="auto">
              <source src="/bc.mp4" type="video/mp4">
            </video>
            <div class="video-overlay"></div>
          </div>
          <div class="hero-orbs"><div class="hero-orb o1" data-parallax data-depth="0.65" data-rot="7"></div><div class="hero-orb o2" data-parallax data-depth="0.4" data-rot="-5"></div><div class="hero-orb o3" data-parallax data-depth="0.85"></div></div>
          <div class="inner">
            <p class="eyebrow"><span>${CONTENT.hero.eyebrow}</span></p>
            <h1 class="h-display">${CONTENT.hero.title}</h1>
            <p class="sub">${CONTENT.hero.sub}</p>
            <div class="cta-row">
              <a class="btn btn-primary magnetic" href="${CONTENT.hero.primary.href}">${CONTENT.hero.primary.label} <span class="arrow">→</span></a>
              <button class="btn btn-ghost magnetic" data-scroll="1">${CONTENT.hero.secondary.label}</button>
            </div>
            <div class="live-ind"><span class="dot"></span><span class="live-text">${CONTENT.hero.live}</span></div>
            <div class="marquee" aria-hidden="true">
              <div class="marquee-track">
                ${(CONTENT.ticker.concat(CONTENT.ticker)).map(t=>`<span>${t}</span><i>◆</i>`).join('')}
              </div>
            </div>
            <div class="cat-chips" id="cat-chips" aria-label="Filter the 3D service graph"></div>
            <p class="drag-hint"><i>⌖</i> hover the constellation · click a node to enter · drag to orbit</p>
          </div>
          <div class="scroll-hint"><span>Scroll to explore</span><div class="mouse"></div></div>
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
          const worksLink = act.worksLink ? `<div style="margin-top:1.4rem"><a class="fc-cta-line" href="${act.worksLink}">All works<span>→</span></a></div>` : '';
          const trustBar = (act.id==='cta') ? `
            <div class="proof-strip">
              <div class="proof-stats">
                <span><b>4</b> pipelines</span>
                <span><b>6</b> agents</span>
                <span><b>30+</b> services</span>
                <span><b>~1s</b> first preview</span>
              </div>
              <div class="proof-news">
                ${CONTENT.press.slice(0,3).map(p=>`
                  <a class="proof-item" href="${p.href}">
                    <span class="proof-date">${p.date}</span>
                    <span class="proof-title">${p.title}</span>
                    <span class="proof-arrow">→</span>
                  </a>`).join('')}
              </div>
            </div>` : '';
          return `
          <section class="ovl act-header${side}" data-act="${i + 1}">
            <div class="inner">
              <p class="eyebrow">${act.eyebrow}</p>
              <h2 class="h2">${act.title}</h2>
              <p class="sub">${act.sub}</p>
              ${list}
              ${ctaLinks}
              ${worksLink}
              ${trustBar}
            </div>
            ${flagships}
            ${pricing}
          </section>`;
        }).join('')}

        <!-- HORIZONTAL ACT — pipelines deep-dive, traversed sideways by vertical scroll -->
        <div class="hc-act" data-hscroll data-hscroll-label="drag through the pipelines" aria-label="Pipeline deep dive" hidden>
          <div class="kc-hpanel">
            <span class="hp-idx">01 / 04 · AI FULL-STACK</span>
            <h3 class="hp-title">Code that writes <em>itself</em></h3>
            <p class="hp-desc">Six specialist agents plan, build, test and polish a production app while you watch — live preview, real deploy, zero boilerplate.</p>
            <div class="hp-list"><span>Streaming generation you can interrupt</span><span>Full-stack: frontend, API, database</span><span>One click to production</span></div>
            <a class="hp-cta magnetic" href="/ai-builder.html">Open AI Builder →</a>
          </div>
          <div class="kc-hpanel">
            <span class="hp-idx">02 / 04 · GAME WORLDS</span>
            <h3 class="hp-title">Worlds you can <em>get lost in</em></h3>
            <p class="hp-desc">Describe a game — get a playable world with physics, enemies, scoring and cinematics. Fortnite-grade ambition, browser-native delivery.</p>
            <div class="hp-list"><span>3D engines with drift physics</span><span>Procedural levels &amp; power-ups</span><span>Score systems and leaderboards</span></div>
            <a class="hp-cta magnetic" href="/ai-builder.html?mode=game">Forge a game →</a>
          </div>
          <div class="kc-hpanel">
            <span class="hp-idx">03 / 04 · 3D + CAD</span>
            <h3 class="hp-title">Scan reality, <em>edit it</em></h3>
            <p class="hp-desc">Point a camera at any object and get clean, editable CAD — mesh repair, retopology and STEP export built into the pipeline.</p>
            <div class="hp-list"><span>Photogrammetry → watertight meshes</span><span>Auto retopo &amp; repair</span><span>Fab-ready STEP / STL export</span></div>
            <a class="hp-cta magnetic" href="/ai-builder.html?mode=cad">Scan to CAD →</a>
          </div>
          <div class="kc-hpanel">
            <span class="hp-idx">04 / 04 · PCB FAB</span>
            <h3 class="hp-title">Boards, <em>factory-ready</em></h3>
            <p class="hp-desc">From plain English to Gerbers: component selection, routing, DFM checks and a fab score — a manufacturing ZIP, not a mockup.</p>
            <div class="hp-list"><span>Real BOM with MPN sourcing</span><span>KiCad-grade routing</span><span>Gerber + drill ZIP download</span></div>
            <a class="hp-cta magnetic" href="/ai-builder.html?mode=pcb">Design a PCB →</a>
          </div>
        </div>

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
            <span>© 2026 KEYCODE Studio — engineered by its own pipelines</span>
            <span class="legal">
              <a href="/privacy.html">Privacy</a>
              <a href="/cookies.html">Cookies</a>
              <a href="/status.html">Status</a>
              <a href="/changelog.html">v3.0</a>
            </span>
          </div>
        </footer>
      </div>

      <div class="menu" id="menu">
        <div class="menu-back"></div>
        <div class="menu-panel">
          <p class="menu-kicker">Navigate the studio</p>
          <a href="/ai-builder.html"><b>01</b> AI Builder</a>
          <a href="/ai-builder.html?mode=game"><b>02</b> Game Builder</a>
          <a href="/ai-builder.html?mode=realtime"><b>03</b> Real-time Builder</a>
          <a href="/ai-builder.html?mode=cad"><b>04</b> 3D Scan → CAD</a>
          <a href="/ai-builder.html?mode=tools"><b>05</b> 3D / PCB Studio</a>
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
    this.bindHeroMagic();
    this.bindCategoryChips();
  }

  /* Category chips filter the interactive 3D service graph in real time */
  bindCategoryChips() {
    const wrap = this.element.querySelector('#cat-chips');
    if (!wrap) return;

    // Floating tooltip for hovered 3D nodes
    const tt = document.createElement('div');
    tt.className = 'graph-tooltip';
    document.body.appendChild(tt);
    const exp = this.experience;
    if (exp && exp.serviceGraph) {
      exp.serviceGraph.onHover((node) => {
        if (node) {
          tt.innerHTML = '<span class="tt-cat">' + esc(node.catName) + '</span>' + esc(node.service) +
            '<span class="tt-go">click to open →</span>';
          tt.style.left = ((node.px || 0)) + 'px';
          tt.style.top = ((node.py || 0)) + 'px';
          tt.classList.add('show');
        } else {
          tt.classList.remove('show');
        }
      });
    }
    const CATS = [
      { id: 'AI', label: 'AI', color: '#8b5cf6' },
      { id: 'GAME', label: 'Games', color: '#22d3ee' },
      { id: 'SCAN', label: 'CAD', color: '#6ee7b7' },
      { id: 'MAKE', label: 'Fab', color: '#4ade80' },
      { id: 'DESIGN', label: 'Design', color: '#f472b6' },
      { id: 'AUTO', label: 'Auto', color: '#f59e0b' },
      { id: 'SHOP', label: 'Shop', color: '#34d399' }
    ];
    const labelFor = (id) => (CATS.find(c => c.id === id) || {}).label || id;
    CATS.forEach((cat, i) => {
      const b = document.createElement('button');
      b.className = 'cat-chip';
      b.type = 'button';
      b.innerHTML = '<i style="background:' + cat.color + '"></i>' + cat.label;
      b.style.animationDelay = (0.9 + i * 0.07) + 's';
      b.addEventListener('click', () => {
        const exp = this.experience;
        if (exp && exp.serviceGraph) {
          const focused = exp.serviceGraph.focusCategory(cat.id);
          wrap.querySelectorAll('.cat-chip').forEach(c => c.classList.toggle('active', c === b && !!focused));
        } else {
          window.location.href = '/gallery.html';
        }
      });
      wrap.appendChild(b);
    });
    const clearBtn = document.createElement('button');
    clearBtn.className = 'cat-chip cat-clear';
    clearBtn.type = 'button';
    clearBtn.textContent = '✕ all';
    clearBtn.addEventListener('click', () => {
      const exp = this.experience;
      if (exp && exp.serviceGraph) {
        exp.serviceGraph.focused = null;
        exp.serviceGraph.applyFilter();
        wrap.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
      }
    });
    wrap.appendChild(clearBtn);
  }

  bindHeroMagic() {
    // One honest live pulse: the eyebrow dot greens up only when AI is truly online
    (async () => {
      try {
        const p = await fetch('/api/ai/providers').then(r => r.json()).catch(() => null);
        const dotEl = this.element.querySelector('.live-ind .dot');
        if (dotEl && p && p.online > 0) dotEl.classList.add('on');
      } catch {}
    })();
    const hero = this.element.querySelector('.ovl-hero');
    const orbs = this.element.querySelectorAll('.hero-orb');
    if (hero && orbs.length && !this.experience.reducedMotion) {
      hero.addEventListener('mousemove', (e) => {
        const r = hero.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        orbs.forEach((o, i) => { o.style.translate = `${(x * (18 + i * 10)).toFixed(1)}px ${(y * (14 + i * 8)).toFixed(1)}px`; });
      });
    }
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
      const dy = (1 - o) * 8 + (scrollVelocity / 12000) * 2;
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate3d(0, ${dy.toFixed(2)}px, 0) scale(${(0.98 + o * 0.02).toFixed(4)})`;
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
      const href = w.href || (w.slug ? `/ai-builder.html?mode=tools&service=${encodeURIComponent(w.slug)}` : '#');
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
