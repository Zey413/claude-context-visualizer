const CACHE_NAME = 'ctx-viz-v15';
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
  './js/conversation-analyzer.js',
  './js/template-builder.js',
  './js/keyboard-help.js',
  './js/token-calculator.js',
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

// Activate: clean up ALL old caches immediately
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

// Fetch: network-first for HTML/JS/CSS, cache-fallback for offline
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // For same-origin HTML, JS, CSS — try network first, fall back to cache
  if (url.origin === self.location.origin &&
      (url.pathname.endsWith('.html') || url.pathname.endsWith('.js') ||
       url.pathname.endsWith('.css') || url.pathname === '/' || url.pathname.endsWith('/'))) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Update cache with fresh response
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For other assets (images, manifest, etc.) — cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
