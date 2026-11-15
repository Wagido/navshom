#!/usr/bin/env python3
"""Extrait des bilans alimentaires FAOSTAT (Europe) les 30 pays et les groupes de produits utiles."""
import csv, io, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
PAYS = {"France", "Germany", "Austria", "Belgium", "Bulgaria", "Cyprus", "Croatia", "Denmark", "Spain", "Estonia", "Finland",
        "Greece", "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands (Kingdom of the)",
        "Poland", "Portugal", "Czechia", "Romania", "Slovakia", "Slovenia", "Sweden", "Iceland", "Norway", "Switzerland"}
z = zipfile.ZipFile(src)
name = [n for n in z.namelist() if n.endswith("_NOFLAG.csv")][0]
with z.open(name) as f, open(dst, "w", newline="") as o:
    r = csv.DictReader(io.TextIOWrapper(f, encoding="latin-1"))
    w = None
    for row in r:
        if row["Area"] in PAYS and (row["Item Code"].startswith("29") or row["Item Code"] == "2501"):
            if w is None:
                w = csv.DictWriter(o, fieldnames=r.fieldnames); w.writeheader()
            w.writerow(row)
