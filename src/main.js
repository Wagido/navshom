import { $, CN, bearing, compass, dm, fmtDur, fmtLL, fmtNM, fmtT, pad3, store, toast } from "./utils.js";
import { AREA, FRANCE, MODE, R, baseKey, bases, curBase, fmtD, geopf, initCarte, map, seamarks, setCurBase, setMODE, slopes } from "./carte/carte.js";
import { closeSheets, initPanneaux, markTmp, openSheet, tmpMarker } from "./ui/panneaux.js";
import { initGps, last, setFollow, sogNow, trackLine } from "./gps/gps.js";
import { initPoint, mobMk, pointLL, wps } from "./carte/point.js";
import { drawMeasure, initMesure, mPts, measuring, stopMeasure } from "./carte/mesure.js";
import { OVT, drawOverlay, fetchSeries, getJSON, initCalques, model, ov, setOverlay } from "./meteo/calques.js";
import { crowdCheck, fixTl, initTableau, loadTable, tbl } from "./meteo/tableau.js";
import { colorAt, initParticules } from "./meteo/particules.js";
import { initMasque, landFrac } from "./meteo/masque.js";
import { initPrevisions, unsuffix } from "./meteo/previsions.js";
import { initRecherche } from "./ui/recherche.js";
import { LNotif, alarmSound, audioCtx, geoStart, hideAlarm, initNatif, notify, setAudioCtx, showAlarm, unlockAudio } from "./gps/natif.js";
import { initSauvegarde, saveFile } from "./ui/sauvegarde.js";
import { autoSatCheck, autoSatOn, initFonds, setShade, setSlopes, shade } from "./carte/fonds.js";
import { initReglages, wake } from "./ui/reglages.js";
import { initPluie } from "./meteo/pluie.js";
import { initBoussole } from "./carte/boussole.js";
import { LW, initVentDirect, lwDraw } from "./meteo/vent-direct.js";
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

/* ================= Courbe courant + marée en un point ================= */
export const cv = {data:null, sel:0, now:0, ll:null};
export async function showCurve(ll){
  cv.ll=ll; markTmp(ll); openSheet("sCurve"); showOfficialTide(ll); if(tmpMarker) {} // le point reste visible
  $("cvTitle").textContent = "Courant et marée · "+dm(ll.lat,"N","S").replace(/\.\d+'/,"'")+" "+dm(ll.lng,"E","W").replace(/\.\d+'/,"'");
  $("cvBody").hidden=true; $("cvMsg").hidden=false; $("cvMsg").textContent="Chargement…";
  try{
    const j = await getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${ll.lat.toFixed(3)}&longitude=${ll.lng.toFixed(3)}&hourly=ocean_current_velocity,ocean_current_direction,sea_level_height_msl&timezone=auto&forecast_days=3&cell_selection=sea`);
    const h=j.hourly, now=Date.now(); let best=1e15, ni=0; h.time.forEach((t,i)=>{ const d=Math.abs(new Date(t)-now); if(d<best){best=d;ni=i;} });
    const a=Math.max(0,ni-4), b=Math.min(h.time.length,a+31), cut=x=>(x||[]).slice(a,b);
    cv.data={time:cut(h.time), cur:cut(h.ocean_current_velocity).map(x=>x==null?null:x/1.852), dir:cut(h.ocean_current_direction), sea:cut(h.sea_level_height_msl)};
    cv.now=ni-a;
    cv.sel = ov.data ? Math.min(h.time.length-1, Math.max(0, h.time.indexOf(ov.data[0].time[ov.idx]))) : cv.now;
    if(cv.sel<0) cv.sel=cv.now;
    $("cvMsg").hidden=true; $("cvBody").hidden=false; drawCurve();
  }catch(e){ $("cvMsg").textContent="Données indisponibles (réseau ?)"; }
}
function extrema(a){ const out=[]; for(let i=1;i<a.length-1;i++){ if(a[i]==null||a[i-1]==null||a[i+1]==null) continue;
  if(a[i]>=a[i-1]&&a[i]>a[i+1]) out.push({i,hi:true}); else if(a[i]<=a[i-1]&&a[i]<a[i+1]) out.push({i,hi:false}); } return out; }
// interpolation parabolique de l'heure exacte de PM/BM
function refine(a,i){ const y0=a[i-1],y1=a[i],y2=a[i+1], den=y0-2*y1+y2; if(!den) return {dt:0,v:y1}; const dt=.5*(y0-y2)/den; return {dt, v:y1-.25*(y0-y2)*dt}; }
const CVPAD={l:34,r:38};
// tracé lissé (courbe passant par les points)
function smoothPath(g, P){ if(!P.length) return; g.moveTo(P[0][0],P[0][1]);
  for(let i=0;i<P.length-1;i++){ const p0=P[i-1]||P[i], p1=P[i], p2=P[i+1], p3=P[i+2]||p2;
    g.bezierCurveTo(p1[0]+(p2[0]-p0[0])/6, p1[1]+(p2[1]-p0[1])/6, p2[0]-(p3[0]-p1[0])/6, p2[1]-(p3[1]-p1[1])/6, p2[0], p2[1]); } }
export function drawCurve(){
  const d=cv.data; if(!d) return;
  const c=$("cvGraph"), dpr=window.devicePixelRatio||1, W=c.clientWidth, H=c.clientHeight; if(!W) return;
  c.width=W*dpr; c.height=H*dpr; const g=c.getContext("2d"); g.scale(dpr,dpr);
  const n=d.time.length, L0=CVPAD.l, R0=W-CVPAD.r, X=i=>L0+i*(R0-L0)/(n-1), cw=(R0-L0)/(n-1);
  // zones : marée (haut) puis courant (bas)
  const T={top:30,bot:Math.round(H*0.52)}, C={top:Math.round(H*0.62),bot:H-34}, AR=H-24, HX=H-6;
  const font=w=>`${w} 10px Inter,system-ui,sans-serif`; g.font=font(500); g.textBaseline="alphabetic";
  // fond nuit + jours + heures
  d.time.forEach((t,i)=>{ const dt=new Date(t), hr=dt.getHours();
    if(hr>=21||hr<7){ g.fillStyle="rgba(0,0,0,.22)"; g.fillRect(X(i)-cw/2,14,cw+.5,C.bot-14); }
    if(hr===0){ g.strokeStyle="rgba(255,255,255,.25)"; g.lineWidth=1; g.beginPath(); g.moveTo(X(i),12); g.lineTo(X(i),C.bot); g.stroke();
      g.fillStyle="#fff"; g.textAlign="left"; g.font=font(600); g.fillText(dt.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric"}),X(i)+4,10); g.font=font(500); }
    if(hr%3===0){ g.fillStyle="#7f9cc0"; g.textAlign="center"; g.fillText(String(hr).padStart(2,"0")+"h",X(i),HX); } });
  // --- marée ---
  const sv=d.sea.filter(v=>v!=null), hasSea=sv.length>1;
  g.textAlign="left"; g.fillStyle="#9fc0e6"; g.font=font(600); g.fillText("Marée", 2, T.top-16); g.font=font(500);
  if(hasSea){
    let lo=Math.min(...sv), hi=Math.max(...sv); const padv=(hi-lo)*0.12||0.5; lo-=padv; hi+=padv;
    const Y=v=>T.bot-(v-lo)/(hi-lo)*(T.bot-T.top), P=[]; d.sea.forEach((v,i)=>{ if(v!=null) P.push([X(i),Y(v)]); });
    g.beginPath(); smoothPath(g,P); g.lineTo(P[P.length-1][0],T.bot); g.lineTo(P[0][0],T.bot); g.closePath();
    const gr=g.createLinearGradient(0,T.top,0,T.bot); gr.addColorStop(0,"rgba(90,180,255,.45)"); gr.addColorStop(1,"rgba(90,180,255,.04)"); g.fillStyle=gr; g.fill();
    g.beginPath(); smoothPath(g,P); g.strokeStyle="#5ab4ff"; g.lineWidth=2; g.stroke();
    g.fillStyle="#7fb8ef"; g.textAlign="right"; g.fillText((Math.max(...sv)>=0?"+":"")+Math.max(...sv).toFixed(1)+" m", W-2, Y(Math.max(...sv))+3); g.fillText(Math.min(...sv).toFixed(1)+" m", W-2, Y(Math.min(...sv))+3);
    extrema(d.sea).forEach(e=>{ const r=refine(d.sea,e.i), x=X(e.i+r.dt), y=Y(r.v), t=new Date(new Date(d.time[e.i]).getTime()+r.dt*3600e3);
      g.fillStyle="#fff"; g.beginPath(); g.arc(x,y,2.6,0,7); g.fill();
      const lab=(e.hi?"PM ":"BM ")+t.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
      g.textAlign="center"; g.font=font(600); g.fillStyle="#fff"; const lx=Math.min(Math.max(x,L0+26),R0-26);
      g.fillText(lab, lx, e.hi?y-7:y+13); g.font=font(500); });
  } else { g.fillStyle="#9fc0e6"; g.textAlign="center"; g.fillText("Hauteur d'eau non disponible ici", W/2, (T.top+T.bot)/2); }
  // --- courant : barres colorées ---
  const cmax=Math.max(1,...d.cur.filter(v=>v!=null)), Yc=v=>C.bot-v/cmax*(C.bot-C.top);
  g.textAlign="left"; g.fillStyle="#9fc0e6"; g.font=font(600); g.fillText("Courant", 2, C.top-8); g.font=font(500);
  g.fillStyle="#d9a24e"; g.textAlign="right"; g.fillText(cmax.toFixed(1)+" nd", L0-4, C.top+4);
  d.cur.forEach((v,i)=>{ if(v==null) return; const col=colorAt(OVT.cur,v), bw=Math.max(2,cw*0.62);
    g.fillStyle=`rgba(${col[0]|0},${col[1]|0},${col[2]|0},${i===cv.sel?1:.85})`; const y=Yc(v);
    g.beginPath(); g.roundRect ? g.roundRect(X(i)-bw/2,y,bw,C.bot-y,[2,2,0,0]) : g.rect(X(i)-bw/2,y,bw,C.bot-y); g.fill(); });
  g.strokeStyle="rgba(255,255,255,.18)"; g.lineWidth=1; g.beginPath(); g.moveTo(L0-cw/2,C.bot+.5); g.lineTo(R0+cw/2,C.bot+.5); g.stroke();
  // flèches de direction (toutes les 2 h)
  for(let i=0;i<n;i+=2){ if(d.dir[i]==null||d.cur[i]==null) continue; g.save(); g.translate(X(i),AR); g.rotate(d.dir[i]*Math.PI/180);
    g.fillStyle="#cfe3ff"; g.beginPath(); g.moveTo(0,-5); g.lineTo(3.5,4); g.lineTo(0,2); g.lineTo(-3.5,4); g.closePath(); g.fill(); g.restore(); }
  // maintenant + heure choisie
  g.strokeStyle="#3fd18b"; g.lineWidth=1.5; g.setLineDash([3,3]); g.beginPath(); g.moveTo(X(cv.now),14); g.lineTo(X(cv.now),C.bot); g.stroke(); g.setLineDash([]);
  g.strokeStyle="#FF7A00"; g.lineWidth=1.5; g.beginPath(); g.moveTo(X(cv.sel),14); g.lineTo(X(cv.sel),C.bot); g.stroke();
  // infos
  const i=cv.sel, cu=d.cur[i], se=d.sea[i], se2=d.sea[i+1]??null, se0=d.sea[i-1]??null;
  $("cvTime").textContent = fmtT(d.time[i]) + (i===cv.now ? " · maintenant" : "");
  $("cvCur").textContent = cu==null ? "—" : cu.toFixed(1)+" nd"; $("cvDir").textContent = cu==null ? "" : "vers "+pad3(d.dir[i])+"° "+compass(d.dir[i]);
  $("cvSea").textContent = se==null ? "—" : (se>=0?"+":"")+se.toFixed(2)+" m";
  $("cvTrend").textContent = se==null ? "" : ((se2!=null?se2:se) > (se0!=null?se0:se) ? "▲ monte" : "▼ descend");
}
(function(){ const w=$("cvWrap"); let down=false;
  const pick = ev => { if(!cv.data) return; const r=w.getBoundingClientRect(), x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left, padL=CVPAD.l, padR=CVPAD.r, n=cv.data.time.length;
    cv.sel=Math.max(0,Math.min(n-1,Math.round((x-padL)/(r.width-padL-padR)*(n-1)))); drawCurve();
    if(ov.data){ const k=ov.data[0].time.indexOf(cv.data.time[cv.sel]); if(k>=0 && k!==ov.idx){ ov.idx=k; $("tSlider").value=k; drawOverlay(); } } };
  w.addEventListener("pointerdown", e=>{ down=true; w.setPointerCapture(e.pointerId); pick(e); });
  w.addEventListener("pointermove", e=>{ if(down) pick(e); });
  w.addEventListener("pointerup", ()=>down=false); w.addEventListener("pointercancel", ()=>down=false);
})();
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

/* ---------- Alarme de mouillage ---------- */
export let anchor = store.get("anchor", null), anchorLayer=L.layerGroup(), anchorAlarmOn=false, anchorSnooze=0, lastFixT=Date.now();
if(!R()) anchorLayer.addTo(map);
const anchorIcon = L.divIcon({className:"", iconSize:[30,30], iconAnchor:[15,15], html:'<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="12" r="11" fill="#0b2f5b" stroke="#fff" stroke-width="2"/><path d="M12 6v11M8.5 9h7M7 13.5a5 5 0 0 0 10 0" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="12" cy="5.5" r="1.4" fill="#fff"/></svg>'});
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
function anchorTick(ll, c){
  lastFixT=Date.now(); if(!anchor) return;
  const d=map.distance(ll,[anchor.lat,anchor.lng]), out = d > anchor.r && c.accuracy < 60;
  if(out && Date.now()>anchorSnooze){
    if(!anchorAlarmOn || Date.now()-(anchorTick.n||0)>30e3){ anchorTick.n=Date.now(); anchorAlarmOn=true; drawAnchor(); notify("⚓ Alarme de mouillage", "Le bateau est à "+Math.round(d)+" m de l'ancre (rayon "+anchor.r+" m)"); }
    showAlarm("ALARME DE MOUILLAGE · "+Math.round(d)+" m de l'ancre (rayon "+anchor.r+" m)"); alarmSound(true); if(navigator.vibrate) navigator.vibrate([500,200,500]);
  } else if(!out && anchorAlarmOn){ anchorAlarmOn=false; hideAlarm(); drawAnchor(); }
  if(!$("sAnchor").hidden) renderAnchor();
}
setInterval(()=>{ if(anchor && Date.now()-lastFixT>120e3 && Date.now()>anchorSnooze){ showAlarm("Plus de signal GPS depuis "+Math.round((Date.now()-lastFixT)/60e3)+" min · surveillance du mouillage interrompue"); } }, 30e3);
drawAnchor();

/* ---------- Routes et navigation vers les waypoints ---------- */
export let routes = store.get("routes", []), navR = store.get("navR", null); // navR = {id, leg, from:[lat,lng]}
const routeLayer = L.layerGroup().addTo(map);
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
const hhmm = ms => new Date(ms).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
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
  if(!R() && Math.abs(x)>185 && Date.now()-xteWarnT>3*60e3){ xteWarnT=Date.now(); notify("Hors de la route", "Écart "+fmtD(Math.abs(x))+(x>0?" à droite":" à gauche")+" : revenez au "+pad3(brg)+"°"); try{ navigator.vibrate&&navigator.vibrate([200,100,200]); }catch(e){} }
  $("ncEta").textContent = "arrivée WP "+eta+" · fin "+etaEnd+" ("+fmtD(rest)+")";
}
function startNav(id){
  const rt=routes.find(r=>r.id===id); if(!rt) return;
  navR={id, leg:0, from: last?[last.ll.lat,last.ll.lng]:null}; store.set("navR",navR); drawRoute(); closeSheets(); geoStart();
  setFollow(true); if(last) navTick(last.ll); toast("Navigation vers "+(rt.pts[0][2]||"WP1"));
}
$("ncPrev").onclick=()=>{ if(!navR) return; navR.leg=Math.max(0,navR.leg-1); store.set("navR",navR); drawRoute(); if(last) navTick(last.ll); };
$("ncNext").onclick=()=>{ const rt=navR&&routes.find(r=>r.id===navR.id); if(!rt) return; navR.leg=Math.min(rt.pts.length-1,navR.leg+1); store.set("navR",navR); drawRoute(); if(last) navTick(last.ll); };
$("ncStop").onclick=()=>{ navR=null; store.set("navR",null); drawRoute(); toast("Navigation arrêtée"); };
function saveRouteFromMeasure(){
  if(mPts.length<2) return toast("Posez au moins deux points");
  const def=(R()?"Itinéraire":"Route")+" du "+new Date().toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
  const name=def+" ("+fmtD(mPts.reduce((a,p,i)=>i?a+map.distance(mPts[i-1],p):0,0))+")";
  const geom = R() && $("mTrail").checked ? measureGeom() : null;
  routes.unshift({id:Date.now(), name, pts:mPts.map((p,i)=>[+p.lat.toFixed(6),+p.lng.toFixed(6),"WP"+(i+1)]), geom: geom?geom.map(p=>[+p[0].toFixed(5),+p[1].toFixed(5)]):null});
  store.set("routes",routes); renderRoutes(); toast("Route « "+name+" » enregistrée : Plus › Routes");
}
$("mSaveRoute").onclick = saveRouteFromMeasure;
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
drawRoute();

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

/* ---------- Marées officielles SHOM (vignette officielle) ---------- */
const PORTS = [
  ["DUNKERQUE","Dunkerque",51.05,2.37],["CALAIS","Calais",50.97,1.87],["BOULOGNE-SUR-MER","Boulogne-sur-Mer",50.73,1.58],["DIEPPE","Dieppe",49.93,1.08],
  ["FECAMP","Fécamp",49.77,0.37],["LE_HAVRE","Le Havre",49.48,0.11],["HONFLEUR","Honfleur",49.42,0.23],["OUISTREHAM","Ouistreham",49.29,-0.25],
  ["CHERBOURG","Cherbourg",49.65,-1.63],["GOURY","Goury",49.71,-1.95],["DIELETTE","Diélette",49.55,-1.86],["CARTERET","Carteret",49.37,-1.80],
  ["ILES_CHAUSEY","Îles Chausey",48.87,-1.82],["SAINT-MALO","Saint-Malo",48.64,-2.03],["SAINT-CAST","Saint-Cast",48.64,-2.25],["ERQUY_PORT","Erquy",48.64,-2.47],
  ["SAINT-QUAY-PORTRIEUX","Saint-Quay-Portrieux",48.65,-2.83],["PAIMPOL","Paimpol",48.79,-3.04],["PLOUMANACH","Ploumanac'h",48.83,-3.49],["TREBEURDEN","Trébeurden",48.77,-3.58],
  ["ROSCOFF","Roscoff",48.72,-3.97],["ABER_WRAC_H","L'Aber Wrac'h",48.60,-4.56],["LE_CONQUET","Le Conquet",48.36,-4.78],["BREST","Brest",48.38,-4.49],
  ["CAMARET-SUR-MER","Camaret-sur-Mer",48.28,-4.60],["DOUARNENEZ","Douarnenez",48.10,-4.33],["AUDIERNE","Audierne",48.02,-4.54],["LE_GUILVINEC","Le Guilvinec",47.79,-4.28],
  ["CONCARNEAU","Concarneau",47.87,-3.91],["PORT-TUDY","Port-Tudy (Groix)",47.64,-3.45],["LE_PALAIS","Le Palais (Belle-Île)",47.35,-3.15],["LA_TRINITE-SUR-MER","La Trinité-sur-Mer",47.58,-3.03],
  ["PORT-NAVALO","Port-Navalo",47.55,-2.92],["LE_CROUESTY","Le Crouesty",47.54,-2.90],["LE_CROISIC","Le Croisic",47.30,-2.52],["SAINT-NAZAIRE","Saint-Nazaire",47.27,-2.20],
  ["PORNIC","Pornic",47.11,-2.11],["PORT-JOINVILLE","Port-Joinville (Yeu)",46.73,-2.35],["LES_SABLES-D_OLONNE","Les Sables-d'Olonne",46.50,-1.79],["LA_ROCHELLE-PALLICE","La Rochelle - La Pallice",46.16,-1.22],
  ["ILE_D_AIX","Île d'Aix",46.01,-1.17],["ROYAN","Royan",45.62,-1.03],["PORT-BLOC","Pointe de Grave",45.57,-1.06],["CAP_FERRET","Cap Ferret",44.63,-1.25],
  ["ARCACHON_EYRAC","Arcachon",44.66,-1.16],["BOUCAU-BAYONNE","Boucau-Bayonne",43.53,-1.52],["SOCOA","Saint-Jean-de-Luz",43.39,-1.68],
  ["PORT-VENDRES","Port-Vendres",42.52,3.11],["SETE","Sète",43.40,3.70],["MARSEILLE","Marseille",43.30,5.35],["TOULON","Toulon",43.12,5.92],
  ["NICE","Nice",43.69,7.29],["MONACO","Monaco",43.73,7.42],["AJACCIO","Ajaccio",41.92,8.76],["BASTIA","Bastia",42.70,9.45],["CALVI","Calvi",42.57,8.76],
  ["BONIFACIO","Bonifacio",41.39,9.16],["SAINT_HELIER","Saint-Hélier (Jersey)",49.18,-2.12]
];
function portsNear(ll){ return PORTS.map(p=>({id:p[0],name:p[1],d:map.distance(ll,[p[2],p[3]])})).sort((a,b)=>a.d-b.d); }
let tidePort=null;
function showOfficialTide(ll, portId){
  const list=portsNear(ll).slice(0,8), sel=$("tidePort"); sel.innerHTML="";
  list.forEach(p=>{ const o=document.createElement("option"); o.value=p.id; o.textContent=p.name+" · "+fmtD(p.d); sel.appendChild(o); });
  tidePort = portId || list[0].id; sel.value=tidePort; renderTideWidget();
}
function renderTideWidget(){
  const box=$("tideBox"), W=box.clientWidth||360, sc=Math.min(1, W/675);
  box.innerHTML=""; box.style.height=Math.round(900*sc)+"px";
  if(!navigator.onLine){ box.style.height="auto"; box.innerHTML='<p class="note" style="color:#9fc0e6">Hors ligne : les marées officielles demandent du réseau.</p>'; return; }
  // cadre « data: » : origine isolée de l'app (pas d'accès à vos données), mais la vignette SHOM peut créer son propre cadre
  const f=document.createElement("iframe"); f.title="Marées officielles SHOM";
  f.style.cssText=`width:675px;height:900px;border:0;transform:scale(${sc});transform-origin:0 0;background:#fff;border-radius:8px`;
  f.src="data:text/html;charset=utf-8,"+encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff}</style></head><body><script src="https://services.data.shom.fr/hdm/vignette/grande/${encodeURIComponent(tidePort)}?locale=fr"><\/script></body></html>`);
  box.appendChild(f);
}
$("tidePort").onchange=e=>{ tidePort=e.target.value; renderTideWidget(); };
initFonds();
/* ================= Routage météo (isochrones) ================= */
// Polaire de base d'un croiseur : fraction de la vitesse de carène, par angle au vent réel (TWA) et force du vent (TWS, nd)
const POL_TWS=[4,6,8,10,12,14,16,20,25,30];
const POL_BASE={30:[0,0,0,0,0,0,0,0,0,0],
 40:[.25,.38,.48,.56,.62,.65,.67,.68,.66,.62], 52:[.33,.48,.6,.7,.77,.81,.83,.84,.83,.8], 60:[.36,.52,.65,.75,.82,.86,.88,.9,.89,.86],
 75:[.38,.55,.69,.8,.87,.91,.94,.96,.96,.93], 90:[.38,.55,.7,.81,.89,.94,.97,1,1.01,.98], 110:[.37,.54,.69,.8,.88,.94,.98,1.03,1.06,1.04],
 120:[.35,.52,.67,.78,.87,.93,.98,1.04,1.08,1.07], 135:[.31,.47,.61,.73,.82,.89,.95,1.02,1.08,1.08], 150:[.26,.4,.53,.64,.74,.82,.88,.96,1.03,1.05],
 165:[.22,.35,.47,.58,.67,.75,.82,.9,.98,1], 180:[.2,.32,.44,.54,.63,.71,.78,.87,.95,.97]};
const POL_TWA=Object.keys(POL_BASE).map(Number);
const BOATS=[
 {id:"cr7", name:"Petit croiseur 7 m", L:7, type:"cruiser"},
 {id:"cr9", name:"Croiseur côtier 9 m", L:9, type:"cruiser"},
 {id:"cr11", name:"Croiseur 11 m", L:11, type:"cruiser"},
 {id:"cr13", name:"Grand croiseur 13 m", L:13, type:"cruiser"},
 {id:"race12", name:"Voilier de course 12 m (type Class40)", L:12, type:"racer"},
 {id:"cat12", name:"Catamaran de croisière 12 m", L:12, type:"cat"},
 {id:"custom", name:"Personnalisé", L:10, type:"cruiser"},
 {id:"orc", name:"Modèle de série (ORC)…", L:10, type:"cruiser"}];
// Rapport vitesse sans spi / avec spi, médiane des bateaux ayant les deux certificats ORC (lignes = angles, colonnes = vents)
const ORC_TWA=[0, 25, 40, 45, 52, 60, 75, 90, 110, 120, 135, 150, 165, 180], ORC_TWS=[4, 6, 8, 10, 12, 14, 16, 20, 24], NSR={twa:ORC_TWA, tws:ORC_TWS, v:[[1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1],[1,1,1,0.993,0.986,0.986,0.986,0.986,0.972],[1,1,1,1,1,0.987,1,0.987,0.987],[1,1,1,1,1,1,1,1,0.988],[1,1,1,1,1,1,1,1,0.989],[1,1,1,1,1,1,1,1,1],[0.99,0.982,0.981,0.976,0.986,0.987,0.996,1,1],[0.86,0.871,0.89,0.919,0.935,0.942,0.948,0.965,0.979],[0.815,0.839,0.867,0.901,0.922,0.927,0.924,0.928,0.947],[0.788,0.821,0.847,0.873,0.902,0.918,0.917,0.894,0.867],[0.8,0.822,0.841,0.852,0.871,0.892,0.909,0.902,0.886],[0.887,0.886,0.895,0.905,0.912,0.928,0.942,0.95,0.943],[0.947,0.935,0.947,0.954,0.959,0.955,0.966,0.97,0.964]]};
let ORC_DB=null; const orcDb=()=>ORC_DB||(ORC_DB=fetch("lib/polars-orc.json").then(r=>r.json()));
export const RT={boat:store.get("rtBoat","cr11"), orc:store.get("rtOrc",null), spi:store.get("rtSpi",true), L:store.get("rtLen",11), polFile:store.get("rtPolar",null), cur:store.get("rtCur",true),
  start:null, dest:null, layer:L.layerGroup().addTo(map), result:null, busy:false};
const hullSpeed = L => 1.34*Math.sqrt(L*0.9*3.281);   // nœuds, longueur à la flottaison ≈ 90 % de la longueur hors tout
function interp1(xs, ys, x){ if(x<=xs[0]) return ys[0]; for(let i=1;i<xs.length;i++) if(x<=xs[i]){ const f=(x-xs[i-1])/(xs[i]-xs[i-1]); return ys[i-1]+(ys[i]-ys[i-1])*f; } return ys[ys.length-1]; }
function polarTable(twa, tws, tbl){ // interpolation bilinéaire dans une table {twa:[], tws:[], v:[[...]]}
  const a=Math.min(180,Math.abs(twa)); let i=1; while(i<tbl.twa.length-1 && tbl.twa[i]<a) i++;
  const f=Math.max(0,Math.min(1,(a-tbl.twa[i-1])/(tbl.twa[i]-tbl.twa[i-1]||1)));
  return interp1(tbl.tws, tbl.v[i-1], tws)*(1-f)+interp1(tbl.tws, tbl.v[i], tws)*f; }
const BASE_TBL={twa:POL_TWA, tws:POL_TWS, v:POL_TWA.map(a=>POL_BASE[a])};
function boatSpeed(twa, tws){ // nœuds sur l'eau
  if(RT.polFile) return Math.max(0, polarTable(twa, tws, RT.polFile)*(RT.spi?1:polarTable(twa,tws,NSR)));
  if(RT.boat==="orc" && RT.orc){ const o=RT.orc;
    if(RT.spi || !o.ns) return Math.max(0, polarTable(twa, tws, {twa:ORC_TWA, tws:ORC_TWS, v:o.s})*(RT.spi?1:polarTable(twa,tws,NSR)));
    return Math.max(0, polarTable(twa, tws, {twa:ORC_TWA, tws:ORC_TWS, v:o.ns})); }
  return Math.max(0, boatGeneric(twa,tws)*(RT.spi?1:polarTable(twa,tws,NSR))); }
function boatGeneric(twa, tws){
  const b=BOATS.find(x=>x.id===RT.boat)||BOATS[2], Vh=hullSpeed(RT.L), a=Math.abs(twa);
  let k=polarTable(a, tws, BASE_TBL);
  if(b.type==="racer"){ k*=1.12; if(a>95) k*=1+Math.max(0,(tws-14)/16)*.45; if(a<45) k*=1.05; }
  if(b.type==="cat"){ if(a<45) return 0; k*= a<60 ? .88 : a<=145 ? 1.22 : 1.05; }
  return Math.max(0, k*Vh);
}
// Import d'une polaire au format courant (.pol / .csv : 1re ligne = forces de vent, puis une ligne par angle)
function parsePolar(txt){
  const rows=txt.split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("#")).map(l=>l.split(/[\t;,]+|\s+/).filter(Boolean));
  const tws=rows[0].slice(1).map(Number), twa=[], v=[];
  rows.slice(1).forEach(r=>{ const a=Number(r[0]); if(!isFinite(a)) return; twa.push(a); v.push(r.slice(1).map(Number).map(x=>isFinite(x)?x:0)); });
  if(tws.length<2 || twa.length<3 || tws.some(x=>!isFinite(x))) throw new Error("format");
  if(twa[0]>0){ twa.unshift(0); v.unshift(tws.map(()=>0)); } if(twa[twa.length-1]<180){ twa.push(180); v.push(v[v.length-1].slice()); }
  return {twa, tws, v};
}
function drawPolar(){
  const c=$("rtPolar"), dpr=window.devicePixelRatio||1, W=c.clientWidth, H=c.clientHeight; if(!W) return;
  c.width=W*dpr; c.height=H*dpr; const g=c.getContext("2d"); g.scale(dpr,dpr);
  const TW=[6,10,14,20,25], cols=["#90caf9","#26a69a","#ffb300","#fb8c00","#e53935"];
  let vmax=1; TW.forEach(t=>{ for(let a=0;a<=180;a+=5) vmax=Math.max(vmax,boatSpeed(a,t)); });
  const cx=18, cy=H/2, R=Math.min(W-40,H/2-12), sc=R/vmax;
  g.strokeStyle="rgba(13,27,42,.12)"; g.fillStyle="#5d6e80"; g.font="500 10px Inter,system-ui"; g.textAlign="left";
  const vs=vmax>12?4:2; for(let v=vs; v<=vmax; v+=vs){ g.beginPath(); g.arc(cx,cy,v*sc,-Math.PI/2,Math.PI/2); g.stroke(); g.fillText(v+" nd", cx+3, cy+v*sc-2); }
  [45,90,135].forEach(a=>{ const r=a*Math.PI/180; g.beginPath(); g.moveTo(cx,cy); g.lineTo(cx+R*Math.sin(r), cy-R*Math.cos(r)); g.stroke(); g.fillText(a+"°", cx+(R+4)*Math.sin(r), cy-(R+4)*Math.cos(r)); });
  TW.forEach((t,i)=>{ g.beginPath(); for(let a=0;a<=180;a+=3){ const v=boatSpeed(a,t)*sc, r=a*Math.PI/180, x=cx+v*Math.sin(r), y=cy-v*Math.cos(r); a?g.lineTo(x,y):g.moveTo(x,y); }
    g.strokeStyle=cols[i]; g.lineWidth=2; g.stroke(); g.fillStyle=cols[i]; g.fillText(t+" nd", W-48, 14+i*13); });
  g.fillStyle="#0d1b2a"; g.fillText("vent ↓", cx-6, 10);
}
export function renderRouteParams(){
  const b=BOATS.find(x=>x.id===RT.boat)||BOATS[2];
  if(RT.boat==="orc" && RT.orc) RT.L=RT.orc.L;
  $("rtBoat").value=RT.boat; $("rtLen").value=RT.L; $("rtLen").disabled = RT.boat!=="custom";
  $("rtOrcBox").hidden = RT.boat!=="orc"; $("rtSpi").checked=RT.spi;
  if(RT.boat==="orc" && RT.orc && !$("rtOrcQ").value) $("rtOrcQ").placeholder=RT.orc.n+" · changer de modèle…";
  $("rtHull").textContent = "Vitesse de carène ≈ "+hullSpeed(RT.L).toFixed(1)+" nd"+(b.type==="racer"?" (peut surfer au-delà)":"");
  const sp = RT.spi ? " · avec spi" : " · sans spi";
  $("rtPolName").textContent = (RT.polFile ? "Polaire importée ("+RT.polFile.twa.length+" angles × "+RT.polFile.tws.length+" vents)"
    : RT.boat==="orc" ? (RT.orc ? "Polaire ORC « "+RT.orc.n+" » ("+String(RT.orc.L).replace(".",",")+" m), moyenne de "+RT.orc.k+" certificat"+(RT.orc.k>1?"s":"") : "Cherchez votre modèle ci-dessus")
    : "Polaire type « "+(b.type==="cat"?"catamaran":b.type==="racer"?"course":"croisière")+" » ajustée à la longueur") + sp;
  $("rtPolClear").hidden=!RT.polFile; $("rtCur").checked=RT.cur;
  $("rtFrom").textContent = RT.start ? fmtLL(RT.start.lat,RT.start.lng) : (last ? "Position du bateau (GPS)" : "Centre de la carte");
  $("rtTo").textContent = RT.dest ? fmtLL(RT.dest.lat,RT.dest.lng) : "Touchez la carte puis « Routage »";
  requestAnimationFrame(drawPolar);
}
BOATS.forEach(b=>{ const o=document.createElement("option"); o.value=b.id; o.textContent=b.name; $("rtBoat").appendChild(o); });
$("rtBoat").onchange=e=>{ RT.boat=e.target.value; const b=BOATS.find(x=>x.id===RT.boat); if(b.id!=="custom" && b.id!=="orc") RT.L=b.L;
  if(b.id==="orc"){ orcDb().catch(()=>{}); setTimeout(()=>{ if(!RT.orc) $("rtOrcQ").focus(); },50); } store.set("rtBoat",RT.boat); store.set("rtLen",RT.L); renderRouteParams(); };
$("rtLen").oninput=e=>{ const v=parseFloat(String(e.target.value).replace(",",".")); if(v>=3 && v<=40){ RT.L=v; store.set("rtLen",v); renderRouteParams(); } };
$("rtSpi").onchange=e=>{ RT.spi=e.target.checked; store.set("rtSpi",RT.spi); renderRouteParams(); };
$("rtOrcQ").addEventListener("focus", ()=>orcDb().catch(()=>{}));
$("rtOrcQ").oninput=async e=>{ const q=e.target.value.toUpperCase().replace(/[\s\-\.\/]/g,""), el=$("rtOrcRes"); if(q.length<2){ el.innerHTML=""; return; }
  let db; try{ db=await orcDb(); }catch(err){ ORC_DB=null; el.innerHTML='<p class="note">Base ORC indisponible (réseau ?)</p>'; return; }
  const k=n=>n.toUpperCase().replace(/[\s\-\.\/]/g,""), hits=db.m.filter(m=>k(m.n).includes(q)).sort((a,b)=>(k(b.n).startsWith(q))-(k(a.n).startsWith(q))||b.k-a.k).slice(0,8);
  el.innerHTML = hits.length ? "" : '<p class="note">Aucun modèle trouvé. Essayez sans le chantier (ex. « 31.7 ») ou choisissez un modèle type.</p>';
  hits.forEach(m=>{ const r=document.createElement("div"); r.innerHTML='<span style="flex:1;min-width:0"><b></b><small style="display:block;color:var(--muted);font-size:12px"></small></span><button>Choisir</button>';
    r.querySelector("b").textContent=m.n; r.querySelector("small").textContent=String(m.L).replace(".",",")+" m"+(m.b?" · "+m.b:"")+" · "+m.k+" certificat"+(m.k>1?"s":"")+(m.ns?" · version sans spi":"");
    r.onclick=()=>{ RT.orc=m; store.set("rtOrc",m); $("rtOrcQ").value=""; el.innerHTML=""; toast("Polaire « "+m.n+" » chargée"); renderRouteParams(); };
    el.appendChild(r); }); };
$("rtCur").onchange=e=>{ RT.cur=e.target.checked; store.set("rtCur",RT.cur); };
$("rtPolIn").onchange=async e=>{ const f=e.target.files[0]; e.target.value=""; if(!f) return;
  try{ RT.polFile=parsePolar(await f.text()); store.set("rtPolar",RT.polFile); toast("Polaire importée"); }catch(err){ toast("Polaire illisible : 1re ligne = vents (nd), puis une ligne par angle"); } renderRouteParams(); };
$("rtPolClear").onclick=()=>{ RT.polFile=null; store.set("rtPolar",null); renderRouteParams(); };
for(let h=0;h<=48;h+=h<6?1:h<24?3:6){ const o=document.createElement("option"); o.value=h; o.textContent = h===0?"Maintenant":"Dans "+h+" h"; $("rtDep").appendChild(o); }
const rtMarks=L.layerGroup().addTo(map);
export function drawRtMarks(){ rtMarks.clearLayers();
  if(RT.start) L.circleMarker(RT.start,{radius:8,color:"#fff",weight:3,fillColor:"#0b63b6",fillOpacity:1}).bindTooltip("Départ",{permanent:true,direction:"right",className:"mlabel"}).addTo(rtMarks);
  if(RT.dest && !RT.result) L.circleMarker(RT.dest,{radius:8,color:"#fff",weight:3,fillColor:"#1c9e47",fillOpacity:1}).bindTooltip("Arrivée",{permanent:true,direction:"right",className:"mlabel"}).addTo(rtMarks); }
function rtPick(which){ RT.picking=which; closeSheets(); $("pickTxt").textContent = which==="start" ? "Touchez la carte : point de DÉPART" : "Touchez la carte : point d'ARRIVÉE"; $("pickBar").hidden=false; }
$("rtPickS").onclick=()=>rtPick("start"); $("rtPickE").onclick=()=>rtPick("dest");
$("rtGps").onclick=()=>{ RT.start=null; drawRtMarks(); renderRouteParams(); };
$("rtSwap").onclick=()=>{ const s0=RT.start || (last?last.ll:map.getCenter()); if(!RT.dest) return toast("Choisissez d'abord l'arrivée"); RT.start=RT.dest; RT.dest=L.latLng(s0); RT.result=null; RT.layer.clearLayers(); $("rtRes").hidden=true; drawRtMarks(); renderRouteParams(); };
$("pickCancel").onclick=()=>{ RT.picking=null; $("pickBar").hidden=true; openSheet("sRouting"); };
function openRouting(dest){
  if(dest) RT.dest=L.latLng(dest); drawRtMarks(); renderRouteParams(); openSheet("sRouting");
  $("rtRes").hidden=!RT.result;
}
$("aRouting").onclick=()=>{ if(pointLL) openRouting(pointLL); };
$("bRouting").onclick=()=>openRouting(null);

/* ---- Vent et courant sur une grille couvrant le trajet ---- */
async function loadGrid(S,E,kind){
  const pad=Math.max(.08, .35*Math.max(Math.abs(S.lat-E.lat),Math.abs(S.lng-E.lng)));
  const la0=Math.min(S.lat,E.lat)-pad, la1=Math.max(S.lat,E.lat)+pad, lo0=Math.min(S.lng,E.lng)-pad*1.4, lo1=Math.max(S.lng,E.lng)+pad*1.4, n=6, pts=[];
  for(let i=0;i<n;i++) for(let j=0;j<n;j++) pts.push([+(la0+(la1-la0)*i/(n-1)).toFixed(3), +(lo0+(lo1-lo0)*j/(n-1)).toFixed(3)]);
  const la=pts.map(p=>p[0]).join(","), lo=pts.map(p=>p[1]).join(",");
  let j;
  if(kind==="wind"){ const u=`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=kn&timezone=GMT&forecast_days=3`;
    j = await getJSON(u+(model!=="best_match"?`&models=${model}`:"")).catch(()=>getJSON(u)); }
  else j = await getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${la}&longitude=${lo}&hourly=ocean_current_velocity,ocean_current_direction&timezone=GMT&forecast_days=3&cell_selection=sea`);
  if(!Array.isArray(j)) j=[j];
  const times=j[0].hourly.time.map(t=>Date.parse(t+"Z")), U=[], V=[];
  j.forEach(d=>{ const h=unsuffix(d.hourly), sp=kind==="wind"?h.wind_speed_10m:h.ocean_current_velocity, dr=kind==="wind"?h.wind_direction_10m:h.ocean_current_direction;
    U.push(sp.map((s,t)=>{ if(s==null||dr[t]==null) return 0; const v=kind==="wind"?s:s/1.852, to=(kind==="wind"?dr[t]+180:dr[t])*Math.PI/180; return v*Math.sin(to); }));
    V.push(sp.map((s,t)=>{ if(s==null||dr[t]==null) return 0; const v=kind==="wind"?s:s/1.852, to=(kind==="wind"?dr[t]+180:dr[t])*Math.PI/180; return v*Math.cos(to); })); });
  return {la0,la1,lo0,lo1,n,times,U,V};
}
function gridAt(G,lat,lng,t){ // vecteur (est, nord) en nœuds, interpolé en espace et en temps
  const fy=Math.max(0,Math.min(G.n-1.001,(lat-G.la0)/(G.la1-G.la0)*(G.n-1))), fx=Math.max(0,Math.min(G.n-1.001,(lng-G.lo0)/(G.lo1-G.lo0)*(G.n-1)));
  const i=Math.floor(fy), j=Math.floor(fx), dy=fy-i, dx=fx-j;
  const T=G.times, ft=Math.max(0,Math.min(T.length-1.001,(t-T[0])/3600e3)), k=Math.floor(ft), dt=ft-k;
  const at=(A)=>{ const c=(ii,jj)=>A[ii*G.n+jj][k]*(1-dt)+A[ii*G.n+jj][k+1]*dt;
    return c(i,j)*(1-dx)*(1-dy)+c(i,j+1)*dx*(1-dy)+c(i+1,j)*(1-dx)*dy+c(i+1,j+1)*dx*dy; };
  return [at(G.U), at(G.V)];
}
const nm=(a,b)=>map.distance(a,b)/1852;
/* ---- Isochrones ---- */
$("rtGo").onclick=async()=>{
  if(RT.busy) return; if(!RT.dest) return toast("Choisissez l'arrivée : touchez la carte puis « Routage »");
  const S = RT.start || (last ? last.ll : map.getCenter()), E=RT.dest, D=nm(S,E);
  if(D<0.3) return toast("Arrivée trop proche"); if(D>350) return toast("Trajet trop long pour 3 jours de prévisions (max ≈ 350 M)");
  RT.busy=true; $("rtGo").disabled=true; $("rtGo").textContent="Calcul…"; RT.layer.clearLayers();
  try{
    const [W, C] = await Promise.all([loadGrid(S,E,"wind"), RT.cur ? loadGrid(S,E,"cur").catch(()=>null) : Promise.resolve(null)]);
    const dep = Date.now() + (+$("rtDep").value)*3600e3, tEnd = W.times[W.times.length-1];
    // Grille de cases de mer (≈ 60 à 110 cases dans la plus grande dimension), plus court chemin en temps (Dijkstra dépendant du temps)
    const pad=Math.max(.06,.3*Math.max(Math.abs(S.lat-E.lat),Math.abs(S.lng-E.lng)));
    const la0=Math.min(S.lat,E.lat)-pad, la1=Math.max(S.lat,E.lat)+pad, kx=Math.cos((la0+la1)/2*Math.PI/180);
    const lo0=Math.min(S.lng,E.lng)-pad/kx, lo1=Math.max(S.lng,E.lng)+pad/kx;
    const cellNm=Math.max(0.35, Math.max((la1-la0)*60,(lo1-lo0)*60*kx)/110), dLa=cellNm/60, dLo=cellNm/60/kx;
    const NY=Math.ceil((la1-la0)/dLa)+1, NX=Math.ceil((lo1-lo0)/dLo)+1, N=NX*NY;
    const cLat=i=>la0+i*dLa, cLng=j=>lo0+j*dLo, near=(la,ln)=>nm(L.latLng(la,ln),S)<1.5||nm(L.latLng(la,ln),E)<2.5;
    const sea=new Uint8Array(N); for(let i=0;i<NY;i++) for(let j=0;j<NX;j++) sea[i*NX+j] = (landFrac(cLat(i),cLng(j))<0.5 || near(cLat(i),cLng(j))) ? 1 : 0;
    const cellOf=ll=>[Math.round((ll.lat-la0)/dLa), Math.round((ll.lng-lo0)/dLo)];
    const [si,sj]=cellOf(S), [ei,ej]=cellOf(E), sIdx=si*NX+sj, eIdx=ei*NX+ej; sea[sIdx]=1; sea[eIdx]=1;
    const MOVES=[]; for(let di=-3;di<=3;di++) for(let dj=-3;dj<=3;dj++){ if(!di&&!dj) continue; const g=(a,b)=>b?g(b,a%b):Math.abs(a); if(g(di,dj)!==1) continue;
      MOVES.push({di,dj,h:(Math.atan2(dj,di)*180/Math.PI+360)%360, d:Math.hypot(di,dj)*cellNm}); }
    const segSea=(i,j,m)=>{ const n=Math.max(Math.abs(m.di),Math.abs(m.dj))*2; for(let k=1;k<=n;k++){ const fi=i+m.di*k/n, fj=j+m.dj*k/n; const ii=Math.round(fi), jj=Math.round(fj);
      if(ii<0||jj<0||ii>=NY||jj>=NX) return false; if(!sea[ii*NX+jj] && landFrac(la0+fi*dLa, lo0+fj*dLo)>0.5) return false; } return true; };
    const T=new Float64Array(N).fill(Infinity), prev=new Int32Array(N).fill(-1), info=new Array(N);
    T[sIdx]=dep; const heap=[[dep,sIdx]];
    const push=x=>{ heap.push(x); let i=heap.length-1; while(i){ const p=(i-1)>>1; if(heap[p][0]<=heap[i][0]) break; [heap[p],heap[i]]=[heap[i],heap[p]]; i=p; } };
    const pop=()=>{ const top=heap[0], last=heap.pop(); if(heap.length){ heap[0]=last; let i=0; for(;;){ const l=2*i+1, r=l+1; let m=i; if(l<heap.length&&heap[l][0]<heap[m][0]) m=l; if(r<heap.length&&heap[r][0]<heap[m][0]) m=r; if(m===i) break; [heap[m],heap[i]]=[heap[i],heap[m]]; i=m; } } return top; };
    let popped=0;
    while(heap.length){
      const [t,u]=pop(); if(t>T[u]) continue; if(u===eIdx) break; if(t>tEnd) continue;
      const i=Math.floor(u/NX), j=u%NX, la=cLat(i), ln=cLng(j);
      const w=gridAt(W,la,ln,t), tws=Math.hypot(w[0],w[1]), twd=(Math.atan2(w[0],w[1])*180/Math.PI+180+360)%360, c=C?gridAt(C,la,ln,t):null;
      for(const m of MOVES){ const ii=i+m.di, jj=j+m.dj; if(ii<0||jj<0||ii>=NY||jj>=NX) continue; const v=ii*NX+jj; if(!sea[v]) continue;
        const twa=((m.h-twd+540)%360)-180, bs=boatSpeed(twa,tws); if(bs<0.3) continue;
        const r=m.h*Math.PI/180, sog=bs+(c?c[0]*Math.sin(r)+c[1]*Math.cos(r):0); if(sog<0.3) continue;
        const nt=t+m.d/sog*3600e3; if(nt>=T[v]) continue; if(!segSea(i,j,m)) continue;
        T[v]=nt; prev[v]=u; info[v]={bs,twa,tws}; push([nt,v]); }
      if(++popped%4000===0){ $("rtGo").textContent="Calcul… "+fmtDur((t-dep)/3600e3); await new Promise(r=>setTimeout(r)); }
    }
    if(!isFinite(T[eIdx])){ toast("Aucune route trouvée dans la limite des prévisions (3 jours)", 6000); return; }
    const path=[]; for(let v=eIdx; v!==-1; v=prev[v]){ const i=Math.floor(v/NX), j=v%NX; path.push({lat:cLat(i),lng:cLng(j),t:T[v],...(info[v]||{})}); }
    path.reverse(); path[0].lat=S.lat; path[0].lng=S.lng; path[path.length-1].lat=E.lat; path[path.length-1].lng=E.lng;
    // isochrones : contours horaires approximés par les cases atteintes
    const iso=[]; const hrs=Math.ceil((T[eIdx]-dep)/3600e3);
    for(let h=1;h<hrs;h++){ const tt=dep+h*3600e3, segs=[]; for(let i=0;i<NY;i++){ let cur=[]; for(let j=0;j<NX;j++){ const v=i*NX+j; if(isFinite(T[v]) && Math.abs(T[v]-tt)<cellNm/Math.max(2,hullSpeed(RT.L)*.6)*1800e3){ cur.push([cLat(i),cLng(j)]); } } if(cur.length) segs.push(...cur.map(p=>[p,p])); } iso.push(segs); }
    const dtH=1;
    RT.result={path, iso, dep, S, E, dtH, D}; rtMarks.clearLayers();
    showRouting();
  }catch(e){ toast("Routage impossible : prévisions indisponibles (réseau ?)", 5000); }
  finally{ RT.busy=false; $("rtGo").disabled=false; $("rtGo").textContent="Calculer la route optimale"; }
};
function showRouting(){
  const r=RT.result; if(!r) return; RT.layer.clearLayers(); const P=r.path;
  r.iso.forEach(segs=>segs.forEach(pp=>L.circleMarker(pp[0],{radius:1.6,stroke:false,fillColor:"#5d7fa3",fillOpacity:.55,interactive:false}).addTo(RT.layer)));
  const ll=P.map(p=>[p.lat,p.lng]);
  L.polyline(ll,{color:"#fff",weight:8,opacity:.85,interactive:false}).addTo(RT.layer);
  L.polyline(ll,{color:"#FF7A00",weight:4,interactive:false}).addTo(RT.layer);
  let tacks=0, maxW=0, dist=0, lastH=-1;
  P.forEach((p,i)=>{ if(i){ dist+=nm(P[i-1],p); if(p.twa!=null && P[i-1].twa!=null && Math.sign(p.twa)!==Math.sign(P[i-1].twa)) tacks++; } if(p.tws>maxW) maxW=p.tws;
    const hr=Math.floor((p.t-r.dep)/3600e3); if(i>0 && hr!==lastH){ lastH=hr;
      L.circleMarker([p.lat,p.lng],{radius:4,color:"#fff",weight:1.5,fillColor:"#FF7A00",fillOpacity:1})
       .bindTooltip(fmtT(p.t)+" · "+p.bs.toFixed(1)+" nd · vent "+Math.round(p.tws)+" nd à "+Math.abs(Math.round(p.twa))+"°",{direction:"top"}).addTo(RT.layer); } });
  L.circleMarker([r.E.lat,r.E.lng],{radius:8,color:"#fff",weight:3,fillColor:"#1c9e47",fillOpacity:1}).bindTooltip("Arrivée "+fmtT(P[P.length-1].t),{permanent:true,direction:"right",className:"mlabel"}).addTo(RT.layer);
  const dur=(P[P.length-1].t-r.dep)/3600e3;
  $("rtSum").innerHTML=`<div><b>Arrivée</b><span>${fmtT(P[P.length-1].t)}</span></div><div><b>Durée</b><span>${fmtDur(dur)}</span></div>
    <div><b>Distance</b><span>${dist.toFixed(1).replace(".",",")} M</span></div><div><b>Moyenne</b><span>${(dist/dur).toFixed(1)} nd</span></div>
    <div><b>Vent max</b><span>${Math.round(maxW)} nd</span></div><div><b>Virements / emp.</b><span>${tacks}</span></div>`;
  $("rtNote").textContent = "Route directe : "+r.D.toFixed(1).replace(".",",")+" M. Isochrones toutes les heures en bleu. Touchez les points orange pour le détail heure par heure.";
  $("rtRes").hidden=false; $("rtPillT").textContent=hhmm(P[P.length-1].t); $("rtPill").hidden=false; setFollow(false); map.fitBounds(L.latLngBounds(ll).pad(.25));
}
function clearRouting(){ RT.result=null; RT.layer.clearLayers(); $("rtRes").hidden=true; $("rtPill").hidden=true; drawRtMarks(); }
$("rtClear").onclick=clearRouting;
$("rtPillX").onclick=()=>{ clearRouting(); toast("Routage effacé"); };
$("rtPillOpen").onclick=()=>{ openSheet("sRouting"); renderRouteParams(); $("rtRes").hidden=!RT.result; };
$("rtNav").onclick=()=>{ const r=RT.result; if(!r) return; const P=r.path;
  // Waypoints qui suivent la route calculée : virements/empannages + simplification (écart max 0,3 mille)
  const keep=new Set([0,P.length-1]), tack=new Set();
  P.forEach((p,i)=>{ const nx=P[i+1]; if(i>0 && nx && nx.twa!=null && p.twa!=null && Math.sign(nx.twa)!==Math.sign(p.twa)){ keep.add(i); tack.add(i); } });
  const xt=(a,b,c)=>{ const k=Math.cos(P[a].lat*Math.PI/180), ax=P[a].lng*k*60, ay=P[a].lat*60, bx=P[b].lng*k*60-ax, by=P[b].lat*60-ay, cx=P[c].lng*k*60-ax, cy=P[c].lat*60-ay, L2=bx*bx+by*by;
    const t=L2?Math.max(0,Math.min(1,(cx*bx+cy*by)/L2)):0; return Math.hypot(cx-bx*t, cy-by*t); };
  const dp=(a,b)=>{ let m=0, mi=-1; for(let i=a+1;i<b;i++){ const d=xt(a,b,i); if(d>m){ m=d; mi=i; } } if(m>0.3){ keep.add(mi); dp(a,mi); dp(mi,b); } };
  const ks=[...keep].sort((x,y)=>x-y); for(let k=0;k<ks.length-1;k++) dp(ks[k],ks[k+1]);
  const idx=[...keep].sort((x,y)=>x-y).filter(i=>i>0); let n=0;
  const rt={id:Date.now(), name:"Routage "+fmtT(r.dep), pts:idx.map((i,j)=>{ const p=P[i];
    const nm = j===idx.length-1 ? "Arrivée" : tack.has(i) ? (Math.abs(p.twa)<90?"Virement ":"Empannage ")+(++n) : "WP "+(j+1);
    return [+p.lat.toFixed(6),+p.lng.toFixed(6), nm+(p.t?" · "+hhmm(p.t):"")]; })};
  routes.unshift(rt); store.set("routes",routes); renderRoutes(); startNav(rt.id); };
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
/* ================= Instruments (gros chiffres à la barre) ================= */
export var instOn=false, xteWarnT=0;
export function instOpen(){ instOn=true; $("inst").hidden=false; instTick(); if(!tbl.f) loadTable().then(instTick).catch(()=>{}); }
function instClose(){ instOn=false; $("inst").hidden=true; }
$("instClose").onclick=instClose;
export function instTick(){ if(!instOn) return;
  const T=(id,v,u)=>{ const e=$(id); if(e){ e.querySelector("span").textContent=v; if(u!=null) e.querySelector("i").textContent=u; } };
  T("iSog", sogNow!=null?sogNow.toFixed(1).replace(".",","):"—"); T("iCog", $("cog").textContent||"—");
  const rt = navR && routes.find(r=>r.id===navR.id);
  $("iNav").hidden=!rt; $("iNoNav").hidden=!!rt;
  if(rt){ $("iWp").textContent=$("ncWp").textContent; T("iDtw",$("ncDist").textContent); T("iBtw",$("ncBrg").textContent.replace("°",""));
    $("iXte").querySelector("span").textContent=$("ncXte").textContent; $("iXte").classList.toggle("warn", !!$("ncXte").style.color);
    $("iEta").querySelector("span").textContent=$("ncEta").textContent.replace(/^arrivée WP /,"").split(" · ")[0];
    const vm=$("ncWp").dataset.vmg; T("iVmg", vm||"—"); }
  $("iClock").textContent=new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
  $("iPos").textContent= last ? fmtLL(last.ll.lat,last.ll.lng) : "GPS en attente";
  // vent prévu au bateau, si le tableau météo est chargé
  let w="—"; try{ const h=tbl.f&&tbl.f.hourly; if(h){ const now=Date.now(); let k=0; h.time.forEach((t,i)=>{ if(new Date(t).getTime()<=now) k=i; });
    w=Math.round(h.wind_speed_10m[k])+" nd (raf. "+Math.round(h.wind_gusts_10m[k])+") "+compass(h.wind_direction_10m[k]); } }catch(e){}
  $("iWind").textContent=w;
  try{ instPerf(); }catch(e){}
}
// --- performance polaire : vent prévu, vitesse sur l'eau, cible de la polaire
function instEnv(){ // vent et courant prévus à l'heure courante, au point du tableau météo
  const h=tbl.f&&tbl.f.hourly; if(!h) return null; const now=Date.now(); let k=0; h.time.forEach((t,i)=>{ if(new Date(t).getTime()<=now) k=i; });
  const e={tws:h.wind_speed_10m[k], twd:h.wind_direction_10m[k]}; const hm=tbl.m&&tbl.m.hourly;
  if(hm){ const j=hm.time.indexOf(h.time[k]); if(j>=0 && hm.ocean_current_velocity[j]!=null){ e.cs=hm.ocean_current_velocity[j]/1.852; e.cd=hm.ocean_current_direction[j]; } }
  return e; }
const rad=d=>d*Math.PI/180, norm180=a=>((a%360)+540)%360-180;
function instPerf(){ const c=$("iPolar"); if(!c || !instOn) return; const e=instEnv(), cog=parseFloat($("cog").textContent);
  const b=BOATS.find(x=>x.id===RT.boat); $("iBoat").textContent = RT.polFile?"polaire importée":(RT.boat==="orc"&&RT.orc)?RT.orc.n:(b?b.name:"—"); $("iBoat").textContent+= RT.spi?"":" · sans spi";
  // vitesse sur l'eau = vitesse fond - courant
  let stw=sogNow, hdg=cog;
  if(e && e.cs!=null && sogNow!=null && isFinite(cog)){ const vx=sogNow*Math.sin(rad(cog))-e.cs*Math.sin(rad(e.cd)), vy=sogNow*Math.cos(rad(cog))-e.cs*Math.cos(rad(e.cd));
    stw=Math.hypot(vx,vy); hdg=(Math.atan2(vx,vy)*180/Math.PI+360)%360; }
  const ok = e && stw!=null && isFinite(hdg) && sogNow>0.3, tws=e?e.tws:null;
  const twaS = ok ? norm180(e.twd-hdg) : null, twa = ok?Math.abs(twaS):null, tgt = ok ? boatSpeed(twa,tws) : null;
  // meilleurs angles de VMG
  let up={v:0,a:45}, dn={v:0,a:150}; if(e) for(let a=30;a<=180;a+=1){ const v=boatSpeed(a,tws), vm=v*Math.cos(rad(a)); if(a<=90 && vm>up.v) up={v:vm,a,s:v}; if(a>=90 && -vm>dn.v) dn={v:-vm,a,s:v}; }
  const pct = ok && tgt>0.3 ? Math.round(stw/tgt*100) : null;
  $("iPct").textContent = pct!=null ? pct+" %" : "—"; $("iPct").style.color = pct==null?"":pct>=95?"#2E7D32":pct>=80?"#E65100":"#C62828";
  const f1=v=>v.toFixed(1).replace(".",",");
  $("iPerf").innerHTML = !e ? "Ouvrez le panneau Météo une fois (réseau) pour charger le vent prévu."
    : !ok ? `Vent prévu <b>${Math.round(tws)} nd du ${pad3(e.twd)}°</b>. En attente de vitesse et de cap GPS.`
    : `Vent prévu <b>${Math.round(tws)} nd du ${pad3(e.twd)}°</b> · angle <b>${Math.round(twa)}°</b> ${twaS>0?"tribord":"bâbord"} amures<br>`
      +`Cible <b>${f1(tgt)} nd</b> · vous <b>${f1(stw)} nd</b> sur l'eau`+(e.cs!=null?` (fond ${f1(sogNow)} nd)`:"")+`<br>`
      +`Meilleur près <b>${up.a}°</b> (${f1(up.s)} nd) · meilleur portant <b>${dn.a}°</b> (${f1(dn.s)} nd)`
      +(twa<90 && twa<up.a-4 ? "<br><b>Trop serré</b> : abattez un peu" : twa>up.a+6 && twa<up.a+18 ? "<br>Si vous remontez au vent : <b>lofez</b> vers "+up.a+"°" : twa>90 && twa>dn.a+8 ? "<br>Trop arrivé : <b>lofez</b> un peu" : "");
  // dessin de la polaire au vent du moment
  const dpr=window.devicePixelRatio||1, W=c.clientWidth, H=c.clientHeight; if(!W) return; c.width=W*dpr; c.height=H*dpr; const g=c.getContext("2d"); g.scale(dpr,dpr);
  if(!e) return; let vmax=1; for(let a=0;a<=180;a+=5) vmax=Math.max(vmax,boatSpeed(a,tws)); if(ok) vmax=Math.max(vmax,stw);
  const cx=W*0.18, cy=H/2, Rr=Math.min(W-cx-14,H/2-14), sc=Rr/vmax, P=(a,v)=>[cx+v*sc*Math.sin(rad(a)), cy-v*sc*Math.cos(rad(a))];
  g.font="500 11px Inter,system-ui,sans-serif"; g.strokeStyle="rgba(11,47,91,.12)"; g.fillStyle="#6B7C90";
  const st=vmax>10?4:2; for(let v=st;v<=vmax;v+=st){ g.beginPath(); g.arc(cx,cy,v*sc,-Math.PI/2,Math.PI/2); g.stroke(); g.fillText(v+" nd",cx+3,cy+v*sc-3); }
  [up.a,90,dn.a].forEach(a=>{ g.beginPath(); g.moveTo(cx,cy); g.lineTo(...P(a,vmax)); g.stroke(); });
  g.beginPath(); for(let a=0;a<=180;a+=2){ const [x,y]=P(a,boatSpeed(a,tws)); a?g.lineTo(x,y):g.moveTo(x,y); } g.strokeStyle="#1D6FB8"; g.lineWidth=2.5; g.stroke();
  g.fillStyle="#0B2F5B"; g.textAlign="center"; g.fillText("vent "+Math.round(tws)+" nd ↓",cx,12);
  if(ok){ const [tx,ty]=P(twa,tgt), [bx,by]=P(twa,stw); g.setLineDash([4,4]); g.strokeStyle="#6B7C90"; g.lineWidth=1.5; g.beginPath(); g.moveTo(cx,cy); g.lineTo(...P(twa,vmax)); g.stroke(); g.setLineDash([]);
    g.fillStyle="#fff"; g.strokeStyle="#1D6FB8"; g.lineWidth=2.5; g.beginPath(); g.arc(tx,ty,6,0,7); g.fill(); g.stroke();
    g.fillStyle="#E5372B"; g.beginPath(); g.arc(bx,by,7,0,7); g.fill(); g.textAlign="left"; g.fillStyle="#0B2F5B"; g.font="600 12px Inter,system-ui"; g.fillText("vous",bx-38,by+4); }
  // cap à suivre en tenant compte du courant (navigation en cours)
  const ctsBox=$("iCts"); ctsBox.hidden=true;
  if(navR && e && e.cs!=null && e.cs>0.2 && sogNow>1){ const btw=parseFloat($("ncBrg").textContent), s=stw||sogNow, x=e.cs*Math.sin(rad(e.cd-btw))/s;
    if(isFinite(btw) && Math.abs(x)<1){ const cts=(btw-Math.asin(x)*180/Math.PI+360)%360; ctsBox.hidden=false; ctsBox.querySelector("span").textContent=pad3(cts)+"° (route "+pad3(btw)+"°, courant "+f1(e.cs)+" nd)"; } }
}
setInterval(instTick, 5000);
$("bInst").onclick=()=>{ closeSheets(); instOpen(); };

/* ================= Balisage : infos des bouées et des feux (OpenStreetMap / OpenSeaMap) ================= */
const SM_TYPE={buoy_lateral:"Bouée latérale",beacon_lateral:"Balise latérale",buoy_cardinal:"Bouée cardinale",beacon_cardinal:"Balise cardinale",
  buoy_isolated_danger:"Danger isolé",beacon_isolated_danger:"Danger isolé",buoy_safe_water:"Eaux saines",buoy_special_purpose:"Bouée spéciale",beacon_special_purpose:"Balise spéciale",
  light_major:"Phare",light_minor:"Feu",light_vessel:"Bateau-feu",light_float:"Feu flottant",landmark:"Amer",harbour:"Port",rock:"Roche",wreck:"Épave",mooring:"Coffre / mouillage",
  anchorage:"Zone de mouillage",small_craft_facility:"Installation plaisance",pile:"Pieu",signal_station_traffic:"Sémaphore",bridge:"Pont",fog_signal:"Signal de brume",radio_station:"Station radio"};
const SM_CAT={port:"bâbord (rouge)",starboard:"tribord (vert)",preferred_channel_port:"chenal préféré à bâbord",preferred_channel_starboard:"chenal préféré à tribord",
  north:"Nord",south:"Sud",east:"Est",west:"Ouest"};
const SM_COL={red:"R",green:"G",white:"W",yellow:"Y",blue:"Bu",orange:"Or",violet:"Vi"};
function lightChar(t, p){ const g=k=>t["seamark:light"+p+":"+k]; const ch=g("character"); if(!ch) return null;
  const col=(g("colour")||"").split(";").map(c=>SM_COL[c]||"").join(""), grp=g("group"), per=g("period"), rng=g("range"), sec=g("sector_start")!=null?` (${g("sector_start")}°–${g("sector_end")}°)`:"";
  return ch+(grp?"("+grp+")":"")+(col?" "+col:"")+(per?" "+per+"s":"")+(rng?" "+rng+"M":"")+sec; }
function seamarkText(t){ const ty=t["seamark:type"], name=t["seamark:name"]||t.name||"";
  let what=SM_TYPE[ty]||ty.replace(/_/g," "); const cat=t["seamark:"+ty+":category"]; if(cat && SM_CAT[cat]) what+=" "+SM_CAT[cat];
  const lights=[]; const l0=lightChar(t,""); if(l0) lights.push(l0); for(let i=1;i<=8;i++){ const l=lightChar(t,":"+i); if(l) lights.push(l); }
  const top=t["seamark:topmark:shape"]; return {name, what, lights, top}; }
async function seamarksNear(ll){
  const r=Math.max(60, Math.min(600, 40*156543*Math.cos(ll.lat*Math.PI/180)/2**map.getZoom()));
  const q=`[out:json][timeout:15];node(around:${Math.round(r)},${ll.lat.toFixed(5)},${ll.lng.toFixed(5)})["seamark:type"];out tags center 12;`;
  const res=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",body:"data="+encodeURIComponent(q),headers:{"Content-Type":"application/x-www-form-urlencoded"}});
  if(!res.ok) throw new Error(res.status); const j=await res.json();
  return j.elements.filter(e=>e.tags).map(e=>({d:map.distance(ll,[e.lat,e.lon]), ...seamarkText(e.tags)}))
    .filter(x=>!/^(harbour|small_craft_facility)$/.test(x.what)).sort((a,b)=>a.d-b.d).slice(0,4); }
export function showSeamarks(ll){ const box=$("pSea"); box.hidden=true; if(R()) return;
  seamarksNear(ll).then(list=>{ if(pointLL!==ll || !list.length) return;
    box.innerHTML='<b>Balisage à proximité</b>'+list.map(s=>`<div class="sm"><div><strong></strong><small></small></div><span class="lc"></span></div>`).join("");
    box.querySelectorAll(".sm").forEach((el,i)=>{ const s=list[i]; el.querySelector("strong").textContent=s.name||s.what; el.querySelector("small").textContent=(s.name?s.what+" · ":"")+Math.round(s.d)+" m";
      el.querySelector(".lc").textContent=s.lights.join(" / "); });
    box.hidden=false; }).catch(()=>{}); }

/* ================= AIS : navires autour (aisstream.io, clé gratuite) ================= */
const AIS={ws:null, ships:new Map(), layer:L.layerGroup(), key:store.get("aisKey",""), on:store.get("aisOn",false), warned:new Map(), sub:null};
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
function aisStart(){ aisStop(); if(!AIS.on || !AIS.key || R()) return; AIS.layer.addTo(map); $("aisState").textContent="Connexion…";
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
function aisStop(){ if(AIS.ws){ const w=AIS.ws; AIS.ws=null; try{ w.close(); }catch(e){} } }
setInterval(()=>{ const now=Date.now(); AIS.ships.forEach((s,k)=>{ if(now-(s.t||0)>12*60e3){ if(s.mk) AIS.layer.removeLayer(s.mk); AIS.ships.delete(k); } }); }, 60e3);
map.on("moveend", ()=>{ clearTimeout(AIS._t); AIS._t=setTimeout(aisSubscribe, 1500); });
$("aisOn").checked=AIS.on; $("aisKey").value=AIS.key;
$("aisOn").onchange=e=>{ AIS.on=e.target.checked; store.set("aisOn",AIS.on); if(AIS.on && !AIS.key){ toast("Collez d'abord votre clé aisstream.io"); } AIS.on?aisStart():(aisStop(),map.removeLayer(AIS.layer),$("aisState").textContent="Désactivé"); };
$("aisSave").onclick=()=>{ AIS.key=$("aisKey").value.trim(); store.set("aisKey",AIS.key); toast(AIS.key?"Clé AIS enregistrée":"Clé effacée"); if(AIS.on) aisStart(); };
if(AIS.on) setTimeout(aisStart, 3000);

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
/* ================= Marégraphes du SHOM (hauteur d'eau mesurée, temps réel) ================= */
const TG={layer:L.layerGroup(), list:null};
async function tgLoad(){ if(!TG.list){ const c=store.get("tgList",null); if(c && Date.now()-c.t<7*864e5) TG.list=c.d;
    else try{ const d=await (await fetch("https://services.data.shom.fr/maregraphie/service/tidegauges")).json(); TG.list=d.filter(x=>x.state==="OK").map(x=>({id:x.shom_id,n:x.name,la:x.latitude,lo:x.longitude})); store.set("tgList",{t:Date.now(),d:TG.list}); }catch(e){ toast("Marégraphes indisponibles (réseau ?)"); return; } }
  TG.layer.clearLayers();
  TG.list.forEach(st=>{ const m=L.marker([st.la,st.lo],{icon:L.divIcon({className:"tgi",iconSize:[26,26],iconAnchor:[13,13],html:'<b><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 3v18M8 7h8M3 15c3-3 6 3 9 0s6 3 9 0"/></svg></b>'}),zIndexOffset:640}).addTo(TG.layer);
    m.bindPopup("Chargement…"); m.on("popupopen", ()=>tgShow(st, m)); }); }
async function tgShow(st, m){ const end=new Date(), start=new Date(end-6*3600e3), iso=d=>d.toISOString().slice(0,19)+"Z", nm=st.n.replace(/_/g," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
  try{ const j=await (await fetch(`https://services.data.shom.fr/maregraphie/observation/json/${st.id}?sources=1&dtStart=${iso(start)}&dtEnd=${iso(end)}`)).json(); const d=(j.data||[]).filter(x=>x.value!=null);
    if(!d.length) return m.setPopupContent(`<b>${nm}</b><br>Pas de mesure récente`);
    const t=x=>new Date(x.timestamp.replace(/\//g,"-").replace(" ","T")+"Z").getTime(), lastP=d[d.length-1], v=lastP.value;
    const ref=d.find(x=>t(x)>=t(lastP)-30*60e3)||d[0], dh=(t(lastP)-t(ref))/3600e3, rate=dh>0.1?(v-ref.value)/dh:0;
    const vs=d.map(x=>x.value), mn=Math.min(...vs), mx=Math.max(...vs), W=220, H=56, t0=t(d[0]), t1=t(lastP);
    const path=d.filter((x,i)=>i%3===0||i===d.length-1).map((x,i)=>(i?"L":"M")+((t(x)-t0)/(t1-t0||1)*W).toFixed(1)+" "+(H-4-(x.value-mn)/((mx-mn)||1)*(H-8)).toFixed(1)).join(" ");
    const age=Math.round((Date.now()-t(lastP))/60e3);
    m.setPopupContent(`<b>${nm}</b><br><span style="font:700 20px Inter,sans-serif">${v.toFixed(2).replace(".",",")} m</span> ${Math.abs(rate)<0.03?"· étale":rate>0?"↗ monte":"↘ descend"} (${rate>0?"+":""}${Math.round(rate*100)} cm/h)<br>
      <svg width="${W}" height="${H}" style="display:block;margin:6px 0;background:#EEF4FA;border-radius:6px"><path d="${path}" fill="none" stroke="#1D6FB8" stroke-width="2"/></svg>
      <small>6 dernières heures · mesure d'il y a ${age} min · référence SHOM (zéro hydrographique)</small><br><a href="https://data.shom.fr/donnees/refmar/${st.id}" target="_blank" rel="noopener">Fiche du marégraphe</a>`); }
  catch(e){ m.setPopupContent(`<b>${nm}</b><br>Mesure indisponible (réseau ?)`); } }
function tgSet(on){ store.set("tg",on); $("tgChk").checked=on; if(on && !R()){ TG.layer.addTo(map); tgLoad(); } else map.removeLayer(TG.layer); }
$("tgChk").onchange=e=>tgSet(e.target.checked); tgSet(store.get("tg",false));
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
