#!/usr/bin/env python3
"""Construit data/themes/<PAYS>.json (climat, eau, sols, démographie, immigration, temps de travail,
justice, alimentation) et data/themes/commerce_FR.json, plus data/themes/index.json (comparaisons).

Sources : Eurostat (voir scripts/fetch.sh), Comext (commerce), FAOSTAT (bilans alimentaires).
Usage (depuis finances/) :  python3 scripts/build_themes.py
"""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "build.py")).read().split("# ---------------------------------------------------------------- sources")[0])
SRC = os.path.join(HERE, "..", "data", "sources", "themes")
OUT = os.path.join(HERE, "..", "data", "themes")
os.makedirs(OUT, exist_ok=True)

PAYS = {
    "FR": ("France", "France"), "DE": ("Allemagne", "Germany"), "AT": ("Autriche", "Austria"), "BE": ("Belgique", "Belgium"),
    "BG": ("Bulgarie", "Bulgaria"), "CY": ("Chypre", "Cyprus"), "HR": ("Croatie", "Croatia"), "DK": ("Danemark", "Denmark"),
    "ES": ("Espagne", "Spain"), "EE": ("Estonie", "Estonia"), "FI": ("Finlande", "Finland"), "EL": ("Grèce", "Greece"),
    "HU": ("Hongrie", "Hungary"), "IE": ("Irlande", "Ireland"), "IT": ("Italie", "Italy"), "LV": ("Lettonie", "Latvia"),
    "LT": ("Lituanie", "Lithuania"), "LU": ("Luxembourg", "Luxembourg"), "MT": ("Malte", "Malta"),
    "NL": ("Pays-Bas", "Netherlands (Kingdom of the)"), "PL": ("Pologne", "Poland"), "PT": ("Portugal", "Portugal"),
    "CZ": ("Tchéquie", "Czechia"), "RO": ("Roumanie", "Romania"), "SK": ("Slovaquie", "Slovakia"), "SI": ("Slovénie", "Slovenia"),
    "SE": ("Suède", "Sweden"), "IS": ("Islande", "Iceland"), "NO": ("Norvège", "Norway"), "CH": ("Suisse", "Switzerland"),
}
r2 = lambda x, n=2: None if x is None else round(x, n)


def years(name, geo):
    return sorted({dict(k)["time"] for k in jstat(name, SRC, geo) if k != "__single__"})


def G(name, geo):
    return getter(jstat(name, SRC, geo))


# ------------------------------------------------------------------ climat
CLIMAT_SECT = [
    ("energie", "Production d'électricité, raffineries", ["CRF1A1"], "#64748b"),
    ("industrie", "Industrie (combustion et procédés)", ["CRF1A2", "CRF2"], "#6b7280"),
    ("transports", "Transports", ["CRF1A3"], "#3b6fd6"),
    ("residentiel", "Logements (chauffage…)", ["CRF1A4B"], "#e07b39"),
    ("tertiaire", "Bureaux, commerces, services", ["CRF1A4A"], "#d9a05b"),
    ("agriculture", "Agriculture (élevage, engrais, engins)", ["CRF3", "CRF1A4C"], "#59a14f"),
    ("dechets", "Déchets", ["CRF5"], "#9c755f"),
    ("autres", "Autres (fuites, militaire…)", ["CRF1A5", "CRF1B", "CRF6"], "#b0b0b0"),
]
GAZ = [("CO2", "CO₂ (gaz carbonique)", "#475569"), ("CH4_CO2E", "Méthane (CH₄)", "#16a34a"),
       ("N2O_CO2E", "Protoxyde d'azote (N₂O)", "#ca8a04"), ("HFC_PFC_NF3_SF6_CO2E", "Gaz fluorés", "#0ea5e9")]


def climat(geo):
    g = G("env_air_gge.json", geo)
    out = []
    for y in years("env_air_gge.json", geo):
        tot = g(airpol="GHG", src_crf="TOTX4_MEMO", time=y)
        if tot is None:
            continue
        sect = {k: r2(sum(g(airpol="GHG", src_crf=c, time=y) or 0 for c in codes)) for k, _, codes, _ in CLIMAT_SECT}
        out.append({"annee": y, "total": r2(tot), "lulucf": r2(g(airpol="GHG", src_crf="CRF4", time=y)),
                    "aviation_int": r2(g(airpol="GHG", src_crf="CRF1D1A", time=y)), "maritime_int": r2(g(airpol="GHG", src_crf="CRF1D1B", time=y)),
                    "secteurs": sect, "gaz": {k: r2(g(airpol=k, src_crf="TOTX4_MEMO", time=y)) for k, _, _ in GAZ}})
    return {"serie": out, "secteurs": [[k, l, c] for k, l, _, c in CLIMAT_SECT], "gaz": [list(x) for x in GAZ]} if out else None


# ------------------------------------------------------------------ eau
EAU = [("ABS_ELC_CL", "Refroidissement des centrales électriques", "#64748b"), ("ABS_PWS", "Eau potable (réseau public)", "#0ea5e9"),
       ("ABS_AGR", "Agriculture (irrigation surtout)", "#59a14f"), ("ABS_IND", "Industrie", "#6b7280"),
       ("ABS_MIN", "Mines et carrières", "#a8a29e"), ("ABS_CON", "Construction", "#d9a05b"), ("ABS_SER", "Services", "#e8a0a0"),
       ("ABS_HH", "Ménages (puits privés)", "#e07b39")]


def eau(geo):
    g = G("env_wat_abs.json", geo)
    out = []
    for y in years("env_wat_abs.json", geo):
        tot = g(wat_proc="ABST", unit="MIO_M3", time=y)
        if tot is None:
            continue
        out.append({"annee": y, "total": r2(tot / 1000, 3), "par_hab": g(wat_proc="ABST", unit="M3_HAB", time=y),
                    "usages": {k: r2((g(wat_proc=k, unit="MIO_M3", time=y) or 0) / 1000, 3) for k, _, _ in EAU},
                    "restituee": r2((g(wat_proc="REW", unit="MIO_M3", time=y) or 0) / 1000, 3)})
    return {"serie": out, "usages": [list(x) for x in EAU]} if out else None


# ------------------------------------------------------------------ sols
COUV = [("A00", "Surfaces artificialisées", "#9ca3af"), ("B00", "Cultures", "#eab308"), ("E00", "Prairies", "#a3e635"),
        ("C00", "Forêts et bois", "#166534"), ("D00", "Landes et broussailles", "#65a30d"), ("F00", "Sols nus, rochers", "#d6d3d1"),
        ("G00", "Eaux", "#38bdf8"), ("H00", "Zones humides", "#0f766e")]
USAGE = [("U110", "Agriculture", "#eab308"), ("U120", "Sylviculture", "#166534"), ("U370", "Logement", "#e07b39"),
         ("U310", "Transports, réseaux", "#64748b"), ("U340", "Commerce, bureaux", "#d9a05b"), ("U350", "Services publics", "#8b5cf6"),
         ("U360", "Loisirs, nature protégée", "#22c55e"), ("U220", "Industrie", "#6b7280"), ("U400", "Inutilisé, abandonné", "#d6d3d1")]


def sols(geo):
    c, u = G("lan_lcv_ovw.json", geo), G("lan_use_ovw.json", geo)
    out = []
    for y in years("lan_lcv_ovw.json", geo):
        tot = c(landcover="TOTAL", unit="KM2", time=y)
        if not tot:
            continue
        out.append({"annee": y, "total_km2": tot,
                    "couverture": {k: c(landcover=k, unit="KM2", time=y) for k, _, _ in COUV},
                    "usage": {k: u(landuse=k, unit="KM2", time=y) for k, _, _ in USAGE}})
    return {"serie": out, "couverture": [list(x) for x in COUV], "usage": [list(x) for x in USAGE]} if out else None


# ------------------------------------------------------------------ démographie et immigration
def demographie(geo):
    g, p, pr = G("demo_gind.json", geo), G("demo_pjan.json", geo), G("proj_23np.json", geo)
    serie = []
    for y in years("demo_gind.json", geo):
        jan = g(indic_de="JAN", time=y)
        if jan is None:
            continue
        serie.append({"annee": y, "population": jan, "naissances": g(indic_de="LBIRTH", time=y), "deces": g(indic_de="DEATH", time=y),
                      "solde_migratoire": g(indic_de="CNMIGRAT", time=y)})
    pyr = {}
    for y in ["2000", "2025"]:
        rows = []
        for a in range(0, 100):
            code = "Y_LT1" if a == 0 else f"Y{a}"
            m, f = p(age=code, sex="M", time=y), p(age=code, sex="F", time=y)
            if m is None and f is None:
                continue
            rows.append([a, m or 0, f or 0])
        m, f = p(age="Y_OPEN", sex="M", time=y), p(age="Y_OPEN", sex="F", time=y)
        if rows:
            pyr[y] = rows
    proj = []
    for y in range(2025, 2101, 5):
        t = pr(age="TOTAL", time=y)
        if t is None:
            continue
        proj.append({"annee": y, "total": t, "moins20": pr(age="Y_LT20", time=y), "a20_64": pr(age="Y20-64", time=y),
                     "plus65": pr(age="Y_GE65", time=y), "plus80": pr(age="Y_GE80", time=y)})
    return {"serie": serie, "pyramide": pyr, "projection": proj} if serie else None


def immigration(geo):
    b, i, e = G("migr_pop3ctb.json", geo), G("migr_imm1ctz.json", geo), G("migr_emi1ctz.json", geo)
    stock = []
    for y in years("migr_pop3ctb.json", geo):
        t = b(c_birth="TOTAL", time=y)
        if not t:
            continue
        stock.append({"annee": y, "total": t, "nes_pays": b(c_birth="NAT", time=y), "nes_etranger": b(c_birth="FOR", time=y),
                      "nes_ue": b(c_birth="EU27_2020_FOR", time=y), "nes_hors_ue": b(c_birth="NEU27_2020_FOR", time=y)})
    flux = []
    for y in sorted(set(years("migr_imm1ctz.json", geo)) | set(years("migr_emi1ctz.json", geo))):
        im = i(citizen="TOTAL", time=y)
        if im is None:
            continue
        flux.append({"annee": y, "immigration": im, "immig_nationaux": i(citizen="NAT", time=y),
                     "immig_ue": i(citizen="EU27_2020_FOR", time=y), "immig_hors_ue": i(citizen="NEU27_2020_FOR", time=y),
                     "emigration": e(citizen="TOTAL", time=y), "emig_nationaux": e(citizen="NAT", time=y)})
    return {"stock": stock, "flux": flux} if stock or flux else None


# ------------------------------------------------------------------ temps de travail
BR = [("A", "Agriculture"), ("B-E", "Industrie"), ("F", "Construction"), ("G-I", "Commerce, transports, hôtellerie"),
      ("J", "Information, communication"), ("K", "Finance, assurance"), ("L", "Immobilier"), ("M_N", "Services aux entreprises"),
      ("O-Q", "Administration, enseignement, santé"), ("R-U", "Arts, loisirs, autres")]
TUS = [("AC01", "Sommeil"), ("AC02", "Repas"), ("AC03", "Soins personnels"), ("AC1_TR", "Travail rémunéré (avec trajets)"),
       ("AC2", "Études"), ("AC3", "Tâches domestiques et familiales"), ("AC4-8", "Loisirs, vie sociale"),
       ("AC9A", "Autres déplacements"), ("AC99NSP", "Non précisé")]


def travail(geo):
    h, d, t = G("nama_10_a10_e.json", geo), G("demo_gind.json", geo), G("tus_00age.json", geo)
    serie = []
    for y in years("nama_10_a10_e.json", geo):
        hw = h(nace_r2="TOTAL", unit="THS_HW", time=y)
        pers = h(nace_r2="TOTAL", unit="THS_PER", time=y)
        pop = d(indic_de="JAN", time=y)
        if hw is None or pop is None:
            continue
        serie.append({"annee": y, "heures": hw * 1000, "emplois": pers * 1000 if pers else None, "population": pop,
                      "branches": {k: (h(nace_r2=k, unit="THS_HW", time=y) or 0) * 1000 for k, _ in BR}})
    tus = None
    for y in ["2010", "2000"]:
        v = {k: t(acl00=k, time=y) for k, _ in TUS}
        if any(x is not None for x in v.values()):
            # Eurostat code les durées en texte « h:mm »
            hm = lambda x: None if x is None else int(str(x).split(":")[0]) * 60 + int(str(x).split(":")[1])
            tus = {"annee": y, "minutes": {k: hm(x) for k, x in v.items()}}
            break
    return {"serie": serie, "branches": [list(x) for x in BR], "emploi_du_temps": tus, "tus_labels": [list(x) for x in TUS]} if serie else None


# ------------------------------------------------------------------ justice
ICCS = [("ICCS0101", "Homicides volontaires"), ("ICCS020111", "Agressions graves"), ("ICCS0301", "Violences sexuelles"),
        ("ICCS0401", "Vols avec violence"), ("ICCS0501", "Cambriolages"), ("ICCS0502", "Vols"),
        ("ICCS0601", "Infractions liées aux stupéfiants"), ("ICCS0701", "Fraudes"), ("ICCS0703", "Corruption")]


def justice(geo):
    o, j, p = G("crim_off_cat.json", geo), G("crim_just_job.json", geo), G("crim_pris_cap.json", geo)
    serie = []
    ys = sorted(set(years("crim_off_cat.json", geo)) | set(years("crim_pris_cap.json", geo)))
    for y in ys:
        rec = {"annee": y, "infractions": {k: o(iccs=k, unit="NR", time=y) for k, _ in ICCS},
               "taux": {k: o(iccs=k, unit="P_HTHAB", time=y) for k, _ in ICCS},
               "detenus": p(indic_cr="PRIS_ACT_CAP", unit="NR", time=y), "places": p(indic_cr="PRIS_OFF_CAP", unit="NR", time=y),
               "detenus_100k": p(indic_cr="PRIS_ACT_CAP", unit="P_HTHAB", time=y),
               "policiers": j(isco08="OC5412", unit="NR", time=y), "juges": j(isco08="OC2612A", unit="NR", time=y),
               "policiers_100k": j(isco08="OC5412", unit="P_HTHAB", time=y), "juges_100k": j(isco08="OC2612A", unit="P_HTHAB", time=y)}
        if any(v is not None for v in rec["infractions"].values()) or rec["detenus"] is not None:
            serie.append(rec)
    return {"serie": serie, "categories": [list(x) for x in ICCS]} if serie else None


# ------------------------------------------------------------------ alimentation (FAOSTAT)
ALIM = [("2905", "Céréales", "#eab308"), ("2907", "Pommes de terre et tubercules", "#a16207"), ("2909", "Sucre et édulcorants", "#f9a8d4"),
        ("2908", "Betterave et canne à sucre", "#db2777"), ("2911", "Légumineuses", "#84cc16"), ("2913", "Oléagineux (colza, tournesol…)", "#facc15"),
        ("2914", "Huiles végétales", "#fde047"), ("2918", "Légumes", "#22c55e"), ("2919", "Fruits", "#f97316"),
        ("2924", "Boissons alcoolisées", "#7c3aed"), ("2922", "Café, thé, cacao", "#78350f"), ("2943", "Viande", "#dc2626"),
        ("2948", "Lait et produits laitiers", "#93c5fd"), ("2949", "Œufs", "#fef08a"), ("2946", "Graisses animales", "#fca5a5"),
        ("2960", "Poissons et fruits de mer", "#0ea5e9"), ("2912", "Fruits à coque", "#92400e"), ("2928", "Divers", "#a8a29e")]
EL = {"5511": "production", "5611": "importations", "5911": "exportations", "5072": "stock", "5521": "animaux", "5527": "semences",
      "5123": "pertes", "5131": "transformation", "5154": "autres_usages", "5142": "alimentation", "5170": "residus",
      "664": "kcal", "645": "kg_hab", "674": "proteines"}
fao = {}
fao_path = os.path.join(SRC, "fao_fbs.csv")
if os.path.exists(fao_path):
    for row in csv.DictReader(open(fao_path, newline="")):
        if row["Element Code"] not in EL and row["Item Code"] != "2501":
            continue
        for k, v in row.items():
            if k.startswith("Y") and len(k) == 5 and v not in ("", None):
                fao.setdefault(row["Area"], {}).setdefault(k[1:], {}).setdefault(row["Item Code"], {})[EL.get(row["Element Code"], "pop")] = float(v)


def alimentation(geo):
    area = PAYS[geo][1]
    if area not in fao:
        return None
    out = {}
    for y, items in sorted(fao[area].items()):
        tot = items.get("2901", {})
        groupes = {code: items.get(code, {}) for code, _, _ in ALIM}
        out[y] = {"kcal": tot.get("kcal"), "proteines": tot.get("proteines"),
                  "kcal_animal": items.get("2941", {}).get("kcal"), "kcal_vegetal": items.get("2903", {}).get("kcal"),
                  "groupes": {c: {k: round(v, 1) for k, v in d.items()} for c, d in groupes.items() if d}}
    return {"annees": out, "groupes": [list(x) for x in ALIM]}


# ------------------------------------------------------------------ commerce (France)
def commerce():
    pth = os.path.join(SRC, "comext_partenaires.json")
    if not os.path.exists(pth):
        return None
    raw = json.load(open(pth))
    labels = raw["dimension"]["partner"]["category"]["label"]
    yr = list(raw["dimension"]["time"]["category"]["index"])[0]
    t0 = getter(jstat("comext_partenaires.json", SRC))
    t = lambda **kw: t0(time=yr, **kw)
    parts = []
    for code, lab in labels.items():
        if len(code) != 2:
            continue
        imp, exp_ = t(freq="A", partner=code, flow="1", indicators="VALUE_EUR"), t(freq="A", partner=code, flow="2", indicators="VALUE_EUR")
        if not imp and not exp_:
            continue
        parts.append({"code": code, "nom": lab.split(" (")[0], "import": r2((imp or 0) / 1e9, 3), "export": r2((exp_ or 0) / 1e9, 3),
                      "import_t": r2((t(freq="A", partner=code, flow="1", indicators="QUANTITY_KG") or 0) / 1e9, 3),
                      "export_t": r2((t(freq="A", partner=code, flow="2", indicators="QUANTITY_KG") or 0) / 1e9, 3)})
    agg = {k: {"import": r2((t(freq="A", partner=k, flow="1", indicators="VALUE_EUR") or 0) / 1e9, 2), "export": r2((t(freq="A", partner=k, flow="2", indicators="VALUE_EUR") or 0) / 1e9, 2),
               "import_t": r2((t(freq="A", partner=k, flow="1", indicators="QUANTITY_KG") or 0) / 1e9, 2), "export_t": r2((t(freq="A", partner=k, flow="2", indicators="QUANTITY_KG") or 0) / 1e9, 2)}
           for k in ["WORLD", "INT_EU27_2020", "EXT_EU27_2020"]}
    rp = json.load(open(os.path.join(SRC, "comext_produits.json")))
    plab = rp["dimension"]["product"]["category"]["label"]
    tp0 = getter(jstat("comext_produits.json", SRC))
    tp = lambda **kw: tp0(time=yr, **kw)
    prods = []
    for code, lab in plab.items():
        rec = {"code": code, "nom": lab}
        for pa in ["WORLD", "EXT_EU27_2020"]:
            for fl, nm in [("1", "import"), ("2", "export")]:
                rec[f"{nm}_{'ext' if pa != 'WORLD' else 'tot'}"] = r2((tp(freq="A", partner=pa, product=code, flow=fl, indicators="VALUE_EUR") or 0) / 1e9, 3)
                if pa == "WORLD":
                    rec[f"{nm}_t"] = r2((tp(freq="A", partner=pa, product=code, flow=fl, indicators="QUANTITY_KG") or 0) / 1e9, 3)
        if rec["import_tot"] or rec["export_tot"]:
            prods.append(rec)
    th = getter(jstat("comext_historique.json", SRC))
    hist_years = sorted(json.load(open(os.path.join(SRC, "comext_historique.json")))["dimension"]["time"]["category"]["index"])
    hist = [{"annee": y, "import": r2((th(freq="A", flow="1", indicators="VALUE_EUR", time=y) or 0) / 1e9, 1), "export": r2((th(freq="A", flow="2", indicators="VALUE_EUR", time=y) or 0) / 1e9, 1)}
            for y in hist_years if th(freq="A", flow="1", indicators="VALUE_EUR", time=y)]
    return {"annee": yr, "partenaires": parts, "agregats": agg, "produits": prods, "historique": hist}


# ------------------------------------------------------------------ assemblage
index = []
for geo, (nom, _) in PAYS.items():
    d = {"pays": geo, "nom": nom, "climat": climat(geo), "eau": eau(geo), "sols": sols(geo), "demographie": demographie(geo),
         "immigration": immigration(geo), "travail": travail(geo), "justice": justice(geo), "alimentation": alimentation(geo)}
    json.dump(d, open(os.path.join(OUT, geo + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
    snap = {"code": geo, "nom": nom}
    if d["climat"]:
        c = d["climat"]["serie"][-1]; c0 = next((x for x in d["climat"]["serie"] if x["annee"] == "1990"), None)
        snap["climat"] = {"annee": c["annee"], "total": c["total"], "evol_1990": r2(100 * (c["total"] / c0["total"] - 1), 1) if c0 else None}
    if d["eau"]:
        e = d["eau"]["serie"][-1]; snap["eau"] = {"annee": e["annee"], "par_hab": e["par_hab"], "total": e["total"]}
    if d["sols"]:
        s = d["sols"]["serie"][-1]; snap["sols"] = {"annee": s["annee"], **{k: r2(100 * (s["couverture"][k] or 0) / s["total_km2"], 1) for k, _, _ in COUV}}
    if d["demographie"]:
        s = next((x for x in reversed(d["demographie"]["serie"]) if x["naissances"] is not None), d["demographie"]["serie"][-1]); snap["demo"] = {"annee": s["annee"], "population": s["population"], "naissances": s["naissances"], "deces": s["deces"], "solde_migratoire": s["solde_migratoire"]}
    if d["immigration"] and d["immigration"]["stock"]:
        s = d["immigration"]["stock"][-1]; snap["immig"] = {"annee": s["annee"], "part_nes_etranger": r2(100 * (s["nes_etranger"] or 0) / s["total"], 1)}
    if d["travail"]:
        s = d["travail"]["serie"][-1]; snap["travail"] = {"annee": s["annee"], "heures_hab": r2(s["heures"] / s["population"], 0), "heures_emploi": r2(s["heures"] / s["emplois"], 0) if s["emplois"] else None}
    if d["justice"]:
        last = lambda k: next((x[k] for x in reversed(d["justice"]["serie"]) if x[k] is not None), None)
        snap["justice"] = {"detenus_100k": last("detenus_100k"), "policiers_100k": last("policiers_100k"), "juges_100k": last("juges_100k"),
                           "homicides_100k": next((x["taux"]["ICCS0101"] for x in reversed(d["justice"]["serie"]) if x["taux"]["ICCS0101"] is not None), None)}
    if d["alimentation"]:
        y = sorted(d["alimentation"]["annees"])[-1]; a = d["alimentation"]["annees"][y]
        snap["alim"] = {"annee": y, "kcal": a["kcal"], "part_animal": r2(100 * a["kcal_animal"] / a["kcal"], 1) if a.get("kcal_animal") and a.get("kcal") else None}
    index.append(snap)
    print(geo, " ".join(k for k in ["climat", "eau", "sols", "demographie", "immigration", "travail", "justice", "alimentation"] if d[k]))
json.dump({"pays": index}, open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
cm = commerce()
if cm:
    json.dump(cm, open(os.path.join(OUT, "commerce_FR.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print("commerce", cm["annee"], cm["agregats"]["WORLD"], len(cm["partenaires"]), len(cm["produits"]))
