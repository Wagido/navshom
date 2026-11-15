#!/usr/bin/env python3
"""Construit data/societe/<PAYS>.json et data/societe/index.json :
santé, éducation, logement, transports, emploi, inégalités et pauvreté, déchets (Eurostat).
Usage (depuis finances/) :  python3 scripts/build_societe.py
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "build.py")).read().split("# ---------------------------------------------------------------- sources")[0])
SRC = os.path.join(HERE, "..", "data", "sources", "societe")
OUT = os.path.join(HERE, "..", "data", "societe")
os.makedirs(OUT, exist_ok=True)
PAYS = json.load(open(os.path.join(HERE, "..", "data", "themes", "index.json")))["pays"]
r = lambda x, n=1: None if x is None else round(x, n)


def Y(name, geo):
    return sorted({dict(k)["time"] for k in jstat(name, SRC, geo) if k != "__single__"})


def G(name, geo):
    return getter(jstat(name, SRC, geo))


def serie(name, geo, **kw):
    """[{annee, v}] pour une série simple."""
    g = G(name, geo)
    return [{"annee": y, "v": g(time=y, **kw)} for y in Y(name, geo) if g(time=y, **kw) is not None]


def last(lst, key="v"):
    return next((x for x in reversed(lst) if x.get(key) is not None), None)


# ------------------------------------------------------------------ santé
CAUSES = [("C00-D48", "Cancers et tumeurs"), ("I", "Maladies cardio-vasculaires"), ("J", "Maladies respiratoires"),
          ("F", "Troubles mentaux (dont démences)"), ("G_H", "Maladies du système nerveux (dont Alzheimer)"),
          ("V01-Y89", "Causes externes (accidents, suicides…)"), ("E", "Maladies endocriniennes (diabète…)"),
          ("K", "Maladies digestives"), ("A_B", "Maladies infectieuses"), ("U071", "Covid-19"), ("N", "Maladies rénales et urinaires"),
          ("R", "Causes mal définies")]
FIN = [("HF1", "Sécurité sociale et État"), ("HF21", "Complémentaires santé (mutuelles, assurances)"), ("HF3", "Reste à charge des ménages"),
       ("HF22", "Associations"), ("HF23", "Entreprises (médecine du travail…)")]
FCT = [("HC11_21", "Hôpital (hospitalisation complète)"), ("HC12_22", "Hôpital de jour"), ("HC13_23", "Soins de ville (médecins, dentistes…)"),
       ("HC14_24", "Soins à domicile"), ("HC3", "Soins de longue durée (Ehpad…)"), ("HC4", "Analyses, imagerie, transports"),
       ("HC51", "Médicaments"), ("HC52", "Lunettes, prothèses, appareils"), ("HC6", "Prévention"), ("HC7", "Gestion du système de santé")]


def sante(geo):
    le, cd, x, hf = G("demo_mlexpec.json", geo), G("hlth_cd_aro.json", geo), G("hlth_sha11_hchf.json", geo), G("hlth_sha11_hf.json", geo)
    esp = [{"annee": y, "t": le(age="Y_LT1", sex="T", time=y), "h": le(age="Y_LT1", sex="M", time=y), "f": le(age="Y_LT1", sex="F", time=y),
            "t65": le(age="Y65", sex="T", time=y)} for y in Y("demo_mlexpec.json", geo) if le(age="Y_LT1", sex="T", time=y)]
    cy = [y for y in Y("hlth_cd_aro.json", geo) if cd(icd10="TOTAL", time=y)]
    causes = None
    if cy:
        y = cy[-1]
        causes = {"annee": y, "total": cd(icd10="TOTAL", time=y), "causes": {k: cd(icd10=k, time=y) for k, _ in CAUSES}}
    fy = [y for y in Y("hlth_sha11_hchf.json", geo) if x(icha11_hc="TOT_HC", icha11_hf="TOT_HF", time=y)]
    flux = None
    if fy:
        y = fy[-1]
        mat = {f: {c: x(icha11_hc=c, icha11_hf=f, time=y) for c, _ in FCT} for f, _ in FIN}
        flux = {"annee": y, "total": x(icha11_hc="TOT_HC", icha11_hf="TOT_HF", time=y), "matrice": mat,
                "par_financeur": {f: x(icha11_hc="TOT_HC", icha11_hf=f, time=y) for f, _ in FIN}}
    dep = [{"annee": y, "pib": hf(icha11_hf="TOT_HF", unit="PC_GDP", time=y), "hab": hf(icha11_hf="TOT_HF", unit="EUR_HAB", time=y),
            "rac": hf(icha11_hf="HF3", unit="PC_GDP", time=y)} for y in Y("hlth_sha11_hf.json", geo) if hf(icha11_hf="TOT_HF", unit="PC_GDP", time=y)]
    if not (esp or causes or flux):
        return None
    return {"esperance": esp, "causes": causes, "flux": flux, "depenses": dep,
            "labels": {"causes": CAUSES, "financeurs": FIN, "fonctions": FCT}}


# ------------------------------------------------------------------ éducation
NIV = [("ED0", "Maternelle et petite enfance"), ("ED1", "Primaire"), ("ED2", "Collège"), ("ED3", "Lycée"), ("ED4", "Post-bac non supérieur"),
       ("ED5", "Supérieur court (BTS, DUT)"), ("ED6", "Licence"), ("ED7", "Master"), ("ED8", "Doctorat")]
COUT = [("ED02", "Préélémentaire"), ("ED1", "Primaire"), ("ED2", "Collège"), ("ED3_4", "Lycée"), ("ED5-8", "Supérieur")]


def education(geo):
    e, f, a = G("educ_uoe_enra01.json", geo), G("educ_uoe_fini04.json", geo), G("edat_lfse_03.json", geo)
    ey = [y for y in Y("educ_uoe_enra01.json", geo) if e(isced11="ED0-8", sector="TOT_SEC", time=y)]
    eff = None
    if ey:
        y = ey[-1]
        eff = {"annee": y, "total": e(isced11="ED0-8", sector="TOT_SEC", time=y),
               "niveaux": {k: {"total": e(isced11=k, sector="TOT_SEC", time=y), "public": e(isced11=k, sector="PUB", time=y)} for k, _ in NIV}}
    fy = [y for y in Y("educ_uoe_fini04.json", geo) if any(f(isced11=k, unit="EUR", time=y) for k, _ in COUT)]
    cout = {"annee": fy[-1], "eur": {k: f(isced11=k, unit="EUR", time=fy[-1]) for k, _ in COUT},
            "pps": {k: f(isced11=k, unit="PPS", time=fy[-1]) for k, _ in COUT}} if fy else None
    dip = [{"annee": y, "bas": a(age="Y25-64", isced11="ED0-2", time=y), "moyen": a(age="Y25-64", isced11="ED3_4", time=y),
            "sup": a(age="Y25-64", isced11="ED5-8", time=y), "sup_jeunes": a(age="Y25-34", isced11="ED5-8", time=y)}
           for y in Y("edat_lfse_03.json", geo) if a(age="Y25-64", isced11="ED5-8", time=y) is not None]
    if not (eff or cout or dip):
        return None
    return {"effectifs": eff, "cout": cout, "diplomes": dip, "labels": {"niveaux": NIV, "cout": COUT}}


# ------------------------------------------------------------------ logement
def logement(geo):
    t, rm, oc, un, ov, hp, cp = (G(n, geo) for n in ["ilc_lvho02.json", "ilc_lvho03.json", "ilc_lvho05a.json", "ilc_lvho50a.json",
                                                    "ilc_lvho07a.json", "prc_hpi_a.json", "prc_hicp_aind.json"])
    stat = []
    for y in sorted(set(Y("ilc_lvho02.json", geo)) | set(Y("ilc_lvho03.json", geo))):
        rec = {"annee": y, "proprio_credit": t(tenure="OWN_L", time=y), "proprio": t(tenure="OWN_NL", time=y),
               "loc_marche": t(tenure="RENT_MKT", time=y), "loc_social": t(tenure="RENT_FR", time=y),
               "pieces": rm(tenure="TOTAL", time=y), "pieces_proprio": rm(tenure="OWN", time=y), "pieces_loc": rm(tenure="RENT", time=y),
               "surpeuplement": oc(time=y), "sous_occupation": un(time=y), "surcout": ov(time=y)}
        if any(v is not None for k, v in rec.items() if k != "annee"):
            stat.append(rec)
    prix = []
    for y in Y("prc_hpi_a.json", geo):
        h = hp(time=y)
        if h is None:
            continue
        c = cp(time=y)
        prix.append({"annee": y, "logement": h, "prix_conso": c})
    if prix:  # rebase sur 2015 pour l'inflation aussi
        base = next((p["prix_conso"] for p in prix if p["annee"] == "2015" and p["prix_conso"]), None)
        for p in prix:
            p["prix_conso"] = r(100 * p["prix_conso"] / base) if base and p["prix_conso"] else None
    return {"statut": stat, "prix": prix} if stat or prix else None


# ------------------------------------------------------------------ transports
def transports(geo):
    ps, fr, rd, rl, av, tk = (G(n, geo) for n in ["tran_hv_psmod.json", "tran_hv_frmod.json", "road_pa_mov.json", "rail_pa_total.json",
                                                 "avia_paoc.json", "road_go_ta_tott.json"])
    modal = [{"annee": y, "voiture": ps(vehicle="CAR", time=y), "bus": ps(vehicle="BUS_TOT", time=y), "train": ps(vehicle="TRN", time=y)}
             for y in Y("tran_hv_psmod.json", geo) if ps(vehicle="CAR", time=y) is not None]
    fret = [{"annee": y, "route": fr(tra_mode="ROAD", time=y), "rail": fr(tra_mode="RAIL", time=y), "fluvial": fr(tra_mode="IWW", time=y)}
            for y in Y("tran_hv_frmod.json", geo) if fr(tra_mode="ROAD", time=y) is not None]
    vol = []
    for y in sorted(set(Y("road_pa_mov.json", geo)) | set(Y("rail_pa_total.json", geo)) | set(Y("avia_paoc.json", geo))):
        vol.append({"annee": y, "voiture_gpkm": r((rd(vehicle="CAR", time=y) or 0) / 1000) or None, "bus_gpkm": r((rd(vehicle="BUS_MCO_TRO", time=y) or 0) / 1000) or None,
                    "train_gpkm": r((rl(time=y) or 0) / 1000) or None, "avion_mpas": r((av(tra_cov="TOTAL", time=y) or 0) / 1e6) or None,
                    "camion_gtkm": r((tk(time=y) or 0) / 1000) or None})
    vol = [v for v in vol if any(v[k] for k in v if k != "annee")]
    return {"modal": modal, "fret": fret, "volumes": vol} if modal or fret or vol else None


# ------------------------------------------------------------------ emploi
OCC = [("OC1", "Cadres dirigeants"), ("OC2", "Professions intellectuelles, cadres"), ("OC3", "Professions intermédiaires, techniciens"),
       ("OC4", "Employés administratifs"), ("OC5", "Employés des services et de la vente"), ("OC6", "Agriculteurs qualifiés"),
       ("OC7", "Artisans, ouvriers qualifiés"), ("OC8", "Conducteurs, opérateurs de machines"), ("OC9", "Emplois peu qualifiés"), ("OC0", "Militaires")]


def emploi(geo):
    p, o, s, u, e = (G(n, geo) for n in ["lfsa_pganws.json", "lfsa_egais.json", "lfsa_esgaed.json", "une_rt_a.json", "lfsi_emp_a.json"])
    act = [{"annee": y, "pop": p(age="Y15-64", wstatus="POP", time=y), "emploi": p(age="Y15-64", wstatus="EMP", time=y),
            "chomage": p(age="Y15-64", wstatus="UNE", time=y), "inactifs": p(age="Y15-64", wstatus="INAC", time=y),
            "emploi_65plus": (p(age="Y_GE15", wstatus="EMP", time=y) or 0) - (p(age="Y15-64", wstatus="EMP", time=y) or 0)}
           for y in Y("lfsa_pganws.json", geo) if p(age="Y15-64", wstatus="POP", time=y)]
    oy = [y for y in Y("lfsa_egais.json", geo) if o(isco08="TOTAL", time=y)]
    metiers = {"annee": oy[-1], "total": o(isco08="TOTAL", time=oy[-1]), "metiers": {k: o(isco08=k, time=oy[-1]) for k, _ in OCC}} if oy else None
    sy = Y("lfsa_esgaed.json", geo)
    statuts = []
    for y in sy:
        rec = {"annee": y, **{k: s(wstatus=k, time=y) for k in ["EMP", "SAL", "SELF", "SELF_S", "SELF_NS", "CFAM"]}}
        if rec["SELF"]:
            statuts.append(rec)
    taux = [{"annee": y, "chomage": u(age="Y15-74", time=y), "chomage_jeunes": u(age="Y15-24", time=y), "emploi_20_64": e(time=y)}
            for y in sorted(set(Y("une_rt_a.json", geo)) | set(Y("lfsi_emp_a.json", geo))) if u(age="Y15-74", time=y) is not None or e(time=y) is not None]
    return {"activite": act, "metiers": metiers, "statuts": statuts, "taux": taux, "labels": {"metiers": OCC}} if act or taux else None


# ------------------------------------------------------------------ inégalités
def inegalites(geo):
    d, g, l, l0, m = (G(n, geo) for n in ["ilc_di01.json", "ilc_di12.json", "ilc_li02.json", "ilc_li10.json", "ilc_mdsd11.json"])
    dy = [y for y in Y("ilc_di01.json", geo) if d(quant_inc="D1", statinfo="SHARE", time=y) is not None]
    dec = None
    if dy:
        y = dy[-1]
        dec = {"annee": y, "parts": [d(quant_inc=f"D{i}", statinfo="SHARE", time=y) for i in range(1, 11)],
               "seuils": [d(quant_inc=f"D{i}", statinfo="TC", time=y) for i in range(1, 10)]}
    ser = []
    for y in sorted(set(Y("ilc_di12.json", geo)) | set(Y("ilc_li02.json", geo))):
        rec = {"annee": y, "gini": g(time=y), "pauvrete": l(age="TOTAL", statinfo="MED_EI", time=y), "pauvrete_enfants": l(age="Y_LT18", statinfo="MED_EI", time=y),
               "pauvrete_65": l(age="Y_GE65", statinfo="MED_EI", time=y), "avant_transferts": l0(statinfo="MED_EI", time=y), "privation": m(time=y),
               "d10_d1": None}
        p1, p10 = d(quant_inc="D1", statinfo="SHARE", time=y), d(quant_inc="D10", statinfo="SHARE", time=y)
        if p1 and p10:
            rec["d10_d1"] = r(p10 / p1, 2)
        if any(v is not None for k, v in rec.items() if k != "annee"):
            ser.append(rec)
    return {"deciles": dec, "serie": ser} if dec or ser else None


# ------------------------------------------------------------------ déchets
NACE = [("A", "Agriculture"), ("B", "Mines, carrières"), ("C", "Industrie"), ("D", "Énergie"), ("E", "Eau, assainissement, traitement des déchets"),
        ("F", "Construction et travaux publics"), ("G-U_X_G4677", "Services"), ("EP_HH", "Ménages")]
TRT = [("RCV_R", "Recyclage", "#16a34a"), ("RCV_B", "Remblayage (carrières…)", "#84cc16"), ("RCV_E", "Incinération avec récupération d'énergie", "#f97316"),
       ("DSP_I", "Incinération sans récupération", "#dc2626"), ("DSP_L", "Mise en décharge", "#78716c"), ("DSP_OTH", "Autre élimination", "#a8a29e")]


def dechets(geo):
    gn, tr, mu = G("env_wasgen.json", geo), G("env_wastrt.json", geo), G("env_wasmun.json", geo)
    gy = [y for y in Y("env_wasgen.json", geo) if gn(nace_r2="TOTAL_HH", unit="T", time=y)]
    prod = None
    if gy:
        y = gy[-1]
        prod = {"annee": y, "total": gn(nace_r2="TOTAL_HH", unit="T", time=y), "kg_hab": gn(nace_r2="TOTAL_HH", unit="KG_HAB", time=y),
                "secteurs": {k: gn(nace_r2=k, unit="T", time=y) for k, _ in NACE}}
    ty = [y for y in Y("env_wastrt.json", geo) if tr(wst_oper="TRT", time=y)]
    trait = {"annee": ty[-1], "total": tr(wst_oper="TRT", time=ty[-1]), "modes": {k: tr(wst_oper=k, time=ty[-1]) for k, _, _ in TRT}} if ty else None
    mun = [{"annee": y, "kg_hab": mu(wst_oper="GEN", unit="KG_HAB", time=y), "recyclage": mu(wst_oper="RCY_M", unit="KG_HAB", time=y),
            "compost": mu(wst_oper="RCY_C_D", unit="KG_HAB", time=y), "incineration": mu(wst_oper="DSP_I_RCV_E", unit="KG_HAB", time=y),
            "decharge": mu(wst_oper="DSP_L_OTH", unit="KG_HAB", time=y)}
           for y in Y("env_wasmun.json", geo) if mu(wst_oper="GEN", unit="KG_HAB", time=y)]
    return {"production": prod, "traitement": trait, "menagers": mun, "labels": {"secteurs": NACE, "modes": TRT}} if prod or trait or mun else None


index = []
for p in PAYS:
    geo = p["code"]
    d = {"pays": geo, "nom": p["nom"], "sante": sante(geo), "education": education(geo), "logement": logement(geo),
         "transports": transports(geo), "emploi": emploi(geo), "inegalites": inegalites(geo), "dechets": dechets(geo)}
    json.dump(d, open(os.path.join(OUT, geo + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
    s = {"code": geo, "nom": p["nom"]}
    if d["sante"]:
        e = last(d["sante"]["esperance"], "t"); dp = last(d["sante"]["depenses"], "pib")
        s["sante"] = {"esperance": e and e["t"], "annee": e and e["annee"], "dep_pib": dp and dp["pib"], "dep_hab": dp and dp["hab"], "rac_pib": dp and dp["rac"]}
    if d["education"]:
        dp = last(d["education"]["diplomes"], "sup"); c = d["education"]["cout"]
        s["education"] = {"sup": dp and dp["sup"], "sup_jeunes": dp and dp["sup_jeunes"], "bas": dp and dp["bas"], "cout_sec": c and c["pps"].get("ED3_4"), "cout_sup": c and c["pps"].get("ED5-8")}
    if d["logement"]:
        st = last(d["logement"]["statut"], "proprio"); pr = d["logement"]["prix"]
        s["logement"] = {"proprio": st and r((st["proprio"] or 0) + (st["proprio_credit"] or 0)), "pieces": st and st["pieces"], "surpeuplement": st and st["surpeuplement"],
                         "surcout": st and st["surcout"], "prix_2015": pr[-1]["logement"] if pr else None}
    if d["transports"]:
        m = last(d["transports"]["modal"], "voiture"); f = last(d["transports"]["fret"], "route")
        s["transports"] = {"voiture": m and m["voiture"], "train": m and m["train"], "fret_route": f and f["route"], "fret_rail": f and f["rail"]}
    if d["emploi"]:
        t = last(d["emploi"]["taux"], "chomage"); e = last(d["emploi"]["taux"], "emploi_20_64")
        s["emploi"] = {"chomage": t and t["chomage"], "chomage_jeunes": t and t["chomage_jeunes"], "emploi": e and e["emploi_20_64"]}
    if d["inegalites"]:
        g = last(d["inegalites"]["serie"], "gini"); pv = last(d["inegalites"]["serie"], "pauvrete")
        s["inegalites"] = {"gini": g and g["gini"], "pauvrete": pv and pv["pauvrete"], "avant": pv and pv["avant_transferts"], "d10_d1": g and g["d10_d1"]}
    if d["dechets"]:
        mm = last(d["dechets"]["menagers"], "kg_hab"); pr = d["dechets"]["production"]; tr = d["dechets"]["traitement"]
        s["dechets"] = {"menagers": mm and mm["kg_hab"], "total_hab": pr and pr["kg_hab"],
                        "recyclage": tr and tr["total"] and r(100 * (tr["modes"].get("RCV_R") or 0) / tr["total"]),
                        "decharge": tr and tr["total"] and r(100 * (tr["modes"].get("DSP_L") or 0) / tr["total"])}
    index.append(s)
    print(geo, " ".join(k for k in ["sante", "education", "logement", "transports", "emploi", "inegalites", "dechets"] if d[k]))
json.dump({"pays": index}, open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
