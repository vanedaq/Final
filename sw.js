const CACHE = 'of-cache-v10';
const ASSETS = [
  './',
  './index.html',
  './style.app.css',
  './app.app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Instalación: abre caché y carga assets + skipWaiting
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting(); // <-- Ya estaba, lo mantenemos
});

// Activación: borra caches antiguos + claim clients
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim(); // <-- Ya estaba, lo mantenemos
});

// Fetch: NO cachea nada nuevo, solo intenta usar caché existente o va a red
// ¡NO guarda respuestas en caché!
self.addEventListener('fetch', e => {
  const req = e.request;
  e.respondWith(
    caches.match(req).then(res => {
      if (res) {
        return res; // Si está en caché, lo devolvemos
      }
      // Si no está en caché, vamos a la red
      return fetch(req).then(r => {
        // ¡IMPORTANTE: NO guardamos en caché!
        // Por eso eliminamos esta parte: caches.open(CACHE).then(c=>c.put(req,copy));
        return r;
      }).catch(() => {
        // En caso de error de red, devolvemos undefined (el navegador mostrará error)
        // O puedes devolver un fallback si lo deseas
        return new Response('<h1>Offline</h1>', { status: 503, headers: { 'Content-Type': 'text/html' } });
      });
    })
  );
});
