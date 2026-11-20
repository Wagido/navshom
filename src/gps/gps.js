// GPS : position, vitesse, cap, suivi de la carte
import { ROT, headCone, headTick } from "../carte/boussole.js";
import { AREA, R, map } from "../carte/carte.js";
import { pointMode, showGps, updateMob, updateRoute } from "../carte/point.js";
import { instOn, instTick } from "../mer/instruments.js";
import { navTick } from "../mer/routes.js";
import { drawTimeline, ov } from "../meteo/calques.js";
import { elevations } from "../rando/rando.js";
import { rec, recGpsUp, recPoint } from "../rando/traces.js";
import { $, KN, bearing, pad3, store, toast } from "../utils.js";

export let trackLine;
let boatIcon;

export let boat=null, accCircle=null, last=null, follow=true, vecLine=null, sogNow=null;
export function setFollow(v){ follow=v; $("bFollow").classList.toggle("on", v); }
function dest(ll, brg, dist){ const r=Math.PI/180, R=6371000, d=dist/R, b=brg*r, f1=ll.lat*r, l1=ll.lng*r;
  const f2=Math.asin(Math.sin(f1)*Math.cos(d)+Math.cos(f1)*Math.sin(d)*Math.cos(b));
  return L.latLng(f2/r, (l1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(f1), Math.cos(d)-Math.sin(f1)*Math.sin(f2)))/r); }

export function onPos(p){
  const c=p.coords, ll=L.latLng(c.latitude, c.longitude);
  $("gpsdot").className="gps ok"; $("acc").textContent = "±"+Math.round(c.accuracy)+" m";
  let sog=(c.speed!=null&&!isNaN(c.speed))?c.speed*KN:null, cog=(c.heading!=null&&!isNaN(c.heading))?c.heading:null;
  if(last && (sog===null||cog===null)){ const dt=(p.timestamp-last.t)/1000, d=map.distance(last.ll,ll);
    if(dt>0 && d>3){ if(sog===null) sog=d/dt*KN; if(cog===null) cog=bearing(last.ll,ll); } }
  if(sog!==null && sog>60) sog=null;
  if(sog!==null){ sogNow=sog; $("sog").textContent=sog.toFixed(1); }
  if(cog!==null && (sog===null||sog>0.4)) $("cog").textContent=pad3(cog);
  if(!boat){
    accCircle=L.circle(ll,{radius:c.accuracy,color:"#e5372b",weight:1,fillOpacity:.07,interactive:false}).addTo(map);
    boat=L.marker(ll,{icon:boatIcon,interactive:false,zIndexOffset:1000}).addTo(map);
    if(AREA().contains(ll)) map.setView(ll, Math.max(map.getZoom(),13)); else setFollow(false);
  } else { boat.setLatLng(ll); accCircle.setLatLng(ll).setRadius(c.accuracy); }
  if(cog!==null){ const s=boat.getElement()&&boat.getElement().querySelector("svg"); if(s) s.style.transform="rotate("+cog+"deg)"; }
  if(cog!==null && sog>0.4){ const end=dest(ll, cog, sog/KN*360);
    vecLine ? vecLine.setLatLngs([ll,end]) : vecLine=L.polyline([ll,end],{color:"#e5372b",weight:2,dashArray:"6 5",interactive:false}).addTo(map); }
  if(!R()){ // trace du bateau : en mode Mer seulement ; nouvelle trace après 12 h sans point
    if(Date.now()-store.get("trackT",0)>12*3600e3 && trackLine.getLatLngs().length){ trackLine.setLatLngs([]); store.set("track",[]); }
    const lt=trackLine.getLatLngs();
    if(c.accuracy<50 && (!lt.length || map.distance(lt[lt.length-1],ll)>15)){
      trackLine.addLatLng(ll); store.set("trackT",Date.now()); store.set("track", trackLine.getLatLngs().slice(-5000).map(x=>[+x.lat.toFixed(6),+x.lng.toFixed(6)])); } }
  last={ll,t:p.timestamp,alt:c.altitude,acc:c.accuracy};
  if(R() && c.altitude==null && Date.now()-(onPos.altT||0)>20000 && navigator.onLine){ onPos.altT=Date.now(); // pas d'altitude GPS : altitude IGN du point
    elevations([[ll.lat,ll.lng]]).then(z=>{ if(R() && z[0]!=null && (last.alt==null)) $("sog").textContent=Math.round(z[0]); }).catch(()=>{}); }
  if(R()){ if(c.altitude!=null || $("sog").textContent==="—") $("sog").textContent = c.altitude!=null ? Math.round(c.altitude) : "—"; $("cog").textContent = rec&&rec.on ? "+"+Math.round(recGpsUp||0) : "—"; }
  recPoint(ll, c, p.timestamp); navTick(ll);
  if(follow && AREA().contains(ll)) map.panTo(ll,{animate:true});
  updateMob(); updateRoute(); if(ov.data) drawTimeline();
  if(!$("sPoint").hidden && pointMode==="gps") showGps();
  if(typeof instTick==="function" && instOn) instTick();
  if(typeof headTick==="function" && (ROT.on || headCone)) headTick();
}
export let gpsDenied=false;
export function onErr(e){ gpsDenied = e.code===1; $("gpsdot").className="gps bad"; $("acc").textContent = e.code===1 ? "refusé" : "—"; if(e.code===1) toast("Autorisez la localisation pour ce site", 5000); }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initGps(){

  /* ================= GPS ================= */
  boatIcon = L.divIcon({className:"boat", iconSize:[34,34], iconAnchor:[17,17], html:
    '<svg viewBox="0 0 34 34"><path d="M17 2 26 30 17 24 8 30Z" fill="#e5372b" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>'});
  trackLine = L.polyline(store.get("track", []), {color:"#e5372b", weight:3, opacity:.7, interactive:false});
  $("track").checked = store.get("showTrack", true); if($("track").checked && !R()) trackLine.addTo(map);
  if(Date.now()-store.get("trackT",0)>12*3600e3){ trackLine.setLatLngs([]); store.set("track",[]); }
  $("track").onchange = e => { e.target.checked ? trackLine.addTo(map) : map.removeLayer(trackLine); store.set("showTrack", e.target.checked); };
  $("bClearTrack").onclick = () => { trackLine.setLatLngs([]); store.set("track", []); toast("Trace effacée"); };
  $("bFollow").onclick = () => { setFollow(!follow); if(follow && last) map.setView(last.ll, Math.max(map.getZoom(),12)); else if(follow) toast("Pas encore de position GPS"); };
  map.on("dragstart", () => setFollow(false));
}
