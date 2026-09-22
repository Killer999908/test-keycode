/* KEYCODE scroll 3D animations — guarded parallax when GSAP is present. */
(function () {
  'use strict';
  if (window.KCScroll3D) return;
  window.KCScroll3D = { enabled: false };

  if (!window.gsap || !window.ScrollTrigger || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.addEventListener('DOMContentLoaded', function () {
    try {
      gsap.registerPlugin(ScrollTrigger);
      var layers = document.querySelectorAll('[data-parallax]');
      if (!layers.length) return;
      window.KCScroll3D.enabled = true;
      layers.forEach(function (el) {
        var depth = parseFloat(el.getAttribute('data-parallax')) || 0.2;
        gsap.to(el, {
          y: function () { return -el.offsetHeight * depth; },
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true }
        });
      });
    } catch (err) { /* never break the page */ }
  });
})();
