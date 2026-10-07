/* KEYCODE — standalone footer for pages that don't use theme.js chrome */
(function () {
  function ready(fn) { document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    var host = document.getElementById('site-footer');
    if (!host || document.getElementById('kc-standalone-footer')) return;

    var f = document.createElement('footer');
    f.id = 'kc-standalone-footer';
    var css = [
      'margin-top:64px', 'border-top:1px solid rgba(255,255,255,0.08)', 'background:#07070c',
      'color:#9ca3af', 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace', 'font-size:13px'
    ].join(';');
    f.setAttribute('style', css);
    f.innerHTML = [
      '<div style="max-width:1200px;margin:0 auto;padding:36px 20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:24px">',
      '<div>',
      '<div style="color:#fff;font-weight:700;letter-spacing:0.18em;margin-bottom:8px">KEYCODE</div>',
      '<p style="margin:0 0 12px;line-height:1.6">Build software by describing it — websites, games, PCBs and firmware from a single prompt.</p>',
      '<div style="display:flex;gap:14px">',
      '<a href="/" aria-label="GitHub" style="color:#9ca3af">GitHub</a>',
      '<a href="/" aria-label="X / Twitter" style="color:#9ca3af">X</a>',
      '<a href="/" aria-label="Discord" style="color:#9ca3af">Discord</a>',
      '<a href="/" aria-label="YouTube" style="color:#9ca3af">YouTube</a>',
      '</div></div>',
      '<div><h4 style="color:#fff;font-size:12px;letter-spacing:0.14em;margin:0 0 10px">BUILD</h4>',
      '<a href="/ai-builder.html" style="display:block;color:#9ca3af;text-decoration:none;margin-bottom:6px">AI Builder</a>',
      '<a href="/game-builder.html" style="display:block;color:#9ca3af;text-decoration:none;margin-bottom:6px">Game Builder</a>',
      '<a href="/tools.html" style="display:block;color:#9ca3af;text-decoration:none;margin-bottom:6px">Dev Tools</a>',
      '<a href="/api-keys.html" style="display:block;color:#9ca3af;text-decoration:none;margin-bottom:6px">API Keys</a>',
      '</div>',
      '<div><h4 style="color:#fff;font-size:12px;letter-spacing:0.14em;margin:0 0 10px">RESOURCES</h4>',
      '<a href="/blog.html" style="display:block;color:#9ca3af;text-decoration:none;margin-bottom:6px">Blog</a>',
      '<a href="/docs.html" style="display:block;color:#9ca3af;text-decoration:none;margin-bottom:6px">Docs</a>',
      '<a href="/gallery.html" style="display:block;color:#9ca3af;text-decoration:none;margin-bottom:6px">Gallery</a>',
      '<a href="/status.html" style="display:block;color:#9ca3af;text-decoration:none;margin-bottom:6px">Status</a>',
      '</div>',
      '<div><h4 style="color:#fff;font-size:12px;letter-spacing:0.14em;margin:0 0 10px">COMPANY</h4>',
      '<a href="/support.html" style="display:block;color:#9ca3af;text-decoration:none;margin-bottom:6px">Support</a>',
      '<a href="/privacy.html" style="display:block;color:#9ca3af;text-decoration:none;margin-bottom:6px">Privacy</a>',
      '<a href="/terms.html" style="display:block;color:#9ca3af;text-decoration:none;margin-bottom:6px">Terms</a>',
      '<a href="/os.html" style="display:block;color:#9ca3af;text-decoration:none;margin-bottom:6px">Download OS</a>',
      '</div>',
      '<div style="grid-column:1/-1;border-top:1px solid rgba(255,255,255,0.08);margin-top:8px;padding-top:18px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">',
      '<span>© ' + new Date().getFullYear() + ' KEYCODE — all rights reserved</span>',
      '<code style="background:#101018;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;color:#22d3ee;font-size:12px">curl -fsSL ' + location.origin + '/install.sh | bash</code>',
      '</div>',
      '</div>',
    ].join('');
    host.appendChild(f);
  });
})();
