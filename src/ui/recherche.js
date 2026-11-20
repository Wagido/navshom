// Recherche de lieux (IGN)
import { AREA, MODE, R, map } from "../carte/carte.js";
import { setFollow } from "../gps/gps.js";
import { renderRec, setMode } from "../main.js";
import { getJSON } from "../meteo/calques.js";
import { closeSheets, markTmp } from "./panneaux.js";
import { $ } from "../utils.js";

/* ---- Recherche de lieux (IGN) ---- */
let qT=null;
async function search(q){
  const el=$("qRes"); el.innerHTML='<p class="note">Recherche…</p>';
  try{
    const [a,b]=await Promise.all([
      getJSON(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&index=poi&limit=6`).catch(()=>({features:[]})),
      getJSON(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=5`).catch(()=>({features:[]}))]);
    const items=[...a.features.map(f=>({name:[].concat(f.properties.name||f.properties.toponym||"")[0], sub:[].concat(f.properties.category||[])[0]||"", city:[].concat(f.properties.city||[])[0]||"", c:f.geometry.coordinates})),
                 ...b.features.map(f=>({name:f.properties.label, sub:f.properties.type==="municipality"?"commune":"adresse", city:"", c:f.geometry.coordinates}))].filter(x=>x.name);
    el.innerHTML=""; if(!items.length){ el.innerHTML='<p class="note">Aucun résultat</p>'; return; }
    items.slice(0,10).forEach(it=>{ const row=document.createElement("div"), t=document.createElement("span"); t.innerHTML="<b></b><br><small style='color:var(--muted)'></small>";
      t.querySelector("b").textContent=it.name; t.querySelector("small").textContent=[it.sub,it.city].filter(Boolean).join(" · ");
      const go=document.createElement("button"); go.textContent="Voir";
      const act=()=>{ const ll=L.latLng(it.c[1],it.c[0]); if(!AREA().contains(ll)){ if(!R()) setMode("rando",true); }
        setFollow(false); map.setView(ll, Math.max(map.getZoom(),14)); closeSheets(); markTmp(ll); };
      go.onclick=act; t.style.cursor="pointer"; t.onclick=act; row.append(t,go); el.append(row); });
  }catch(e){ el.innerHTML='<p class="note">Recherche indisponible (réseau ?)</p>'; }
}

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initRecherche(){
  $("q").addEventListener("input", ()=>{ clearTimeout(qT); const q=$("q").value.trim(); if(q.length<3){ $("qRes").innerHTML=""; return; } qT=setTimeout(()=>search(q),350); });
  setMode(MODE, true);
  renderRec();
}
