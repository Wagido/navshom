// AIS : navires autour (aisstream.io, clé gratuite)
import { R, map } from "../carte/carte.js";
import { last, sogNow } from "../gps/gps.js";
import { notify } from "../gps/natif.js";
import { $, fmtNM, store, toast } from "../utils.js";

export let AIS;

function aisIcon(s){ const c=s.sog>0.5?"#7B1FA2":"#9E9E9E"; return L.divIcon({className:"",iconSize:[22,22],iconAnchor:[11,11],
  html:`<svg viewBox="-11 -11 22 22" width="22" height="22" style="transform:rotate(${s.cog||0}deg)"><path d="M0 -9 6 8 0 4 -6 8Z" fill="${c}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`}); }
function cpa(s){ if(!last || sogNow==null) return null; // point de rapprochement le plus proche (approximation plane)
  const k=Math.cos(last.ll.lat*Math.PI/180), toXY=ll=>[(ll[1]-last.ll.lng)*k*60, (ll[0]-last.ll.lat)*60];
  const p=toXY([s.lat,s.lng]), cg=parseFloat($("cog").textContent)||0, v0=[sogNow*Math.sin(cg*Math.PI/180), sogNow*Math.cos(cg*Math.PI/180)], v1=[(s.sog||0)*Math.sin((s.cog||0)*Math.PI/180),(s.sog||0)*Math.cos((s.cog||0)*Math.PI/180)];
  const dv=[v1[0]-v0[0],v1[1]-v0[1]], dv2=dv[0]**2+dv[1]**2; const t=dv2<1e-6?0:Math.max(0,-(p[0]*dv[0]+p[1]*dv[1])/dv2);
  const d=Math.hypot(p[0]+dv[0]*t, p[1]+dv[1]*t); return {d, t:t*60}; } // milles, minutes
function aisDraw(s){ if(!s.mk){ s.mk=L.marker([s.lat,s.lng],{icon:aisIcon(s),zIndexOffset:800}).addTo(AIS.layer).on("click",()=>{
      const c=cpa(s); toast((s.name||"MMSI "+s.mmsi)+" · "+(s.sog!=null?s.sog.toFixed(1)+" nd":"")+" · cap "+Math.round(s.cog||0)+"°"+(last?" · à "+fmtNM(map.distance(last.ll,[s.lat,s.lng])):"")+(c&&c.t>0?" · CPA "+c.d.toFixed(2)+" M dans "+Math.round(c.t)+" min":""),6000); });
    if(s.name) s.mk.bindTooltip(s.name,{permanent:map.getZoom()>=12,direction:"right",className:"mlabel",offset:[8,0]}); }
  else { s.mk.setLatLng([s.lat,s.lng]).setIcon(aisIcon(s)); if(s.name && !s.mk.getTooltip()) s.mk.bindTooltip(s.name,{permanent:map.getZoom()>=12,direction:"right",className:"mlabel",offset:[8,0]}); }
  const c=cpa(s); if(c && c.d<0.5 && c.t>0 && c.t<15 && Date.now()-(AIS.warned.get(s.mmsi)||0)>10*60e3){ AIS.warned.set(s.mmsi,Date.now());
    notify("Risque de collision", (s.name||"Navire "+s.mmsi)+" : passage à "+c.d.toFixed(2)+" M dans "+Math.round(c.t)+" min"); try{ navigator.vibrate&&navigator.vibrate([300,150,300]); }catch(e){} } }
function aisBox(){ const b=map.getBounds().pad(0.5); return [[[b.getSouth(),b.getWest()],[b.getNorth(),b.getEast()]]]; }
function aisSubscribe(){ if(AIS.ws && AIS.ws.readyState===1) AIS.ws.send(JSON.stringify({APIKey:AIS.key, BoundingBoxes:aisBox(), FilterMessageTypes:["PositionReport","StandardClassBPositionReport","ShipStaticData","StaticDataReport"]})); }
export function aisStart(){ aisStop(); if(!AIS.on || !AIS.key || R()) return; AIS.layer.addTo(map); $("aisState").textContent="Connexion…";
  try{ AIS.ws=new WebSocket("wss://stream.aisstream.io/v0/stream"); }catch(e){ $("aisState").textContent="Connexion impossible"; return; }
  AIS.ws.onopen=()=>{ aisSubscribe(); $("aisState").textContent="Connecté : en attente des navires…"; };
  AIS.ws.onmessage=async ev=>{ let m; try{ m=JSON.parse(typeof ev.data==="string"?ev.data:await ev.data.text()); }catch(e){ return; }
    if(m.error){ $("aisState").textContent="Erreur : "+m.error; return; }
    const md=m.MetaData||{}, id=md.MMSI; if(!id) return; let s=AIS.ships.get(id); if(!s){ s={mmsi:id}; AIS.ships.set(id,s); }
    if(md.ShipName && md.ShipName.trim()) s.name=md.ShipName.trim();
    const pr=m.Message&&(m.Message.PositionReport||m.Message.StandardClassBPositionReport);
    if(pr){ s.lat=pr.Latitude??md.latitude; s.lng=pr.Longitude??md.longitude; s.sog=pr.Sog; s.cog=(pr.TrueHeading!=null&&pr.TrueHeading<360)?pr.TrueHeading:pr.Cog; s.t=Date.now(); }
    if(s.lat!=null){ aisDraw(s); $("aisState").textContent="Connecté · "+AIS.ships.size+" navire"+(AIS.ships.size>1?"s":""); } };
  AIS.ws.onerror=()=>{ $("aisState").textContent="Erreur de connexion (clé ? réseau ?)"; };
  AIS.ws.onclose=()=>{ if(AIS.on && AIS.ws){ setTimeout(()=>{ if(AIS.on && (!AIS.ws||AIS.ws.readyState>1)) aisStart(); },15000); } }; }
export function aisStop(){ if(AIS.ws){ const w=AIS.ws; AIS.ws=null; try{ w.close(); }catch(e){} } }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initAis(){

  /* ================= AIS : navires autour (aisstream.io, clé gratuite) ================= */
  AIS = {ws:null, ships:new Map(), layer:L.layerGroup(), key:store.get("aisKey",""), on:store.get("aisOn",false), warned:new Map(), sub:null};
  setInterval(()=>{ const now=Date.now(); AIS.ships.forEach((s,k)=>{ if(now-(s.t||0)>12*60e3){ if(s.mk) AIS.layer.removeLayer(s.mk); AIS.ships.delete(k); } }); }, 60e3);
  map.on("moveend", ()=>{ clearTimeout(AIS._t); AIS._t=setTimeout(aisSubscribe, 1500); });
  $("aisOn").checked=AIS.on; $("aisKey").value=AIS.key;
  $("aisOn").onchange=e=>{ AIS.on=e.target.checked; store.set("aisOn",AIS.on); if(AIS.on && !AIS.key){ toast("Collez d'abord votre clé aisstream.io"); } AIS.on?aisStart():(aisStop(),map.removeLayer(AIS.layer),$("aisState").textContent="Désactivé"); };
  $("aisSave").onclick=()=>{ AIS.key=$("aisKey").value.trim(); store.set("aisKey",AIS.key); toast(AIS.key?"Clé AIS enregistrée":"Clé effacée"); if(AIS.on) aisStart(); };
  if(AIS.on) setTimeout(aisStart, 3000);
}
