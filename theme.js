// KEYCODE Theme Injection v2.0
(function() {
  'use strict';

  if (document.body && document.body.classList.contains('kc-theme-injected')) return;
  if (typeof window.requestAnimationFrame !== 'function' || typeof window.IntersectionObserver !== 'function') return;

  const path = window.location.pathname;
  const authPages = ['/login.html', '/register.html', '/otp-login.html', '/reset-password.html', '/verify-email.html', '/admin-login.html', '/admin-access.html'];
  const isAuthPage = authPages.includes(path);
  const isErrorPage = document.documentElement.hasAttribute('data-kc-error');
  const appPages = ['/ai-builder.html'];
  const isAppPage = appPages.includes(path) || !!document.getElementById('orbCanvas');
  const SERVER = window.location.origin;


  // ========================================================================
  // SAFE DOM HELPERS
  // ========================================================================
  var safeQ = function(sel, fn) { var el = document.querySelector(sel); if (el) fn(el); };
  var safeId = function(id, fn) { var el = document.getElementById(id); if (el) fn(el); };
  var safeAll = function(sel, fn) { document.querySelectorAll(sel).forEach(function(el) { fn(el); }); };
  var focusTrap = function(container) {
    var focusable = container.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
    var first = focusable[0], last = focusable[focusable.length - 1];
    var handler = function(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); if (last) last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); if (first) first.focus(); }
    };
    container.addEventListener('keydown', handler);
    if (first) first.focus();
    return function() { container.removeEventListener('keydown', handler); };
  };
  var onEsc = function(fn) {
    var handler = function(e) { if (e.key === 'Escape') { fn(); document.removeEventListener('keydown', handler); } };
    document.addEventListener('keydown', handler);
    return handler;
  };

  // ========================================================================
  // UTILITY LIBRARY
  // ========================================================================
  var KC = {
    debounce: function(fn, ms) { var t; return function() { var ctx = this, args = arguments; clearTimeout(t); t = setTimeout(function() { fn.apply(ctx, args); }, ms); }; },
    throttle: function(fn, ms) { var last = 0; return function() { var now = Date.now(); if (now - last >= ms) { last = now; fn.apply(this, arguments); } }; },
    deepClone: function(obj) { return JSON.parse(JSON.stringify(obj)); },
    uuid: function() { return 'kc-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36); },
    escapeHtml: function(str) { var d = document.createElement('div'); d.textContent = str; return d.innerHTML; },
    sanitize: function(str) { return str.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=\s*["'][^"']*["']/gi, ''); },
    getCookie: function(n) { var m = document.cookie.match(new RegExp('(^| )' + n + '=([^;]+)')); return m ? decodeURIComponent(m[2]) : null; },
    setCookie: function(n, v, days) { var d = new Date(); d.setDate(d.getDate() + (days || 365)); document.cookie = n + '=' + encodeURIComponent(v) + '; expires=' + d.toUTCString() + '; path=/; SameSite=Lax'; },
    deleteCookie: function(n) { document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; },
    ls: { get: function(k) { try { var item = localStorage.getItem('kc_' + k); if (!item) return null; var parsed = JSON.parse(item); if (parsed._exp && Date.now() > parsed._exp) { localStorage.removeItem('kc_' + k); return null; } return parsed._v; } catch(e) { return null; } }, set: function(k, v, ttlMs) { try { var obj = { _v: v }; if (ttlMs) obj._exp = Date.now() + ttlMs; localStorage.setItem('kc_' + k, JSON.stringify(obj)); } catch(e) {} }, remove: function(k) { try { localStorage.removeItem('kc_' + k); } catch(e) {} } },
    isMobile: function() { return window.innerWidth < 768; },
    isTablet: function() { return window.innerWidth >= 768 && window.innerWidth < 1024; },
    isDesktop: function() { return window.innerWidth >= 1024; },
    getOS: function() { var ua = navigator.userAgent; if (ua.indexOf('Win') !== -1) return 'windows'; if (ua.indexOf('Mac') !== -1) return 'macos'; if (ua.indexOf('Linux') !== -1) return 'linux'; if (ua.indexOf('Android') !== -1) return 'android'; if (ua.indexOf('iOS') !== -1 || ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) return 'ios'; return 'unknown'; },
    getBrowser: function() { var ua = navigator.userAgent; if (ua.indexOf('Chrome') !== -1) return 'chrome'; if (ua.indexOf('Firefox') !== -1) return 'firefox'; if (ua.indexOf('Safari') !== -1) return 'safari'; if (ua.indexOf('Edge') !== -1) return 'edge'; return 'unknown'; },
    formatDate: function(d, fmt) { d = new Date(d); var o = { 'Y': d.getFullYear(), 'm': String(d.getMonth()+1).padStart(2,'0'), 'd': String(d.getDate()).padStart(2,'0'), 'H': String(d.getHours()).padStart(2,'0'), 'i': String(d.getMinutes()).padStart(2,'0'), 's': String(d.getSeconds()).padStart(2,'0') }; return fmt.replace(/[YmdHis]/g, function(c) { return o[c]; }); },
    timeAgo: function(d) { var s = Math.floor((Date.now() - new Date(d).getTime()) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s/60) + 'm ago'; if (s < 86400) return Math.floor(s/3600) + 'h ago'; if (s < 2592000) return Math.floor(s/86400) + 'd ago'; return Math.floor(s/2592000) + 'mo ago'; },
    formatNumber: function(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); },
    getParam: function(n) { var p = new URLSearchParams(window.location.search); return p.get(n); },
    setParam: function(n, v) { var p = new URLSearchParams(window.location.search); p.set(n, v); var url = window.location.pathname + '?' + p.toString(); window.history.replaceState({}, '', url); },
    fetch: function(url, opts) { opts = opts || {}; var headers = opts.headers || {}; headers['X-Requested-With'] = 'XMLHttpRequest'; return fetch(url, Object.assign(opts, { headers: headers })).then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); },
    emit: function(name, detail) { document.dispatchEvent(new CustomEvent('kc:' + name, { detail: detail })); },
    on: function(name, fn) { document.addEventListener('kc:' + name, fn); },
    off: function(name, fn) { document.removeEventListener('kc:' + name, fn); },
  };

  // ========================================================================
  // LOADING OVERLAY
  // ========================================================================
  function showLoading() {
    if (document.getElementById('kc-loading')) return;
    var overlay = document.createElement('div');
    overlay.id = 'kc-loading';
    overlay.className = 'kc-loading-overlay';
    overlay.innerHTML = '<div class="kc-loading-ring"></div>';
    document.body.appendChild(overlay);
  }

  function hideLoading() {
    var overlay = document.getElementById('kc-loading');
    if (!overlay) return;
    overlay.classList.add('hidden');
    setTimeout(function() { overlay.remove(); }, 500);
  }

  // ========================================================================
  // NAV INJECTION
  // ========================================================================
  function injectNav() {
    if (document.getElementById('kc-nav')) return;

    var nav = document.createElement('div');
    nav.id = 'kc-nav';
    nav.className = 'kc-nav';
    nav.innerHTML = [
      '<a href="/" class="kc-nav-logo">KEYCODE</a>',
      '<div class="kc-nav-links">',
      '<a href="/pricing.html">Pricing</a>',
      '<a href="/shop.html">Shop</a>',
      '<a href="/ai-builder.html">AI</a>',
      '<div class="kc-nav-mega-trigger">',
      '<a href="/blog.html">Resources</a>',
      '<div class="kc-nav-mega"><div class="kc-mega-grid">',
      '<div class="kc-mega-col"><h4>Learn</h4><a href="/blog.html">Blog</a><a href="/docs.html">Documentation</a><a href="/gallery.html">Gallery</a></div>',
      '<div class="kc-mega-col"><h4>Support</h4><a href="/support.html">Help Center</a><a href="/status.html">System Status</a><a href="/changelog.html">Changelog</a></div>',
      '<div class="kc-mega-col"><h4>Community</h4><a href="https://discord.gg/keycodetechio" target="_blank">Discord</a><a href="https://github.com/keycode" target="_blank">GitHub</a></div>',
      '</div></div></div>',
      '<a href="/login.html" class="kc-nav-btn">Sign In</a>',
      '<button class="kc-search-btn" id="kc-search-btn" aria-label="Search (Ctrl+K)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg></button>',
      '</div>',
      '<button class="kc-hamburger" id="kc-hamburger" aria-label="Menu"><span></span><span></span><span></span></button>',
      '<div class="kc-nav-extra" id="kc-nav-extra"></div>',
    ].join('');
    document.body.insertBefore(nav, document.body.firstChild);

    var menu = document.createElement('div');
    menu.id = 'kc-mobile-menu';
    menu.className = 'kc-mobile-menu';
    menu.innerHTML = [
      '<a href="/pricing.html">Pricing</a>',
      '<a href="/shop.html">Shop</a>',
      '<a href="/ai-builder.html">AI</a>',
      '<a href="/blog.html">Blog</a>',
      '<a href="/docs.html">Docs</a>',
      '<a href="/gallery.html">Gallery</a>',
      '<a href="/support.html">Support</a>',
      '<a href="/status.html">Status</a>',
      '<a href="/login.html" class="kc-nav-btn">Sign In</a>',
    ].join('');
    document.body.appendChild(menu);
    menu.addEventListener('click', function(e) { if (e.target.tagName === 'A' && e.target.href) { toggleMobileMenu(false); } });

    safeId('kc-hamburger', function(hamburger) {
      hamburger.addEventListener('click', function() { toggleMobileMenu(!menu.classList.contains('open')); });
    });

    function toggleMobileMenu(open) {
      hamburger.classList.toggle('open', open);
      menu.classList.toggle('open', open);
      document.body.classList.toggle('kc-menu-open', open);
    }

    document.body.style.paddingTop = '64px';

    var lastScroll = 0;
    window.addEventListener('scroll', KC.throttle(function() {
      var y = window.scrollY;
      nav.classList.toggle('kc-nav-scrolled', y > 50);
      if (y > 200) {
        nav.classList.toggle('kc-nav-hidden', y > lastScroll && y > 200);
        nav.classList.toggle('kc-nav-visible', y < lastScroll);
      } else {
        nav.classList.remove('kc-nav-hidden', 'kc-nav-visible');
      }
      lastScroll = y;
    }, 100), { passive: true });

    safeId('kc-search-btn', function(btn) { btn.addEventListener('click', openCommandPalette); });
    initLiveClock();
  }

  function initLiveClock() {
    var extra = document.getElementById('kc-nav-extra');
    if (!extra) return;
    var clock = document.createElement('span');
    clock.className = 'kc-nav-clock';
    clock.id = 'kc-nav-clock';
    extra.appendChild(clock);
    function tick() {
      var d = new Date();
      clock.textContent = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    tick();
    setInterval(tick, 30000);
  }

  // ========================================================================
  // FOOTER INJECTION
  // ========================================================================
  function injectFooter() {
    if (document.getElementById('kc-footer')) return;
    var existing = document.querySelector('footer');
    if (existing) existing.style.display = 'none';

    var footer = document.createElement('footer');
    footer.id = 'kc-footer';
    footer.className = 'kc-footer';
    footer.innerHTML = [
      '<div class="kc-footer-inner">',
      '<div>',
      '<div class="kc-footer-brand">KEYCODE</div>',
      '<p class="kc-footer-desc">Award-winning digital creation studio. We build immersive, performant web experiences powered by AI and cutting-edge technology.</p>',
      '<div class="kc-footer-social">',
      '<a href="https://github.com/keycode" target="_blank" rel="noopener" aria-label="GitHub"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.73.083-.73 1.205.085 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.604-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12 24 5.37 18.63 0 12 0z"/></svg></a>',
      '<a href="https://x.com/keycodetechio" target="_blank" rel="noopener" aria-label="X / Twitter"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>',
      '<a href="https://discord.gg/keycodetechio" target="_blank" rel="noopener" aria-label="Discord"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.8 19.8 0 00-4.887-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.3 18.3 0 00-5.487 0 12.6 12.6 0 00-.617-1.25.077.077 0 00-.079-.037A19.7 19.7 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.1 14.1 0 001.226-1.994.076.076 0 00-.041-.106 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128 10.4 10.4 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.5 12.5 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.8 19.8 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg></a>',
      '<a href="https://www.youtube.com/@keycode" target="_blank" rel="noopener" aria-label="YouTube"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>',
      '<a href="https://linkedin.com/company/keycode-studio" target="_blank" rel="noopener" aria-label="LinkedIn"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>',
      '<a href="https://instagram.com/keycodetechio" target="_blank" rel="noopener" aria-label="Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg></a>',
      '</div></div>',
      '<div><h4>Platform</h4><a href="/control-panel.html">Control Panel</a><a href="/dashboard.html">Dashboard</a><a href="/pricing.html">Pricing</a><a href="/shop.html">Shop</a></div>',
      '<div><h4>Resources</h4><a href="/docs.html">Documentation</a><a href="/blog.html">Blog</a><a href="/support.html">Support</a><a href="/status.html">Status</a></div>',
      '<div><h4>Company</h4><a href="/login.html">Sign In</a><a href="/register.html">Register</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div>',
      '</div>',
      '<div class="kc-footer-bottom">&copy; ' + new Date().getFullYear() + ' KEYCODE Studio. All rights reserved. <span class="kc-footer-extra"></span></div>',
    ].join('');
    document.body.appendChild(footer);

    var extra = footer.querySelector('.kc-footer-extra');
    if (extra) {
      var pages = ['/privacy.html', '/terms.html', '/cookies.html', '/sitemap.xml'];
      extra.textContent = ' | Page loaded: ' + KC.formatDate(new Date(), 'Y-m-d H:i:s');
    }
  }

  // ========================================================================
  // BACK TO TOP
  // ========================================================================
  function injectBackToTop() {
    if (document.getElementById('kc-back-top')) return;
    var btn = document.createElement('button');
    btn.id = 'kc-back-top';
    btn.className = 'kc-back-top';
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 15l-6-6-6 6"/></svg>';
    btn.setAttribute('aria-label', 'Back to top');
    btn.addEventListener('click', function() { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.body.appendChild(btn);
    window.addEventListener('scroll', KC.throttle(function() { btn.classList.toggle('visible', window.scrollY > 400); }, 200), { passive: true });
  }

  // ========================================================================
  // PAGE TRANSITIONS
  // ========================================================================
  function addPageTransition() {
    var main = document.querySelector('main, .container, .page-content, #root, [role="main"]') || document.body;
    main.classList.add('kc-page');
  }

  function interceptLinks() {
    document.addEventListener('click', function(e) {
      var a = e.target.closest('a');
      if (!a || a.getAttribute('target') === '_blank' || a.hostname !== window.location.hostname || a.protocol.indexOf('http') !== 0 || a.pathname === window.location.pathname || a.hasAttribute('download') || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      showProgressBar();
      var main = document.querySelector('.kc-page');
      if (main) main.classList.add('kc-page-out');
      setTimeout(function() { window.location.href = a.href; }, 200);
    });
  }

  // ========================================================================
  // STRIP OLD CSS
  // ========================================================================
  function stripOldCSS() {
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function(el) {
      var href = el.getAttribute('href') || '';
      if (href.includes('z-') || href.includes('alche')) { if (!href.includes('theme.css')) el.remove(); }
    });
  }

  // ========================================================================
  // THEME SWITCHER (LIGHT / DARK)
  // ========================================================================
  function initThemeSwitcher() {
    var saved = KC.ls.get('theme');
    if (saved === 'light') document.documentElement.setAttribute('data-kc-theme', 'light');

    var btn = document.createElement('button');
    btn.id = 'kc-theme-btn';
    btn.className = 'kc-theme-btn';
    btn.setAttribute('aria-label', 'Toggle theme');
    btn.innerHTML = '<svg class="kc-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg><svg class="kc-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
    document.getElementById('kc-nav-extra').appendChild(btn);

    btn.addEventListener('click', function() {
      var isLight = document.documentElement.getAttribute('data-kc-theme') === 'light';
      document.documentElement.setAttribute('data-kc-theme', isLight ? 'dark' : 'light');
      KC.ls.set('theme', isLight ? 'dark' : 'light');
      showToast(isLight ? 'Dark mode activated' : 'Light mode activated', 'info');
    });
  }

  // ========================================================================
  // READING PROGRESS BAR
  // ========================================================================
  function initReadingProgress() {
    var bar = document.createElement('div');
    bar.id = 'kc-reading-bar';
    bar.className = 'kc-reading-bar';
    document.body.appendChild(bar);
    var article = document.querySelector('article, .post-content, .blog-content, [data-reading]');
    if (!article) { bar.style.display = 'none'; return; }
    window.addEventListener('scroll', KC.throttle(function() {
      var rect = article.getBoundingClientRect();
      var total = rect.height - window.innerHeight;
      var pct = total > 0 ? Math.min(Math.max((-rect.top) / total * 100, 0), 100) : 100;
      bar.style.width = pct + '%';
      bar.classList.toggle('kc-reading-complete', pct >= 100);
    }, 50), { passive: true });
  }

  // ========================================================================
  // TABLE OF CONTENTS GENERATOR
  // ========================================================================
  function genTOC() {
    var container = document.querySelector('[data-toc], article, .post-content, .blog-content');
    if (!container) return;
    var headings = container.querySelectorAll('h2, h3');
    if (headings.length < 2) return;

    headings.forEach(function(h, i) {
      if (!h.id) h.id = 'toc-' + i;
    });

    var toc = document.createElement('nav');
    toc.className = 'kc-toc';
    toc.setAttribute('aria-label', 'Table of contents');
    var html = '<div class="kc-toc-title">On this page</div><ul>';
    headings.forEach(function(h) {
      var tag = h.tagName.toLowerCase();
      html += '<li class="kc-toc-' + tag + '"><a href="#' + h.id + '">' + h.textContent + '</a></li>';
    });
    html += '</ul>';
    toc.innerHTML = html;
    container.parentNode.insertBefore(toc, container);
    toc.addEventListener('click', function(e) {
      var a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      var target = document.querySelector(a.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ========================================================================
  // READING TIME
  // ========================================================================
  function showReadingTime() {
    var container = document.querySelector('[data-reading-time], article, .post-content, .blog-content');
    if (!container) return;
    var text = container.textContent || '';
    var wpm = 200;
    var words = text.trim().split(/\s+/).length;
    var mins = Math.max(1, Math.ceil(words / wpm));
    var badge = document.createElement('span');
    badge.className = 'kc-reading-time';
    badge.textContent = mins + ' min read';
    var target = document.querySelector('.kc-post-meta, .blog-header, .post-header') || container;
    target.parentNode.insertBefore(badge, target.nextSibling);
  }

  // ========================================================================
  // CODE BLOCK COPY BUTTON
  // ========================================================================
  function initCodeCopy() {
    document.querySelectorAll('pre code, pre').forEach(function(block) {
      var pre = block.tagName === 'PRE' ? block : block.parentNode;
      if (pre.querySelector('.kc-copy-btn')) return;
      var btn = document.createElement('button');
      btn.className = 'kc-copy-btn';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy code to clipboard');
      pre.style.position = 'relative';
      pre.appendChild(btn);
      btn.addEventListener('click', function() {
        var code = pre.querySelector('code') || pre;
        var text = code.textContent || '';
        copyToClipboard(text).then(function() {
          btn.textContent = 'Copied!';
          btn.classList.add('kc-copied');
          setTimeout(function() { btn.textContent = 'Copy'; btn.classList.remove('kc-copied'); }, 2000);
        });
      });
    });
  }

  var copyToClipboard = function(text) {
    if (navigator.clipboard) return navigator.clipboard.writeText(text).catch(function() { fallbackCopy(text); });
    fallbackCopy(text);
    return Promise.resolve();
  };
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta);
  }

  // ========================================================================
  // TOAST NOTIFICATIONS
  // ========================================================================
  function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('kc-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'kc-toast-container';
      container.className = 'kc-toast-container';
      document.body.appendChild(container);
    }
    var icons = { info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>', success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>', warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>', danger: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>' };
    var toast = document.createElement('div');
    toast.className = 'kc-toast kc-toast-' + type;
    toast.innerHTML = '<span class="kc-toast-icon">' + (icons[type] || icons.info) + '</span><span class="kc-toast-msg"></span><button class="kc-toast-close" aria-label="Dismiss">&times;</button>';
    toast.querySelector('.kc-toast-msg').textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(function() { toast.classList.add('kc-toast-show'); });
    var timer = setTimeout(function() { dismiss(toast); }, 5000);
    toast.querySelector('.kc-toast-close').addEventListener('click', function() { clearTimeout(timer); dismiss(toast); });
    function dismiss(t) { t.classList.remove('kc-toast-show'); setTimeout(function() { t.remove(); }, 300); }
  }

  // ========================================================================
  // PROGRESS BAR (page load)
  // ========================================================================
  var progressBar = null;
  function showProgressBar() {
    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.id = 'kc-progress-bar';
      progressBar.className = 'kc-progress-bar';
      document.body.appendChild(progressBar);
    }
    progressBar.style.transform = 'scaleX(0.3)';
    progressBar.style.display = 'block';
    progressBar.style.opacity = '1';
    requestAnimationFrame(function() { progressBar.style.transform = 'scaleX(0.7)'; });
  }
  function hideProgressBar() {
    if (!progressBar) return;
    progressBar.style.transform = 'scaleX(1)';
    progressBar.style.opacity = '0';
    setTimeout(function() { progressBar.style.display = 'none'; progressBar.style.opacity = '1'; }, 400);
  }
  window.addEventListener('load', hideProgressBar);
  document.addEventListener('readystatechange', function() { if (document.readyState === 'complete') hideProgressBar(); });

  // ========================================================================
  // COOKIE CONSENT BANNER
  // ========================================================================
  function injectCookieBanner() {
    if (KC.ls.get('cookies') || document.getElementById('kc-cookie-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'kc-cookie-banner';
    banner.className = 'kc-cookie-banner';
    banner.innerHTML = '<div class="kc-cookie-content"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="flex-shrink:0;opacity:0.5"><path d="M12 2a10 10 0 1010 10 4 4 0 01-5-5 4 4 0 01-5-5A10 10 0 0012 2z"/><path d="M8.5 8.5v.01M15.5 12.5v.01M11 15.5v.01"/></svg><p>We use cookies to enhance your experience. By continuing, you agree to our <a href="/privacy.html">Privacy Policy</a>.</p><div class="kc-cookie-actions"><button id="kc-cookie-accept" class="kc-btn kc-btn-sm">Accept All</button><button id="kc-cookie-decline" class="kc-btn kc-btn-sm kc-btn-ghost">Decline</button></div></div>';
    document.body.appendChild(banner);
    requestAnimationFrame(function() { banner.classList.add('kc-cookie-show'); });
    document.getElementById('kc-cookie-accept').addEventListener('click', function() { KC.ls.set('cookies', 'accepted'); dismissBanner(); });
    document.getElementById('kc-cookie-decline').addEventListener('click', function() { KC.ls.set('cookies', 'declined'); dismissBanner(); });
    function dismissBanner() { banner.classList.remove('kc-cookie-show'); setTimeout(function() { banner.remove(); }, 300); }
  }

  // ========================================================================
  // COMMAND PALETTE (Ctrl+K)
  // ========================================================================
  var commandPaletteOpen = false;
  function openCommandPalette() {
    if (commandPaletteOpen) return;
    var pages = [
      { name: 'Home', url: '/', icon: '⌂' }, { name: 'Pricing', url: '/pricing.html', icon: '$' },
      { name: 'Shop', url: '/shop.html', icon: '🛒' }, { name: 'AI Builder', url: '/ai-builder.html', icon: '✦' },
      { name: 'Blog', url: '/blog.html', icon: '📝' }, { name: 'Gallery', url: '/gallery.html', icon: '🖼' },
      { name: 'Documentation', url: '/docs.html', icon: '📄' }, { name: 'Support', url: '/support.html', icon: '?' },
      { name: 'Dashboard', url: '/dashboard.html', icon: '⬡' }, { name: 'Control Panel', url: '/control-panel.html', icon: '⚙' },
      { name: 'Profile', url: '/profile.html', icon: '👤' }, { name: 'API Keys', url: '/api-keys.html', icon: '🔑' },
      { name: 'Sign In', url: '/login.html', icon: '→' }, { name: 'Register', url: '/register.html', icon: '+' },
      { name: 'Changelog', url: '/changelog.html', icon: '⟳' }, { name: 'Status', url: '/status.html', icon: '⬤' },
      { name: 'Privacy', url: '/privacy.html', icon: '🛡' }, { name: 'Terms', url: '/terms.html', icon: '⚖' },
      { name: 'Checkout', url: '/checkout.html', icon: '💳' },
    ];

    var overlay = document.createElement('div');
    overlay.id = 'kc-palette-overlay';
    overlay.className = 'kc-palette-overlay';
    overlay.innerHTML = '<div class="kc-palette"><div class="kc-palette-header"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><input id="kc-palette-input" type="text" placeholder="Search pages..." autofocus spellcheck="false"></div><div class="kc-palette-results" id="kc-palette-results"></div><div class="kc-palette-footer">Navigate with <kbd>↑</kbd><kbd>↓</kbd> and <kbd>↵</kbd> &middot; <kbd>esc</kbd> to close</div></div>';
    document.body.appendChild(overlay);
    commandPaletteOpen = true;
    requestAnimationFrame(function() {
      overlay.classList.add('kc-palette-open');
      var input = document.getElementById('kc-palette-input');
      if (input) input.focus();
      overlay._releaseFocus = focusTrap(overlay);
    });

    function renderResults(query) {
      var results = document.getElementById('kc-palette-results');
      var q = query.toLowerCase();
      var filtered = pages.filter(function(p) { return p.name.toLowerCase().includes(q) || p.url.includes(q); });
      if (filtered.length === 0) { results.innerHTML = '<div class="kc-palette-empty">No results found</div>'; return; }
      results.innerHTML = filtered.map(function(p, i) { return '<a href="' + p.url + '" class="kc-palette-item" data-index="' + i + '"><span class="kc-palette-icon">' + p.icon + '</span><span>' + p.name + '</span><span class="kc-palette-url">' + p.url + '</span></a>'; }).join('');
    }
    renderResults('');

    var input = document.getElementById('kc-palette-input');
    input.addEventListener('input', function() { renderResults(input.value); });
    input.addEventListener('keydown', function(e) {
      var items = overlay.querySelectorAll('.kc-palette-item');
      var active = overlay.querySelector('.kc-palette-item.active');
      var idx = active ? parseInt(active.getAttribute("data-index"), 10) : -1;
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); }
      else if (e.key === 'Enter' && active) { e.preventDefault(); window.location.href = active.href; }
      items.forEach(function(el, i) { el.classList.toggle('active', i === idx); });
      if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
    });

    function closePalette() { overlay.classList.remove('kc-palette-open'); if (overlay._releaseFocus) overlay._releaseFocus(); setTimeout(function() { overlay.remove(); commandPaletteOpen = false; }, 200); }
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closePalette(); });
    document.addEventListener('keydown', function handler(e) { if (e.key === 'Escape') { closePalette(); document.removeEventListener('keydown', handler); } });
  }

  // ========================================================================
  // KEYBOARD SHORTCUTS HELP
  // ========================================================================
  function toggleShortcutsModal() {
    var existing = document.getElementById('kc-shortcuts-modal');
    if (existing) { existing.remove(); return; }
    var modal = document.createElement('div');
    modal.id = 'kc-shortcuts-modal';
    modal.className = 'kc-shortcuts-modal';
    modal.innerHTML = '<div class="kc-shortcuts-content"><div class="kc-shortcuts-header"><h3>Keyboard Shortcuts</h3><button id="kc-shortcuts-close" aria-label="Close">&times;</button></div><div class="kc-shortcuts-body">' +
      shortcutsList() +
      '</div></div>';
    document.body.appendChild(modal);
    requestAnimationFrame(function() {
      modal.classList.add('kc-shortcuts-open');
      modal._releaseFocus = focusTrap(modal);
    });
    document.getElementById('kc-shortcuts-close').addEventListener('click', function() { if (modal._releaseFocus) modal._releaseFocus(); modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) { if (modal._releaseFocus) modal._releaseFocus(); modal.remove(); } });
  }

  function shortcutsList() {
    return [
      { kbd: 'Ctrl+K', desc: 'Search pages' },
      { kbd: '?', desc: 'Toggle this help' },
      { kbd: 'Esc', desc: 'Close modals / palettes' },
      { kbd: 'T', desc: 'Toggle theme (light/dark)' },
      { kbd: 'Ctrl+D', desc: 'Toggle dark mode' },
      { kbd: 'H', desc: 'Go home' },
      { kbd: 'S', desc: 'Focus search' },
      { kbd: '↑↓', desc: 'Navigate lists' },
    ].map(function(s) { return '<div class="kc-shortcut"><kbd>' + s.kbd + '</kbd><span>' + s.desc + '</span></div>'; }).join('');
  }

  // ========================================================================
  // CONNECTION STATUS
  // ========================================================================
  function injectConnectionStatus() {
    var badge = document.createElement('div');
    badge.id = 'kc-connection-badge';
    badge.className = 'kc-connection-badge kc-conn-online';
    badge.innerHTML = '<span class="kc-conn-dot"></span><span class="kc-conn-text">Online</span>';
    document.body.appendChild(badge);

    function updateStatus() {
      var online = navigator.onLine;
      badge.className = 'kc-connection-badge ' + (online ? 'kc-conn-online' : 'kc-conn-offline');
      badge.querySelector('.kc-conn-text').textContent = online ? 'Online' : 'Offline';
      if (!online) showToast('You are offline. Some features may be unavailable.', 'warning');
    }
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
  }

  // ========================================================================
  // SMOOTH SCROLL FOR ANCHORS
  // ========================================================================
  function initSmoothScroll() {
    document.addEventListener('click', function(e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      var target = document.querySelector(a.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ========================================================================
  // COUNT-UP ANIMATION
  // ========================================================================
  function initCountUp() {
    var els = document.querySelectorAll('[data-count-to]');
    if (els.length === 0) return;
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var target = parseInt(el.getAttribute("data-count-to"), 10);
          var duration = parseInt(el.getAttribute("data-count-dur"), 10) || 1500;
          var start = performance.now();
          function step(now) {
            var pct = Math.min((now - start) / duration, 1);
            el.textContent = Math.round(target * (1 - Math.pow(1 - pct, 3)));
            if (pct < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.5 });
    els.forEach(function(el) { observer.observe(el); });
  }

  // ========================================================================
  // FORM VALIDATION
  // ========================================================================
  function initFormValidation() {
    document.querySelectorAll('input[required], textarea[required], select[required]').forEach(function(el) {
      var msg = document.createElement('span');
      msg.className = 'kc-field-msg';
      el.parentNode.appendChild(msg);
      el.addEventListener('blur', function() { validateField(el); });
      el.addEventListener('input', function() { if (el.dataset.touched) validateField(el); });
      el.addEventListener('focus', function() { el.dataset.touched = 'true'; });
    });

    document.querySelectorAll('form').forEach(function(form) {
      form.addEventListener('submit', function(e) {
        var valid = true;
        form.querySelectorAll('input[required], textarea[required], select[required]').forEach(function(el) {
          el.dataset.touched = 'true';
          if (!validateField(el)) valid = false;
        });
        if (!valid) { e.preventDefault(); showToast('Please fix the errors before submitting.', 'danger'); }
      });
    });
  }

  function validateField(el) {
    var msg = el.parentNode.querySelector('.kc-field-msg');
    var val = el.value ? el.value.trim() : '';
    if (!val) { setError(msg, el, 'This field is required'); return false; }
    if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { setError(msg, el, 'Enter a valid email address'); return false; }
    if (el.type === 'url' && val && !/^https?:\/\/.+/.test(val)) { setError(msg, el, 'Enter a valid URL'); return false; }
    if (el.hasAttribute('minlength') && val.length < parseInt(el.getAttribute('minlength'), 10)) { setError(msg, el, 'Minimum ' + el.getAttribute('minlength') + ' characters'); return false; }
    if (el.type === 'tel' && val && !/^[\d\s\-+()]{7,}$/.test(val)) { setError(msg, el, 'Enter a valid phone number'); return false; }
    clearError(msg, el); return true;
  }
  function setError(msg, el, text) { msg.textContent = text; msg.className = 'kc-field-msg kc-field-error'; el.classList.add('kc-input-error'); }
  function clearError(msg, el) { msg.textContent = ''; msg.className = 'kc-field-msg'; el.classList.remove('kc-input-error'); }

  // ========================================================================
  // CHARACTER COUNTER
  // ========================================================================
  function initCharCounter() {
    document.querySelectorAll('input[maxlength], textarea[maxlength]').forEach(function(el) {
      var max = parseInt(el.getAttribute("maxlength"), 10);
      var counter = document.createElement('span');
      counter.className = 'kc-char-count';
      el.parentNode.appendChild(counter);
      function update() { counter.textContent = el.value.length + '/' + max; }
      el.addEventListener('input', update);
      update();
    });
  }

  // ========================================================================
  // PASSWORD STRENGTH METER
  // ========================================================================
  function initPasswordStrength() {
    document.querySelectorAll('input[type="password"]').forEach(function(el) {
      if (el.closest('.kc-password-wrap')) return;
      var wrap = document.createElement('div');
      wrap.className = 'kc-password-wrap';
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
      var meter = document.createElement('div');
      meter.className = 'kc-pw-meter';
      meter.innerHTML = '<div class="kc-pw-bar"><div class="kc-pw-fill"></div></div><div class="kc-pw-label"></div>';
      wrap.appendChild(meter);
      var fill = meter.querySelector('.kc-pw-fill');
      var label = meter.querySelector('.kc-pw-label');

      el.addEventListener('input', function() {
        var val = el.value;
        var score = 0;
        if (val.length > 6) score++;
        if (val.length > 10) score++;
        if (/[a-z]/.test(val) && /[A-Z]/.test(val)) score++;
        if (/\d/.test(val)) score++;
        if (/[^a-zA-Z0-9]/.test(val)) score++;
        var pct = (score / 5) * 100;
        fill.style.width = pct + '%';
        var levels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
        var colors = ['', 'var(--kc-danger)', 'var(--kc-warning)', '#6366f1', 'var(--kc-success)', 'var(--kc-success)'];
        fill.style.background = colors[score] || 'var(--kc-accent)';
        label.textContent = score > 0 ? levels[score] : '';
      });
    });
  }

  // ========================================================================
  // FILE UPLOAD PREVIEW
  // ========================================================================
  function initFilePreview() {
    document.querySelectorAll('input[type="file"]').forEach(function(el) {
      var preview = document.createElement('div');
      preview.className = 'kc-file-preview';
      el.parentNode.appendChild(preview);
      el.addEventListener('change', function() {
        preview.innerHTML = '';
        Array.from(el.files).forEach(function(file) {
          if (file.type.startsWith('image/')) {
            var reader = new FileReader();
            reader.onload = function(e) { var img = document.createElement('img'); img.src = e.target.result; img.className = 'kc-file-thumb'; preview.appendChild(img); };
            reader.readAsDataURL(file);
          } else {
            var info = document.createElement('span');
            info.className = 'kc-file-info';
            info.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
            preview.appendChild(info);
          }
        });
      });
    });
  }

  // ========================================================================
  // DRAG-AND-DROP FILE ZONE
  // ========================================================================
  function initDragDrop() {
    document.querySelectorAll('[data-drag-drop]').forEach(function(zone) {
      zone.classList.add('kc-drop-zone');
      var input = zone.querySelector('input[type="file"]');
      if (!input) return;
      ['dragenter', 'dragover'].forEach(function(ev) { zone.addEventListener(ev, function(e) { e.preventDefault(); zone.classList.add('kc-drop-active'); }); });
      ['dragleave', 'drop'].forEach(function(ev) { zone.addEventListener(ev, function(e) { e.preventDefault(); zone.classList.remove('kc-drop-active'); }); });
      zone.addEventListener('drop', function(e) { if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; input.dispatchEvent(new Event('change')); } });
    });
  }

  // ========================================================================
  // AUTO-SAVE FORM DRAFTS
  // ========================================================================
  function initAutoSave() {
    document.querySelectorAll('form[data-autosave]').forEach(function(form) {
      var key = 'draft_' + window.location.pathname.replace(/\//g, '_');
      var inputs = form.querySelectorAll('input:not([type="password"]):not([type="file"]), textarea, select');
      function save() {
        var data = {};
        inputs.forEach(function(el) { if (el.name) data[el.name] = el.value; });
        KC.ls.set(key, data);
      }
      var debouncedSave = KC.debounce(save, 1000);
      inputs.forEach(function(el) { el.addEventListener('input', debouncedSave); el.addEventListener('change', debouncedSave); });
      var saved = KC.ls.get(key);
      if (saved) {
        inputs.forEach(function(el) { if (el.name && saved[el.name] !== undefined) el.value = saved[el.name]; });
      }
      form.addEventListener('submit', function() { KC.ls.remove(key); });
    });
  }

  // ========================================================================
  // DEBOUNCED SEARCH INPUT
  // ========================================================================
  function initSearchInput() {
    document.querySelectorAll('input[data-search]').forEach(function(input) {
      var results = document.getElementById(input.getAttribute('data-search')) || document.createElement('div');
      if (!results.id) { results.className = 'kc-search-results'; input.parentNode.appendChild(results); }
      input.addEventListener('input', KC.debounce(function() {
        var q = input.value.trim();
        if (q.length < 2) { results.innerHTML = ''; results.classList.remove('kc-search-active'); return; }
        results.classList.add('kc-search-active');
        results.innerHTML = '<div class="kc-search-loading">Searching...</div>';
      }, 300));
    });
  }

  // ========================================================================
  // TAG INPUT COMPONENT
  // ========================================================================
  function initTagInput() {
    document.querySelectorAll('[data-tags]').forEach(function(container) {
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'kc-tag-input';
      input.placeholder = 'Type and press Enter...';
      container.appendChild(input);
      var hidden = container.querySelector('input[type="hidden"]') || document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = container.getAttribute('data-tags') || 'tags';
      container.appendChild(hidden);
      var tags = [];
      function render() {
        container.querySelectorAll('.kc-tag').forEach(function(e) { e.remove(); });
        tags.forEach(function(tag, i) {
          var el = document.createElement('span');
          el.className = 'kc-tag';
          el.innerHTML = KC.escapeHtml(tag) + '<button class="kc-tag-remove" data-i="' + i + '">&times;</button>';
          container.insertBefore(el, input);
        });
        hidden.value = tags.join(',');
      }
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var val = input.value.trim();
          if (val && tags.indexOf(val) === -1) { tags.push(val); input.value = ''; render(); }
        }
        if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); render(); }
      });
      container.addEventListener('click', function(e) {
        if (e.target.classList.contains('kc-tag-remove')) { tags.splice(parseInt(e.target.getAttribute("data-i"), 10), 1); render(); }
      });
    });
  }

  // ========================================================================
  // OTP INPUT AUTO-ADVANCE
  // ========================================================================
  function initOTPInput() {
    var otp = document.querySelector('.kc-otp-wrap');
    if (!otp) return;
    var inputs = otp.querySelectorAll('input');
    inputs.forEach(function(input, i) {
      input.addEventListener('input', function() { if (this.value && i < inputs.length - 1) inputs[i + 1].focus(); });
      input.addEventListener('keydown', function(e) { if (e.key === 'Backspace' && !this.value && i > 0) inputs[i - 1].focus(); });
      input.addEventListener('paste', function(e) {
        e.preventDefault();
        var paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').split('');
        inputs.forEach(function(el, j) { if (paste[j]) el.value = paste[j]; if (j < inputs.length - 1) inputs[j + 1].focus(); });
      });
    });
  }

  // ========================================================================
  // MODAL SYSTEM
  // ========================================================================
  function openModal(options) {
    var modal = document.createElement('div');
    modal.className = 'kc-modal-overlay';
    modal.innerHTML = '<div class="kc-modal" role="dialog" aria-modal="true" aria-labelledby="kc-modal-title"><div class="kc-modal-header"><h3 id="kc-modal-title">' + KC.escapeHtml(options.title || '') + '</h3><button class="kc-modal-close" aria-label="Close">&times;</button></div><div class="kc-modal-body">' + (options.body || '') + '</div>' + (options.footer ? '<div class="kc-modal-footer">' + options.footer + '</div>' : '') + '</div>';
    document.body.appendChild(modal);
    requestAnimationFrame(function() {
      modal.classList.add('kc-modal-open');
      var releaseFocus = focusTrap(modal);
      modal._releaseFocus = releaseFocus;
    });
    var closeBtn = modal.querySelector('.kc-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { closeModal(modal); });
    modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(modal); });
    onEsc(function() { closeModal(modal); });
    return modal;
  }
  function closeModal(modal) {
    modal.classList.remove('kc-modal-open');
    if (modal._releaseFocus) modal._releaseFocus();
    setTimeout(function() { modal.remove(); }, 250);
  }

  // ========================================================================
  // ACCORDION COMPONENT
  // ========================================================================
  function initAccordion() {
    document.querySelectorAll('.kc-accordion').forEach(function(container) {
      container.querySelectorAll('.kc-accordion-item').forEach(function(item) {
        var header = item.querySelector('.kc-accordion-header');
        if (!header) return;
        header.addEventListener('click', function() {
          var isOpen = item.classList.contains('open');
          if (container.classList.contains('kc-accordion-exclusive')) {
            container.querySelectorAll('.kc-accordion-item.open').forEach(function(e) { e.classList.remove('open'); });
          }
          item.classList.toggle('open', !isOpen);
        });
      });
    });
  }

  // ========================================================================
  // TABS COMPONENT
  // ========================================================================
  function initTabs() {
    document.querySelectorAll('.kc-tabs').forEach(function(container) {
      var tabs = container.querySelectorAll('.kc-tab');
      var panels = container.querySelectorAll('.kc-tab-panel');
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          tabs.forEach(function(t) { t.classList.remove('active'); });
          panels.forEach(function(p) { p.classList.remove('active'); });
          tab.classList.add('active');
          var target = tab.getAttribute('data-tab');
          if (target) {
            var panel = container.querySelector('.kc-tab-panel[data-panel="' + target + '"]');
            if (panel) panel.classList.add('active');
          }
        });
      });
      var active = container.querySelector('.kc-tab.active') || tabs[0];
      if (active) active.click();
    });
  }

  // ========================================================================
  // TOOLTIP SYSTEM
  // ========================================================================
  function initTooltips() {
    var tipEl = document.createElement('div');
    tipEl.className = 'kc-tooltip';
    tipEl.id = 'kc-tooltip';
    document.body.appendChild(tipEl);
    var showTimeout, hideTimeout;

    document.addEventListener('mouseover', function(e) {
      var el = e.target.closest('[data-tip]');
      if (!el) { hideTooltip(); return; }
      clearTimeout(hideTimeout);
      showTimeout = setTimeout(function() {
        tipEl.textContent = el.getAttribute('data-tip');
        var rect = el.getBoundingClientRect();
        tipEl.className = 'kc-tooltip visible';
        tipEl.style.top = (rect.top - tipEl.offsetHeight - 8 + window.scrollY) + 'px';
        tipEl.style.left = (rect.left + rect.width / 2 - tipEl.offsetWidth / 2) + 'px';
      }, 300);
    }, { passive: true });

    document.addEventListener('mouseout', function(e) {
      if (e.target.closest('[data-tip]')) hideTooltip();
    }, { passive: true });

    function hideTooltip() {
      clearTimeout(showTimeout);
      hideTimeout = setTimeout(function() { tipEl.className = 'kc-tooltip'; }, 100);
    }
  }

  // ========================================================================
  // SCROLL REVEAL ANIMATIONS
  // ========================================================================
  function initScrollReveal() {
    var els = document.querySelectorAll('[data-reveal]');
    if (els.length === 0) return;
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('kc-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    els.forEach(function(el) {
      var delay = el.getAttribute('data-reveal-delay');
      if (delay) el.style.setProperty('--reveal-delay', delay + 'ms');
      observer.observe(el);
    });
  }

  // ========================================================================
  // TYPEWRITER EFFECT
  // ========================================================================
  function initTypewriter() {
    document.querySelectorAll('[data-typewrite]').forEach(function(el) {
      var text = el.getAttribute('data-typewrite') || el.textContent;
      var speed = parseInt(el.getAttribute("data-type-speed"), 10) || 50;
      el.textContent = '';
      el.style.visibility = 'visible';
      var i = 0;
      function type() {
        if (i < text.length) { el.textContent += text.charAt(i); i++; setTimeout(type, speed); }
      }
      type();
    });
  }

  // ========================================================================
  // TEXT TRUNCATION (show more/less)
  // ========================================================================
  function initTextTruncation() {
    document.querySelectorAll('[data-truncate]').forEach(function(el) {
      var limit = parseInt(el.getAttribute("data-truncate"), 10);
      var fullText = el.textContent;
      if (fullText.length <= limit) return;
      el.textContent = fullText.substr(0, limit) + '...';
      var btn = document.createElement('button');
      btn.className = 'kc-truncate-btn';
      btn.textContent = 'Show more';
      el.parentNode.appendChild(btn);
      var expanded = false;
      btn.addEventListener('click', function() {
        expanded = !expanded;
        el.textContent = expanded ? fullText : fullText.substr(0, limit) + '...';
        btn.textContent = expanded ? 'Show less' : 'Show more';
      });
    });
  }

  // ========================================================================
  // STAR RATING
  // ========================================================================
  function initStarRating() {
    document.querySelectorAll('.kc-stars').forEach(function(container) {
      var max = parseInt(container.getAttribute("data-max"), 10) || 5;
      var value = parseInt(container.getAttribute("data-value"), 10) || 0;
      var interactive = container.hasAttribute('data-interactive');
      var input = container.querySelector('input[type="hidden"]');
      for (var i = 1; i <= max; i++) {
        var star = document.createElement('span');
        star.className = 'kc-star' + (i <= value ? ' active' : '');
        star.textContent = '★';
        star.setAttribute('data-val', i);
        if (interactive) {
          star.addEventListener('click', function() {
            var v = parseInt(this.getAttribute("data-val"), 10);
            container.querySelectorAll('.kc-star').forEach(function(s, idx) { s.classList.toggle('active', idx < v); });
            if (input) input.value = v;
            KC.emit('rating', { value: v, container: container });
          });
          star.addEventListener('mouseenter', function() {
            var v = parseInt(this.getAttribute("data-val"), 10);
            container.querySelectorAll('.kc-star').forEach(function(s, idx) { s.classList.toggle('hover', idx < v); });
          });
          star.addEventListener('mouseleave', function() {
            container.querySelectorAll('.kc-star').forEach(function(s) { s.classList.remove('hover'); });
          });
        }
        container.appendChild(star);
      }
    });
  }

  // ========================================================================
  // PROGRESS CIRCLE (radial)
  // ========================================================================
  function initProgressCircle() {
    document.querySelectorAll('.kc-progress-circle').forEach(function(el) {
      var pct = parseInt(el.getAttribute("data-pct"), 10) || 0;
      var size = parseInt(el.getAttribute("data-size"), 10) || 80;
      var stroke = parseInt(el.getAttribute("data-stroke"), 10) || 6;
      var r = (size - stroke) / 2;
      var circ = 2 * Math.PI * r;
      el.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '"><circle cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="' + stroke + '"/><circle class="kc-pc-fill" cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="var(--kc-accent)" stroke-width="' + stroke + '" stroke-dasharray="' + circ + '" stroke-dashoffset="' + circ + '" stroke-linecap="round" transform="rotate(-90,' + size/2 + ',' + size/2 + ')"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" fill="currentColor" font-size="' + (size * 0.22) + '" font-weight="700">0%</text></svg>';
      var observer = new IntersectionObserver(function(entries) {
        if (entries[0].isIntersecting) {
          var offset = circ - (pct / 100) * circ;
          el.querySelector('.kc-pc-fill').style.transition = 'stroke-dashoffset 1.5s ease';
          el.querySelector('.kc-pc-fill').style.strokeDashoffset = offset;
          var text = el.querySelector('text');
          var start = performance.now();
          function step(now) {
            var p = Math.min((now - start) / 1500, 1);
            text.textContent = Math.round(p * pct) + '%';
            if (p < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
          observer.unobserve(el);
        }
      }, { threshold: 0.5 });
      observer.observe(el);
    });
  }

  // ========================================================================
  // SKELETON LOADERS
  // ========================================================================
  function initSkeletons() {
    document.querySelectorAll('[data-skeleton]').forEach(function(el) {
      el.classList.add('kc-skeleton');
      el.setAttribute('aria-hidden', 'true');
    });
  }

  // ========================================================================
  // IMAGE ZOOM ON HOVER
  // ========================================================================
  function initImageZoom() {
    document.querySelectorAll('[data-zoom]').forEach(function(el) {
      el.classList.add('kc-img-zoom');
      var lens = document.createElement('div');
      lens.className = 'kc-zoom-lens';
      document.body.appendChild(lens);
      el.addEventListener('mousemove', function(e) {
        var rect = el.getBoundingClientRect();
        var x = ((e.clientX - rect.left) / rect.width) * 100;
        var y = ((e.clientY - rect.top) / rect.height) * 100;
        lens.style.display = 'block';
        lens.style.backgroundImage = 'url(' + el.src + ')';
        lens.style.backgroundSize = rect.width * 2 + 'px ' + rect.height * 2 + 'px';
        lens.style.backgroundPosition = x + '% ' + y + '%';
        lens.style.left = (e.clientX - lens.offsetWidth / 2) + 'px';
        lens.style.top = (e.clientY - lens.offsetHeight / 2) + 'px';
      });
      el.addEventListener('mouseleave', function() { lens.style.display = 'none'; });
    });
  }

  // ========================================================================
  // VIDEO LIGHTBOX
  // ========================================================================
  function initVideoLightbox() {
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-video]');
      if (!btn) return;
      var url = btn.getAttribute('data-video');
      var embed = '';
      if (url.indexOf('youtube') !== -1 || url.indexOf('youtu.be') !== -1) {
        var id = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        if (id) embed = '<iframe src="https://www.youtube.com/embed/' + id[1] + '?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
      } else if (url.indexOf('vimeo') !== -1) {
        var id = url.match(/vimeo\.com\/(\d+)/);
        if (id) embed = '<iframe src="https://player.vimeo.com/video/' + id[1] + '?autoplay=1" frameborder="0" allow="autoplay" allowfullscreen></iframe>';
      } else {
        embed = '<video src="' + KC.escapeHtml(url) + '" controls autoplay></video>';
      }
      if (!embed) return;
      var overlay = document.createElement('div');
      overlay.className = 'kc-video-overlay';
      overlay.innerHTML = '<button class="kc-video-close">&times;</button><div class="kc-video-container">' + embed + '</div>';
      document.body.appendChild(overlay);
      requestAnimationFrame(function() { overlay.classList.add('open'); overlay._releaseFocus = focusTrap(overlay); });
      overlay.addEventListener('click', function(ev) { if (ev.target === overlay || ev.target.closest('.kc-video-close')) { overlay.classList.remove('open'); if (overlay._releaseFocus) overlay._releaseFocus(); setTimeout(function() { overlay.remove(); }, 300); } });
      onEsc(function() { overlay.classList.remove('open'); if (overlay._releaseFocus) overlay._releaseFocus(); setTimeout(function() { overlay.remove(); }, 300); });
    });
  }

  // ========================================================================
  // CAROUSEL / SLIDER
  // ========================================================================
  function initCarousel() {
    document.querySelectorAll('.kc-carousel').forEach(function(carousel) {
      var track = carousel.querySelector('.kc-carousel-track');
      var slides = track ? track.querySelectorAll('.kc-carousel-slide') : [];
      if (slides.length < 2) return;
      var current = 0;
      var autoplay = carousel.hasAttribute('data-autoplay');
      var interval = parseInt(carousel.getAttribute("data-interval"), 10) || 5000;
      var prevBtn = carousel.querySelector('.kc-carousel-prev');
      var nextBtn = carousel.querySelector('.kc-carousel-next');
      var dotsContainer = carousel.querySelector('.kc-carousel-dots');

      function goTo(idx) {
        if (idx < 0) idx = slides.length - 1;
        if (idx >= slides.length) idx = 0;
        current = idx;
        track.style.transform = 'translateX(-' + (current * 100) + '%)';
        if (dotsContainer) {
          dotsContainer.querySelectorAll('.kc-carousel-dot').forEach(function(d, i) { d.classList.toggle('active', i === current); });
        }
      }

      if (prevBtn) prevBtn.addEventListener('click', function() { goTo(current - 1); resetAuto(); });
      if (nextBtn) nextBtn.addEventListener('click', function() { goTo(current + 1); resetAuto(); });

      if (dotsContainer) {
        slides.forEach(function(_, i) {
          var dot = document.createElement('button');
          dot.className = 'kc-carousel-dot' + (i === 0 ? ' active' : '');
          dot.addEventListener('click', function() { goTo(i); resetAuto(); });
          dotsContainer.appendChild(dot);
        });
      }

      var autoTimer;
      function resetAuto() { if (autoplay) { clearInterval(autoTimer); autoTimer = setInterval(function() { goTo(current + 1); }, interval); } }
      resetAuto();
    });
  }

  // ========================================================================
  // FILTER BUTTONS
  // ========================================================================
  function initFilters() {
    document.querySelectorAll('[data-filter-group]').forEach(function(group) {
      var target = document.querySelector(group.getAttribute('data-filter-target')) || group.parentNode;
      group.querySelectorAll('[data-filter]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          group.querySelectorAll('[data-filter]').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          var filter = btn.getAttribute('data-filter');
          target.querySelectorAll('[data-category]').forEach(function(el) {
            if (filter === '*' || el.getAttribute('data-category') === filter) {
              el.style.display = '';
            } else {
              el.style.display = 'none';
            }
          });
        });
      });
    });
  }

  // ========================================================================
  // SORTABLE TABLES
  // ========================================================================
  function initSortableTables() {
    document.querySelectorAll('table[data-sortable]').forEach(function(table) {
      var tbody = table.querySelector('tbody');
      if (!tbody) return;
      table.querySelectorAll('th[data-sort]').forEach(function(th) {
        th.style.cursor = 'pointer';
        th.setAttribute('aria-sort', 'none');
        th.addEventListener('click', function() {
          var idx = Array.from(th.parentNode.children).indexOf(th);
          var dir = th.getAttribute('aria-sort') === 'asc' ? 'desc' : 'asc';
          th.closest('tr').querySelectorAll('th').forEach(function(h) { h.setAttribute('aria-sort', 'none'); });
          th.setAttribute('aria-sort', dir);
          var rows = Array.from(tbody.querySelectorAll('tr'));
          rows.sort(function(a, b) {
            var va = (a.children[idx] ? a.children[idx].textContent.trim() : '');
            var vb = (b.children[idx] ? b.children[idx].textContent.trim() : '');
            var na = parseFloat(va), nb = parseFloat(vb);
            if (!isNaN(na) && !isNaN(nb)) return dir === 'asc' ? na - nb : nb - na;
            return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
          });
          rows.forEach(function(row) { tbody.appendChild(row); });
        });
      });
    });
  }

  // ========================================================================
  // TABLE SEARCH / FILTER
  // ========================================================================
  function initTableSearch() {
    document.querySelectorAll('input[data-table-search]').forEach(function(input) {
      var table = document.querySelector(input.getAttribute('data-table-search'));
      if (!table) return;
      input.addEventListener('input', KC.debounce(function() {
        var q = input.value.toLowerCase();
        table.querySelectorAll('tbody tr').forEach(function(row) {
          var match = Array.from(row.children).some(function(cell) { return cell.textContent.toLowerCase().includes(q); });
          row.style.display = match ? '' : 'none';
        });
      }, 200));
    });
  }

  // ========================================================================
  // EXPORT TABLE TO CSV
  // ========================================================================
  function initTableExport() {
    document.querySelectorAll('[data-export-csv]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var table = document.querySelector(btn.getAttribute('data-export-csv'));
        if (!table) return;
        var rows = Array.from(table.querySelectorAll('tr'));
        var csv = rows.map(function(row) {
          return Array.from(row.querySelectorAll('th, td')).map(function(cell) {
            return '"' + cell.textContent.replace(/"/g, '""') + '"';
          }).join(',');
        }).join('\n');
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'export.csv';
        link.click();
      });
    });
  }

  // ========================================================================
  // SHARE BUTTONS
  // ========================================================================
  function initShareButtons() {
    document.querySelectorAll('[data-share]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var url = encodeURIComponent(btn.getAttribute('data-share-url') || window.location.href);
        var text = encodeURIComponent(btn.getAttribute('data-share-text') || document.title);
        var platform = btn.getAttribute('data-share');
        var href = '';
        if (platform === 'twitter') href = 'https://twitter.com/intent/tweet?text=' + text + '&url=' + url;
        else if (platform === 'facebook') href = 'https://www.facebook.com/sharer/sharer.php?u=' + url;
        else if (platform === 'linkedin') href = 'https://www.linkedin.com/sharing/share-offsite/?url=' + url;
        else if (platform === 'reddit') href = 'https://reddit.com/submit?url=' + url + '&title=' + text;
        else if (platform === 'email') href = 'mailto:?subject=' + text + '&body=' + url;
        else if (platform === 'copy') { copyToClipboard(decodeURIComponent(url)).then(function() { showToast('Link copied to clipboard', 'success'); }); return; }
        if (href) window.open(href, '_blank', 'width=600,height=400');
      });
    });
  }

  // ========================================================================
  // BREADCRUMB GENERATOR
  // ========================================================================
  function genBreadcrumbs() {
    if (!document.querySelector('[data-breadcrumbs]')) return;
    var container = document.getElementById('kc-breadcrumbs') || document.querySelector('[data-breadcrumbs]');
    if (!container) return;
    var parts = window.location.pathname.replace(/\.html$/, '').split('/').filter(Boolean);
    if (parts.length === 0) { container.style.display = 'none'; return; }
    var html = '<a href="/">Home</a>';
    var path = '';
    parts.forEach(function(part, i) {
      path += '/' + part;
      var name = part.replace(/-/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
      if (i === parts.length - 1) { html += '<span class="kc-breadcrumb-sep">/</span><span aria-current="page">' + name + '</span>'; }
      else { html += '<span class="kc-breadcrumb-sep">/</span><a href="' + path + '.html">' + name + '</a>'; }
    });
    container.innerHTML = '<nav aria-label="Breadcrumb">' + html + '</nav>';
  }

  // ========================================================================
  // ANNOUNCEMENT BAR
  // ========================================================================
  function initAnnouncementBar() {
    if (KC.ls.get('announcement-closed')) return;
    var text = document.querySelector('meta[name="kc-announcement"]');
    if (!text) return;
    var bar = document.createElement('div');
    bar.id = 'kc-announcement';
    bar.className = 'kc-announcement';
    bar.innerHTML = '<div class="kc-announcement-inner"><span class="kc-announcement-text">' + KC.escapeHtml(text.getAttribute('content')) + '</span><button id="kc-announcement-close" aria-label="Dismiss">&times;</button></div>';
    document.body.insertBefore(bar, document.body.firstChild);
    document.getElementById('kc-announcement-close').addEventListener('click', function() { bar.remove(); KC.ls.set('announcement-closed', true); });
    var curPad = parseInt(document.body.style.paddingTop, 10) || 0;
    document.body.style.paddingTop = (curPad + 44) + 'px';
  }

  // ========================================================================
  // COUNTDOWN TIMER
  // ========================================================================
  function initCountdown() {
    document.querySelectorAll('[data-countdown]').forEach(function(el) {
      var target = new Date(el.getAttribute('data-countdown')).getTime();
      function tick() {
        var diff = target - Date.now();
        if (diff <= 0) { el.textContent = 'Expired'; return; }
        var d = Math.floor(diff / 86400000);
        var h = Math.floor((diff % 86400000) / 3600000);
        var m = Math.floor((diff % 3600000) / 60000);
        var s = Math.floor((diff % 60000) / 1000);
        el.textContent = d + 'd ' + h + 'h ' + m + 'm ' + s + 's';
      }
      tick();
      setInterval(tick, 1000);
    });
  }

  // ========================================================================
  // CONFETTI EFFECT
  // ========================================================================
  function fireConfetti() {
    var colors = ['#6366f1', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];
    for (var i = 0; i < 80; i++) {
      var el = document.createElement('div');
      el.className = 'kc-confetti';
      el.style.cssText = 'left:' + Math.random() * 100 + 'vw;background:' + colors[Math.floor(Math.random() * colors.length)] + ';animation-duration:' + (1.5 + Math.random() * 2) + 's;animation-delay:' + (Math.random() * 0.5) + 's;width:' + (6 + Math.random() * 6) + 'px;height:' + (6 + Math.random() * 6) + 'px;border-radius:' + (Math.random() > 0.5 ? '50%' : '2px');
      document.body.appendChild(el);
      setTimeout(function() { el.remove(); }, 4000);
    }
  }

  // ========================================================================
  // PAGE VIEW COUNTER
  // ========================================================================
  function trackPageView() {
    var key = 'pageview_' + window.location.pathname;
    var count = KC.ls.get(key) || 0;
    count++;
    KC.ls.set(key, count);
    var el = document.querySelector('[data-pageviews]');
    if (el) el.textContent = KC.formatNumber(count);
  }

  // ========================================================================
  // RELATED CONTENT SUGGESTION
  // ========================================================================
  function showRelatedContent() {
    var container = document.querySelector('[data-related]');
    if (!container) return;
    var topics = (container.getAttribute('data-related') || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    var pages = [
      { name: 'Getting Started with AI Builder', url: '/ai-builder.html', tags: 'ai,builder,getting-started' },
      { name: 'Pricing Plans & Features', url: '/pricing.html', tags: 'pricing,plans,features' },
      { name: 'API Documentation', url: '/docs.html', tags: 'api,docs,reference' },
      { name: 'Latest Blog Posts', url: '/blog.html', tags: 'blog,news,updates' },
      { name: 'Support Center', url: '/support.html', tags: 'support,help,faq' },
      { name: 'Community Gallery', url: '/gallery.html', tags: 'gallery,community,showcase' },
    ];
    var related = pages.filter(function(p) { return topics.some(function(t) { return p.tags.indexOf(t) !== -1; }); }).slice(0, 3);
    if (related.length === 0) { container.style.display = 'none'; return; }
    container.textContent = '';
    var rh = document.createElement('h3'); rh.className = 'kc-related-title'; rh.textContent = 'Related Content'; container.appendChild(rh);
    var grid = document.createElement('div'); grid.className = 'kc-related-grid'; container.appendChild(grid);
    related.forEach(function(p) { var a = document.createElement('a'); a.href = p.url; a.className = 'kc-related-card'; var s = document.createElement('span'); s.className = 'kc-related-name'; s.textContent = p.name; a.appendChild(s); grid.appendChild(a); });
  }

  // ========================================================================
  // TESTIMONIAL ROTATOR
  // ========================================================================
  function initTestimonials() {
    document.querySelectorAll('.kc-testimonials').forEach(function(container) {
      var items = container.querySelectorAll('.kc-testimonial');
      if (items.length < 2) return;
      var current = 0;
      var interval = parseInt(container.getAttribute("data-interval"), 10) || 5000;
      items.forEach(function(item, i) { item.style.display = i === 0 ? '' : 'none'; });
      setInterval(function() {
        items[current].style.display = 'none';
        current = (current + 1) % items.length;
        items[current].style.display = '';
        items[current].classList.add('kc-testimonial-in');
        setTimeout(function() { items[current].classList.remove('kc-testimonial-in'); }, 500);
      }, interval);
    });
  }

  // ========================================================================
  // PRICING TOGGLE (monthly / yearly)
  // ========================================================================
  function initPricingToggle() {
    document.querySelectorAll('[data-pricing-toggle]').forEach(function(toggle) {
      var monthly = toggle.querySelector('[data-period="monthly"]');
      var yearly = toggle.querySelector('[data-period="yearly"]');
      var container = toggle.closest('[data-pricing]') || document;
      function setPeriod(period) {
        container.querySelectorAll('[data-monthly], [data-yearly]').forEach(function(el) {
          var show = period === 'monthly' ? el.hasAttribute('data-monthly') : el.hasAttribute('data-yearly');
          el.style.display = show ? '' : 'none';
        });
        if (monthly) monthly.classList.toggle('active', period === 'monthly');
        if (yearly) yearly.classList.toggle('active', period === 'yearly');
      }
      if (monthly) monthly.addEventListener('click', function() { setPeriod('monthly'); KC.ls.set('pricing-period', 'monthly'); });
      if (yearly) yearly.addEventListener('click', function() { setPeriod('yearly'); KC.ls.set('pricing-period', 'yearly'); });
      var saved = KC.ls.get('pricing-period');
      setPeriod(saved || 'monthly');
    });
  }

  // ========================================================================
  // SKIP TO CONTENT (accessibility)
  // ========================================================================
  function injectSkipLink() {
    var link = document.createElement('a');
    link.href = '#kc-main-content';
    link.className = 'kc-skip-link';
    link.textContent = 'Skip to content';
    document.body.insertBefore(link, document.body.firstChild);
    var main = document.querySelector('main, [role="main"], .container') || document.body;
    main.id = main.id || 'kc-main-content';
  }

  // ========================================================================
  // FONT SIZE ADJUSTER
  // ========================================================================
  function initFontSize() {
    var saved = KC.ls.get('font-size');
    if (saved) document.documentElement.style.fontSize = saved + '%';

    var current = parseInt(KC.ls.get('font-size'), 10) || 100;
    safeQ('[data-font-controls]', function(controls) {
      safeQ('[data-font-dec]', function(btn) { btn.addEventListener('click', function() { adjustFont(-10); }); });
      safeQ('[data-font-inc]', function(btn) { btn.addEventListener('click', function() { adjustFont(10); }); });
      safeQ('[data-font-reset]', function(btn) { btn.addEventListener('click', function() { adjustFont(0, true); }); });
    });

    function adjustFont(delta, reset) {
      current = reset ? 100 : Math.min(150, Math.max(75, current + delta));
      document.documentElement.style.fontSize = current + '%';
      KC.ls.set('font-size', current);
    }
  }

  // ========================================================================
  // REDUCED MOTION
  // ========================================================================
  function initReducedMotion() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.classList.add('kc-reduced-motion');
    }
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function(e) {
      document.documentElement.classList.toggle('kc-reduced-motion', e.matches);
    });
  }

  // ========================================================================
  // HIGH CONTRAST MODE
  // ========================================================================
  function initHighContrast() {
    var saved = KC.ls.get('high-contrast');
    if (saved) document.documentElement.classList.add('kc-high-contrast');

    safeQ('[data-contrast-toggle]', function(btn) {
      btn.addEventListener('click', function() {
        var on = document.documentElement.classList.toggle('kc-high-contrast');
        KC.ls.set('high-contrast', on);
        showToast(on ? 'High contrast enabled' : 'High contrast disabled', 'info');
      });
    });
  }

  // ========================================================================
  // PAGE VISIBILITY (track if user is away)
  // ========================================================================
  function initPageVisibility() {
    document.addEventListener('visibilitychange', function() {
      KC.emit('visibility', { hidden: document.hidden });
    });
  }

  // ========================================================================
  // NETWORK INFORMATION
  // ========================================================================
  function initNetworkInfo() {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return;
    function update() {
      var badge = document.querySelector('.kc-connection-badge .kc-conn-text');
      if (badge && conn.effectiveType) badge.textContent = conn.effectiveType.toUpperCase();
    }
    conn.addEventListener('change', update);
    update();
  }

  // ========================================================================
  // IMAGE LAZY LOADING WITH BLUR
  // ========================================================================
  function initLazyImages() {
    document.querySelectorAll('img[loading="lazy"], img[data-src]').forEach(function(img) {
      var src = img.getAttribute('data-src') || img.src;
      if (img.hasAttribute('data-src')) {
        img.classList.add('kc-blur-load');
        var observer = new IntersectionObserver(function(entries) {
          if (entries[0].isIntersecting) {
            img.src = src;
            img.addEventListener('load', function() { img.classList.add('kc-blur-loaded'); });
            observer.unobserve(img);
          }
        }, { rootMargin: '200px' });
        observer.observe(img);
      }
    });
  }

  // ========================================================================
  // PRINT PAGE
  // ========================================================================
  function initPrint() {
    document.querySelectorAll('[data-print]').forEach(function(btn) {
      btn.addEventListener('click', function() { window.print(); });
    });
  }

  // ========================================================================
  // PARALLAX SECTIONS
  // ========================================================================
  function initParallax() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('[data-parallax]').forEach(function(el) {
      window.addEventListener('scroll', KC.throttle(function() {
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.3;
        var rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          var offset = rect.top * speed;
          el.style.backgroundPositionY = offset + 'px';
        }
      }, 50), { passive: true });
    });
  }

  // ========================================================================
  // STARFIELD / PARTICLES BACKGROUND
  // ========================================================================
  function initParticles() {
    var container = document.querySelector('[data-particles]');
    if (!container) return;
    var count = parseInt(container.getAttribute("data-particles"), 10) || 50;
    for (var i = 0; i < count; i++) {
      var dot = document.createElement('div');
      dot.className = 'kc-particle';
      dot.style.cssText = 'left:' + Math.random() * 100 + '%;top:' + Math.random() * 100 + '%;animation-delay:' + (Math.random() * 5) + 's;animation-duration:' + (3 + Math.random() * 4) + 's;width:' + (2 + Math.random() * 3) + 'px;height:' + (2 + Math.random() * 3) + 'px';
      container.appendChild(dot);
    }
  }

  // ========================================================================
  // MAX MOTION — 3D tilt + reveal + counters + magnetic
  // ========================================================================
  function initMaxMotion() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var io = new IntersectionObserver(function(es) {
      es.forEach(function(e) { if (e.isIntersecting) { e.target.classList.add('kc-revealed', 'kc-float-in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll('.kc-card, .card, .glass, section > div, article, .product-card, .work-card').forEach(function(el) {
      el.classList.add('kc-anim');
      io.observe(el);
    });
    document.querySelectorAll('.kc-card, .card, .glass, .product-card').forEach(function(card) {
      card.style.transformStyle = 'preserve-3d';
      card.addEventListener('mousemove', function(e) {
        var r = card.getBoundingClientRect();
        var x = ((e.clientX - r.left) / r.width - 0.5) * 10;
        var y = ((e.clientY - r.top) / r.height - 0.5) * -10;
        card.style.transform = 'perspective(900px) rotateX(' + y.toFixed(2) + 'deg) rotateY(' + x.toFixed(2) + 'deg) translateY(-3px)';
      });
      card.addEventListener('mouseleave', function() { card.style.transform = ''; });
    });
    document.querySelectorAll('.btn, .kc-btn, button').forEach(function(b) {
      b.addEventListener('mousemove', function(e) {
        var r = b.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.12;
        var y = (e.clientY - r.top - r.height / 2) * 0.18;
        b.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      });
      b.addEventListener('mouseleave', function() { b.style.transform = ''; });
    });
  }

  // ========================================================================
  // DOWNLOAD TRACKER
  // ========================================================================
  function initDownloadTracking() {
    document.addEventListener('click', function(e) {
      var a = e.target.closest('a[download]');
      if (!a) return;
      var name = a.getAttribute('download') || a.pathname.split('/').pop();
      KC.emit('download', { file: name, url: a.href });
    });
  }

  // ========================================================================
  // LIGHTBOX (image)
  // ========================================================================
  function initLightbox() {
    document.addEventListener('click', function(e) {
      var img = e.target.closest('img[data-lightbox]');
      if (!img) return;
      var overlay = document.createElement('div');
      overlay.className = 'kc-lightbox';
      var alt = KC.escapeHtml(img.getAttribute('alt') || '');
      var caption = KC.escapeHtml(img.getAttribute('data-caption') || '');
      overlay.innerHTML = '<button class="kc-lightbox-close" aria-label="Close">&times;</button><img src="' + KC.escapeHtml(img.src) + '" alt="' + alt + '"><div class="kc-lightbox-caption">' + caption + '</div>';
      document.body.appendChild(overlay);
      requestAnimationFrame(function() { overlay.classList.add('kc-lightbox-open'); overlay._releaseFocus = focusTrap(overlay); });
      overlay.addEventListener('click', function(ev) { if (ev.target === overlay || ev.target.closest('.kc-lightbox-close')) { overlay.classList.remove('kc-lightbox-open'); if (overlay._releaseFocus) overlay._releaseFocus(); setTimeout(function() { overlay.remove(); }, 300); } });
      onEsc(function() { overlay.classList.remove('kc-lightbox-open'); if (overlay._releaseFocus) overlay._releaseFocus(); setTimeout(function() { overlay.remove(); }, 300); });
    });
  }

  // ========================================================================
  // KEYBOARD SHORTCUTS (global)
  // ========================================================================
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openCommandPalette(); }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); toggleShortcutsModal(); }
      if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); var btn = document.getElementById('kc-theme-btn'); if (btn) btn.click(); }
      if (e.key === 'h' && !e.ctrlKey && !e.metaKey && !e.target.closest('input, textarea, select')) { e.preventDefault(); window.location.href = '/'; }
      if (e.key === 's' && !e.ctrlKey && !e.metaKey && !e.target.closest('input, textarea, select')) { e.preventDefault(); var searchInput = document.querySelector('#kc-palette-input, input[data-search]'); if (searchInput) searchInput.focus(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); var btn2 = document.getElementById('kc-theme-btn'); if (btn2) btn2.click(); }
    });
  }

  // ========================================================================
  // THEME OVERRIDES
  // ========================================================================
  function applyThemeOverrides() {
    var legacyVars = {
      '--primary': '#6366f1', '--slate': '#111117', '--obsidian': '#0a0a0f', '--void': '#0a0a0a',
      '--white': '#ffffff', '--ash': 'rgba(255,255,255,0.4)', '--bg': '#0a0a0a',
      '--glass-border': 'rgba(255,255,255,0.06)', '--success': '#10b981', '--warning': '#f59e0b', '--danger': '#ef4444',
      '--font-body': "'Inter', -apple-system, sans-serif",
    };
    var root = document.documentElement;
    for (var key in legacyVars) { if (!root.style.getPropertyValue(key)) root.style.setProperty(key, legacyVars[key]); }

    document.querySelectorAll('[style*="background:#fff"], [style*="background: #fff"], [style*="background:white"], [style*="background-color:#fff"], [style*="background:#ffffff"]').forEach(function(el) { el.style.setProperty('background', 'var(--kc-bg2)', 'important'); });
    document.querySelectorAll('[style*="color:#000"], [style*="color: #000"], [style*="color:#333"], [style*="color: #333"], [style*="color:#666"], [style*="color: #666"]').forEach(function(el) { el.style.setProperty('color', 'var(--kc-text2)', 'important'); });
    document.querySelectorAll('a').forEach(function(a) { var c = a.style.color; if (c === 'blue' || c === '#0000ee' || c === 'rgb(0, 0, 238)' || c === '#000') a.style.color = 'var(--kc-accent)'; });
    document.querySelectorAll('nav:not(#kc-nav):not(.kc-nav)').forEach(function(n) { n.style.display = 'none'; });
    document.querySelectorAll('select, textarea').forEach(function(el) { var bg = getComputedStyle(el).background; if (bg === 'white' || bg === '#fff' || bg === '#ffffff' || bg.indexOf('rgb(255,255,255)') !== -1) { el.style.background = 'rgba(255,255,255,0.05)'; el.style.color = '#fff'; } });
    document.querySelectorAll('[style*="background:#ef4444"], [style*="background: #ef4444"]').forEach(function(el) { el.style.color = '#fff'; });
  }

  // ========================================================================
  // INIT - MAIN ENTRY POINT
  // ========================================================================
  function init() {
    if (!document.body) { setTimeout(init, 50); return; }

    // expose KC API globally
    window.KC = KC;
    window.showToast = showToast;
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.fireConfetti = fireConfetti;
    window.copyToClipboard = copyToClipboard;

    showLoading();
    stripOldCSS();
    injectSkipLink();
    initReducedMotion();
    genBreadcrumbs();
    initAnnouncementBar();
    trackPageView();

    if (!isAuthPage && !isErrorPage && !isAppPage) {
      injectNav();
      injectFooter();
      injectBackToTop();
      addPageTransition();
      injectCookieBanner();
      injectConnectionStatus();
      initSmoothScroll();
      initCountUp();
      initFormValidation();
      initLightbox();
      initKeyboardShortcuts();
      initThemeSwitcher();
      initReadingProgress();
      genTOC();
      showReadingTime();
      initCodeCopy();
      initCharCounter();
      initPasswordStrength();
      initFilePreview();
      initDragDrop();
      initAutoSave();
      initSearchInput();
      initTagInput();
      initOTPInput();
      initAccordion();
      initTabs();
      initTooltips();
      initScrollReveal();
      initTypewriter();
      initTextTruncation();
      initStarRating();
      initProgressCircle();
      initSkeletons();
      initImageZoom();
      initVideoLightbox();
      initCarousel();
      initFilters();
      initSortableTables();
      initTableSearch();
      initTableExport();
      initShareButtons();
      initCountdown();
      initTestimonials();
      initPricingToggle();
      initFontSize();
      initHighContrast();
      initPageVisibility();
      initNetworkInfo();
      initLazyImages();
      initPrint();
      initDownloadTracking();
      showRelatedContent();
      setTimeout(interceptLinks, 100);
    }

    // non-auth features
    initParticles();
    initParallax();
    initMaxMotion();

    applyThemeOverrides();

    hideLoading();
    document.body.classList.add('kc-theme-injected');
    KC.emit('ready', { path: window.location.pathname });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
