const CACHE = 'keycode-v5';
const PRECACHE = [
  '/offline.html',
  '/favicon.svg',
  '/logo-nav.png',
  '/icon-192.png'
];

const OFFLINE_RESPONSE = new Response(
  '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><style>body{background:#0a0a15;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;text-align:center;padding:20px}</style></head><body><div><h1 style="color:#6366f1">You\'re Offline</h1><p style="color:#94a3b8">Please check your connection and try again.</p></div></body></html>',
  { status: 503, headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Offline page - cache with fallback
  if (url.pathname === '/offline.html') {
    return e.respondWith(
      caches.match('/offline.html').then(cached => cached || fetch(e.request).catch(() => OFFLINE_RESPONSE))
    );
  }

  // HTML pages: network-first (always fetch fresh, fall back to cache)
  if (url.pathname === '/' || url.pathname === '/index.html') {
    return e.respondWith(
      fetch(e.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        return response;
      }).catch(() => caches.match(e.request).then(cached => cached || OFFLINE_RESPONSE))
    );
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return response;
      }).catch(() => OFFLINE_RESPONSE);
    }).catch(() => OFFLINE_RESPONSE)
  );
});