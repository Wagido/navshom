#!/usr/bin/env python3
"""Construit data/territoire.json : carte des régions (PIB, revenu, population, électricité).

Sources : Eurostat (nama_10r_2gdp, nama_10r_2hhinc, demo_r_pjanaggr3, régions NUTS 1),
RTE éCO2mix régional consolidé (ODRÉ, via scripts/fetch_regions.py),
contours simplifiés des régions (france-geojson, d'après l'IGN).
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "build.py")).read().split("# ---------------------------------------------------------------- sources")[0])
SRC = os.path.join(HERE, "..", "data", "sources", "regions")
OUT = os.path.join(HERE, "..", "data", "territoire.json")

NUTS = {"11": "FR1", "24": "FRB", "27": "FRC", "28": "FRD", "32": "FRE", "44": "FRF", "52": "FRG",
        "53": "FRH", "75": "FRI", "76": "FRJ", "84": "FRK", "93": "FRL", "94": "FRM"}

geo = json.load(open(os.path.join(SRC, "regions.geojson")))


def rnd(geom, nd=3):
    if isinstance(geom, float):
        return round(geom, nd)
    return [rnd(g, nd) for g in geom]


for f in geo["features"]:
    f["geometry"]["coordinates"] = rnd(f["geometry"]["coordinates"])


def centroid(feat):
    # centre du plus grand polygone (moyenne des sommets, suffisant pour placer des flèches)
    g = feat["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    ring = max((p[0] for p in polys), key=len)
    return [sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)]


cent = {f["properties"]["code"]: centroid(f) for f in geo["features"]}

gdp = getter(jstat("nama_10r_2gdp.json", SRC))
inc = getter(jstat("nama_10r_2hhinc.json", SRC))
popt = getter(jstat("demo_r_pjan.json", SRC))
eco = json.load(open(os.path.join(SRC, "eco2mix_regions.json")))

eco_years = sorted(eco)
eco_out = {}
for y in eco_years:
    E = eco[y]
    regs = {}
    for code, v in E.items():
        prod = sum(v[k] for k in ["nucleaire", "thermique", "hydraulique", "solaire", "bioenergies", "eolien_terrestre", "eolien_offshore"])
        regs[code] = {"conso": v["consommation"], "prod": round(prod, 2), "solde": v["ech_physiques"],
                      "mix": {"nucleaire": v["nucleaire"], "hydraulique": v["hydraulique"], "eolien": round(v["eolien_terrestre"] + v["eolien_offshore"], 3),
                              "solaire": v["solaire"], "thermique": v["thermique"], "bioenergies": v["bioenergies"]}}
    # flux estimés : les régions excédentaires alimentent d'abord les régions déficitaires les plus proches
    sup = {c: -r["solde"] for c, r in regs.items() if r["solde"] < 0}
    dem = {c: r["solde"] for c, r in regs.items() if r["solde"] > 0}
    pairs = sorted(((math.dist(cent[a], cent[b]), a, b) for a in sup for b in dem))
    flows = []
    for d, a, b in pairs:
        q = min(sup[a], dem[b])
        if q > 0.05:
            flows.append([a, b, round(q, 2)])
            sup[a] -= q; dem[b] -= q
    export = [[a, round(q, 2)] for a, q in sup.items() if q > 0.05]
    eco_out[y] = {"regions": regs, "flux": flows, "export": export,
                  "solde_national": round(sum(r["solde"] for r in regs.values()), 1)}

eco_years_int = [int(y) for y in eco_years]
eco_years_int.sort()

regions = {}
for f in geo["features"]:
    code = f["properties"]["code"]; n = NUTS[code]
    serie = {}
    for y in range(2015, 2026):
        p = popt(geo=n, time=y)
        g = gdp(geo=n, unit="MIO_EUR", time=y)
        i = inc(geo=n, unit="MIO_EUR", time=y)
        if p is None and g is None:
            continue
        serie[str(y)] = {"pop": p, "pib": None if g is None else round(g / 1000, 2),
                         "pib_hab": gdp(geo=n, unit="EUR_HAB", time=y),
                         "revenu": None if i is None else round(i / 1000, 2),
                         "revenu_hab": inc(geo=n, unit="EUR_HAB", time=y)}
    regions[code] = {"nom": f["properties"]["nom"], "centre": [round(c, 3) for c in cent[code]], "serie": serie}

json.dump({"geojson": geo, "regions": regions, "electricite": eco_out}, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("écrit", OUT, os.path.getsize(OUT))
print(eco_out["2024"]["flux"], eco_out["2024"]["export"])
print({c: r["serie"].get("2023") for c, r in list(regions.items())[:3]})
