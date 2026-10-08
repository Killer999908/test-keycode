/**
 * KEYCODE Studio — Service Worker Registration
 * Single shared registration for all pages.
 * Load with: <script src="/js/sw-register.js" defer></script>
 */
(function () {
  "use strict";

  var isRegistered = false;

  function register() {
    if (isRegistered || !("serviceWorker" in navigator)) return;
    isRegistered = true;

    navigator.serviceWorker.register("/sw.js")
      .then(function (reg) {
        console.log("[SW] Registered:", reg.scope);
      })
      .catch(function (err) {
        console.warn("[SW] Registration failed:", err.message);
      });

    // Listen for controller changes (new SW took over)
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (window.location.href.includes("?sw-updated") === false) {
        window.location.reload();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", register);
  } else {
    register();
  }
})();
