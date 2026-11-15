#!/usr/bin/env python3
"""Garde, du fichier Our World in Data (énergie), les 30 pays européens et les colonnes utiles."""
import csv, sys
src, dst = sys.argv[1], sys.argv[2]
keep = set("FRA DEU AUT BEL BGR CYP HRV DNK ESP EST FIN GRC HUN IRL ITA LVA LTU LUX MLT NLD POL PRT CZE ROU SVK SVN SWE ISL NOR CHE".split())
cols = ["country", "year", "iso_code", "population"] + [f"{k}_{t}" for k in
        ["coal", "oil", "gas", "nuclear", "hydro", "wind", "solar", "biofuel", "other_renewable"] for t in ["consumption", "electricity"]]
with open(src, newline="") as f, open(dst, "w", newline="") as o:
    w = csv.DictWriter(o, fieldnames=cols)
    w.writeheader()
    for row in csv.DictReader(f):
        if row["iso_code"] in keep and int(row["year"]) >= 1965:
            w.writerow({c: row.get(c, "") for c in cols})
