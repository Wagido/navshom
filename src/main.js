import { $, CN, fmtDur, store, toast } from "./utils.js";
import { AREA, FRANCE, MODE, R, baseKey, bases, curBase, fmtD, geopf, initCarte, map, seamarks, setCurBase, setMODE, slopes } from "./carte/carte.js";
import { closeSheets, initPanneaux, openSheet } from "./ui/panneaux.js";
import { initGps, last, setFollow, trackLine } from "./gps/gps.js";
import { initPoint, mobMk, wps } from "./carte/point.js";
import { drawMeasure, initMesure, mPts, measuring, stopMeasure } from "./carte/mesure.js";
import { OVT, fetchSeries, getJSON, initCalques, model, ov, setOverlay } from "./meteo/calques.js";
import { crowdCheck, fixTl, initTableau } from "./meteo/tableau.js";
import { initParticules } from "./meteo/particules.js";
import { initMasque } from "./meteo/masque.js";
import { initCourant } from "./mer/courant.js";
import { initPrevisions } from "./meteo/previsions.js";
import { initRecherche } from "./ui/recherche.js";
import { initNatif, notify } from "./gps/natif.js";
import { anchorLayer, initMouillage } from "./mer/mouillage.js";
import { initRoutes } from "./mer/routes.js";
import { initSauvegarde, saveFile } from "./ui/sauvegarde.js";
import { initMarees } from "./mer/marees.js";
import { autoSatCheck, autoSatOn, initFonds, setShade, setSlopes, shade } from "./carte/fonds.js";
import { RT, initRoutage } from "./mer/routage.js";
import { initReglages, wake } from "./ui/reglages.js";
import { initInstruments, instOpen } from "./mer/instruments.js";
import { AIS, aisStart, aisStop, initAis } from "./mer/ais.js";
import { initPluie } from "./meteo/pluie.js";
import { initBoussole } from "./carte/boussole.js";
import { LW, initVentDirect, lwDraw } from "./meteo/vent-direct.js";
import { initMaregraphes, tgSet } from "./mer/maregraphes.js";
import { initVersion } from "./ui/version.js";

initCarte();
initPanneaux();
initGps();
initPoint();
initMesure();
initCalques();
initTableau();
initParticules();
initMasque();
initCourant();
initPrevisions();

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
document.querySelectorAll("#bMode button").forEach(b=>b.onclick=()=>{ if(b.dataset.m!==MODE) setMode(b.dataset.m); });
// fond 1:25 000 indisponible -> Plan IGN
let s25ok=0, s25err=0; bases.scan25.on("tileload",()=>s25ok++);
bases.scan25.on("tileerror",()=>{ s25err++; if(s25err===6 && s25ok===0 && curBase==="scan25" && navigator.onLine){
  toast("Carte IGN 1:25 000 indisponible : passage sur le Plan IGN", 6000); document.querySelector("input[name=base][value=ign]").click(); }});

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
function climb(z){ let up=0, dn=0, ref=null; for(const v of z){ if(v==null) continue; if(ref==null){ ref=v; continue; }
  const dz=v-ref; if(dz>=3){ up+=dz; ref=v; } else if(dz<=-3){ dn-=dz; ref=v; } } return {up:Math.round(up), dn:Math.round(dn)}; }
async function buildProfile(lls){
  const N=Math.max(2,Math.min(200, Math.round(lls.length*3))), rs=resample(lls, N), z=await elevations(rs.map(p=>[p.lat,p.lng]));
  return {d:rs.map(p=>Math.round(p.d)), z:z.map(v=>v==null?null:Math.round(v*10)/10), lat:rs.map(p=>+p.lat.toFixed(5)), lng:rs.map(p=>+p.lng.toFixed(5))};
}
let profMk=null;
function drawProfile(canvas, prof, onHover){
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

/* ---- Enregistrement de trace ---- */
export let rec = store.get("rec", null); // {on, paused, start, pausedAt, pausedTotal, pts:[[lat,lng,t,alt]]}
const recLine = L.polyline([], {color:"#d81b60", weight:4, opacity:.9, interactive:false}).addTo(map);
export let recSaveT=0, recGpsUp=0, recGpsRef=null;
function recDist(pts){ let d=0; for(let i=1;i<pts.length;i++) d+=map.distance([pts[i-1][0],pts[i-1][1]],[pts[i][0],pts[i][1]]); return d; }
function recDuration(){ if(!rec) return 0; const now=rec.paused?rec.pausedAt:Date.now(); return Math.max(0,(now-rec.start-(rec.pausedTotal||0))/3600e3); }
function recPersist(force){ if(force || Date.now()-recSaveT>15000){ recSaveT=Date.now(); store.set("rec",rec); } }
const fmtPace = kmh => !(kmh>=1.5) ? "–:––" : (()=>{ const sec=Math.round(3600/kmh); return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0"); })();
const fmtClock = h => { const t=Math.round(h*3600), H=Math.floor(t/3600), M=Math.floor(t%3600/60), Sx=t%60; return (H?H+":"+String(M).padStart(2,"0"):M)+":"+String(Sx).padStart(2,"0"); };
let activity = store.get("activity","hike");

function curSpeed(){ // km/h sur les 30 dernières secondes
  if(!rec||rec.pts.length<2) return 0; const P=rec.pts, tN=P[P.length-1][2]; let d=0, i=P.length-1;
  while(i>0 && tN-P[i-1][2]<=30){ d+=map.distance([P[i-1][0],P[i-1][1]],[P[i][0],P[i][1]]); i--; }
  const dt=tN-P[i][2]; if(Date.now()/1000-tN>15) return 0; return dt>=5 ? d/dt*3.6 : 0; }
function renderRun(){
  const on = rec && rec.on && rec.act==="run"; $("runHud").hidden=!on; if(!on) return;
  $("runHud").classList.toggle("paused", rec.paused);
  const d=rec.dist||0, h=recDuration(), v=rec.paused?0:curSpeed();
  $("rhDist").textContent=(d/1000).toFixed(2).replace(".",","); $("rhDur").textContent=fmtClock(h);
  $("rhPace").textContent=fmtPace(v); $("rhSpd").textContent= v>=1.5 ? v.toFixed(1)+" km/h" : "–";
  $("rhAvg").textContent = h>0.003 ? fmtPace(d/1000/h) : "–:––";
  const sp=rec.splits||[]; $("rhLast").textContent = sp.length ? fmtClock(sp[sp.length-1].sec/3600) : "–";
  $("rhPause").textContent = rec.paused ? "Reprendre" : "Pause";
}
export function recPoint(ll, c, t){
  if(!rec || !rec.on || rec.paused || c.accuracy>35) return;
  const lp=rec.pts[rec.pts.length-1]; if(lp && map.distance([lp[0],lp[1]],ll)<(rec.act==="run"?5:8)) return;
  if(lp) rec.dist=(rec.dist||0)+map.distance([lp[0],lp[1]],ll);
  // passage de chaque kilomètre : temps du km, vibration et notification
  const km=Math.floor((rec.dist||0)/1000); rec.splits=rec.splits||[];
  if(km>rec.splits.length){ const total=recDuration()*3600, prev=rec.splits.reduce((a,x)=>a+x.sec,0), sec=Math.round(total-prev);
    rec.splits.push({km, sec}); const msg="Km "+km+" en "+fmtClock(sec/3600)+" · moyenne "+fmtPace((rec.dist/1000)/(total/3600))+" /km";
    if(rec.act==="run"){ toast(msg,5000); notify("🏃 Km "+km, msg); if(navigator.vibrate) navigator.vibrate([200,100,200]); } }
  const alt = c.altitude!=null ? Math.round(c.altitude) : null;
  rec.pts.push([+ll.lat.toFixed(6), +ll.lng.toFixed(6), Math.round(t/1000), alt]); recLine.addLatLng(ll);
  if(alt!=null){ if(recGpsRef==null) recGpsRef=alt; else if(alt-recGpsRef>=6){ recGpsUp+=alt-recGpsRef; recGpsRef=alt; } else if(recGpsRef-alt>=6) recGpsRef=alt; }
  // course ou marche, décidé par la vitesse : course au-delà de 7 km/h, retour marche sous 5 km/h pendant une minute
  const v=curSpeed();
  if(rec.act!=="run" && v>7){ rec.fast=(rec.fast||0)+1; if(rec.fast>=3){ rec.act="run"; rec.slowT=0; toast("🏃 Course détectée : affichage allure /km",3000); } } else if(v<=7) rec.fast=0;
  if(rec.act==="run"){ if(v>0 && v<5){ rec.slowT=rec.slowT||Date.now(); if(Date.now()-rec.slowT>60e3){ rec.act="hike"; rec.slowT=0; } } else rec.slowT=0; }
  recPersist(); renderRec(); renderRun();
}
export function renderRec(){
  const on=rec&&rec.on; $("bTrack").classList.toggle("rec", !!on && !rec.paused); $("bTrack").classList.toggle("paused", !!on && rec.paused);
  $("trStart").hidden=!!on; $("trPause").hidden=!on; $("trStop").hidden=!on; $("trPause").textContent = on&&rec.paused ? "Reprendre" : "Pause";
  const d=on?recDist(rec.pts):0, h=on?recDuration():0;
  $("tsDist").textContent = on?fmtD(d):"—"; $("tsDur").textContent = on?fmtDur(h):"—";
  $("tsUp").textContent = on?(recGpsUp?"≈ "+Math.round(recGpsUp)+" m":"—"):"—"; $("tsAvg").textContent = on && h>0.01 ? (d/1000/h).toFixed(1).replace(".",",")+" km/h" : "—";
  $("tsAlt").textContent = last && last.alt!=null ? Math.round(last.alt)+" m" : "—";
  $("tsState").textContent = !on ? "Prêt à enregistrer" : rec.paused ? "En pause" : "Enregistrement en cours";
  $("bRec").classList.toggle("on", !!on && !rec.paused); $("bRec").classList.toggle("paused", !!on && rec.paused);
  $("bRecT").textContent = !on ? "Enregistrer" : rec.paused ? "En pause" : fmtD(d);
  $("bRec").setAttribute("aria-label", !on ? "Enregistrer ma sortie" : "Sortie en cours : pause ou fin");
  if(R()) $("cog").textContent = on ? "+"+Math.round(recGpsUp||0) : "—";
}
$("trStart").onclick = () => { rec={on:true,paused:false,start:Date.now(),pausedTotal:0,pts:[],act:"hike",dist:0,splits:[]};
  recGpsUp=0; recGpsRef=null; recLine.setLatLngs([]);
  if(last) recPoint(last.ll, {accuracy:last.acc||10, altitude:last.alt}, Date.now()); recPersist(true); renderRec(); wake(); toast("Enregistrement démarré. Gardez l'écran allumé."); };
// Bouton central : démarre l'enregistrement d'un toucher ; pendant la sortie, ouvre le panneau (pause, fin)
$("bRec").onclick = () => { if(rec && rec.on){ const a=$("recAsk"); a.hidden=!a.hidden; $("raPause").textContent = rec.paused ? "Reprendre" : "Pause"; $("raStop").textContent="■ Terminer"; $("raStop").dataset.armed=""; return; }
  closeSheets(); $("trStart").onclick(); renderRec(); };
// Bulle de la sortie en cours : pause, fin (deuxième toucher pour confirmer), détails
$("raPause").onclick = () => { $("trPause").onclick(); $("recAsk").hidden=true; toast(rec && rec.paused ? "Sortie en pause" : "Enregistrement repris"); };
$("raStop").onclick = () => { const b=$("raStop"); if(b.dataset.armed!=="1"){ b.dataset.armed="1"; b.textContent="Confirmer la fin ?"; setTimeout(()=>{ if(b.dataset.armed==="1"){ b.dataset.armed=""; b.textContent="■ Terminer"; } },4000); return; }
  b.dataset.armed=""; $("recAsk").hidden=true; $("trStop").onclick(); };
$("raMore").onclick = () => { $("recAsk").hidden=true; if($("sTrack").hidden) $("bTrack").onclick(); };
$("trPause").onclick = () => { if(!rec) return; if(rec.paused){ rec.pausedTotal+=Date.now()-rec.pausedAt; rec.paused=false; } else { rec.paused=true; rec.pausedAt=Date.now(); } recPersist(true); renderRec(); renderRun(); };
$("rhPause").onclick = () => $("trPause").onclick();
$("rhStop").onclick = () => { if($("rhStop").dataset.armed!=="1"){ $("rhStop").dataset.armed="1"; $("rhStop").textContent="Confirmer ?"; setTimeout(()=>{ $("rhStop").dataset.armed=""; $("rhStop").textContent="■ Terminer"; },3000); return; }
  $("rhStop").dataset.armed=""; $("rhStop").textContent="■ Terminer"; $("trStop").onclick(); };
setInterval(()=>{ if(rec && rec.on && rec.act==="run") renderRun(); }, 1000);
$("trStop").onclick = async () => {
  if(!rec) return; const pts=rec.pts.slice(), dur=recDuration(), act=(dur>0 && recDist(rec.pts)/1000/dur>7)?"run":"hike", splits=(rec.splits||[]).slice(); rec=null; store.set("rec",null); renderRec(); renderRun();
  if(pts.length<2){ recLine.setLatLngs([]); return toast("Trace trop courte, non enregistrée"); }
  const d=new Date(), tr={id:Date.now(), name:(act==="run"?"Course du ":"Rando du ")+d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})+" "+d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}),
    date:d.toISOString(), pts:pts.map(p=>[p[0],p[1],p[2]]), dist:Math.round(recDist(pts)), dur, act, splits};
  await saveTrack(tr); recLine.setLatLngs([]); showTrack(tr.id); toast("Trace enregistrée");
};
// reprise d'un enregistrement après fermeture de l'app
if(rec && rec.on){ recLine.setLatLngs(rec.pts.map(p=>[p[0],p[1]])); if(rec.dist==null) rec.dist=recDist(rec.pts); } renderRun();

/* ---- Traces enregistrées / importées ---- */
export let tracks = store.get("tracks", []), shownId=null; const trLayer=L.layerGroup().addTo(map);
async function saveTrack(tr){
  try{ tr.prof = await buildProfile(tr.pts.map(p=>L.latLng(p[0],p[1]))); const c=climb(tr.prof.z); tr.up=c.up; tr.dn=c.dn; }catch(e){ tr.prof=null; }
  tracks.unshift(tr); try{ store.set("tracks", tracks); }catch(e){} if(JSON.stringify(tracks).length>4e6) toast("Mémoire presque pleine : supprimez d'anciennes traces");
  renderTracks();
}
function showTrack(id){
  trLayer.clearLayers(); shownId=id; const tr=tracks.find(t=>t.id===id); if(!tr){ $("trProfWrap").hidden=true; renderTracks(); return; }
  const lls=tr.pts.map(p=>[p[0],p[1]]);
  L.polyline(lls,{color:"#fff",weight:7,opacity:.8,interactive:false}).addTo(trLayer);
  L.polyline(lls,{color:"#6a1b9a",weight:5}).on("click",e=>{ L.DomEvent.stop(e); trPillShow(tr); }).addTo(trLayer);
  L.circleMarker(lls[0],{radius:6,color:"#fff",weight:2,fillColor:"#1c9e47",fillOpacity:1}).bindTooltip("Départ").addTo(trLayer);
  L.circleMarker(lls[lls.length-1],{radius:6,color:"#fff",weight:2,fillColor:"#e5372b",fillOpacity:1}).bindTooltip("Arrivée").addTo(trLayer);
  setFollow(false); map.fitBounds(L.latLngBounds(lls).pad(.15), {paddingBottomRight:[0,260]});
  $("trProfTitle").textContent = tr.name+" · "+fmtD(tr.dist)+(tr.up!=null?" · D+ "+tr.up+" m · D− "+tr.dn+" m":"")+(tr.dur?" · "+fmtDur(tr.dur):"")+(tr.act==="run"&&tr.dur?" · "+fmtPace(tr.dist/1000/tr.dur)+" min/km":"");
  const sw=$("trSplits"); sw.innerHTML=""; if(tr.act==="run" && tr.splits && tr.splits.length){ sw.innerHTML='<table class="splits">'+tr.splits.map(x=>`<tr><td>Km ${x.km}</td><td>${fmtClock(x.sec/3600)} /km</td></tr>`).join("")+'</table>'; }
  $("trProfWrap").hidden=!tr.prof; if(tr.prof){ const c=$("trProf"); c._hov=null; requestAnimationFrame(()=>drawProfile(c, tr.prof)); }
  renderTracks(); trPillShow(tr);
}
// bandeau de la trace affichée : masquer ou supprimer sans passer par les menus
function trPillShow(tr){ $("trPillT").textContent=(tr.act==="run"?"🏃 ":"🥾 ")+tr.name+" · "+fmtD(tr.dist); $("trPill").hidden=false; $("trPill").dataset.id=tr.id; $("trPillDel").textContent="Supprimer"; $("trPillDel").dataset.armed=""; }
function trHide(){ shownId=null; trLayer.clearLayers(); $("trPill").hidden=true; if($("trProfWrap")) $("trProfWrap").hidden=true; try{ if(profMk){ map.removeLayer(profMk); profMk=null; } }catch(e){} renderTracks(); }
$("trPillHide").onclick=trHide;
$("trPillDel").onclick=()=>{ const b=$("trPillDel"); if(b.dataset.armed!=="1"){ b.dataset.armed="1"; b.textContent="Confirmer ?"; setTimeout(()=>{ b.dataset.armed=""; b.textContent="Supprimer"; },3000); return; }
  const id=+$("trPill").dataset.id; tracks=tracks.filter(x=>x.id!==id); store.set("tracks",tracks); trHide(); toast("Trace supprimée"); };
function renderTracks(){
  if(!shownId && $("trPill")) $("trPill").hidden=true;
  const el=$("trList"); el.innerHTML="";
  if(!tracks.length){ el.innerHTML='<p class="note">Aucune trace. Enregistrez une sortie ou importez un fichier GPX.</p>'; return; }
  tracks.forEach(tr=>{ const row=document.createElement("div"), t=document.createElement("span");
    t.innerHTML=`<b></b><br><small style="color:var(--muted)">${tr.act==="run"?"🏃 ":""}${fmtD(tr.dist)}${tr.up!=null?" · D+ "+tr.up+" m":""}${tr.dur?" · "+fmtDur(tr.dur):""}${tr.act==="run"&&tr.dur?" · "+fmtPace(tr.dist/1000/tr.dur)+" /km":""}</small>`; t.querySelector("b").textContent=tr.name;
    const s=document.createElement("span"); s.style.whiteSpace="nowrap";
    const bv=document.createElement("button"); bv.textContent = shownId===tr.id ? "Masquer" : "Voir"; bv.onclick=()=>{ if(shownId===tr.id){ shownId=null; trLayer.clearLayers(); if(profMk) map.removeLayer(profMk); $("trProfWrap").hidden=true; renderTracks(); } else showTrack(tr.id); };
    const bg=document.createElement("button"); bg.textContent="GPX"; bg.onclick=()=>exportGPX(tr);
    const bd=document.createElement("button"); bd.textContent="Suppr."; bd.style.color="var(--red)";
    bd.onclick=()=>{ if(bd.dataset.armed!=="1"){ bd.dataset.armed="1"; bd.textContent="Sûr ?"; setTimeout(()=>{ bd.dataset.armed=""; bd.textContent="Suppr."; },3000); return; }
      tracks=tracks.filter(x=>x.id!==tr.id); store.set("tracks",tracks); if(shownId===tr.id){ shownId=null; trLayer.clearLayers(); $("trProfWrap").hidden=true; } renderTracks(); };
    s.append(bv,bg,bd); row.append(t,s); el.append(row); });
}
const esc = s => String(s).replace(/[<>&"]/g, c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
function toGPX(tr){
  const pts=tr.pts.map(p=>`      <trkpt lat="${p[0]}" lon="${p[1]}">${p[2]?`<time>${new Date(p[2]*1000).toISOString()}</time>`:""}</trkpt>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Balise" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk><name>${esc(tr.name)}</name>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>\n</gpx>\n`;
}
async function exportGPX(tr){
  const name=(tr.name||"trace").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\w\-]+/g,"_")+".gpx";
  saveFile(name, toGPX(tr), "application/gpx+xml");
}
$("gpxIn").onchange = async e => {
  const f=e.target.files[0]; e.target.value=""; if(!f) return;
  try{
    const doc=new DOMParser().parseFromString(await f.text(),"application/xml");
    let nodes=[...doc.getElementsByTagName("trkpt")]; if(!nodes.length) nodes=[...doc.getElementsByTagName("rtept")];
    const pts=nodes.map(n=>{ const t=n.getElementsByTagName("time")[0]; return [+(+n.getAttribute("lat")).toFixed(6), +(+n.getAttribute("lon")).toFixed(6), t?Math.round(new Date(t.textContent)/1000):0]; }).filter(p=>isFinite(p[0])&&isFinite(p[1]));
    if(pts.length<2) return toast("Aucune trace trouvée dans ce fichier");
    const nm=doc.getElementsByTagName("name")[0], dur = pts[0][2]&&pts[pts.length-1][2] ? (pts[pts.length-1][2]-pts[0][2])/3600 : 0;
    const tr={id:Date.now(), name:(nm&&nm.textContent.trim())||f.name.replace(/\.gpx$/i,""), date:new Date().toISOString(), pts, dist:Math.round(recDist(pts)), dur};
    toast("Import : calcul du profil…"); await saveTrack(tr); showTrack(tr.id); toast("Trace importée : "+tr.name);
  }catch(err){ toast("Fichier GPX illisible"); }
};
$("bTrack").onclick = () => { if(!$("sTrack").hidden) return closeSheets(); renderRec(); renderTracks(); openSheet("sTrack"); if(shownId) showTrack(shownId); };
setInterval(()=>{ if(rec && rec.on && !$("sTrack").hidden) renderRec(); }, 5000);
initRecherche();
initNatif();
initMouillage();
initRoutes();

/* ---------- Itinéraires sur les sentiers (IGN) ---------- */
const segCache=new Map(); let trailWarned=false;
const segKey=(a,b)=>a.lat.toFixed(5)+","+a.lng.toFixed(5)+";"+b.lat.toFixed(5)+","+b.lng.toFixed(5);
export function trailOn(){ return R() && $("mTrail").checked; }
export function segGeom(a,b){ // géométrie d'un segment : suit les chemins si possible
  if(!trailOn()) return null; const k=segKey(a,b), c=segCache.get(k); if(c) return c.pending?null:c;
  segCache.set(k,{pending:true});
  getJSON(`https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&start=${a.lng.toFixed(6)},${a.lat.toFixed(6)}&end=${b.lng.toFixed(6)},${b.lat.toFixed(6)}&profile=pedestrian&optimization=shortest&geometryFormat=geojson&getSteps=false`)
    .then(j=>{ const co=(j.geometry&&j.geometry.coordinates)||[]; if(co.length<2) throw 0;
      const cc=[[a.lat,a.lng],...co.map(c=>[c[1],c[0]]),[b.lat,b.lng]]; let dd=0; for(let i=1;i<cc.length;i++) dd+=map.distance(cc[i-1],cc[i]);
      segCache.set(k,{coords:cc, dist:dd}); if(measuring) drawMeasure(); })
    .catch(()=>{ segCache.set(k,{coords:[[a.lat,a.lng],[b.lat,b.lng]], dist:map.distance(a,b), straight:true});
      if(!trailWarned){ trailWarned=true; toast("Pas de chemin trouvé sur un segment : tracé en ligne droite"); } if(measuring) drawMeasure(); });
  return null;
}
export function measureGeom(){ const out=[]; for(let i=1;i<mPts.length;i++){ const g=segGeom(mPts[i-1],mPts[i]); const co = g ? g.coords : [[mPts[i-1].lat,mPts[i-1].lng],[mPts[i].lat,mPts[i].lng]]; out.push(...(i>1?co.slice(1):co)); } return out; }
$("mTrail").checked = store.get("trail", true);
$("mTrail").onchange = () => { store.set("trail",$("mTrail").checked); drawMeasure(); };
initSauvegarde();
initMarees();
initFonds();
initRoutage();
initReglages();

/* ================= Hors ligne ================= */
function tileRange(b,z){ const n=2**z, x=lng=>Math.floor((lng+180)/360*n),
  y=lat=>{ const r=lat*Math.PI/180; return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n); };
  return {x0:x(b.getWest()),x1:x(b.getEast()),y0:y(b.getNorth()),y1:y(b.getSouth())}; }
/* Zones téléchargées : on enregistre toutes les tuiles des couches affichées, du zoom 6 au détail maximal du fond */
const TILE_KB={ign1950:30,litto:30,scan25:38,ign:22,ortho:30,emod:12,shom:30,gebco:10,shade:14,slopes:6,seamarks:2}, DL_MAX=9000;
const OVL={shade, slopes, seamarks};
let zones=store.get("zones",[]), dl=null, dlQ=0;
const lyOf=k=>bases[k]||OVL[k];
function dlKeys(){ let k=(autoSatOn&&curBase==="ortho")?"scan25":curBase;
  if(k==="osm"||k==="topo") k=R()?"scan25":"ign"; // OpenStreetMap et OpenTopoMap interdisent le téléchargement en masse : carte IGN à la place
  const ks=[k];
  if(R()){ if(store.get("shade",true) && k!=="ortho") ks.push("shade"); if(map.hasLayer(slopes)) ks.push("slopes"); }
  else if($("seamarks").checked) ks.push("seamarks");
  return ks; }
function dlZooms(k,q){ const o=lyOf(k).options, zx=Math.min(o.maxNativeZoom??o.maxZoom??18, 17)-q; return [Math.max(6,o.minNativeZoom||0), zx]; }
function tilesIn(b,k,q,cb){ const [z0,z1]=dlZooms(k,q); let n=0;
  for(let z=z0; z<=z1; z++){ const r=tileRange(b,z); n+=(r.x1-r.x0+1)*(r.y1-r.y0+1);
    if(cb) for(let x=r.x0;x<=r.x1;x++) for(let y=r.y0;y<=r.y1;y++) cb(L.Util.template(lyOf(k)._url, L.extend({},lyOf(k).options,{z,x,y,s:"a",r:""}))); }
  return n; }
function zoneUrls(zn){ const b=L.latLngBounds([zn.b[0],zn.b[1]],[zn.b[2],zn.b[3]]), out=[]; zn.keys.forEach(k=>{ if(lyOf(k)) tilesIn(b,k,zn.q||0,u=>out.push(u)); });
  if(zn.d3) out.push(...v3ZoneUrls(b)); return [...new Set(out)]; }
function dlBounds(){ const f=$("dlFrame").getBoundingClientRect(), m=map.getContainer().getBoundingClientRect();
  const nw=map.containerPointToLatLng([f.left-m.left,f.top-m.top]), se=map.containerPointToLatLng([f.right-m.left,f.bottom-m.top]);
  const b=L.latLngBounds(se,nw), A=FRANCE;
  return L.latLngBounds([Math.max(b.getSouth(),A.getSouth()),Math.max(b.getWest(),A.getWest())],[Math.min(b.getNorth(),A.getNorth()),Math.min(b.getEast(),A.getEast())]); }
function dlLayout(){ const top=$("colTL").getBoundingClientRect().bottom+14, bot=$("dlBar").getBoundingClientRect().top-14, f=$("dlFrame").style;
  const side=Math.max(18, innerWidth>700 ? innerWidth*0.12 : 18), rt=innerWidth>700?side:Math.max(side,$("colTR").getBoundingClientRect().width+26);
  f.top=top+"px"; f.left=side+"px"; f.right=rt+"px"; f.height=Math.max(80,bot-top)+"px"; }
const NAMES={ign1950:"carte IGN 1950",litto:"carte marine",scan25:"IGN 1:25 000",ign:"plan IGN",ortho:"photos aériennes",emod:"profondeurs",shom:"cartes SHOM",gebco:"GEBCO",shade:"relief",slopes:"pentes",seamarks:"balisage"};
function dlEstimate(){ if(!dl || dl.running) return; const b=dlBounds(), ks=dlKeys(), e=$("dlEst"), go=$("dlGo");
  const sub=(curBase==="osm"||curBase==="topo") ? (curBase==="osm"?"OpenStreetMap":"OpenTopoMap")+" ne se télécharge pas (interdit par le service) : "+(R()?"la carte IGN 1:25 000 est emportée":"le plan IGN est emporté")+" à la place.<br>" : "";
  let n=0, kb=0; ks.forEach(k=>{ const c=tilesIn(b,k,dlQ); n+=c; kb+=c*(TILE_KB[k]||20); });
  dl.d3=false;
  if(R()){ const c3=v3ZoneCount(b), k3=c3.dem*64+c3.ph*TILE_KB.ortho, big=c3.dem+c3.ph>V3DL_MAX, cb=$("dlD3");
    cb.disabled=big; $("dlD3Row").style.opacity=big?.55:1;
    $("dlD3Txt").textContent = big ? "Vue 3D : zone trop grande. Prenez plutôt le relief par massif (Plus › Hors ligne)" : "Vue 3D : relief et photo (≈ "+Math.max(1,Math.round(k3/1024))+" Mo)";
    if(cb.checked && !big){ n+=c3.dem+c3.ph; kb+=k3; dl.d3=true; } }
  const mo=Math.max(1,Math.round(kb/1024)), zx=dlZooms(ks[0],dlQ)[1];
  if(n>DL_MAX){ e.className="dl-s warn"; e.innerHTML=sub+"Zone trop grande ("+n.toLocaleString("fr-FR")+" tuiles). Rapprochez-vous ou choisissez « Plus léger »."; go.disabled=true; return; }
  e.className="dl-s"; e.innerHTML=sub+"<b>≈ "+mo+" Mo</b> · "+n.toLocaleString("fr-FR")+" tuiles · "+ks.map(k=>NAMES[k]||k).join(" + ")+" · détail jusqu'au 1:"+Math.round(591658711/2**zx/1000)+" 000";
  go.disabled=false; dl.n=n; dl.keys=ks; dl.b=b; }
function dlStart(){ if(!("caches" in window)) return toast("Ce navigateur ne permet pas le hors ligne");
  closeSheets(); if(measuring) stopMeasure();
  dl={running:false}; document.body.classList.add("dlmode"); $("dlFrame").hidden=false; $("dlBar").hidden=false;
  $("dlTitle").textContent="Cadrez la zone à emporter"; $("dlQ").hidden=false; $("dlP").hidden=true; $("dlGo").hidden=false; $("dlCancel").textContent="Annuler";
  requestAnimationFrame(()=>{ dlLayout(); dlEstimate(); }); }
function dlEnd(){ dl=null; document.body.classList.remove("dlmode"); $("dlFrame").hidden=true; $("dlBar").hidden=true; }
map.on("moveend zoomend", ()=>{ if(dl) dlEstimate(); }); addEventListener("resize", ()=>{ if(dl){ dlLayout(); dlEstimate(); } });
$("dlQ").onclick=e=>{ const q=e.target.dataset.q; if(q==null) return; dlQ=+q; $("dlQ").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===e.target)); dlEstimate(); };
$("dlD3").onchange=dlEstimate;
$("dlCancel").onclick=()=>{ if(dl && dl.running){ dl.stop=true; return; } dlEnd(); };
async function zoneName(c){ for(const ix of ["poi","address"]) try{ const r=await fetch("https://data.geopf.fr/geocodage/reverse?lon="+c.lng.toFixed(4)+"&lat="+c.lat.toFixed(4)+"&limit=1&index="+ix); const j=await r.json(); const p=j.features[0].properties, n=p.toponym||p.city; if(n) return n; }catch(e){}
  return "Zone du "+new Date().toLocaleDateString("fr-FR"); }
$("dlGo").onclick=async()=>{ if(!dl || dl.running || !dl.b) return;
  try{ navigator.storage && navigator.storage.persist && navigator.storage.persist(); }catch(e){}
  const wantWx=$("dlWx").checked, q=dlQ, zn={id:Date.now(), b:[dl.b.getSouth(),dl.b.getWest(),dl.b.getNorth(),dl.b.getEast()], keys:dl.keys, q, mode:MODE, d3:!!dl.d3, d:new Date().toISOString()};
  const urls=zoneUrls(zn), total=urls.length; dl.running=true;
  $("dlTitle").textContent="Téléchargement…"; $("dlQ").hidden=true; $("dlP").hidden=false; $("dlGo").hidden=true; $("dlCancel").textContent="Arrêter";
  const cache=await caches.open(CN+"tiles"); let done=0, fail=0, bytes=0; const t0=Date.now();
  const show=()=>{ $("dlProg").style.width=(100*done/total).toFixed(1)+"%"; const left=done>20? Math.round((Date.now()-t0)/done*(total-done)/1000):null;
    $("dlEst").className="dl-s"; $("dlEst").innerHTML="<b>"+Math.round(100*done/total)+" %</b> · "+done.toLocaleString("fr-FR")+" / "+total.toLocaleString("fr-FR")+" tuiles · "+(bytes/1048576).toFixed(0)+" Mo"+(left!=null?" · encore ≈ "+(left>90?Math.round(left/60)+" min":left+" s"):"")+(fail?" · "+fail+" échecs":""); };
  const worker=async()=>{ while(urls.length && !dl.stop){ const u=urls.pop();
    try{ if(!(await cache.match(u))){ let r;
        try{ r=await fetch(u,{mode:"cors"}); }catch(e){ r=await fetch(u,{mode:"no-cors"}); }
        if(r.type==="opaque") await cache.put(u,r);
        else if(r.ok){ const bl=await r.blob(); bytes+=bl.size; await cache.put(u,new Response(bl,{headers:{"Content-Type":r.headers.get("Content-Type")||"image/png"}})); }
        else if(r.status!==404) fail++; }
    }catch(e){ fail++; }
    done++; if(done%10===0||done===total) show(); } };
  show(); await Promise.all([worker(),worker(),worker(),worker(),worker()]);
  const stopped=dl.stop; dlEnd();
  if(stopped && done<total*0.98){ toast("Téléchargement arrêté ("+done+" / "+total+" tuiles déjà enregistrées)",4000); return; }
  zn.n=total; zn.mb=Math.max(1,Math.round(bytes/1048576)); zn.fail=fail; zn.name=await zoneName(L.latLngBounds([zn.b[0],zn.b[1]],[zn.b[2],zn.b[3]]).getCenter());
  zones.push(zn); store.set("zones",zones); if(zn.d3) v3KeepLib();
  if(wantWx){ toast("Cartes enregistrées · téléchargement de la météo…",3000); try{ await wxDownload(zn); }catch(e){ toast("Météo non enregistrée (réseau ou limite Open-Meteo)",4000); } }
  renderZones();
  toast("« "+zn.name+" » disponible hors ligne"+(fail?" ("+fail+" tuiles manquantes, relancez pour compléter)":""),5000); };
// Ajouter la vue 3D (relief + photo) à une zone déjà téléchargée
async function zoneAdd3D(zn, btn){
  if(!navigator.onLine) return toast("Il faut du réseau pour ajouter la vue 3D");
  const urls=v3ZoneUrls(L.latLngBounds([zn.b[0],zn.b[1]],[zn.b[2],zn.b[3]]));
  if(urls.length>V3DL_MAX) return toast("Zone trop grande pour la 3D : prenez plutôt le relief par massif", 4000);
  btn.disabled=true; btn.textContent="0 %"; const c=await caches.open(CN+"tiles"), list=urls.slice(); let done=0, bytes=0, fail=0;
  const w=async()=>{ while(list.length){ const u=list.pop();
    try{ if(!(await c.match(u))){ const r=await fetch(u,{mode:"cors"}); if(r.ok){ const b=await r.blob(); bytes+=b.size; await c.put(u,new Response(b,{headers:{"Content-Type":r.headers.get("Content-Type")||"application/octet-stream"}})); } else fail++; } }catch(e){ fail++; }
    if(++done%10===0) btn.textContent=Math.round(100*done/urls.length)+" %"; } };
  await Promise.all([w(),w(),w(),w()]);
  zn.d3=true; zn.mb=(zn.mb||0)+Math.round(bytes/1048576); store.set("zones",zones); v3KeepLib(); renderZones();
  toast("Vue 3D ajoutée à « "+zn.name+" »"+(fail?" ("+fail+" morceaux manquants, relancez plus tard)":""), 4000); }
$("bCache").onclick=dlStart; $("bCache2").onclick=dlStart;
function renderZones(){ const el=$("zoneList"); el.innerHTML="";
  if(!zones.length){ el.innerHTML='<p class="note" style="margin:4px 0">Aucune zone téléchargée pour l\'instant.</p>'; }
  zones.slice().reverse().forEach(zn=>{ const row=document.createElement("div");
    row.innerHTML='<span style="flex:1;min-width:0"><b></b><small style="display:block;color:var(--muted);font-size:12px"></small></span><button data-a="wx">Météo</button><button data-a="see">Voir</button><button data-a="del" style="color:#C62828">Supprimer</button>';
    row.querySelector("b").textContent=zn.name+(zn.mode==="rando"?" · Rando":" · Mer");
    row.querySelector("small").textContent=(zn.mb?zn.mb+" Mo · ":"")+"le "+new Date(zn.d).toLocaleDateString("fr-FR");
    const bz=document.createElement("p"); bz.className="zbs"; // étiquettes : ce que contient la zone
    bz.innerHTML='<span class="zb">'+esc(zn.keys.map(k=>NAMES[k]||k).join(" + "))+'</span>'
      +(zn.mode==="rando" ? (zn.d3 ? '<span class="zb g">Vue 3D</span>' : '<button class="zb n add3d" data-a="d3">Sans 3D · ajouter</button>') : '')
      +(zn.wx ? '<span class="zb o">Météo du '+new Date(zn.wx).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+'</span>' : '<span class="zb n">Sans météo</span>');
    row.querySelector("small").after(bz); row.style.flexWrap="wrap"; row.firstElementChild.style.flexBasis="100%";
    const a3=bz.querySelector('[data-a=d3]'); if(a3) a3.onclick=()=>zoneAdd3D(zn, a3);
    row.querySelector('[data-a=see]').onclick=()=>{ closeSheets(); if(zn.mode!==MODE) setMode(zn.mode); const b=L.latLngBounds([zn.b[0],zn.b[1]],[zn.b[2],zn.b[3]]);
      setFollow(false); map.fitBounds(b); const r=L.rectangle(b,{color:"#FF7A00",weight:2,dashArray:"6 6",fill:false,interactive:false}).addTo(map); setTimeout(()=>map.removeLayer(r),4000); };
    row.querySelector('[data-a=wx]').onclick=async()=>{ toast("Mise à jour de la météo de « "+zn.name+" »…",3000);
      try{ await wxDownload(zn); toast("Météo enregistrée pour 3 jours"); }catch(e){ toast("Météo indisponible (réseau ou limite Open-Meteo)"); } renderZones(); };
    row.querySelector('[data-a=del]').onclick=async()=>{ if(!confirm("Supprimer « "+zn.name+" » du téléphone ?")) return;
      zones=zones.filter(z=>z.id!==zn.id); store.set("zones",zones); renderZones(); delete WXOFF[zn.id]; try{ (await caches.open(CN+"wx")).delete(wxKey(zn.id)); }catch(e){}
      const keep=new Set(); zones.forEach(z=>zoneUrls(z).forEach(u=>keep.add(u))); Object.keys(mInst).forEach(id=>massifUrls(id).forEach(u=>keep.add(u)));
      try{ const c=await caches.open(CN+"tiles"); await Promise.all(zoneUrls(zn).filter(u=>!keep.has(u)).map(u=>c.delete(u))); }catch(e){}
      toast("Zone supprimée"); usageNote(); };
    el.appendChild(row); });
  usageNote(); }
export async function usageNote(){ let tot=0; try{ tot=(await navigator.storage.estimate()).usage/1048576; }catch(e){}
  let mi={}; try{ mi=mInst; }catch(e){}
  const zMb=zones.reduce((a,z)=>a+(z.mb||0),0), mMb=Object.values(mi).reduce((a,m)=>a+m.n*64/1024,0), all=Math.max(tot, zMb+mMb);
  const parts=[["Zones",zMb,"#0B2F5B"],["Relief des massifs",mMb,"#2E7D32"],["Carte déjà vue et appli",Math.max(0,all-zMb-mMb),"#9AA8B8"]];
  const g=parts.map(([n,v,c])=>`<i style="width:${all?(100*v/all).toFixed(1):0}%;background:${c}"></i>`).join("");
  $("ocGauge").innerHTML=g; $("offGauge").innerHTML=g;
  $("offTot").innerHTML=Math.round(all).toLocaleString("fr-FR")+" Mo <small>sur le téléphone</small>";
  $("offLeg").innerHTML=parts.filter(x=>x[1]>=.5).map(([n,v,c])=>`<span><i style="background:${c}"></i>${n} ${Math.round(v).toLocaleString("fr-FR")} Mo</span>`).join("");
  const nm=Object.keys(mi).length, nz=zones.length;
  $("ocTxt").textContent = nz||nm ? nz+" zone"+(nz>1?"s":"")+(R()?" · "+nm+" massif"+(nm>1?"s":"")+" 3D":"")+" · "+Math.round(all).toLocaleString("fr-FR")+" Mo sur le téléphone" : "Cartes, relief 3D et météo pour partir sans réseau";
  $("zoneNote").textContent="Sans réseau, les cartes des zones téléchargées s'affichent normalement. La météo et les marées demandent du réseau."; }
renderZones();
// Ménage unique : les tuiles mises en cache en « opaque » par les anciennes versions gonflaient l'espace affiché
// (plusieurs Mo comptés par tuile). On les retire, sauf SHOM (sans CORS) et celles des zones téléchargées ; elles
// reviennent en version lisible à la prochaine consultation avec du réseau.
setTimeout(async () => { if(store.get("v_purgeOpaque", false) || !("caches" in window) || !navigator.onLine) return;
  try{ const keep = new Set(); zones.forEach(z => zoneUrls(z).forEach(u => keep.add(u)));
    const c = await caches.open(CN+"tiles"), ks = await c.keys(); let n = 0;
    for(const rq of ks){ if(keep.has(rq.url) || /services\.data\.shom\.fr/.test(rq.url)) continue; const r = await c.match(rq); if(r && r.type === "opaque"){ await c.delete(rq); n++; } }
    store.set("v_purgeOpaque", true); if(n) usageNote(); }catch(e){} }, 8000);
/* ---- Paquets de relief par massif (relief/<id>.bin.gz, préparés par tools-relief.js) ---- */
// Le paquet est décompressé sur le téléphone et chaque tuile est rangée dans navshom-tiles sous son adresse WMS :
// la vue 3D la trouve comme si elle venait du réseau.
let massifs = null, mInst = store.get("massifs", {});
async function massifLoad(){ if(massifs && massifs.length) return massifs; try{ massifs = await (await fetch("relief/massifs.json", {cache:"no-cache"})).json(); }catch(e){ massifs = []; } return massifs; }
function massifUrls(id){ const m = mInst[id], out = []; if(!m) return out; for(let y=0;y<m.ny;y++) for(let x=0;x<m.nx;x++) out.push(v3DemUrl(m.x0+x, m.y0+y)); return out; }
async function massifInstall(m, btn){
  if(!("DecompressionStream" in window) || !("caches" in window)) return toast("Ce navigateur ne permet pas les paquets de relief");
  try{ navigator.storage && navigator.storage.persist && navigator.storage.persist(); }catch(e){}
  btn.disabled = true; btn.textContent = "0 %";
  try{
    const r = await fetch("relief/"+m.id+".bin.gz", {cache:"no-cache"}); if(!r.ok) throw new Error(r.status);
    const total = m.kb*1024, rd = r.body.getReader(), chunks = []; let got = 0;
    for(;;){ const {done, value} = await rd.read(); if(done) break; chunks.push(value); got += value.length; btn.textContent = Math.min(99, Math.round(90*got/total))+" %"; }
    let blob = new Blob(chunks); const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    if(head[0]===0x1f && head[1]===0x8b) blob = await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).blob();
    const buf = await blob.arrayBuffer(), u8 = new Uint8Array(buf), dv = new DataView(buf);
    if(String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== "BRL1") throw new Error("format");
    const x0 = dv.getUint16(4, true), y0 = dv.getUint16(6, true), nx = dv.getUint16(8, true), ny = dv.getUint16(10, true), P = V3DP;
    const c = await caches.open(CN+"tiles"); let o = 12, n = 0;
    for(let ty=0; ty<ny; ty++) for(let tx=0; tx<nx; tx++){
      if(!u8[o++]) continue;
      const t = new Int16Array(buf.slice(o, o+P*P*2)), f = new Float32Array(P*P); o += P*P*2;
      for(let j=0;j<P;j++){ let prev = null; for(let i=0;i<P;i++){ const k = j*P+i, v = t[k];
        if(v === -32768){ f[k] = -99999; prev = null; } else { prev = prev===null ? v : prev+v; f[k] = prev; } } }
      await c.put(v3DemUrl(x0+tx, y0+ty), new Response(f.buffer, {headers:{"Content-Type":"image/x-bil;bits=32"}}));
      if(++n % 20 === 0) btn.textContent = (90+Math.round(10*n/m.tiles))+" %"; }
    mInst[m.id] = {x0, y0, nx, ny, n, d:new Date().toISOString()}; store.set("massifs", mInst); v3KeepLib();
    toast("Relief « "+m.name+" » enregistré : vue 3D sans réseau dans le massif", 4000);
  }catch(e){ toast("Téléchargement du relief impossible ("+e.message+")"); }
  renderMassifs(); usageNote();
}
async function massifDelete(m){
  const keep = new Set(); zones.forEach(z => zoneUrls(z).forEach(u => keep.add(u)));
  Object.keys(mInst).filter(id => id !== m.id).forEach(id => massifUrls(id).forEach(u => keep.add(u)));
  try{ const c = await caches.open(CN+"tiles"); await Promise.all(massifUrls(m.id).filter(u => !keep.has(u)).map(u => c.delete(u))); }catch(e){}
  delete mInst[m.id]; store.set("massifs", mInst); renderMassifs(); usageNote(); toast("Relief « "+m.name+" » supprimé");
}
async function renderMassifs(){ const el = $("massifList"), list = await massifLoad(); el.innerHTML = "";
  if(!list.length){ el.innerHTML = '<p class="note" style="margin:4px 0">Liste des massifs indisponible (réseau ?).</p>'; return; }
  list.forEach(m => { const row = document.createElement("div"), inst = mInst[m.id];
    row.innerHTML = '<span style="flex:1;min-width:0"><b></b><small style="display:block;color:var(--muted);font-size:12px"></small></span><button data-a="see">Voir</button><button data-a="go"></button>';
    row.querySelector("b").textContent = m.name;
    row.querySelector("small").textContent = inst ? "Enregistré le "+new Date(inst.d).toLocaleDateString("fr-FR")+" · "+Math.round(inst.n*64/1024)+" Mo sur le téléphone"
      : (m.kb/1024).toFixed(1).replace(".", ",")+" Mo à télécharger · "+Math.round(m.tiles*64/1024)+" Mo sur le téléphone";
    const go = row.querySelector('[data-a=go]'); go.textContent = inst ? "Supprimer" : "Télécharger"; if(inst) go.style.color = "#C62828";
    go.onclick = () => inst ? (confirm("Supprimer le relief « "+m.name+" » du téléphone ?") && massifDelete(m)) : massifInstall(m, go);
    row.querySelector('[data-a=see]').onclick = () => { closeSheets(); const b = L.latLngBounds([m.b[0], m.b[1]], [m.b[2], m.b[3]]); setFollow(false); map.fitBounds(b);
      const r = L.rectangle(b, {color:"#2E7D32", weight:2, dashArray:"6 6", fill:false, interactive:false}).addTo(map); setTimeout(() => map.removeLayer(r), 4000); };
    el.appendChild(row); }); }
$("cOff").addEventListener("toggle", () => { if($("cOff").open && R()) renderMassifs(); });
initInstruments();
initAis();

/* ================= Météo hors ligne : prévisions 3 jours sur les zones téléchargées ================= */
const WXOFF={};   // id de zone -> {t, types:{type:{pts,series}}, tbl:[{ll,f,m}]}
const wxKey=id=>"/wx/"+id+".json";
export async function wxLoadAll(){ try{ const c=await caches.open(CN+"wx"); for(const zn of zones){ if(WXOFF[zn.id]) continue; const r=await c.match(wxKey(zn.id)); if(r) WXOFF[zn.id]=await r.json(); } }catch(e){} }
function wxTypes(mode){ return mode==="rando" ? ["wind","gust","temp","rain","snowf","frz"] : ["wind","gust","cur","wave","swell","press","rain"]; }
async function wxDownload(zn, onProg){
  const b=L.latLngBounds([zn.b[0],zn.b[1]],[zn.b[2],zn.b[3]]), n=Math.min(11, Math.max(4, Math.round(Math.max(b.getEast()-b.getWest(), b.getNorth()-b.getSouth())/0.05)+1));
  const pts=[]; for(let i=0;i<n;i++) for(let j=0;j<n;j++) pts.push([+(b.getSouth()+(b.getNorth()-b.getSouth())*i/(n-1)).toFixed(4), +(b.getWest()+(b.getEast()-b.getWest())*j/(n-1)).toFixed(4)]);
  const out={t:Date.now(), model, types:{}, tbl:[]}, types=wxTypes(zn.mode); let k=0;
  for(const ty of types){ onProg&&onProg(++k, types.length+1); try{ const r=await fetchSeries(ty, pts, 3); out.types[ty]={pts, series:r.series}; }catch(e){} }
  onProg&&onProg(types.length+1, types.length+1);
  const tp=[]; for(let i=0;i<3;i++) for(let j=0;j<3;j++) tp.push([+(b.getSouth()+(b.getNorth()-b.getSouth())*(i+.5)/3).toFixed(3), +(b.getWest()+(b.getEast()-b.getWest())*(j+.5)/3).toFixed(3)]);
  try{ const la=tp.map(p=>p[0]).join(","), lo=tp.map(p=>p[1]).join(",");
    let f=await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=temperature_2m,weather_code,is_day,precipitation,cloud_cover,visibility,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,snowfall,freezing_level_height&daily=sunrise,sunset&wind_speed_unit=kn&timezone=auto&forecast_days=3`);
    let m=zn.mode==="rando"?null:await getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${la}&longitude=${lo}&hourly=wave_height,wave_direction,swell_wave_height,ocean_current_velocity,ocean_current_direction,sea_surface_temperature&timezone=auto&forecast_days=3&cell_selection=sea`).catch(()=>null);
    if(!Array.isArray(f)) f=[f]; if(m && !Array.isArray(m)) m=[m];
    tp.forEach((p,i)=>out.tbl.push({ll:p, f:f[i], m:m?m[i]:null})); }catch(e){}
  if(!Object.keys(out.types).length) throw new Error("wx");
  const c=await caches.open(CN+"wx"); await c.put(wxKey(zn.id), new Response(JSON.stringify(out),{headers:{"Content-Type":"application/json"}}));
  WXOFF[zn.id]=out; zn.wx=out.t; store.set("zones",zones); return out; }
// cherche une série hors ligne pour un point (zone qui le contient, point le plus proche)
export function wxNearest(type, p){ let best=null, bd=1e9;
  for(const id in WXOFF){ const o=WXOFF[id], T=o.types[type]; if(!T) continue; const zn=zones.find(z=>String(z.id)===String(id)); if(!zn) continue;
    T.pts.forEach((q,i)=>{ const d=(q[0]-p[0])**2+((q[1]-p[1])*Math.cos(p[0]*Math.PI/180))**2; if(d<bd){ bd=d; best={s:T.series[i], t:o.t}; } }); }
  return bd<0.04 ? best : null; } // jusqu'à ~20 km de la zone
export function wxTableNearest(p){ let best=null, bd=1e9; for(const id in WXOFF){ (WXOFF[id].tbl||[]).forEach(x=>{ const d=(x.ll[0]-p.lat)**2+(x.ll[1]-p.lng)**2; if(d<bd && d<0.25){ bd=d; best={...x, t:WXOFF[id].t}; } }); } return best; }
wxLoadAll();

/* Menu Plus : tuiles qui ouvrent une rubrique, résumés à jour */
document.querySelectorAll("#sMenu [data-open]").forEach(b=>b.onclick=()=>{ const d=$(b.dataset.open); d.open=true; setTimeout(()=>d.scrollIntoView({behavior:"smooth",block:"start"}),50); });
function hubRefresh(){ try{ $("hbOff").textContent = zones.length ? zones.length+" zone"+(zones.length>1?"s":"")+" enregistrée"+(zones.length>1?"s":"") : "Cartes et météo";
  $("hbAis").textContent = AIS.on ? (AIS.ships.size? AIS.ships.size+" navire"+(AIS.ships.size>1?"s":"") : "Activé") : "Désactivé"; }catch(e){} }
$("bMenu").addEventListener("click", hubRefresh);
initPluie();
/* ================= Surimpressions Rando (sentiers, courbes, cadastre, forêts) ================= */
const RANDO_OVL={
  trails:  L.tileLayer("https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png", {maxZoom:19, maxNativeZoom:17, zIndex:420, opacity:.85, attribution:'Sentiers © <a href="https://hiking.waymarkedtrails.org" target="_blank" rel="noopener">Waymarked Trails</a>, OSM'}),
  contour: L.tileLayer(geopf("ELEVATION.CONTOUR.LINE","image/png"), {maxZoom:19, maxNativeZoom:18, zIndex:410, bounds:FRANCE, attribution:"Courbes © IGN"}),
  cadastre:L.tileLayer(geopf("CADASTRALPARCELS.PARCELLAIRE_EXPRESS","image/png"), {minZoom:14, maxZoom:19, maxNativeZoom:19, zIndex:415, bounds:FRANCE, attribution:"Cadastre © IGN/DGFiP"}),
  geol: L.layerGroup([
    L.tileLayer(geopf("BRGM_SCAN_F_GEOL1M","image/jpeg"), {crossOrigin:true, maxZoom:12, maxNativeZoom:11, opacity:.8, zIndex:404, bounds:FRANCE, attribution:"Géologie © BRGM"}),
    L.tileLayer(geopf("BRGM_SCAN_D_GEOL50","image/jpeg"), {crossOrigin:true, minZoom:13, maxZoom:19, maxNativeZoom:15, opacity:.8, zIndex:404, bounds:FRANCE, attribution:"Géologie © BRGM"})]),
  forest:  L.tileLayer(geopf("LANDCOVER.FORESTINVENTORY.V2","image/png"), {crossOrigin:true, maxZoom:19, maxNativeZoom:16, zIndex:405, opacity:.55, bounds:FRANCE, attribution:"Forêts © IGN"})};
function randoOvlApply(){ document.querySelectorAll("input.ovl").forEach(cb=>{ const ly=RANDO_OVL[cb.dataset.k]; cb.checked=store.get("ovl_"+cb.dataset.k,false);
  (cb.checked && R()) ? ly.addTo(map) : map.removeLayer(ly); if(cb.dataset.k==="forest"){ $("forLeg").hidden=!cb.checked; if(!(cb.checked&&R())) $("forFloat").hidden=true; } if(cb.dataset.k==="geol"){ $("geolNote").hidden=!cb.checked; $("geolOpRow").hidden=!cb.checked; if(!(cb.checked&&R())) $("geoFloat").hidden=true; } }); }
document.querySelectorAll("input.ovl").forEach(cb=>cb.onchange=()=>{ store.set("ovl_"+cb.dataset.k,cb.checked); randoOvlApply(); });
$("geolOp").value=store.get("geolOp",80); const geolOp=()=>RANDO_OVL.geol.eachLayer(l=>l.setOpacity(+$("geolOp").value/100)); geolOp();
$("geolOp").oninput=()=>{ store.set("geolOp",+$("geolOp").value); geolOp(); };
randoOvlApply();
/* Légende dynamique des forêts : seulement les essences visibles à l'écran, avec leur part */
const FOR_COL=["#E5C45D", "#008C4D", "#004D2E", "#668040", "#00FF80", "#40FF1C", "#915633", "#AFCA59", "#00D92F", "#8080FF", "#BF26FF", "#9926FF", "#4D33FF", "#FF1AFF", "#734DE6", "#A666FF", "#D999FF", "#1AE6E6", "#4D80FF", "#3399FF", "#00929F", "#59FFFF", "#404DFF", "#FF6633", "#FF4033", "#B3B3B3", "#CCFFBF", "#99B3CC", "#FFD138", "#FFFF00", "#FFE6BF", "#FFF9A5"], FOR_LAB=["Fermée, sans arbres (coupe)", "Feuillus en îlots", "Chênes à feuilles caduques", "Chênes verts", "Hêtre", "Châtaignier", "Robinier", "Autre feuillu", "Mélange de feuillus", "Conifères en îlots", "Pin maritime", "Pin sylvestre", "Pin laricio ou noir", "Pin d'Alep", "Pin à crochets ou cembro", "Autre pin", "Mélange de pins", "Sapin ou épicéa", "Mélèze", "Douglas", "Mélange d'autres conifères", "Autre conifère", "Mélange de conifères", "Mixte, feuillus dominants", "Mixte, conifères dominants", "Ouverte sans arbres", "Ouverte, feuillus", "Ouverte, conifères", "Ouverte, mixte", "Peupleraie", "Lande", "Formation herbacée"];
const FOR_RGB=FOR_COL.map(h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)));
let forT=null; const forCv=document.createElement("canvas"); forCv.width=forCv.height=64;
function forScan(){ const box=$("forFloat"), ly=RANDO_OVL.forest; if(!R() || !map.hasLayer(ly)){ box.hidden=true; return; }
  const cnt=new Array(FOR_COL.length).fill(0), g=forCv.getContext("2d",{willReadFrequently:true}), vb=map.getBounds(); let tot=0;
  Object.values(ly._tiles||{}).forEach(t=>{ const im=t.el; if(!im || !im.complete || !im.naturalWidth) return;
    const b=ly._tileCoordsToBounds(t.coords); if(!vb.intersects(b)) return;
    try{ g.clearRect(0,0,64,64); g.drawImage(im,0,0,64,64); const d=g.getImageData(0,0,64,64).data;
      for(let i=0;i<d.length;i+=4){ if(d[i+3]<128) continue; let best=-1, bd=60;
        for(let k=0;k<FOR_RGB.length;k++){ const c=FOR_RGB[k], e=Math.abs(c[0]-d[i])+Math.abs(c[1]-d[i+1])+Math.abs(c[2]-d[i+2]); if(e<bd){ bd=e; best=k; } }
        if(best>=0){ cnt[best]++; tot++; } } }catch(e){} });
  if(!tot){ box.hidden=true; return; }
  const top=cnt.map((n,k)=>[n,k]).filter(x=>x[0]/tot>=0.02).sort((a,b)=>b[0]-a[0]).slice(0,6);
  box.innerHTML='<b>Forêts à l\'écran</b>'+top.map(([n,k])=>`<span><i style="background:${FOR_COL[k]}"></i>${FOR_LAB[k]}<em>${Math.round(n/tot*100)} %</em></span>`).join("");
  box.hidden=false; }
map.on("moveend zoomend", ()=>{ clearTimeout(forT); forT=setTimeout(forScan,900); clearTimeout(geoT); geoT=setTimeout(geoScan,1000); });
/* Légende géologique indicative : grands types de terrains d'après le code couleur standard des cartes géologiques */
const GEO_CL=[["Quaternaire · alluvions, éboulis","#F3EED2"],["Tertiaire · sables, argiles, molasses","#F2C94C"],["Crétacé · craie, calcaires, marnes","#7CC47C"],["Jurassique · calcaires, marnes","#5DA9E0"],["Trias · grès, argiles, gypse","#B07CC6"],["Granites et roches magmatiques","#E5737A"],["Primaire · schistes, roches anciennes","#A89F91"]];
let geoT=null; const geoCv=document.createElement("canvas"); geoCv.width=geoCv.height=48;
function geoClass(r,g,b){ const mx=Math.max(r,g,b)/255, mn=Math.min(r,g,b)/255, v=mx, s=mx?1-mn/mx:0; if(v<0.3) return -1;
  let h=0; const d=(mx-mn)*255||1; if(mx*255===r) h=((g-b)/d)%6; else if(mx*255===g) h=(b-r)/d+2; else h=(r-g)/d+4; h=(h*60+360)%360; // teinte calculée avant les tests
  if(v>0.93 && s<0.08) return -1; // blanc : pas de donnée
  if(s<0.12) return v>0.86 ? -1 : 6; if(v>0.85 && s<0.25 && h>=30 && h<75) return 0; if(v>0.9 && s<0.2) return -1;
  if(h<20||h>=320) return 5; if(h<38) return s>0.45?5:6; if(h<68) return 1; if(h<165) return 2; if(h<250) return 3; return 4; }
function geoScan(){ const box=$("geoFloat"), grp=RANDO_OVL.geol; if(!R() || !map.hasLayer(grp)){ box.hidden=true; return; }
  const cnt=new Array(GEO_CL.length).fill(0), g=geoCv.getContext("2d",{willReadFrequently:true}), vb=map.getBounds(); let tot=0;
  grp.eachLayer(ly=>{ if(!ly._map) return; Object.values(ly._tiles||{}).forEach(t=>{ const im=t.el; if(!im||!im.complete||!im.naturalWidth) return; if(!vb.intersects(ly._tileCoordsToBounds(t.coords))) return;
    try{ g.drawImage(im,0,0,48,48); const d=g.getImageData(0,0,48,48).data; for(let i=0;i<d.length;i+=4){ const c=geoClass(d[i],d[i+1],d[i+2]); if(c>=0){ cnt[c]++; tot++; } } }catch(e){} }); });
  if(!tot){ box.hidden=true; return; }
  const top=cnt.map((n,k)=>[n,k]).filter(x=>x[0]/tot>=0.04).sort((a,b)=>b[0]-a[0]).slice(0,5);
  const c=map.getCenter(), ancien=(c.lng<-0.6&&c.lat>46.3&&c.lat<49.3)||(c.lat>44.2&&c.lat<46.6&&c.lng>1.4&&c.lng<4.6)||(c.lat>47.6&&c.lat<48.7&&c.lng>6.5&&c.lng<7.5)||(c.lat>49.7&&c.lng>4.3&&c.lng<5.1);
  const nm=k=> ancien && (k===2||k===3||k===1) ? GEO_CL[6][0] : GEO_CL[k][0];
  const merged={}; top.forEach(([n,k])=>{ const key=nm(k); merged[key]=merged[key]||{n:0,c:GEO_CL[ancien&&(k===2||k===3||k===1)?6:k][1]}; merged[key].n+=n; });
  box.innerHTML='<b>Terrains à l\'écran · indicatif</b>'+Object.entries(merged).sort((a,b)=>b[1].n-a[1].n).map(([t,o])=>`<span><i style="background:${o.c}"></i>${t}<em>${Math.round(o.n/tot*100)} %</em></span>`).join("")+'<small>D\'après les couleurs de la carte. Nom exact des roches : infoterre.brgm.fr</small>';
  box.hidden=false; }
// Terrain sous un point touché : on lit le pixel de la tuile géologique affichée
export function geoAt(ll){ const grp=RANDO_OVL.geol; if(!map.hasLayer(grp)) return null; let out=null;
  grp.eachLayer(ly=>{ if(out || !ly._map) return; const z=ly._tileZoom; if(z==null) return; const pt=map.project(ll,z), ts=ly.getTileSize(), cx=Math.floor(pt.x/ts.x), cy=Math.floor(pt.y/ts.y);
    const t=Object.values(ly._tiles||{}).find(t=>t.coords.x===cx && t.coords.y===cy && t.coords.z===z); if(!t||!t.el.complete||!t.el.naturalWidth) return;
    try{ const g=geoCv.getContext("2d",{willReadFrequently:true}), px=Math.floor((pt.x-cx*ts.x)/ts.x*t.el.naturalWidth), py=Math.floor((pt.y-cy*ts.y)/ts.y*t.el.naturalHeight);
      g.clearRect(0,0,48,48); g.drawImage(t.el, px-2, py-2, 5, 5, 0, 0, 5, 5); const d=g.getImageData(0,0,5,5).data, cnt={};
      for(let i=0;i<d.length;i+=4){ const c=geoClass(d[i],d[i+1],d[i+2]); if(c>=0) cnt[c]=(cnt[c]||0)+1; }
      const best=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0]; if(!best) return; const k=+best[0], c=ll;
      const ancien=(c.lng<-0.6&&c.lat>46.3&&c.lat<49.3)||(c.lat>44.2&&c.lat<46.6&&c.lng>1.4&&c.lng<4.6)||(c.lat>47.6&&c.lat<48.7&&c.lng>6.5&&c.lng<7.5)||(c.lat>49.7&&c.lng>4.3&&c.lng<5.1);
      out = ancien && (k===1||k===2||k===3) ? GEO_CL[6][0] : GEO_CL[k][0]; }catch(e){} });
  return out; }
RANDO_OVL.geol.eachLayer(l=>l.on("load", ()=>{ clearTimeout(geoT); geoT=setTimeout(geoScan,300); }));
RANDO_OVL.forest.on("load", ()=>{ clearTimeout(forT); forT=setTimeout(forScan,300); });
initBoussole();
initVentDirect();
initMaregraphes();
/* ================= Refuges, cabanes, points d'eau (refuges.info) ================= */
const REF={layer:L.layerGroup(), key:""};
const REF_T={"refuge gardé":["R","#2E7D32"],"cabane non gardée":["C","#8D6E63"],"gîte d'étape":["G","#6A1B9A"],"point d'eau":["💧","#1E88E5"],"bivouac":["B","#00897B"],"abri sommaire":["A","#8D6E63"]};
async function refLoad(){ if(!map.hasLayer(REF.layer)) return; if(map.getZoom()<11){ REF.layer.clearLayers(); return; }
  const b=map.getBounds(), key=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].map(x=>x.toFixed(3)).join(","); if(key===REF.key) return; REF.key=key;
  try{ const j=await (await fetch("https://www.refuges.info/api/bbox?bbox="+key+"&type_points=all&format=geojson&detail=simple")).json(); REF.layer.clearLayers();
    j.features.forEach(f=>{ const p=f.properties, t=REF_T[p.type.valeur]; if(!t) return; const [lo,la]=f.geometry.coordinates;
      L.marker([la,lo],{icon:L.divIcon({className:"refi",iconSize:[26,26],iconAnchor:[13,13],html:`<b style="background:${t[1]}">${t[0]}</b>`}),zIndexOffset:650}).addTo(REF.layer)
       .bindPopup(`<b>${p.nom}</b><br>${p.type.valeur}${p.coord&&p.coord.alt?" · "+p.coord.alt+" m":""}${p.places&&p.places.valeur?" · "+p.places.valeur+" places":""}<br><a href="${p.lien}" target="_blank" rel="noopener">Fiche refuges.info</a>`); }); }catch(e){ REF.key=""; } }
function refSet(on){ store.set("refuges",on); $("refChk").checked=on; if(on && R()){ REF.layer.addTo(map); REF.key=""; refLoad(); if(map.getZoom()<11) toast("Zoomez pour voir les refuges"); } else map.removeLayer(REF.layer); }
$("refChk").onchange=e=>refSet(e.target.checked); map.on("moveend", ()=>{ clearTimeout(REF.t); REF.t=setTimeout(refLoad,500); });
map.attributionControl.addAttribution('<a href="https://www.refuges.info" target="_blank" rel="noopener">refuges.info</a>');
refSet(store.get("refuges",false));
/* ---------- Vue 3D (Rando) : relief IGN, photo ou carte drapée, traces et repères ---------- */
// Three.js (lib/three.min.js + lib/three-orbit.js) n'est chargé qu'à la première ouverture.
const V3 = { open:false, raf:0, pref: Object.assign({slope:false, exag:1.3, sun:135}, store.get("v3", {})) };
delete V3.pref.tex; // le fond n'est plus mémorisé : il est choisi à chaque ouverture (v3AutoBg)
// Fond choisi tout seul : la carte IGN (ou la photo) si le centre est dans une zone téléchargée, déjà sur le téléphone ;
// sinon « Relief », calculé sur place, sans aucune donnée. Photo et Carte restent à un toucher.
function v3AutoBg(){ const c = map.getCenter(), z = zones.find(z => z.keys && L.latLngBounds([z.b[0],z.b[1]],[z.b[2],z.b[3]]).contains(c) && (z.keys.includes("scan25") || z.keys.includes("ortho")));
  const last = store.get("v3bg", "ortho"); return z ? (z.keys.includes("scan25") ? "scan" : "ortho") : (last==="scan" ? "scan" : "ortho"); }
const v3Low = matchMedia("(pointer:coarse)").matches, v3Mem = navigator.deviceMemory || 4;
const V3N = v3Mem <= 2 ? 192 : v3Low ? 256 : 400;       // côté de la grille du relief (sommets)
const V3T = v3Mem <= 2 ? 1024 : 2048;                    // côté de la texture drapée (pixels)
function v3Script(src){ return new Promise((res, rej) => { const s=document.createElement("script"), t=setTimeout(()=>rej(new Error("moteur 3D indisponible hors ligne")), 20000);
  s.src=src; s.onload=()=>{ clearTimeout(t); res(); }; s.onerror=()=>{ clearTimeout(t); rej(new Error("moteur 3D indisponible hors ligne")); }; document.head.appendChild(s); }); }
// Three.js gardé dans un cache à part (conservé d'une version de l'appli à l'autre) pour ouvrir la 3D hors ligne
const V3LIB = ["lib/three.min.js", "lib/three-orbit.js"];
function v3KeepLib(){ try{ caches.open(CN+"lib").then(async c => { for(const u of V3LIB) if(!(await c.match(u))) await c.add(u); }).catch(()=>{}); }catch(e){} }
async function v3Lib(){ if(!window.THREE) await v3Script(V3LIB[0]); if(!THREE.OrbitControls) await v3Script(V3LIB[1]); v3KeepLib(); }
const v3Dir = d => ["N","NE","E","SE","S","SO","O","NO"][Math.round(((d%360)+360)%360/45)%8];
const v3Fmt = v => v.toFixed(1).replace(".", ",");
// Données en tuiles fixes (grille Web Mercator, comme la carte) : les mêmes adresses reviennent d'une ouverture
// à l'autre, le service worker les garde (cache d'abord) et les zones hors ligne peuvent les télécharger.
const V3O = 20037508.342789244, v3TS = z => 2*V3O/2**z, V3DZ = 13, V3DP = 128; // relief : tuiles z13 de 128 px (≈ 27 m à 45° N)
function v3Tiles(bb, z){ const ts = v3TS(z); return {ts, x0:Math.floor((bb[0]+V3O)/ts), x1:Math.floor((bb[2]+V3O)/ts-1e-9), y0:Math.floor((V3O-bb[3])/ts), y1:Math.floor((V3O-bb[1])/ts-1e-9)}; }
function v3DemUrl(x, y){ const ts = v3TS(V3DZ), x0 = -V3O+x*ts, y1 = V3O-y*ts;
  return `https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES&STYLES=&CRS=EPSG:3857&BBOX=${x0.toFixed(2)},${(y1-ts).toFixed(2)},${(x0+ts).toFixed(2)},${y1.toFixed(2)}&WIDTH=${V3DP}&HEIGHT=${V3DP}&FORMAT=image/x-bil;bits=32`; }
const V3LY = { ortho:()=>bases.ortho, scan:()=>bases.scan25, slope:()=>slopes };   // mêmes tuiles WMTS que la carte
const v3TileUrl = (ly, z, x, y) => L.Util.template(ly._url, L.extend({}, ly.options, {z, x, y, s:"a", r:""}));
// Économie de données : réglage, ou « économiseur de données » / réseau lent signalé par le navigateur
const v3Eco = () => { const c = navigator.connection; return store.get("v3eco", false) || !!(c && (c.saveData || /2g|3g/.test(c.effectiveType||""))); };
// Zoom de la texture : assez pour ≈ V3T pixels sur la zone, plafonné à 14 sur téléphone (≈ 10 m/pixel, comme les zones hors ligne)
function v3TexZ(bb){ const z = Math.floor(Math.log2(V3T/256 * 2*V3O/(bb[2]-bb[0]))); return Math.max(11, Math.min(z, v3Low ? 14 : 15) - (v3Eco() ? 1 : 0)); }
function v3Proj(b){ const a = L.CRS.EPSG3857.project(b.getSouthWest()), c = L.CRS.EPSG3857.project(b.getNorthEast()); return [a.x, a.y, c.x, c.y]; }
// Adresses à télécharger pour une zone hors ligne : relief (zone + 5 km de marge) et photo au zoom 14
function v3ZoneUrls(b){ const out = [], lat = b.getCenter().lat, dy = .045, dx = .045/Math.cos(lat*Math.PI/180);
  const pb = L.latLngBounds([b.getSouth()-dy, b.getWest()-dx], [b.getNorth()+dy, b.getEast()+dx]);
  let r = v3Tiles(v3Proj(pb), V3DZ); for(let y=r.y0;y<=r.y1;y++) for(let x=r.x0;x<=r.x1;x++) out.push(v3DemUrl(x, y));
  const dem = out.length; r = v3Tiles(v3Proj(b), 14); for(let y=r.y0;y<=r.y1;y++) for(let x=r.x0;x<=r.x1;x++) out.push(v3TileUrl(bases.ortho, 14, x, y));
  out.dem = dem; return out; }
// Nombre de tuiles 3D d'une zone (sans fabriquer les adresses) ; au-delà de V3DL_MAX, on renvoie vers les paquets par massif
const V3DL_MAX = 3000;
function v3ZoneCount(b){ const lat = b.getCenter().lat, dy = .045, dx = .045/Math.cos(lat*Math.PI/180), n = r => (r.x1-r.x0+1)*(r.y1-r.y0+1);
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
initVersion();
// Accès depuis la console et pour les tests automatiques (Playwright, tools-check.js)
Object.assign(window, { $, map, RT, fixTl, crowdCheck });

// pour les autres modules (une variable importée ne peut pas être modifiée directement)
export function setMProfT(v){ mProfT = v; return v; }
