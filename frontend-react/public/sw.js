const CACHE_NAME = 'vroomvroom-react-v1';
const DATA_CACHE = 'vroomvroom-data-v1';

// Install: activate immediately (Vite hashes assets, so we cache on fetch)
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: strategy per request type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (mutations go straight to network)
  if (event.request.method !== 'GET') return;

  // API requests: network first with 4s timeout, fall back to cache
  if (url.pathname.startsWith('/api/') || url.hostname.includes('carmanagementapi')) {
    event.respondWith(
      Promise.race([
        fetch(event.request.clone()).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
      ]).catch(() =>
        caches.match(event.request).then(
          (cached) =>
            cached ||
            new Response(JSON.stringify({ offline: true, error: 'No cached data' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            })
        )
      )
    );
    return;
  }

  // MapLibre tiles: cache first
  if (
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('tiles.') ||
    url.hostname.includes('basemaps.')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Vite hashed assets (/assets/*): cache first (immutable)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML navigation: network first, fall back to cached index.html (SPA)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Everything else: network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
