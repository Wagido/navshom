// Masque terre / mer (données GLOBE, ~1 km) : courant, vagues et houle s'arrêtent à la côte
import { map } from "../carte/carte.js";
import { meteoHere } from "../carte/point.js";
import { showCurve } from "../main.js";
import { OVT, drawOverlay, ov } from "./calques.js";
import { buildGrid, colorAt, field, pRaf, parts, pc, ramp, reduceMotion, sample, sampleS, setField, setPRaf, setParts, stopParticles } from "./particules.js";
import { $, compass, pad3 } from "../utils.js";

let fieldPane, fcv, off;

/* ---- Masque terre / mer (données GLOBE, ~1 km) : courant, vagues et houle s'arrêtent à la côte ---- */
const MASK={N:51.30,S:41.20,W:-5.90,E:9.80,w:0,h:0,d:null};
export function landFrac(lat,lng){ if(!MASK.d) return 0; const fx=(lng-MASK.W)/(MASK.E-MASK.W)*MASK.w-.5, fy=(MASK.N-lat)/(MASK.N-MASK.S)*MASK.h-.5;
  if(fx<0||fy<0||fx>=MASK.w-1||fy>=MASK.h-1) return 0; const x0=fx|0,y0=fy|0,dx=fx-x0,dy=fy-y0,D=MASK.d,w=MASK.w,i=y0*w+x0;
  return D[i]*(1-dx)*(1-dy)+D[i+1]*dx*(1-dy)+D[i+w]*(1-dx)*dy+D[i+w+1]*dx*dy; }
// masque en coordonnées écran (1 valeur tous les "step" px), recalculé à chaque dessin
let scrLand=null;
function buildScreenLand(sz, step){
  const w=Math.ceil(sz.x/step)+1, h=Math.ceil(sz.y/step)+1, a=new Float32Array(w*h);
  const lngs=[], lats=[]; for(let x=0;x<w;x++) lngs.push(map.containerPointToLatLng([x*step,0]).lng); for(let y=0;y<h;y++) lats.push(map.containerPointToLatLng([0,y*step]).lat);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) a[y*w+x]=landFrac(lats[y],lngs[x]);
  return {step,w,h,a};
}
const isLandXY=(x,y)=>{ if(!scrLand) return false; const i=Math.round(y/scrLand.step)*scrLand.w+Math.round(x/scrLand.step); return scrLand.a[i]>0.5; };
export function drawField(){
  const sz=map.getSize(), dpr=Math.min(window.devicePixelRatio||1,3);
  if(fcv.width!==Math.round(sz.x*dpr)||fcv.height!==Math.round(sz.y*dpr)){ fcv.width=Math.round(sz.x*dpr); fcv.height=Math.round(sz.y*dpr); fcv.style.width=sz.x+"px"; fcv.style.height=sz.y+"px"; }
  L.DomUtil.setPosition(fcv, map.containerPointToLayerPoint([0,0]));
  const g=fcv.getContext("2d"); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,sz.x,sz.y);
  if(!ov.type||!ov.data||ov.rows<2) return;
  const f=buildGrid(), t=f.t, step=5, w=Math.ceil(sz.x/step)+1, h=Math.ceil(sz.y/step)+1, sea=t.api==="mar";
  scrLand = sea ? buildScreenLand(sz, step) : null;
  off.width=w; off.height=h; const og=off.getContext("2d"), img=og.createImageData(w,h), D=img.data, alpha=t.vec?0.5:0.55;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ let m=1; if(sea){ const lf=scrLand.a[y*w+x]; if(lf>=0.7) continue; m=lf<=0.3?1:(0.7-lf)/0.4; }
    const v=sampleS(f,x*step,y*step), o=(y*w+x)*4; if(v==null) continue;
    const c=colorAt(t,v); D[o]=c[0]; D[o+1]=c[1]; D[o+2]=c[2]; D[o+3]=c[3]*alpha*m; }
  og.putImageData(img,0,0); g.imageSmoothingEnabled=true; g.imageSmoothingQuality="high"; g.drawImage(off,0,0,w*step,h*step);
  if(ov.nums) drawNumbers(g, f, sz);
}
// petits chiffres répartis régulièrement (≈ tous les 85 px), valeur interpolée
function drawNumbers(g, f, sz){
  const t=f.t, gap=sz.x>900?115:88, ox=(map.containerPointToLayerPoint([0,0]).x % gap + gap) % gap, oy=(map.containerPointToLayerPoint([0,0]).y % gap + gap) % gap;
  g.font="600 11px Inter,system-ui,sans-serif"; g.textAlign="center"; g.textBaseline="middle";
  g.font="700 12px Inter,system-ui,sans-serif"; g.lineJoin="round";
  const ui=[[0,0,64,64],[sz.x-64,0,sz.x,150],[0,sz.y-260,70,sz.y],[sz.x-70,sz.y-260,sz.x,sz.y]]; // évite les boutons
  for(let y=gap/2-oy+gap; y<sz.y-20; y+=gap) for(let x=gap/2-ox; x<sz.x-10; x+=gap){
    if(x<12||y<70) continue; if(ui.some(([a,b,c,d])=>x>a&&x<c&&y>b&&y<d)) continue;
    if(t.api==="mar" && isLandXY(x,y)) continue;
    const v=sampleS(f,x,y); if(v==null) continue;
    const txt = t.dec ? v.toFixed(t.dec) : String(Math.round(v));
    g.lineWidth=3.5; g.strokeStyle="rgba(255,255,255,.92)"; g.strokeText(txt,x,y); g.fillStyle="#0B2F5B"; g.fillText(txt,x,y);
  }
  g.shadowBlur=0; g.shadowColor="transparent";
}
let fieldRaf=null;
export function drawLegend(){
  const c=$("tLegend"), dpr=window.devicePixelRatio||1, W=c.clientWidth, H=c.clientHeight; if(!W||!ov.type) return;
  c.width=W*dpr; c.height=H*dpr; const g=c.getContext("2d"); g.scale(dpr,dpr);
  const t=OVT[ov.type], r=ramp(t), lo=r[0][0], hi=r[r.length-1][0], X=v=>8+(v-lo)/(hi-lo)*(W-16);
  for(let x=8;x<=W-8;x++){ const v=lo+(x-8)/(W-16)*(hi-lo), col=colorAt(t,v); g.fillStyle=`rgba(${col[0]|0},${col[1]|0},${col[2]|0},${Math.max(col[3]/255,.15)})`; g.fillRect(x,2,1.5,8); }
  g.font="500 10px Inter,system-ui,sans-serif"; g.fillStyle="#4A5D73"; g.textAlign="center";
  r.forEach(([v])=>g.fillText(String(v), Math.min(Math.max(X(v),10),W-10), H-1));
  g.textAlign="right"; g.fillStyle="#9fc0e6";
}
// valeur au toucher (façon Windy)
let pick=null;
export function showPicker(ll){ pick=ll; updatePicker(); }
export function updatePicker(){
  if(!pick||!ov.data){ map.closePopup(); return; }
  const f=buildGrid(), pt=map.latLngToContainerPoint(pick), t=f.t, onLand=t.api==="mar" && landFrac(pick.lat,pick.lng)>0.5, v=onLand?null:sampleS(f,pt.x,pt.y);
  const el=document.createElement("div"); el.className="pickc";
  if(v==null){ el.innerHTML = onLand ? "<b>Terre</b><small>pas de "+t.name.toLowerCase()+" ici</small>" : "<b>—</b><small>hors données</small>"; }
  else { let extra=""; if(t.vec){ const s=sample(f,pt.x,pt.y); if(s){ const to=(Math.atan2(s[0],-s[1])*180/Math.PI+360)%360, from=(to+180)%360;
      extra = ov.type==="cur" ? "porte au "+pad3(to)+"°" : "du "+pad3(from)+"° "+compass(from); } }
    el.innerHTML=`<b>${v.toFixed(t.dec)} <span>${t.unit}</span></b><small>${extra}</small>`; }
  const btn=document.createElement("button"); btn.textContent = ov.type==="cur" ? "Courbe et marée ›" : "Prévisions ici ›";
  btn.onclick=()=>{ map.closePopup(); pick=null; ov.type==="cur" ? showCurve(L.latLng(pick0)) : meteoHere(L.latLng(pick0)); };
  const pick0=pick; el.appendChild(btn);
  L.popup({className:"pick",closeButton:false,autoPan:false,offset:[0,-4]}).setLatLng(pick).setContent(el).openOn(map);
}
export function startParticles(){
  stopParticles();
  if(!ov.type || !ov.data || !ov.anim || reduceMotion || !OVT[ov.type].anim || ov.rows<2) return;
  if(!pc.parentNode) fieldPane.appendChild(pc); L.DomUtil.setPosition(pc, map.containerPointToLayerPoint([0,0]));
  const sz=map.getSize(), dpr=window.devicePixelRatio||1; pc.width=sz.x*dpr; pc.height=sz.y*dpr; pc.style.width=sz.x+"px"; pc.style.height=sz.y+"px";
  const g=pc.getContext("2d"); g.setTransform(dpr,0,0,dpr,0,0);
  setField(buildGrid()); const k=OVT[ov.type].anim, N=Math.round(Math.min(ov.type==="cur"?900:1400, sz.x*sz.y/(ov.type==="cur"?650:450)));
  const spawn=()=>({x:Math.random()*sz.x, y:Math.random()*sz.y, age:Math.floor(Math.random()*90)});
  setParts(Array.from({length:N}, spawn));
  const frame=()=>{
    g.globalCompositeOperation="destination-in"; g.fillStyle="rgba(0,0,0,0.9)"; g.fillRect(0,0,sz.x,sz.y);
    g.globalCompositeOperation="source-over"; g.lineWidth=1.3; g.lineCap="round";
    for(const p of parts){
      const s=sample(field,p.x,p.y);
      if(!s || p.age>110 || p.x<0||p.y<0||p.x>sz.x||p.y>sz.y || (scrLand && isLandXY(p.x,p.y))){ Object.assign(p, spawn(), {age:0}); continue; }
      const nx=p.x+s[0]*k, ny=p.y+s[1]*k;
      g.strokeStyle="#fff"; g.globalAlpha = ov.type==="cur" ? Math.min(.7,.25+s[2]*.18) : Math.min(.95,.35+s[2]*.03);
      g.beginPath(); g.moveTo(p.x,p.y); g.lineTo(nx,ny); g.stroke(); p.x=nx; p.y=ny; p.age++;
    }
    g.globalAlpha=1; setPRaf(requestAnimationFrame(frame));
  };
  setPRaf(requestAnimationFrame(frame));
}

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initMasque(){
  (function(){ const im=new Image(); im.onload=()=>{ const c=document.createElement("canvas"); c.width=im.width; c.height=im.height; const g=c.getContext("2d"); g.drawImage(im,0,0);
    const px=g.getImageData(0,0,c.width,c.height).data, d=new Uint8Array(c.width*c.height); for(let i=0;i<d.length;i++) d[i]=px[i*4]>127?1:0;
    MASK.w=c.width; MASK.h=c.height; MASK.d=d; if(ov.data) drawOverlay(); }; im.src="lib/landmask.png"; })();
  fieldPane = map.createPane("fieldPane"); fieldPane.style.zIndex=350; fieldPane.style.pointerEvents="none";
  fcv = document.createElement("canvas"); fcv.id="field"; fieldPane.appendChild(fcv); off = document.createElement("canvas");
  map.on("move zoom", ()=>{ if(!ov.data||fieldRaf) return; fieldRaf=requestAnimationFrame(()=>{ fieldRaf=null; drawField(); }); });
  map.on("popupclose", e=>{ if(e.popup.options.className==="pick") pick=null; });
  document.addEventListener("visibilitychange",()=>{ if(document.hidden) stopParticles(); else if(ov.data) startParticles(); });
}
