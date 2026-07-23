(function() {
  var errors = [];
  var MAX_ERRORS = 50;

  // Create error toast container
  var container = document.createElement('div');
  container.id = 'error-toast-container';
  container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;max-width:400px';
  document.body.appendChild(container);

  function showErrorToast(message, detail) {
    var toast = document.createElement('div');
    toast.style.cssText = 'background:#1a1a2e;border:1px solid rgba(239,68,68,0.3);border-left:3px solid #ef4444;border-radius:8px;padding:12px 16px;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:slideIn 0.3s ease;display:flex;align-items:flex-start;gap:10px;max-width:100%';
    toast.innerHTML = '<span style="color:#ef4444;flex-shrink:0;margin-top:1px">&#9888;</span><div><div style="font-weight:600;margin-bottom:2px">' + message + '</div>' + (detail ? '<div style="color:#94a3b8;font-size:12px">' + detail + '</div>' : '') + '</div>';
    container.appendChild(toast);
    setTimeout(function() { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(function() { toast.remove(); }, 300); }, 5000);
  }

  // Global error handler
  window.addEventListener('error', function(e) {
    if (errors.length >= MAX_ERRORS) return;
    errors.push({ message: e.message, source: e.filename, line: e.lineno, time: new Date().toISOString() });
    
    // Don't show errors from third-party scripts
    if (e.filename && (e.filename.includes('stripe.com') || e.filename.includes('cdnjs.cloudflare') || e.filename.includes('jsdelivr') || e.filename.includes('googleapis'))) return;
    
    showErrorToast('Something went wrong', 'Check your connection and try again');
    console.warn('[ErrorBoundary]', e.message, e.filename + ':' + e.lineno);
    e.preventDefault();
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', function(e) {
    if (errors.length >= MAX_ERRORS) return;
    var msg = e.reason?.message || e.reason || 'Unknown error';
    errors.push({ message: msg, type: 'unhandledrejection', time: new Date().toISOString() });
    showErrorToast('Something went wrong', 'An unexpected error occurred');
    console.warn('[ErrorBoundary] Unhandled Rejection:', msg);
    e.preventDefault();
  });

  // Network error monitoring
  var originalFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    return originalFetch.apply(this, args).catch(function(err) {
      // Don't show for analytics or non-critical endpoints
      var url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      if (url.includes('/api/health') || url.includes('/api/ai/providers') || url.includes('/plausible') || url.includes('stripe.com')) throw err;
      showErrorToast('Network error', 'Could not reach the server. Please check your connection.');
      throw err;
    });
  };

  window.__getErrors = function() { return errors; };
  window.__clearErrors = function() { errors = []; };

  // Add CSS animation
  var style = document.createElement('style');
  style.textContent = '@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}';
  document.head.appendChild(style);
})();
