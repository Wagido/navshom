// Particules animées (vent, courant)
import { map } from "../carte/carte.js";
import { OVT, ov } from "./calques.js";

export let reduceMotion, pc;

export let pRaf=null, parts=[], field=null;
export function stopParticles(){ if(pRaf) cancelAnimationFrame(pRaf); pRaf=null; const g=pc.getContext("2d"); g.clearRect(0,0,pc.width,pc.height); }
export function buildGrid(){
  const i=ov.idx, R=ov.rows, C=ov.cols;
  const a=map.latLngToContainerPoint(ov.pts[0]), b=map.latLngToContainerPoint(ov.pts[R*C-1]);
  const cw=(b.x-a.x)/(C-1), ch=(b.y-a.y)/(R-1), U=[], V=[], S=[];
  for(let k=0;k<R*C;k++){ const d=ov.data[k], v=d.v[i], dir=d.dir?d.dir[i]:null;
    S.push(v==null?null:v);
    if(v==null||dir==null){ U.push(0); V.push(0); continue; }
    const r=dir*Math.PI/180; U.push(v*Math.sin(r)); V.push(-v*Math.cos(r)); }
  return {x0:a.x, y0:a.y, cw, ch, R, C, U, V, S, t:OVT[ov.type]};
}
function cellAt(f,x,y){
  let fx=(x-f.x0)/f.cw, fy=(y-f.y0)/f.ch; fx=Math.max(0,Math.min(f.C-1.0001,fx)); fy=Math.max(0,Math.min(f.R-1.0001,fy));
  const c0=Math.floor(fx), r0=Math.floor(fy), dx=fx-c0, dy=fy-r0;
  return [[r0*f.C+c0,(1-dx)*(1-dy)],[r0*f.C+c0+1,dx*(1-dy)],[(r0+1)*f.C+c0,(1-dx)*dy],[(r0+1)*f.C+c0+1,dx*dy]];
}
export function sampleS(f,x,y){ let sw=0, sv=0; for(const [k,w] of cellAt(f,x,y)){ if(f.S[k]==null) continue; sw+=w; sv+=f.S[k]*w; } return sw<0.45 ? null : sv/sw; }
export function sample(f,x,y){ let sw=0,u=0,v=0; for(const [k,w] of cellAt(f,x,y)){ if(f.S[k]==null) continue; sw+=w; u+=f.U[k]*w; v+=f.V[k]*w; }
  if(sw<0.45) return null; u/=sw; v/=sw; return [u,v,Math.hypot(u,v)]; }
// palette continue
function rgbaOf(c){ if(!c) return null; if(c[0]==="#"){ const n=parseInt(c.slice(1),16); return [n>>16&255,n>>8&255,n&255,255]; } const m=c.match(/[\d.]+/g).map(Number); return [m[0],m[1],m[2],(m[3]??1)*255]; }
export function ramp(t){ if(t._ramp) return t._ramp; const r=t.scale.map(([v,c])=>[v,rgbaOf(c)]);
  r.forEach((e,j)=>{ if(!e[1]){ const nb=(r[j+1]&&r[j+1][1])||(r[j-1]&&r[j-1][1])||[255,255,255,0]; e[1]=[nb[0],nb[1],nb[2],0]; } }); return t._ramp=r; }
export function colorAt(t,v){ const r=ramp(t); if(v<=r[0][0]) return r[0][1];
  for(let j=1;j<r.length;j++){ if(v<=r[j][0]){ const [s0,c0]=r[j-1],[s1,c1]=r[j], f=(v-s0)/(s1-s0); return c0.map((x,q)=>x+(c1[q]-x)*f); } } return r[r.length-1][1]; }

// pour les autres modules (une variable importée ne peut pas être modifiée directement)
export function setPRaf(v){ pRaf = v; return v; }
export function setParts(v){ parts = v; return v; }
export function setField(v){ field = v; return v; }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initParticules(){

  /* ---- Particules animées (vent, courant) ---- */
  reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  pc = document.createElement("canvas"); pc.id="particles";
}
