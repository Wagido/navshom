// Version, écran de démarrage, À propos, bandeau « Nouvelle version », service worker
import { $, BETA } from "../utils.js";

const APP_NAME="Balise", APP_AUTHOR="Capitaine BoBo";

export const APP_VERSION=window.APP_VERSION;
/* Vérifie s'il existe une version plus récente (onglet resté ouvert plusieurs jours, appli rouverte depuis la mémoire) */
async function checkUpdate(){ if(!location.protocol.startsWith("http") || !navigator.onLine) return;
  try{ const t=await (await fetch("./?check="+Date.now(),{cache:"no-store"})).text(), m=t.match(/APP_VERSION\s*=\s*"([^"]+)"/);
    if(m && m[1]!==APP_VERSION && $("updBar").hidden){ $("updVer").textContent=m[1]; $("updBar").hidden=false; } }catch(e){} }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initVersion(){
  $("spVer").textContent="Version "+APP_VERSION+(BETA?" · bêta":"");
  (function(){ const sp=$("splash"), hide=()=>{ sp.classList.add("out"); setTimeout(()=>sp.hidden=true,600); }; sp.onclick=hide; setTimeout(hide, 1900); })();
  $("appver").textContent=APP_NAME+" · par "+APP_AUTHOR+" · version "+APP_VERSION+(BETA?" · bêta":"")+(location.hostname.endsWith("github.io")?" · mise à jour automatique":"");
  $("updGo").onclick=()=>location.reload();
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") checkUpdate(); });
  setInterval(checkUpdate, 30*60e3); setTimeout(checkUpdate, 8000);
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>r.update()).catch(()=>{});
}
