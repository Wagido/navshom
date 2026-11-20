// Carte : Leaflet, zones, fonds de carte, mode Mer / Rando mémorisé, clé SHOM
import { $, fmtNM, store, toast } from "../utils.js";

export let FRANCE, MODE, map, shomKey, bases, slopes, seamarks, curBase;
let ZONE, view;

export const R = () => MODE==="rando";
export const AREA = () => R() ? FRANCE : ZONE;
export const baseKey = () => "base_"+MODE;
export const fmtD = m => R() ? (m<1000 ? Math.round(m)+" m" : (m/1000).toFixed(m<10000?2:1).replace(".",",")+" km") : fmtNM(m);
export const SPOTS = [
  ["— Manche —",[49.6,-1.5],7], ["Dunkerque / Calais",[51.0,2.0],10], ["Baie de Somme",[50.2,1.55],11], ["Le Havre / Seine",[49.48,0.1],11],
  ["Cherbourg / Raz Blanchard",[49.68,-1.75],11], ["Baie de Saint-Brieuc",[48.6,-2.7],10],
  ["— Bretagne —",[48.4,-3.4],8], ["Iroise / Brest",[48.35,-4.75],11], ["Raz de Sein",[48.04,-4.75],12],
  ["Glénan / Concarneau",[47.78,-3.98],11], ["Groix / Lorient",[47.68,-3.45],11], ["Belle-Île / Quiberon",[47.38,-3.15],11],
  ["Golfe du Morbihan",[47.56,-2.85],12], ["Baie de La Baule",[47.25,-2.35],11], ["Baie de Morlaix",[48.70,-3.90],11],
  ["Bréhat / Paimpol",[48.85,-3.00],12], ["Saint-Malo / Chausey",[48.75,-1.95],11],
  ["Jersey",[49.20,-2.13],11], ["Guernesey / Sercq",[49.45,-2.50],11], ["Aurigny",[49.72,-2.10],11],
  ["— Atlantique —",[46.3,-1.8],7], ["Noirmoutier / Yeu",[46.85,-2.25],10], ["Pertuis / La Rochelle / Ré",[46.1,-1.3],10],
  ["Estuaire de la Gironde",[45.55,-1.0],10], ["Bassin d'Arcachon",[44.66,-1.18],11], ["Pays basque",[43.45,-1.65],11],
  ["— Méditerranée —",[42.9,5.5],7], ["Golfe du Lion",[43.1,3.6],9], ["Marseille / Calanques",[43.22,5.4],11], ["Îles d'Hyères",[43.03,6.3],11],
  ["Saint-Tropez",[43.25,6.7],11], ["Cannes / Lérins",[43.52,7.04],11], ["Nice / Antibes",[43.62,7.2],11],
  ["— Corse —",[42.15,9.0],8], ["Bonifacio",[41.39,9.16],11], ["Ajaccio",[41.9,8.7],11], ["Calvi / Balagne",[42.6,8.85],11], ["Cap Corse",[42.95,9.4],10]
];
// Géoplateforme IGN (data.geopf.fr) ; "private" = couches SCAN avec la clé transitoire publiée par l'IGN
export const geopf = (layer, fmt, priv) => `https://data.geopf.fr/${priv?"private/wmts?apikey=ign_scan_ws&":"wmts?"}SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${encodeURIComponent(fmt)}`;
export const shomUrl = layer => "https://services.data.shom.fr/"+encodeURIComponent(shomKey||"clevisu")+"/wmts?layer="+layer+
  "&style=normal&tilematrixset=3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}";
export let shomOk=0, shomErr=0;
function updScale(){ const z=map.getZoom(), den=156543.034*Math.cos(map.getCenter().lat*Math.PI/180)/2**z/0.00028;
  $("scale").textContent = "1:"+(den>=1e6?(den/1e6).toFixed(1)+" M":den>=1e3?Math.round(den/1e3)+" 000":Math.round(den)); }

// pour les autres modules (une variable importée ne peut pas être modifiée directement)
export function setMODE(v){ MODE = v; return v; }
export function setShomKey(v){ shomKey = v; return v; }
export function setCurBase(v){ curBase = v; return v; }
export function setShomOk(v){ shomOk = v; return v; }
export function setShomErr(v){ shomErr = v; return v; }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initCarte(){

  /* ================= Carte ================= */
  ZONE = L.latLngBounds([41.2,-5.9],[51.3,9.8]); // toutes les côtes de France métropolitaine + Corse
  FRANCE = L.latLngBounds([41.2,-5.9],[51.3,9.8]);
  MODE = store.get("mode","mer");
  view = store.get("view", {c:[48.4,-3.4], z:8});
  if(!AREA().contains(view.c)) view = R() ? {c:[46.6,2.4], z:6} : {c:[48.4,-3.4], z:8};
  // zoom sans clignotement : on garde les tuiles déjà affichées jusqu'à l'arrivée des nouvelles
  L.TileLayer.mergeOptions({keepBuffer:4, updateWhenZooming:false, updateWhenIdle:false});
  map = L.map("map", {zoomControl:false, fadeAnimation:false, minZoom:R()?6:7, maxBounds:AREA().pad(R()?0.05:0.15), maxBoundsViscosity:1}).setView(view.c, view.z);
  map.attributionControl.setPrefix(false);
  shomKey = (store.get("shomkey","")||"").trim();
  bases = {
    shom:  L.tileLayer(shomUrl("RASTER_MARINE_3857_WMTS"), {maxZoom:18, bounds:FRANCE, attribution:"© SHOM"}),
    gebco: L.tileLayer(shomUrl("FDC_GEBCO_PYR-PNG_3857_WMTS"), {maxZoom:18, maxNativeZoom:12, bounds:FRANCE, attribution:"© SHOM / GEBCO"}),
    osm:   L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, bounds:FRANCE, attribution:"© OpenStreetMap"}),
    ign:   L.tileLayer(geopf("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2","image/png"), {maxZoom:19, maxNativeZoom:18, bounds:FRANCE, attribution:"© IGN"}),
    ortho: L.tileLayer(geopf("ORTHOIMAGERY.ORTHOPHOTOS","image/jpeg"), {maxZoom:19, maxNativeZoom:19, bounds:FRANCE, attribution:"© IGN"}),
    litto: L.tileLayer(geopf("GEOGRAPHICALGRIDSYSTEMS.COASTALMAPS","image/png"), {maxZoom:18, minNativeZoom:6, maxNativeZoom:16, bounds:FRANCE, attribution:"© IGN / SHOM · non destiné à la navigation"}),
    scan25:L.tileLayer(geopf("GEOGRAPHICALGRIDSYSTEMS.MAPS","image/jpeg",true), {maxZoom:18, maxNativeZoom:16, bounds:FRANCE, attribution:"© IGN"}),
    topo:  L.tileLayer("https://tile.opentopomap.org/{z}/{x}/{y}.png", {maxZoom:18, maxNativeZoom:17, bounds:FRANCE, attribution:"© OpenTopoMap (CC-BY-SA), © OpenStreetMap"}),
    ign1950: L.tileLayer(geopf("GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN50.1950","image/jpeg"), {maxZoom:18, minNativeZoom:3, maxNativeZoom:15, bounds:FRANCE, attribution:"© IGN · carte 1950"}),
    emod:  L.tileLayer("https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png", {maxZoom:18, maxNativeZoom:12, bounds:FRANCE, attribution:"© EMODnet Bathymetry"})
  };
  slopes = L.tileLayer(geopf("GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN","image/png"), {maxZoom:19, maxNativeZoom:17, opacity:.45, bounds:FRANCE, attribution:"Pentes © IGN"});
  seamarks = L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {maxZoom:18, bounds:FRANCE, attribution:"© OpenSeaMap"});
  if(!store.get("v_nums2",false)){ store.set("v_nums2",true); store.set("nums",true); }
  if(!store.get("v_litto",false)){ store.set("v_litto",true); store.set("base","litto"); store.set("seamarks",false); }
  if(store.get("base_mer",null)===null) store.set("base_mer", store.get("base","litto"));
  curBase = store.get(baseKey(), R()?"scan25":"litto"); if(!bases[curBase]) curBase = R()?"ign":"litto";
  if(curBase==="shom" && !shomKey) curBase="litto";
  if(!document.querySelector(`input[name=base][value=${curBase}]`)) curBase = R()?"scan25":"litto";
  if(store.get("seamarks", null)===null) store.set("seamarks", true);
  bases.shom.on("tileload", ()=>shomOk++);
  bases.shom.on("tileerror", ()=>{ shomErr++;
    if(shomErr===6 && shomOk===0 && curBase==="shom" && navigator.onLine){
      toast(shomKey ? "Clé SHOM refusée. Passage sur la bathymétrie EMODnet + balisage." : "Cartes SHOM : clé SHOM nécessaire (Menu). Passage sur la bathymétrie EMODnet + balisage.", 7000);
      document.querySelector("input[name=base][value=litto]").click(); if(!$("seamarks").checked) $("seamarks").click(); }});
  bases[curBase].addTo(map);
  document.querySelector(`input[name=base][value=${curBase}]`).checked = true;
  document.querySelectorAll("input[name=base]").forEach(r => r.addEventListener("change", e => {
    map.removeLayer(bases[curBase]); curBase=e.target.value; bases[curBase].addTo(map); bases[curBase].bringToBack(); store.set(baseKey(),curBase); }));
  $("seamarks").checked = store.get("seamarks", true); if($("seamarks").checked) seamarks.addTo(map);
  $("seamarks").addEventListener("change", e => { e.target.checked ? seamarks.addTo(map) : map.removeLayer(seamarks); store.set("seamarks", e.target.checked); });
  map.on("moveend", () => store.set("view", {c:[map.getCenter().lat, map.getCenter().lng], z:map.getZoom()}));
  L.control.scale({imperial:false, position:"bottomleft"}).addTo(map);

  $("bZin").onclick = () => map.zoomIn(); $("bZout").onclick = () => map.zoomOut();
  map.on("zoomend", updScale); updScale();
}
