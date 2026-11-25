const CACHE_NAME = 'the-f1-race-shell-v19';
const APP_SHELL = [
  './', './index.html', './manifest.webmanifest',
  './assets/favicon.png', './assets/icon.png',
  './css/main.css',
  './js/main.js', './js/pwa.js', './js/game.js', './js/controls.js',
  './js/platform.js', './js/audio.js', './js/championship.js',
  './js/physics.js', './js/opponents.js', './js/renderer.js',
  './js/renderer2d.js', './js/timing.js', './js/track.js', './js/garage.js', './js/weather.js', './js/data-manager.js', './js/race-engineer.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Always prefer the deployed version; use the cache only when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(async response => {
          if (response.ok) {
            const copy = response.clone();
            await caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then(async response => {
        if (response.ok) {
          const copy = response.clone();
          await caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => {
        if (cached) return cached;
        return new Response('Offline — this resource is not available in the app cache.', {
          status: 503,
          statusText: 'Offline'
        });
      }))
  );
});
