import { $, CN, store, toast } from "./utils.js";
import { FRANCE, MODE, R, bases, curBase, initCarte, map, seamarks, slopes } from "./carte/carte.js";
import { closeSheets, initPanneaux } from "./ui/panneaux.js";
import { initGps, setFollow } from "./gps/gps.js";
import { initPoint } from "./carte/point.js";
import { initMesure, measuring, stopMeasure } from "./carte/mesure.js";
import { fetchSeries, getJSON, initCalques, model } from "./meteo/calques.js";
import { crowdCheck, fixTl, initTableau } from "./meteo/tableau.js";
import { initParticules } from "./meteo/particules.js";
import { initMasque } from "./meteo/masque.js";
import { initCourant } from "./mer/courant.js";
import { initPrevisions } from "./meteo/previsions.js";
import { initRando, setMode } from "./rando/rando.js";
import { esc, initTraces } from "./rando/traces.js";
import { initRecherche } from "./ui/recherche.js";
import { initNatif } from "./gps/natif.js";
import { initMouillage } from "./mer/mouillage.js";
import { initRoutes } from "./mer/routes.js";
import { initItineraires } from "./rando/itineraires.js";
import { initSauvegarde } from "./ui/sauvegarde.js";
import { initMarees } from "./mer/marees.js";
import { autoSatOn, initFonds, shade } from "./carte/fonds.js";
import { RT, initRoutage } from "./mer/routage.js";
import { initReglages } from "./ui/reglages.js";
import { initInstruments } from "./mer/instruments.js";
import { AIS, initAis } from "./mer/ais.js";
import { initPluie } from "./meteo/pluie.js";
import { initSurimpressions } from "./rando/surimpressions.js";
import { initBoussole } from "./carte/boussole.js";
import { initVentDirect } from "./meteo/vent-direct.js";
import { initMaregraphes } from "./mer/maregraphes.js";
import { initRefuges } from "./rando/refuges.js";
import { V3DL_MAX, V3DP, initVue3d, v3DemUrl, v3KeepLib, v3ZoneCount, v3ZoneUrls } from "./rando/vue3d.js";
import { initVersion } from "./ui/version.js";

initCarte();
initPanneaux();
initGps();
initPoint();
initMesure();
initCalques();
initTableau();
initParticules();
initMasque();
initCourant();
initPrevisions();
initRando();
initTraces();
initRecherche();
initNatif();
initMouillage();
initRoutes();
initItineraires();
initSauvegarde();
initMarees();
initFonds();
initRoutage();
initReglages();

/* ================= Hors ligne ================= */
function tileRange(b,z){ const n=2**z, x=lng=>Math.floor((lng+180)/360*n),
  y=lat=>{ const r=lat*Math.PI/180; return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n); };
  return {x0:x(b.getWest()),x1:x(b.getEast()),y0:y(b.getNorth()),y1:y(b.getSouth())}; }
/* Zones téléchargées : on enregistre toutes les tuiles des couches affichées, du zoom 6 au détail maximal du fond */
const TILE_KB={ign1950:30,litto:30,scan25:38,ign:22,ortho:30,emod:12,shom:30,gebco:10,shade:14,slopes:6,seamarks:2}, DL_MAX=9000;
const OVL={shade, slopes, seamarks};
export let zones=store.get("zones",[]), dl=null, dlQ=0;
const lyOf=k=>bases[k]||OVL[k];
function dlKeys(){ let k=(autoSatOn&&curBase==="ortho")?"scan25":curBase;
  if(k==="osm"||k==="topo") k=R()?"scan25":"ign"; // OpenStreetMap et OpenTopoMap interdisent le téléchargement en masse : carte IGN à la place
  const ks=[k];
  if(R()){ if(store.get("shade",true) && k!=="ortho") ks.push("shade"); if(map.hasLayer(slopes)) ks.push("slopes"); }
  else if($("seamarks").checked) ks.push("seamarks");
  return ks; }
function dlZooms(k,q){ const o=lyOf(k).options, zx=Math.min(o.maxNativeZoom??o.maxZoom??18, 17)-q; return [Math.max(6,o.minNativeZoom||0), zx]; }
function tilesIn(b,k,q,cb){ const [z0,z1]=dlZooms(k,q); let n=0;
  for(let z=z0; z<=z1; z++){ const r=tileRange(b,z); n+=(r.x1-r.x0+1)*(r.y1-r.y0+1);
    if(cb) for(let x=r.x0;x<=r.x1;x++) for(let y=r.y0;y<=r.y1;y++) cb(L.Util.template(lyOf(k)._url, L.extend({},lyOf(k).options,{z,x,y,s:"a",r:""}))); }
  return n; }
function zoneUrls(zn){ const b=L.latLngBounds([zn.b[0],zn.b[1]],[zn.b[2],zn.b[3]]), out=[]; zn.keys.forEach(k=>{ if(lyOf(k)) tilesIn(b,k,zn.q||0,u=>out.push(u)); });
  if(zn.d3) out.push(...v3ZoneUrls(b)); return [...new Set(out)]; }
function dlBounds(){ const f=$("dlFrame").getBoundingClientRect(), m=map.getContainer().getBoundingClientRect();
  const nw=map.containerPointToLatLng([f.left-m.left,f.top-m.top]), se=map.containerPointToLatLng([f.right-m.left,f.bottom-m.top]);
  const b=L.latLngBounds(se,nw), A=FRANCE;
  return L.latLngBounds([Math.max(b.getSouth(),A.getSouth()),Math.max(b.getWest(),A.getWest())],[Math.min(b.getNorth(),A.getNorth()),Math.min(b.getEast(),A.getEast())]); }
function dlLayout(){ const top=$("colTL").getBoundingClientRect().bottom+14, bot=$("dlBar").getBoundingClientRect().top-14, f=$("dlFrame").style;
  const side=Math.max(18, innerWidth>700 ? innerWidth*0.12 : 18), rt=innerWidth>700?side:Math.max(side,$("colTR").getBoundingClientRect().width+26);
  f.top=top+"px"; f.left=side+"px"; f.right=rt+"px"; f.height=Math.max(80,bot-top)+"px"; }
const NAMES={ign1950:"carte IGN 1950",litto:"carte marine",scan25:"IGN 1:25 000",ign:"plan IGN",ortho:"photos aériennes",emod:"profondeurs",shom:"cartes SHOM",gebco:"GEBCO",shade:"relief",slopes:"pentes",seamarks:"balisage"};
function dlEstimate(){ if(!dl || dl.running) return; const b=dlBounds(), ks=dlKeys(), e=$("dlEst"), go=$("dlGo");
  const sub=(curBase==="osm"||curBase==="topo") ? (curBase==="osm"?"OpenStreetMap":"OpenTopoMap")+" ne se télécharge pas (interdit par le service) : "+(R()?"la carte IGN 1:25 000 est emportée":"le plan IGN est emporté")+" à la place.<br>" : "";
  let n=0, kb=0; ks.forEach(k=>{ const c=tilesIn(b,k,dlQ); n+=c; kb+=c*(TILE_KB[k]||20); });
  dl.d3=false;
  if(R()){ const c3=v3ZoneCount(b), k3=c3.dem*64+c3.ph*TILE_KB.ortho, big=c3.dem+c3.ph>V3DL_MAX, cb=$("dlD3");
    cb.disabled=big; $("dlD3Row").style.opacity=big?.55:1;
    $("dlD3Txt").textContent = big ? "Vue 3D : zone trop grande. Prenez plutôt le relief par massif (Plus › Hors ligne)" : "Vue 3D : relief et photo (≈ "+Math.max(1,Math.round(k3/1024))+" Mo)";
    if(cb.checked && !big){ n+=c3.dem+c3.ph; kb+=k3; dl.d3=true; } }
  const mo=Math.max(1,Math.round(kb/1024)), zx=dlZooms(ks[0],dlQ)[1];
  if(n>DL_MAX){ e.className="dl-s warn"; e.innerHTML=sub+"Zone trop grande ("+n.toLocaleString("fr-FR")+" tuiles). Rapprochez-vous ou choisissez « Plus léger »."; go.disabled=true; return; }
  e.className="dl-s"; e.innerHTML=sub+"<b>≈ "+mo+" Mo</b> · "+n.toLocaleString("fr-FR")+" tuiles · "+ks.map(k=>NAMES[k]||k).join(" + ")+" · détail jusqu'au 1:"+Math.round(591658711/2**zx/1000)+" 000";
  go.disabled=false; dl.n=n; dl.keys=ks; dl.b=b; }
function dlStart(){ if(!("caches" in window)) return toast("Ce navigateur ne permet pas le hors ligne");
  closeSheets(); if(measuring) stopMeasure();
  dl={running:false}; document.body.classList.add("dlmode"); $("dlFrame").hidden=false; $("dlBar").hidden=false;
  $("dlTitle").textContent="Cadrez la zone à emporter"; $("dlQ").hidden=false; $("dlP").hidden=true; $("dlGo").hidden=false; $("dlCancel").textContent="Annuler";
  requestAnimationFrame(()=>{ dlLayout(); dlEstimate(); }); }
function dlEnd(){ dl=null; document.body.classList.remove("dlmode"); $("dlFrame").hidden=true; $("dlBar").hidden=true; }
map.on("moveend zoomend", ()=>{ if(dl) dlEstimate(); }); addEventListener("resize", ()=>{ if(dl){ dlLayout(); dlEstimate(); } });
$("dlQ").onclick=e=>{ const q=e.target.dataset.q; if(q==null) return; dlQ=+q; $("dlQ").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===e.target)); dlEstimate(); };
$("dlD3").onchange=dlEstimate;
$("dlCancel").onclick=()=>{ if(dl && dl.running){ dl.stop=true; return; } dlEnd(); };
async function zoneName(c){ for(const ix of ["poi","address"]) try{ const r=await fetch("https://data.geopf.fr/geocodage/reverse?lon="+c.lng.toFixed(4)+"&lat="+c.lat.toFixed(4)+"&limit=1&index="+ix); const j=await r.json(); const p=j.features[0].properties, n=p.toponym||p.city; if(n) return n; }catch(e){}
  return "Zone du "+new Date().toLocaleDateString("fr-FR"); }
$("dlGo").onclick=async()=>{ if(!dl || dl.running || !dl.b) return;
  try{ navigator.storage && navigator.storage.persist && navigator.storage.persist(); }catch(e){}
  const wantWx=$("dlWx").checked, q=dlQ, zn={id:Date.now(), b:[dl.b.getSouth(),dl.b.getWest(),dl.b.getNorth(),dl.b.getEast()], keys:dl.keys, q, mode:MODE, d3:!!dl.d3, d:new Date().toISOString()};
  const urls=zoneUrls(zn), total=urls.length; dl.running=true;
  $("dlTitle").textContent="Téléchargement…"; $("dlQ").hidden=true; $("dlP").hidden=false; $("dlGo").hidden=true; $("dlCancel").textContent="Arrêter";
  const cache=await caches.open(CN+"tiles"); let done=0, fail=0, bytes=0; const t0=Date.now();
  const show=()=>{ $("dlProg").style.width=(100*done/total).toFixed(1)+"%"; const left=done>20? Math.round((Date.now()-t0)/done*(total-done)/1000):null;
    $("dlEst").className="dl-s"; $("dlEst").innerHTML="<b>"+Math.round(100*done/total)+" %</b> · "+done.toLocaleString("fr-FR")+" / "+total.toLocaleString("fr-FR")+" tuiles · "+(bytes/1048576).toFixed(0)+" Mo"+(left!=null?" · encore ≈ "+(left>90?Math.round(left/60)+" min":left+" s"):"")+(fail?" · "+fail+" échecs":""); };
  const worker=async()=>{ while(urls.length && !dl.stop){ const u=urls.pop();
    try{ if(!(await cache.match(u))){ let r;
        try{ r=await fetch(u,{mode:"cors"}); }catch(e){ r=await fetch(u,{mode:"no-cors"}); }
        if(r.type==="opaque") await cache.put(u,r);
        else if(r.ok){ const bl=await r.blob(); bytes+=bl.size; await cache.put(u,new Response(bl,{headers:{"Content-Type":r.headers.get("Content-Type")||"image/png"}})); }
        else if(r.status!==404) fail++; }
    }catch(e){ fail++; }
    done++; if(done%10===0||done===total) show(); } };
  show(); await Promise.all([worker(),worker(),worker(),worker(),worker()]);
  const stopped=dl.stop; dlEnd();
  if(stopped && done<total*0.98){ toast("Téléchargement arrêté ("+done+" / "+total+" tuiles déjà enregistrées)",4000); return; }
  zn.n=total; zn.mb=Math.max(1,Math.round(bytes/1048576)); zn.fail=fail; zn.name=await zoneName(L.latLngBounds([zn.b[0],zn.b[1]],[zn.b[2],zn.b[3]]).getCenter());
  zones.push(zn); store.set("zones",zones); if(zn.d3) v3KeepLib();
  if(wantWx){ toast("Cartes enregistrées · téléchargement de la météo…",3000); try{ await wxDownload(zn); }catch(e){ toast("Météo non enregistrée (réseau ou limite Open-Meteo)",4000); } }
  renderZones();
  toast("« "+zn.name+" » disponible hors ligne"+(fail?" ("+fail+" tuiles manquantes, relancez pour compléter)":""),5000); };
// Ajouter la vue 3D (relief + photo) à une zone déjà téléchargée
async function zoneAdd3D(zn, btn){
  if(!navigator.onLine) return toast("Il faut du réseau pour ajouter la vue 3D");
  const urls=v3ZoneUrls(L.latLngBounds([zn.b[0],zn.b[1]],[zn.b[2],zn.b[3]]));
  if(urls.length>V3DL_MAX) return toast("Zone trop grande pour la 3D : prenez plutôt le relief par massif", 4000);
  btn.disabled=true; btn.textContent="0 %"; const c=await caches.open(CN+"tiles"), list=urls.slice(); let done=0, bytes=0, fail=0;
  const w=async()=>{ while(list.length){ const u=list.pop();
    try{ if(!(await c.match(u))){ const r=await fetch(u,{mode:"cors"}); if(r.ok){ const b=await r.blob(); bytes+=b.size; await c.put(u,new Response(b,{headers:{"Content-Type":r.headers.get("Content-Type")||"application/octet-stream"}})); } else fail++; } }catch(e){ fail++; }
    if(++done%10===0) btn.textContent=Math.round(100*done/urls.length)+" %"; } };
  await Promise.all([w(),w(),w(),w()]);
  zn.d3=true; zn.mb=(zn.mb||0)+Math.round(bytes/1048576); store.set("zones",zones); v3KeepLib(); renderZones();
  toast("Vue 3D ajoutée à « "+zn.name+" »"+(fail?" ("+fail+" morceaux manquants, relancez plus tard)":""), 4000); }
$("bCache").onclick=dlStart; $("bCache2").onclick=dlStart;
function renderZones(){ const el=$("zoneList"); el.innerHTML="";
  if(!zones.length){ el.innerHTML='<p class="note" style="margin:4px 0">Aucune zone téléchargée pour l\'instant.</p>'; }
  zones.slice().reverse().forEach(zn=>{ const row=document.createElement("div");
    row.innerHTML='<span style="flex:1;min-width:0"><b></b><small style="display:block;color:var(--muted);font-size:12px"></small></span><button data-a="wx">Météo</button><button data-a="see">Voir</button><button data-a="del" style="color:#C62828">Supprimer</button>';
    row.querySelector("b").textContent=zn.name+(zn.mode==="rando"?" · Rando":" · Mer");
    row.querySelector("small").textContent=(zn.mb?zn.mb+" Mo · ":"")+"le "+new Date(zn.d).toLocaleDateString("fr-FR");
    const bz=document.createElement("p"); bz.className="zbs"; // étiquettes : ce que contient la zone
    bz.innerHTML='<span class="zb">'+esc(zn.keys.map(k=>NAMES[k]||k).join(" + "))+'</span>'
      +(zn.mode==="rando" ? (zn.d3 ? '<span class="zb g">Vue 3D</span>' : '<button class="zb n add3d" data-a="d3">Sans 3D · ajouter</button>') : '')
      +(zn.wx ? '<span class="zb o">Météo du '+new Date(zn.wx).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+'</span>' : '<span class="zb n">Sans météo</span>');
    row.querySelector("small").after(bz); row.style.flexWrap="wrap"; row.firstElementChild.style.flexBasis="100%";
    const a3=bz.querySelector('[data-a=d3]'); if(a3) a3.onclick=()=>zoneAdd3D(zn, a3);
    row.querySelector('[data-a=see]').onclick=()=>{ closeSheets(); if(zn.mode!==MODE) setMode(zn.mode); const b=L.latLngBounds([zn.b[0],zn.b[1]],[zn.b[2],zn.b[3]]);
      setFollow(false); map.fitBounds(b); const r=L.rectangle(b,{color:"#FF7A00",weight:2,dashArray:"6 6",fill:false,interactive:false}).addTo(map); setTimeout(()=>map.removeLayer(r),4000); };
    row.querySelector('[data-a=wx]').onclick=async()=>{ toast("Mise à jour de la météo de « "+zn.name+" »…",3000);
      try{ await wxDownload(zn); toast("Météo enregistrée pour 3 jours"); }catch(e){ toast("Météo indisponible (réseau ou limite Open-Meteo)"); } renderZones(); };
    row.querySelector('[data-a=del]').onclick=async()=>{ if(!confirm("Supprimer « "+zn.name+" » du téléphone ?")) return;
      zones=zones.filter(z=>z.id!==zn.id); store.set("zones",zones); renderZones(); delete WXOFF[zn.id]; try{ (await caches.open(CN+"wx")).delete(wxKey(zn.id)); }catch(e){}
      const keep=new Set(); zones.forEach(z=>zoneUrls(z).forEach(u=>keep.add(u))); Object.keys(mInst).forEach(id=>massifUrls(id).forEach(u=>keep.add(u)));
      try{ const c=await caches.open(CN+"tiles"); await Promise.all(zoneUrls(zn).filter(u=>!keep.has(u)).map(u=>c.delete(u))); }catch(e){}
      toast("Zone supprimée"); usageNote(); };
    el.appendChild(row); });
  usageNote(); }
export async function usageNote(){ let tot=0; try{ tot=(await navigator.storage.estimate()).usage/1048576; }catch(e){}
  let mi={}; try{ mi=mInst; }catch(e){}
  const zMb=zones.reduce((a,z)=>a+(z.mb||0),0), mMb=Object.values(mi).reduce((a,m)=>a+m.n*64/1024,0), all=Math.max(tot, zMb+mMb);
  const parts=[["Zones",zMb,"#0B2F5B"],["Relief des massifs",mMb,"#2E7D32"],["Carte déjà vue et appli",Math.max(0,all-zMb-mMb),"#9AA8B8"]];
  const g=parts.map(([n,v,c])=>`<i style="width:${all?(100*v/all).toFixed(1):0}%;background:${c}"></i>`).join("");
  $("ocGauge").innerHTML=g; $("offGauge").innerHTML=g;
  $("offTot").innerHTML=Math.round(all).toLocaleString("fr-FR")+" Mo <small>sur le téléphone</small>";
  $("offLeg").innerHTML=parts.filter(x=>x[1]>=.5).map(([n,v,c])=>`<span><i style="background:${c}"></i>${n} ${Math.round(v).toLocaleString("fr-FR")} Mo</span>`).join("");
  const nm=Object.keys(mi).length, nz=zones.length;
  $("ocTxt").textContent = nz||nm ? nz+" zone"+(nz>1?"s":"")+(R()?" · "+nm+" massif"+(nm>1?"s":"")+" 3D":"")+" · "+Math.round(all).toLocaleString("fr-FR")+" Mo sur le téléphone" : "Cartes, relief 3D et météo pour partir sans réseau";
  $("zoneNote").textContent="Sans réseau, les cartes des zones téléchargées s'affichent normalement. La météo et les marées demandent du réseau."; }
renderZones();
// Ménage unique : les tuiles mises en cache en « opaque » par les anciennes versions gonflaient l'espace affiché
// (plusieurs Mo comptés par tuile). On les retire, sauf SHOM (sans CORS) et celles des zones téléchargées ; elles
// reviennent en version lisible à la prochaine consultation avec du réseau.
setTimeout(async () => { if(store.get("v_purgeOpaque", false) || !("caches" in window) || !navigator.onLine) return;
  try{ const keep = new Set(); zones.forEach(z => zoneUrls(z).forEach(u => keep.add(u)));
    const c = await caches.open(CN+"tiles"), ks = await c.keys(); let n = 0;
    for(const rq of ks){ if(keep.has(rq.url) || /services\.data\.shom\.fr/.test(rq.url)) continue; const r = await c.match(rq); if(r && r.type === "opaque"){ await c.delete(rq); n++; } }
    store.set("v_purgeOpaque", true); if(n) usageNote(); }catch(e){} }, 8000);
/* ---- Paquets de relief par massif (relief/<id>.bin.gz, préparés par tools-relief.js) ---- */
// Le paquet est décompressé sur le téléphone et chaque tuile est rangée dans navshom-tiles sous son adresse WMS :
// la vue 3D la trouve comme si elle venait du réseau.
export let massifs = null, mInst = store.get("massifs", {});
async function massifLoad(){ if(massifs && massifs.length) return massifs; try{ massifs = await (await fetch("relief/massifs.json", {cache:"no-cache"})).json(); }catch(e){ massifs = []; } return massifs; }
function massifUrls(id){ const m = mInst[id], out = []; if(!m) return out; for(let y=0;y<m.ny;y++) for(let x=0;x<m.nx;x++) out.push(v3DemUrl(m.x0+x, m.y0+y)); return out; }
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
$("cOff").addEventListener("toggle", () => { if($("cOff").open && R()) renderMassifs(); });
initInstruments();
initAis();

/* ================= Météo hors ligne : prévisions 3 jours sur les zones téléchargées ================= */
const WXOFF={};   // id de zone -> {t, types:{type:{pts,series}}, tbl:[{ll,f,m}]}
const wxKey=id=>"/wx/"+id+".json";
export async function wxLoadAll(){ try{ const c=await caches.open(CN+"wx"); for(const zn of zones){ if(WXOFF[zn.id]) continue; const r=await c.match(wxKey(zn.id)); if(r) WXOFF[zn.id]=await r.json(); } }catch(e){} }
function wxTypes(mode){ return mode==="rando" ? ["wind","gust","temp","rain","snowf","frz"] : ["wind","gust","cur","wave","swell","press","rain"]; }
async function wxDownload(zn, onProg){
  const b=L.latLngBounds([zn.b[0],zn.b[1]],[zn.b[2],zn.b[3]]), n=Math.min(11, Math.max(4, Math.round(Math.max(b.getEast()-b.getWest(), b.getNorth()-b.getSouth())/0.05)+1));
  const pts=[]; for(let i=0;i<n;i++) for(let j=0;j<n;j++) pts.push([+(b.getSouth()+(b.getNorth()-b.getSouth())*i/(n-1)).toFixed(4), +(b.getWest()+(b.getEast()-b.getWest())*j/(n-1)).toFixed(4)]);
  const out={t:Date.now(), model, types:{}, tbl:[]}, types=wxTypes(zn.mode); let k=0;
  for(const ty of types){ onProg&&onProg(++k, types.length+1); try{ const r=await fetchSeries(ty, pts, 3); out.types[ty]={pts, series:r.series}; }catch(e){} }
  onProg&&onProg(types.length+1, types.length+1);
  const tp=[]; for(let i=0;i<3;i++) for(let j=0;j<3;j++) tp.push([+(b.getSouth()+(b.getNorth()-b.getSouth())*(i+.5)/3).toFixed(3), +(b.getWest()+(b.getEast()-b.getWest())*(j+.5)/3).toFixed(3)]);
  try{ const la=tp.map(p=>p[0]).join(","), lo=tp.map(p=>p[1]).join(",");
    let f=await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=temperature_2m,weather_code,is_day,precipitation,cloud_cover,visibility,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,snowfall,freezing_level_height&daily=sunrise,sunset&wind_speed_unit=kn&timezone=auto&forecast_days=3`);
    let m=zn.mode==="rando"?null:await getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${la}&longitude=${lo}&hourly=wave_height,wave_direction,swell_wave_height,ocean_current_velocity,ocean_current_direction,sea_surface_temperature&timezone=auto&forecast_days=3&cell_selection=sea`).catch(()=>null);
    if(!Array.isArray(f)) f=[f]; if(m && !Array.isArray(m)) m=[m];
    tp.forEach((p,i)=>out.tbl.push({ll:p, f:f[i], m:m?m[i]:null})); }catch(e){}
  if(!Object.keys(out.types).length) throw new Error("wx");
  const c=await caches.open(CN+"wx"); await c.put(wxKey(zn.id), new Response(JSON.stringify(out),{headers:{"Content-Type":"application/json"}}));
  WXOFF[zn.id]=out; zn.wx=out.t; store.set("zones",zones); return out; }
// cherche une série hors ligne pour un point (zone qui le contient, point le plus proche)
export function wxNearest(type, p){ let best=null, bd=1e9;
  for(const id in WXOFF){ const o=WXOFF[id], T=o.types[type]; if(!T) continue; const zn=zones.find(z=>String(z.id)===String(id)); if(!zn) continue;
    T.pts.forEach((q,i)=>{ const d=(q[0]-p[0])**2+((q[1]-p[1])*Math.cos(p[0]*Math.PI/180))**2; if(d<bd){ bd=d; best={s:T.series[i], t:o.t}; } }); }
  return bd<0.04 ? best : null; } // jusqu'à ~20 km de la zone
export function wxTableNearest(p){ let best=null, bd=1e9; for(const id in WXOFF){ (WXOFF[id].tbl||[]).forEach(x=>{ const d=(x.ll[0]-p.lat)**2+(x.ll[1]-p.lng)**2; if(d<bd && d<0.25){ bd=d; best={...x, t:WXOFF[id].t}; } }); } return best; }
wxLoadAll();

/* Menu Plus : tuiles qui ouvrent une rubrique, résumés à jour */
document.querySelectorAll("#sMenu [data-open]").forEach(b=>b.onclick=()=>{ const d=$(b.dataset.open); d.open=true; setTimeout(()=>d.scrollIntoView({behavior:"smooth",block:"start"}),50); });
function hubRefresh(){ try{ $("hbOff").textContent = zones.length ? zones.length+" zone"+(zones.length>1?"s":"")+" enregistrée"+(zones.length>1?"s":"") : "Cartes et météo";
  $("hbAis").textContent = AIS.on ? (AIS.ships.size? AIS.ships.size+" navire"+(AIS.ships.size>1?"s":"") : "Activé") : "Désactivé"; }catch(e){} }
$("bMenu").addEventListener("click", hubRefresh);
initPluie();
initSurimpressions();
initBoussole();
initVentDirect();
initMaregraphes();
initRefuges();
initVue3d();
initVersion();
// Accès depuis la console et pour les tests automatiques (Playwright, tools-check.js)
Object.assign(window, { $, map, RT, fixTl, crowdCheck });
