// Pluie à venir : prévision animée des 12 prochaines heures + résumé à la position
import { ov, setFold, setOverlay } from "./calques.js";
import { loadTable, setHour, tbl } from "./tableau.js";
import { $ } from "../utils.js";

/* ================= Pluie à venir : prévision animée des 12 prochaines heures + résumé à la position ================= */
const RAIN={on:false, timer:null};
function rainSummary(){ const h=tbl.f&&tbl.f.hourly; if(!h||!h.precipitation) return null;
  const now=Date.now(); let k0=0; h.time.forEach((t,i)=>{ if(new Date(t).getTime()<=now) k0=i; });
  const hh=i=>h.time[i].slice(11,13)+" h", n=Math.min(h.time.length, k0+13), wet=i=>(h.precipitation[i]||0)>=0.2;
  let first=-1; for(let i=k0;i<n;i++) if(wet(i)){ first=i; break; }
  if(first<0) return "☀️ <b>Sec</b> jusqu'à "+hh(n-1);
  let end=first; while(end+1<n && wet(end+1)) end++; let tot=0; for(let i=first;i<=end;i++) tot+=h.precipitation[i]||0;
  const mm=tot<1?tot.toFixed(1).replace(".",","):Math.round(tot);
  return first===k0 ? "🌧️ <b>Pluie jusqu'à "+hh(end+1)+"</b> · "+mm+" mm" : "🌦️ <b>Pluie de "+hh(first)+" à "+hh(end+1)+"</b> · "+mm+" mm"; }
async function rainOn(){ RAIN.on=true; $("tRadar").classList.add("on"); $("tbar").classList.add("raining");
  if(ov.type!=="rain") setOverlay("rain"); setFold(true);
  for(let k=0;k<40 && !ov.data;k++) await new Promise(r=>setTimeout(r,250));
  if(!tbl.f) await loadTable(); const t=rainSummary(); $("tRain").innerHTML=t||""; $("tRain").hidden=!t;
  if(!ov.data||!RAIN.on) return; const start=ov.now, stop=Math.min(ov.data[0].time.length-1, ov.now+12); let i=start;
  clearInterval(RAIN.timer); RAIN.timer=setInterval(()=>{ if(ov.type!=="rain"){ return rainOff(); } setHour(i); i = i>=stop ? start : i+1; }, 800); }
function rainOff(){ clearInterval(RAIN.timer); RAIN.on=false; $("tbar").classList.remove("raining"); $("tRadar").classList.remove("on"); $("tRain").hidden=true; }
export function radarOff(){ rainOff(); }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initPluie(){
  $("tRadar").onclick=()=>RAIN.on ? rainOff() : rainOn();
  $("tSlider").addEventListener("pointerdown", ()=>{ if(RAIN.on){ clearInterval(RAIN.timer); } });
}
