// Réglages : test des fonds de carte, clé SHOM, mode nuit, écran allumé
import { bases, setShomErr, setShomKey, setShomOk, shomErr, shomKey, shomOk, shomUrl } from "../carte/carte.js";
import { closeSheets } from "./panneaux.js";
import { $, store, toast } from "../utils.js";

/* ---- Test des fonds de carte depuis le téléphone ---- */
export function tileXY(lat,lng,z){ const n=2**z, r=lat*Math.PI/180; return {x:Math.floor((lng+180)/360*n), y:Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n), z}; }
const SRC_TEST = [
  ["litto","Carte littorale IGN-SHOM"],["scan25","Carte IGN 1:25 000"],["ign","Plan IGN"],["ortho","Photos aériennes IGN"],
  ["shom","Cartes marines SHOM (clé)"],["emod","Bathymétrie EMODnet"],["osm","OpenStreetMap"]];
let wakeLock=null;
export async function wake(){ if(!$("wake").checked||!("wakeLock" in navigator)) return; try{ wakeLock=await navigator.wakeLock.request("screen"); }catch(e){} }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initReglages(){
  $("bTestSrc").onclick = () => {
    const el=$("srcTest"); el.innerHTML=""; const t=tileXY(48.36,-4.55,12);
    SRC_TEST.forEach(([k,name])=>{ const row=document.createElement("div"); row.innerHTML=`<span>${name}</span><b style="color:var(--muted)">test…</b>`; el.appendChild(row);
      const url=L.Util.template(bases[k]._url,{z:t.z,x:t.x,y:t.y,s:"a",r:""}), img=new Image(); let done=false;
      const set=(ok,msg)=>{ if(done) return; done=true; const b=row.querySelector("b"); b.textContent=msg; b.style.color=ok?"var(--green)":"var(--red)"; };
      img.onload=()=>set(img.naturalWidth>1,"✓ disponible"); img.onerror=()=>set(false,"✗ refusé"); setTimeout(()=>set(false,"✗ pas de réponse"),12000);
      img.src=url+(url.includes("?")?"&":"?")+"_t="+Date.now(); });
  };
  /* ================= Réglages ================= */
  $("shomkey").value = shomKey;
  $("bKey").onclick = () => { setShomKey($("shomkey").value.trim()); store.set("shomkey", shomKey);
    bases.shom.setUrl(shomUrl("RASTER_MARINE_3857_WMTS")); bases.gebco.setUrl(shomUrl("FDC_GEBCO_PYR-PNG_3857_WMTS"));
    setShomOk(0); setShomErr(0); document.querySelector("input[name=base][value=shom]").click(); closeSheets();
    toast(shomKey ? "Clé enregistrée : chargement des cartes SHOM…" : "Clé effacée"); };
  { const n=store.get("night",false), t=store.get("nightAt",0); // le mode nuit s'efface seul après 12 h
    $("night").checked = !!n && Date.now()-t < 12*3600e3; if(n && !$("night").checked) store.set("night",false); }
  document.body.classList.toggle("night",$("night").checked); $("nightOff").hidden=!$("night").checked;
  $("nightOff").onclick=()=>{ $("night").checked=false; $("night").onchange({target:$("night")}); };
  $("night").onchange=e=>{ document.body.classList.toggle("night",e.target.checked); store.set("night",e.target.checked); store.set("nightAt",Date.now()); $("nightOff").hidden=!e.target.checked; toast(e.target.checked?"Mode nuit : écran rouge pour la vision nocturne":"Mode nuit coupé"); };
  $("wake").checked=store.get("wake",true);
  $("wake").onchange=e=>{ store.set("wake",e.target.checked); if(e.target.checked) wake(); else if(wakeLock){ wakeLock.release(); wakeLock=null; } };
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") wake(); });
  document.addEventListener("click",wake,{once:true}); wake();
}
