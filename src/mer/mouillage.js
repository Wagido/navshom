// Alarme de mouillage
import { R, map } from "../carte/carte.js";
import { last, setFollow } from "../gps/gps.js";
import { LNotif, alarmSound, audioCtx, geoStart, hideAlarm, notify, setAudioCtx, showAlarm, unlockAudio } from "../gps/natif.js";
import { closeSheets, openSheet } from "../ui/panneaux.js";
import { $, store, toast } from "../utils.js";

export let anchor, anchorLayer;
let anchorAlarmOn, anchorSnooze, lastFixT, anchorIcon;

function drawAnchor(){
  anchorLayer.clearLayers(); $("bAnchor").classList.toggle("on", !!anchor);
  if(!anchor) return;
  L.circle([anchor.lat,anchor.lng],{radius:anchor.r, color:anchorAlarmOn?"#e5372b":"#1d6fb8", weight:2, fillOpacity:.08, dashArray:"6 6", interactive:false}).addTo(anchorLayer);
  L.marker([anchor.lat,anchor.lng],{icon:anchorIcon, draggable:true, zIndexOffset:900}).on("dragend",e=>{ const p=e.target.getLatLng(); anchor.lat=p.lat; anchor.lng=p.lng; store.set("anchor",anchor); drawAnchor(); renderAnchor(); toast("Position de l'ancre ajustée"); }).addTo(anchorLayer);
}
function renderAnchor(){
  $("anR").value = anchor ? anchor.r : store.get("anchorR",40); $("anRv").textContent = $("anR").value+" m";
  $("anSet").hidden = !!anchor; $("anClear").hidden = !anchor;
  if(!anchor){ $("anState").textContent="Ancre non mouillée"; $("anDist").textContent="—"; return; }
  $("anState").textContent = anchorAlarmOn ? "ALARME : le bateau dérape" : "Surveillance active";
  $("anDist").textContent = last ? Math.round(map.distance(last.ll,[anchor.lat,anchor.lng]))+" m / "+anchor.r+" m" : "GPS en attente";
}
export function anchorTick(ll, c){
  lastFixT=Date.now(); if(!anchor) return;
  const d=map.distance(ll,[anchor.lat,anchor.lng]), out = d > anchor.r && c.accuracy < 60;
  if(out && Date.now()>anchorSnooze){
    if(!anchorAlarmOn || Date.now()-(anchorTick.n||0)>30e3){ anchorTick.n=Date.now(); anchorAlarmOn=true; drawAnchor(); notify("⚓ Alarme de mouillage", "Le bateau est à "+Math.round(d)+" m de l'ancre (rayon "+anchor.r+" m)"); }
    showAlarm("ALARME DE MOUILLAGE · "+Math.round(d)+" m de l'ancre (rayon "+anchor.r+" m)"); alarmSound(true); if(navigator.vibrate) navigator.vibrate([500,200,500]);
  } else if(!out && anchorAlarmOn){ anchorAlarmOn=false; hideAlarm(); drawAnchor(); }
  if(!$("sAnchor").hidden) renderAnchor();
}

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initMouillage(){

  /* ---------- Alarme de mouillage ---------- */
  anchor = store.get("anchor", null); anchorLayer = L.layerGroup(); anchorAlarmOn = false; anchorSnooze = 0; lastFixT = Date.now();
  if(!R()) anchorLayer.addTo(map);
  anchorIcon = L.divIcon({className:"", iconSize:[30,30], iconAnchor:[15,15], html:'<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="12" r="11" fill="#0b2f5b" stroke="#fff" stroke-width="2"/><path d="M12 6v11M8.5 9h7M7 13.5a5 5 0 0 0 10 0" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="12" cy="5.5" r="1.4" fill="#fff"/></svg>'});
  $("bAnchor").onclick = () => { if(!$("sAnchor").hidden) return closeSheets(); renderAnchor(); openSheet("sAnchor"); };
  $("anR").oninput = () => { $("anRv").textContent=$("anR").value+" m"; store.set("anchorR", +$("anR").value); if(anchor){ anchor.r=+$("anR").value; store.set("anchor",anchor); drawAnchor(); } };
  $("anSet").onclick = () => { if(!last) return toast("Pas encore de position GPS");
    anchor={lat:last.ll.lat, lng:last.ll.lng, r:+$("anR").value, t:Date.now()}; store.set("anchor",anchor); anchorAlarmOn=false; drawAnchor(); renderAnchor(); geoStart();
    try{ setAudioCtx(audioCtx || new (window.AudioContext||window.webkitAudioContext)()); audioCtx.resume(); }catch(e){}
    if(LNotif) LNotif.requestPermissions().catch(()=>{});
    toast("Ancre mouillée. Déplacez l'icône d'ancre si elle est tombée plus loin.", 5000); };
  $("anTest").onclick = () => { unlockAudio(); alarmSound(true); if(navigator.vibrate) navigator.vibrate([500,200,500]); setTimeout(()=>alarmSound(false),3000);
    notify("⚓ Test de l'alarme", "Si vous entendez et voyez ceci, l'alarme fonctionne."); };
  $("anClear").onclick = () => { anchor=null; store.set("anchor",null); anchorAlarmOn=false; hideAlarm(); drawAnchor(); renderAnchor(); toast("Ancre levée"); };
  $("anCenter").onclick = () => { if(anchor){ setFollow(false); map.setView([anchor.lat,anchor.lng], 17); closeSheets(); } };
  $("alarmStop").onclick = () => { anchorSnooze=Date.now()+3*60e3; anchorAlarmOn=false; hideAlarm(); drawAnchor(); renderAnchor(); toast("Alarme coupée 3 minutes"); };
  setInterval(()=>{ if(anchor && Date.now()-lastFixT>120e3 && Date.now()>anchorSnooze){ showAlarm("Plus de signal GPS depuis "+Math.round((Date.now()-lastFixT)/60e3)+" min · surveillance du mouillage interrompue"); } }, 30e3);
  drawAnchor();
}
