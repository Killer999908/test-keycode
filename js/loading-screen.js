/* KEYCODE loading screen controller. Hides the preloader once assets are in. */
(function () {
  'use strict';

  function hide() {
    document.querySelectorAll('.loading-screen, .preloader, #loading, .loader-screen, [data-loading-screen]').forEach(function (el) {
      el.classList.add('loaded', 'hidden');
      el.style.opacity = '0';
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
    });
    document.body.classList.add('loaded', 'app-ready');
  }

  if (document.readyState === 'complete') {
    hide();
  } else {
    window.addEventListener('load', hide);
  }
  // Safety net: never let an overlay trap the page.
  setTimeout(hide, 5000);
})();
