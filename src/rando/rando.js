// Mode Rando : bascule Mer / Rando, altitude IGN, profils, mesure en km
import { AREA, MODE, R, baseKey, bases, curBase, fmtD, map, setCurBase, setMODE } from "../carte/carte.js";
import { autoSatCheck, setShade, setSlopes } from "../carte/fonds.js";
import { drawMeasure, mPts, measuring } from "../carte/mesure.js";
import { mobMk } from "../carte/point.js";
import { trackLine } from "../gps/gps.js";
import { AIS, aisStart, aisStop } from "../mer/ais.js";
import { tgSet } from "../mer/maregraphes.js";
import { anchorLayer } from "../mer/mouillage.js";
import { OVT, getJSON, ov, setOverlay } from "../meteo/calques.js";
import { crowdCheck } from "../meteo/tableau.js";
import { LW, lwDraw } from "../meteo/vent-direct.js";
import { measureGeom, trailOn } from "./itineraires.js";
import { refSet } from "./refuges.js";
import { randoOvlApply } from "./surimpressions.js";
import { $, fmtDur, store, toast } from "../utils.js";

/* ================= Mode Rando ================= */
const ICON_MER = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 3v12H4.5L11 3zm2 2.5L18.5 15H13V5.5zM3 17h18l-2.2 3.2a2 2 0 0 1-1.6.8H6.8a2 2 0 0 1-1.6-.8L3 17z"/></svg>';
const ICON_RANDO = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 20 9.5 7l3.6 6.2L15.5 9 22 20H2zm7.5-9.2L6 17h7l-3.5-6.2z"/></svg>';
function chipLabels(){
  $("c1l").textContent = R()?"Altitude":"Vitesse"; $("c1u").textContent = R()?"m":"nd";
  $("c2l").textContent = R()?"Montée":"Cap"; $("c2u").textContent = R()?"m":"°";
  $("cog").textContent="—"; $("sog").textContent="—";
}
export function setMode(m, quiet){
  setMODE(m); store.set("mode",m); document.body.classList.toggle("rando", R());
  document.querySelectorAll("#bMode button").forEach(b=>{ const on=b.dataset.m===MODE; b.classList.toggle("on",on); b.setAttribute("aria-checked",on); });
  $("followLbl").textContent = R()?"Moi":"Bateau";
  map.setMinZoom(R()?6:7); map.setMaxBounds(AREA().pad(R()?0.05:0.15));
  // fond de carte propre à chaque mode
  const nb = store.get(baseKey(), R()?"scan25":"litto");
  if(nb!==curBase && bases[nb]){ map.removeLayer(bases[curBase]); setCurBase(nb); bases[curBase].addTo(map); bases[curBase].bringToBack(); }
  const rb=document.querySelector(`input[name=base][value=${curBase}]`); if(rb) rb.checked=true;
  if(ov.type && ((OVT[ov.type].api==="mar" && R()) || (OVT[ov.type].rando && !R()))) setOverlay(null);
  $("mSpeed").value = store.get("mspeed_"+MODE, R()?4:5);
  try{ if(mobMk){ R()?map.removeLayer(mobMk):mobMk.addTo(map); } }catch(e){}
  try{ (R() || !$("track").checked) ? map.removeLayer(trackLine) : trackLine.addTo(map); }catch(e){}
  try{ randoOvlApply(); }catch(e){}
  try{ tgSet(store.get("tg",false)); refSet(store.get("refuges",false)); if(map.hasLayer(LW.layer)) lwDraw(); }catch(e){}
  try{ if(R()){ aisStop(); map.removeLayer(AIS.layer); } else if(AIS.on) aisStart(); }catch(e){}
  try{ R()?map.removeLayer(anchorLayer):anchorLayer.addTo(map); }catch(e){}
  chipLabels(); if(measuring) drawMeasure(); if(typeof setSlopes==="function") setSlopes(store.get("slopes",false)); try{ autoSatCheck(); setShade(store.get("shade",true)); }catch(e){ /* pas encore initialisé au démarrage */ }
  if(!AREA().contains(map.getCenter())) map.setView(R()?[46.6,2.4]:[48.4,-3.4], R()?6:8);
  if(!quiet) toast(R()?"Mode Rando : cartes IGN, traces, dénivelé":"Mode Mer : cartes marines, courants, marée");
}
// fond 1:25 000 indisponible -> Plan IGN
let s25ok=0, s25err=0;

/* ---- Altitude IGN, profils ---- */
export async function elevations(pts){ // pts : [[lat,lng],…]
  const out=[];
  for(let i=0;i<pts.length;i+=100){ const ch=pts.slice(i,i+100);
    const j=await getJSON(`https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${ch.map(p=>(+p[1]).toFixed(5)).join("|")}&lat=${ch.map(p=>(+p[0]).toFixed(5)).join("|")}&resource=ign_rge_alti_wld&zonly=true`);
    out.push(...j.elevations.map(z=>z<-500?null:z)); }
  return out;
}
// ré-échantillonne une ligne en N points régulièrement espacés -> [{lat,lng,d}]
function resample(lls, N){
  const cum=[0]; for(let i=1;i<lls.length;i++) cum.push(cum[i-1]+map.distance(lls[i-1],lls[i]));
  const tot=cum[cum.length-1], out=[]; if(!tot) return lls.map(p=>({lat:p.lat??p[0],lng:p.lng??p[1],d:0}));
  let j=0; for(let k=0;k<N;k++){ const d=tot*k/(N-1); while(j<cum.length-2 && cum[j+1]<d) j++;
    const a=L.latLng(lls[j]), b=L.latLng(lls[j+1]), f=(d-cum[j])/((cum[j+1]-cum[j])||1);
    out.push({lat:a.lat+(b.lat-a.lat)*f, lng:a.lng+(b.lng-a.lng)*f, d}); }
  return out;
}
export function climb(z){ let up=0, dn=0, ref=null; for(const v of z){ if(v==null) continue; if(ref==null){ ref=v; continue; }
  const dz=v-ref; if(dz>=3){ up+=dz; ref=v; } else if(dz<=-3){ dn-=dz; ref=v; } } return {up:Math.round(up), dn:Math.round(dn)}; }
export async function buildProfile(lls){
  const N=Math.max(2,Math.min(200, Math.round(lls.length*3))), rs=resample(lls, N), z=await elevations(rs.map(p=>[p.lat,p.lng]));
  return {d:rs.map(p=>Math.round(p.d)), z:z.map(v=>v==null?null:Math.round(v*10)/10), lat:rs.map(p=>+p.lat.toFixed(5)), lng:rs.map(p=>+p.lng.toFixed(5))};
}
export let profMk=null;
export function drawProfile(canvas, prof, onHover){
  const dpr=window.devicePixelRatio||1, W=canvas.clientWidth, H=canvas.clientHeight; if(!W||!prof) return;
  canvas.width=W*dpr; canvas.height=H*dpr; const g=canvas.getContext("2d"); g.scale(dpr,dpr);
  const zs=prof.z.filter(v=>v!=null); if(zs.length<2){ g.fillStyle="#5d6e80"; g.font="500 12px Inter,system-ui"; g.fillText("Altitudes indisponibles",8,20); return; }
  let lo=Math.min(...zs), hi=Math.max(...zs); const pad=Math.max(10,(hi-lo)*.12); lo=Math.floor((lo-pad)/10)*10; hi=Math.ceil((hi+pad)/10)*10;
  const L0=50, R0=W-8, T=8, B=H-18, tot=prof.d[prof.d.length-1]||1, X=d=>L0+d/tot*(R0-L0), Y=z=>B-(z-lo)/(hi-lo)*(B-T);
  g.font="500 10px Inter,system-ui,sans-serif"; g.fillStyle="#5d6e80"; g.strokeStyle="rgba(13,27,42,.08)";
  const step = (hi-lo)>800?200:(hi-lo)>300?100:(hi-lo)>120?50:20;
  g.textAlign="right"; for(let z=Math.ceil(lo/step)*step; z<=hi; z+=step){ g.beginPath(); g.moveTo(L0,Y(z)); g.lineTo(R0,Y(z)); g.stroke(); g.fillText(z+" m",L0-4,Y(z)+3); }
  g.textAlign="center"; const steps=[100,200,250,500,1000,2000,2500,5000,10000,20000,50000]; const ks = steps.find(st=> st/tot*(R0-L0) >= 60) || 100000;
  for(let d=0; d<=tot; d+=ks) g.fillText(d>=1000?(d/1000)+" km":d+" m", X(d), H-4);
  const P=[]; prof.z.forEach((z,i)=>{ if(z!=null) P.push([X(prof.d[i]),Y(z)]); });
  g.beginPath(); g.moveTo(P[0][0],B); P.forEach(p=>g.lineTo(p[0],p[1])); g.lineTo(P[P.length-1][0],B); g.closePath();
  const gr=g.createLinearGradient(0,T,0,B); gr.addColorStop(0,"rgba(158,105,52,.55)"); gr.addColorStop(1,"rgba(120,170,90,.25)"); g.fillStyle=gr; g.fill();
  g.beginPath(); P.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1])); g.strokeStyle="#7a4a1d"; g.lineWidth=1.8; g.stroke();
  if(canvas._hov!=null){ const i=canvas._hov, z=prof.z[i]; if(z!=null){ const x=X(prof.d[i]), y=Y(z);
    g.strokeStyle="#FF7A00"; g.lineWidth=1.5; g.beginPath(); g.moveTo(x,T); g.lineTo(x,B); g.stroke(); g.fillStyle="#FF7A00"; g.beginPath(); g.arc(x,y,4,0,7); g.fill();
    g.fillStyle="#0d1b2a"; g.font="600 11px Inter,system-ui"; g.textAlign = x>W-90?"right":"left"; g.fillText(Math.round(z)+" m · "+fmtD(prof.d[i]), x+(x>W-90?-6:6), T+12); } }
  if(!canvas._wired){ canvas._wired=true;
    const pick=ev=>{ const r=canvas.getBoundingClientRect(), x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left, p=canvas._prof; if(!p) return;
      const tt=p.d[p.d.length-1]||1, d=(x-L0)/(R0-L0)*tt; let bi=0; p.d.forEach((v,i)=>{ if(Math.abs(v-d)<Math.abs(p.d[bi]-d)) bi=i; });
      canvas._hov=bi; drawProfile(canvas,p); const ll=[p.lat[bi],p.lng[bi]];
      if(!profMk) profMk=L.circleMarker(ll,{radius:7,color:"#fff",weight:3,fillColor:"#FF7A00",fillOpacity:1,interactive:false}).addTo(map); else profMk.setLatLng(ll).addTo(map); };
    canvas.addEventListener("pointerdown",e=>{ canvas._down=true; pick(e); }); canvas.addEventListener("pointermove",e=>{ if(canvas._down) pick(e); });
    canvas.addEventListener("pointerup",()=>canvas._down=false); canvas.addEventListener("pointerleave",()=>canvas._down=false); }
  canvas._prof=prof;
}

/* ---- Mesure en mode rando : km, dénivelé, temps de marche ---- */
export let mProfT=null, mProf=null;
export async function measureProfile(){
  if(!R() || mPts.length<2){ $("mProfWrap").hidden=true; mProf=null; return; }
  const key=mPts.map(p=>p.lat.toFixed(5)+","+p.lng.toFixed(5)).join(";");
  try{ const prof=await buildProfile(trailOn()?measureGeom().map(c=>L.latLng(c[0],c[1])):mPts); if(key!==mPts.map(p=>p.lat.toFixed(5)+","+p.lng.toFixed(5)).join(";")) return;
    mProf=prof; const c=climb(prof.z), tot=prof.d[prof.d.length-1], sp=parseFloat(String($("mSpeed").value).replace(",","."))||4;
    $("mEta").textContent = "≈ "+fmtDur(tot/1000/sp + c.up/300)+" · D+ "+c.up+" m · D− "+c.dn+" m";
    $("mProfWrap").hidden=false; const cv=$("mProf"); cv._hov=null; drawProfile(cv, prof);
    document.documentElement.style.setProperty("--tl", ($("measure").offsetHeight+8)+"px"); setTimeout(crowdCheck,260);
  }catch(e){ $("mEta").textContent += " · altitude indisponible"; }
}

// pour les autres modules (une variable importée ne peut pas être modifiée directement)
export function setProfMk(v){ profMk = v; return v; }
export function setMProfT(v){ mProfT = v; return v; }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initRando(){
  document.querySelectorAll("#bMode button").forEach(b=>b.onclick=()=>{ if(b.dataset.m!==MODE) setMode(b.dataset.m); });
  bases.scan25.on("tileload",()=>s25ok++);
  bases.scan25.on("tileerror",()=>{ s25err++; if(s25err===6 && s25ok===0 && curBase==="scan25" && navigator.onLine){
    toast("Carte IGN 1:25 000 indisponible : passage sur le Plan IGN", 6000); document.querySelector("input[name=base][value=ign]").click(); }});
}
