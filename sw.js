// Simple service worker: instala, activa y hace fetch directo (sin cache agresivo)
// Puedes ampliarlo luego para caching si quieres.

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Por ahora solo passthrough: respondemos con la petición normal
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});