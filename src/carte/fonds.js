// Fonds de carte : satellite en un geste, pentes, panneau Cartes, calage, ombrage, bascule sur les photos
import { FRANCE, R, bases, curBase, fmtD, geopf, map, setCurBase, shomKey, slopes } from "./carte.js";
import { pointLL } from "./point.js";
import { last } from "../gps/gps.js";
import { geoStart } from "../gps/natif.js";
import { elevations } from "../main.js";
import { renderRoutes } from "../mer/routes.js";
import { closeSheets, openSheet } from "../ui/panneaux.js";
import { tileXY } from "../ui/reglages.js";
import { $, compass, fmtDur, store, toast } from "../utils.js";

export let shade;
let calLayer, shadePane;

/* ---------- Satellite en un geste ---------- */
let satPrev=null;
function syncSat(){ $("bSat").classList.toggle("on", curBase==="ortho"); }
/* ---- Pentes : surimpression IGN, et calcul au point touché ---- */
export function setSlopes(on){ store.set("slopes",on); $("slopeChk").checked=on; $("bSlope").classList.toggle("on",on); if(on && R()) slopes.addTo(map); else map.removeLayer(slopes); }
// Point touché en Rando : altitude en grand, pente (alerte au-delà de 30°), versant, distance, dénivelé et temps depuis ma position
async function slopeData(ll){
  try{ const dLat=15/111320, dLng=15/(111320*Math.cos(ll.lat*Math.PI/180));
    const pts=[[ll.lat,ll.lng],[ll.lat,ll.lng+dLng],[ll.lat+dLat,ll.lng]]; if(last) pts.push([last.ll.lat,last.ll.lng]);
    const z=await elevations(pts); if(z.slice(0,3).some(v=>v==null)) return null;
    const gx=(z[1]-z[0])/15, gy=(z[2]-z[0])/15, slope=Math.round(Math.atan(Math.hypot(gx,gy))*180/Math.PI);
    return {z:Math.round(z[0]), slope, asp:compass((Math.atan2(-gx,-gy)*180/Math.PI+360)%360), me:last?z[3]:null};
  }catch(e){ return null; } }
export async function pointInfo(ll){
  const s=await slopeData(ll); if(pointLL!==ll || !s) return;
  $("pAltRow").hidden=false; $("pAlt").textContent=s.z.toLocaleString("fr-FR")+" m";
  const ch=[`<span class="${s.slope>=30?"warn":""}">Pente ${s.slope}°${s.slope>=30?" · zone d'avalanche possible":""}</span>`];
  if(s.slope>=3) ch.push(`<span>Versant ${s.asp}</span>`);
  if(last && s.me!=null){ const d=map.distance(last.ll,ll), up=s.z-s.me, h=d/4000, v=up>0?up/300:-up/500;
    ch.push(`<span>${fmtD(d)} · ${up>=0?"+":"−"}${Math.abs(Math.round(up))} m depuis vous</span>`, `<span>≈ ${fmtDur(Math.max(h,v)+Math.min(h,v)/2)} à vol d'oiseau</span>`); }
  $("pChips").innerHTML=ch.join(""); }
async function slopeAt(ll){ // pente et exposition sur 3 points distants de 15 m
  try{ const dLat=15/111320, dLng=15/(111320*Math.cos(ll.lat*Math.PI/180));
    const z=await elevations([[ll.lat,ll.lng],[ll.lat,ll.lng+dLng],[ll.lat+dLat,ll.lng]]); if(z.some(v=>v==null)) return null;
    const gx=(z[1]-z[0])/15, gy=(z[2]-z[0])/15, slope=Math.atan(Math.hypot(gx,gy))*180/Math.PI;
    const aspect=(Math.atan2(-gx,-gy)*180/Math.PI+360)%360; // direction vers laquelle la pente descend
    return Math.round(z[0])+" m · pente "+Math.round(slope)+"°"+(slope>=2?" · exposition "+compass(aspect):"")+(slope>=30?" ⚠":"");
  }catch(e){ return null; } }
function markSelMaps(){ document.querySelectorAll(".mapc").forEach(el=>el.classList.toggle("sel", el.querySelector("input").value===curBase)); }
function openMaps(){
  if(!$("sMaps").hidden) return closeSheets();
  $("mapsMode").textContent = R() ? "· mode Rando" : "· mode Mer";
  document.querySelector('.mapc input[value="shom"]').closest(".mapc").hidden = !shomKey;
  const c=map.getCenter();
  document.querySelectorAll(".mapc").forEach(el=>{ const k=el.querySelector("input").value, ly=bases[k]; if(!ly || el.offsetParent===null && el.hidden) return;
    const z=Math.max(6, Math.min(Math.round(map.getZoom()), ly.options.maxNativeZoom||18)), t=tileXY(c.lat,c.lng,z), img=el.querySelector("img");
    const u=L.Util.template(ly._url,{z,x:t.x,y:t.y,s:"a",r:""}); if(img.dataset.u!==u){ img.dataset.u=u; img.src=u; } });
  markSelMaps(); openSheet("sMaps");
}
function scaleWarn(){ const ly=bases[curBase], nz=ly&&ly.options.maxNativeZoom, over = nz && map.getZoom()>nz;
  $("scale").classList.toggle("warn", !!over); $("scale").title = over ? "Zoom au-delà de l'échelle de la carte : détails agrandis, précision non améliorée" : ""; }
export function setShade(on){ store.set("shade",on); $("shadeChk").checked=on; if(on && R() && curBase!=="ortho") shade.addTo(map); else map.removeLayer(shade); }
/* ---- Bascule automatique sur les photos aériennes au-delà du détail du 1:25 000 ---- */
export let autoSatOn=false;
function swapBase(k){ if(k===curBase) return; map.removeLayer(bases[curBase]); setCurBase(k); bases[k].addTo(map); bases[k].bringToBack();
  const rb=document.querySelector(`input[name=base][value=${k}]`); if(rb) rb.checked=true; if(typeof markSelMaps==="function") markSelMaps(); setShade(store.get("shade",true)); scaleWarn(); }
export function autoSatCheck(){
  const lim=(bases.scan25.options.maxNativeZoom||16);
  if(R() && navigator.onLine && store.get("autoSat",true) && !autoSatOn && curBase==="scan25" && map.getZoom()>lim){ autoSatOn=true; swapBase("ortho"); toast("Zoom maximal : photos aériennes (le 1:25 000 n'a pas plus de détail)",4000); }
  else if(autoSatOn && (map.getZoom()<=lim || !R() || !store.get("autoSat",true))){ autoSatOn=false; if(curBase==="ortho") swapBase("scan25"); }
}

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initFonds(){
  $("bSat").onclick=()=>{ const target = curBase==="ortho" ? (satPrev || (R()?"scan25":"litto")) : "ortho"; if(curBase!=="ortho") satPrev=curBase;
    document.querySelector(`input[name=base][value=${target}]`).click(); syncSat(); toast(target==="ortho"?"Vue satellite (photos aériennes IGN)":"Retour à la carte"); };
  document.querySelectorAll("input[name=base]").forEach(r=>r.addEventListener("change", syncSat)); syncSat();

  renderRoutes(); geoStart();

  $("bgAlways").checked=store.get("bgAlways",false); $("bgAlways").onchange=e=>{ store.set("bgAlways",e.target.checked); geoStart(); };
  $("slopeChk").onchange=e=>setSlopes(e.target.checked);
  $("bSlope").onclick=()=>{ const on=!store.get("slopes",false); setSlopes(on); toast(on?"Carte des pentes : jaune > 30°, orange > 35°, rouge > 40°, violet > 45°":"Carte des pentes masquée", 4000); };
  setSlopes(store.get("slopes",false));
  /* ---- Panneau Cartes : fonds selon le mode, avec aperçu du lieu ---- */
  document.querySelectorAll(".mapc img").forEach(im=>{ im.addEventListener("error",()=>im.closest(".mapc").classList.add("noimg")); im.addEventListener("load",()=>im.closest(".mapc").classList.remove("noimg")); });
  $("bLayers").onclick = openMaps;
  document.querySelectorAll("input[name=base]").forEach(r=>r.addEventListener("change", markSelMaps));
  /* ---- Calage : photo superposée + alerte de zoom au-delà de l'échelle de la carte ---- */
  calLayer = L.tileLayer(geopf("ORTHOIMAGERY.ORTHOPHOTOS","image/jpeg"), {maxZoom:19, bounds:FRANCE, opacity:.5, zIndex:5, attribution:"© IGN"});
  $("calChk").onchange=e=>{ $("calRow").hidden=!e.target.checked; if(e.target.checked){ calLayer.setOpacity($("calOp").value/100); calLayer.addTo(map); } else map.removeLayer(calLayer); };
  $("calOp").oninput=e=>calLayer.setOpacity(e.target.value/100);
  map.on("zoomend", scaleWarn); document.querySelectorAll("input[name=base]").forEach(r=>r.addEventListener("change", scaleWarn)); scaleWarn();
  $("scale").onclick=()=>{ if($("scale").classList.contains("warn")) toast("Carte agrandie au-delà de son échelle d'origine : les détails grossissent, la précision ne s'améliore pas. Gardez une marge de sécurité.", 6000); };
  /* ---- Ombrage du relief (estompage IGN), en mode multiplication pour garder la carte lisible ---- */
  shadePane = map.createPane("shadePane"); shadePane.style.zIndex=250; shadePane.style.mixBlendMode="multiply"; shadePane.style.pointerEvents="none";
  shade = L.tileLayer("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW&STYLE=estompage_grayscale&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png",
    {pane:"shadePane", maxZoom:19, maxNativeZoom:15, opacity:.9, bounds:FRANCE, attribution:"Relief © IGN"});
  $("shadeChk").onchange=e=>setShade(e.target.checked);
  map.on("zoomend", autoSatCheck);
  document.querySelectorAll("input[name=base]").forEach(r=>r.addEventListener("change", ()=>{ autoSatOn=false; setShade(store.get("shade",true)); }));
  $("autoSat").checked=store.get("autoSat",true); $("autoSat").onchange=e=>{ store.set("autoSat",e.target.checked); autoSatCheck(); };
  setShade(store.get("shade",true));
}
