// Bump CACHE when you change any shell file, so clients pull the new version.
const CACHE = "masareef-v3";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Never cache API calls; always hit the network.
  if (req.url.includes("/api/")) return;
  if (req.method !== "GET") return;
  // Cache-first for the static shell, fall back to network.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
