// Prépare les paquets de relief par massif (vue 3D hors ligne), à lancer une fois par le développeur :
//   node tools-relief.js            → tous les massifs
//   node tools-relief.js ecrins     → un seul
// Source : WMS Géoplateforme ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES (IGN, Licence Ouverte 2.0), demandé par blocs
// de 8 × 8 tuiles (1024 px) avec une pause entre deux requêtes, pour ménager le service.
// Sortie : relief/<id>.bin.gz et relief/massifs.json. Le format reprend exactement les tuiles de la vue 3D
// (grille Web Mercator z13, 128 × 128 px) : l'appli les range dans le cache sous l'adresse WMS de chaque tuile.
//
// Format (avant gzip) : "BRL1", puis uint16 LE x0, y0, nx, ny (tuiles z13), puis pour chaque tuile (ligne par ligne,
// ouest → est, nord → sud) un octet 0 (tuile vide, hors couverture IGN) ou 1 suivi de 128 × 128 int16 LE :
// altitude en mètres, codée en écart avec le pixel précédent de la ligne (le premier en valeur absolue).
// Valeur absente : −32768 (écart non appliqué, le pixel suivant repart en absolu).
const { execFileSync } = require("child_process"), fs = require("fs"), zlib = require("zlib"), path = require("path");
const MASSIFS = [
  ["mont-blanc", "Mont-Blanc · Aravis", 45.75, 6.35, 46.15, 7.05],
  ["chablais", "Chablais · Haut-Giffre", 46.05, 6.4, 46.42, 6.95],
  ["vanoise", "Vanoise · Beaufortain", 45.2, 6.4, 45.7, 7.15],
  ["belledonne", "Belledonne · Chartreuse", 45.05, 5.7, 45.55, 6.3],
  ["vercors", "Vercors", 44.7, 5.25, 45.25, 5.75],
  ["ecrins", "Écrins", 44.6, 6.0, 45.15, 6.6],
  ["queyras", "Queyras · Ubaye", 44.3, 6.4, 44.9, 7.05],
  ["mercantour", "Mercantour", 43.95, 6.75, 44.35, 7.65],
  ["pyrenees-ouest", "Pyrénées occidentales", 42.75, -0.9, 43.1, 0.0],
  ["pyrenees-centre", "Pyrénées centrales", 42.6, 0.0, 43.0, 1.0],
  ["pyrenees-est", "Pyrénées orientales", 42.35, 1.7, 42.85, 2.7],
  ["auvergne", "Volcans d'Auvergne", 44.95, 2.5, 45.65, 3.05],
  ["jura", "Jura", 46.3, 5.8, 46.8, 6.3],
  ["vosges", "Vosges", 47.8, 6.8, 48.3, 7.3],
  ["corse", "Corse (GR20)", 41.75, 8.6, 42.6, 9.4],
];
const O = 20037508.342789244, Z = 13, P = 128, B = 8, TS = 2*O/2**Z;
const mx = lng => lng*Math.PI/180*6378137, my = lat => Math.log(Math.tan(Math.PI/4 + lat*Math.PI/360))*6378137;
const wait = ms => new Promise(r => setTimeout(r, ms));
function get(bbox, n){ // curl : suit le proxy et les certificats du système
  const url = `https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES&STYLES=&CRS=EPSG:3857&BBOX=${bbox.map(v=>v.toFixed(2)).join(",")}&WIDTH=${n}&HEIGHT=${n}&FORMAT=image/x-bil;bits=32`;
  for(let k=0;k<4;k++){ try{ const b = execFileSync("curl", ["-sSf", "--max-time", "120", url], {maxBuffer: 64<<20});
      if(b.length === n*n*4) return new Float32Array(b.buffer, b.byteOffset, n*n); }catch(e){} execFileSync("sleep", [String(3*(k+1))]); }
  throw new Error("échec "+url);
}
(async () => {
  const only = process.argv[2], dir = path.join(__dirname, "relief"); fs.mkdirSync(dir, {recursive:true});
  const listFile = path.join(dir, "massifs.json"), list = fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile)) : [];
  for(const [id, name, s, w, n, e] of MASSIFS){
    if(only && only !== id) continue;
    const x0 = Math.floor((mx(w)+O)/TS), x1 = Math.floor((mx(e)+O)/TS), y0 = Math.floor((O-my(n))/TS), y1 = Math.floor((O-my(s))/TS);
    const nx = x1-x0+1, ny = y1-y0+1, W = nx*P, H = ny*P, M = new Float32Array(W*H);
    for(let by=0; by<ny; by+=B) for(let bx=0; bx<nx; bx+=B){ // blocs de 8 × 8 tuiles
      const a = get([-O+(x0+bx)*TS, O-(y0+by+B)*TS, -O+(x0+bx+B)*TS, O-(y0+by)*TS], B*P);
      for(let j=0; j<B*P && by*P+j<H; j++) for(let i=0; i<B*P && bx*P+i<W; i++) M[(by*P+j)*W + bx*P+i] = a[j*B*P+i];
      process.stdout.write("."); await wait(1200); }
    const parts = [Buffer.from("BRL1"), Buffer.from(new Uint16Array([x0, y0, nx, ny]).buffer)]; let full = 0;
    for(let ty=0; ty<ny; ty++) for(let tx=0; tx<nx; tx++){
      const t = new Int16Array(P*P); let ok = 0;
      for(let j=0;j<P;j++){ let prev = null; for(let i=0;i<P;i++){ const v = M[(ty*P+j)*W + tx*P+i];
        if(!(v > -500 && v < 9000)){ t[j*P+i] = -32768; prev = null; continue; }
        const q = Math.round(v); t[j*P+i] = prev === null ? q : Math.max(-32767, Math.min(32767, q-prev)); prev = prev === null ? q : prev + t[j*P+i]; ok++; } }
      if(ok < P*P*.02){ parts.push(Buffer.from([0])); continue; }
      full++; parts.push(Buffer.from([1]), Buffer.from(t.buffer)); }
    const gz = zlib.gzipSync(Buffer.concat(parts), {level:9}); fs.writeFileSync(path.join(dir, id+".bin.gz"), gz);
    const kb = Math.round(gz.length/1024), item = {id, name, b:[s, w, n, e], kb, tiles:full};
    const k = list.findIndex(m => m.id === id); if(k >= 0) list[k] = item; else list.push(item);
    console.log(` ${name} : ${nx}×${ny} tuiles (${full} avec relief), ${kb} Ko`);
  }
  list.sort((a, b) => MASSIFS.findIndex(m => m[0]===a.id) - MASSIFS.findIndex(m => m[0]===b.id));
  fs.writeFileSync(listFile, JSON.stringify(list, null, 1)+"\n");
})();
