// Balise - cache de l'app et des tuiles pour usage hors ligne
const APP = "navshom-app-v87", TILES = "navshom-tiles";
const SHELL = ["./", "index.html", "lib/leaflet.js", "lib/leaflet.css", "lib/landmask.png", "lib/fonts/inter-latin-400-normal.woff2", "lib/fonts/inter-latin-500-normal.woff2", "lib/fonts/inter-latin-600-normal.woff2", "lib/fonts/inter-latin-700-normal.woff2", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("navshom-app-") && k !== APP).map(k => caches.delete(k))))); self.clients.claim(); });
const isTile = u => /services\.data\.shom\.fr|tile\.openstreetmap\.org|tiles\.openseamap\.org|tiles\.emodnet-bathymetry\.eu|data\.geopf\.fr/.test(u);
self.addEventListener("fetch", e => {
  const u = e.request.url;
  if (e.request.method !== "GET") return;
  if (/\/relief\/[^/]+\.bin\.gz/.test(u)) return; // paquets de relief : déjà rangés tuile par tuile, pas de copie dans le cache de l'app
  if (isTile(u)) {
    // tuiles : cache d'abord, sinon réseau puis mise en cache
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(u); if (hit && !(hit.type === "opaque" && e.request.mode === "cors")) return hit;
      // Demandée en CORS, même pour les images de la carte : la réponse est lisible, donc réutilisable par la vue 3D,
      // et comptée à sa vraie taille (Chrome compte chaque réponse « opaque » pour plusieurs Mo dans le quota).
      try { if (/services\.data\.shom\.fr/.test(u)) throw 0; // SHOM : pas de CORS
        const r = await fetch(u, { mode: "cors", credentials: "omit" }); if (r.ok) c.put(u, r.clone()); return r; }
      catch (err) { // fournisseur sans CORS : réponse opaque, gardée seulement si elle a réussi
        try { const r = await fetch(e.request); if (r.ok || r.type === "opaque") c.put(u, r.clone()); return r; } catch (e2) { return Response.error(); } }
    }));
  } else if (u.startsWith(self.location.origin)) {
    // app : réseau d'abord (mises à jour), sinon cache
    e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => { const cp = r.clone(); caches.open(APP).then(c => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
