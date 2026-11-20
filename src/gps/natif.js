// APK Android (Capacitor) : notifications, son d'alarme, GPS natif en arrière-plan
import { onErr, onPos } from "./gps.js";
import { anchor } from "../mer/mouillage.js";
import { navR } from "../mer/routes.js";
import { rec } from "../rando/traces.js";
import { $, store, toast } from "../utils.js";

export let LNotif, CapFS, CapShare;
let isNative, BGGeo;

const capPlugin = n => { try{ return isNative && window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin(n) : null; }catch(e){ return null; } };

/* ---------- Notifications et son d'alarme ---------- */
let notifAsked=false;
export async function notify(title, body){
  if(navigator.vibrate) navigator.vibrate([400,150,400,150,400]);
  if(LNotif){ try{ if(!notifAsked){ notifAsked=true; await LNotif.requestPermissions(); }
    if(!notify.ch){ notify.ch=true; try{ await LNotif.createChannel({id:"alarm", name:"Alarmes de navigation", description:"Mouillage, route, collision", importance:5, visibility:1, vibration:true}); }catch(e){} }
    await LNotif.schedule({notifications:[{id:Math.floor(Math.random()*1e6), title, body, channelId:"alarm"}]}); return; }catch(e){} }
  try{ if("Notification" in window && Notification.permission==="granted") new Notification(title,{body}); }catch(e){}
}
export let audioCtx=null, beepT=null;
export function alarmSound(on){
  clearInterval(beepT); beepT=null; if(!on) return;
  try{ audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
  try{ audioCtx.resume(); }catch(e){}
  // sirène deux tons, forte : 880 Hz puis 1320 Hz
  const tone=(f,t0,d)=>{ const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.type="square"; o.frequency.value=f;
    g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(0.9,t0+0.02); g.gain.setValueAtTime(0.9,t0+d-0.03); g.gain.exponentialRampToValueAtTime(0.0001,t0+d);
    o.connect(g); g.connect(audioCtx.destination); o.start(t0); o.stop(t0+d); };
  const beep=()=>{ try{ const t=audioCtx.currentTime; tone(880,t,0.3); tone(1320,t+0.32,0.3); }catch(e){} };
  beep(); beepT=setInterval(beep, 800);
}
export const unlockAudio=()=>{ try{ audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)(); audioCtx.resume(); }catch(e){} };
export function showAlarm(msg){ $("alarmMsg").textContent=msg; $("alarm").hidden=false; }
export function hideAlarm(){ $("alarm").hidden=true; alarmSound(false); }

/* ---------- GPS : natif en arrière-plan quand il le faut ---------- */
let geoWatch=null, bgWatch=null, bgPending=false;
function needBackground(){ return !!((rec && rec.on) || anchor || navR || store.get("bgAlways",false)); }
export function geoStart(){
  const wantBg = !!BGGeo && needBackground();
  if(wantBg){
    if(bgWatch!=null || bgPending) return;
    if(geoWatch!=null){ navigator.geolocation.clearWatch(geoWatch); geoWatch=null; }
    bgPending=true;
    BGGeo.addWatcher({backgroundTitle:"Balise suit votre position", backgroundMessage:"Trace, mouillage ou route en cours", requestPermissions:true, stale:false, distanceFilter:3},
      (loc, err)=>{ if(err){ if(err.code==="NOT_AUTHORIZED") toast("Autorisez la localisation pour Balise dans les réglages Android", 6000); return; }
        onPos({coords:{latitude:loc.latitude, longitude:loc.longitude, accuracy:loc.accuracy, altitude:loc.altitude, speed:loc.speed, heading:loc.bearing}, timestamp:loc.time||Date.now()}); })
      .then(id=>{ bgWatch=id; bgPending=false; }).catch(()=>{ bgPending=false; });
  } else {
    if(bgWatch!=null){ try{ BGGeo.removeWatcher({id:bgWatch}); }catch(e){} bgWatch=null; }
    if(geoWatch==null){ if("geolocation" in navigator) geoWatch=navigator.geolocation.watchPosition(onPos, onErr, {enableHighAccuracy:true, maximumAge:1000, timeout:30000}); else onErr({code:0}); }
  }
  $("bgInfo").textContent = !isNative ? "Disponible dans l'application Android (APK). Dans le navigateur, gardez l'écran allumé."
    : bgWatch!=null ? "Actif : le suivi continue écran éteint (notification Balise)." : "Inactif : il démarre seul pendant une trace, un mouillage ou une route.";
}

// pour les autres modules (une variable importée ne peut pas être modifiée directement)
export function setAudioCtx(v){ audioCtx = v; return v; }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initNatif(){

  /* =====================================================================
     Navigation avancée : APK natif, alarme de mouillage, routes,
     sauvegarde, itinéraires sur sentiers, marées officielles, satellite
     ===================================================================== */
  isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  BGGeo = capPlugin("BackgroundGeolocation"); LNotif = capPlugin("LocalNotifications"); CapFS = capPlugin("Filesystem"); CapShare = capPlugin("Share");
  ["pointerdown","keydown"].forEach(ev=>document.addEventListener(ev, unlockAudio, {passive:true}));
  setInterval(geoStart, 2000);
}
