// Mesure de distance (route multi-segments)
import { MODE, R, fmtD, map } from "./carte.js";
import { last } from "../gps/gps.js";
import { setOverlay } from "../meteo/calques.js";
import { crowdCheck } from "../meteo/tableau.js";
import { measureGeom, segGeom, trailOn } from "../rando/itineraires.js";
import { mProfT, measureProfile, setMProfT } from "../rando/rando.js";
import { closeSheets } from "../ui/panneaux.js";
import { $, NM, bearing, fmtDur, pad3, store, toast } from "../utils.js";

let mLayer;

/* ================= Mesure de distance ================= */
export let measuring=false, mPts=[];
export function startMeasure(){ setOverlay(null); closeSheets(); measuring=true; document.body.classList.add("measuring"); mLayer.addTo(map); $("measure").hidden=false; $("bMeasure").classList.add("on"); drawMeasure();
  document.documentElement.style.setProperty("--tl", ($("measure").offsetHeight+8)+"px"); setTimeout(crowdCheck,260); }
export function stopMeasure(){ measuring=false; document.body.classList.remove("measuring"); $("measure").hidden=true; document.documentElement.style.setProperty("--tl","0px"); setTimeout(crowdCheck,260); $("bMeasure").classList.remove("on"); mPts=[]; mLayer.clearLayers(); map.removeLayer(mLayer); }
export function addMeasure(ll){ mPts.push(ll); drawMeasure(); }
export function drawMeasure(){
  mLayer.clearLayers(); let tot=0;
  if(mPts.length>1) L.polyline(trailOn()?measureGeom():mPts,{color:trailOn()?"#6a1b9a":"#0b2f5b",weight:trailOn()?4:3,dashArray:trailOn()?null:"2 6",lineCap:"round",interactive:false}).addTo(mLayer);
  mPts.forEach((p,i)=>{
    L.circleMarker(p,{radius:6,color:"#fff",weight:2,fillColor:"#0b2f5b",fillOpacity:1,interactive:false}).addTo(mLayer);
    if(i>0){ const sg=segGeom(mPts[i-1],p), d=sg?sg.dist:map.distance(mPts[i-1],p); tot+=d;
      L.marker(L.latLng((mPts[i-1].lat+p.lat)/2,(mPts[i-1].lng+p.lng)/2),{opacity:0,interactive:false}).addTo(mLayer)
        .bindTooltip(fmtD(d)+" · "+pad3(bearing(mPts[i-1],p))+"°",{permanent:true,direction:"center",className:"mlabel"}); }
  });
  const sp=parseFloat(String($("mSpeed").value).replace(",","."))||(R()?4:5);
  $("mTot").textContent = fmtD(tot); $("mUnit").textContent = R()?"km/h":"nd"; 
  $("mEta").textContent = mPts.length>1 ? (R() ? "≈ "+fmtDur(tot/1000/sp)+" (sans dénivelé)" : fmtDur(tot/NM/sp)+" à "+sp+" nd") : "—";
  if(R()){ clearTimeout(mProfT); if(mPts.length>1) setMProfT(setTimeout(measureProfile,500)); else $("mProfWrap").hidden=true; } else $("mProfWrap").hidden=true;
  $("mHint").textContent = mPts.length===0 ? "Touchez la carte pour poser le départ." : mPts.length===1 ? "Touchez la carte pour le point suivant." : "Touchez pour prolonger · "+(mPts.length-1)+" segment"+(mPts.length>2?"s":"");
}

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initMesure(){
  mLayer = L.layerGroup();
  $("mSpeed").value = store.get("mspeed_"+MODE, MODE==="rando"?4:5);
  $("bMeasure").onclick = () => measuring ? stopMeasure() : startMeasure();
  $("mDone").onclick = stopMeasure;
  $("mUndo").onclick = () => { mPts.pop(); drawMeasure(); };
  $("mClear").onclick = () => { mPts=[]; drawMeasure(); };
  $("mBoat").onclick = () => { if(!last) return toast("Pas de position GPS"); mPts.unshift(last.ll); drawMeasure(); };
  $("mSpeed").oninput = () => { store.set("mspeed_"+MODE, $("mSpeed").value); drawMeasure(); };
}
