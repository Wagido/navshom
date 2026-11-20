// Courbe courant + marée en un point
import { showOfficialTide } from "./marees.js";
import { OVT, drawOverlay, getJSON, ov } from "../meteo/calques.js";
import { colorAt } from "../meteo/particules.js";
import { markTmp, openSheet, tmpMarker } from "../ui/panneaux.js";
import { $, compass, dm, fmtT, pad3 } from "../utils.js";

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

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initCourant(){
  (function(){ const w=$("cvWrap"); let down=false;
    const pick = ev => { if(!cv.data) return; const r=w.getBoundingClientRect(), x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left, padL=CVPAD.l, padR=CVPAD.r, n=cv.data.time.length;
      cv.sel=Math.max(0,Math.min(n-1,Math.round((x-padL)/(r.width-padL-padR)*(n-1)))); drawCurve();
      if(ov.data){ const k=ov.data[0].time.indexOf(cv.data.time[cv.sel]); if(k>=0 && k!==ov.idx){ ov.idx=k; $("tSlider").value=k; drawOverlay(); } } };
    w.addEventListener("pointerdown", e=>{ down=true; w.setPointerCapture(e.pointerId); pick(e); });
    w.addEventListener("pointermove", e=>{ if(down) pick(e); });
    w.addEventListener("pointerup", ()=>down=false); w.addEventListener("pointercancel", ()=>down=false);
  })();
}
