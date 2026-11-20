// Hors ligne : prévisions 3 jours sur les zones téléchargées
import { zones } from "./zones.js";
import { AIS } from "../mer/ais.js";
import { fetchSeries, getJSON, model } from "../meteo/calques.js";
import { $, CN, store } from "../utils.js";

/* ================= Météo hors ligne : prévisions 3 jours sur les zones téléchargées ================= */
export const WXOFF={};   // id de zone -> {t, types:{type:{pts,series}}, tbl:[{ll,f,m}]}
export const wxKey=id=>"/wx/"+id+".json";
export async function wxLoadAll(){ try{ const c=await caches.open(CN+"wx"); for(const zn of zones){ if(WXOFF[zn.id]) continue; const r=await c.match(wxKey(zn.id)); if(r) WXOFF[zn.id]=await r.json(); } }catch(e){} }
function wxTypes(mode){ return mode==="rando" ? ["wind","gust","temp","rain","snowf","frz"] : ["wind","gust","cur","wave","swell","press","rain"]; }
export async function wxDownload(zn, onProg){
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
function hubRefresh(){ try{ $("hbOff").textContent = zones.length ? zones.length+" zone"+(zones.length>1?"s":"")+" enregistrée"+(zones.length>1?"s":"") : "Cartes et météo";
  $("hbAis").textContent = AIS.on ? (AIS.ships.size? AIS.ships.size+" navire"+(AIS.ships.size>1?"s":"") : "Activé") : "Désactivé"; }catch(e){} }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initMeteo(){
  wxLoadAll();

  /* Menu Plus : tuiles qui ouvrent une rubrique, résumés à jour */
  document.querySelectorAll("#sMenu [data-open]").forEach(b=>b.onclick=()=>{ const d=$(b.dataset.open); d.open=true; setTimeout(()=>d.scrollIntoView({behavior:"smooth",block:"start"}),50); });
  $("bMenu").addEventListener("click", hubRefresh);
}
