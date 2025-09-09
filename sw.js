// SW mínimo para PWA estática
const CACHE = "finanzas-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.app.js",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then(cacheRes => cacheRes || fetch(req).then((netRes) => {
      // opcional: cache dinámico simple
      return netRes;
    }))
  );
});
