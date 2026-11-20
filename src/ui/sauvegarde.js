// Sauvegarde et restauration
import { CapFS, CapShare } from "../gps/natif.js";
import { APP_VERSION } from "./version.js";
import { $, LSP, toast } from "../utils.js";

/* ---------- Sauvegarde et restauration ---------- */
export async function saveFile(name, text, mime){
  if(CapFS && CapShare){ try{ const r=await CapFS.writeFile({path:name, data:text, directory:"CACHE", encoding:"utf8"});
      await CapShare.share({title:name, url:r.uri, dialogTitle:"Enregistrer ou envoyer"}); return true; }catch(e){ if(/cancel/i.test(String(e&&e.message||e))) return false; } }
  const file=new File([text],name,{type:mime});
  try{ if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file], title:name}); return true; } }catch(e){ if(e && e.name==="AbortError") return false; }
  try{ const a=document.createElement("a"); a.href=URL.createObjectURL(file); a.download=name; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },3000); toast("Fichier "+name+" enregistré"); return true; }
  catch(e){ toast("Enregistrement impossible sur cet appareil"); return false; }
}
let pendingRestore=null;

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initSauvegarde(){
  $("bBackup").onclick = () => {
    const data={}; try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k.startsWith(LSP)) data["nav_"+k.slice(LSP.length)]=localStorage.getItem(k); } }catch(e){}
    const d=new Date(), name="balise-sauvegarde-"+d.toISOString().slice(0,10)+".json";
    saveFile(name, JSON.stringify({app:"navshom", v:1, date:d.toISOString(), version:APP_VERSION, data}), "application/json");
  };
  $("restoreIn").onchange = async e => {
    const f=e.target.files[0]; e.target.value=""; if(!f) return;
    try{ const j=JSON.parse(await f.text()); if(j.app!=="navshom" || !j.data) throw 0;
      pendingRestore=j; const nt=(()=>{ try{ return JSON.parse(j.data.nav_tracks||"[]").length; }catch(e){ return 0; } })(), nr=(()=>{ try{ return JSON.parse(j.data.nav_routes||"[]").length; }catch(e){ return 0; } })();
      $("restoreMsg").textContent="Sauvegarde du "+new Date(j.date).toLocaleString("fr-FR",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})+" : "+nt+" trace(s), "+nr+" route(s). Elle remplacera vos données actuelles.";
      $("restoreBox").hidden=false;
    }catch(err){ toast("Ce fichier n'est pas une sauvegarde Balise"); }
  };
  $("restoreNo").onclick = () => { pendingRestore=null; $("restoreBox").hidden=true; };
  $("restoreYes").onclick = () => { if(!pendingRestore) return;
    try{ Object.keys(localStorage).filter(k=>k.startsWith(LSP)).forEach(k=>localStorage.removeItem(k)); Object.entries(pendingRestore.data).forEach(([k,v])=>{ if(k.startsWith("nav_")) localStorage.setItem(LSP+k.slice(4),v); }); }
    catch(e){ return toast("Restauration impossible (mémoire pleine ?)"); }
    toast("Données restaurées : redémarrage…"); setTimeout(()=>location.reload(), 800); };
}
