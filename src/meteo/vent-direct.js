// Vent mesuré en direct (OpenWindMap / Pioupiou)
import { R, map } from "../carte/carte.js";
import { $, compass, pad3, store, toast } from "../utils.js";

export let LW;

const lwCol=k=>k<10?"#7ED957":k<17?"#FFD54F":k<25?"#FF9800":k<34?"#E5372B":"#8E24AA";
async function lwLoad(force){ if(!force && LW.data && Date.now()-LW.t<4*60e3) return lwDraw();
  try{ const j=await (await fetch("https://api.pioupiou.fr/v1/live/all")).json(); LW.data=j.data; LW.t=Date.now(); }catch(e){ toast("Vent en direct indisponible (réseau ?)"); }
  lwDraw(); }
export function lwDraw(){ LW.layer.clearLayers(); if(!LW.data) return; const b=map.getBounds().pad(.2), now=Date.now();
  LW.data.forEach(st=>{ const m=st.measurements, loc=st.location; if(!m||!loc||st.status.state!=="on"||m.wind_speed_avg==null) return;
    const age=(now-new Date(m.date).getTime())/60e3; if(age>90) return; const ll=[loc.latitude,loc.longitude]; if(!b.contains(ll)) return;
    const kn=m.wind_speed_avg/1.852, gk=(m.wind_speed_max||m.wind_speed_avg)/1.852, v=R()?Math.round(m.wind_speed_avg):Math.round(kn), u=R()?"km/h":"nd";
    const ic=L.divIcon({className:"lw", iconSize:[44,44], iconAnchor:[22,22], html:`<div class="lwb" style="background:${lwCol(kn)}"><svg viewBox="-12 -12 24 24" style="transform:rotate(${(m.wind_heading+180)%360}deg)"><path d="M0 -10 5 6 0 3 -5 6Z" fill="#0B2F5B"/></svg></div><span>${v}</span>`});
    L.marker(ll,{icon:ic, zIndexOffset:700}).addTo(LW.layer).bindPopup(`<b>${(st.meta&&st.meta.name)||"Balise "+st.id}</b><br>Vent ${v} ${u} (rafales ${Math.round(R()?m.wind_speed_max:gk)}, mini ${Math.round(R()?m.wind_speed_min:m.wind_speed_min/1.852)})<br>Du ${pad3(m.wind_heading)}° ${compass(m.wind_heading)} · il y a ${Math.round(age)} min<br><a href="https://www.openwindmap.org/PP${st.id}" target="_blank" rel="noopener">Historique sur OpenWindMap</a>`); }); }
function lwSet(on){ store.set("liveWind",on); $("liveWind").checked=on; clearInterval(LW.timer);
  if(on){ LW.layer.addTo(map); lwLoad(); LW.timer=setInterval(()=>{ if(document.visibilityState==="visible") lwLoad(true); }, 5*60e3); } else map.removeLayer(LW.layer); }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initVentDirect(){
  /* ================= Vent mesuré en direct (OpenWindMap / Pioupiou) ================= */
  LW = {layer:L.layerGroup(), data:null, t:0, timer:null};
  $("liveWind").onchange=e=>lwSet(e.target.checked); map.on("moveend", ()=>{ if(map.hasLayer(LW.layer)) lwDraw(); });
  map.attributionControl.addAttribution('<a href="https://www.openwindmap.org" target="_blank" rel="noopener">OpenWindMap</a>');
  lwSet(store.get("liveWind",false));
}
