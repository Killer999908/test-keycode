/**
 * KEYCODE Studio — Universal "Install App" System
 * ================================================
 * Gives every platform a native-app install path:
 *  - Chromium desktop/Android : real PWA install (beforeinstallprompt)
 *  - iOS/iPadOS               : guided Add-to-Home-Screen
 *  - macOS                    : PWA install OR .dmg-style instructions
 *  - Windows                  : PWA install (taskbar + Start menu)
 *  - Linux                    : PWA install (Chrome/Chromium/Edge) OR WebCatalog
 *
 * Usage:
 *   <script src="/js/install.js" defer></script>
 *   <button id="kc-install-btn" hidden>Install App</button>
 *   — or call KEYCODE_INSTALL.open() to show the platform dialog.
 */
(function () {
  "use strict";

  var deferredPrompt = null;
  var isStandalone = false;
  var platform = detectPlatform();

  function detectPlatform() {
    var ua = navigator.userAgent || "";
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) return "ios";
    if (/Android/i.test(ua)) return "android";
    if (/Windows/i.test(ua)) return "windows";
    if (/CrOS/i.test(ua)) return "chromeos";
    if (/Macintosh|Mac OS X/i.test(ua)) return /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua) ? "macos-safari" : "macos";
    if (/Linux|X11/i.test(ua)) return "linux";
    return "desktop";
  }

  function checkStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: window-controls-overlay)").matches ||
      window.navigator.standalone === true;
  }

  // ---------- The install dialog ----------
  function ensureStyles() {
    if (document.getElementById("kc-install-styles")) return;
    var st = document.createElement("style");
    st.id = "kc-install-styles";
    st.textContent = [
      ".kc-inst-backdrop{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px;font-family:Inter,system-ui,-apple-system,sans-serif}",
      ".kc-inst{background:#101014;border:1px solid rgba(255,255,255,.12);border-radius:20px;max-width:460px;width:100%;padding:28px;color:#fafafa;box-shadow:0 32px 80px rgba(0,0,0,.6);max-height:90vh;overflow:auto}",
      ".kc-inst h3{margin:0 0 6px;font-size:20px;font-weight:700}",
      ".kc-inst .sub{margin:0 0 18px;color:#a1a1aa;font-size:13px;line-height:1.5}",
      ".kc-inst .plat{display:flex;gap:10px;align-items:flex-start;padding:14px;border:1px solid rgba(255,255,255,.1);border-radius:12px;margin-bottom:10px;background:rgba(255,255,255,.03)}",
      ".kc-inst .plat.recommended{border-color:#6366f1;background:rgba(99,102,241,.08)}",
      ".kc-inst .plat .ic{font-size:20px;line-height:1.2}",
      ".kc-inst .plat .nm{font-weight:600;font-size:14px}",
      ".kc-inst .plat .ds{color:#a1a1aa;font-size:12px;margin-top:2px;line-height:1.45}",
      ".kc-inst .btn{display:block;width:100%;padding:11px;border-radius:10px;border:0;cursor:pointer;font-weight:600;font-size:13px;text-align:center;margin-top:8px}",
      ".kc-inst .btn-primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff}",
      ".kc-inst .btn-ghost{background:rgba(255,255,255,.06);color:#e4e4e7}",
      ".kc-inst .btn:hover{filter:brightness(1.12)}",
      ".kc-inst .x{float:right;background:none;border:0;color:#a1a1aa;font-size:20px;cursor:pointer;padding:0 4px}",
      ".kc-inst .badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:#6366f1;color:#fff;border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:1px}",
      ".kc-inst kbd{background:rgba(255,255,255,.1);border-radius:4px;padding:1px 6px;font-size:11px;font-family:inherit}",
      ".kc-inst .done{color:#10b981;font-size:12px;margin-top:10px;text-align:center}",
      "@media(prefers-reduced-motion:reduce){.kc-inst *{transition:none!important;animation:none!important}}"
    ].join("\n");
    document.head.appendChild(st);
  }

  var PLATFORM_GUIDES = {
    android: {
      icon: "🤖", name: "Android", recommended: true,
      description: "Installs like a Play Store app — home screen icon, fullscreen, offline support.",
      steps: [
        { primary: true, label: "Install now", action: "prompt" },
        { label: "Or: ⋮ menu → “Add to Home screen”", action: "none" }
      ]
    },
    windows: {
      icon: "🪟", name: "Windows 10 / 11", recommended: true,
      description: "Adds KEYCODE to your Start menu and taskbar with its own window.",
      steps: [
        { primary: true, label: "Install now", action: "prompt" },
        { label: "Or in Edge: Settings app → Apps → Install this site as an app", action: "none" },
        { label: "Or in Chrome: ⋮ → Cast, save and share → Install page as app", action: "none" }
      ]
    },
    linux: {
      icon: "🐧", name: "Linux", recommended: true,
      description: "Works in Chrome, Chromium, Edge, Brave and Vivaldi on X11 and Wayland.",
      steps: [
        { primary: true, label: "Install now", action: "prompt" },
        { label: "Or: ⋮ menu → “Install page as app…” (Chrome/Chromium/Edge)", action: "none" },
        { label: "Gets its own .desktop launcher + window on GNOME, KDE, XFCE", action: "none" }
      ]
    },
    macos: {
      icon: "🍎", name: "macOS", recommended: true,
      description: "Chrome/Edge install a standalone app to your Dock and Launchpad.",
      steps: [
        { primary: true, label: "Install now", action: "prompt" },
        { label: "Or: ⋮ menu → Save and share → Install page as app…", action: "none" }
      ]
    },
    "macos-safari": {
      icon: "🍎", name: "macOS (Safari)", recommended: true,
      description: "Add KEYCODE to your Dock as a standalone web app.",
      steps: [
        { label: "File → Add to Dock… → Add", action: "none" },
        { label: "Or install Chrome/Edge for one-click install", action: "none" }
      ]
    },
    ios: {
      icon: "📱", name: "iPhone / iPad", recommended: true,
      description: "Adds a full-screen KEYCODE icon to your Home Screen.",
      steps: [
        { label: "1. Tap the Share button (⬆️) in Safari", action: "none" },
        { label: "2. Scroll → “Add to Home Screen”", action: "none" },
        { label: "3. Tap Add — done", action: "none" }
      ]
    },
    chromeos: {
      icon: "💻", name: "ChromeOS", recommended: true,
      description: "Installs to your shelf with its own window.",
      steps: [
        { primary: true, label: "Install now", action: "prompt" },
        { label: "Or: ⋮ menu → Install page as app", action: "none" }
      ]
    },
    desktop: {
      icon: "🖥️", name: "Desktop", recommended: true,
      description: "Install KEYCODE as an app on this device.",
      steps: [{ primary: true, label: "Install now", action: "prompt" }]
    }
  };

  function renderDialog() {
    ensureStyles();
    var guide = PLATFORM_GUIDES[platform] || PLATFORM_GUIDES.desktop;
    var canPrompt = !!deferredPrompt;

    var backdrop = document.createElement("div");
    backdrop.className = "kc-inst-backdrop";
    backdrop.id = "kc-install-dialog";

    var stepsHtml = guide.steps.map(function (s, i) {
      if (s.action === "prompt" && canPrompt) {
        return '<button class="btn btn-primary" data-act="prompt">' + s.label + "</button>";
      }
      if (s.action === "prompt") {
        return '<div class="plat"><div class="ic">⏳</div><div><div class="nm">Browser preparing…</div><div class="ds">Install prompt not offered yet. Use the manual step below, or reload and retry.</div></div></div>';
      }
      return '<div class="plat' + (i === 0 && !canPrompt ? " recommended" : "") + '"><div class="ic">→</div><div><div class="ds" style="color:#e4e4e7;font-size:13px">' + s.label + "</div></div></div>";
    }).join("");

    backdrop.innerHTML =
      '<div class="kc-inst" role="dialog" aria-modal="true" aria-label="Install KEYCODE Studio">' +
      '<button class="x" aria-label="Close">✕</button>' +
      "<h3>Install KEYCODE Studio</h3>" +
      '<p class="sub">Run it like a native app on <strong>' + guide.name + '</strong> — own window, home-screen icon, offline support, launch from your dock/start menu.</p>' +
      '<div class="plat recommended"><div class="ic">' + guide.icon + "</div><div>" +
      '<div class="nm">' + guide.name + (guide.recommended ? '<span class="badge">Detected</span>' : "") + '</div>' +
      '<div class="ds">' + guide.description + "</div></div></div>" +
      stepsHtml +
      '<div style="margin-top:14px;border-top:1px solid rgba(255,255,255,.08);padding-top:14px">' +
      '<div style="font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Other platforms</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      Object.keys(PLATFORM_GUIDES).filter(function (k) { return k !== platform; }).map(function (k) {
        return '<button class="btn btn-ghost" style="width:auto;display:inline-block;margin:0;padding:7px 12px" data-plat="' + k + '">' + PLATFORM_GUIDES[k].icon + " " + PLATFORM_GUIDES[k].name + "</button>";
      }).join("") +
      "</div></div>" +
      '<div class="done" id="kc-inst-done" hidden>✓ Installed — check your app launcher!</div>' +
      "</div>";

    backdrop.querySelector(".x").addEventListener("click", close);
    backdrop.addEventListener("click", function (e) { if (e.target === backdrop) close(); });
    backdrop.querySelectorAll("[data-act='prompt']").forEach(function (b) {
      b.addEventListener("click", doNativePrompt);
    });
    backdrop.querySelectorAll("[data-plat]").forEach(function (b) {
      b.addEventListener("click", function () {
        platform = b.getAttribute("data-plat");
        backdrop.remove();
        renderDialog();
      });
    });

    document.body.appendChild(backdrop);
    return backdrop;
  }

  function doNativePrompt() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (choice) {
      if (choice && choice.outcome === "accepted") {
        var done = document.getElementById("kc-inst-done");
        if (done) done.hidden = false;
        try { localStorage.setItem("kc-installed", "1"); } catch (e) {}
      }
      deferredPrompt = null;
    }).catch(function () { deferredPrompt = null; });
  }

  function close() {
    var d = document.getElementById("kc-install-dialog");
    if (d) d.remove();
  }

  // ---------- Public API ----------
  window.KEYCODE_INSTALL = {
    open: function () {
      if (isStandalone) {
        // Already installed — show a small toast instead
        ensureStyles();
        var t = document.createElement("div");
        t.className = "kc-inst-backdrop";
        t.style.alignItems = "flex-start";
        t.innerHTML = '<div class="kc-inst" style="max-width:340px;margin-top:8vh"><h3 style="font-size:16px">Already installed ✓</h3><p class="sub">You are running the installed app. You can remove it anytime from your app launcher.</p><button class="btn btn-ghost" id="kc-inst-ok">Got it</button></div>';
        t.querySelector("#kc-inst-ok").addEventListener("click", function () { t.remove(); });
        t.addEventListener("click", function (e) { if (e.target === t) t.remove(); });
        document.body.appendChild(t);
        return;
      }
      renderDialog();
    },
    get platform() { return platform; },
    get canPrompt() { return !!deferredPrompt; }
  };

  // ---------- Event wiring ----------
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButtons();
  });

  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    try { localStorage.setItem("kc-installed", "1"); } catch (e) {}
    close();
    updateButtonState();
  });

  function showInstallButtons() {
    document.querySelectorAll("[data-install-btn]").forEach(function (b) { b.hidden = false; });
  }
  function updateButtonState() {
    document.querySelectorAll("[data-install-btn]").forEach(function (b) {
      if (isStandalone) b.setAttribute("title", "Already installed");
    });
  }

  function bindButtons() {
    document.querySelectorAll("[data-install-btn]").forEach(function (b) {
      if (b.__kcInstallBound) return;
      b.__kcInstallBound = true;
      b.addEventListener("click", function (e) {
        e.preventDefault();
        window.KEYCODE_INSTALL.open();
      });
      b.hidden = isStandalone;
    });
  }

  function init() {
    isStandalone = checkStandalone();
    bindButtons();
    if (!isStandalone) {
      // Show buttons after a beat on platforms where beforeinstallprompt is
      // unlikely (iOS Safari, macOS Safari) so users still get guidance.
      var promptless = platform === "ios" || platform === "macos-safari";
      if (promptless) setTimeout(showInstallButtons, 1200);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // Re-bind when new content appears (SPA-ish pages)
  var mo = new MutationObserver(function () { bindButtons(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
