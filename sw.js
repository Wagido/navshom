// Nav SHOM - cache de l'app et des tuiles pour usage hors ligne
const APP = "navshom-app-v2", TILES = "navshom-tiles";
const SHELL = ["./", "index.html", "lib/leaflet.js", "lib/leaflet.css", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("navshom-app-") && k !== APP).map(k => caches.delete(k))))); self.clients.claim(); });
const isTile = u => /services\.data\.shom\.fr|tile\.openstreetmap\.org|tiles\.openseamap\.org/.test(u);
self.addEventListener("fetch", e => {
  const u = e.request.url;
  if (e.request.method !== "GET") return;
  if (isTile(u)) {
    // tuiles : cache d'abord, sinon réseau puis mise en cache
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(u); if (hit) return hit;
      try { const r = await fetch(e.request); c.put(u, r.clone()); return r; } catch (err) { return Response.error(); }
    }));
  } else if (u.startsWith(self.location.origin)) {
    // app : réseau d'abord (mises à jour), sinon cache
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(APP).then(c => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
