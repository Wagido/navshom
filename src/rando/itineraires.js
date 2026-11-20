// Itinéraires sur les sentiers (IGN)
import { R, map } from "../carte/carte.js";
import { drawMeasure, mPts, measuring } from "../carte/mesure.js";
import { getJSON } from "../meteo/calques.js";
import { $, store, toast } from "../utils.js";

let segCache;

let trailWarned=false;
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

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initItineraires(){

  /* ---------- Itinéraires sur les sentiers (IGN) ---------- */
  segCache = new Map();
  $("mTrail").checked = store.get("trail", true);
  $("mTrail").onchange = () => { store.set("trail",$("mTrail").checked); drawMeasure(); };
}
