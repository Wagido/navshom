// Réseau simulé pour les tests : aucune requête ne sort vers Open-Meteo, IGN, SHOM, OpenStreetMap…
// Les réponses sont fabriquées ici, toujours les mêmes, pour des tests fiables et sans consommer de quota.

// Tuile PNG 1 × 1 (gris clair), suffisante pour Leaflet
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");

const pad = n => String(n).padStart(2, "0");
const isoH = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
const isoD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Valeur plausible d'une variable Open-Meteo, selon son nom, l'heure et le point
function value(name, h, i) {
  const s = Math.sin((h + i) / 5);
  const n = name.replace(/_(best_match|meteofrance\w*|ecmwf\w*|icon\w*|gfs\w*|arome\w*|arpege\w*)$/, "");
  if (n === "weather_code") return [0, 1, 2, 3, 61][(h + i) % 5];
  if (n === "is_day") return h % 24 >= 7 && h % 24 < 18 ? 1 : 0;
  if (n.includes("direction")) return Math.round((240 + 30 * s + 360) % 360);
  if (n.includes("gusts")) return +(18 + 6 * s).toFixed(1);
  if (n === "ocean_current_velocity") return +(1.2 + 0.8 * s).toFixed(2); // km/h
  if (n.includes("speed")) return +(12 + 5 * s).toFixed(1);
  if (n === "sea_level_height_msl") return +(2 * Math.sin(h / 2)).toFixed(2);
  if (n.includes("period")) return +(8 + s).toFixed(1);
  if (n.includes("wave_height")) return +(1.2 + 0.4 * s).toFixed(2);
  if (n === "sea_surface_temperature") return 14.2;
  if (n.includes("temperature")) return +(11 + 4 * s).toFixed(1);
  if (n === "precipitation" || n === "rain" || n === "showers") return h % 7 === 0 ? 0.4 : 0;
  if (n === "snowfall") return 0;
  if (n === "cloud_cover") return Math.round(50 + 40 * s);
  if (n === "visibility") return 20000;
  if (n === "pressure_msl") return +(1015 + 3 * s).toFixed(1);
  if (n === "freezing_level_height") return Math.round(2400 + 300 * s);
  if (n.includes("cape")) return 0;
  return +(10 + s).toFixed(1);
}

function openMeteo(url) {
  const q = url.searchParams, lats = (q.get("latitude") || "47").split(","), lons = (q.get("longitude") || "-3").split(",");
  const days = +(q.get("forecast_days") || 3), hourly = (q.get("hourly") || "").split(",").filter(Boolean), daily = (q.get("daily") || "").split(",").filter(Boolean);
  const gmt = q.get("timezone") === "GMT", d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const times = [], dates = [];
  for (let k = 0; k < days * 24; k++) { const d = new Date(d0.getTime() + k * 3600e3); times.push(gmt ? d.toISOString().slice(0, 13) + ":00" : isoH(d)); }
  for (let k = 0; k < days; k++) dates.push(isoD(new Date(d0.getTime() + k * 86400e3)));
  const out = lats.map((la, i) => {
    const o = { latitude: +la, longitude: +lons[i], timezone: gmt ? "GMT" : "Europe/Paris", utc_offset_seconds: gmt ? 0 : -d0.getTimezoneOffset() * 60,
      hourly: { time: times } };
    hourly.forEach(v => { o.hourly[v] = times.map((_, h) => value(v, h, i)); });
    if (daily.length) {
      o.daily = { time: dates };
      daily.forEach(v => { o.daily[v] = dates.map((dt, k) => v === "sunrise" ? dt + "T08:05" : v === "sunset" ? dt + "T17:15"
        : v.endsWith("_max") ? value(v.replace("_max", ""), 14 + k * 24, i) + 3 : v.endsWith("_min") ? value(v.replace("_min", ""), k * 24, i) - 3
        : v.endsWith("_dominant") ? 250 : value(v, k * 24 + 12, i)); });
    }
    return o;
  });
  return out.length === 1 ? out[0] : out;
}

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });

// Une seule règle : tout ce qui ne vient pas du serveur local est simulé (ou refusé)
async function mockNetwork(target, opts = {}) {
  const calls = [];
  await target.route(url => !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url.href), async route => {
    const url = new URL(route.request().url()), h = url.hostname, p = url.pathname; calls.push(url.href);
    if (/open-meteo\.com$/.test(h)) return json(route, openMeteo(url));
    if (h === "data.geopf.fr") {
      if (p.includes("/altimetrie/")) { const n = (url.searchParams.get("lat") || "").split("|").length;
        return json(route, { elevations: Array.from({ length: n }, (_, i) => 1200 + 15 * i) }); }
      if (p.includes("/navigation/itineraire")) { const [a, b] = [url.searchParams.get("start"), url.searchParams.get("end")].map(s => s.split(",").map(Number));
        return json(route, { geometry: { type: "LineString", coordinates: [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.001], b] } }); }
      if (p.includes("/geocodage/")) return json(route, { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-3.1, 47.5] },
        properties: { name: "Lieu test", label: "Lieu test", city: "Ville test", toponym: "Lieu test" } }] });
      // tuiles WMTS / WMS (images)
      return route.fulfill({ status: 200, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" }, body: PNG });
    }
    if (/overpass/.test(h)) return json(route, { elements: [] });
    if (/(tile\.openstreetmap\.org|openseamap\.org|emodnet|opentopomap|data\.shom\.fr|arcgisonline|tile)/.test(h + p) && route.request().resourceType() === "image")
      return route.fulfill({ status: 200, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" }, body: PNG });
    if (opts.log) console.log("réseau refusé (test) :", url.href);
    return route.abort();
  });
  return calls;
}

module.exports = { mockNetwork };
