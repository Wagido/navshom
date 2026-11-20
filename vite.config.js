// Construction du site (Vite) : npm run build → dossier dist/, à publier tel quel.
// - base relative ("./") : le même site fonctionne à la racine (production) et sous /beta/ (site de test) ;
// - public/ est copié sans changement (Leaflet, Three.js, polices, relief, icônes, manifeste) ;
// - src/sw.js devient dist/sw.js, avec la liste des fichiers construits (assets/…) ajoutée à son cache de démarrage.
import { defineConfig } from "vite";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function serviceWorker() {
  return {
    name: "balise-service-worker",
    apply: "build",
    writeBundle(options) {
      const out = options.dir, dir = join(out, "assets");
      const built = existsSync(dir) ? readdirSync(dir).sort().map(f => "assets/" + f) : [];
      const src = readFileSync(new URL("./src/sw.js", import.meta.url), "utf8");
      const MARK = "const BUILT = [];";
      if (!src.includes(MARK)) this.error("src/sw.js : ligne « " + MARK + " » introuvable");
      writeFileSync(join(out, "sw.js"), src.replace(MARK, "const BUILT = " + JSON.stringify(built) + ";"));
    },
  };
}

export default defineConfig({
  base: "./",
  build: { outDir: "dist", emptyOutDir: true, assetsDir: "assets" },
  plugins: [serviceWorker()],
});
