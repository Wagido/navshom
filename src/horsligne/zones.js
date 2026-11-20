// Hors ligne : zones téléchargées (tuiles), espace utilisé
import { FRANCE, MODE, R, bases, curBase, map, seamarks, slopes } from "../carte/carte.js";
import { autoSatOn, shade } from "../carte/fonds.js";
import { measuring, stopMeasure } from "../carte/mesure.js";
import { setFollow } from "../gps/gps.js";
import { WXOFF, wxDownload, wxKey } from "./meteo.js";
import { mInst, massifUrls } from "./relief.js";
import { setMode } from "../rando/rando.js";
import { esc } from "../rando/traces.js";
import { V3DL_MAX, v3KeepLib, v3ZoneCount, v3ZoneUrls } from "../rando/vue3d.js";
import { closeSheets } from "../ui/panneaux.js";
import { $, CN, store, toast } from "../utils.js";

export let zones;
let OVL, dl, dlQ;

/* ================= Hors ligne ================= */
function tileRange(b,z){ const n=2**z, x=lng=>Math.floor((lng+180)/360*n),
  y=lat=>{ const r=lat*Math.PI/180; return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n); };
  return {x0:x(b.getWest()),x1:x(b.getEast()),y0:y(b.getNorth()),y1:y(b.getSouth())}; }
/* Zones téléchargées : on enregistre toutes les tuiles des couches affichées, du zoom 6 au détail maximal du fond */
const TILE_KB={ign1950:30,litto:30,scan25:38,ign:22,ortho:30,emod:12,shom:30,gebco:10,shade:14,slopes:6,seamarks:2}, DL_MAX=9000;
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
export function zoneUrls(zn){ const b=L.latLngBounds([zn.b[0],zn.b[1]],[zn.b[2],zn.b[3]]), out=[]; zn.keys.forEach(k=>{ if(lyOf(k)) tilesIn(b,k,zn.q||0,u=>out.push(u)); });
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
async function zoneName(c){ for(const ix of ["poi","address"]) try{ const r=await fetch("https://data.geopf.fr/geocodage/reverse?lon="+c.lng.toFixed(4)+"&lat="+c.lat.toFixed(4)+"&limit=1&index="+ix); const j=await r.json(); const p=j.features[0].properties, n=p.toponym||p.city; if(n) return n; }catch(e){}
  return "Zone du "+new Date().toLocaleDateString("fr-FR"); }
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

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initZones(){
  OVL = {shade, slopes, seamarks};
  zones = store.get("zones",[]); dl = null; dlQ = 0;
  map.on("moveend zoomend", ()=>{ if(dl) dlEstimate(); }); addEventListener("resize", ()=>{ if(dl){ dlLayout(); dlEstimate(); } });
  $("dlQ").onclick=e=>{ const q=e.target.dataset.q; if(q==null) return; dlQ=+q; $("dlQ").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===e.target)); dlEstimate(); };
  $("dlD3").onchange=dlEstimate;
  $("dlCancel").onclick=()=>{ if(dl && dl.running){ dl.stop=true; return; } dlEnd(); };
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
  $("bCache").onclick=dlStart; $("bCache2").onclick=dlStart;
  renderZones();
  // Ménage unique : les tuiles mises en cache en « opaque » par les anciennes versions gonflaient l'espace affiché
  // (plusieurs Mo comptés par tuile). On les retire, sauf SHOM (sans CORS) et celles des zones téléchargées ; elles
  // reviennent en version lisible à la prochaine consultation avec du réseau.
  setTimeout(async () => { if(store.get("v_purgeOpaque", false) || !("caches" in window) || !navigator.onLine) return;
    try{ const keep = new Set(); zones.forEach(z => zoneUrls(z).forEach(u => keep.add(u)));
      const c = await caches.open(CN+"tiles"), ks = await c.keys(); let n = 0;
      for(const rq of ks){ if(keep.has(rq.url) || /services\.data\.shom\.fr/.test(rq.url)) continue; const r = await c.match(rq); if(r && r.type === "opaque"){ await c.delete(rq); n++; } }
      store.set("v_purgeOpaque", true); if(n) usageNote(); }catch(e){} }, 8000);
}
