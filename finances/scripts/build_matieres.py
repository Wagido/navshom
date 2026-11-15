#!/usr/bin/env python3
"""Construit data/matieres/<PAYS>.json et data/matieres/index.json.

Sources Eurostat (milliers de tonnes, convertis en millions de tonnes « Mt ») :
  - env_ac_sd  : flux de matières pour l'économie circulaire (données du diagramme d'Eurostat)
  - env_ac_mfa : comptes de flux de matières détaillés (extraction, importations, exportations)
  - env_ac_rme : empreinte matières (importations en équivalent matières premières)
  - cei_srm030 : taux d'utilisation circulaire des matières

Usage (depuis finances/) :  python3 scripts/build_matieres.py
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "build.py")).read().split("# ---------------------------------------------------------------- sources")[0])
SRC = os.path.join(HERE, "..", "data", "sources", "matieres")
OUT = os.path.join(HERE, "..", "data", "matieres")
os.makedirs(OUT, exist_ok=True)

PAYS = {
    "FR": "France", "DE": "Allemagne", "AT": "Autriche", "BE": "Belgique", "BG": "Bulgarie", "CY": "Chypre",
    "HR": "Croatie", "DK": "Danemark", "ES": "Espagne", "EE": "Estonie", "FI": "Finlande", "EL": "Grèce",
    "HU": "Hongrie", "IE": "Irlande", "IT": "Italie", "LV": "Lettonie", "LT": "Lituanie", "LU": "Luxembourg",
    "MT": "Malte", "NL": "Pays-Bas", "PL": "Pologne", "PT": "Portugal", "CZ": "Tchéquie", "RO": "Roumanie",
    "SK": "Slovaquie", "SI": "Slovénie", "SE": "Suède", "IS": "Islande", "NO": "Norvège", "CH": "Suisse",
}
MATS = [
    ("MF1", "Biomasse (cultures, bois, pêche)", "#6a994e"),
    ("MF2", "Minerais métalliques", "#b45309"),
    ("MF3", "Minéraux non métalliques (sable, calcaire…)", "#a8a29e"),
    ("MF4", "Combustibles fossiles", "#404040"),
    ("MF5", "Autres produits importés", "#7c8db5"),
]
DETAIL = [
    ("MF1", [("MF11", "Cultures"), ("MF12", "Fourrages et pâturages"), ("MF13", "Bois"), ("MF14", "Pêche et chasse"),
             ("MF15", "Animaux et produits animaux"), ("MF16", "Produits surtout faits de biomasse")]),
    ("MF2", [("MF21", "Fer"), ("MF221", "Cuivre"), ("MF227", "Bauxite, aluminium"), ("MF228", "Uranium"),
             ("MF22", "Tous métaux non ferreux"), ("MF23", "Produits surtout faits de métal")]),
    ("MF3", [("MF38", "Sables et graviers"), ("MF36", "Calcaire et gypse"), ("MF31", "Pierres (granit, marbre…)"),
             ("MF37", "Argiles et kaolin"), ("MF32", "Craie et dolomie"), ("MF34", "Minéraux chimiques et engrais"),
             ("MF35", "Sel"), ("MF3B", "Produits surtout minéraux")]),
    ("MF4", [("MF41", "Charbon"), ("MF42", "Pétrole et gaz"), ("MF43", "Produits pétroliers et dérivés")]),
    ("MF5", [("MF5", "Autres produits")]),
]
mt = lambda x: round((x or 0) / 1000, 2)   # milliers de tonnes -> millions de tonnes


def build(geo):
    sd = getter(jstat("env_ac_sd.json", SRC, geo))
    mfa_t = jstat("env_ac_mfa.json", SRC, geo); mfa = getter(mfa_t)
    rme = getter(jstat("env_ac_rme.json", SRC, geo))
    cei = getter(jstat("cei_srm030.json", SRC, geo))
    years_sd = sorted({dict(k)["time"] for k in jstat("env_ac_sd.json", SRC, geo) if k != "__single__"})
    years_mfa = sorted({dict(k)["time"] for k in mfa_t if k != "__single__"})

    bilans = {}
    for y in years_sd:
        S = lambda ind, m="TOTAL": sd(indic_env=ind, material=m, time=y)
        if not S("DMI_RCV_R_B"):
            continue
        links = []
        def L(s, d, v):
            if v and v > 0.05:
                links.append([s, d, round(v, 2)])
        proc_total = 0.0
        recy_total = 0.0
        exp_total = 0.0
        detailed = S("DMI_RCV_R_B", "MF1") is not None and S("IMP_X_RCV_R", "MF1") is not None
        mats = MATS if detailed else [("TOTAL", "Toutes matières (détail non publié)", "#78716c")]
        for m, _, _ in mats:
            de = mt(mfa(indic_env="DE", material=m, unit="THS_T", time=y))
            imp = mt(S("IMP_X_RCV_R", m)) + mt(S("IMP_RCV_R", m))
            exp_ = mt(S("EXP_X_RCV_R", m)) + mt(S("EXP_RCV_R", m))
            if S("IMP_X_RCV_R") is None:   # échanges non publiés dans env_ac_sd : on prend les comptes de flux
                imp = mt(mfa(indic_env="IMP", material=m, unit="THS_T", time=y))
                exp_ = mt(mfa(indic_env="EXP", material=m, unit="THS_T", time=y))
            dmi_r = mt(S("DMI_RCV_R_B", m))
            rec = max(0.0, dmi_r - de - imp)
            L("o_ext", m, de); L("o_imp", m, imp); L("o_rec", m, rec)
            L(m, "f_export", exp_)
            L(m, "t_proc", dmi_r - exp_)
            proc_total += max(0.0, dmi_r - exp_); recy_total += rec; exp_total += exp_
        mat_use = mt(S("MAT_USE"))
        energ = max(0.0, proc_total - mat_use)
        emis, accum, dflow = mt(S("EMIS")), mt(S("MAT_ACCUM")), mt(S("DFLOW"))
        L("t_proc", "u_energie", energ)
        L("t_proc", "u_materiau", mat_use)
        e1 = min(emis, energ)
        L("u_energie", "f_emis", e1)
        L("u_energie", "f_dechets", energ - e1)
        L("u_materiau", "f_stock", accum)
        L("u_materiau", "f_dissip", dflow)
        L("u_materiau", "f_emis", max(0.0, emis - e1))
        dechets_mat = mat_use - accum - dflow - max(0.0, emis - e1)
        L("u_materiau", "f_dechets", dechets_mat)
        dechets = max(0.0, energ - e1) + max(0.0, dechets_mat)
        used = {l[0] for l in links} | {l[1] for l in links}
        nodes = [{"id": "o_ext", "label": "Extraction sur le territoire", "col": 0, "color": "#16a34a"},
                 {"id": "o_imp", "label": "Importations", "col": 0, "color": "#dc2626"},
                 {"id": "o_rec", "label": "Matières recyclées (issues des déchets)", "col": 0, "color": "#0ea5e9"}]
        nodes += [{"id": m, "label": lab, "col": 1, "color": c} for m, lab, c in mats]
        nodes += [{"id": "t_proc", "label": "Matières mises en œuvre en France", "col": 2, "color": "#64748b"},
                  {"id": "u_energie", "label": "Brûlées pour produire de l'énergie", "col": 3, "color": "#f97316"},
                  {"id": "u_materiau", "label": "Utilisées comme matériaux", "col": 3, "color": "#8b5cf6"},
                  {"id": "f_stock", "label": "Ajout au stock (bâtiments, routes…)", "col": 4, "color": "#7c3aed"},
                  {"id": "f_emis", "label": "Émissions (air, eau ; CO₂ surtout)", "col": 4, "color": "#9ca3af"},
                  {"id": "f_dissip", "label": "Pertes dispersées (engrais, sel…)", "col": 4, "color": "#d6d3d1"},
                  {"id": "f_dechets", "label": "Déchets", "col": 4, "color": "#78716c"},
                  {"id": "f_export", "label": "Exportations", "col": 4, "color": "#94a3b8"}]
        nodes = [n for n in nodes if n["id"] in used]
        pop = mfa(indic_env="DMC", material="TOTAL", unit="THS_T", time=y)
        per = mfa(indic_env="DMC", material="TOTAL", unit="T_HAB", time=y)
        bilans[y] = {"nodes": nodes, "links": links, "kpi": {
            "extraction": mt(mfa(indic_env="DE", material="TOTAL", unit="THS_T", time=y)),
            "importations": round(sum(l[2] for l in links if l[0] == "o_imp"), 1),
            "exportations": round(exp_total, 1),
            "recyclees": round(recy_total, 1),
            "dmc": mt(mfa(indic_env="DMC", material="TOTAL", unit="THS_T", time=y)),
            "dmc_hab": per,
            "rmc_hab": rme(indic_env="RMC", material="TOTAL", unit="T_HAB", time=y),
            "rmc": mt(rme(indic_env="RMC", material="TOTAL", unit="THS_T", time=y)),
            "stock": round(accum, 1), "emissions": round(emis, 1), "dechets": round(dechets, 1),
            "circularite": cei(time=y),
        }}

    # détail par matière : dernière année où l'extraction détaillée est publiée
    det_years = [y for y in years_mfa if any((mfa(indic_env="DE", material=c, unit="THS_T", time=y) or 0) > 0
                                           for _, subs in DETAIL for c, _ in subs if c not in ("MF5",))]
    detail = None
    if det_years:
        y = det_years[-1]
        groups = []
        for g, subs in DETAIL:
            rows = []
            for c, lab in subs:
                f = lambda ind: mt(mfa(indic_env=ind, material=c, unit="THS_T", time=y))
                rows.append({"code": c, "label": lab, "extraction": f("DE"), "importations": f("IMP"), "exportations": f("EXP"), "dmc": f("DMC")})
            groups.append({"code": g, "label": dict((m, l) for m, l, _ in MATS)[g], "rows": rows})
        detail = {"annee": y, "groupes": groups}

    serie = []
    for y in years_mfa:
        v = {"annee": y,
             "dmc_hab": mfa(indic_env="DMC", material="TOTAL", unit="T_HAB", time=y),
             "rmc_hab": rme(indic_env="RMC", material="TOTAL", unit="T_HAB", time=y),
             "circularite": cei(time=y)}
        for m, _, _ in MATS[:4]:
            v[m] = mfa(indic_env="DMC", material=m, unit="T_HAB", time=y)
        if v["dmc_hab"] is not None:
            serie.append(v)
    return bilans, detail, serie


index = []
for geo, nom in PAYS.items():
    b, d, s = build(geo)
    if not b and not s:
        print(geo, "pas de données"); continue
    json.dump({"pays": geo, "nom": nom, "bilan": b, "detail": d, "serie": s,
               "matieres": [[m, l, c] for m, l, c in MATS]},
              open(os.path.join(OUT, geo + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
    if b:
        y = sorted(b)[-1]
        index.append({"code": geo, "nom": nom, "annee": y, **b[y]["kpi"]})
    print(geo, sorted(b)[-1] if b else "-", b[sorted(b)[-1]]["kpi"] if b else "", "détail", d["annee"] if d else None)
json.dump({"pays": index}, open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
