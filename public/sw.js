// Minimal, safe service worker: makes the app installable and provides an
// offline fallback WITHOUT caching anything auth- or API-related.
//
// - Never intercepts /api or /auth (always network).
// - Never caches navigations/HTML (so no stale auth-gated pages).
// - Cache-first only for immutable static assets (hashed _next/static, icons).
// - Offline navigations fall back to /offline.html.
const CACHE = "study-tutor-v1";
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never touch API/auth — always go to the network.
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/auth")) return;

  // Immutable static assets: cache-first.
  const isStatic =
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons") ||
    url.pathname === "/icon.svg";
  if (isStatic) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Navigations: network-first, fall back to the offline page (never cached,
  // so authenticated HTML is never served stale).
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  // Everything else: default network passthrough.
});
