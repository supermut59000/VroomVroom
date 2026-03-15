const CACHE_NAME = 'vroomvroom-v6';
const DATA_CACHE = 'vroomvroom-data-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/css/StylePopUp.css',
  '/js/Dashboard.js',
  '/js/config.js',
  '/js/Vehicles/VehicleCard.js',
  '/js/Vehicles/VehicleAdd.js',
  '/js/Vehicles/VehicleDetails.js',
  '/js/Vehicles/VehicleModif.js',
  '/js/Fuel/FuelAdd.js',
  '/js/Fuel/FuelView.js',
  '/js/Fuel/FuelCharts.js',
  '/js/Maintenance/MaintenanceAdd.js',
  '/js/Maintenance/MaintenanceView.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== DATA_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: strategy per request type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CDN assets (Chart.js, Leaflet): cache first, then network
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'unpkg.com') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // OpenStreetMap tiles: cache first
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // API GET requests: network first with 4s timeout, fall back to DATA_CACHE
  if (url.pathname.startsWith('/api/') || url.hostname.includes('carmanagementapi')) {
    if (event.request.method !== 'GET') {
      // Mutations pass through to network as-is
      event.respondWith(fetch(event.request));
      return;
    }

    event.respondWith(
      Promise.race([
        fetch(event.request.clone()).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DATA_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
      ]).catch(() =>
        caches.match(event.request).then(cached =>
          cached || new Response(JSON.stringify({ offline: true, error: 'No cached data' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          })
        )
      )
    );
    return;
  }

  // Static assets: cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
