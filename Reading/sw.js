const CACHE = "aden-reading-v1-20261001";
const ASSETS = ["./", "./index.html", "./styles.css?v=20261001-1", "./progress.js?v=20261001-1", "./app.js?v=20261001-1", "./data/catalog.json", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("aden-reading-") && key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith(fetch(event.request, { cache: "no-cache" }).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === "navigate") return caches.match(new URL("./index.html", self.registration.scope).href);
    return new Response("Offline", { status: 503 });
  }));
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_DOCUMENT" || !/^\.\/data\/no-\d+\.json$/.test(event.data.file)) return;
  const url = new URL(event.data.file, self.registration.scope);
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(url.href)).catch(() => {}));
});
