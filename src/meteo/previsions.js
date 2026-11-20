// Prévisions : icônes, 7 jours, comparaison des modèles
import { R, map } from "../carte/carte.js";
import { last } from "../gps/gps.js";
import { getJSON, model, modelName, ov } from "./calques.js";
import { setHour } from "./tableau.js";
import { closeSheets, markTmp, openSheet, setTmpMarker, tmpMarker } from "../ui/panneaux.js";
import { $, compass, dm, store, toast } from "../utils.js";

/* ================= Météo marine ================= */
export function wxIcon(code, day){
  const sun='<circle cx="24" cy="22" r="9" fill="#ffc83d"/><g stroke="#ffc83d" stroke-width="3" stroke-linecap="round"><path d="M24 5v4M24 35v4M7 22h4M37 22h4M12 10l3 3M33 31l3 3M12 34l3-3M33 13l3-3"/></g>';
  const moon='<path d="M28 8a14 14 0 1 0 12 20 11 11 0 0 1-12-20z" fill="#e8ecf5"/>';
  const cloud=(c="#fff",y=0)=>`<path d="M14 ${38+y}a8 8 0 0 1-1-16 11 11 0 0 1 21 3 6.5 6.5 0 0 1 1 13z" fill="${c}"/>`;
  const drops='<g stroke="#5ab4ff" stroke-width="3" stroke-linecap="round"><path d="M16 41l-2 5M24 41l-2 5M32 41l-2 5"/></g>';
  let s;
  if(code===0) s = day?sun:moon;
  else if(code<=2) s = (day?'<g transform="translate(6 -4) scale(.8)">'+sun+'</g>':'<g transform="translate(8 -2) scale(.75)">'+moon+'</g>')+cloud("#fff",2);
  else if(code===3) s = cloud("#c9d3df",-4)+cloud("#fff",2);
  else if(code===45||code===48) s = '<g stroke="#c9d3df" stroke-width="4" stroke-linecap="round"><path d="M8 18h32M6 26h36M10 34h28"/></g>';
  else if(code>=95) s = cloud("#9aa8b8",-4)+'<path d="M25 30 18 41h6l-3 8 9-12h-6l3-7z" fill="#ffc83d"/>';
  else if((code>=71&&code<=77)||code===85||code===86) s = cloud("#fff",-4)+'<g fill="#fff"><circle cx="16" cy="44" r="2"/><circle cx="24" cy="44" r="2"/><circle cx="32" cy="44" r="2"/></g>';
  else s = cloud("#dfe6ee",-6)+drops;
  return `<svg class="wx" viewBox="0 0 48 48">${s}</svg>`;
}
export const arrowSvg = (deg,col="#0b2f5b") => `<svg viewBox="-8 -8 16 16" style="transform:rotate(${deg}deg)"><path d="M0-7 5 6 0 3-5 6Z" fill="${col}"/></svg>`;
export let meteoLL=null;
export async function openMeteo(ll){
  meteoLL = ll || (last?last.ll:map.getCenter());
  if(ll) markTmp(ll); else if(tmpMarker){ map.removeLayer(tmpMarker); setTmpMarker(null); }
  openSheet("sMeteo"); $("meteoBody").hidden=true; $("meteoMsg").hidden=false; $("meteoMsg").textContent="Chargement de la météo…";
  $("mtPlace").textContent = "7 jours · "+(ll ? "Point " : last ? "Au bateau " : "Centre carte ") + dm(meteoLL.lat,"N","S").replace(/\.\d+'/,"'")+" "+dm(meteoLL.lng,"E","W").replace(/\.\d+'/,"'");
  const la=meteoLL.lat.toFixed(3), lo=meteoLL.lng.toFixed(3);
  try{
    const [f,m] = await Promise.all([
      getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,pressure_msl,precipitation,snowfall,freezing_level_height&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset&wind_speed_unit=kn&timezone=auto&forecast_days=7`+(model!=="best_match"?`&models=${model}`:"")).catch(e=>{ if(model==="best_match") throw e; toast(modelName(model)+" indisponible ici : Auto"); return getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,pressure_msl,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset&wind_speed_unit=kn&timezone=auto&forecast_days=7`); }),
      R() ? Promise.resolve(null) : getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${la}&longitude=${lo}&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,ocean_current_velocity,ocean_current_direction,sea_level_height_msl&timezone=auto&forecast_days=7&cell_selection=sea`).catch(()=>null)
    ]);
    store.set("meteo",{f,m,at:Date.now()}); renderMeteo(f,m); loadCompare(la,lo);
  }catch(e){
    const c=store.get("meteo",null);
    if(c){ renderMeteo(c.f,c.m); toast("Hors ligne : météo enregistrée le "+new Date(c.at).toLocaleString("fr-FR",{weekday:"short",hour:"2-digit",minute:"2-digit"}),5000); }
    else $("meteoMsg").textContent="Météo indisponible. Vérifiez la connexion réseau.";
  }
}
function snowT(h,i){ const v=h.snowfall?h.snowfall[i]:null; return v==null ? '<div class="tile"><small>—</small></div>' : `<div class="tile" style="${v>=0.1?"background:#e1f5fe":""}"><span>${v>=0.1?(v<1?v.toFixed(1):Math.round(v)):"0"}</span></div>`; }
function frzT(h,i){ const v=h.freezing_level_height?h.freezing_level_height[i]:null; return v==null ? '<div class="tile"><small>—</small></div>' : `<div class="tile"><span>${Math.round(v/50)*50}</span></div>`; }
export function unsuffix(o){ if(!o) return o; for(const k of Object.keys(o)){ const m=k.match(/^(.*)_(meteofrance|ecmwf|icon|gfs|ukmo).*$/); if(m && !(m[1] in o)) o[m[1]]=o[k]; } return o; }
function renderMeteo(f,m){
  $("meteoMsg").hidden=true; $("meteoBody").hidden=false; unsuffix(f.hourly); unsuffix(f.daily);
  $("mtModel").textContent = "Modèle : "+modelName(model);
  const d=f.daily, h=f.hourly, hm=m&&m.hourly, tf=t=>t.slice(11,16);
  $("mtSun").innerHTML = `<div><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="10" fill="#ffc83d"/></svg><span><small>Lever</small>${tf(d.sunrise[0])}</span></div>
    <div><svg viewBox="0 0 48 48"><path d="M28 8a14 14 0 1 0 12 20 11 11 0 0 1-12-20z" fill="#e8ecf5"/></svg><span><small>Coucher</small>${tf(d.sunset[0])}</span></div>`;
  const now=Date.now(); let i0=0; h.time.forEach((t,i)=>{ if(new Date(t).getTime()<=now) i0=i; });
  const mIdx = t => hm ? hm.time.indexOf(t) : -1;
  let html='';
  for(let i=i0;i<Math.min(i0+48,h.time.length);i++){
    const t=h.time[i], dt=new Date(t), w=h.wind_speed_10m[i], gu=h.wind_gusts_10m[i], wc=w<10?"w1":w<17?"w2":w<25?"w3":"w4", j=mIdx(t);
    let wave='<div class="tile"><small>—</small></div>', cur=wave, sea=wave, swell=wave;
    const pr=h.pressure_msl?h.pressure_msl[i]:null, rn=h.precipitation?h.precipitation[i]:null;
    const press = pr==null ? wave : `<div class="tile"><span>${Math.round(pr)}</span></div>`;
    const rain = rn==null ? wave : `<div class="tile ${rn>=3?"w3":rn>=0.5?"rn":""}"><span>${rn<0.05?"–":rn<0.1?"0,1":rn.toFixed(1).replace(".",",")}</span></div>`;
    if(j>=0){
      if(hm.wave_height[j]!=null) wave=`<div class="tile"><span>${hm.wave_height[j].toFixed(1).replace(".",",")}</span><small>${Math.round(hm.wave_period[j])} s</small></div>`;
      if(hm.swell_wave_height && hm.swell_wave_height[j]!=null) swell=`<div class="tile">${arrowSvg((hm.swell_wave_direction[j]+180)%360)}<span>${hm.swell_wave_height[j].toFixed(1).replace(".",",")}</span><small>${Math.round(hm.swell_wave_period[j])} s</small></div>`;
      if(hm.ocean_current_velocity[j]!=null){ const c=hm.ocean_current_velocity[j]/1.852;
        cur=`<div class="tile cur ${c>=3?"c3":c>=1.5?"c2":""}">${arrowSvg(hm.ocean_current_direction[j],"#c0392b")}<span>${c.toFixed(1).replace(".",",")}</span></div>`; }
      if(hm.sea_level_height_msl && hm.sea_level_height_msl[j]!=null){ const s=hm.sea_level_height_msl[j], s2=hm.sea_level_height_msl[j+1];
        sea=`<div class="tile"><span>${s>=0?"+":""}${s.toFixed(1).replace(".",",")}</span><small>${s2==null?"":s2>s?"▲ monte":"▼ desc."}</small></div>`; }
    }
    const day = (i===i0 || dt.getHours()===0) ? dt.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric"}) : "";
    html+=`<button class="hr${i===i0?" now sel":""}" data-t="${t}"><span class="d">${day}</span><span class="h">${i===i0?"Main.":tf(t)}</span>
      ${wxIcon(h.weather_code[i],h.is_day[i])}<span class="tp">${Math.round(h.temperature_2m[i])}°</span>
      <div class="tile ${wc}">${arrowSvg((h.wind_direction_10m[i]+180)%360)}<span>${Math.round(w)}</span><small>raf ${Math.round(gu)}</small></div>
      ${rain}${press}${R() ? snowT(h,i)+frzT(h,i) : wave+swell+cur+sea}</button>`;
  }
  $("mtHours").innerHTML=html; $("mtHours").scrollLeft=0;
  $("mtHours").querySelectorAll(".hr").forEach(b => b.onclick = () => {
    $("mtHours").querySelectorAll(".hr").forEach(x=>x.classList.remove("sel")); b.classList.add("sel");
    if(ov.data){ const k=ov.data[0].time.indexOf(b.dataset.t); if(k>=0) setHour(k); }
  });
  $("mtDays").innerHTML = d.time.map((t,i)=>`<div class="day">${i===0?"Auj.":new Date(t).toLocaleDateString("fr-FR",{weekday:"short"})}
    ${wxIcon(d.weather_code[i],1)}<div class="t">${Math.round(d.temperature_2m_max[i])}° <span>${Math.round(d.temperature_2m_min[i])}°</span></div>
    <div class="w">${Math.round(d.wind_speed_10m_max[i])}–${Math.round(d.wind_gusts_10m_max[i])} nd ${compass(d.wind_direction_10m_dominant[i])}</div></div>`).join("");
}
const CMP = [["meteofrance_arome_france_hd","AROME","#ff7043"],["meteofrance_arpege_europe","ARPEGE","#ffca28"],["ecmwf_ifs025","ECMWF","#4fc3f7"],["icon_seamless","ICON","#81c784"],["gfs_seamless","GFS","#ce93d8"]];
let cmpData=null;
async function loadCompare(la,lo){
  cmpData=null; $("cmpLeg").textContent="Chargement des modèles…"; drawCompare();
  const res = await Promise.allSettled(CMP.map(([id])=>getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=wind_speed_10m&wind_speed_unit=kn&timezone=auto&forecast_days=3&models=${id}`)));
  cmpData = res.map((r,i)=>{ if(r.status!=="fulfilled") return null; const h=unsuffix(r.value.hourly); return {id:CMP[i][0], name:CMP[i][1], col:CMP[i][2], time:h.time, v:h.wind_speed_10m}; }).filter(Boolean);
  $("cmpLeg").innerHTML = cmpData.length ? cmpData.map(d=>`<span><i style="background:${d.col}"></i>${d.name}</span>`).join("") : "Comparaison indisponible";
  drawCompare();
}
function drawCompare(){
  const c=$("cmpGraph"), dpr=window.devicePixelRatio||1, W=c.clientWidth, H=c.clientHeight; if(!W) return;
  c.width=W*dpr; c.height=H*dpr; const g=c.getContext("2d"); g.scale(dpr,dpr); if(!cmpData||!cmpData.length) return;
  const now=Date.now(), t0=cmpData[0].time.findIndex(t=>new Date(t).getTime()>=now-3600e3), n=48, idx=i=>t0+i;
  let hi=10; cmpData.forEach(d=>{ for(let i=0;i<n;i++){ const v=d.v[idx(i)]; if(v!=null&&v>hi) hi=v; } }); hi=Math.ceil(hi/5)*5;
  const padL=26, padR=8, top=8, bot=H-16, X=i=>padL+i*(W-padL-padR)/(n-1), Y=v=>bot-v/hi*(bot-top);
  g.font="500 10px Inter,system-ui,sans-serif";
  for(let v=0; v<=hi; v+=5){ g.strokeStyle="rgba(11,47,91,.1)"; g.beginPath(); g.moveTo(padL,Y(v)); g.lineTo(W-padR,Y(v)); g.stroke(); g.fillStyle="#5d6e80"; g.textAlign="right"; g.fillText(v,padL-4,Y(v)+3); }
  for(let i=0;i<n;i++){ const tt=cmpData[0].time[idx(i)]; if(!tt) continue; const hr=new Date(tt).getHours();
    if(hr%6===0){ g.fillStyle="#5d6e80"; g.textAlign="center"; g.fillText(hr===0?new Date(tt).toLocaleDateString("fr-FR",{weekday:"short"}):String(hr).padStart(2,"0")+"h", X(i), H-3); } }
  cmpData.forEach(d=>{ g.beginPath(); let on=false; for(let i=0;i<n;i++){ const v=d.v[idx(i)]; if(v==null){ on=false; continue; } on?g.lineTo(X(i),Y(v)):(g.moveTo(X(i),Y(v)),on=true); }
    g.strokeStyle=d.col; g.lineWidth=2.2; g.stroke(); });
  g.fillStyle="#5d6e80"; g.textAlign="left"; g.fillText("nœuds",padL+4,top+10);
}

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initPrevisions(){
  $("bMeteo").onclick = () => $("sMeteo").hidden ? openMeteo(null) : closeSheets();
}
