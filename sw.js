const CACHE_NAME = 'organizador-v1';
const ASSETS = [
  '/', '/index.html', '/style.app.css', '/app.app.js', '/manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(()=>{}))
  );
});

self.addEventListener('activate', event => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))
    ))
  );
});

self.addEventListener('fetch', event => {
  // Estrategia: try cache, fallback fetch, and store
  event.respondWith(
    caches.match(event.request).then(resp => {
      if(resp) return resp;
      return fetch(event.request).then(networkRes => {
        // opcionalmente cachear
        if(event.request.method === 'GET' && networkRes && networkRes.status === 200){
          caches.open(CACHE_NAME).then(cache => {
            try{ cache.put(event.request, networkRes.clone()); }catch(e){}
          });
        }
        return networkRes.clone();
      }).catch(()=>caches.match('/index.html'));
    })
  );
});