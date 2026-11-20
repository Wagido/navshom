// Hors ligne : paquets de relief par massif (relief/<id>.bin.gz, préparés par tools-relief.js)
import { R, map } from "../carte/carte.js";
import { setFollow } from "../gps/gps.js";
import { usageNote, zoneUrls, zones } from "./zones.js";
import { V3DP, v3DemUrl, v3KeepLib } from "../rando/vue3d.js";
import { closeSheets } from "../ui/panneaux.js";
import { $, CN, store, toast } from "../utils.js";

export let mInst;
let massifs;

async function massifLoad(){ if(massifs && massifs.length) return massifs; try{ massifs = await (await fetch("relief/massifs.json", {cache:"no-cache"})).json(); }catch(e){ massifs = []; } return massifs; }
export function massifUrls(id){ const m = mInst[id], out = []; if(!m) return out; for(let y=0;y<m.ny;y++) for(let x=0;x<m.nx;x++) out.push(v3DemUrl(m.x0+x, m.y0+y)); return out; }
async function massifInstall(m, btn){
  if(!("DecompressionStream" in window) || !("caches" in window)) return toast("Ce navigateur ne permet pas les paquets de relief");
  try{ navigator.storage && navigator.storage.persist && navigator.storage.persist(); }catch(e){}
  btn.disabled = true; btn.textContent = "0 %";
  try{
    const r = await fetch("relief/"+m.id+".bin.gz", {cache:"no-cache"}); if(!r.ok) throw new Error(r.status);
    const total = m.kb*1024, rd = r.body.getReader(), chunks = []; let got = 0;
    for(;;){ const {done, value} = await rd.read(); if(done) break; chunks.push(value); got += value.length; btn.textContent = Math.min(99, Math.round(90*got/total))+" %"; }
    let blob = new Blob(chunks); const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    if(head[0]===0x1f && head[1]===0x8b) blob = await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).blob();
    const buf = await blob.arrayBuffer(), u8 = new Uint8Array(buf), dv = new DataView(buf);
    if(String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== "BRL1") throw new Error("format");
    const x0 = dv.getUint16(4, true), y0 = dv.getUint16(6, true), nx = dv.getUint16(8, true), ny = dv.getUint16(10, true), P = V3DP;
    const c = await caches.open(CN+"tiles"); let o = 12, n = 0;
    for(let ty=0; ty<ny; ty++) for(let tx=0; tx<nx; tx++){
      if(!u8[o++]) continue;
      const t = new Int16Array(buf.slice(o, o+P*P*2)), f = new Float32Array(P*P); o += P*P*2;
      for(let j=0;j<P;j++){ let prev = null; for(let i=0;i<P;i++){ const k = j*P+i, v = t[k];
        if(v === -32768){ f[k] = -99999; prev = null; } else { prev = prev===null ? v : prev+v; f[k] = prev; } } }
      await c.put(v3DemUrl(x0+tx, y0+ty), new Response(f.buffer, {headers:{"Content-Type":"image/x-bil;bits=32"}}));
      if(++n % 20 === 0) btn.textContent = (90+Math.round(10*n/m.tiles))+" %"; }
    mInst[m.id] = {x0, y0, nx, ny, n, d:new Date().toISOString()}; store.set("massifs", mInst); v3KeepLib();
    toast("Relief « "+m.name+" » enregistré : vue 3D sans réseau dans le massif", 4000);
  }catch(e){ toast("Téléchargement du relief impossible ("+e.message+")"); }
  renderMassifs(); usageNote();
}
async function massifDelete(m){
  const keep = new Set(); zones.forEach(z => zoneUrls(z).forEach(u => keep.add(u)));
  Object.keys(mInst).filter(id => id !== m.id).forEach(id => massifUrls(id).forEach(u => keep.add(u)));
  try{ const c = await caches.open(CN+"tiles"); await Promise.all(massifUrls(m.id).filter(u => !keep.has(u)).map(u => c.delete(u))); }catch(e){}
  delete mInst[m.id]; store.set("massifs", mInst); renderMassifs(); usageNote(); toast("Relief « "+m.name+" » supprimé");
}
async function renderMassifs(){ const el = $("massifList"), list = await massifLoad(); el.innerHTML = "";
  if(!list.length){ el.innerHTML = '<p class="note" style="margin:4px 0">Liste des massifs indisponible (réseau ?).</p>'; return; }
  list.forEach(m => { const row = document.createElement("div"), inst = mInst[m.id];
    row.innerHTML = '<span style="flex:1;min-width:0"><b></b><small style="display:block;color:var(--muted);font-size:12px"></small></span><button data-a="see">Voir</button><button data-a="go"></button>';
    row.querySelector("b").textContent = m.name;
    row.querySelector("small").textContent = inst ? "Enregistré le "+new Date(inst.d).toLocaleDateString("fr-FR")+" · "+Math.round(inst.n*64/1024)+" Mo sur le téléphone"
      : (m.kb/1024).toFixed(1).replace(".", ",")+" Mo à télécharger · "+Math.round(m.tiles*64/1024)+" Mo sur le téléphone";
    const go = row.querySelector('[data-a=go]'); go.textContent = inst ? "Supprimer" : "Télécharger"; if(inst) go.style.color = "#C62828";
    go.onclick = () => inst ? (confirm("Supprimer le relief « "+m.name+" » du téléphone ?") && massifDelete(m)) : massifInstall(m, go);
    row.querySelector('[data-a=see]').onclick = () => { closeSheets(); const b = L.latLngBounds([m.b[0], m.b[1]], [m.b[2], m.b[3]]); setFollow(false); map.fitBounds(b);
      const r = L.rectangle(b, {color:"#2E7D32", weight:2, dashArray:"6 6", fill:false, interactive:false}).addTo(map); setTimeout(() => map.removeLayer(r), 4000); };
    el.appendChild(row); }); }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initRelief(){
  /* ---- Paquets de relief par massif (relief/<id>.bin.gz, préparés par tools-relief.js) ---- */
  // Le paquet est décompressé sur le téléphone et chaque tuile est rangée dans navshom-tiles sous son adresse WMS :
  // la vue 3D la trouve comme si elle venait du réseau.
  massifs = null; mInst = store.get("massifs", {});
  $("cOff").addEventListener("toggle", () => { if($("cOff").open && R()) renderMassifs(); });
}
