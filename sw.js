const CACHE = 'keycode-v12';
const PRECACHE = [
  '/',
  '/offline.html',
  '/favicon.svg',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/theme.css',
  '/theme.js',
  '/gallery.html',
  '/pricing.html',
  '/blog.html',
  '/docs.html',
  '/news.html',
  '/status.html',
  '/support.html',
  '/rss.xml',
  '/og-image.svg',
  '/sitemap.xml',
  '/manifest.json'
];

const OFFLINE_RESPONSE = new Response(
  '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><style>body{background:#000;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;text-align:center;padding:20px}.btn{display:inline-block;padding:14px 32px;background:#fff;color:#000;border:1px solid #fff;text-decoration:none;font-size:12px;letter-spacing:.12em;text-transform:uppercase}</style></head><body><div><h1 style="font-weight:400;letter-spacing:.08em;text-transform:uppercase">You\'re Offline</h1><p style="color:#7E7E7E">Please check your connection and try again.</p><a href="/" class="btn">Retry</a></div></body></html>',
  { status: 503, headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
);

// Never feed HTML to JS/CSS requests — that breaks the module graph.
// Let the browser's own error handling retry instead.
function OFFLINE_FALLBACK(e) {
  const dest = e.request.destination;
  if (dest === 'document' || dest === '' || dest === 'iframe') return OFFLINE_RESPONSE;
  return Response.error();
}

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
      .then(() => self.registration.navigationPreload.enable().catch(() => {}))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // NEVER intercept API calls: live data must always come from the network.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/preview/')) return;

  // HTML pages: network-first, fall back to cache, then offline page.
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('.html')) {
    return e.respondWith(
      fetch(e.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(e.request).then(cached => cached || OFFLINE_RESPONSE))
    );
  }

  // offline.html: serve cached or fetch, never offline fallback.
  if (url.pathname === '/offline.html') {
    return e.respondWith(
      caches.match('/offline.html').then(cached => cached || fetch(e.request).catch(() => OFFLINE_RESPONSE))
    );
  }

  // Scripts & styles: network-first — a failed parse is worse than a fresh fetch.
  // Always return a real response; never Response.error() for executable resources.
  const dest = e.request.destination;
  if (dest === 'script' || dest === 'style') {
    return e.respondWith(
      fetch(e.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(e.request).then(cached => cached || new Response('OK', { status: 200, statusText: 'OK' })))
    );
  }

  // Images, fonts, media: cache-first, network as fallback.
  if (dest === 'image' || dest === 'font' || dest === 'media' || dest === 'audio' || dest === 'video') {
    return e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => {}))
    );
  }

  // Everything else (fetch, XHR, etc.): stale-while-revalidate.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fromNetwork = (e.preloadResponse || fetch(e.request)).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return response;
      });
      if (cached) {
        fromNetwork.catch(() => {});
        return cached;
      }
      return fromNetwork.then(r => r || new Response(null, { status: 204 }));
    }).catch(() => new Response(null, { status: 204 }))
  );
});
