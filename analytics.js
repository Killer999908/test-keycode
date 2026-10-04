(function() {
  // Plausible analytics - privacy-friendly, no cookies
  var ANALYTICS_URL = '/api/analytics/event';
  var SITE_NAME = 'keycode';
  var queue = [];
  var FLUSH_INTERVAL = 5000;

  function send(eventName, props) {
    try {
      var payload = { name: eventName, url: window.location.href, domain: SITE_NAME, props: props || {} };
      queue.push(payload);
      if (queue.length >= 10) flush();
    } catch(e) { /* silent */ }
  }

  function flush() {
    if (!queue.length) return;
    var batch = queue.splice(0, queue.length);
    try {
      var data = new Blob([JSON.stringify(batch)], { type: 'application/json' });
      navigator.sendBeacon(ANALYTICS_URL, data);
    } catch(e) { /* silent */ }
  }

  // Flush periodically
  setInterval(flush, FLUSH_INTERVAL);
  window.addEventListener('beforeunload', flush);

  // Track page views
  send('pageview', { path: window.location.pathname });

  // Track clicks on key elements
  document.addEventListener('click', function(e) {
    var target = e.target.closest('[data-analytics]');
    if (target) {
      send('click', { label: target.getAttribute('data-analytics'), text: target.textContent?.trim()?.slice(0, 50) });
    }
  });

  // Track form submissions
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (form && form.action) {
      send('form_submit', { action: form.action.split('/').pop() });
    }
  });

  window.__analytics = { send: send, flush: flush };
})();
