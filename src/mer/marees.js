// Marées officielles SHOM (vignette officielle)
import { fmtD, map } from "../carte/carte.js";
import { $ } from "../utils.js";

/* ---------- Marées officielles SHOM (vignette officielle) ---------- */
const PORTS = [
  ["DUNKERQUE","Dunkerque",51.05,2.37],["CALAIS","Calais",50.97,1.87],["BOULOGNE-SUR-MER","Boulogne-sur-Mer",50.73,1.58],["DIEPPE","Dieppe",49.93,1.08],
  ["FECAMP","Fécamp",49.77,0.37],["LE_HAVRE","Le Havre",49.48,0.11],["HONFLEUR","Honfleur",49.42,0.23],["OUISTREHAM","Ouistreham",49.29,-0.25],
  ["CHERBOURG","Cherbourg",49.65,-1.63],["GOURY","Goury",49.71,-1.95],["DIELETTE","Diélette",49.55,-1.86],["CARTERET","Carteret",49.37,-1.80],
  ["ILES_CHAUSEY","Îles Chausey",48.87,-1.82],["SAINT-MALO","Saint-Malo",48.64,-2.03],["SAINT-CAST","Saint-Cast",48.64,-2.25],["ERQUY_PORT","Erquy",48.64,-2.47],
  ["SAINT-QUAY-PORTRIEUX","Saint-Quay-Portrieux",48.65,-2.83],["PAIMPOL","Paimpol",48.79,-3.04],["PLOUMANACH","Ploumanac'h",48.83,-3.49],["TREBEURDEN","Trébeurden",48.77,-3.58],
  ["ROSCOFF","Roscoff",48.72,-3.97],["ABER_WRAC_H","L'Aber Wrac'h",48.60,-4.56],["LE_CONQUET","Le Conquet",48.36,-4.78],["BREST","Brest",48.38,-4.49],
  ["CAMARET-SUR-MER","Camaret-sur-Mer",48.28,-4.60],["DOUARNENEZ","Douarnenez",48.10,-4.33],["AUDIERNE","Audierne",48.02,-4.54],["LE_GUILVINEC","Le Guilvinec",47.79,-4.28],
  ["CONCARNEAU","Concarneau",47.87,-3.91],["PORT-TUDY","Port-Tudy (Groix)",47.64,-3.45],["LE_PALAIS","Le Palais (Belle-Île)",47.35,-3.15],["LA_TRINITE-SUR-MER","La Trinité-sur-Mer",47.58,-3.03],
  ["PORT-NAVALO","Port-Navalo",47.55,-2.92],["LE_CROUESTY","Le Crouesty",47.54,-2.90],["LE_CROISIC","Le Croisic",47.30,-2.52],["SAINT-NAZAIRE","Saint-Nazaire",47.27,-2.20],
  ["PORNIC","Pornic",47.11,-2.11],["PORT-JOINVILLE","Port-Joinville (Yeu)",46.73,-2.35],["LES_SABLES-D_OLONNE","Les Sables-d'Olonne",46.50,-1.79],["LA_ROCHELLE-PALLICE","La Rochelle - La Pallice",46.16,-1.22],
  ["ILE_D_AIX","Île d'Aix",46.01,-1.17],["ROYAN","Royan",45.62,-1.03],["PORT-BLOC","Pointe de Grave",45.57,-1.06],["CAP_FERRET","Cap Ferret",44.63,-1.25],
  ["ARCACHON_EYRAC","Arcachon",44.66,-1.16],["BOUCAU-BAYONNE","Boucau-Bayonne",43.53,-1.52],["SOCOA","Saint-Jean-de-Luz",43.39,-1.68],
  ["PORT-VENDRES","Port-Vendres",42.52,3.11],["SETE","Sète",43.40,3.70],["MARSEILLE","Marseille",43.30,5.35],["TOULON","Toulon",43.12,5.92],
  ["NICE","Nice",43.69,7.29],["MONACO","Monaco",43.73,7.42],["AJACCIO","Ajaccio",41.92,8.76],["BASTIA","Bastia",42.70,9.45],["CALVI","Calvi",42.57,8.76],
  ["BONIFACIO","Bonifacio",41.39,9.16],["SAINT_HELIER","Saint-Hélier (Jersey)",49.18,-2.12]
];
function portsNear(ll){ return PORTS.map(p=>({id:p[0],name:p[1],d:map.distance(ll,[p[2],p[3]])})).sort((a,b)=>a.d-b.d); }
let tidePort=null;
export function showOfficialTide(ll, portId){
  const list=portsNear(ll).slice(0,8), sel=$("tidePort"); sel.innerHTML="";
  list.forEach(p=>{ const o=document.createElement("option"); o.value=p.id; o.textContent=p.name+" · "+fmtD(p.d); sel.appendChild(o); });
  tidePort = portId || list[0].id; sel.value=tidePort; renderTideWidget();
}
function renderTideWidget(){
  const box=$("tideBox"), W=box.clientWidth||360, sc=Math.min(1, W/675);
  box.innerHTML=""; box.style.height=Math.round(900*sc)+"px";
  if(!navigator.onLine){ box.style.height="auto"; box.innerHTML='<p class="note" style="color:#9fc0e6">Hors ligne : les marées officielles demandent du réseau.</p>'; return; }
  // cadre « data: » : origine isolée de l'app (pas d'accès à vos données), mais la vignette SHOM peut créer son propre cadre
  const f=document.createElement("iframe"); f.title="Marées officielles SHOM";
  f.style.cssText=`width:675px;height:900px;border:0;transform:scale(${sc});transform-origin:0 0;background:#fff;border-radius:8px`;
  f.src="data:text/html;charset=utf-8,"+encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff}</style></head><body><script src="https://services.data.shom.fr/hdm/vignette/grande/${encodeURIComponent(tidePort)}?locale=fr"><\/script></body></html>`);
  box.appendChild(f);
}

// Démarrage (appelé par main.js, dans l'ordre d'origine)
export function initMarees(){
  $("tidePort").onchange=e=>{ tidePort=e.target.value; renderTideWidget(); };
}
