// Point touché sur la carte, repères, homme à la mer (MOB)
import { R, fmtD, map } from "./carte.js";
import { pointInfo } from "./fonds.js";
import { addMeasure, measuring, startMeasure } from "./mesure.js";
import { gpsDenied, last, setFollow, sogNow } from "../gps/gps.js";
import { RT, drawRtMarks, geoAt, instOpen, open3D, renderRouteParams, showCurve, showSeamarks } from "../main.js";
import { ov, setFold, setOverlay } from "../meteo/calques.js";
import { showPicker } from "../meteo/masque.js";
import { loadTable, tbl } from "../meteo/tableau.js";
import { closeSheets, markTmp, openSheet, sheets } from "../ui/panneaux.js";
import { $, NM, bearing, fmtDur, fmtLL, fmtNM, pad3, store, toast } from "../utils.js";

export let wps, mobMk;
let routeTo, routeLine, routeMk, wpLayer, mob, mobArmed;

// le suivi GPS est démarré par geoStart() (navigateur, ou natif en arrière-plan dans l'APK)

/* ================= Point / position ================= */
export let pointMode="gps", pointLL=null;
export function showGps(){
  pointMode="gps"; pointWp=null; $("pSea").hidden=true; $("pC2c").hidden=true; $("aPin").hidden=false; $("aDelWp").hidden=true; $("pTitle").textContent="Ma position GPS"; $("pLabel").textContent="Position";
  $("pDistRow").querySelector("b").textContent="Vitesse et cap"; $("aRoute").hidden=true;
  $("pAltRow").hidden=true; $("pChips").innerHTML="";
  if(!last){ pointLL=null; $("pLL").textContent = gpsDenied ? "Localisation refusée. Autorisez-la dans les réglages du navigateur (le cadenas à côté de l'adresse) ou du téléphone, puis rouvrez l'appli." : "En attente du GPS…"; $("pDistRow").hidden=true; }
  else { pointLL=last.ll; $("pLL").textContent=fmtLL(last.ll.lat,last.ll.lng); $("pDistRow").hidden=false;
    $("pDist").textContent=(sogNow!=null?sogNow.toFixed(1)+" nd":"—")+" · cap "+$("cog").textContent+"°"; }
  openSheet("sPoint");
}
let pointWp=null;
function showPoint(ll, wp){
  pointMode="pt"; pointLL=ll; $("pC2c").hidden=false; pointWp=wp||null; $("pTitle").textContent = wp ? wp.n : "Point sur la carte";
  $("aPin").hidden=!!wp; $("aDelWp").hidden=!wp; $("pLabel").textContent="Coordonnées";
  $("pLL").textContent=fmtLL(ll.lat,ll.lng); $("pDistRow").querySelector("b").textContent = R() ? "Depuis ma position" : "Depuis le bateau";
  $("pAltRow").hidden=true; $("pChips").innerHTML="";
  $("pDistRow").hidden=false; $("pDist").textContent = last ? (R() ? fmtD(map.distance(last.ll,ll)) : fmtNM(map.distance(last.ll,ll)))+" · "+pad3(bearing(last.ll,ll))+"°" : (R() ? "Position GPS en attente" : "GPS en attente");
  $("aRoute").hidden=false; markTmp(ll); openSheet("sPoint"); if(typeof showSeamarks==="function") showSeamarks(ll);
  if(R()) pointInfo(ll);
  { const k=20037508.34/180, x=ll.lng*k, y=Math.log(Math.tan((90+ll.lat)*Math.PI/360))/(Math.PI/180)*k, d=4000;
    $("pC2c").href=`https://www.camptocamp.org/routes?bbox=${Math.round(x-d)},${Math.round(y-d)},${Math.round(x+d)},${Math.round(y+d)}`; }
  $("pGeo").hidden=true; if(R() && typeof geoAt==="function"){ const g=geoAt(ll); if(g){ $("pGeo").hidden=false; $("pGeoT").textContent=g; } }
}
export function meteoHere(ll){ closeSheets(); tbl.force=ll; markTmp(ll); if(!ov.type) setOverlay("wind"); setFold(true); loadTable(true); }
export function updateRoute(){
  if(routeLine){ map.removeLayer(routeLine); routeLine=null; } if(routeMk){ map.removeLayer(routeMk); routeMk=null; }
  if(!routeTo) return;
  routeMk=L.circleMarker(routeTo,{radius:8,color:"#fff",weight:3,fillColor:"#1c9e47",fillOpacity:1}).addTo(map)
    .on("click", ev=>{ L.DomEvent.stop(ev); routeTo=null; store.set("route",null); updateRoute(); toast("Destination effacée"); });
  if(!last){ routeMk.bindTooltip("Destination",{permanent:true,direction:"top",className:"mlabel",offset:[0,-8]}); return; }
  const d=map.distance(last.ll,routeTo), b=bearing(last.ll,L.latLng(routeTo)), eta = sogNow>0.5 ? fmtDur(d/NM/sogNow) : "—";
  routeLine=L.polyline([last.ll,routeTo],{color:"#1c9e47",weight:3,dashArray:"8 6",interactive:false}).addTo(map);
  routeMk.bindTooltip(fmtNM(d)+" · "+pad3(b)+"° · "+eta,{permanent:true,direction:"top",className:"mlabel",offset:[0,-8]});
}
function drawWps(){ wpLayer.clearLayers(); wps.forEach(w => L.marker([w.lat,w.lng],{icon:L.divIcon({className:"",iconSize:[26,26],iconAnchor:[13,26],
  html:'<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 1a7 7 0 0 0-7 7c0 5 7 15 7 15s7-10 7-15a7 7 0 0 0-7-7z" fill="#0b63b6" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="8" r="2.6" fill="#fff"/></svg>'})})
  .bindTooltip(w.n,{direction:"top",offset:[0,-24]}).on("click",ev=>{ L.DomEvent.stop(ev); showPoint(L.latLng(w.lat,w.lng), w); }).addTo(wpLayer)); }
function addWp(ll){ const n="Repère "+(wps.length+1); wps.push({n,lat:+ll.lat.toFixed(6),lng:+ll.lng.toFixed(6)}); store.set("wps",wps); drawWps(); toast(n+" enregistré"); }
export function renderWps(){ const el=$("wplist"); el.innerHTML="";
  if(!wps.length){ el.innerHTML='<p class="note">Aucun repère. Touchez la carte puis « Poser un repère ici », ou le bouton Repère pour marquer la position du bateau.</p>'; return; }
  wps.forEach((w,i)=>{ const d=document.createElement("div"), t=document.createElement("span");
    t.innerHTML=`<b></b><br><small style="color:var(--muted);font-family:var(--mono)">${fmtLL(w.lat,w.lng)}${last?" · "+fmtNM(map.distance(last.ll,[w.lat,w.lng])):""}</small>`; t.querySelector("b").textContent=w.n;
    const go=document.createElement("button"); go.textContent="Voir"; go.onclick=()=>{ setFollow(false); map.setView([w.lat,w.lng],14); closeSheets(); };
    const del=document.createElement("button"); del.textContent="Suppr."; del.style.color="var(--red)"; del.onclick=()=>{ wps.splice(i,1); store.set("wps",wps); drawWps(); renderWps(); };
    const s=document.createElement("span"); s.style.whiteSpace="nowrap"; s.append(go,del); d.append(t,s); el.append(d); }); }
function drawMob(){ if(mobMk){ map.removeLayer(mobMk); mobMk=null; } if(!mob) return;
  if(R()) { mobMk=L.circleMarker(mob,{radius:11,color:"#fff",weight:3,fillColor:"#e5372b",fillOpacity:1}).bindTooltip("MOB",{permanent:true,direction:"right",className:"mlabel"}); return; }
  mobMk=L.circleMarker(mob,{radius:11,color:"#fff",weight:3,fillColor:"#e5372b",fillOpacity:1}).addTo(map).bindTooltip("MOB",{permanent:true,direction:"right",className:"mlabel"}); }
export function updateMob(){ if(!mob||!last||!mobMk) return; mobMk.setTooltipContent("MOB "+fmtNM(map.distance(last.ll,mob))+" · "+pad3(bearing(last.ll,L.latLng(mob)))+"°"); }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initPoint(){
  $("chip").onclick = () => R() ? showGps() : instOpen();
  map.on("click", e => { if(RT.picking){ RT[RT.picking]=e.latlng; RT.picking=null; $("pickBar").hidden=true; RT.layer.clearLayers(); RT.result=null; drawRtMarks(); openSheet("sRouting"); renderRouteParams(); $("rtRes").hidden=true; return; }
    if(!$("recAsk").hidden){ $("recAsk").hidden=true; return; }
    if(measuring) return addMeasure(e.latlng); if(sheets.some(s=>!$(s).hidden)) return closeSheets();
    if(ov.data) return showPicker(e.latlng); showPoint(e.latlng); });
  $("aPin").onclick = () => { if(pointLL) addWp(pointLL); closeSheets(); };
  $("aDelWp").onclick = () => { if(!pointWp) return; wps=wps.filter(w=>w!==pointWp); store.set("wps",wps); drawWps(); toast(pointWp.n+" supprimé"); pointWp=null; closeSheets(); };
  $("aMeteo").onclick = () => { if(pointLL) meteoHere(pointLL); };
  $("aCurve").onclick = () => { const p = pointLL || map.getCenter(); showCurve(p); };
  $("a3d").onclick = () => { const p=pointLL; closeSheets(); if(!p) return; setFollow(false); map.setView(p, Math.max(map.getZoom(),13), {animate:false}); open3D(); };
  $("aMeasure").onclick = () => { const p=pointLL; closeSheets(); startMeasure(); if(p) addMeasure(p); };

  /* Aller ici : ligne directe bateau -> destination */
  routeTo = store.get("route", null); routeLine = null; routeMk = null;
  $("aRoute").onclick = () => { routeTo=[pointLL.lat,pointLL.lng]; store.set("route",routeTo); closeSheets(); updateRoute();
    toast("Destination posée. Touchez le point vert pour l'effacer.", 4000); };
  updateRoute();

  /* ================= Repères ================= */
  wps = store.get("wps", []); wpLayer = L.layerGroup().addTo(map);
  $("bPin").onclick = () => { if(!last) return toast("Pas de position GPS : touchez la carte pour poser un repère"); addWp(last.ll); };
  drawWps();

  /* ================= MOB ================= */
  mob = store.get("mob",null); mobMk = null; mobArmed = false;
  $("bMob").onclick = () => {
    if(mob && !mobArmed){ mobArmed=true; toast("Appuyez encore pour effacer le point MOB"); setTimeout(()=>mobArmed=false,3000); return; }
    if(mob){ mob=null; store.set("mob",null); drawMob(); mobArmed=false; return toast("Point MOB effacé"); }
    if(!last) return toast("Pas de position GPS");
    mob=[last.ll.lat,last.ll.lng]; store.set("mob",mob); drawMob(); updateMob(); setFollow(true);
    toast("MOB enregistré "+fmtLL(mob[0],mob[1]),6000); if(navigator.vibrate) navigator.vibrate([300,100,300]);
  };
  drawMob();
}
