// Marégraphes du SHOM (hauteur d'eau mesurée, temps réel)
import { R, map } from "../carte/carte.js";
import { $, store, toast } from "../utils.js";

let TG;

async function tgLoad(){ if(!TG.list){ const c=store.get("tgList",null); if(c && Date.now()-c.t<7*864e5) TG.list=c.d;
    else try{ const d=await (await fetch("https://services.data.shom.fr/maregraphie/service/tidegauges")).json(); TG.list=d.filter(x=>x.state==="OK").map(x=>({id:x.shom_id,n:x.name,la:x.latitude,lo:x.longitude})); store.set("tgList",{t:Date.now(),d:TG.list}); }catch(e){ toast("Marégraphes indisponibles (réseau ?)"); return; } }
  TG.layer.clearLayers();
  TG.list.forEach(st=>{ const m=L.marker([st.la,st.lo],{icon:L.divIcon({className:"tgi",iconSize:[26,26],iconAnchor:[13,13],html:'<b><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 3v18M8 7h8M3 15c3-3 6 3 9 0s6 3 9 0"/></svg></b>'}),zIndexOffset:640}).addTo(TG.layer);
    m.bindPopup("Chargement…"); m.on("popupopen", ()=>tgShow(st, m)); }); }
async function tgShow(st, m){ const end=new Date(), start=new Date(end-6*3600e3), iso=d=>d.toISOString().slice(0,19)+"Z", nm=st.n.replace(/_/g," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
  try{ const j=await (await fetch(`https://services.data.shom.fr/maregraphie/observation/json/${st.id}?sources=1&dtStart=${iso(start)}&dtEnd=${iso(end)}`)).json(); const d=(j.data||[]).filter(x=>x.value!=null);
    if(!d.length) return m.setPopupContent(`<b>${nm}</b><br>Pas de mesure récente`);
    const t=x=>new Date(x.timestamp.replace(/\//g,"-").replace(" ","T")+"Z").getTime(), lastP=d[d.length-1], v=lastP.value;
    const ref=d.find(x=>t(x)>=t(lastP)-30*60e3)||d[0], dh=(t(lastP)-t(ref))/3600e3, rate=dh>0.1?(v-ref.value)/dh:0;
    const vs=d.map(x=>x.value), mn=Math.min(...vs), mx=Math.max(...vs), W=220, H=56, t0=t(d[0]), t1=t(lastP);
    const path=d.filter((x,i)=>i%3===0||i===d.length-1).map((x,i)=>(i?"L":"M")+((t(x)-t0)/(t1-t0||1)*W).toFixed(1)+" "+(H-4-(x.value-mn)/((mx-mn)||1)*(H-8)).toFixed(1)).join(" ");
    const age=Math.round((Date.now()-t(lastP))/60e3);
    m.setPopupContent(`<b>${nm}</b><br><span style="font:700 20px Inter,sans-serif">${v.toFixed(2).replace(".",",")} m</span> ${Math.abs(rate)<0.03?"· étale":rate>0?"↗ monte":"↘ descend"} (${rate>0?"+":""}${Math.round(rate*100)} cm/h)<br>
      <svg width="${W}" height="${H}" style="display:block;margin:6px 0;background:#EEF4FA;border-radius:6px"><path d="${path}" fill="none" stroke="#1D6FB8" stroke-width="2"/></svg>
      <small>6 dernières heures · mesure d'il y a ${age} min · référence SHOM (zéro hydrographique)</small><br><a href="https://data.shom.fr/donnees/refmar/${st.id}" target="_blank" rel="noopener">Fiche du marégraphe</a>`); }
  catch(e){ m.setPopupContent(`<b>${nm}</b><br>Mesure indisponible (réseau ?)`); } }
export function tgSet(on){ store.set("tg",on); $("tgChk").checked=on; if(on && !R()){ TG.layer.addTo(map); tgLoad(); } else map.removeLayer(TG.layer); }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initMaregraphes(){
  /* ================= Marégraphes du SHOM (hauteur d'eau mesurée, temps réel) ================= */
  TG = {layer:L.layerGroup(), list:null};
  $("tgChk").onchange=e=>tgSet(e.target.checked); tgSet(store.get("tg",false));
}
