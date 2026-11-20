// Panneaux (feuilles du bas), menu Plus, lieux rapides
import { SPOTS, map } from "../carte/carte.js";
import { renderWps, wps } from "../carte/point.js";
import { routes, setFollow, tracks, usageNote } from "../main.js";
import { $ } from "../utils.js";

/* ================= Panneaux ================= */
export const sheets = ["sPoint","sMeteo","sMenu","sCurve","sTrack","sAnchor","sMaps","sRouting"];
export let tmpMarker=null;
export function openSheet(id){ sheets.forEach(s => $(s).hidden = s!==id); }
export function closeSheets(){ sheets.forEach(s => $(s).hidden = true); if(tmpMarker){ map.removeLayer(tmpMarker); tmpMarker=null; } }
function menuCounts(){ try{ $("mcTrN").textContent=tracks.length; $("mcWpN").textContent=wps.length; $("mcRtN").textContent=routes.length; }catch(e){} usageNote(); }
export function markTmp(ll){ if(tmpMarker) map.removeLayer(tmpMarker); tmpMarker=L.circleMarker(ll,{radius:8,color:"#fff",weight:3,fillColor:"#0b63b6",fillOpacity:1}).addTo(map); }

// pour les autres modules (une variable importée ne peut pas être modifiée directement)
export function setTmpMarker(v){ tmpMarker = v; return v; }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initPanneaux(){
  document.querySelectorAll("[data-close]").forEach(b => b.onclick = closeSheets);
  $("bMenu").onclick = () => { if(!$("sMenu").hidden) return closeSheets(); $("sMenu").classList.remove("searching"); menuCounts(); renderWps(); openSheet("sMenu"); };
  $("bLayers").onclick = $("bMenu").onclick;
  SPOTS.forEach((sp,i)=>{ const o=document.createElement("option"); o.value=i; o.textContent=sp[0]; $("spot").appendChild(o); });
  $("spot").insertAdjacentHTML("afterbegin",'<option value="" selected>Choisir…</option>');
  $("spot").onchange = e => { if(e.target.value==="") return; const sp=SPOTS[+e.target.value]; setFollow(false); map.setView(sp[1], sp[2]); closeSheets(); e.target.value=""; };
  $("bSearch").onclick = () => { $("sMenu").classList.add("searching"); menuCounts(); renderWps(); openSheet("sMenu"); setTimeout(()=>$("q").focus(),50); };
}
