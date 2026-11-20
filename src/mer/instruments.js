// Instruments : gros chiffres à la barre
import { last, sogNow } from "../gps/gps.js";
import { BOATS, RT, boatSpeed } from "./routage.js";
import { navR, routes } from "./routes.js";
import { loadTable, tbl } from "../meteo/tableau.js";
import { closeSheets } from "../ui/panneaux.js";
import { $, compass, fmtLL, pad3 } from "../utils.js";

/* ================= Instruments (gros chiffres à la barre) ================= */
export var instOn=false, xteWarnT=0;
export function instOpen(){ instOn=true; $("inst").hidden=false; instTick(); if(!tbl.f) loadTable().then(instTick).catch(()=>{}); }
function instClose(){ instOn=false; $("inst").hidden=true; }
export function instTick(){ if(!instOn) return;
  const T=(id,v,u)=>{ const e=$(id); if(e){ e.querySelector("span").textContent=v; if(u!=null) e.querySelector("i").textContent=u; } };
  T("iSog", sogNow!=null?sogNow.toFixed(1).replace(".",","):"—"); T("iCog", $("cog").textContent||"—");
  const rt = navR && routes.find(r=>r.id===navR.id);
  $("iNav").hidden=!rt; $("iNoNav").hidden=!!rt;
  if(rt){ $("iWp").textContent=$("ncWp").textContent; T("iDtw",$("ncDist").textContent); T("iBtw",$("ncBrg").textContent.replace("°",""));
    $("iXte").querySelector("span").textContent=$("ncXte").textContent; $("iXte").classList.toggle("warn", !!$("ncXte").style.color);
    $("iEta").querySelector("span").textContent=$("ncEta").textContent.replace(/^arrivée WP /,"").split(" · ")[0];
    const vm=$("ncWp").dataset.vmg; T("iVmg", vm||"—"); }
  $("iClock").textContent=new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
  $("iPos").textContent= last ? fmtLL(last.ll.lat,last.ll.lng) : "GPS en attente";
  // vent prévu au bateau, si le tableau météo est chargé
  let w="—"; try{ const h=tbl.f&&tbl.f.hourly; if(h){ const now=Date.now(); let k=0; h.time.forEach((t,i)=>{ if(new Date(t).getTime()<=now) k=i; });
    w=Math.round(h.wind_speed_10m[k])+" nd (raf. "+Math.round(h.wind_gusts_10m[k])+") "+compass(h.wind_direction_10m[k]); } }catch(e){}
  $("iWind").textContent=w;
  try{ instPerf(); }catch(e){}
}
// --- performance polaire : vent prévu, vitesse sur l'eau, cible de la polaire
function instEnv(){ // vent et courant prévus à l'heure courante, au point du tableau météo
  const h=tbl.f&&tbl.f.hourly; if(!h) return null; const now=Date.now(); let k=0; h.time.forEach((t,i)=>{ if(new Date(t).getTime()<=now) k=i; });
  const e={tws:h.wind_speed_10m[k], twd:h.wind_direction_10m[k]}; const hm=tbl.m&&tbl.m.hourly;
  if(hm){ const j=hm.time.indexOf(h.time[k]); if(j>=0 && hm.ocean_current_velocity[j]!=null){ e.cs=hm.ocean_current_velocity[j]/1.852; e.cd=hm.ocean_current_direction[j]; } }
  return e; }
const rad=d=>d*Math.PI/180, norm180=a=>((a%360)+540)%360-180;
function instPerf(){ const c=$("iPolar"); if(!c || !instOn) return; const e=instEnv(), cog=parseFloat($("cog").textContent);
  const b=BOATS.find(x=>x.id===RT.boat); $("iBoat").textContent = RT.polFile?"polaire importée":(RT.boat==="orc"&&RT.orc)?RT.orc.n:(b?b.name:"—"); $("iBoat").textContent+= RT.spi?"":" · sans spi";
  // vitesse sur l'eau = vitesse fond - courant
  let stw=sogNow, hdg=cog;
  if(e && e.cs!=null && sogNow!=null && isFinite(cog)){ const vx=sogNow*Math.sin(rad(cog))-e.cs*Math.sin(rad(e.cd)), vy=sogNow*Math.cos(rad(cog))-e.cs*Math.cos(rad(e.cd));
    stw=Math.hypot(vx,vy); hdg=(Math.atan2(vx,vy)*180/Math.PI+360)%360; }
  const ok = e && stw!=null && isFinite(hdg) && sogNow>0.3, tws=e?e.tws:null;
  const twaS = ok ? norm180(e.twd-hdg) : null, twa = ok?Math.abs(twaS):null, tgt = ok ? boatSpeed(twa,tws) : null;
  // meilleurs angles de VMG
  let up={v:0,a:45}, dn={v:0,a:150}; if(e) for(let a=30;a<=180;a+=1){ const v=boatSpeed(a,tws), vm=v*Math.cos(rad(a)); if(a<=90 && vm>up.v) up={v:vm,a,s:v}; if(a>=90 && -vm>dn.v) dn={v:-vm,a,s:v}; }
  const pct = ok && tgt>0.3 ? Math.round(stw/tgt*100) : null;
  $("iPct").textContent = pct!=null ? pct+" %" : "—"; $("iPct").style.color = pct==null?"":pct>=95?"#2E7D32":pct>=80?"#E65100":"#C62828";
  const f1=v=>v.toFixed(1).replace(".",",");
  $("iPerf").innerHTML = !e ? "Ouvrez le panneau Météo une fois (réseau) pour charger le vent prévu."
    : !ok ? `Vent prévu <b>${Math.round(tws)} nd du ${pad3(e.twd)}°</b>. En attente de vitesse et de cap GPS.`
    : `Vent prévu <b>${Math.round(tws)} nd du ${pad3(e.twd)}°</b> · angle <b>${Math.round(twa)}°</b> ${twaS>0?"tribord":"bâbord"} amures<br>`
      +`Cible <b>${f1(tgt)} nd</b> · vous <b>${f1(stw)} nd</b> sur l'eau`+(e.cs!=null?` (fond ${f1(sogNow)} nd)`:"")+`<br>`
      +`Meilleur près <b>${up.a}°</b> (${f1(up.s)} nd) · meilleur portant <b>${dn.a}°</b> (${f1(dn.s)} nd)`
      +(twa<90 && twa<up.a-4 ? "<br><b>Trop serré</b> : abattez un peu" : twa>up.a+6 && twa<up.a+18 ? "<br>Si vous remontez au vent : <b>lofez</b> vers "+up.a+"°" : twa>90 && twa>dn.a+8 ? "<br>Trop arrivé : <b>lofez</b> un peu" : "");
  // dessin de la polaire au vent du moment
  const dpr=window.devicePixelRatio||1, W=c.clientWidth, H=c.clientHeight; if(!W) return; c.width=W*dpr; c.height=H*dpr; const g=c.getContext("2d"); g.scale(dpr,dpr);
  if(!e) return; let vmax=1; for(let a=0;a<=180;a+=5) vmax=Math.max(vmax,boatSpeed(a,tws)); if(ok) vmax=Math.max(vmax,stw);
  const cx=W*0.18, cy=H/2, Rr=Math.min(W-cx-14,H/2-14), sc=Rr/vmax, P=(a,v)=>[cx+v*sc*Math.sin(rad(a)), cy-v*sc*Math.cos(rad(a))];
  g.font="500 11px Inter,system-ui,sans-serif"; g.strokeStyle="rgba(11,47,91,.12)"; g.fillStyle="#6B7C90";
  const st=vmax>10?4:2; for(let v=st;v<=vmax;v+=st){ g.beginPath(); g.arc(cx,cy,v*sc,-Math.PI/2,Math.PI/2); g.stroke(); g.fillText(v+" nd",cx+3,cy+v*sc-3); }
  [up.a,90,dn.a].forEach(a=>{ g.beginPath(); g.moveTo(cx,cy); g.lineTo(...P(a,vmax)); g.stroke(); });
  g.beginPath(); for(let a=0;a<=180;a+=2){ const [x,y]=P(a,boatSpeed(a,tws)); a?g.lineTo(x,y):g.moveTo(x,y); } g.strokeStyle="#1D6FB8"; g.lineWidth=2.5; g.stroke();
  g.fillStyle="#0B2F5B"; g.textAlign="center"; g.fillText("vent "+Math.round(tws)+" nd ↓",cx,12);
  if(ok){ const [tx,ty]=P(twa,tgt), [bx,by]=P(twa,stw); g.setLineDash([4,4]); g.strokeStyle="#6B7C90"; g.lineWidth=1.5; g.beginPath(); g.moveTo(cx,cy); g.lineTo(...P(twa,vmax)); g.stroke(); g.setLineDash([]);
    g.fillStyle="#fff"; g.strokeStyle="#1D6FB8"; g.lineWidth=2.5; g.beginPath(); g.arc(tx,ty,6,0,7); g.fill(); g.stroke();
    g.fillStyle="#E5372B"; g.beginPath(); g.arc(bx,by,7,0,7); g.fill(); g.textAlign="left"; g.fillStyle="#0B2F5B"; g.font="600 12px Inter,system-ui"; g.fillText("vous",bx-38,by+4); }
  // cap à suivre en tenant compte du courant (navigation en cours)
  const ctsBox=$("iCts"); ctsBox.hidden=true;
  if(navR && e && e.cs!=null && e.cs>0.2 && sogNow>1){ const btw=parseFloat($("ncBrg").textContent), s=stw||sogNow, x=e.cs*Math.sin(rad(e.cd-btw))/s;
    if(isFinite(btw) && Math.abs(x)<1){ const cts=(btw-Math.asin(x)*180/Math.PI+360)%360; ctsBox.hidden=false; ctsBox.querySelector("span").textContent=pad3(cts)+"° (route "+pad3(btw)+"°, courant "+f1(e.cs)+" nd)"; } }
}

// pour les autres modules (une variable importée ne peut pas être modifiée directement)
export function setXteWarnT(v){ xteWarnT = v; return v; }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initInstruments(){
  $("instClose").onclick=instClose;
  setInterval(instTick, 5000);
  $("bInst").onclick=()=>{ closeSheets(); instOpen(); };
}
