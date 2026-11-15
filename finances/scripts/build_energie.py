#!/usr/bin/env python3
"""Construit data/energie/<PAYS>.json et data/energie/index.json.

Sources :
  - Eurostat nrg_bal_c (bilans énergétiques complets), en GWh -> TWh
  - Our World in Data, energy-data (séries longues depuis 1965), filtré par fetch.sh

Usage (depuis finances/) :  python3 scripts/build_energie.py
"""
import csv, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
SRC = os.path.join(HERE, "..", "data", "sources", "energie")
OUT = os.path.join(HERE, "..", "data", "energie")
os.makedirs(OUT, exist_ok=True)

# lecteur JSON-stat partagé avec build.py
_code = open(os.path.join(HERE, "build.py")).read().split("# ---------------------------------------------------------------- sources")[0]
exec(_code)
SRC = os.path.join(HERE, "..", "data", "sources", "energie")   # exec() a redéfini SRC et OUT
OUT = os.path.join(HERE, "..", "data", "energie")

PAYS = {
    "FR": ("France", "FRA"), "DE": ("Allemagne", "DEU"), "AT": ("Autriche", "AUT"), "BE": ("Belgique", "BEL"),
    "BG": ("Bulgarie", "BGR"), "CY": ("Chypre", "CYP"), "HR": ("Croatie", "HRV"), "DK": ("Danemark", "DNK"),
    "ES": ("Espagne", "ESP"), "EE": ("Estonie", "EST"), "FI": ("Finlande", "FIN"), "EL": ("Grèce", "GRC"),
    "HU": ("Hongrie", "HUN"), "IE": ("Irlande", "IRL"), "IT": ("Italie", "ITA"), "LV": ("Lettonie", "LVA"),
    "LT": ("Lituanie", "LTU"), "LU": ("Luxembourg", "LUX"), "MT": ("Malte", "MLT"), "NL": ("Pays-Bas", "NLD"),
    "PL": ("Pologne", "POL"), "PT": ("Portugal", "PRT"), "CZ": ("Tchéquie", "CZE"), "RO": ("Roumanie", "ROU"),
    "SK": ("Slovaquie", "SVK"), "SI": ("Slovénie", "SVN"), "SE": ("Suède", "SWE"), "IS": ("Islande", "ISL"),
    "NO": ("Norvège", "NOR"), "CH": ("Suisse", "CHE"),
}

# ---------------------------------------------------------------- groupes d'énergies (codes SIEC)
G = {
    "nucleaire": ["N900H"],
    "petrole_brut": ["O4100_TOT", "O4200", "O4300", "O4400X4410", "O4500"],
    "_petrole_tout": ["O4000XBIO"],
    "gaz": ["G3000"],
    "charbon": ["C0000X0350-0370", "C0350-0370", "P1000", "S2000"],
    "hydraulique": ["RA100", "RA500"],
    "eolien": ["RA300"],
    "solaire_pv": ["RA420"],
    "solaire_th": ["RA410"],
    "geothermie": ["RA200"],
    "pac": ["RA600"],
    "_bioe": ["BIOE"],
    "biocarburants": ["R5210P", "R5210B", "R5220P", "R5220B", "R5230P", "R5230B", "R5290"],
    "biogaz": ["R5300"],
    "dechets": ["W6100_6220"],
    "electricite": ["E7000"],
    "chaleur": ["H8000"],
}
PRIMAIRES = [
    ("nucleaire", "Nucléaire (chaleur)", "#c084fc"),
    ("petrole_brut", "Pétrole brut", "#5b4636"),
    ("gaz", "Gaz naturel", "#4f7cac"),
    ("charbon", "Charbon", "#575757"),
    ("hydraulique", "Hydraulique", "#2b8cbe"),
    ("eolien", "Éolien", "#7bccc4"),
    ("solaire_pv", "Solaire photovoltaïque", "#f6c445"),
    ("solaire_th", "Solaire thermique", "#f9a03f"),
    ("geothermie", "Géothermie", "#c2410c"),
    ("pac", "Pompes à chaleur", "#f472b6"),
    ("biomasse", "Bois et biomasse", "#6a994e"),
    ("biocarburants", "Biocarburants", "#a7c957"),
    ("biogaz", "Biogaz", "#8fbc8f"),
    ("dechets", "Déchets non renouvelables", "#8d8d8d"),
]
VECTEURS = [
    ("produits_petroliers", "Produits pétroliers", "#8c6d46"),
    ("electricite", "Électricité", "#facc15"),
    ("chaleur", "Chaleur des réseaux", "#ef4444"),
]
USAGES = [
    ("residentiel", "Logements", ["FC_OTH_HH_E"], "#e07b39"),
    ("tertiaire", "Bureaux, commerces, services", ["FC_OTH_CP_E"], "#d9a05b"),
    ("industrie", "Industrie", ["FC_IND_E"], "#6b7280"),
    ("transports", "Transports", ["FC_TRA_E"], "#3b6fd6"),
    ("agriculture", "Agriculture, pêche, autres", ["FC_OTH_AF_E", "FC_OTH_FISH_E", "FC_OTH_NSP_E"], "#59a14f"),
    ("non_energetique", "Usages non énergétiques", ["FC_NE"], "#9c755f"),
]
PERTES = [
    ("pertes_conversion", "Pertes de conversion (chaleur perdue)", "#b0b0b0"),
    ("branche_energie", "Secteur énergie, pertes réseau", "#c8c8c8"),
    ("exportations", "Exportations", "#94a3b8"),
    ("soutes", "Soutes (avions, navires internationaux)", "#a3a3a3"),
    ("stockage", "Mise en stock", "#d4d4d4"),
]


def build_country(geo):
    t = getter(jstat("nrg_bal_c.json", SRC, geo))
    years = sorted({dict(k)["time"] for k in jstat("nrg_bal_c.json", SRC, geo) if k != "__single__"})
    res = {}
    for y in years:
        if not t(nrg_bal="GAE", siec="TOTAL", time=y):
            continue

        def v(nb, grp):
            if grp == "biomasse":
                return v(nb, "_bioe") - v(nb, "biocarburants") - v(nb, "biogaz")
            if grp == "produits_petroliers":
                return v(nb, "_petrole_tout") - v(nb, "petrole_brut")
            if isinstance(nb, list):
                return sum(v(n, grp) for n in nb)
            return sum((t(nrg_bal=nb, siec=c, time=y) or 0.0) for c in G[grp]) / 1000.0  # GWh -> TWh

        links = []

        def L(s, d, val, kind="n"):
            if val > 0.3:
                links.append([s, d, round(val, 2), kind])

        groups = [g for g, _, _ in PRIMAIRES] + [g for g, _, _ in VECTEURS]
        pertes_conv = 0.0
        centrale_in = 0.0
        raff_in = 0.0
        for g in groups:
            prod = v("PPRD", g) + v("RCV_RCY", g)
            imp, exp_, stk = v("IMP", g), v("EXP", g), v("STK_CHG", g)
            ti_ehg, ti_rpi, ti_all = v("TI_EHG_E", g), v("TI_RPI_E", g), v("TI_E", g)
            to_ehg, to_rpi, to_all = v("TO_EHG", g), v("TO_RPI", g), v("TO", g)
            if g not in ("electricite", "chaleur"):
                # les agrégats (bioénergie) attribuent aussi l'électricité produite à leur combustible : on l'enlève
                to_all -= to_ehg
                to_ehg = 0.0
            # transformations « autres » (hauts fourneaux, mélanges, injection de biométhane…) : comptées en net
            other_net = (ti_all - ti_ehg - ti_rpi) - (to_all - to_ehg - to_rpi)
            ins, outs = 0.0, 0.0
            if g == "produits_petroliers":
                # le fioul brûlé dans les centrales vient des raffineries, le complément des importations
                raff_out = max(0.0, to_rpi - ti_rpi)
                from_raff = min(ti_ehg, raff_out)
                from_imp = min(max(0.0, ti_ehg - from_raff), imp)
                L("t_raffineries", "t_centrales", from_raff, "t")
                L("o_imp", "t_centrales", from_imp)
                centrale_in += from_raff + from_imp
                imp -= from_imp
                ti_rpi += from_raff          # retiré du flux raffineries -> produits
                ti_ehg = 0.0
            # --- entrées
            if prod > 0: L("o_prod", g, prod); ins += prod
            if imp > 0: L("o_imp", g, imp); ins += imp
            if stk > 0: L("o_stock", g, stk); ins += stk
            if other_net < 0: L("o_prod", g, -other_net); ins += -other_net
            if g == "electricite" or g == "chaleur":
                out_c = to_ehg - ti_ehg      # électricité consommée par le pompage, les chaudières : en net
                if out_c > 0: L("t_centrales", g, out_c, "t"); ins += out_c
            elif g not in ("produits_petroliers", "petrole_brut") and ti_ehg - to_ehg > 0:
                L(g, "t_centrales", ti_ehg - to_ehg); centrale_in += ti_ehg - to_ehg; outs += ti_ehg - to_ehg
            if g == "petrole_brut":
                n = ti_rpi - to_rpi
                if n > 0: L(g, "t_raffineries", n); raff_in += n; outs += n
            if g == "produits_petroliers":
                n = to_rpi - ti_rpi
                if n > 0: L("t_raffineries", g, n, "t"); ins += n
            # --- sorties
            for sink, val in [("exportations", exp_), ("soutes", v("INTMARB", g) + v("INTAVI", g)),
                              ("stockage", -stk if stk < 0 else 0), ("branche_energie", v("NRG_E", g) + v("DL", g) + max(0, other_net))]:
                if val > 0: L(g, "p_" + sink, val); outs += val
            for uid, _, codes, _ in USAGES:
                val = v(codes, g)
                if val > 0: L(g, "u_" + uid, val); outs += val
            # écart statistique : on le garde pour que chaque bloc soit équilibré
            if ins - outs > 0.3:
                L(g, "p_branche_energie", ins - outs)
        # pertes des centrales et des raffineries
        centrale_out = sum(l[2] for l in links if l[0] == "t_centrales")
        raff_out = sum(l[2] for l in links if l[0] == "t_raffineries")
        L("t_centrales", "p_pertes_conversion", centrale_in - centrale_out)
        L("t_raffineries", "p_pertes_conversion", raff_in - raff_out)

        used = {l[0] for l in links} | {l[1] for l in links}
        nodes = []
        for nid, lab, col in [("o_prod", "Production nationale", "#16a34a"), ("o_imp", "Importations", "#dc2626"), ("o_stock", "Déstockage", "#a3a3a3")]:
            nodes.append({"id": nid, "label": lab, "col": 0, "color": col})
        for g, lab, col in PRIMAIRES:
            nodes.append({"id": g, "label": lab, "col": 1, "color": col})
        nodes += [{"id": "t_raffineries", "label": "Raffineries", "col": 2, "color": "#78716c"},
                  {"id": "t_centrales", "label": "Centrales (électricité, chaleur)", "col": 3, "color": "#64748b"}]
        for g, lab, col in VECTEURS:
            nodes.append({"id": g, "label": lab, "col": 4, "color": col})
        for uid, lab, _, col in USAGES:
            nodes.append({"id": "u_" + uid, "label": lab, "col": 5, "color": col})
        for pid, lab, col in PERTES:
            nodes.append({"id": "p_" + pid, "label": lab, "col": 5, "color": col})
        nodes = [n for n in nodes if n["id"] in used]

        T = lambda nb: (t(nrg_bal=nb, siec="TOTAL", time=y) or 0) / 1000.0
        fossile = sum(v("GIC", g) for g in ["petrole_brut", "produits_petroliers", "gaz", "charbon"])
        res[y] = {
            "nodes": nodes, "links": links,
            "kpi": {
                "production": round(T("PPRD"), 1), "importations": round(T("IMP"), 1), "exportations": round(T("EXP"), 1),
                "disponible": round(T("GAE"), 1), "conso_interieure": round(T("GIC"), 1),
                "conso_finale": round(T("FC_E") + T("FC_NE"), 1), "conso_finale_energie": round(T("FC_E"), 1),
                "electricite_produite": round(T("GEP"), 1),
                "independance": round(100 * T("PPRD") / T("GAE"), 1) if T("GAE") else None,
                "part_fossile": round(100 * fossile / T("GIC"), 1) if T("GIC") else None,
                "pertes_conversion": round(centrale_in - centrale_out + raff_in - raff_out, 1),
            },
        }
    return res


def load_owid():
    path = os.path.join(SRC, "owid_europe.csv")
    if not os.path.exists(path):
        return {}
    out = {}
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            out.setdefault(r["iso_code"], []).append(r)
    return out


OWID_SRC = [("coal", "Charbon", "#2f2f2f"), ("oil", "Pétrole", "#8c6d46"), ("gas", "Gaz", "#4f7cac"),
            ("nuclear", "Nucléaire", "#c084fc"), ("hydro", "Hydraulique", "#2b8cbe"), ("wind", "Éolien", "#7bccc4"),
            ("solar", "Solaire", "#f6c445"), ("biofuel", "Biocarburants", "#a7c957"), ("other_renewable", "Autres renouvelables (bois, géothermie…)", "#6a994e")]


def owid_series(rows):
    def num(x):
        try:
            return round(float(x), 2)
        except (TypeError, ValueError):
            return None
    prim, elec = [], []
    for r in sorted(rows, key=lambda r: int(r["year"])):
        y = int(r["year"])
        if y < 1965:
            continue
        p = {k: num(r.get(f"{k}_consumption")) for k, _, _ in OWID_SRC}
        if any(v is not None for v in p.values()):
            prim.append({"annee": y, **p, "population": num(r.get("population"))})
        e = {k: num(r.get(f"{k}_electricity")) for k, _, _ in OWID_SRC}
        if any(v is not None for v in e.values()):
            elec.append({"annee": y, **e})
    return {"sources": [[k, l, c] for k, l, c in OWID_SRC], "primaire": prim, "electricite": elec}


owid = load_owid()
index = []
for geo, (nom, iso3) in PAYS.items():
    bil = build_country(geo)
    if not bil:
        print(geo, "pas de bilan"); continue
    d = {"pays": geo, "nom": nom, "bilan": bil, "owid": owid_series(owid.get(iso3, []))}
    json.dump(d, open(os.path.join(OUT, geo + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
    last = sorted(bil)[-1]
    k = bil[last]["kpi"]
    index.append({"code": geo, "nom": nom, "annee": last, **k})
    print(geo, last, k)

json.dump({"pays": index}, open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
