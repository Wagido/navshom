# Balise — Comment je travaille

> Depuis la version 2026.11.20-a. Résumé : **je modifie sur `beta`, j'essaie sur /beta/, puis je fusionne dans `main`.**

## Les deux sites

| Site | Adresse | Branche | Pour qui |
|---|---|---|---|
| **Production** | https://wagido.github.io/navshom/ | `main` | Tous les utilisateurs, et l'APK Android |
| **Test (bêta)** | https://wagido.github.io/navshom/beta/ | `beta` | Moi, pour essayer avant de publier |

- La bêta affiche « bêta » à côté du numéro de version (écran de démarrage, Plus › À propos). La production n'affiche rien de plus.
- Les deux sites sont **séparés sur le téléphone** : réglages, traces, repères, routes, zones hors ligne et cartes en cache ne sont pas partagés. La bêta range ses réglages sous `navb_…` (la production sous `nav_…`) et ses caches sous `navshom-beta-…` (la production sous `navshom-…`). Chaque site a son propre service worker.
- Pour retrouver mes données de production dans la bêta : Plus › Sauvegarde dans la production, puis Restaurer dans la bêta. Le fichier de sauvegarde est le même pour les deux.
- L'APK charge toujours la production. La bêta s'essaie dans Chrome sur le téléphone (on peut aussi l'ajouter à l'écran d'accueil).
- La jauge d'espace (Plus › Hors ligne) compte l'espace de tout le site (production et bêta ensemble) : le navigateur ne sait pas les séparer.

## Le circuit d'une modification

1. **Modifier sur `beta`** (jamais directement sur `main`).
   - Incrémenter `APP_VERSION` dans `index.html` et le numéro du cache `navshom-app-vN` dans `sw.js`.
2. **Pousser `beta`.** GitHub Actions lance les tests (environ 5 minutes). S'ils passent, /beta/ est mise à jour (une à deux minutes de plus).
   - Suivi : onglet **Actions** du dépôt, workflow « Tests et publication ».
   - Si les tests échouent, /beta/ reste sur sa version précédente. Le rapport (captures, détails) est dans l'onglet Actions, en bas de l'exécution, « rapport-tests-beta ».
3. **Essayer sur /beta/** avec le téléphone, en Mer et en Rando.
4. **Fusionner `beta` dans `main`** (une pull request de `beta` vers `main`, ou une fusion directe). Les tests repassent sur la pull request. Après la fusion, la production est publiée.
   - Si `main` contient exactement le commit déjà testé sur `beta`, il n'est pas retesté : il est publié tout de suite.
   - **La production n'est jamais publiée si les tests de `main` échouent.** Elle reste alors sur la dernière version qui les a passés.
5. Après publication, les utilisateurs voient le bandeau « Nouvelle version disponible » (au retour sur l'appli, ou dans les 30 minutes).

## Les tests automatiques

Ils tournent sur GitHub à chaque push et à chaque pull request (Chromium, profil de téléphone Pixel 7).

| Test | Ce qui est vérifié |
|---|---|
| Démarrage | L'appli démarre sans aucune erreur JavaScript (vérifié aussi pendant tous les autres tests) |
| Mer et Rando | La bascule change le bandeau, les boutons, et le mode est mémorisé |
| Carte | La carte remplit l'écran, les tuiles s'affichent, le zoom et l'échelle marchent |
| Météo | Le panneau s'ouvre, le tableau heure par heure se remplit, sans bandeau d'erreur (Mer et Rando) |
| Trace | Enregistrer en Rando avec un GPS simulé, terminer (double toucher), la trace est rangée dans Traces |
| Mesure | Trois points en Mer et en Rando, la distance s'affiche |
| Routage | Point touché, Routage, calcul : une route s'affiche |
| Menu Plus | Les rubriques sont là, Instruments et Routage s'ouvrent |
| Hors ligne | Après une première visite, l'appli redémarre sans réseau |
| Séparation bêta | /beta/ a son service worker, ses caches et ses réglages, sans toucher à ceux de la production |
| Mise en page | `tools-check.js` : 5 écrans × 6 états × 2 modes, aucun chevauchement ni débordement |

**Aucun appel aux vrais services** pendant les tests (Open-Meteo, IGN, SHOM, OpenStreetMap, Overpass…) : `tests/mock.js` fabrique des réponses toujours identiques (météo, altitudes, itinéraires, tuiles). Les tests sont donc fiables et ne consomment aucun quota.

### Lancer les tests sur un ordinateur

```
npm install
npx playwright install chromium   # une seule fois
npx playwright test               # tous les tests
npx playwright test -g Météo      # seulement ceux dont le nom contient « Météo »
```

Le serveur local (`node tests/server.js 8799`) est démarré tout seul. Il sert aussi le dépôt sous `/beta/`, comme le vrai site. Pour regarder l'appli soi-même : `npm run serve`, puis http://localhost:8799/.

## Fichiers ajoutés

```
.github/workflows/pages.yml   # tests puis publication (main à la racine, beta dans /beta/)
.github/workflows/tests.yml   # les tests (pull requests, autres branches, et appelé par pages.yml)
playwright.config.js          # réglages des tests (Pixel 7, réseau simulé, serveur local)
tests/app.spec.js             # parcours de l'appli
tests/beta-offline.spec.js    # hors ligne et séparation de la bêta
tests/layout.spec.js          # lance tools-check.js
tests/mock.js                 # réponses simulées des services externes
tests/server.js               # serveur local (racine et /beta/)
package.json                  # version de Playwright utilisée
```

Ces fichiers ne sont pas publiés sur le site.

## Comment la publication est faite

- Le workflow « Tests et publication » (`pages.yml`) tourne à chaque push sur `main` ou `beta`.
- Il teste chaque branche qui a changé, puis retient la dernière version qui a passé les tests avec une étiquette git : `teste-main` et `teste-beta` (visibles dans l'onglet Tags du dépôt : ne pas les supprimer).
- Il assemble le site : `teste-main` à la racine, `teste-beta` dans `beta/`, et le publie avec `actions/deploy-pages`.
- La publication tourne toujours depuis `main` : un push sur `beta` relance tout seul le workflow sur `main`. On peut aussi le lancer à la main : Actions › Tests et publication › Run workflow (branche `main`).
- L'APK (`android.yml`) ne change pas : il n'est reconstruit que si la partie Android change, et il charge toujours la production.

## Réglage GitHub (une seule fois)

Settings › Pages › Build and deployment › Source : **GitHub Actions** (au lieu de « Deploy from a branch »). Puis Actions › Tests et publication › Run workflow, sur `main`.
