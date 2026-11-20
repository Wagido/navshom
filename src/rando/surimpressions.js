// Surimpressions Rando : sentiers, courbes, cadastre, forêts, géologie
import { FRANCE, R, geopf, map } from "../carte/carte.js";
import { $, store } from "../utils.js";

let RANDO_OVL, FOR_RGB, forCv, geoCv;

export function randoOvlApply(){ document.querySelectorAll("input.ovl").forEach(cb=>{ const ly=RANDO_OVL[cb.dataset.k]; cb.checked=store.get("ovl_"+cb.dataset.k,false);
  (cb.checked && R()) ? ly.addTo(map) : map.removeLayer(ly); if(cb.dataset.k==="forest"){ $("forLeg").hidden=!cb.checked; if(!(cb.checked&&R())) $("forFloat").hidden=true; } if(cb.dataset.k==="geol"){ $("geolNote").hidden=!cb.checked; $("geolOpRow").hidden=!cb.checked; if(!(cb.checked&&R())) $("geoFloat").hidden=true; } }); }
const geolOp=()=>RANDO_OVL.geol.eachLayer(l=>l.setOpacity(+$("geolOp").value/100));
/* Légende dynamique des forêts : seulement les essences visibles à l'écran, avec leur part */
const FOR_COL=["#E5C45D", "#008C4D", "#004D2E", "#668040", "#00FF80", "#40FF1C", "#915633", "#AFCA59", "#00D92F", "#8080FF", "#BF26FF", "#9926FF", "#4D33FF", "#FF1AFF", "#734DE6", "#A666FF", "#D999FF", "#1AE6E6", "#4D80FF", "#3399FF", "#00929F", "#59FFFF", "#404DFF", "#FF6633", "#FF4033", "#B3B3B3", "#CCFFBF", "#99B3CC", "#FFD138", "#FFFF00", "#FFE6BF", "#FFF9A5"], FOR_LAB=["Fermée, sans arbres (coupe)", "Feuillus en îlots", "Chênes à feuilles caduques", "Chênes verts", "Hêtre", "Châtaignier", "Robinier", "Autre feuillu", "Mélange de feuillus", "Conifères en îlots", "Pin maritime", "Pin sylvestre", "Pin laricio ou noir", "Pin d'Alep", "Pin à crochets ou cembro", "Autre pin", "Mélange de pins", "Sapin ou épicéa", "Mélèze", "Douglas", "Mélange d'autres conifères", "Autre conifère", "Mélange de conifères", "Mixte, feuillus dominants", "Mixte, conifères dominants", "Ouverte sans arbres", "Ouverte, feuillus", "Ouverte, conifères", "Ouverte, mixte", "Peupleraie", "Lande", "Formation herbacée"];
let forT=null;
function forScan(){ const box=$("forFloat"), ly=RANDO_OVL.forest; if(!R() || !map.hasLayer(ly)){ box.hidden=true; return; }
  const cnt=new Array(FOR_COL.length).fill(0), g=forCv.getContext("2d",{willReadFrequently:true}), vb=map.getBounds(); let tot=0;
  Object.values(ly._tiles||{}).forEach(t=>{ const im=t.el; if(!im || !im.complete || !im.naturalWidth) return;
    const b=ly._tileCoordsToBounds(t.coords); if(!vb.intersects(b)) return;
    try{ g.clearRect(0,0,64,64); g.drawImage(im,0,0,64,64); const d=g.getImageData(0,0,64,64).data;
      for(let i=0;i<d.length;i+=4){ if(d[i+3]<128) continue; let best=-1, bd=60;
        for(let k=0;k<FOR_RGB.length;k++){ const c=FOR_RGB[k], e=Math.abs(c[0]-d[i])+Math.abs(c[1]-d[i+1])+Math.abs(c[2]-d[i+2]); if(e<bd){ bd=e; best=k; } }
        if(best>=0){ cnt[best]++; tot++; } } }catch(e){} });
  if(!tot){ box.hidden=true; return; }
  const top=cnt.map((n,k)=>[n,k]).filter(x=>x[0]/tot>=0.02).sort((a,b)=>b[0]-a[0]).slice(0,6);
  box.innerHTML='<b>Forêts à l\'écran</b>'+top.map(([n,k])=>`<span><i style="background:${FOR_COL[k]}"></i>${FOR_LAB[k]}<em>${Math.round(n/tot*100)} %</em></span>`).join("");
  box.hidden=false; }
/* Légende géologique indicative : grands types de terrains d'après le code couleur standard des cartes géologiques */
const GEO_CL=[["Quaternaire · alluvions, éboulis","#F3EED2"],["Tertiaire · sables, argiles, molasses","#F2C94C"],["Crétacé · craie, calcaires, marnes","#7CC47C"],["Jurassique · calcaires, marnes","#5DA9E0"],["Trias · grès, argiles, gypse","#B07CC6"],["Granites et roches magmatiques","#E5737A"],["Primaire · schistes, roches anciennes","#A89F91"]];
let geoT=null;
function geoClass(r,g,b){ const mx=Math.max(r,g,b)/255, mn=Math.min(r,g,b)/255, v=mx, s=mx?1-mn/mx:0; if(v<0.3) return -1;
  let h=0; const d=(mx-mn)*255||1; if(mx*255===r) h=((g-b)/d)%6; else if(mx*255===g) h=(b-r)/d+2; else h=(r-g)/d+4; h=(h*60+360)%360; // teinte calculée avant les tests
  if(v>0.93 && s<0.08) return -1; // blanc : pas de donnée
  if(s<0.12) return v>0.86 ? -1 : 6; if(v>0.85 && s<0.25 && h>=30 && h<75) return 0; if(v>0.9 && s<0.2) return -1;
  if(h<20||h>=320) return 5; if(h<38) return s>0.45?5:6; if(h<68) return 1; if(h<165) return 2; if(h<250) return 3; return 4; }
function geoScan(){ const box=$("geoFloat"), grp=RANDO_OVL.geol; if(!R() || !map.hasLayer(grp)){ box.hidden=true; return; }
  const cnt=new Array(GEO_CL.length).fill(0), g=geoCv.getContext("2d",{willReadFrequently:true}), vb=map.getBounds(); let tot=0;
  grp.eachLayer(ly=>{ if(!ly._map) return; Object.values(ly._tiles||{}).forEach(t=>{ const im=t.el; if(!im||!im.complete||!im.naturalWidth) return; if(!vb.intersects(ly._tileCoordsToBounds(t.coords))) return;
    try{ g.drawImage(im,0,0,48,48); const d=g.getImageData(0,0,48,48).data; for(let i=0;i<d.length;i+=4){ const c=geoClass(d[i],d[i+1],d[i+2]); if(c>=0){ cnt[c]++; tot++; } } }catch(e){} }); });
  if(!tot){ box.hidden=true; return; }
  const top=cnt.map((n,k)=>[n,k]).filter(x=>x[0]/tot>=0.04).sort((a,b)=>b[0]-a[0]).slice(0,5);
  const c=map.getCenter(), ancien=(c.lng<-0.6&&c.lat>46.3&&c.lat<49.3)||(c.lat>44.2&&c.lat<46.6&&c.lng>1.4&&c.lng<4.6)||(c.lat>47.6&&c.lat<48.7&&c.lng>6.5&&c.lng<7.5)||(c.lat>49.7&&c.lng>4.3&&c.lng<5.1);
  const nm=k=> ancien && (k===2||k===3||k===1) ? GEO_CL[6][0] : GEO_CL[k][0];
  const merged={}; top.forEach(([n,k])=>{ const key=nm(k); merged[key]=merged[key]||{n:0,c:GEO_CL[ancien&&(k===2||k===3||k===1)?6:k][1]}; merged[key].n+=n; });
  box.innerHTML='<b>Terrains à l\'écran · indicatif</b>'+Object.entries(merged).sort((a,b)=>b[1].n-a[1].n).map(([t,o])=>`<span><i style="background:${o.c}"></i>${t}<em>${Math.round(o.n/tot*100)} %</em></span>`).join("")+'<small>D\'après les couleurs de la carte. Nom exact des roches : infoterre.brgm.fr</small>';
  box.hidden=false; }
// Terrain sous un point touché : on lit le pixel de la tuile géologique affichée
export function geoAt(ll){ const grp=RANDO_OVL.geol; if(!map.hasLayer(grp)) return null; let out=null;
  grp.eachLayer(ly=>{ if(out || !ly._map) return; const z=ly._tileZoom; if(z==null) return; const pt=map.project(ll,z), ts=ly.getTileSize(), cx=Math.floor(pt.x/ts.x), cy=Math.floor(pt.y/ts.y);
    const t=Object.values(ly._tiles||{}).find(t=>t.coords.x===cx && t.coords.y===cy && t.coords.z===z); if(!t||!t.el.complete||!t.el.naturalWidth) return;
    try{ const g=geoCv.getContext("2d",{willReadFrequently:true}), px=Math.floor((pt.x-cx*ts.x)/ts.x*t.el.naturalWidth), py=Math.floor((pt.y-cy*ts.y)/ts.y*t.el.naturalHeight);
      g.clearRect(0,0,48,48); g.drawImage(t.el, px-2, py-2, 5, 5, 0, 0, 5, 5); const d=g.getImageData(0,0,5,5).data, cnt={};
      for(let i=0;i<d.length;i+=4){ const c=geoClass(d[i],d[i+1],d[i+2]); if(c>=0) cnt[c]=(cnt[c]||0)+1; }
      const best=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0]; if(!best) return; const k=+best[0], c=ll;
      const ancien=(c.lng<-0.6&&c.lat>46.3&&c.lat<49.3)||(c.lat>44.2&&c.lat<46.6&&c.lng>1.4&&c.lng<4.6)||(c.lat>47.6&&c.lat<48.7&&c.lng>6.5&&c.lng<7.5)||(c.lat>49.7&&c.lng>4.3&&c.lng<5.1);
      out = ancien && (k===1||k===2||k===3) ? GEO_CL[6][0] : GEO_CL[k][0]; }catch(e){} });
  return out; }

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initSurimpressions(){
  /* ================= Surimpressions Rando (sentiers, courbes, cadastre, forêts) ================= */
  RANDO_OVL = {
    trails:  L.tileLayer("https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png", {maxZoom:19, maxNativeZoom:17, zIndex:420, opacity:.85, attribution:'Sentiers © <a href="https://hiking.waymarkedtrails.org" target="_blank" rel="noopener">Waymarked Trails</a>, OSM'}),
    contour: L.tileLayer(geopf("ELEVATION.CONTOUR.LINE","image/png"), {maxZoom:19, maxNativeZoom:18, zIndex:410, bounds:FRANCE, attribution:"Courbes © IGN"}),
    cadastre:L.tileLayer(geopf("CADASTRALPARCELS.PARCELLAIRE_EXPRESS","image/png"), {minZoom:14, maxZoom:19, maxNativeZoom:19, zIndex:415, bounds:FRANCE, attribution:"Cadastre © IGN/DGFiP"}),
    geol: L.layerGroup([
      L.tileLayer(geopf("BRGM_SCAN_F_GEOL1M","image/jpeg"), {crossOrigin:true, maxZoom:12, maxNativeZoom:11, opacity:.8, zIndex:404, bounds:FRANCE, attribution:"Géologie © BRGM"}),
      L.tileLayer(geopf("BRGM_SCAN_D_GEOL50","image/jpeg"), {crossOrigin:true, minZoom:13, maxZoom:19, maxNativeZoom:15, opacity:.8, zIndex:404, bounds:FRANCE, attribution:"Géologie © BRGM"})]),
    forest:  L.tileLayer(geopf("LANDCOVER.FORESTINVENTORY.V2","image/png"), {crossOrigin:true, maxZoom:19, maxNativeZoom:16, zIndex:405, opacity:.55, bounds:FRANCE, attribution:"Forêts © IGN"})};
  document.querySelectorAll("input.ovl").forEach(cb=>cb.onchange=()=>{ store.set("ovl_"+cb.dataset.k,cb.checked); randoOvlApply(); });
  $("geolOp").value=store.get("geolOp",80);
  geolOp();
  $("geolOp").oninput=()=>{ store.set("geolOp",+$("geolOp").value); geolOp(); };
  randoOvlApply();
  FOR_RGB = FOR_COL.map(h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)));
  forCv = document.createElement("canvas"); forCv.width=forCv.height=64;
  map.on("moveend zoomend", ()=>{ clearTimeout(forT); forT=setTimeout(forScan,900); clearTimeout(geoT); geoT=setTimeout(geoScan,1000); });
  geoCv = document.createElement("canvas"); geoCv.width=geoCv.height=48;
  RANDO_OVL.geol.eachLayer(l=>l.on("load", ()=>{ clearTimeout(geoT); geoT=setTimeout(geoScan,300); }));
  RANDO_OVL.forest.on("load", ()=>{ clearTimeout(forT); forT=setTimeout(forScan,300); });
}
