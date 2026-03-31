const CACHE_NAME = 'ctx-viz-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/models.js',
  './js/i18n.js',
  './js/gauge.js',
  './js/particles.js',
  './js/share.js',
  './js/app.js',
  './assets/favicon.svg',
  './manifest.json'
];

// Install: pre-cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first strategy for all requests
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
