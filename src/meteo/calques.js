// Modèles météo et calques météo / mer (dégradé, chiffres, barre de temps)
import { R, map } from "../carte/carte.js";
import { measuring, stopMeasure } from "../carte/mesure.js";
import { last } from "../gps/gps.js";
import { wxLoadAll, wxNearest } from "../main.js";
import { cv, drawCurve } from "../mer/courant.js";
import { drawField, drawLegend, landFrac, startParticles, updatePicker } from "./masque.js";
import { reduceMotion, stopParticles } from "./particules.js";
import { radarOff } from "./pluie.js";
import { openMeteo } from "./previsions.js";
import { crowdCheck, fixTl, loadTable, renderTable, tbl } from "./tableau.js";
import { $, LSP, compass, fmtT, pad3, store, toast } from "../utils.js";

export let model, ov, lastWx;
let _jc, PTC;

/* ================= Modèles & calques météo / mer ================= */
// Modèles disponibles via Open-Meteo (identifiants de l'API)
const MODELS = [
  ["best_match","Auto (meilleur disponible)"],
  ["meteofrance_arome_france_hd","Météo-France AROME 1,5 km"],
  ["meteofrance_arome_france","Météo-France AROME 2,5 km"],
  ["meteofrance_arpege_europe","Météo-France ARPEGE"],
  ["ecmwf_ifs025","ECMWF IFS (Europe)"],
  ["icon_seamless","DWD ICON (Allemagne)"],
  ["gfs_seamless","NOAA GFS (États-Unis)"]
];
export const modelName = m => (MODELS.find(x=>x[0]===m)||MODELS[0])[1];
const WIND_SCALE = [[0,"#7ed957"],[10,"#ffd54f"],[17,"#ff9800"],[25,"#e5372b"],[34,"#b0279c"]];
const WAVE_SCALE = [[0,"#4fc3f7"],[1,"#26a69a"],[2,"#ffca28"],[3,"#fb8c00"],[5,"#e53935"]];
export const OVT = {
  wind: {name:"Vent", api:"fc", vars:["wind_speed_10m","wind_direction_10m","wind_gusts_10m"], unit:"nd", vec:true, from:true, dec:0, zero:true, scale:WIND_SCALE, anim:0.07},
  gust: {name:"Rafales", api:"fc", vars:["wind_gusts_10m","wind_direction_10m"], unit:"nd", vec:true, from:true, dec:0, zero:true, scale:WIND_SCALE, anim:0.07},
  temp: {name:"Température", api:"fc", vars:["temperature_2m"], unit:"°C", dec:0, scale:[[-5,"#5e35b1"],[0,"#1e88e5"],[6,"#26c6da"],[12,"#66bb6a"],[18,"#ffca28"],[24,"#fb8c00"],[30,"#e53935"]]},
  press:{name:"Pression", api:"fc", vars:["pressure_msl"], unit:"hPa", dec:0, scale:[[970,"#8e24aa"],[990,"#1e88e5"],[1005,"#26c6da"],[1015,"#66bb6a"],[1025,"#ffca28"],[1035,"#e53935"]]},
  rain: {name:"Pluie", api:"fc", vars:["precipitation"], unit:"mm/h", dec:1, zero:true, scale:[[0,null],[0.1,"#90caf9"],[1,"#1e88e5"],[3,"#3949ab"],[8,"#8e24aa"]]},
  cloud:{name:"Nuages", api:"fc", vars:["cloud_cover"], unit:"%", dec:0, zero:true, scale:[[0,null],[25,"#cfd8dc"],[60,"#90a4ae"],[90,"#546e7a"]]},
  vis:  {name:"Visibilité", api:"fc", vars:["visibility"], unit:"km", conv:x=>x/1000, dec:1, zero:true, scale:[[0,"#e53935"],[1,"#fb8c00"],[4,"#ffca28"],[10,null]]},
  snowd:{name:"Neige au sol", api:"fc", rando:true, vars:["snow_depth"], unit:"cm", conv:x=>x*100, dec:0, zero:true, scale:[[0,null],[5,"#e3f2fd"],[30,"#90caf9"],[80,"#42a5f5"],[150,"#1e63b5"],[300,"#5e35b1"]]},
  snowf:{name:"Chute de neige", api:"fc", rando:true, vars:["snowfall"], unit:"cm/h", dec:1, zero:true, scale:[[0,null],[0.2,"#e1f5fe"],[1,"#81d4fa"],[3,"#29b6f6"],[6,"#7e57c2"]]},
  frz:  {name:"Iso 0 °C", api:"fc", rando:true, vars:["freezing_level_height"], unit:"m", dec:0, scale:[[0,"#5e35b1"],[1000,"#1e88e5"],[2000,"#26c6da"],[3000,"#ffca28"],[4000,"#e53935"]]},
  sst:  {name:"Temp. eau", api:"mar", vars:["sea_surface_temperature"], unit:"°C", dec:0, scale:[[8,"#3949ab"],[11,"#1e88e5"],[14,"#26c6da"],[17,"#66bb6a"],[20,"#ffca28"],[23,"#fb8c00"],[26,"#e53935"]]},
  wave: {name:"Vagues", api:"mar", vars:["wave_height","wave_direction","wave_period"], unit:"m", vec:true, from:true, dec:1, zero:true, scale:WAVE_SCALE},
  swell:{name:"Houle", api:"mar", vars:["swell_wave_height","swell_wave_direction","swell_wave_period"], unit:"m", vec:true, from:true, dec:1, zero:true, scale:WAVE_SCALE},
  cur:  {name:"Courant", api:"mar", vars:["ocean_current_velocity","ocean_current_direction"], unit:"nd", conv:x=>x/1.852, vec:true, from:false, dec:1, zero:true, scale:[[0,"#4fc3f7"],[0.5,"#ffd54f"],[1.5,"#ff9800"],[3,"#ff3d00"]], anim:0.3}
};
const colorOf = (t,v) => { let c=t.scale[0][1]; for(const [s,col] of t.scale) if(v>=s) c=col; return c; };

function arrowIcon(dirTo, v, t){
  const col=colorOf(t,v)||"#90a4ae", rel = t.unit==="nd" ? (t===OVT.cur ? v*14 : v*1.3) : v*12;
  const len=Math.min(16+rel,54);
  return L.divIcon({className:"arr tap", iconSize:[56,70], iconAnchor:[28,28], html:
    `<svg width="56" height="56" viewBox="-28 -28 56 56"><circle r="26" fill="transparent"/><g transform="rotate(${dirTo})">
     <line x1="0" y1="${len/2}" x2="0" y2="${-len/2}" stroke="#000" stroke-opacity=".5" stroke-width="6" stroke-linecap="round"/>
     <line x1="0" y1="${len/2}" x2="0" y2="${-len/2+2}" stroke="${col}" stroke-width="3.5" stroke-linecap="round"/>
     <path d="M0 ${-len/2-4} L7 ${-len/2+8} L-7 ${-len/2+8}Z" fill="${col}" stroke="#000" stroke-opacity=".5" stroke-width="1.5"/></g></svg>
     <div>${v.toFixed(t.dec)}</div>`});
}
const valIcon = (v,t) => L.divIcon({className:"arr tap val", iconSize:[56,24], iconAnchor:[28,12], html:`<div>${v.toFixed(t.dec)}<small> ${t.unit}</small></div>`});
export async function getJSON(url){
  const c=_jc.get(url); if(c && Date.now()-c.t<30*60e3) return c.v;
  const r=await fetch(url); if(!r.ok){ if(r.status===429) toast("Limite quotidienne Open-Meteo atteinte sur cet appareil",5000); throw new Error(r.status); }
  const v=await r.json(); _jc.set(url,{t:Date.now(),v}); if(_jc.size>60) _jc.delete(_jc.keys().next().value); return v; }
function apiUrl(t, la, lo, days, mdl){
  return t.api==="mar"
    ? `https://marine-api.open-meteo.com/v1/marine?latitude=${la}&longitude=${lo}&hourly=${t.vars.join(",")}&timezone=auto&forecast_days=${days}&cell_selection=sea`
    : `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=${t.vars.join(",")}&wind_speed_unit=kn&timezone=auto&forecast_days=${days}`+(mdl&&mdl!=="best_match"?`&models=${mdl}`:"");
}
// lit une variable, avec ou sans suffixe de modèle
const hv = (h,k,mdl) => h[k] || (mdl && h[k+"_"+mdl]) || [];
export async function fetchSeries(type, pts, days){
  const t=OVT[type], la=pts.map(p=>p[0]).join(","), lo=pts.map(p=>p[1]).join(",");
  let used = t.api==="fc" ? model : "best_match", j;
  try{ j = await getJSON(apiUrl(t,la,lo,days,used)); }
  catch(e){ if(used==="best_match") throw e; toast(modelName(used)+" indisponible ici : passage en Auto", 4000); used="best_match"; j=await getJSON(apiUrl(t,la,lo,days,used)); }
  if(!Array.isArray(j)) j=[j];
  const cv = t.conv || (x=>x);
  return {used, series: j.map(d => { const h=d.hourly, raw=hv(h,t.vars[0],used), dir=t.vec?hv(h,t.vars[1],used):null;
    return {time:h.time, v:raw.map(x=>x==null?null:cv(x)),
      dir: dir ? dir.map(x=>x==null?null:(t.from?(x+180)%360:x)) : null,
      from: t.from ? dir : null,
      g: type==="wind" ? hv(h,"wind_gusts_10m",used) : null,
      per: t.vars[2] && type!=="wind" ? hv(h,t.vars[2],used) : null}; })};
}
// Grille FIXE (points calés sur des degrés « ronds ») : en déplaçant la carte, les points déjà connus sont réutilisés
const NICE=[0.01,0.02,0.025,0.05,0.1,0.2,0.25,0.5,1,2,5];
function gridPts(){
  const B=map.getBounds(), lat=map.getCenter().lat, k=Math.cos(lat*Math.PI/180);
  const want=(B.getEast()-B.getWest())/4, sLo=NICE.find(x=>x>=want)||5, sLa=NICE.find(x=>x>=sLo*k*0.9)||sLo;
  const j0=Math.floor(B.getWest()/sLo)-1, j1=Math.ceil(B.getEast()/sLo)+1, i0=Math.ceil(B.getNorth()/sLa)+1, i1=Math.floor(B.getSouth()/sLa)-1;
  const cols=j1-j0+1, rows=i0-i1+1, pts=[];
  for(let i=i0;i>=i1;i--) for(let j=j0;j<=j1;j++) pts.push([+(i*sLa).toFixed(4), +(j*sLo).toFixed(4)]);
  return {pts, rows, cols};
}
const ptKey=(type,mdl,p)=>type+"|"+mdl+"|"+p[0]+","+p[1];
let ptcSaveT=null; function ptcSave(){ clearTimeout(ptcSaveT); ptcSaveT=setTimeout(()=>{ try{ const o={}; let n=0; for(const [k,v] of [...PTC.entries()].reverse()){ if(Date.now()-v.t<3600e3 && n++<600) o[k]=v; } localStorage.setItem(LSP+"ptc",JSON.stringify(o)); }catch(e){} },1500); }
export async function loadOverlay(keepIdx){
  const type=ov.type; if(!type) return;
  const g=gridPts(); if(g.pts.length>130){ toast("Zoomez un peu pour afficher la météo"); return; }
  const mdl = OVT[type].api==="fc" ? model : "mar";
  $("tSrc").textContent="chargement…"; stopParticles();
  try{
    const miss=g.pts.filter(p=>{ const c=PTC.get(ptKey(type,mdl,p)); return !c || Date.now()-c.t>3600e3; });
    let used=ov.model||model, offT=null, series;
    try{
      if(miss.length){ const r=await fetchSeries(type, miss, 3); used=r.used; r.series.forEach((s,i)=>PTC.set(ptKey(type,mdl,miss[i]),{t:Date.now(),s})); ptcSave(); }
      series=g.pts.map(p=>PTC.get(ptKey(type,mdl,p)).s);
    }catch(err){ // sans réseau : prévisions enregistrées avec les zones hors ligne
      await wxLoadAll(); const off=g.pts.map(p=>wxNearest(type,p)); if(!off.every(Boolean)) throw err;
      series=off.map(o=>o.s); offT=off[0].t; }
    if(ov.type!==type) return;
    ov.data=series; ov.pts=g.pts; ov.grid=g.pts.length; ov.rows=g.rows; ov.cols=g.cols; ov.model=used;
    const now=Date.now(); let best=1e15; ov.now=0; series[0].time.forEach((t,i)=>{ const d=Math.abs(new Date(t)-now); if(d<best){best=d;ov.now=i;} });
    ov.idx = keepIdx!=null && keepIdx<series[0].time.length ? keepIdx : ov.now;
    $("tSlider").max=series[0].time.length-1; $("tSlider").value=ov.idx;
    $("tSrc").textContent = offT ? "hors ligne · prévision du "+new Date(offT).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "";
    if(offT) toast("Sans réseau : météo enregistrée le "+new Date(offT).toLocaleString("fr-FR",{weekday:"short",hour:"2-digit",minute:"2-digit"}),4000);
    drawOverlay();
    $("tErr").hidden=true;
  }catch(e){ $("tSrc").textContent="indisponible";
    tErrShow(!navigator.onLine ? "Pas de réseau, et pas de météo enregistrée pour cet endroit." : /429/.test(String(e)) ? "Trop de demandes au service météo : réessayez dans une minute." : "Pas de prévision : le service météo ne répond pas."); }
}
export function drawOverlay(){
  ov.layer.clearLayers(); if(!ov.data) return;
  const i=ov.idx, t=OVT[ov.type];
  // flèches clairsemées seulement quand l'animation est coupée
  if(t.vec && !(ov.anim && t.anim && !reduceMotion)){
    ov.data.forEach((d,k)=>{ if(k>=ov.grid||d.v[i]==null||d.dir[i]==null) return; const r=Math.floor(k/ov.cols), c=k%ov.cols; if(r%2||c%2) return;
      L.marker(ov.pts[k],{icon:arrowIcon(d.dir[i],d.v[i],t),keyboard:false,interactive:false}).addTo(ov.layer); });
  }
  $("tTime").textContent = t.name+" · "+fmtT(ov.data[0].time[i]);
  document.documentElement.style.setProperty("--tl", ($("tbar").offsetHeight+8)+"px");
  drawTimeline(); if(!$("sCurve").hidden && cv.data) drawCurve();
  drawField(); drawLegend(); updatePicker(); startParticles();
  if(tbl.open && !$("tbar").classList.contains("mini")){ if(!tbl.f) loadTable(); else { $("tTbl").querySelectorAll("td.sel").forEach(x=>x.classList.remove("sel")); const st=ov.data[0].time[i]; $("tTbl").querySelectorAll(`td[data-t="${st}"]`).forEach(x=>x.classList.add("sel")); } }
}
const boatInView=()=>!!(last && map.getBounds().contains(last.ll) && (R() || landFrac(last.ll.lat,last.ll.lng)<0.5));
function refIdx(){ if(!ov.data) return -1; const ref=boatInView()?last.ll:map.getCenter(); let bi=-1,bd=1e12;
  ov.pts.forEach((p,k)=>{ if(ov.data[k].v.every(v=>v==null)) return; const d=map.distance(ref,p); if(d<bd){bd=d;bi=k;} }); return bi; }
function hereText(s,i){
  const t=OVT[ov.type], v=s.v[i]; if(v==null) return "—";
  const val=v.toFixed(t.dec).replace(".",",")+" "+t.unit;
  if(ov.type==="wind") return Math.round(v)+" nd · raf. "+Math.round(s.g[i])+" · "+compass(s.from[i]);
  if(ov.type==="cur") return val+" → "+pad3(s.dir[i])+"°";
  if(t.vec) return val+" · "+compass(s.from[i])+(s.per&&s.per[i]!=null?" · "+Math.round(s.per[i])+" s":"");
  return val;
}
export function drawTimeline(){
  if(ov.data){ const k0=refIdx(); if(k0>=0) $("tHere").textContent = hereText(ov.data[k0], ov.idx); }
  const c=$("tGraph"), dpr=window.devicePixelRatio||1, W=c.clientWidth, H=c.clientHeight; if(!W||!ov.data) return;
  c.width=W*dpr; c.height=H*dpr; const g=c.getContext("2d"); g.scale(dpr,dpr);
  const k=refIdx(); if(k<0) return; const t=OVT[ov.type], s=ov.data[k], n=s.time.length;
  const vals=s.v.filter(v=>v!=null), gs=(s.g||s.v).map(v=>v==null?null:v);
  let lo = t.zero ? 0 : Math.min(...vals), hi = Math.max(...gs.filter(v=>v!=null), ...vals);
  if(t.zero) hi=Math.max(hi, ov.type==="cur"?1:ov.type==="rain"?1:t.unit==="m"?1:10); if(hi-lo<1){ hi+=.5; lo-=.5; }
  const pad=14, top=14, bot=H-15, X=i=>pad+i*(W-2*pad)/(n-1), Y=v=>bot-(v-lo)/(hi-lo)*(bot-top);
  g.font="500 10px Inter,system-ui,sans-serif"; g.textAlign="center";
  s.time.forEach((tt,i)=>{ const d=new Date(tt), hr=d.getHours();
    if(hr>=21||hr<7){ g.fillStyle="rgba(11,47,91,.05)"; g.fillRect(X(i)-(W-2*pad)/(n-1)/2,0,(W-2*pad)/(n-1)+.5,bot); }
    if(hr===0){ g.strokeStyle="rgba(11,47,91,.22)"; g.lineWidth=1; g.beginPath(); g.moveTo(X(i),0); g.lineTo(X(i),bot); g.stroke();
      g.fillStyle="#0B2F5B"; g.textAlign="left"; g.fillText(d.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric"}),X(i)+3,10); g.textAlign="center"; }
    if(hr%6===0 && n<=48 || hr%12===0){ g.fillStyle="#4A5D73"; g.fillText(String(hr).padStart(2,"0")+"h",X(i),H-3); } });
  if(s.g){ g.beginPath(); s.g.forEach((v,i)=>i?g.lineTo(X(i),Y(v||0)):g.moveTo(X(i),Y(v||0))); g.strokeStyle="rgba(11,47,91,.22)"; g.setLineDash([3,3]); g.lineWidth=1.5; g.stroke(); g.setLineDash([]); }
  const vv=s.v.map(v=>v==null?lo:v);
  g.beginPath(); g.moveTo(X(0),bot); vv.forEach((v,i)=>g.lineTo(X(i),Y(v))); g.lineTo(X(n-1),bot); g.closePath();
  const gr=g.createLinearGradient(0,top,0,bot); gr.addColorStop(0,"rgba(255,122,0,.35)"); gr.addColorStop(1,"rgba(255,122,0,.03)"); g.fillStyle=gr; g.fill();
  g.beginPath(); vv.forEach((v,i)=>i?g.lineTo(X(i),Y(v)):g.moveTo(X(i),Y(v))); g.strokeStyle="#FF7A00"; g.lineWidth=2; g.stroke();
  if(s.dir) for(let i=0;i<n;i+=3){ if(s.dir[i]==null) continue; g.save(); g.translate(X(i),Y(vv[i])-9); g.rotate(s.dir[i]*Math.PI/180);
    g.fillStyle="#0B2F5B"; g.beginPath(); g.moveTo(0,-5); g.lineTo(3.5,4); g.lineTo(-3.5,4); g.closePath(); g.fill(); g.restore(); }
  g.strokeStyle="#1C9E47"; g.lineWidth=2; g.setLineDash([3,3]); g.beginPath(); g.moveTo(X(ov.now),top-2); g.lineTo(X(ov.now),bot); g.stroke(); g.setLineDash([]);
  g.fillStyle="#4A5D73"; g.textAlign="right"; g.fillText((t.zero?"max ":"")+hi.toFixed(t.dec)+" "+t.unit,W-2,22);
  if(!t.zero){ g.fillText(lo.toFixed(t.dec), W-2, bot-2); }
  $("tHere").textContent = hereText(s, ov.idx);
}
export function setOverlay(type){
  if(ov.type===type) type=null;
  ov.type=type; ov.data=null; ov.layer.clearLayers(); stopParticles(); drawField(); map.closePopup();
  if(type && type!=="cur"){ lastWx=type; store.set("lastWx",type); }
  $("bCur").classList.toggle("on",type==="cur"); $("bWind").classList.toggle("on",!!type && type!=="cur");
  $("mapCur").classList.toggle("on",type==="cur"); $("mapWind").classList.toggle("on",type==="wind");
  document.querySelectorAll("#tChips button[data-t]").forEach(b=>b.classList.toggle("on",b.dataset.t===type));
  $("tNote").hidden = type!=="cur";
  $("tAnim").hidden = !(type && OVT[type].anim); $("tAnim").classList.toggle("on", ov.anim);
  $("tModel").disabled = !type || OVT[type].api!=="fc";
  $("tbar").hidden=!type; document.documentElement.style.setProperty("--tl", type ? ($("tbar").offsetHeight+8)+"px" : "0px"); setTimeout(crowdCheck,260);
  if(type) renderTable();
  if(type){ if(measuring) stopMeasure(); ov.layer.addTo(map); loadOverlay();
    const ch=document.querySelector(`#tChips button[data-t="${type}"]`); if(ch) ch.scrollIntoView({inline:"center",block:"nearest"}); }
  else { map.removeLayer(ov.layer); }
}
function setModel(m){ model=m; store.set("model",m); $("tModel").value=m; $("menuModel").value=m;
  if(ov.type && OVT[ov.type].api==="fc") loadOverlay(ov.idx); if(tbl.open) loadTable(true); toast("Modèle : "+modelName(m)); }
export function tErrShow(t){ $("tErrT").textContent=t; $("tErr").hidden=false; fixTl(); }
export function setFold(open){ store.set("tbarOpen",open); $("tbar").classList.toggle("mini",!open); $("tFold").setAttribute("aria-expanded",open);
  $("tFoldTxt").textContent = open ? "Réduire ﹀" : "Détails ︿"; if(open && tbl.open) loadTable(); fixTl(); setTimeout(()=>{ drawLegend(); drawTimeline(); },30); }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initCalques(){
  model = store.get("model","best_match"); if(!MODELS.some(m=>m[0]===model)) model="best_match";
  ov = {type:null, data:null, pts:[], grid:0, rows:0, cols:0, idx:0, now:0, model:null,
    layer:L.layerGroup(), cells:L.layerGroup(), anim: store.get("anim", true), nums: true};
  lastWx = store.get("lastWx","wind"); if(!OVT[lastWx] || lastWx==="cur") lastWx="wind";

  // cache mémoire 30 min : limite le nombre d'appels (Open-Meteo gratuit ≈ 10 000 points/jour/appareil)
  _jc = new Map();
  // cache par point : 1 h en mémoire, et sur l'appareil pour la journée
  PTC = new Map();
  try{ const sv=JSON.parse(localStorage.getItem(LSP+"ptc")||"{}"); for(const k in sv) if(Date.now()-sv[k].t<3600e3) PTC.set(k,sv[k]); }catch(e){}
  // barre de choix des calques + modèle
  Object.entries(OVT).forEach(([k,t])=>{ const b=document.createElement("button"); b.dataset.t=k; b.textContent=t.name; b.onclick=()=>{ if(ov.type!==k) setOverlay(k); }; $("tChips").appendChild(b); });
  MODELS.forEach(([id,name])=>{ for(const sel of [$("tModel"),$("menuModel")]){ const o=document.createElement("option"); o.value=id; o.textContent=name; sel.appendChild(o); } });
  $("tModel").value=model; $("menuModel").value=model;
  $("tModel").onchange=e=>setModel(e.target.value); $("menuModel").onchange=e=>setModel(e.target.value);
  $("tAnim").onclick=()=>{ ov.anim=!ov.anim; store.set("anim",ov.anim); $("tAnim").classList.toggle("on",ov.anim); drawOverlay(); if(!ov.anim) stopParticles(); };
  $("tErrGo").onclick=()=>{ $("tErr").hidden=true; fixTl(); if(ov.type) loadOverlay(); if(tbl.open) loadTable(true); };
  $("tClose").onclick=()=>{ $("tErr").hidden=true; tbl.force=null; try{ radarOff(); }catch(e){} setOverlay(null); };
  $("tFold").onclick=()=>setFold($("tbar").classList.contains("mini"));
  setTimeout(()=>setFold(store.get("tbarOpen",false)));
  $("tFcst").onclick=()=>openMeteo(tbl.force||null);
}
