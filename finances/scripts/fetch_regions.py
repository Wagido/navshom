#!/usr/bin/env python3
"""Télécharge le bilan électrique annuel par région (RTE éCO2mix consolidé, portail ODRÉ).

Les données sont au pas de 30 minutes (puissances moyennes en MW) : on les agrège côté
serveur par région et par année. Énergie (MWh) = somme des MW × 0,5 h.

Usage : python3 scripts/fetch_regions.py   (écrit data/sources/regions/eco2mix_regions.json)
"""
import datetime, json, os, subprocess, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "sources", "regions", "eco2mix_regions.json")
BASE = "https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/eco2mix-regional-cons-def/records"
FIELDS = ["consommation", "nucleaire", "thermique", "hydraulique", "solaire", "bioenergies", "eolien_terrestre", "eolien_offshore", "ech_physiques"]


def get(params):
    url = BASE + "?" + urllib.parse.urlencode(params)
    for attempt in range(6):
        r = subprocess.run(["curl", "-sS", "--max-time", "120", url], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.startswith("{") and "results" in r.stdout:
            return json.loads(r.stdout)["results"]
        time.sleep(3 + attempt * 3)
    raise RuntimeError("échec ODRÉ : " + (r.stderr or r.stdout)[:200])


out = {}
for year in range(2013, datetime.date.today().year):
    sel = ",".join(f"sum({f}) as {f}" for f in FIELDS) + ",count(*) as n"
    rows = get({"select": "code_insee_region,libelle_region," + sel, "group_by": "code_insee_region,libelle_region",
                "where": f"year(date_heure)={year}", "limit": 50})
    out[year] = {r["code_insee_region"]: {"nom": r["libelle_region"], "n": r["n"],
                                          **{f: round((r[f] or 0) * 0.5 / 1e6, 3) for f in FIELDS}} for r in rows}
    print(year, len(rows), "régions")
json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=0)
