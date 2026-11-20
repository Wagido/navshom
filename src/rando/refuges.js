// Refuges, cabanes, points d'eau (refuges.info)
import { R, map } from "../carte/carte.js";
import { $, store, toast } from "../utils.js";

let REF;

const REF_T={"refuge gardé":["R","#2E7D32"],"cabane non gardée":["C","#8D6E63"],"gîte d'étape":["G","#6A1B9A"],"point d'eau":["💧","#1E88E5"],"bivouac":["B","#00897B"],"abri sommaire":["A","#8D6E63"]};
async function refLoad(){ if(!map.hasLayer(REF.layer)) return; if(map.getZoom()<11){ REF.layer.clearLayers(); return; }
  const b=map.getBounds(), key=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].map(x=>x.toFixed(3)).join(","); if(key===REF.key) return; REF.key=key;
  try{ const j=await (await fetch("https://www.refuges.info/api/bbox?bbox="+key+"&type_points=all&format=geojson&detail=simple")).json(); REF.layer.clearLayers();
    j.features.forEach(f=>{ const p=f.properties, t=REF_T[p.type.valeur]; if(!t) return; const [lo,la]=f.geometry.coordinates;
      L.marker([la,lo],{icon:L.divIcon({className:"refi",iconSize:[26,26],iconAnchor:[13,13],html:`<b style="background:${t[1]}">${t[0]}</b>`}),zIndexOffset:650}).addTo(REF.layer)
       .bindPopup(`<b>${p.nom}</b><br>${p.type.valeur}${p.coord&&p.coord.alt?" · "+p.coord.alt+" m":""}${p.places&&p.places.valeur?" · "+p.places.valeur+" places":""}<br><a href="${p.lien}" target="_blank" rel="noopener">Fiche refuges.info</a>`); }); }catch(e){ REF.key=""; } }
export function refSet(on){ store.set("refuges",on); $("refChk").checked=on; if(on && R()){ REF.layer.addTo(map); REF.key=""; refLoad(); if(map.getZoom()<11) toast("Zoomez pour voir les refuges"); } else map.removeLayer(REF.layer); }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initRefuges(){
  /* ================= Refuges, cabanes, points d'eau (refuges.info) ================= */
  REF = {layer:L.layerGroup(), key:""};
  $("refChk").onchange=e=>refSet(e.target.checked); map.on("moveend", ()=>{ clearTimeout(REF.t); REF.t=setTimeout(refLoad,500); });
  map.attributionControl.addAttribution('<a href="https://www.refuges.info" target="_blank" rel="noopener">refuges.info</a>');
  refSet(store.get("refuges",false));
}
