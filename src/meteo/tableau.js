// Tableau météo heure par heure, repliable
import { R, map } from "../carte/carte.js";
import { last } from "../gps/gps.js";
import { drawCurve, showCurve, wxLoadAll, wxTableNearest } from "../main.js";
import { OVT, drawOverlay, drawTimeline, getJSON, lastWx, loadOverlay, model, ov, setOverlay, tErrShow } from "./calques.js";
import { drawField, landFrac } from "./masque.js";
import { colorAt, stopParticles } from "./particules.js";
import { arrowSvg, meteoLL, unsuffix, wxIcon } from "./previsions.js";
import { closeSheets } from "../ui/panneaux.js";
import { $, compass, store } from "../utils.js";

/* ---- Tableau heure par heure, repliable ---- */
export const tbl={ll:null,f:null,m:null,model:null,open:true,loading:false}; // le tableau est toujours affiché quand le panneau est déplié
export function crowdCheck(){ // un panneau haut ne doit pas recouvrir le groupe de commandes : on le réduit au zoom
  document.body.classList.remove("crowded","crowded2","crowded3");
  { const br=$("colBR").getBoundingClientRect(); if(br.height && br.top < $("colTR").getBoundingClientRect().bottom+8) document.body.classList.add("crowded3"); }
  const panel=[$("tbar"),$("measure")].find(e=>e && !e.hidden); if(!panel) return;
  const top=panel.getBoundingClientRect().top, mob=$("colBL").getBoundingClientRect();
  if(top < $("colTR").getBoundingClientRect().bottom+8) document.body.classList.add("crowded");
  if(mob.height && (mob.bottom > top-4 || mob.top < $("colTL").getBoundingClientRect().bottom+4)) document.body.classList.add("crowded2"); }
export const fixTl=()=>{ if(!$("tbar").hidden) document.documentElement.style.setProperty("--tl", ($("tbar").offsetHeight+8)+"px"); setTimeout(crowdCheck,260); };
export async function loadTable(force){
  const useGps = !tbl.force && last && map.getBounds().contains(last.ll) && (R() || landFrac(last.ll.lat,last.ll.lng)<0.5);
  const ll = tbl.force || (useGps ? last.ll : map.getCenter()); tbl.gps=!!useGps;
  if(!force && tbl.f && tbl.ll && map.distance(tbl.ll,ll)<8000 && tbl.model===model) return renderTable();
  if(tbl.loading) return; tbl.loading=true; tbl.ll=ll; tbl.model=model;
  const la=ll.lat.toFixed(3), lo=ll.lng.toFixed(3);
  const fu=`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=temperature_2m,weather_code,is_day,precipitation,cloud_cover,visibility,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,snowfall,freezing_level_height&daily=sunrise,sunset&wind_speed_unit=kn&timezone=auto&forecast_days=3`;
  try{
    const [f,m]=await Promise.all([
      getJSON(fu+(model!=="best_match"?`&models=${model}`:"")).catch(()=>getJSON(fu)),
      getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${la}&longitude=${lo}&hourly=wave_height,wave_direction,swell_wave_height,ocean_current_velocity,ocean_current_direction,sea_surface_temperature&timezone=auto&forecast_days=3&cell_selection=sea`).catch(()=>null)]);
    unsuffix(f.hourly); tbl.f=f; tbl.m=(m && !R() && landFrac(ll.lat,ll.lng)<0.5) ? m : null;
  }catch(e){ await wxLoadAll(); const x=wxTableNearest(ll);
    if(x && x.f){ unsuffix(x.f.hourly); tbl.f=x.f; tbl.m=(x.m && !R())?x.m:null; } else tErrShow(navigator.onLine ? "Tableau heure par heure indisponible : le service ne répond pas." : "Pas de réseau : tableau heure par heure indisponible."); }
  tbl.loading=false; renderTable();
}
export function renderTable(){
  $("tTbl").hidden=!tbl.open; $("tTblBtn").classList.toggle("on",tbl.open); $("tbar").classList.toggle("tblopen",tbl.open);
  if(!tbl.open || !tbl.f){ if(tbl.open) $("tTbl").innerHTML='<div style="padding:8px 12px;font-size:12px;color:#9fc0e6">Chargement…</div>'; fixTl(); return; }
  const h=tbl.f.hourly, hm=tbl.m&&tbl.m.hourly, now=Date.now(); let i0=0; h.time.forEach((t,i)=>{ if(new Date(t).getTime()<=now) i0=i; });
  const sel=ov.data?ov.data[0].time[ov.idx]:null, cols=[]; for(let i=Math.max(0,i0-1);i<h.time.length;i++) cols.push(i);
  const mi=t=>hm?hm.time.indexOf(t):-1, cell=(i,inner,extra="")=>{ const t=h.time[i], hr=+t.slice(11,13);
    return `<td data-t="${t}" class="${t===sel?"sel ":""}${i===i0?"now ":""}${hr>=21||hr<7?"night ":""}${hr===0?"d0 ":""}${extra}">${inner}</td>`; };
  const bg=(sc,v,a=.75)=>{ const c=colorAt(sc,v); return `background:rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a*c[3]/255})`; };
  const mname=tbl.force?"Point choisi":tbl.gps?(R()?"Ma position":"Au bateau"):"Centre carte";
  let days='<tr class="dayr"><th>'+mname+'</th>'+cols.map((i,n)=>{ const t=h.time[i], hr=+t.slice(11,13);
    const dd0=tbl.f.daily, di=dd0&&dd0.time?dd0.time.indexOf(t.slice(0,10)):-1, sun=di>=0&&dd0.sunrise?` · ☀ ${dd0.sunrise[di].slice(11,16)}–${dd0.sunset[di].slice(11,16)}`:"";
    const lab=(n===0||hr===0)?new Date(t.slice(0,10)+"T12:00").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric"})+sun:"";
    return `<td class="${hr===0?"d0":""}">${lab?`<span>${lab}</span>`:""}</td>`; }).join("")+'</tr>';
  const row=(label,fn,cls="",key="")=>{ const [nm,un]=label.split("|"), on=key&&key===ov.type;
    return `<tr class="${cls}${on?" lay":""}"><th${key?` data-k="${key}" title="Afficher sur la carte"`:""}>${nm}${un?`<small>${un}</small>`:""}${on?'<i class="onmap">sur la carte</i>':""}</th>${cols.map(fn).join("")}</tr>`; };
  const num=(v,d=0)=>v==null?"":(+v).toFixed(d);
  let html='<table>'+days
    +row("Heure",i=>cell(i,h.time[i].slice(11,13)+"h"),"hh")
    +row("Ciel",i=>cell(i,wxIcon(h.weather_code[i],h.is_day[i])))
    +row("Temp.|°C",i=>cell(i,Math.round(h.temperature_2m[i])),"","temp")
    +row("Pluie|mm",i=>{ const r=h.precipitation[i]; return cell(i, r>=0.1?`<div class="wc rn">${r<1?r.toFixed(1).replace(".",","):Math.round(r)}</div>`:'<span class="z">–</span>'); },"","rain")
    +row("Nuages|%",i=>cell(i,num(h.cloud_cover&&h.cloud_cover[i])),"","cloud")
    +row("Visibilité|km",i=>cell(i,h.visibility&&h.visibility[i]!=null?(h.visibility[i]>=10000?"10+":(h.visibility[i]/1000).toFixed(1)):""),"","vis")
    +row("Pression|hPa",i=>cell(i,num(h.pressure_msl&&h.pressure_msl[i])),"","press")
    +row("Vent|nœuds",i=>cell(i,`<div class="wc" style="${bg(OVT.wind,h.wind_speed_10m[i],.5)}">${Math.round(h.wind_speed_10m[i])}</div>`),"","wind")
    +row("Rafales|nœuds",i=>cell(i,`<div class="wc" style="${bg(OVT.wind,h.wind_gusts_10m[i],.35)}">${Math.round(h.wind_gusts_10m[i])}</div>`),"","gust")
    +row("Direction",i=>cell(i,`<span class="ar" title="${compass(h.wind_direction_10m[i])}">${arrowSvg((h.wind_direction_10m[i]+180)%360,"#0B2F5B")}</span>`));
  if(R()){
    html+=row("Neige|cm",i=>{ const v=h.snowfall?h.snowfall[i]:null; return cell(i, v>=0.1?`<div class="wc sn">${v<1?v.toFixed(1).replace(".",","):Math.round(v)}</div>`:'<span class="z">–</span>'); },"","snowf")
        +row("Iso 0 °C|m",i=>{ const v=h.freezing_level_height?h.freezing_level_height[i]:null; return cell(i, v==null?"":Math.round(v/50)*50); },"","frz");
  }
  if(!R() && !hm) html+=`<tr><th>Mer</th><td colspan="${cols.length}" style="text-align:left;padding-left:6px;color:var(--slate)">Point à terre : déplacez la carte sur la mer pour vagues et courant</td></tr>`;
  if(hm && !R()){
    const dc=v=>v.toFixed(1).replace(".",",");
    html+=row("Vagues|m",i=>{ const j=mi(h.time[i]), v=j>=0?hm.wave_height[j]:null; return cell(i, v==null?"":dc(v)); },"","wave")
        +row("Houle|m",i=>{ const j=mi(h.time[i]), v=j>=0&&hm.swell_wave_height?hm.swell_wave_height[j]:null; return cell(i, v==null?"":dc(v)); },"","swell")
        +row("Eau|°C",i=>{ const j=mi(h.time[i]), v=j>=0&&hm.sea_surface_temperature?hm.sea_surface_temperature[j]:null; return cell(i, v==null?"":Math.round(v)); },"","sst")
        +row("Courant|nœuds",i=>{ const j=mi(h.time[i]), v=j>=0&&hm.ocean_current_velocity[j]!=null?hm.ocean_current_velocity[j]/1.852:null;
          return cell(i, v==null?"":`<div class="wc" style="${bg(OVT.cur,v,.45)}">${dc(v)}</div>`); },"","cur");
  }
  html+='</table>';
  const dd=null; if(dd && dd.sunrise) $("tSun").innerHTML='<span><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="10" fill="#ffc83d"/></svg>Lever <b>'+dd.sunrise[0].slice(11,16)+'</b></span><span><svg viewBox="0 0 48 48"><path d="M28 8a14 14 0 1 0 12 20 11 11 0 0 1-12-20z" fill="#9AA8B8"/></svg>Coucher <b>'+dd.sunset[0].slice(11,16)+'</b></span>';
  const el=$("tTbl"), keep=el.scrollLeft, first=!el.dataset.ready; el.innerHTML=html; el.dataset.ready=1;
  if(!R()){ // en mer : vent, direction, vagues et courant en premier
    const rows=[...el.querySelectorAll("tr")], byTxt=t=>rows.find(r=>r.cells[0] && r.cells[0].textContent===t), byK=k=>{ const th=el.querySelector(`th[data-k="${k}"]`); return th&&th.parentElement; };
    let after=byTxt("Ciel"); [byK("wind"),byK("gust"),byTxt("Direction"),byK("wave"),byK("swell"),byK("cur"),byK("sst"),byTxt("Mer")].forEach(r=>{ if(r&&after){ after.after(r); after=r; } }); }
  el.scrollLeft = first ? 0 : keep;
  fixTl();
}
// calque météo valable dans le mode courant (neige / iso 0 seulement en Rando, mer seulement en Mer)
const okLayer = k => OVT[k] && !(OVT[k].rando && !R()) && !(OVT[k].api==="mar" && R());
export function setHour(i){ if(!ov.data) return; ov.idx=Math.max(0,Math.min(ov.data[0].time.length-1,i)); $("tSlider").value=ov.idx; drawOverlay(); }
let ovTimer;

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initTableau(){
  $("tTblBtn").onclick=()=>{ tbl.open=!tbl.open; store.set("tblOpen",tbl.open); if(tbl.open) loadTable(); renderTable(); if(!tbl.open) drawTimeline(); };
  $("tTbl").addEventListener("click", e=>{ const th=e.target.closest("th[data-k]"); if(th){ const k=th.dataset.k; if(OVT[k] && ov.type!==k) setOverlay(k); return; } const td=e.target.closest("td[data-t]"); if(!td||!ov.data) return; const k=ov.data[0].time.indexOf(td.dataset.t); if(k>=0) setHour(k); });
  $("tNums").classList.toggle("on", ov.nums);
  $("tNums").onclick=()=>{ ov.nums=!ov.nums; store.set("nums",ov.nums); $("tNums").classList.toggle("on",ov.nums); drawField(); };

  $("bCur").onclick = () => setOverlay("cur");
  $("bWind").onclick = () => setOverlay(ov.type && ov.type!=="cur" ? ov.type : (okLayer(lastWx) ? lastWx : "wind"));
  $("mapSnow").onclick = () => { closeSheets(); if(ov.type!=="snowd") setOverlay("snowd"); };
  $("mapFrz").onclick = () => { closeSheets(); if(ov.type!=="frz") setOverlay("frz"); };
  $("mapCur").onclick = () => { closeSheets(); if(ov.type!=="cur") setOverlay("cur"); };
  $("mapWind").onclick = () => { closeSheets(); if(ov.type!=="wind") setOverlay("wind"); };
  $("mapSea").onclick = () => showCurve(meteoLL || map.getCenter());
  $("tSlider").oninput = e => { ov.idx=+e.target.value; drawOverlay(); };
  $("tm3").onclick=()=>setHour(ov.idx-3); $("tm1").onclick=()=>setHour(ov.idx-1); $("tp1").onclick=()=>setHour(ov.idx+1); $("tp3").onclick=()=>setHour(ov.idx+3); $("tnow").onclick=()=>setHour(ov.now);
  map.on("movestart", stopParticles);
  map.on("moveend", () => { if(!ov.type) return; clearTimeout(ovTimer); ovTimer=setTimeout(()=>{ loadOverlay(ov.idx); if(tbl.open) loadTable(); },600); });
  window.addEventListener("resize", () => { setTimeout(crowdCheck,260); if(ov.type){ document.documentElement.style.setProperty("--tl",($("tbar").offsetHeight+8)+"px"); drawTimeline(); } if(!$("sCurve").hidden) drawCurve(); });
}
