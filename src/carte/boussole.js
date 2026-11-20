// Boussole et rotation de la carte
import { R, map } from "./carte.js";
import { last, setFollow, sogNow } from "../gps/gps.js";
import { $, toast } from "../utils.js";

let mapEl, ctlEl, _m2c;

/* ================= Boussole et rotation de la carte (maison, sans dépendance) ================= */
export const ROT={on:false, bearing:0, heading:null, src:null, mode:"north"}; // north | heading (suit la marche) | free (tournée à la main)
function rotLayout(){ const w=innerWidth, h=innerHeight;
  if(!ROT.on){ mapEl.style.cssText=""; ctlEl.style.cssText=""; map.invalidateSize(); return; }
  const d=Math.ceil(Math.hypot(w,h));
  Object.assign(mapEl.style,{inset:"auto", width:d+"px", height:d+"px", left:((w-d)/2)+"px", top:((h-d)/2)+"px"});
  Object.assign(ctlEl.style,{position:"absolute", left:((d-w)/2)+"px", top:((d-h)/2)+"px", width:w+"px", height:h+"px"});
  map.invalidateSize(); applyBearing(); }
function applyBearing(){ const b=ROT.on?ROT.bearing:0;
  mapEl.style.transform = ROT.on ? `rotate(${-b}deg)` : ""; ctlEl.style.transform = ROT.on ? `rotate(${b}deg)` : "";
  $("compassNeedle").style.transform=`rotate(${-b}deg)`; }
// cap : boussole du téléphone (rando, ou bateau à l'arrêt), sinon route GPS
function onOrient(e){ let h=null; if(e.webkitCompassHeading!=null) h=e.webkitCompassHeading; else if(e.absolute && e.alpha!=null) h=360-e.alpha; if(h==null || isNaN(h)) return;
  h=(h+((screen.orientation&&screen.orientation.angle)||0)+360)%360;
  ROT.heading = ROT.heading==null ? h : (ROT.heading + (((h-ROT.heading+540)%360)-180)*0.25 + 360)%360; ROT.src="compass"; headTick(); }
let orientOn=false; async function orientStart(){ if(orientOn) return; orientOn=true;
  try{ if(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission==="function"){ const r=await DeviceOrientationEvent.requestPermission(); if(r!=="granted"){ toast("Boussole refusée"); } } }catch(e){}
  if("ondeviceorientationabsolute" in window) addEventListener("deviceorientationabsolute", onOrient); else addEventListener("deviceorientation", onOrient); }
export let headCone=null, headT=0;
export function headTick(){ if(Date.now()-headT<120) return; headT=Date.now();
  const moving = sogNow!=null && sogNow>(R()?1.2:1.5), cog=parseFloat($("cog").textContent);
  const hd = (!R() && moving && isFinite(cog)) ? cog : ROT.heading;
  if(last && ROT.heading!=null && R()){ const html=`<svg viewBox="-60 -60 120 120" width="120" height="120" style="transform:rotate(${ROT.heading}deg)"><path d="M0 0 L-26 -54 A60 60 0 0 1 26 -54 Z" fill="rgba(29,111,184,.22)"/></svg>`;
    if(!headCone) headCone=L.marker(last.ll,{icon:L.divIcon({className:"",iconSize:[120,120],iconAnchor:[60,60],html}),interactive:false,zIndexOffset:900}).addTo(map);
    else { headCone.setLatLng(last.ll); const el=headCone.getElement(); if(el) el.innerHTML=html; } }
  if(ROT.on && ROT.mode==="heading" && hd!=null){ ROT.bearing=hd; applyBearing(); } }
function rotNorth(){ ROT.on=false; ROT.mode="north"; ROT.bearing=0; rotLayout(); applyBearing(); $("bCompass").classList.remove("on"); }
// rotation libre à deux doigts (au-delà de 12° pour ne pas gêner le zoom)
let rg=null; const tAng=e=>Math.atan2(e.touches[1].clientY-e.touches[0].clientY, e.touches[1].clientX-e.touches[0].clientX)*180/Math.PI;

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initBoussole(){
  mapEl = map.getContainer(); ctlEl = mapEl.querySelector(".leaflet-control-container");
  // les gestes : on ramène les coordonnées écran dans le repère de la carte tournée
  _m2c = map.mouseEventToContainerPoint.bind(map);
  map.mouseEventToContainerPoint=function(e){ if(!ROT.on) return _m2c(e);
    const r=mapEl.getBoundingClientRect(), x=e.clientX-(r.left+r.width/2), y=e.clientY-(r.top+r.height/2), a=ROT.bearing*Math.PI/180, c=Math.cos(a), sn=Math.sin(a);
    return L.point(x*c-y*sn+mapEl.offsetWidth/2, x*sn+y*c+mapEl.offsetHeight/2); };
  map.dragging._draggable.on("predrag", function(){ if(!ROT.on) return; const d=this, o=d._newPos.subtract(d._startPos), a=ROT.bearing*Math.PI/180, c=Math.cos(a), sn=Math.sin(a);
    d._newPos=d._startPos.add(L.point(o.x*c-o.y*sn, o.x*sn+o.y*c)); });
  addEventListener("resize", ()=>{ if(ROT.on) rotLayout(); });
  $("bCompass").onclick=async()=>{ if(ROT.on){ rotNorth(); toast("Nord en haut"); return; }
    await orientStart(); ROT.on=true; ROT.mode="heading"; $("bCompass").classList.add("on"); rotLayout(); setFollow(true); if(last) map.panTo(last.ll);
    toast(R()?"Carte orientée dans le sens de la marche (boussole)":"Carte orientée selon la route du bateau",3000); headTick(); };
  mapEl.addEventListener("touchstart", e=>{ if(e.touches.length===2) rg={a0:tAng(e), b0:ROT.bearing, active:false}; else rg=null; }, {passive:true});
  mapEl.addEventListener("touchmove", e=>{ if(!rg || e.touches.length!==2) return; const d=((tAng(e)-rg.a0+540)%360)-180;
    if(!rg.active){ if(Math.abs(d)<12) return; rg.active=true; rg.a0+=d>0?12:-12; if(!ROT.on){ ROT.on=true; rotLayout(); } ROT.mode="free"; $("bCompass").classList.add("on"); return; }
    ROT.bearing=(rg.b0-d+720)%360; applyBearing(); }, {passive:true});
  mapEl.addEventListener("touchend", e=>{ if(e.touches.length<2) rg=null; }, {passive:true});
  // ordinateur : Maj + molette pour tourner
  mapEl.addEventListener("wheel", e=>{ if(!e.shiftKey) return; e.preventDefault(); e.stopPropagation(); if(!ROT.on){ ROT.on=true; rotLayout(); $("bCompass").classList.add("on"); } ROT.mode="free"; ROT.bearing=(ROT.bearing+(e.deltaY>0?5:-5)+360)%360; applyBearing(); }, {passive:false, capture:true});
  if(R()) setTimeout(()=>{ if(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission!=="function") orientStart(); }, 2000);
}
