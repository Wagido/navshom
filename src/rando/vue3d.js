// Vue 3D (Rando) : relief IGN, photo ou carte drapée, traces et repères
import { FRANCE, R, bases, map, slopes } from "../carte/carte.js";
import { mPts, measuring } from "../carte/mesure.js";
import { wps } from "../carte/point.js";
import { last, setFollow } from "../gps/gps.js";
import { mInst } from "../horsligne/relief.js";
import { zones } from "../horsligne/zones.js";
import { instOpen } from "../mer/instruments.js";
import { measureGeom, trailOn } from "./itineraires.js";
import { rec, shownId, tracks } from "./traces.js";
import { closeSheets } from "../ui/panneaux.js";
import { $, CN, store, toast } from "../utils.js";

let V3, v3Low, v3Mem, V3N, V3T;

// Fond choisi tout seul : la carte IGN (ou la photo) si le centre est dans une zone téléchargée, déjà sur le téléphone ;
// sinon « Relief », calculé sur place, sans aucune donnée. Photo et Carte restent à un toucher.
function v3AutoBg(){ const c = map.getCenter(), z = zones.find(z => z.keys && L.latLngBounds([z.b[0],z.b[1]],[z.b[2],z.b[3]]).contains(c) && (z.keys.includes("scan25") || z.keys.includes("ortho")));
  const last = store.get("v3bg", "ortho"); return z ? (z.keys.includes("scan25") ? "scan" : "ortho") : (last==="scan" ? "scan" : "ortho"); }
function v3Script(src){ return new Promise((res, rej) => { const s=document.createElement("script"), t=setTimeout(()=>rej(new Error("moteur 3D indisponible hors ligne")), 20000);
  s.src=src; s.onload=()=>{ clearTimeout(t); res(); }; s.onerror=()=>{ clearTimeout(t); rej(new Error("moteur 3D indisponible hors ligne")); }; document.head.appendChild(s); }); }
// Three.js gardé dans un cache à part (conservé d'une version de l'appli à l'autre) pour ouvrir la 3D hors ligne
const V3LIB = ["lib/three.min.js", "lib/three-orbit.js"];
export function v3KeepLib(){ try{ caches.open(CN+"lib").then(async c => { for(const u of V3LIB) if(!(await c.match(u))) await c.add(u); }).catch(()=>{}); }catch(e){} }
async function v3Lib(){ if(!window.THREE) await v3Script(V3LIB[0]); if(!THREE.OrbitControls) await v3Script(V3LIB[1]); v3KeepLib(); }
const v3Dir = d => ["N","NE","E","SE","S","SO","O","NO"][Math.round(((d%360)+360)%360/45)%8];
const v3Fmt = v => v.toFixed(1).replace(".", ",");
// Données en tuiles fixes (grille Web Mercator, comme la carte) : les mêmes adresses reviennent d'une ouverture
// à l'autre, le service worker les garde (cache d'abord) et les zones hors ligne peuvent les télécharger.
export const V3O = 20037508.342789244, v3TS = z => 2*V3O/2**z, V3DZ = 13, V3DP = 128; // relief : tuiles z13 de 128 px (≈ 27 m à 45° N)
function v3Tiles(bb, z){ const ts = v3TS(z); return {ts, x0:Math.floor((bb[0]+V3O)/ts), x1:Math.floor((bb[2]+V3O)/ts-1e-9), y0:Math.floor((V3O-bb[3])/ts), y1:Math.floor((V3O-bb[1])/ts-1e-9)}; }
export function v3DemUrl(x, y){ const ts = v3TS(V3DZ), x0 = -V3O+x*ts, y1 = V3O-y*ts;
  return `https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES&STYLES=&CRS=EPSG:3857&BBOX=${x0.toFixed(2)},${(y1-ts).toFixed(2)},${(x0+ts).toFixed(2)},${y1.toFixed(2)}&WIDTH=${V3DP}&HEIGHT=${V3DP}&FORMAT=image/x-bil;bits=32`; }
const V3LY = { ortho:()=>bases.ortho, scan:()=>bases.scan25, slope:()=>slopes };   // mêmes tuiles WMTS que la carte
const v3TileUrl = (ly, z, x, y) => L.Util.template(ly._url, L.extend({}, ly.options, {z, x, y, s:"a", r:""}));
// Économie de données : réglage, ou « économiseur de données » / réseau lent signalé par le navigateur
const v3Eco = () => { const c = navigator.connection; return store.get("v3eco", false) || !!(c && (c.saveData || /2g|3g/.test(c.effectiveType||""))); };
// Zoom de la texture : assez pour ≈ V3T pixels sur la zone, plafonné à 14 sur téléphone (≈ 10 m/pixel, comme les zones hors ligne)
function v3TexZ(bb){ const z = Math.floor(Math.log2(V3T/256 * 2*V3O/(bb[2]-bb[0]))); return Math.max(11, Math.min(z, v3Low ? 14 : 15) - (v3Eco() ? 1 : 0)); }
function v3Proj(b){ const a = L.CRS.EPSG3857.project(b.getSouthWest()), c = L.CRS.EPSG3857.project(b.getNorthEast()); return [a.x, a.y, c.x, c.y]; }
// Adresses à télécharger pour une zone hors ligne : relief (zone + 5 km de marge) et photo au zoom 14
export function v3ZoneUrls(b){ const out = [], lat = b.getCenter().lat, dy = .045, dx = .045/Math.cos(lat*Math.PI/180);
  const pb = L.latLngBounds([b.getSouth()-dy, b.getWest()-dx], [b.getNorth()+dy, b.getEast()+dx]);
  let r = v3Tiles(v3Proj(pb), V3DZ); for(let y=r.y0;y<=r.y1;y++) for(let x=r.x0;x<=r.x1;x++) out.push(v3DemUrl(x, y));
  const dem = out.length; r = v3Tiles(v3Proj(b), 14); for(let y=r.y0;y<=r.y1;y++) for(let x=r.x0;x<=r.x1;x++) out.push(v3TileUrl(bases.ortho, 14, x, y));
  out.dem = dem; return out; }
// Nombre de tuiles 3D d'une zone (sans fabriquer les adresses) ; au-delà de V3DL_MAX, on renvoie vers les paquets par massif
export const V3DL_MAX = 3000;
export function v3ZoneCount(b){ const lat = b.getCenter().lat, dy = .045, dx = .045/Math.cos(lat*Math.PI/180), n = r => (r.x1-r.x0+1)*(r.y1-r.y0+1);
  return { dem: n(v3Tiles(v3Proj(L.latLngBounds([b.getSouth()-dy, b.getWest()-dx], [b.getNorth()+dy, b.getEast()+dx])), V3DZ)), ph: n(v3Tiles(v3Proj(b), 14)) }; }
async function v3Pool(items, n, fn){ let i = 0; await Promise.all(Array.from({length:n}, async () => { while(i < items.length){ const k = i++; await fn(items[k]); } })); }
async function v3Cached(u){ try{ return await (await caches.open(CN+"tiles")).match(u); }catch(e){ return null; } }
// Hors ligne : cache seulement (réponse immédiate) ; en ligne : réseau avec 20 s au plus par requête
async function v3Fetch(url, sig){ // ce qui est déjà sur le téléphone (zones, massifs, carte déjà vue) ne repasse jamais par le réseau
  const hit = await v3Cached(url); if(hit && hit.type !== "opaque") return hit;
  if(!navigator.onLine) throw new Error("hors ligne");
  const r = await Promise.race([fetch(url, {signal:sig}), new Promise((_, rej) => setTimeout(() => rej(new Error("délai dépassé")), 20000))]);
  if(!r.ok) throw new Error("IGN "+r.status); return r; }
async function v3Bitmap(url, sig){ const b = await (await v3Fetch(url, sig)).blob(); if(!/^image\//.test(b.type)) throw new Error("image"); return createImageBitmap(b); }
function v3Prog(what, done, n, sig){ if(sig && V3.abort && sig !== V3.abort.signal) return; const t = what+" "+Math.round(100*done/n)+" %"; if(V3.mesh) v3Tip(t); else if(V3.open) $("v3Status").textContent = "Chargement · "+t; }
// Relief : mosaïque des tuiles z13, puis grille N×N par interpolation bilinéaire (centres des pixels)
async function v3Dem(sig){
  const r = v3Tiles(V3.bb, V3DZ), P = V3DP, nx = r.x1-r.x0+1, ny = r.y1-r.y0+1, W = nx*P, H = ny*P, M = new Float32Array(W*H).fill(NaN), list = [];
  for(let y=r.y0;y<=r.y1;y++) for(let x=r.x0;x<=r.x1;x++) list.push([x, y]);
  let done = 0, got = 0;
  await v3Pool(list, 4, async ([x, y]) => {
    try{ const a = new Float32Array(await (await v3Fetch(v3DemUrl(x, y), sig)).arrayBuffer());
      if(a.length >= P*P){ got++; const ox = (x-r.x0)*P, oy = (y-r.y0)*P; for(let j=0;j<P;j++) M.set(a.subarray(j*P, j*P+P), (oy+j)*W+ox); }
    }catch(e){ if(e.name==="AbortError") throw e; }
    v3Prog("relief", ++done, list.length, sig); });
  if(got < list.length*.5) throw new Error(navigator.onLine ? "Relief IGN indisponible. Vérifiez le réseau." : "Pas de relief enregistré ici. Hors ligne, la vue 3D marche dans les zones téléchargées avec l'option « Vue 3D » (Plus › Hors ligne).");
  const N = V3N, h = new Float32Array(N*N), ps = r.ts/P, mx = -V3O+r.x0*r.ts, my = V3O-r.y0*r.ts, bb = V3.bb;
  const px = (x, y) => M[Math.max(0, Math.min(H-1, y))*W + Math.max(0, Math.min(W-1, x))];
  for(let j=0;j<N;j++){ const fy = (my-(bb[3]-j/(N-1)*(bb[3]-bb[1])))/ps-.5, y0 = Math.floor(fy), ty = fy-y0;
    for(let i=0;i<N;i++){ const fx = (bb[0]+i/(N-1)*(bb[2]-bb[0])-mx)/ps-.5, x0 = Math.floor(fx), tx = fx-x0;
      h[j*N+i] = (px(x0,y0)*(1-tx)+px(x0+1,y0)*tx)*(1-ty) + (px(x0,y0+1)*(1-tx)+px(x0+1,y0+1)*tx)*ty; } }
  return h;
}
// Texture : tuiles WMTS de la carte assemblées dans un canvas ; tuile absente → tuile parente (1 ou 2 niveaux) agrandie
async function v3Img(key, sig){
  if(V3.img[key]) return V3.img[key];
  const ly = V3LY[key](), bb = V3.bb, z = v3TexZ(bb), r = v3Tiles(bb, z), T = V3T, k = T/(bb[2]-bb[0]), list = [], par = new Map();
  const cv = document.createElement("canvas"); cv.width = cv.height = T; const g = cv.getContext("2d");
  for(let y=r.y0;y<=r.y1;y++) for(let x=r.x0;x<=r.x1;x++) list.push([x, y]);
  const parent = (pz, x, y) => { const u = v3TileUrl(ly, pz, x, y); if(!par.has(u)) par.set(u, v3Bitmap(u, sig).catch(() => null)); return par.get(u); };
  let ok = 0, done = 0; const what = key==="slope" ? "pentes" : key==="scan" ? "carte" : "photo";
  await v3Pool(list, 6, async ([x, y]) => {
    const dx = (-V3O+x*r.ts-bb[0])*k, dy = (bb[3]-(V3O-y*r.ts))*k, ds = r.ts*k; let im = null;
    const local = async u => { const h = await v3Cached(u); return h && h.type !== "opaque" ? createImageBitmap(await h.blob()).catch(() => null) : null; };
    im = await local(v3TileUrl(ly, z, x, y));
    if(!im) for(let dn=1; dn<=2 && !im; dn++){ // tuiles filles (zoom +1 ou +2) déjà enregistrées : on les assemble
      const n = 1<<dn, kids = []; for(let j=0;j<n;j++) for(let i=0;i<n;i++) kids.push([i, j, local(v3TileUrl(ly, z+dn, x*n+i, y*n+j))]);
      let got = 0; for(const [i, j, pr] of kids){ const ci = await pr; if(ci){ g.drawImage(ci, dx+i*ds/n, dy+j*ds/n, ds/n, ds/n); ci.close && ci.close(); got++; } }
      if(got >= n*n*.75){ im = true; ok++; } }
    if(im === true){ v3Prog(what, ++done, list.length, sig); return; }
    if(!im){ try{ im = await v3Bitmap(v3TileUrl(ly, z, x, y), sig); }catch(e){ if(e.name==="AbortError") throw e; } }
    if(im){ g.drawImage(im, dx, dy, ds, ds); im.close && im.close(); ok++; }
    else for(let up=1; up<=2; up++){ const pi = await parent(z-up, x>>up, y>>up); if(pi){ const n = 1<<up, s = 256/n; g.drawImage(pi, (x%n)*s, (y%n)*s, s, s, dx, dy, ds, ds); ok++; break; } }
    v3Prog(what, ++done, list.length, sig); });
  for(const p of par.values()){ const im = await p; if(im && im.close) im.close(); }
  if(!ok){ cv.width = 0; throw new Error(what+" indisponible"); }
  return V3.img[key] = cv;
}
// Zone : centre de la carte, côté = largeur affichée bornée entre 6 et 10 km, carré en mètres vrais
// Relief déjà sur le téléphone au point c (massif installé ou zone téléchargée avec l'option 3D) ?
function v3Local(c){ const P = L.CRS.EPSG3857.project(c), ts = v3TS(V3DZ), x = Math.floor((P.x+V3O)/ts), y = Math.floor((V3O-P.y)/ts);
  return Object.values(mInst).some(m => x >= m.x0 && x < m.x0+m.nx && y >= m.y0 && y < m.y0+m.ny)
    || zones.some(z => z.d3 && L.latLngBounds([z.b[0],z.b[1]],[z.b[2],z.b[3]]).contains(c)); }
// Zone : centrée sur la carte, côté = largeur affichée, de 6 à 10 km (données du réseau) ou jusqu'à 30 km quand
// le relief est déjà sur le téléphone (rien à télécharger : seule la finesse baisse, la grille garde sa taille)
const V3MAX = c => v3Local(c) ? 30000 : 10000;
function v3Zone(c0, side0){
  const b = map.getBounds(), c = c0 || map.getCenter();
  const w = map.distance([c.lat,b.getWest()],[c.lat,b.getEast()]), h = map.distance([b.getSouth(),c.lng],[b.getNorth(),c.lng]);
  const side = side0 || Math.round(Math.min(V3MAX(c), Math.max(6000, Math.max(w, h))) / 500) * 500;
  const P = L.CRS.EPSG3857.project(c), half = side/2 / Math.cos(c.lat*Math.PI/180);
  return { c, side, bb:[P.x-half, P.y-half, P.x+half, P.y+half] };
}
// lat/lng → coordonnées 0..1 dans la zone (u vers l'est, v vers le sud)
function v3UV(lat, lng){ const P = L.CRS.EPSG3857.project(L.latLng(lat, lng)), bb = V3.bb; return [(P.x-bb[0])/(bb[2]-bb[0]), (bb[3]-P.y)/(bb[3]-bb[1])]; }
function v3H(u, v){ // altitude (m), interpolation bilinéaire dans la grille
  const N = V3N, x = Math.min(Math.max(u,0),1)*(N-1), y = Math.min(Math.max(v,0),1)*(N-1);
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0+1,N-1), y1 = Math.min(y0+1,N-1), fx = x-x0, fy = y-y0, H = V3.h;
  return (H[y0*N+x0]*(1-fx)+H[y0*N+x1]*fx)*(1-fy) + (H[y1*N+x0]*(1-fx)+H[y1*N+x1]*fx)*fy;
}
const v3X = u => (u-.5)*V3.S, v3Z = v => (v-.5)*V3.S, v3Y = m => (m-V3.h0)/1000*V3.pref.exag;

export async function open3D(opt){
  if(V3.open) return; opt = opt && opt.c ? opt : null;
  if(!FRANCE.contains(opt ? opt.c : map.getCenter())){ toast("Vue 3D : France seulement (relief IGN)"); return; }
  { const vp = document.querySelector('meta[name="viewport"]'); if(vp){ const c = vp.content; vp.content = c+",minimum-scale=1"; setTimeout(() => vp.content = c, 50); } } // annule un zoom de page resté actif
  V3.open = true; V3.bg = opt ? opt.bg : v3AutoBg(); V3.camKeep = opt && opt.cam; $("b3d").classList.add("on"); $("v3d").hidden = false; v3Prefs();
  const z = opt ? v3Zone(opt.c, opt.side) : v3Zone(); Object.assign(V3, z, { S: z.side/1000, img:{}, labels:[], abort:new AbortController() });
  $("v3Info").textContent = (z.side/1000).toLocaleString("fr-FR")+" × "+(z.side/1000).toLocaleString("fr-FR")+" km · chargement…";
  v3Status("Chargement du relief IGN…");
  try{
    const sig = V3.abort.signal;
    const [h] = await Promise.all([v3Dem(sig), v3Lib()]);
    // fond indisponible (ex. hors ligne hors zone téléchargée) : on essaie l'autre, sinon couleurs d'altitude
    const auto = V3.bg;
    if(V3.bg !== "relief"){ const alt = V3.bg==="scan" ? "ortho" : "scan";
      await v3Img(V3.bg, sig).catch(e => { if(e.name==="AbortError") throw e; return v3Img(alt, sig).then(() => { V3.bg = alt; }); })
        .catch(e => { if(e.name==="AbortError") throw e; V3.bg = "relief"; if(auto !== "relief") V3.noTex = true; }); }
    if(V3.pref.slope) await v3Img("slope", sig).catch(() => null);
    if(!V3.open) return;
    v3Heights(h);
    if(!store.get("v3exUser", false)){ const rg = V3.h1-V3.h0; V3.pref.exag = rg<250 ? 3 : rg<600 ? 2.2 : rg<1200 ? 1.6 : 1.3; }
    v3Build(); v3Prefs(); v3Status(null); if(V3.noTex){ V3.noTex = false; v3Tip("Ni photo ni carte ici sans réseau : relief ombré seul"); }
    else if(v3AutoBg() && zones.some(z => L.latLngBounds([z.b[0],z.b[1]],[z.b[2],z.b[3]]).contains(V3.c))) v3Tip("Fond : "+(V3.bg==="scan"?"carte":"photo")+" de la zone téléchargée");
  }catch(e){
    if(!V3.open || e.name==="AbortError") return;
    v3Status(/relief|Zone|moteur/i.test(e.message) ? (/moteur/.test(e.message) ? "Le moteur 3D n'est pas encore sur le téléphone : ouvrez la vue 3D une fois avec du réseau." : e.message) : "Relief IGN indisponible ("+e.message+").", true);
  }
}
function v3Status(msg, retry){ const el = $("v3Status"); el.hidden = !msg; if(!msg) return; el.textContent = msg;
  if(retry){ const b = document.createElement("button"); b.textContent = "Réessayer"; b.onclick = () => { close3D(); open3D(); }; el.append(document.createElement("br"), b); } }
function v3Heights(a){
  const N = V3N, h = new Float32Array(N*N); let ok = 0, sum = 0;
  for(let i=0;i<N*N;i++){ const v = a[i]; if(v > -500 && v < 9000){ h[i] = v; ok++; sum += v; } else h[i] = NaN; }
  if(ok < N*N*.1) throw new Error("Zone hors couverture du relief IGN");
  const mean = sum/ok; let lo = 1e9, hi = -1e9;
  for(let i=0;i<N*N;i++){ if(isNaN(h[i])) h[i] = mean; if(h[i]<lo) lo = h[i]; if(h[i]>hi) hi = h[i]; }
  V3.h = h; V3.h0 = lo; V3.h1 = hi;
}
function v3Build(){
  const N = V3N, S = V3.S, host = $("v3dScene");
  const R3 = V3.renderer = new THREE.WebGLRenderer({antialias: !v3Low, powerPreference:"high-performance"});
  R3.setPixelRatio(Math.min(devicePixelRatio, v3Low ? 1.5 : 2)); R3.outputEncoding = THREE.sRGBEncoding; R3.setClearColor(0xF4F7FA);
  host.appendChild(R3.domElement);
  const sc = V3.scene = new THREE.Scene(); sc.fog = new THREE.Fog(0xF4F7FA, S*2.2, S*5);
  const cam = V3.cam = new THREE.PerspectiveCamera(45, 1, S/400, S*12);
  const ctl = V3.ctl = new THREE.OrbitControls(cam, R3.domElement);
  ctl.enableDamping = true; ctl.dampingFactor = .12; ctl.maxPolarAngle = Math.PI*.47; ctl.minDistance = S/30; ctl.maxDistance = S*2.6;
  ctl.screenSpacePanning = false; ctl.touches = {ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN};
  ctl.addEventListener("change", () => { const t = ctl.target, m = S/2; t.x = Math.max(-m, Math.min(m, t.x)); t.z = Math.max(-m, Math.min(m, t.z)); V3.dirty = true; });
  sc.add(new THREE.HemisphereLight(0xffffff, 0x51606e, .62));
  V3.sun = new THREE.DirectionalLight(0xffffff, .72); sc.add(V3.sun);
  const geo = new THREE.PlaneGeometry(S, S, N-1, N-1); geo.rotateX(-Math.PI/2);
  V3.cv = document.createElement("canvas"); V3.cv.width = V3.cv.height = V3T;
  V3.tex = new THREE.CanvasTexture(V3.cv); V3.tex.encoding = THREE.sRGBEncoding; V3.tex.anisotropy = Math.min(8, R3.capabilities.getMaxAnisotropy());
  V3.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({map: V3.tex})); sc.add(V3.mesh);
  v3ApplyH(); v3Paint(); v3MakeLabels();
  const k = V3.camKeep, d = k ? k.d : S*.9, pol = k ? k.pol : 55*Math.PI/180, az = k ? k.az : 0, ty = v3Y(v3H(.5,.5));
  ctl.target.set(0, ty, 0); cam.position.set(d*Math.sin(pol)*Math.sin(az), ty + d*Math.cos(pol), d*Math.sin(pol)*Math.cos(az)); ctl.update();
  // toucher le relief : altitude du point
  let down = null;
  R3.domElement.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY, Date.now()]; });
  R3.domElement.addEventListener("pointerup", e => { if(!down || Math.hypot(e.clientX-down[0], e.clientY-down[1]) > 8 || Date.now()-down[2] > 500) return; down = null;
    const r = R3.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1), cam);
    const hit = ray.intersectObject(V3.mesh)[0]; if(!hit) return;
    const u = hit.point.x/S+.5, v = hit.point.z/S+.5; v3Tip("Altitude : "+Math.round(v3H(u, v)).toLocaleString("fr-FR")+" m"); });
  addEventListener("resize", v3Resize); v3Resize();
  $("v3Info").textContent = (V3.side/1000).toLocaleString("fr-FR")+" × "+(V3.side/1000).toLocaleString("fr-FR")+" km · "+Math.round(V3.h0).toLocaleString("fr-FR")+" – "+Math.round(V3.h1).toLocaleString("fr-FR")+" m";
  V3.dirty = true; V3.lastGps = null; V3.lastRec = 0; v3Loop();
}
function v3ApplyH(){
  const pos = V3.mesh.geometry.attributes.position, H = V3.h;
  for(let i=0;i<H.length;i++) pos.setY(i, v3Y(H[i]));
  pos.needsUpdate = true; V3.mesh.geometry.computeVertexNormals(); V3.mesh.geometry.computeBoundingSphere(); V3.dirty = true;
}
function v3Resize(){ if(!V3.renderer) return; const host = $("v3dScene"), w = host.clientWidth, h = host.clientHeight;
  V3.renderer.setSize(w, h, false); V3.cam.aspect = w/h;
  const off = Math.max(0, (document.querySelector(".v3-card").offsetHeight - 64)/2); V3.cam.setViewOffset(w, h, 0, off, w, h);
  V3.cam.updateProjectionMatrix(); V3.dirty = true; }
function v3Tip(t){ const el = $("v3Tip"); el.textContent = t; el.hidden = false; clearTimeout(v3Tip._t); v3Tip._t = setTimeout(() => el.hidden = true, 2600); }

// Texture : fond (photo ou carte), pentes, puis traces, itinéraire mesuré peints dessus (drapé exact sur le relief)
function v3Lines(){
  const out = [];
  if(R() && measuring && mPts.length > 1) out.push({pts:(trailOn() ? measureGeom() : mPts.map(p => [p.lat,p.lng])), col:trailOn()?"#6a1b9a":"#0b2f5b", dash:!trailOn()});
  const tr = shownId && tracks.find(t => t.id===shownId); if(tr) out.push({pts:tr.pts, col:"#6a1b9a", ends:true});
  if(rec && rec.on && rec.pts.length > 1) out.push({pts:rec.pts, col:"#d81b60", ends:false});
  return out;
}
function v3Paint(){
  const g = V3.cv.getContext("2d"), T = V3T, base = V3.bg==="relief" ? (V3.img.relief || (V3.img.relief = v3Hypso())) : V3.img[V3.bg];
  g.fillStyle = "#e9edf1"; g.fillRect(0, 0, T, T);
  if(base) g.drawImage(base, 0, 0, T, T);
  if(V3.pref.slope && V3.img.slope){ g.globalAlpha = .6; g.drawImage(V3.img.slope, 0, 0, T, T); g.globalAlpha = 1; }
  const k = T/2048 * Math.max(1, 8/V3.S);  // épaisseur ≈ 25 m sur une zone de 8 km
  g.lineJoin = g.lineCap = "round";
  for(const ln of v3Lines()){
    const xy = ln.pts.map(p => { const [u, v] = v3UV(p[0], p[1]); return [u*T, v*T]; });
    const path = () => { g.beginPath(); xy.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); };
    g.setLineDash([]); path(); g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 12*k; g.stroke();
    g.setLineDash(ln.dash ? [6*k, 9*k] : []); path(); g.strokeStyle = ln.col; g.lineWidth = 7*k; g.stroke(); g.setLineDash([]);
    if(ln.ends) [[xy[0],"#1c9e47"],[xy[xy.length-1],"#e5372b"]].forEach(([p, c]) => { g.beginPath(); g.arc(p[0], p[1], 7*k, 0, 7); g.fillStyle = c; g.fill(); g.lineWidth = 3*k; g.strokeStyle = "#fff"; g.stroke(); });
    if(ln.dash) xy.forEach(p => { g.beginPath(); g.arc(p[0], p[1], 5*k, 0, 7); g.fillStyle = "#0b2f5b"; g.fill(); g.lineWidth = 2.5*k; g.strokeStyle = "#fff"; g.stroke(); });
  }
  V3.tex.needsUpdate = true; V3.dirty = true;
}
// Couleurs d'altitude (fond « Relief ») : calculées sur le téléphone à partir du relief, aucune donnée à télécharger
const V3HY = [[0,[150,190,120]],[600,[178,206,132]],[1200,[222,220,160]],[1700,[214,190,140]],[2200,[186,158,124]],[2700,[160,148,140]],[3300,[200,198,200]],[3900,[245,246,250]]];
// Le fond « Relief » doit se lire partout, plaine comprise : couleurs étirées sur l'altitude de la zone (hors haute
// montagne), ombrage calculé dans l'image (renforcé si le terrain est doux) et courbes de niveau adaptées au dénivelé.
const V3LOW = [[0,[96,148,84]],[.25,[148,188,108]],[.5,[214,214,150]],[.75,[212,182,128]],[1,[176,136,98]]];
function v3Hypso(){
  const N = 1024, cv = document.createElement("canvas"), sm = document.createElement("canvas"); sm.width = sm.height = N;
  const g = sm.getContext("2d"), im = g.createImageData(N, N), D = im.data, lo = V3.h0, rg = Math.max(1, V3.h1-V3.h0), alpine = V3.h1 > 1800;
  const H = new Float32Array(N*N); for(let j=0;j<N;j++) for(let i=0;i<N;i++) H[j*N+i] = v3H(i/(N-1), j/(N-1));
  const step = rg<150 ? 5 : rg<400 ? 10 : rg<1000 ? 20 : rg<2500 ? 50 : 100, px = V3.side/N, zf = rg<300 ? 3 : rg<800 ? 2 : 1.3;
  const a = V3.pref.sun*Math.PI/180, el = 40*Math.PI/180, Lx = Math.sin(a)*Math.cos(el), Ly = -Math.cos(a)*Math.cos(el), Lz = Math.sin(el);
  const ramp = (h, out) => { let st, f;
    if(alpine){ let k = 1; while(k < V3HY.length-1 && h > V3HY[k][0]) k++; const [a0, c0] = V3HY[k-1], [a1, c1] = V3HY[k]; f = Math.max(0, Math.min(1, (h-a0)/(a1-a0))); st = [c0, c1]; }
    else { const t = Math.max(0, Math.min(1, (h-lo)/rg)); let k = 1; while(k < V3LOW.length-1 && t > V3LOW[k][0]) k++; const [a0, c0] = V3LOW[k-1], [a1, c1] = V3LOW[k]; f = (t-a0)/(a1-a0); st = [c0, c1]; }
    for(let c=0;c<3;c++) out[c] = st[0][c] + (st[1][c]-st[0][c])*f; };
  const col = [0,0,0];
  for(let j=0;j<N;j++) for(let i=0;i<N;i++){
    const k = j*N+i, h = H[k], hx0 = H[j*N+Math.max(0,i-1)], hx1 = H[j*N+Math.min(N-1,i+1)], hy0 = H[Math.max(0,j-1)*N+i], hy1 = H[Math.min(N-1,j+1)*N+i];
    const gx = (hx1-hx0)/(2*px)*zf, gy = (hy1-hy0)/(2*px)*zf, nl = Math.hypot(gx, gy, 1);
    const sh = Math.max(0, (-gx*Lx - gy*Ly + Lz)/nl), lum = .5 + .62*sh;
    ramp(h, col); let m = lum;
    const lv = Math.floor(h/step), lr = i<N-1 ? Math.floor(H[k+1]/step) : lv, ld = j<N-1 ? Math.floor(H[k+N]/step) : lv;
    if(lv !== lr || lv !== ld){ const top = Math.max(lv, lr, ld); m *= top % 5 === 0 ? .55 : .78; }
    D[k*4] = Math.min(255, col[0]*m); D[k*4+1] = Math.min(255, col[1]*m); D[k*4+2] = Math.min(255, col[2]*m); D[k*4+3] = 255; }
  g.putImageData(im, 0, 0); cv.width = cv.height = V3T; const cg = cv.getContext("2d"); cg.imageSmoothingQuality = "high"; cg.drawImage(sm, 0, 0, V3T, V3T); sm.width = 0;
  V3.step = step; return cv;
}
// Repères et position GPS : étiquettes HTML posées sur le relief, estompées quand une crête les cache
const V3PIN = '<svg viewBox="0 0 24 24"><path d="M12 1a7 7 0 0 0-7 7c0 5 7 15 7 15s7-10 7-15a7 7 0 0 0-7-7z" fill="#0b63b6" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="8" r="2.6" fill="#fff"/></svg>';
function v3Label(cls, name, inner){ const d = document.createElement("div"); d.className = "v3-lb "+cls; const b = document.createElement("b"); b.textContent = name; d.append(b); d.insertAdjacentHTML("beforeend", inner); $("v3Labels").append(d); return d; }
const v3In = (u, v) => u >= 0 && u <= 1 && v >= 0 && v <= 1;
function v3MakeLabels(){
  $("v3Labels").innerHTML = ""; V3.labels = [];
  wps.forEach(w => { const [u, v] = v3UV(w.lat, w.lng); if(v3In(u, v)) V3.labels.push({u, v, el:v3Label("", w.n, V3PIN)}); });
  V3.me = {u:-1, v:-1, el:v3Label("me", "Vous", "<i></i>")}; V3.me.el.style.display = "none"; V3.labels.push(V3.me);
  v3Gps();
}
function v3Gps(){ if(!last){ V3.me.u = -1; return; } const [u, v] = v3UV(last.ll.lat, last.ll.lng); V3.me.u = u; V3.me.v = v; V3.lastGps = last.t; V3.dirty = true; }
function v3Hidden(p){ // la ligne de visée caméra → point passe-t-elle sous le relief ?
  const c = V3.cam.position, n = 40;
  for(let i=1;i<n;i++){ const f = i/n, x = c.x+(p.x-c.x)*f, y = c.y+(p.y-c.y)*f, z = c.z+(p.z-c.z)*f, u = x/V3.S+.5, v = z/V3.S+.5;
    if(v3In(u, v) && v3Y(v3H(u, v)) > y + V3.S/400) return true; }
  return false;
}
function v3PlaceLabels(slow){
  const w = V3.renderer.domElement.clientWidth, h = V3.renderer.domElement.clientHeight, p = new THREE.Vector3();
  for(const L3 of V3.labels){
    if(!v3In(L3.u, L3.v)){ L3.el.style.display = "none"; continue; }
    p.set(v3X(L3.u), v3Y(v3H(L3.u, L3.v)), v3Z(L3.v)); const world = p.clone(); p.project(V3.cam);
    const vis = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1; L3.el.style.display = vis ? "" : "none"; if(!vis) continue;
    L3.el.style.transform = `translate(${(p.x*.5+.5)*w}px,${(-p.y*.5+.5)*h}px) translate(-50%,-100%)`;
    if(slow) L3.el.classList.toggle("hid", v3Hidden(world));
  }
}
function v3Loop(){
  V3.raf = requestAnimationFrame(v3Loop);
  if(last && last.t !== V3.lastGps) v3Gps();
  if(rec && rec.on && Date.now()-V3.lastRec > 15000){ V3.lastRec = Date.now(); if(rec.pts.length > 1) v3Paint(); }
  V3.ctl.update();
  const az = V3.ctl.getAzimuthalAngle()*180/Math.PI; $("v3Needle").style.transform = `rotate(${az}deg)`;
  const t = V3.ctl.target, far = Math.hypot(t.x, t.z) > V3.S*.25; if(far === $("v3Here").hidden){ $("v3Here").hidden = !far; $("v3d").style.setProperty("--v3card", document.querySelector(".v3-card").offsetHeight+"px"); }
  if(!V3.dirty) return; V3.dirty = false;
  V3.renderer.render(V3.scene, V3.cam);
  const now = Date.now(), slow = now-(V3.lastOcc||0) > 250; if(slow) V3.lastOcc = now; else V3.dirty = true;  // repasse pour l'estompage
  v3PlaceLabels(slow);
}
function close3D(){
  V3.open = false; cancelAnimationFrame(V3.raf); if(V3.abort) V3.abort.abort();
  $("v3d").hidden = true; $("v3Here").hidden = true; $("b3d").classList.remove("on"); $("v3Labels").innerHTML = ""; $("v3Status").hidden = true; removeEventListener("resize", v3Resize);
  if(V3.renderer){ V3.ctl.dispose(); V3.mesh.geometry.dispose(); V3.mesh.material.dispose(); V3.tex.dispose(); V3.renderer.dispose(); V3.renderer.forceContextLoss(); V3.renderer.domElement.remove(); }
  for(const k in (V3.img||{})) V3.img[k].width = 0;  // libère la mémoire des canvas
  Object.assign(V3, {bg:null, renderer:null, sun:null, ctl:null, scene:null, mesh:null, tex:null, cv:null, h:null, img:{}, labels:[]});
}
// Réglages : fond, pentes, exagération, soleil (mémorisés)
function v3Sun(){ if(!V3.sun) return; const a = V3.pref.sun*Math.PI/180, S = V3.S; V3.sun.position.set(Math.sin(a)*S, S*.8, -Math.cos(a)*S); V3.dirty = true; }
function v3Prefs(){
  const P = V3.pref; store.set("v3", P);
  document.querySelectorAll("#v3d .v3-seg button[data-t]").forEach(b => b.setAttribute("aria-pressed", b.dataset.t===(V3.bg || "relief")));
  $("v3Slope").setAttribute("aria-pressed", P.slope);
  $("v3Exag").value = P.exag; $("v3ExagO").textContent = v3Fmt(P.exag)+"×";
  $("v3Sun").value = P.sun; $("v3SunO").textContent = v3Dir(P.sun);
  $("v3Leg").hidden = !P.slope;
  if(P.slope) $("v3Leg").innerHTML = 'Pentes :<i style="background:#f5e200"></i>30–35°<i style="background:#f08a00"></i>35–40°<i style="background:#e00000"></i>40–45°<i style="background:#b000b0"></i>> 45°';
  v3Resize();
  v3Sun();
}
async function v3Need(key){ if(key==="relief" || V3.img[key] || !V3.mesh) return true;
  v3Tip("Chargement…"); try{ await v3Img(key, V3.abort.signal); return true; }catch(e){ if(V3.open) v3Tip(key==="scan" ? "Carte IGN indisponible" : "Image IGN indisponible"); return false; } }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initVue3d(){
  /* ---------- Vue 3D (Rando) : relief IGN, photo ou carte drapée, traces et repères ---------- */
  // Three.js (lib/three.min.js + lib/three-orbit.js) n'est chargé qu'à la première ouverture.
  V3 = { open:false, raf:0, pref: Object.assign({slope:false, exag:1.3, sun:135}, store.get("v3", {})) };
  delete V3.pref.tex; // le fond n'est plus mémorisé : il est choisi à chaque ouverture (v3AutoBg)
  v3Low = matchMedia("(pointer:coarse)").matches; v3Mem = navigator.deviceMemory || 4;
  V3N = v3Mem <= 2 ? 192 : v3Low ? 256 : 400;       // côté de la grille du relief (sommets)
  V3T = v3Mem <= 2 ? 1024 : 2048;                    // côté de la texture drapée (pixels)
  document.querySelectorAll("#v3d .v3-seg button[data-t]").forEach(b => b.onclick = async () => {
    const t = b.dataset.t; store.set("v3bg", t); if(!(await v3Need(t)) || !V3.open) return; V3.bg = t; v3Prefs(); if(V3.cv) v3Paint(); $("v3Tip").hidden = true; });
  $("v3Slope").onclick = async () => { const on = !V3.pref.slope; if(on && !(await v3Need("slope"))) return; if(!V3.open) return; V3.pref.slope = on; v3Prefs(); if(V3.cv) v3Paint(); $("v3Tip").hidden = true; };
  $("v3Exag").oninput = e => { V3.pref.exag = +e.target.value; $("v3ExagO").textContent = v3Fmt(V3.pref.exag)+"×";
    if(V3.mesh && !V3.exT) V3.exT = requestAnimationFrame(() => { V3.exT = 0; const t = V3.ctl.target, y0 = t.y; v3ApplyH(); const ny = v3Y(v3H(t.x/V3.S+.5, t.z/V3.S+.5)); V3.cam.position.y += ny-y0; t.y = ny; }); };
  $("v3Exag").onchange = () => { store.set("v3exUser", true); store.set("v3", V3.pref); };
  $("v3Sun").oninput = e => { V3.pref.sun = +e.target.value; $("v3SunO").textContent = v3Dir(V3.pref.sun); v3Sun(); };
  $("v3Sun").onchange = () => { store.set("v3", V3.pref); if(V3.img && V3.img.relief){ V3.img.relief.width = 0; V3.img.relief = null; if(V3.bg==="relief" && V3.cv) v3Paint(); } };
  $("v3North").onclick = () => { if(!V3.ctl) return; const t = V3.ctl.target, c = V3.cam.position, d = c.distanceTo(t), pol = V3.ctl.getPolarAngle();
    c.set(t.x, t.y + d*Math.cos(pol), t.z + d*Math.sin(pol)); V3.ctl.update(); V3.dirty = true; };
  $("v3Close").onclick = close3D;
  $("v3Set").onclick = () => { const o = $("v3SetBox").hidden; $("v3SetBox").hidden = !o; $("v3Set").setAttribute("aria-expanded", o); v3Resize();
    $("v3d").style.setProperty("--v3card", document.querySelector(".v3-card").offsetHeight+"px"); };
  $("bInstQ").onclick = () => instOpen();
  $("mcTr").onclick = () => { closeSheets(); $("bTrack").onclick(); };
  // Recentrer : nouvelle zone autour du point regardé, même taille, même angle de vue ; la carte suit
  $("v3Here").onclick = () => { if(!V3.ctl) return; const t = V3.ctl.target, bb = V3.bb, u = t.x/V3.S+.5, v = t.z/V3.S+.5;
    const c = L.CRS.EPSG3857.unproject(L.point(bb[0]+u*(bb[2]-bb[0]), bb[3]-v*(bb[3]-bb[1])));
    const cam = {d: V3.cam.position.distanceTo(t), pol: V3.ctl.getPolarAngle(), az: V3.ctl.getAzimuthalAngle()}, bg = V3.bg, side = Math.min(V3.side, V3MAX(c));
    $("v3Here").hidden = true; close3D(); setFollow(false); map.setView(c, map.getZoom(), {animate:false}); open3D({c, side, cam, bg}); };
  $("v3eco").checked = store.get("v3eco", false); $("v3eco").onchange = e => store.set("v3eco", e.target.checked);
  $("b3d").onclick = open3D;
  document.addEventListener("keydown", e => { if(e.key==="Escape" && V3.open) close3D(); });
}
