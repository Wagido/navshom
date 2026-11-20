// Routes et navigation vers les waypoints
import { R, fmtD, map } from "../carte/carte.js";
import { mPts } from "../carte/mesure.js";
import { last, setFollow, sogNow } from "../gps/gps.js";
import { geoStart, notify } from "../gps/natif.js";
import { measureGeom } from "../main.js";
import { setXteWarnT, xteWarnT } from "./instruments.js";
import { anchorTick } from "./mouillage.js";
import { closeSheets } from "../ui/panneaux.js";
import { $, bearing, pad3, store, toast } from "../utils.js";

export let routes, navR;
let routeLayer;

const arriveR = () => R() ? 25 : 90;
function drawRoute(){
  routeLayer.clearLayers(); const rt = navR && routes.find(r=>r.id===navR.id); $("navcard").hidden=!rt;
  document.body.classList.toggle("navon", !!rt); if(!rt) return;
  const P = rt.pts.map(p=>[p[0],p[1]]), geom = rt.geom || P;
  L.polyline(geom,{color:"#fff",weight:7,opacity:.85,interactive:false}).addTo(routeLayer);
  L.polyline(geom,{color:"#1c9e47",weight:3,dashArray:"8 6",interactive:false}).addTo(routeLayer);
  const from = navR.leg>0 ? P[navR.leg-1] : navR.from, to = P[navR.leg];
  if(from && to) L.polyline([from,to],{color:"#ff7a00",weight:4,interactive:false}).addTo(routeLayer);
  rt.pts.forEach((p,i)=>L.circleMarker([p[0],p[1]],{radius:i===navR.leg?9:6,color:"#fff",weight:2,fillColor:i<navR.leg?"#90a4ae":i===navR.leg?"#ff7a00":"#1c9e47",fillOpacity:1})
    .bindTooltip(p[2]||("WP"+(i+1)),{permanent:true,direction:"right",className:"mlabel",offset:[8,0]}).addTo(routeLayer));
}
function xte(from, to, pos){ // écart de route en m (+ = à droite de la route)
  const Re=6371000, d13=map.distance(from,pos)/Re, t13=bearing(L.latLng(from),L.latLng(pos))*Math.PI/180, t12=bearing(L.latLng(from),L.latLng(to))*Math.PI/180;
  return Math.asin(Math.sin(d13)*Math.sin(t13-t12))*Re;
}
export const hhmm = ms => new Date(ms).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
export function navTick(ll){
  anchorTick(ll, last?{accuracy:last.acc||10}:{accuracy:10});
  const rt = navR && routes.find(r=>r.id===navR.id); if(!rt) return;
  const P=rt.pts, to=[P[navR.leg][0],P[navR.leg][1]], from = navR.leg>0 ? [P[navR.leg-1][0],P[navR.leg-1][1]] : navR.from;
  let dist=map.distance(ll,to);
  if(dist < arriveR()){
    notify("Waypoint atteint", (P[navR.leg][2]||("WP"+(navR.leg+1)))+(navR.leg<P.length-1?" · cap sur le suivant":" · arrivée"));
    if(navR.leg>=P.length-1){ toast("Arrivée : fin de la route", 6000); navR=null; store.set("navR",null); drawRoute(); return; }
    navR.leg++; store.set("navR",navR); drawRoute(); return navTick(ll);
  }
  const brg=bearing(ll,L.latLng(to)), x = from ? xte(from,to,ll) : 0;
  let rest=dist; for(let i=navR.leg;i<P.length-1;i++) rest+=map.distance([P[i][0],P[i][1]],[P[i+1][0],P[i+1][1]]);
  const sp = sogNow!=null ? sogNow/1.943844 : 0, cogv = parseFloat($("cog").textContent);
  const vmg = sp>0.2 && !R() && isFinite(cogv) ? sp*Math.cos((cogv-brg)*Math.PI/180) : sp;
  const eta = vmg>0.2 ? hhmm(Date.now()+dist/vmg*1000) : "—", etaEnd = sp>0.2 ? hhmm(Date.now()+rest/sp*1000) : "—";
  $("ncWp").textContent = (P[navR.leg][2]||("WP"+(navR.leg+1)))+" ("+(navR.leg+1)+"/"+P.length+")";
  $("ncDist").textContent = fmtD(dist); $("ncBrg").textContent = pad3(brg)+"°";
  $("ncXte").textContent = Math.abs(x)<5 ? "sur la route" : fmtD(Math.abs(x))+(x>0?" à droite":" à gauche");
  $("ncXte").style.color = Math.abs(x) > (R()?60:185) ? "#ff8a80" : "";
  $("ncWp").dataset.vmg = sp>0.2 ? (vmg*1.943844).toFixed(1).replace(".",",") : "";
  if(!R() && Math.abs(x)>185 && Date.now()-xteWarnT>3*60e3){ setXteWarnT(Date.now()); notify("Hors de la route", "Écart "+fmtD(Math.abs(x))+(x>0?" à droite":" à gauche")+" : revenez au "+pad3(brg)+"°"); try{ navigator.vibrate&&navigator.vibrate([200,100,200]); }catch(e){} }
  $("ncEta").textContent = "arrivée WP "+eta+" · fin "+etaEnd+" ("+fmtD(rest)+")";
}
export function startNav(id){
  const rt=routes.find(r=>r.id===id); if(!rt) return;
  navR={id, leg:0, from: last?[last.ll.lat,last.ll.lng]:null}; store.set("navR",navR); drawRoute(); closeSheets(); geoStart();
  setFollow(true); if(last) navTick(last.ll); toast("Navigation vers "+(rt.pts[0][2]||"WP1"));
}
function saveRouteFromMeasure(){
  if(mPts.length<2) return toast("Posez au moins deux points");
  const def=(R()?"Itinéraire":"Route")+" du "+new Date().toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
  const name=def+" ("+fmtD(mPts.reduce((a,p,i)=>i?a+map.distance(mPts[i-1],p):0,0))+")";
  const geom = R() && $("mTrail").checked ? measureGeom() : null;
  routes.unshift({id:Date.now(), name, pts:mPts.map((p,i)=>[+p.lat.toFixed(6),+p.lng.toFixed(6),"WP"+(i+1)]), geom: geom?geom.map(p=>[+p[0].toFixed(5),+p[1].toFixed(5)]):null});
  store.set("routes",routes); renderRoutes(); toast("Route « "+name+" » enregistrée : Plus › Routes");
}
export function renderRoutes(){
  const el=$("rtList"); el.innerHTML="";
  if(!routes.length){ el.innerHTML='<p class="note">Aucune route. Tracez-la avec « Mesurer », puis « Créer la route ».</p>'; return; }
  routes.forEach(rt=>{ let d=0; for(let i=1;i<rt.pts.length;i++) d+=map.distance([rt.pts[i-1][0],rt.pts[i-1][1]],[rt.pts[i][0],rt.pts[i][1]]);
    const row=document.createElement("div"), t=document.createElement("span");
    t.innerHTML="<b></b><br><small style='color:var(--muted)'></small>"; t.querySelector("b").textContent=rt.name; t.querySelector("small").textContent=rt.pts.length+" waypoints · "+fmtD(d);
    const s=document.createElement("span"); s.style.whiteSpace="nowrap";
    const go=document.createElement("button"); go.textContent="Naviguer"; go.onclick=()=>startNav(rt.id);
    const vw=document.createElement("button"); vw.textContent="Voir"; vw.onclick=()=>{ setFollow(false); map.fitBounds(L.latLngBounds(rt.pts.map(p=>[p[0],p[1]])).pad(.2)); closeSheets(); };
    const del=document.createElement("button"); del.textContent="Suppr."; del.style.color="var(--red)";
    del.onclick=()=>{ if(del.dataset.armed!=="1"){ del.dataset.armed="1"; del.textContent="Sûr ?"; setTimeout(()=>{ del.dataset.armed=""; del.textContent="Suppr."; },3000); return; }
      routes=routes.filter(r=>r.id!==rt.id); store.set("routes",routes); if(navR&&navR.id===rt.id){ navR=null; store.set("navR",null); drawRoute(); } renderRoutes(); };
    s.append(go,vw,del); row.append(t,s); el.append(row); });
}

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initRoutes(){

  /* ---------- Routes et navigation vers les waypoints ---------- */
  routes = store.get("routes", []); navR = store.get("navR", null); // navR = {id, leg, from:[lat,lng]}
  routeLayer = L.layerGroup().addTo(map);
  $("ncPrev").onclick=()=>{ if(!navR) return; navR.leg=Math.max(0,navR.leg-1); store.set("navR",navR); drawRoute(); if(last) navTick(last.ll); };
  $("ncNext").onclick=()=>{ const rt=navR&&routes.find(r=>r.id===navR.id); if(!rt) return; navR.leg=Math.min(rt.pts.length-1,navR.leg+1); store.set("navR",navR); drawRoute(); if(last) navTick(last.ll); };
  $("ncStop").onclick=()=>{ navR=null; store.set("navR",null); drawRoute(); toast("Navigation arrêtée"); };
  $("mSaveRoute").onclick = saveRouteFromMeasure;
  drawRoute();
}
