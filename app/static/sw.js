const CACHE_NAME = "stroitelnyi-kontur-20260820-feedback-fixes-v1";
const CORE_ASSETS = [
  "/",
  "/static/styles.css?v=20260820-feedback-fixes-v1",
  "/static/brand-2026.css?v=20260820-feedback-fixes-v1",
  "/static/app.compat.js?v=20260820-feedback-fixes-v1",
  "/static/manifest.webmanifest?v=20260820-feedback-fixes-v1",
  "/static/assets/brand-2026/d2dom-mark.svg",
  "/static/assets/brand-2026/Haval-Light.woff2",
  "/static/assets/brand-2026/Involve-Regular.woff2",
  "/static/assets/brand-2026/Involve-SemiBold.woff2",
  "/static/assets/brand-2026/d2dom-mark-192.png",
  "/static/assets/brand-2026/d2dom-mark-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname === "/logout" || url.pathname === "/login") return;

  if (url.pathname.startsWith("/static/") && [".css", ".js", ".webmanifest"].some((suffix) => url.pathname.endsWith(suffix))) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request) || Response.error())
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response.ok && new URL(response.url).pathname !== "/login") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/") || Response.error())
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});

