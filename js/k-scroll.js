/* KEYCODE k-scroll — smooth anchor + scroll utility (safe no-op baseline). */
(function () {
  'use strict';
  if (window.KCScroll) return;
  window.KCScroll = { smooth: true };

  if (window.gsap && window.ScrollTrigger) {
    try {
      gsap.registerPlugin(ScrollTrigger);
    } catch (err) { /* ignore */ }
  }
})();
