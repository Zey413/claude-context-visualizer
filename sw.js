const CACHE_NAME = 'ctx-viz-v13';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/models.js',
  './js/i18n.js',
  './js/gauge.js',
  './js/particles.js',
  './js/share.js',
  './js/dashboard.js',
  './js/charts.js',
  './js/memory-tracker.js',
  './js/stream.js',
  './js/health-monitor.js',
  './js/sankey.js',
  './js/cache-viz.js',
  './js/cost-forecast.js',
  './js/scroll-fx.js',
  './js/data-generator.js',
  './js/realtime-monitor.js',
  './js/alert-timeline.js',
  './js/token-waterfall.js',
  './js/compaction-sim.js',
  './js/model-heatmap.js',
  './js/optimization-advisor.js',
  './js/config-exporter.js',
  './js/guided-tour.js',
  './js/app.js',
  './assets/favicon.svg',
  './manifest.json',
  './robots.txt',
  './sitemap.xml',
  './LICENSE'
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
