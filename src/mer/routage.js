// Routage météo (isochrones) et polaires
import { map } from "../carte/carte.js";
import { pointLL } from "../carte/point.js";
import { last, setFollow } from "../gps/gps.js";
import { hhmm, renderRoutes, routes, startNav } from "./routes.js";
import { getJSON, model } from "../meteo/calques.js";
import { landFrac } from "../meteo/masque.js";
import { unsuffix } from "../meteo/previsions.js";
import { closeSheets, openSheet } from "../ui/panneaux.js";
import { $, fmtDur, fmtLL, fmtT, store, toast } from "../utils.js";

export let RT;
let POL_TWA, ORC_TWA, ORC_TWS, NSR, BASE_TBL, rtMarks;

/* ================= Routage météo (isochrones) ================= */
// Polaire de base d'un croiseur : fraction de la vitesse de carène, par angle au vent réel (TWA) et force du vent (TWS, nd)
const POL_TWS=[4,6,8,10,12,14,16,20,25,30];
const POL_BASE={30:[0,0,0,0,0,0,0,0,0,0],
 40:[.25,.38,.48,.56,.62,.65,.67,.68,.66,.62], 52:[.33,.48,.6,.7,.77,.81,.83,.84,.83,.8], 60:[.36,.52,.65,.75,.82,.86,.88,.9,.89,.86],
 75:[.38,.55,.69,.8,.87,.91,.94,.96,.96,.93], 90:[.38,.55,.7,.81,.89,.94,.97,1,1.01,.98], 110:[.37,.54,.69,.8,.88,.94,.98,1.03,1.06,1.04],
 120:[.35,.52,.67,.78,.87,.93,.98,1.04,1.08,1.07], 135:[.31,.47,.61,.73,.82,.89,.95,1.02,1.08,1.08], 150:[.26,.4,.53,.64,.74,.82,.88,.96,1.03,1.05],
 165:[.22,.35,.47,.58,.67,.75,.82,.9,.98,1], 180:[.2,.32,.44,.54,.63,.71,.78,.87,.95,.97]};
export const BOATS=[
 {id:"cr7", name:"Petit croiseur 7 m", L:7, type:"cruiser"},
 {id:"cr9", name:"Croiseur côtier 9 m", L:9, type:"cruiser"},
 {id:"cr11", name:"Croiseur 11 m", L:11, type:"cruiser"},
 {id:"cr13", name:"Grand croiseur 13 m", L:13, type:"cruiser"},
 {id:"race12", name:"Voilier de course 12 m (type Class40)", L:12, type:"racer"},
 {id:"cat12", name:"Catamaran de croisière 12 m", L:12, type:"cat"},
 {id:"custom", name:"Personnalisé", L:10, type:"cruiser"},
 {id:"orc", name:"Modèle de série (ORC)…", L:10, type:"cruiser"}];
let ORC_DB=null; const orcDb=()=>ORC_DB||(ORC_DB=fetch("lib/polars-orc.json").then(r=>r.json()));
const hullSpeed = L => 1.34*Math.sqrt(L*0.9*3.281);   // nœuds, longueur à la flottaison ≈ 90 % de la longueur hors tout
function interp1(xs, ys, x){ if(x<=xs[0]) return ys[0]; for(let i=1;i<xs.length;i++) if(x<=xs[i]){ const f=(x-xs[i-1])/(xs[i]-xs[i-1]); return ys[i-1]+(ys[i]-ys[i-1])*f; } return ys[ys.length-1]; }
function polarTable(twa, tws, tbl){ // interpolation bilinéaire dans une table {twa:[], tws:[], v:[[...]]}
  const a=Math.min(180,Math.abs(twa)); let i=1; while(i<tbl.twa.length-1 && tbl.twa[i]<a) i++;
  const f=Math.max(0,Math.min(1,(a-tbl.twa[i-1])/(tbl.twa[i]-tbl.twa[i-1]||1)));
  return interp1(tbl.tws, tbl.v[i-1], tws)*(1-f)+interp1(tbl.tws, tbl.v[i], tws)*f; }
export function boatSpeed(twa, tws){ // nœuds sur l'eau
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
export function drawRtMarks(){ rtMarks.clearLayers();
  if(RT.start) L.circleMarker(RT.start,{radius:8,color:"#fff",weight:3,fillColor:"#0b63b6",fillOpacity:1}).bindTooltip("Départ",{permanent:true,direction:"right",className:"mlabel"}).addTo(rtMarks);
  if(RT.dest && !RT.result) L.circleMarker(RT.dest,{radius:8,color:"#fff",weight:3,fillColor:"#1c9e47",fillOpacity:1}).bindTooltip("Arrivée",{permanent:true,direction:"right",className:"mlabel"}).addTo(rtMarks); }
function rtPick(which){ RT.picking=which; closeSheets(); $("pickTxt").textContent = which==="start" ? "Touchez la carte : point de DÉPART" : "Touchez la carte : point d'ARRIVÉE"; $("pickBar").hidden=false; }
function openRouting(dest){
  if(dest) RT.dest=L.latLng(dest); drawRtMarks(); renderRouteParams(); openSheet("sRouting");
  $("rtRes").hidden=!RT.result;
}

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

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initRoutage(){
  POL_TWA = Object.keys(POL_BASE).map(Number);
  // Rapport vitesse sans spi / avec spi, médiane des bateaux ayant les deux certificats ORC (lignes = angles, colonnes = vents)
  ORC_TWA = [0, 25, 40, 45, 52, 60, 75, 90, 110, 120, 135, 150, 165, 180]; ORC_TWS = [4, 6, 8, 10, 12, 14, 16, 20, 24]; NSR = {twa:ORC_TWA, tws:ORC_TWS, v:[[1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1],[1,1,1,0.993,0.986,0.986,0.986,0.986,0.972],[1,1,1,1,1,0.987,1,0.987,0.987],[1,1,1,1,1,1,1,1,0.988],[1,1,1,1,1,1,1,1,0.989],[1,1,1,1,1,1,1,1,1],[0.99,0.982,0.981,0.976,0.986,0.987,0.996,1,1],[0.86,0.871,0.89,0.919,0.935,0.942,0.948,0.965,0.979],[0.815,0.839,0.867,0.901,0.922,0.927,0.924,0.928,0.947],[0.788,0.821,0.847,0.873,0.902,0.918,0.917,0.894,0.867],[0.8,0.822,0.841,0.852,0.871,0.892,0.909,0.902,0.886],[0.887,0.886,0.895,0.905,0.912,0.928,0.942,0.95,0.943],[0.947,0.935,0.947,0.954,0.959,0.955,0.966,0.97,0.964]]};
  RT = {boat:store.get("rtBoat","cr11"), orc:store.get("rtOrc",null), spi:store.get("rtSpi",true), L:store.get("rtLen",11), polFile:store.get("rtPolar",null), cur:store.get("rtCur",true),
    start:null, dest:null, layer:L.layerGroup().addTo(map), result:null, busy:false};
  BASE_TBL = {twa:POL_TWA, tws:POL_TWS, v:POL_TWA.map(a=>POL_BASE[a])};
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
  rtMarks = L.layerGroup().addTo(map);
  $("rtPickS").onclick=()=>rtPick("start"); $("rtPickE").onclick=()=>rtPick("dest");
  $("rtGps").onclick=()=>{ RT.start=null; drawRtMarks(); renderRouteParams(); };
  $("rtSwap").onclick=()=>{ const s0=RT.start || (last?last.ll:map.getCenter()); if(!RT.dest) return toast("Choisissez d'abord l'arrivée"); RT.start=RT.dest; RT.dest=L.latLng(s0); RT.result=null; RT.layer.clearLayers(); $("rtRes").hidden=true; drawRtMarks(); renderRouteParams(); };
  $("pickCancel").onclick=()=>{ RT.picking=null; $("pickBar").hidden=true; openSheet("sRouting"); };
  $("aRouting").onclick=()=>{ if(pointLL) openRouting(pointLL); };
  $("bRouting").onclick=()=>openRouting(null);
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
}
