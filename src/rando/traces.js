// Traces : enregistrement, traces enregistrées ou importées (GPX)
import { R, fmtD, map } from "../carte/carte.js";
import { last, setFollow } from "../gps/gps.js";
import { notify } from "../gps/natif.js";
import { buildProfile, climb, drawProfile, profMk, setProfMk } from "./rando.js";
import { closeSheets, openSheet } from "../ui/panneaux.js";
import { wake } from "../ui/reglages.js";
import { saveFile } from "../ui/sauvegarde.js";
import { $, fmtDur, store, toast } from "../utils.js";

export let rec, tracks, shownId;
let recLine, activity, trLayer;

export let recSaveT=0, recGpsUp=0, recGpsRef=null;
function recDist(pts){ let d=0; for(let i=1;i<pts.length;i++) d+=map.distance([pts[i-1][0],pts[i-1][1]],[pts[i][0],pts[i][1]]); return d; }
function recDuration(){ if(!rec) return 0; const now=rec.paused?rec.pausedAt:Date.now(); return Math.max(0,(now-rec.start-(rec.pausedTotal||0))/3600e3); }
function recPersist(force){ if(force || Date.now()-recSaveT>15000){ recSaveT=Date.now(); store.set("rec",rec); } }
const fmtPace = kmh => !(kmh>=1.5) ? "–:––" : (()=>{ const sec=Math.round(3600/kmh); return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0"); })();
const fmtClock = h => { const t=Math.round(h*3600), H=Math.floor(t/3600), M=Math.floor(t%3600/60), Sx=t%60; return (H?H+":"+String(M).padStart(2,"0"):M)+":"+String(Sx).padStart(2,"0"); };

function curSpeed(){ // km/h sur les 30 dernières secondes
  if(!rec||rec.pts.length<2) return 0; const P=rec.pts, tN=P[P.length-1][2]; let d=0, i=P.length-1;
  while(i>0 && tN-P[i-1][2]<=30){ d+=map.distance([P[i-1][0],P[i-1][1]],[P[i][0],P[i][1]]); i--; }
  const dt=tN-P[i][2]; if(Date.now()/1000-tN>15) return 0; return dt>=5 ? d/dt*3.6 : 0; }
function renderRun(){
  const on = rec && rec.on && rec.act==="run"; $("runHud").hidden=!on; if(!on) return;
  $("runHud").classList.toggle("paused", rec.paused);
  const d=rec.dist||0, h=recDuration(), v=rec.paused?0:curSpeed();
  $("rhDist").textContent=(d/1000).toFixed(2).replace(".",","); $("rhDur").textContent=fmtClock(h);
  $("rhPace").textContent=fmtPace(v); $("rhSpd").textContent= v>=1.5 ? v.toFixed(1)+" km/h" : "–";
  $("rhAvg").textContent = h>0.003 ? fmtPace(d/1000/h) : "–:––";
  const sp=rec.splits||[]; $("rhLast").textContent = sp.length ? fmtClock(sp[sp.length-1].sec/3600) : "–";
  $("rhPause").textContent = rec.paused ? "Reprendre" : "Pause";
}
export function recPoint(ll, c, t){
  if(!rec || !rec.on || rec.paused || c.accuracy>35) return;
  const lp=rec.pts[rec.pts.length-1]; if(lp && map.distance([lp[0],lp[1]],ll)<(rec.act==="run"?5:8)) return;
  if(lp) rec.dist=(rec.dist||0)+map.distance([lp[0],lp[1]],ll);
  // passage de chaque kilomètre : temps du km, vibration et notification
  const km=Math.floor((rec.dist||0)/1000); rec.splits=rec.splits||[];
  if(km>rec.splits.length){ const total=recDuration()*3600, prev=rec.splits.reduce((a,x)=>a+x.sec,0), sec=Math.round(total-prev);
    rec.splits.push({km, sec}); const msg="Km "+km+" en "+fmtClock(sec/3600)+" · moyenne "+fmtPace((rec.dist/1000)/(total/3600))+" /km";
    if(rec.act==="run"){ toast(msg,5000); notify("🏃 Km "+km, msg); if(navigator.vibrate) navigator.vibrate([200,100,200]); } }
  const alt = c.altitude!=null ? Math.round(c.altitude) : null;
  rec.pts.push([+ll.lat.toFixed(6), +ll.lng.toFixed(6), Math.round(t/1000), alt]); recLine.addLatLng(ll);
  if(alt!=null){ if(recGpsRef==null) recGpsRef=alt; else if(alt-recGpsRef>=6){ recGpsUp+=alt-recGpsRef; recGpsRef=alt; } else if(recGpsRef-alt>=6) recGpsRef=alt; }
  // course ou marche, décidé par la vitesse : course au-delà de 7 km/h, retour marche sous 5 km/h pendant une minute
  const v=curSpeed();
  if(rec.act!=="run" && v>7){ rec.fast=(rec.fast||0)+1; if(rec.fast>=3){ rec.act="run"; rec.slowT=0; toast("🏃 Course détectée : affichage allure /km",3000); } } else if(v<=7) rec.fast=0;
  if(rec.act==="run"){ if(v>0 && v<5){ rec.slowT=rec.slowT||Date.now(); if(Date.now()-rec.slowT>60e3){ rec.act="hike"; rec.slowT=0; } } else rec.slowT=0; }
  recPersist(); renderRec(); renderRun();
}
export function renderRec(){
  const on=rec&&rec.on; $("bTrack").classList.toggle("rec", !!on && !rec.paused); $("bTrack").classList.toggle("paused", !!on && rec.paused);
  $("trStart").hidden=!!on; $("trPause").hidden=!on; $("trStop").hidden=!on; $("trPause").textContent = on&&rec.paused ? "Reprendre" : "Pause";
  const d=on?recDist(rec.pts):0, h=on?recDuration():0;
  $("tsDist").textContent = on?fmtD(d):"—"; $("tsDur").textContent = on?fmtDur(h):"—";
  $("tsUp").textContent = on?(recGpsUp?"≈ "+Math.round(recGpsUp)+" m":"—"):"—"; $("tsAvg").textContent = on && h>0.01 ? (d/1000/h).toFixed(1).replace(".",",")+" km/h" : "—";
  $("tsAlt").textContent = last && last.alt!=null ? Math.round(last.alt)+" m" : "—";
  $("tsState").textContent = !on ? "Prêt à enregistrer" : rec.paused ? "En pause" : "Enregistrement en cours";
  $("bRec").classList.toggle("on", !!on && !rec.paused); $("bRec").classList.toggle("paused", !!on && rec.paused);
  $("bRecT").textContent = !on ? "Enregistrer" : rec.paused ? "En pause" : fmtD(d);
  $("bRec").setAttribute("aria-label", !on ? "Enregistrer ma sortie" : "Sortie en cours : pause ou fin");
  if(R()) $("cog").textContent = on ? "+"+Math.round(recGpsUp||0) : "—";
}
async function saveTrack(tr){
  try{ tr.prof = await buildProfile(tr.pts.map(p=>L.latLng(p[0],p[1]))); const c=climb(tr.prof.z); tr.up=c.up; tr.dn=c.dn; }catch(e){ tr.prof=null; }
  tracks.unshift(tr); try{ store.set("tracks", tracks); }catch(e){} if(JSON.stringify(tracks).length>4e6) toast("Mémoire presque pleine : supprimez d'anciennes traces");
  renderTracks();
}
function showTrack(id){
  trLayer.clearLayers(); shownId=id; const tr=tracks.find(t=>t.id===id); if(!tr){ $("trProfWrap").hidden=true; renderTracks(); return; }
  const lls=tr.pts.map(p=>[p[0],p[1]]);
  L.polyline(lls,{color:"#fff",weight:7,opacity:.8,interactive:false}).addTo(trLayer);
  L.polyline(lls,{color:"#6a1b9a",weight:5}).on("click",e=>{ L.DomEvent.stop(e); trPillShow(tr); }).addTo(trLayer);
  L.circleMarker(lls[0],{radius:6,color:"#fff",weight:2,fillColor:"#1c9e47",fillOpacity:1}).bindTooltip("Départ").addTo(trLayer);
  L.circleMarker(lls[lls.length-1],{radius:6,color:"#fff",weight:2,fillColor:"#e5372b",fillOpacity:1}).bindTooltip("Arrivée").addTo(trLayer);
  setFollow(false); map.fitBounds(L.latLngBounds(lls).pad(.15), {paddingBottomRight:[0,260]});
  $("trProfTitle").textContent = tr.name+" · "+fmtD(tr.dist)+(tr.up!=null?" · D+ "+tr.up+" m · D− "+tr.dn+" m":"")+(tr.dur?" · "+fmtDur(tr.dur):"")+(tr.act==="run"&&tr.dur?" · "+fmtPace(tr.dist/1000/tr.dur)+" min/km":"");
  const sw=$("trSplits"); sw.innerHTML=""; if(tr.act==="run" && tr.splits && tr.splits.length){ sw.innerHTML='<table class="splits">'+tr.splits.map(x=>`<tr><td>Km ${x.km}</td><td>${fmtClock(x.sec/3600)} /km</td></tr>`).join("")+'</table>'; }
  $("trProfWrap").hidden=!tr.prof; if(tr.prof){ const c=$("trProf"); c._hov=null; requestAnimationFrame(()=>drawProfile(c, tr.prof)); }
  renderTracks(); trPillShow(tr);
}
// bandeau de la trace affichée : masquer ou supprimer sans passer par les menus
function trPillShow(tr){ $("trPillT").textContent=(tr.act==="run"?"🏃 ":"🥾 ")+tr.name+" · "+fmtD(tr.dist); $("trPill").hidden=false; $("trPill").dataset.id=tr.id; $("trPillDel").textContent="Supprimer"; $("trPillDel").dataset.armed=""; }
function trHide(){ shownId=null; trLayer.clearLayers(); $("trPill").hidden=true; if($("trProfWrap")) $("trProfWrap").hidden=true; try{ if(profMk){ map.removeLayer(profMk); setProfMk(null); } }catch(e){} renderTracks(); }
function renderTracks(){
  if(!shownId && $("trPill")) $("trPill").hidden=true;
  const el=$("trList"); el.innerHTML="";
  if(!tracks.length){ el.innerHTML='<p class="note">Aucune trace. Enregistrez une sortie ou importez un fichier GPX.</p>'; return; }
  tracks.forEach(tr=>{ const row=document.createElement("div"), t=document.createElement("span");
    t.innerHTML=`<b></b><br><small style="color:var(--muted)">${tr.act==="run"?"🏃 ":""}${fmtD(tr.dist)}${tr.up!=null?" · D+ "+tr.up+" m":""}${tr.dur?" · "+fmtDur(tr.dur):""}${tr.act==="run"&&tr.dur?" · "+fmtPace(tr.dist/1000/tr.dur)+" /km":""}</small>`; t.querySelector("b").textContent=tr.name;
    const s=document.createElement("span"); s.style.whiteSpace="nowrap";
    const bv=document.createElement("button"); bv.textContent = shownId===tr.id ? "Masquer" : "Voir"; bv.onclick=()=>{ if(shownId===tr.id){ shownId=null; trLayer.clearLayers(); if(profMk) map.removeLayer(profMk); $("trProfWrap").hidden=true; renderTracks(); } else showTrack(tr.id); };
    const bg=document.createElement("button"); bg.textContent="GPX"; bg.onclick=()=>exportGPX(tr);
    const bd=document.createElement("button"); bd.textContent="Suppr."; bd.style.color="var(--red)";
    bd.onclick=()=>{ if(bd.dataset.armed!=="1"){ bd.dataset.armed="1"; bd.textContent="Sûr ?"; setTimeout(()=>{ bd.dataset.armed=""; bd.textContent="Suppr."; },3000); return; }
      tracks=tracks.filter(x=>x.id!==tr.id); store.set("tracks",tracks); if(shownId===tr.id){ shownId=null; trLayer.clearLayers(); $("trProfWrap").hidden=true; } renderTracks(); };
    s.append(bv,bg,bd); row.append(t,s); el.append(row); });
}
export const esc = s => String(s).replace(/[<>&"]/g, c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
function toGPX(tr){
  const pts=tr.pts.map(p=>`      <trkpt lat="${p[0]}" lon="${p[1]}">${p[2]?`<time>${new Date(p[2]*1000).toISOString()}</time>`:""}</trkpt>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Balise" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk><name>${esc(tr.name)}</name>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>\n</gpx>\n`;
}
async function exportGPX(tr){
  const name=(tr.name||"trace").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\w\-]+/g,"_")+".gpx";
  saveFile(name, toGPX(tr), "application/gpx+xml");
}

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initTraces(){

  /* ---- Enregistrement de trace ---- */
  rec = store.get("rec", null); // {on, paused, start, pausedAt, pausedTotal, pts:[[lat,lng,t,alt]]}
  recLine = L.polyline([], {color:"#d81b60", weight:4, opacity:.9, interactive:false}).addTo(map);
  activity = store.get("activity","hike");
  $("trStart").onclick = () => { rec={on:true,paused:false,start:Date.now(),pausedTotal:0,pts:[],act:"hike",dist:0,splits:[]};
    recGpsUp=0; recGpsRef=null; recLine.setLatLngs([]);
    if(last) recPoint(last.ll, {accuracy:last.acc||10, altitude:last.alt}, Date.now()); recPersist(true); renderRec(); wake(); toast("Enregistrement démarré. Gardez l'écran allumé."); };
  // Bouton central : démarre l'enregistrement d'un toucher ; pendant la sortie, ouvre le panneau (pause, fin)
  $("bRec").onclick = () => { if(rec && rec.on){ const a=$("recAsk"); a.hidden=!a.hidden; $("raPause").textContent = rec.paused ? "Reprendre" : "Pause"; $("raStop").textContent="■ Terminer"; $("raStop").dataset.armed=""; return; }
    closeSheets(); $("trStart").onclick(); renderRec(); };
  // Bulle de la sortie en cours : pause, fin (deuxième toucher pour confirmer), détails
  $("raPause").onclick = () => { $("trPause").onclick(); $("recAsk").hidden=true; toast(rec && rec.paused ? "Sortie en pause" : "Enregistrement repris"); };
  $("raStop").onclick = () => { const b=$("raStop"); if(b.dataset.armed!=="1"){ b.dataset.armed="1"; b.textContent="Confirmer la fin ?"; setTimeout(()=>{ if(b.dataset.armed==="1"){ b.dataset.armed=""; b.textContent="■ Terminer"; } },4000); return; }
    b.dataset.armed=""; $("recAsk").hidden=true; $("trStop").onclick(); };
  $("raMore").onclick = () => { $("recAsk").hidden=true; if($("sTrack").hidden) $("bTrack").onclick(); };
  $("trPause").onclick = () => { if(!rec) return; if(rec.paused){ rec.pausedTotal+=Date.now()-rec.pausedAt; rec.paused=false; } else { rec.paused=true; rec.pausedAt=Date.now(); } recPersist(true); renderRec(); renderRun(); };
  $("rhPause").onclick = () => $("trPause").onclick();
  $("rhStop").onclick = () => { if($("rhStop").dataset.armed!=="1"){ $("rhStop").dataset.armed="1"; $("rhStop").textContent="Confirmer ?"; setTimeout(()=>{ $("rhStop").dataset.armed=""; $("rhStop").textContent="■ Terminer"; },3000); return; }
    $("rhStop").dataset.armed=""; $("rhStop").textContent="■ Terminer"; $("trStop").onclick(); };
  setInterval(()=>{ if(rec && rec.on && rec.act==="run") renderRun(); }, 1000);
  $("trStop").onclick = async () => {
    if(!rec) return; const pts=rec.pts.slice(), dur=recDuration(), act=(dur>0 && recDist(rec.pts)/1000/dur>7)?"run":"hike", splits=(rec.splits||[]).slice(); rec=null; store.set("rec",null); renderRec(); renderRun();
    if(pts.length<2){ recLine.setLatLngs([]); return toast("Trace trop courte, non enregistrée"); }
    const d=new Date(), tr={id:Date.now(), name:(act==="run"?"Course du ":"Rando du ")+d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})+" "+d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}),
      date:d.toISOString(), pts:pts.map(p=>[p[0],p[1],p[2]]), dist:Math.round(recDist(pts)), dur, act, splits};
    await saveTrack(tr); recLine.setLatLngs([]); showTrack(tr.id); toast("Trace enregistrée");
  };
  // reprise d'un enregistrement après fermeture de l'app
  if(rec && rec.on){ recLine.setLatLngs(rec.pts.map(p=>[p[0],p[1]])); if(rec.dist==null) rec.dist=recDist(rec.pts); } renderRun();

  /* ---- Traces enregistrées / importées ---- */
  tracks = store.get("tracks", []); shownId = null; trLayer = L.layerGroup().addTo(map);
  $("trPillHide").onclick=trHide;
  $("trPillDel").onclick=()=>{ const b=$("trPillDel"); if(b.dataset.armed!=="1"){ b.dataset.armed="1"; b.textContent="Confirmer ?"; setTimeout(()=>{ b.dataset.armed=""; b.textContent="Supprimer"; },3000); return; }
    const id=+$("trPill").dataset.id; tracks=tracks.filter(x=>x.id!==id); store.set("tracks",tracks); trHide(); toast("Trace supprimée"); };
  $("gpxIn").onchange = async e => {
    const f=e.target.files[0]; e.target.value=""; if(!f) return;
    try{
      const doc=new DOMParser().parseFromString(await f.text(),"application/xml");
      let nodes=[...doc.getElementsByTagName("trkpt")]; if(!nodes.length) nodes=[...doc.getElementsByTagName("rtept")];
      const pts=nodes.map(n=>{ const t=n.getElementsByTagName("time")[0]; return [+(+n.getAttribute("lat")).toFixed(6), +(+n.getAttribute("lon")).toFixed(6), t?Math.round(new Date(t.textContent)/1000):0]; }).filter(p=>isFinite(p[0])&&isFinite(p[1]));
      if(pts.length<2) return toast("Aucune trace trouvée dans ce fichier");
      const nm=doc.getElementsByTagName("name")[0], dur = pts[0][2]&&pts[pts.length-1][2] ? (pts[pts.length-1][2]-pts[0][2])/3600 : 0;
      const tr={id:Date.now(), name:(nm&&nm.textContent.trim())||f.name.replace(/\.gpx$/i,""), date:new Date().toISOString(), pts, dist:Math.round(recDist(pts)), dur};
      toast("Import : calcul du profil…"); await saveTrack(tr); showTrack(tr.id); toast("Trace importée : "+tr.name);
    }catch(err){ toast("Fichier GPX illisible"); }
  };
  $("bTrack").onclick = () => { if(!$("sTrack").hidden) return closeSheets(); renderRec(); renderTracks(); openSheet("sTrack"); if(shownId) showTrack(shownId); };
  setInterval(()=>{ if(rec && rec.on && !$("sTrack").hidden) renderRec(); }, 5000);
}
