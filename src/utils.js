// Utilitaires communs : accès aux éléments, stockage (préfixe nav_ ou navb_ pour /beta/), messages, formats
// Balise : l'application (module ES, construit par Vite)
export const $ = id => document.getElementById(id);
// Site de test /beta/ : stockage et caches séparés de la production (même origine wagido.github.io)
export const BETA = /\/beta\//.test(location.pathname), LSP = BETA ? "navb_" : "nav_", CN = BETA ? "navshom-beta-" : "navshom-";
export const store = {
  get(k, d){ try{ const v = localStorage.getItem(LSP+k); return v===null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(LSP+k, JSON.stringify(v)); }catch(e){} }
};
export function toast(msg, ms=2600){ const t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true, ms); }
export const KN = 1.943844, NM = 1852;
export const pad3 = v => String(Math.round(v)%360).padStart(3,"0");
export function dm(v,pos,neg){ const h=v>=0?pos:neg; v=Math.abs(v); const d=Math.floor(v); const m=(v-d)*60; return d+"°"+m.toFixed(3).padStart(6,"0")+"'"+h; }
export const fmtLL = (la,lo) => dm(la,"N","S")+" · "+dm(lo,"E","W");
export const fmtNM = m => m < 0.1*NM ? Math.round(m)+" m" : (m/NM).toFixed(2).replace(".",",")+" M";
export function bearing(a,b){ const r=Math.PI/180, f1=a.lat*r, f2=b.lat*r, dl=(b.lng-a.lng)*r;
  return (Math.atan2(Math.sin(dl)*Math.cos(f2), Math.cos(f1)*Math.sin(f2)-Math.sin(f1)*Math.cos(f2)*Math.cos(dl))/r+360)%360; }
export function fmtDur(h){ if(!isFinite(h)) return "—"; const m=Math.round(h*60); return m<60 ? m+" min" : Math.floor(m/60)+" h "+String(m%60).padStart(2,"0"); }
export const fmtT = t => { const d=new Date(t); return d.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric"})+" "+d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}); };
export function compass(d){ return ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"][Math.round(d/22.5)%16]; }
