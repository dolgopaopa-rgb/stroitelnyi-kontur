const CACHE_NAME = "stroitelnyi-kontur-20260825-crm-theme-v4";
const CORE_ASSETS = [
  "/",
  "/static/styles.css?v=20260824-compact-operational-screens",
  "/static/crm-theme.css?v=20260825-crm-theme-v4",
  "/static/app.compat.js?v=20260824-compact-operational-screens",
  "/static/manifest.webmanifest?v=20260825-crm-theme-v3",
  "/static/assets/d2dom-logo-tile.svg?v=20260825-crm-theme",
  "/static/assets/d2dom-logo-white.svg",
  "/static/assets/fonts/Haval-Light.woff2",
  "/static/assets/fonts/Involve-Regular.woff2",
  "/static/assets/fonts/Involve-SemiBold.woff2",
  "/static/assets/g2-logo-192.png",
  "/static/assets/g2-logo-512.png"
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

