# Comptes de la France

Page statique (HTML + d3, sans serveur) qui présente :

1. **Le PIB** : ses trois optiques (production, demande, revenus), la valeur ajoutée par activité, et une cascade qui sépare ce qui est vendu à des clients de ce qui est compté par convention (services publics au coût, loyers imputés, impôts sur les produits, amortissement).
2. **L'argent public** : diagramme de flux en cinq colonnes (qui paie → comment → quelle administration → pour quoi → qui reçoit), par tranche de niveau de vie.
3. **Couper la dépense ?** : simulateur du seuil de multiplicateur au-delà duquel une baisse de dépense fait monter le ratio dette/PIB la première année (m* = 1 / (dette/PIB + taux de prélèvements)).
4. **Sur 30 ans** : charge d'intérêts de la dette et dépenses par fonction depuis 1995.
5. **Comparer les pays** : 30 pays Eurostat (composition du PIB, dépenses par fonction, dette et intérêts, actifs et passifs).
6. **Énergie** : diagramme de flux du bilan énergétique (Eurostat), séries depuis 1965 (Our World in Data), électricité française en direct (RTE éCO2mix via ODRÉ), comparaison européenne.
7. **Patrimoine** : actifs et passifs de la France par secteur (ménages, entreprises, secteur financier, administrations).

## Fichiers

- `index.html`, `style.css`, `app.js` : la page.
- `lib/` : d3 7.9.0 et d3-sankey 0.12.3 (licences ISC / BSD incluses).
- `data/sources/` : fichiers bruts Eurostat (JSON-stat) et INSEE (xlsx).
- `data/finances.json` : données calculées, lues par la page.
- `scripts/fetch.sh` : retélécharge les sources.
- `scripts/build.py` : calcule `data/finances.json`, `data/comparaison.json` et `data/pays/*.json` (Python 3 + openpyxl).
- `scripts/build_energie.py` : calcule `data/energie/*.json`.
- `energie.js` : section Énergie (l'électricité en direct est chargée par le navigateur depuis odre.opendatasoft.com).

## Mettre à jour

```bash
bash scripts/fetch.sh
python3 scripts/build.py
python3 scripts/build_energie.py
```

Pour voir la page en local : `python3 -m http.server` dans ce dossier, puis ouvrir http://localhost:8000.

## Hypothèses principales

- Montants Eurostat de l'année choisie ; répartition par tranche selon les proportions des comptes nationaux distribués 2023 de l'INSEE (Insee Analyses n° 118).
- Flux entre administrations présentés en net ; transferts en capital entre administrations répartis au prorata faute de matrice détaillée.
- Dépenses par fonction de chaque administration ajustées (RAS) pour coïncider avec le total consolidé COFOG.
- Loyers imputés : série Eurostat CP042, prolongée au rythme moyen des 7 dernières années connues quand elle n'est pas encore publiée.
- Intérêts de la dette versés à un bloc « Prêteurs », non réparti par tranche.
