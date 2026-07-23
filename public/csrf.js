(function() {
  var token = null;
  var promise = null;

  window.__getCsrfToken = function() {
    if (token) return Promise.resolve(token);
    if (promise) return promise;
    promise = fetch('/api/security/csrf-token').then(function(r) { return r.json(); }).then(function(d) {
      token = d.token;
      promise = null;
      return token;
    }).catch(function() { promise = null; return null; });
    return promise;
  };

  window.__addCsrfToForm = function(form) {
    if (!form || form.querySelector('input[name="_csrf"]')) return;
    __getCsrfToken().then(function(t) {
      if (!t) return;
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = '_csrf';
      input.value = t;
      form.appendChild(input);
    });
  };

  window.__csrfHeader = function() {
    return __getCsrfToken().then(function(t) {
      return t ? { 'X-CSRF-Token': t } : {};
    });
  };

  // Auto-inject CSRF into all forms on the page
  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('form').forEach(window.__addCsrfToForm);
    // Also watch for dynamically added forms
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(n) {
          if (n.tagName === 'FORM') window.__addCsrfToForm(n);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
