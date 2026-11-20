// Balisage : infos des bouées et des feux (OpenStreetMap / OpenSeaMap)
import { R, map } from "../carte/carte.js";
import { pointLL } from "../carte/point.js";
import { $ } from "../utils.js";

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
