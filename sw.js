const CACHE_NAME = 'organizador-cache-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      // eliminar caches viejos si existieran
      return Promise.all(keys.map(k => {
        if (k !== CACHE_NAME) return caches.delete(k);
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // política simple: intenta la red y si falla responde desde cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});