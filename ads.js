/* KEYCODE Monetization loader — include on any page:
   <script src="/ads.js" defer></script>
   Reads /api/monetization and injects slots automatically. Nothing else needed. */
(function () {
  if (window.__kcMonetizationLoaded) return;
  window.__kcMonetizationLoaded = true;

  var api = '/api/monetization';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function css() {
    var s = document.createElement('style');
    s.id = 'kc-mono-style';
    s.textContent = [
      '.kc-ad{max-width:1200px;margin:14px auto;padding:10px 14px;border:1px solid rgba(148,163,184,.25);',
      'border-radius:12px;background:rgba(15,18,30,.6);display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;text-align:center;}',
      '.kc-ad__label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.55;margin-right:6px;}',
      '.kc-aff-grid{max-width:1200px;margin:18px auto;padding:0 16px;display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));}',
      '.kc-aff-card{border:1px solid rgba(148,163,184,.25);border-radius:14px;padding:14px;background:rgba(15,18,30,.6);transition:transform .15s ease,border-color .15s ease;}',
      '.kc-aff-card:hover{transform:translateY(-2px);border-color:rgba(139,92,246,.6);}',
      '.kc-aff-card img{width:100%;height:110px;object-fit:cover;border-radius:8px;margin-bottom:10px;}',
      '.kc-aff-card h4{margin:0 0 6px;font-size:15px;}',
      '.kc-aff-card p{margin:0 0 10px;font-size:12.5px;opacity:.75;}',
      '.kc-aff-card a{display:inline-block;font-size:12.5px;text-decoration:none;padding:7px 12px;border-radius:8px;',
      'background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:600;}',
      '.kc-donate{max-width:1200px;margin:18px auto;padding:14px 18px;border-radius:14px;text-align:center;',
      'background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(236,72,153,.12));border:1px solid rgba(139,92,246,.35);}',
      '.kc-donate p{margin:0 0 10px;font-size:14px;opacity:.9;}',
      '.kc-donate a{display:inline-block;margin:4px 5px;padding:8px 16px;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px;',
      'background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;}',
      '.kc-donate a.alt{background:linear-gradient(135deg,#ec4899,#f43f5e);}'
    ].join('');
    document.head.appendChild(s);
  }

  function slot(pos) {
    var el = document.createElement('div');
    el.className = 'kc-ad';
    el.setAttribute('data-kc-ad', pos);
    el.innerHTML = '<span class="kc-ad__label">Ad</span>';
    return el;
  }

  function injectAds(m) {
    var a = m.ads || {};
    if (a.header) {
      var h = slot('header');
      (document.querySelector('header') || document.body).insertAdjacentElement('afterend', h);
    }
    if (a.footer) {
      var f = slot('footer');
      (document.querySelector('footer') || document.body).appendChild(f);
    }
    // Load real ad network script when configured
    if (a.network === 'adsense' && a.networkClientId) {
      var sc = document.createElement('script');
      sc.async = true;
      sc.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(a.networkClientId);
      sc.crossOrigin = 'anonymous';
      document.head.appendChild(sc);
    } else if (a.network === 'adsterra' && a.networkClientId) {
      var at = document.createElement('script');
      at.async = true;
      at.src = '//pl' + String(a.networkClientId).replace(/[^0-9]/g, '') + '.profitableratecpm.com/' + encodeURIComponent(a.networkClientId) + '/invoke.js';
      document.head.appendChild(at);
    }
    // Placeholder visuals when no network configured yet
    if (a.network === 'none') {
      document.querySelectorAll('.kc-ad').forEach(function (el) {
        var note = document.createElement('span');
        note.style.cssText = 'font-size:12px;opacity:.5';
        note.textContent = 'Ad slot ready — add your network ID in Admin → Monetization';
        el.appendChild(note);
      });
    }
  }

  function injectAffiliates(m) {
    var items = (m.affiliate && m.affiliate.items) || [];
    if (!items.length) return;
    var wrap = document.createElement('div');
    wrap.className = 'kc-aff-grid';
    wrap.innerHTML = items.map(function (it) {
      return '<div class="kc-aff-card">'
        + (it.image ? '<img src="' + esc(it.image) + '" alt="" loading="lazy">' : '')
        + '<h4>' + esc(it.title) + '</h4>'
        + (it.blurb ? '<p>' + esc(it.blurb) + '</p>' : '')
        + '<a href="' + esc(it.url) + '" target="_blank" rel="noopener sponsored">Check it out →</a>'
        + '</div>';
    }).join('');
    (document.querySelector('footer') || document.body).insertAdjacentElement('beforeend', wrap);
    var lbl = document.createElement('div');
    lbl.style.cssText = 'text-align:center;font-size:11px;opacity:.5;margin:4px auto 18px;max-width:1200px';
    lbl.textContent = 'Sponsored recommendations';
    wrap.insertAdjacentElement('beforebegin', lbl);
  }

  function injectDonations(m) {
    var d = m.donations;
    if (!d) return;
    var links = [];
    if (d.kofi) links.push(['Buy Me a Chai ☕', d.kofi, '']);
    if (d.buymeacoffee) links.push(['Buy Me a Coffee ☕', d.buymeacoffee, 'alt']);
    if (d.paypal) links.push(['PayPal 💳', d.paypal, 'alt']);
    if (d.upiId) links.push(['UPI: ' + d.upiId, 'upi://pay?pa=' + encodeURIComponent(d.upiId) + '&pn=KEYCODE%20Studio&cu=INR', '']);
    if (!links.length) return;
    var el = document.createElement('div');
    el.className = 'kc-donate';
    el.innerHTML = '<p>' + esc(d.message || 'Support KEYCODE Studio ❤') + '</p>'
      + links.map(function (l) { return '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener"' + (l[2] ? ' class="' + l[2] + '"' : '') + '>' + esc(l[0]) + '</a>'; }).join('');
    (document.querySelector('footer') || document.body).insertAdjacentElement('beforebegin', el);
  }

  function injectPremium(m) {
    var p = m.premium;
    if (!p) return;
    var el = document.createElement('div');
    el.className = 'kc-donate';
    el.style.borderColor = 'rgba(16,185,129,.45)';
    el.innerHTML = '<p><b>⭐ KEYCODE Premium</b> — ' + esc((p.perks || []).join(' · '))
      + '</p><p style="margin-top:6px;font-size:13px">₹' + esc(p.monthlyPriceINR) + '/mo · ₹' + esc(p.yearlyPriceINR) + '/yr</p>'
      + '<a href="/checkout.html?plan=premium" style="background:linear-gradient(135deg,#10b981,#059669)">Go Premium — ad-free</a>';
    (document.querySelector('footer') || document.body).insertAdjacentElement('beforebegin', el);
  }

  function boot() {
    css();
    fetch(api).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
      if (!m || m.enabled === false) return;
      if (m.ads && m.ads.enabled) injectAds(m);
      if (m.affiliate && m.affiliate.enabled) injectAffiliates(m);
      if (m.donations) injectDonations(m);
      if (m.premium) injectPremium(m);
    }).catch(function () { /* never break the page over ads */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
