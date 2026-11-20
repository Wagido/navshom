// Petit serveur local pour les tests : sert le site construit (dist/, npm run build) à la racine et aussi sous /beta/ (comme le site publié).
// Usage : node tests/server.js [port]   (8799 par défaut)
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "dist"), PORT = +process.argv[2] || 8799;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".gz": "application/gzip", ".txt": "text/plain" };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/beta\//, "/");
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, path.normalize(p));
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end("introuvable"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-cache" }); res.end(data);
  });
}).listen(PORT, () => console.log("Balise (site construit, dist/) : http://localhost:" + PORT + "/ (et /beta/)"));
if (!fs.existsSync(path.join(ROOT, "index.html"))) console.warn("dist/index.html absent : lancer d'abord npm run build");
