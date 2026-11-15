#!/usr/bin/env python3
"""Construit data/finances.json à partir des fichiers de data/sources/.

Usage (depuis finances/) :  python3 scripts/build.py

Toutes les montants sont en milliards d'euros courants (Md€).
Les hypothèses de calcul sont décrites dans README.md et rappelées dans le
champ "notes" du JSON produit.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "data", "sources")
OUT = os.path.join(HERE, "..", "data", "finances.json")


# ---------------------------------------------------------------- lecture JSON-stat
def jstat(name):
    d = json.load(open(os.path.join(SRC, name)))
    ids, size = d["id"], d["size"]
    cats = []
    for i in ids:
        idx = d["dimension"][i]["category"]["index"]
        if isinstance(idx, list):
            idx = {k: n for n, k in enumerate(idx)}
        cats.append(sorted(idx, key=idx.get))
    out = {}
    for k, v in d["value"].items():
        k = int(k)
        coord = []
        for s in reversed(size):
            coord.append(k % s)
            k //= s
        coord.reverse()
        key = tuple((ids[j], cats[j][coord[j]]) for j in range(len(ids)) if size[j] > 1 or ids[j] == "time")
        out[frozenset(key)] = v
    return out


def getter(tab):
    def g(**kw):
        kw = {k: str(v) for k, v in kw.items()}
        for key, v in tab.items():
            dk = dict(key)
            if all(dk.get(k) == x for k, x in kw.items()):
                return v
        return None
    # index plus rapide
    idx = {}
    for key, v in tab.items():
        idx[frozenset(key)] = v

    def fast(**kw):
        k = frozenset((a, str(b)) for a, b in kw.items())
        if k in idx:
            return idx[k]
        return g(**kw)
    return fast


def md(x):
    """millions -> milliards, arrondi."""
    return None if x is None else round(x / 1000, 2)


def years_of(tab):
    return sorted({dict(k)["time"] for k in tab})


# ---------------------------------------------------------------- sources
gdp = getter(jstat("nama_10_gdp.json"))
a10 = getter(jstat("nama_10_a10.json"))
nftr = getter(jstat("nasa_10_nf_tr.json"))
co3 = getter(jstat("nama_10_co3_p3.json"))
pe_t = jstat("nama_10_pe.json"); pe = getter(pe_t)
main_t = jstat("gov_10a_main.json"); main = getter(main_t)
tax = getter(jstat("gov_10a_taxag.json"))
exp_t = jstat("gov_10a_exp.json"); exp = getter(exp_t)
nfa_t = jstat("nama_10_nfa_bs.json"); nfa = getter(nfa_t)
fbs_t = jstat("nasa_10_f_bs.json"); fbs = getter(fbs_t)
debt_t = jstat("gov_10dd_edpt1.json"); debt = getter(debt_t)

gdp_years = [y for y in years_of(jstat("nama_10_gdp.json")) if gdp(na_item="B1GQ", time=y)]
# années disponibles dans toutes les sources du PIB détaillé
pib_years = [y for y in gdp_years if nftr(sector="S11", na_item="B1G", direct="PAID", time=y) or nftr(sector="S11", na_item="B1G", direct="RECV", time=y)]


def pop(y):
    v = pe(time=y)
    return v * 1000 if v else None


# ================================================================= 1. PIB
def imputed_rents(y):
    """Loyers imputés des propriétaires occupants (CP042, consommation des ménages).
    Eurostat ne les publie qu'avec retard : au-delà de la dernière année connue,
    on les prolonge au rythme moyen observé sur les 7 années précédentes
    (la série de valeur ajoutée immobilière ne convient pas : rupture de base en 2023)."""
    v = co3(coicop="CP042", time=y)
    if v is not None:
        return v, False
    known = sorted(t for t in range(2010, int(y)) if co3(coicop="CP042", time=t) is not None)
    last, first = known[-1], known[max(0, len(known) - 8)]
    g = (co3(coicop="CP042", time=last) / co3(coicop="CP042", time=first)) ** (1 / (last - first))
    return co3(coicop="CP042", time=last) * g ** (int(y) - last), True


A10_LABELS = {
    "A": "Agriculture, sylviculture, pêche",
    "B-E": "Industrie (hors construction)",
    "F": "Construction",
    "G-I": "Commerce, transports, hébergement-restauration",
    "J": "Information et communication",
    "K": "Finance et assurance",
    "L": "Immobilier (dont loyers imputés)",
    "M_N": "Services aux entreprises (conseil, R&D, intérim…)",
    "O-Q": "Administration, enseignement, santé, action sociale",
    "R-U": "Arts, loisirs, autres services",
}

pib = {}
for y in pib_years:
    G = lambda i: gdp(na_item=i, time=y)
    S = lambda sec, i: nftr(sector=sec, na_item=i, direct="PAID", time=y) or nftr(sector=sec, na_item=i, direct="RECV", time=y)
    total = G("B1GQ")
    rents, rents_est = imputed_rents(y)
    va = {s: S(s, "B1G") for s in ["S11", "S12", "S13", "S14", "S15"]}
    ccf = {s: S(s, "P51C") for s in ["S11", "S12", "S13", "S14", "S15"]}
    taxes_net_products = total - sum(va.values())
    gfcf = {s: S(s, "P51G") for s in ["S11", "S12", "S13", "S14", "S15"]}
    # achats de production marchande payés par de l'argent public
    p2_s13 = main(sector="S13", na_item="P2", time=y)
    d632 = main(sector="S13", na_item="D632PAY", time=y)
    p51g_s13 = main(sector="S13", na_item="P51G", time=y)
    d3 = main(sector="S13", na_item="D3PAY", time=y)

    rec = {
        "pib": md(total),
        "population": pop(y),
        "dette_maastricht_pct": debt(unit="PC_GDP", time=y),
        # --- optique demande
        "demande": [
            {"id": "conso_menages", "label": "Consommation des ménages", "v": md(G("P31_S14"))},
            {"id": "conso_isblsm", "label": "Consommation des associations (ISBLSM)", "v": md(G("P31_S15"))},
            {"id": "conso_apu_indiv", "label": "Consommation publique individualisable (santé, école…)", "v": md(G("P31_S13"))},
            {"id": "conso_apu_coll", "label": "Consommation publique collective (défense, police…)", "v": md(G("P32_S13"))},
            {"id": "inv_entreprises", "label": "Investissement des entreprises", "v": md(gfcf["S11"] + gfcf["S12"])},
            {"id": "inv_menages", "label": "Investissement des ménages (logement)", "v": md(gfcf["S14"] + gfcf["S15"])},
            {"id": "inv_apu", "label": "Investissement public", "v": md(gfcf["S13"])},
            {"id": "stocks", "label": "Variation des stocks", "v": md(G("P52_P53"))},
            {"id": "solde_ext", "label": "Solde extérieur (exportations − importations)", "v": md(G("P6X7"))},
        ],
        "exports": md(G("P6")), "imports": md(G("P7")),
        # --- optique revenus
        "revenus": [
            {"id": "salaires", "label": "Rémunération des salariés (salaires + cotisations employeurs)", "v": md(G("D1"))},
            {"id": "ebe", "label": "Excédent brut d'exploitation et revenu mixte", "v": md(G("B2A3G"))},
            {"id": "impots_prod", "label": "Impôts sur la production et les importations, nets des subventions", "v": md(G("D2X3"))},
        ],
        # --- optique production (qui produit ?)
        "production": [
            {"id": "snf", "label": "Entreprises non financières", "v": md(va["S11"])},
            {"id": "sf", "label": "Banques et assurances", "v": md(va["S12"])},
            {"id": "menages", "label": "Ménages : entrepreneurs individuels et loyers imputés", "v": md(va["S14"])},
            {"id": "isblsm", "label": "Associations (ISBLSM)", "v": md(va["S15"])},
            {"id": "apu", "label": "Administrations publiques", "v": md(va["S13"])},
            {"id": "impots_produits", "label": "Impôts nets sur les produits (TVA, accises…)", "v": md(taxes_net_products)},
        ],
        "branches": [
            {"id": k, "label": lab, "v": md(a10(nace_r2=k, time=y))} for k, lab in A10_LABELS.items()
        ],
        # --- lecture « ce qui est vendu à des clients » (cascade)
        "cascade": [
            {"id": "pib", "label": "PIB", "v": md(total), "type": "total"},
            {"id": "impots_produits", "label": "Impôts nets sur les produits", "v": md(-taxes_net_products),
             "note": "La TVA et les accises gonflent le prix payé sans rien ajouter à ce qui est produit : le PIB « aux prix du marché » les inclut."},
            {"id": "apu", "label": "Services publics comptés à leur coût", "v": md(-va["S13"]),
             "note": "Les services non vendus (école, police, hôpital public…) n'ont pas de prix : on les compte pour ce qu'ils coûtent (salaires + usure du capital). Utiles ou non, ils pèsent ce qu'on y dépense."},
            {"id": "isblsm", "label": "Associations comptées à leur coût", "v": md(-va["S15"]),
             "note": "Même convention que pour les administrations."},
            {"id": "loyers_imputes", "label": "Loyers que les propriétaires « se versent »", "v": md(-rents),
             "note": "Un propriétaire occupant est censé se louer son logement : ce loyer fictif est ajouté au PIB sans aucune transaction. (Montant brut : il inclut les frais d'entretien, il surestime donc un peu la valeur ajoutée correspondante.)"
                     + (" Montant prolongé à partir de la dernière année publiée." if rents_est else "")},
            {"id": "amortissement", "label": "Usure du capital des entreprises", "v": md(-(ccf["S11"] + ccf["S12"])),
             "note": "Une partie de la production sert seulement à remplacer les machines et bâtiments usés : ce n'est pas un enrichissement net. (L'usure des logements des ménages est déjà comprise dans les loyers imputés ; celle des entrepreneurs individuels n'est pas retirée ici.)"},
            {"id": "reste", "label": "Valeur ajoutée nette vendue à des clients", "type": "total",
             "note": "Ce qui reste : la production des entreprises et indépendants, vendue à un prix, nette de l'usure du capital. Elle inclut encore des ventes payées par de l'argent public (voir ci-dessous)."},
        ],
        "achats_publics": [
            {"id": "d632", "label": "Soins et médicaments remboursés (achetés au privé)", "v": md(d632)},
            {"id": "p2", "label": "Achats courants des administrations", "v": md(p2_s13)},
            {"id": "p51g", "label": "Investissement public (travaux, équipements)", "v": md(p51g_s13)},
            {"id": "d3", "label": "Subventions aux entreprises", "v": md(d3)},
        ],
        "loyers_imputes_estimes": rents_est,
    }
    s = sum(c["v"] for c in rec["cascade"] if c.get("type") != "total")
    rec["cascade"][-1]["v"] = round(md(total) + s, 2)
    pib[y] = rec


# ================================================================= 2. CND (INSEE)
def load_cnd():
    import openpyxl
    wb = openpyxl.load_workbook(os.path.join(SRC, "insee_IA118.xlsx"), data_only=True)
    ws = wb["Tableau complémentaire"]
    rows = {}
    for r in ws.iter_rows(min_row=4, values_only=True):
        if not r[0] or not isinstance(r[1], (int, float)):
            continue
        label = str(r[0]).strip()
        vint = [float(x or 0) for x in r[2:22]]
        dec = [vint[2 * i] + vint[2 * i + 1] for i in range(10)]   # vingtièmes -> dixièmes
        rows[label] = {"total": float(r[1]), "dec": dec}
    return rows


cnd = load_cnd()


def cnd_row(prefix):
    for k, v in cnd.items():
        if k.startswith(prefix):
            return v
    raise KeyError(prefix)


def shares(*prefixes, sign=1):
    dec = [0.0] * 10
    for p in prefixes:
        r = cnd_row(p)
        dec = [a + sign * b for a, b in zip(dec, r["dec"])]
    dec = [max(0.0, x) for x in dec]
    t = sum(dec)
    return [x / t for x in dec]


PAY_KEYS = {
    "cotisations": shares("Cotisations sociales retraite", "Cotisations sociales chômage", "Cotisations sociales famille",
                          "Autres cotisations sociales", sign=-1),
    "csg": shares("Contribution sociale généralisée", sign=-1),
    "ir": shares("Impôt sur le revenu", sign=-1),
    "is": shares("Impôt sur les sociétés", sign=-1),
    "tva": shares("Taxes sur les produits", sign=-1),
    "accises": shares("Taxes sur les produits", sign=-1),
    "prod": shares("Taxes sur la production", sign=-1),
    "patrimoine": shares("Autres impôts sur les revenus et le patrimoine", sign=-1),
}
GET_KEYS = {
    "retraites": shares("Pensions de retraite"),
    "sante": shares("Santé"),
    "maladie": shares("Autres revenus de remplacement", "Invalidité"),
    "famille": shares("Famille"),
    "chomage": shares("Allocations chômage"),
    "solidarite": shares("Exclusion sociale", "Aides au logement", "Action sociale"),
    "enseignement": shares("Enseignement"),
    "culture": shares("Culture et loisirs"),
    "collectif": shares("Dépenses collectives"),
}
# niveaux de vie (euros par unité de consommation) pour les infobulles
cnd_info = {
    "annee": 2023,
    "uc_millions": cnd_row("Nombre d'unités de consommation")["dec"],
    "individus_millions": cnd_row("Nombre d'individus")["dec"],
}

# ================================================================= 3. Sankey
SUBS = {"C": "S1311", "L": "S1313", "SS": "S1314"}
INSTR = [
    ("cotisations", "Cotisations sociales"),
    ("csg", "CSG-CRDS"),
    ("ir", "Impôt sur le revenu"),
    ("is", "Impôt sur les sociétés"),
    ("tva", "TVA"),
    ("accises", "Accises, autres taxes"),
    ("prod", "Impôts sur la production"),
    ("patrimoine", "Successions, patrimoine"),
    ("autres", "Recettes non fiscales"),
    ("emprunt", "Emprunt (déficit)"),
]
FUNCS = [
    ("retraites", "Retraites", ["GF1002", "GF1003"], "retraites"),
    ("sante", "Santé", ["GF07"], "sante"),
    ("maladie", "Arrêts maladie, invalidité", ["GF1001"], "maladie"),
    ("famille", "Famille", ["GF1004"], "famille"),
    ("chomage", "Chômage", ["GF1005"], "chomage"),
    ("solidarite", "Logement, exclusion, action sociale", ["GF1006", "GF1007", "GF1008", "GF1009"], "solidarite"),
    ("enseignement", "Enseignement", ["GF09"], "enseignement"),
    ("culture", "Culture, sport, loisirs", ["GF08"], "culture"),
    ("economie", "Économie, transports, énergie", ["GF04"], "collectif"),
    ("cadre", "Environnement, urbanisme, logement", ["GF05", "GF06"], "collectif"),
    ("defense", "Défense", ["GF02"], "collectif"),
    ("securite", "Police, justice, pompiers", ["GF03"], "collectif"),
    ("services", "Administration générale, recherche", ["GF01", "-GF0107", "-GF0108"], "collectif"),
    ("dette", "Intérêts de la dette", ["GF0107"], None),
]
SUB_LABEL = {"C": "État et opérateurs", "SS": "Sécurité sociale", "L": "Collectivités locales"}


def ras(seed, rows, cols, it=200):
    m = [r[:] for r in seed]
    for _ in range(it):
        for i, r in enumerate(m):
            s = sum(r)
            if s > 0:
                m[i] = [x * rows[i] / s for x in r]
        for j in range(len(cols)):
            s = sum(m[i][j] for i in range(len(m)))
            if s > 0:
                for i in range(len(m)):
                    m[i][j] *= cols[j] / s
    return m


def sankey_year(y):
    M = lambda s, i: main(sector=s, na_item=i, time=y) or 0.0
    T = lambda s, i: tax(sector=s, na_item=i, time=y) or 0.0
    X = lambda s, c: exp(sector=s, cofog99=c, time=y) or 0.0

    # --- transferts entre administrations
    d9_intra_pay = sum(M(s, "D9PAY") for s in SUBS.values()) - M("S13", "D9PAY")
    d9_intra_rec = sum(M(s, "D9REC") for s in SUBS.values()) - M("S13", "D9REC")
    pos = lambda v: max(0.0, v)
    payw = {k: pos(M(s, "D9PAY")) for k, s in SUBS.items()}
    recw = {k: pos(M(s, "D9REC")) for k, s in SUBS.items()}
    intra_pay = {k: M(s, "D73PAY") + d9_intra_pay * payw[k] / sum(payw.values()) for k, s in SUBS.items()}
    intra_rec = {k: M(s, "D73REC") + d9_intra_rec * recw[k] / sum(recw.values()) for k, s in SUBS.items()}

    # --- recettes propres par instrument et par sous-secteur
    own = {}
    for k, s in SUBS.items():
        d51a, d51b = T(s, "D51A"), T(s, "D51B")
        r = {
            "cotisations": T(s, "D61"),
            "csg": d51a if k == "SS" else 0.0,
            "ir": d51a if k != "SS" else 0.0,
            "is": d51b,
            "tva": T(s, "D211"),
            "accises": T(s, "D21") - T(s, "D211"),
            "prod": T(s, "D29"),
            "patrimoine": T(s, "D59") + T(s, "D91") + (T(s, "D51") - d51a - d51b),
        }
        r["autres"] = M(s, "TR") - intra_rec[k] - sum(r.values())
        own[k] = r

    # --- dépenses par fonction (consolidées) : RAS sur la matrice sous-secteur x fonction
    def fval(sec, codes):
        v = 0.0
        for c in codes:
            v += -X(sec, c[1:]) if c.startswith("-") else X(sec, c)
        return v

    total_cofog = X("S13", "TOTAL")
    cols = [fval("S13", f[2]) for f in FUNCS]
    spend = {k: M(s, "TE") - intra_pay[k] for k, s in SUBS.items()}
    order = ["C", "SS", "L"]
    rows_t = [total_cofog - spend["SS"] - spend["L"], spend["SS"], spend["L"]]
    seed = [[max(0.0, fval(SUBS[k], f[2])) + 1e-6 for f in FUNCS] for k in order]
    mat = ras(seed, rows_t, cols)
    spend_f = {k: dict(zip([f[0] for f in FUNCS], mat[i])) for i, k in enumerate(order)}
    spend = {k: rows_t[i] for i, k in enumerate(order)}

    # --- emprunt et transferts nets
    deficit = total_cofog - M("S13", "TR")
    borrow = {"L": pos(-M("S1313", "B9")), "SS": pos(-M("S1314", "B9"))}
    transfer = {}
    for k in ["L", "SS"]:
        t = spend[k] - sum(own[k].values()) - borrow[k]
        if t < 0:  # excédent : on réattribue une part des recettes propres à l'État
            sc = (sum(own[k].values()) + t) / sum(own[k].values())
            moved = {i: v * (1 - sc) for i, v in own[k].items()}
            own[k] = {i: v * sc for i, v in own[k].items()}
            for i, v in moved.items():
                own["C"][i] += v
            t = 0.0
        transfer[k] = t
    borrow["C"] = deficit - borrow["L"] - borrow["SS"]
    # bouclage de l'État : l'écart résiduel (approximation des transferts) va aux recettes non fiscales
    c_in = sum(own["C"].values()) + borrow["C"]
    c_out = spend["C"] + transfer["L"] + transfer["SS"]
    own["C"]["autres"] += c_out - c_in

    # --- noeuds et liens
    nodes, links = [], []
    def node(id_, label, col, kind):
        nodes.append({"id": id_, "label": label, "col": col, "kind": kind})
    def link(s, t, v, kind="normal"):
        if v > 0.05:
            links.append({"source": s, "target": t, "value": round(v / 1000, 3), "kind": kind})

    for d in range(10):
        node(f"p{d+1}", f"D{d+1}", 0, "decile")
    node("p_autres", "Usagers et divers", 0, "autre")
    node("p_futur", "Générations futures", 0, "futur")
    for i, lab in INSTR:
        node("i_" + i, lab, 1, "instrument")
    node("s_C", SUB_LABEL["C"], 2, "apu")
    node("s_SS", SUB_LABEL["SS"], 3, "apu")
    node("s_L", SUB_LABEL["L"], 3, "apu")
    for f in FUNCS:
        node("f_" + f[0], f[1], 4, "fonction")
    for d in range(10):
        node(f"r{d+1}", f"D{d+1}", 5, "decile")
    node("r_preteurs", "Prêteurs", 5, "preteurs")

    instr_tot = {i: sum(own[k][i] for k in SUBS) for i, _ in INSTR if i not in ("emprunt",)}
    instr_tot["emprunt"] = deficit
    for i, _ in INSTR:
        if i == "autres":
            link("p_autres", "i_autres", instr_tot[i])
        elif i == "emprunt":
            link("p_futur", "i_emprunt", instr_tot[i], "dette")
        else:
            for d, sh in enumerate(PAY_KEYS[i]):
                link(f"p{d+1}", "i_" + i, instr_tot[i] * sh)
    for k in SUBS:
        for i, _ in INSTR:
            if i != "emprunt":
                link("i_" + i, "s_" + k, own[k][i])
        link("i_emprunt", "s_" + k, borrow[k], "dette")
    link("s_C", "s_L", transfer["L"], "transfert")
    link("s_C", "s_SS", transfer["SS"], "transfert")
    for k in SUBS:
        for f in FUNCS:
            link("s_" + k, "f_" + f[0], spend_f[k][f[0]])
    for f in FUNCS:
        tot = sum(spend_f[k][f[0]] for k in SUBS)
        if f[3] is None:
            link("f_" + f[0], "r_preteurs", tot)
        else:
            for d, sh in enumerate(GET_KEYS[f[3]]):
                link("f_" + f[0], f"r{d+1}", tot * sh)

    return {
        "annee": y,
        "depenses": md(total_cofog),
        "recettes": md(M("S13", "TR")),
        "deficit": md(deficit),
        "pib": md(gdp(na_item="B1GQ", time=y)),
        "population": pop(y),
        "transferts": {"vers_collectivites": md(transfer["L"]), "vers_secu": md(transfer["SS"])},
        "nodes": nodes,
        "links": links,
    }


cofog_years = [y for y in years_of(exp_t) if exp(sector="S13", cofog99="TOTAL", time=y)]
sankey = {y: sankey_year(y) for y in cofog_years[-3:]}

# ================================================================= 4. Patrimoine
BS_SECTORS = [
    ("menages", "Ménages et associations", "S14_S15", ["S14", "S15"]),
    ("snf", "Entreprises non financières", "S11", ["S11"]),
    ("sf", "Banques, assurances, fonds", "S12", ["S12"]),
    ("apu", "Administrations publiques", "S13", ["S13"]),
]
NF_ITEMS = [
    ("logements", "Logements", ["N111N"]),
    ("terrains", "Terrains", ["N211N"]),
    ("batiments", "Autres bâtiments et ouvrages (bureaux, routes, réseaux…)", ["N112N"]),
    ("machines", "Machines, véhicules, équipements", ["N11MN"]),
    ("pi", "Logiciels, R&D, propriété intellectuelle", ["N117N"]),
    ("stocks", "Stocks", ["N12N"]),
    ("valeur", "Objets de valeur (or, art, bijoux)", ["N13N"]),
    ("autres_nf", "Autres (ressources naturelles, cultures…)", ["N1N", "N2N", "-N111N", "-N211N", "-N112N", "-N11MN", "-N117N", "-N12N", "-N13N"]),
]
F_ITEMS = [
    ("depots", "Billets et dépôts (dont or monétaire)", ["F1", "F2"]),
    ("titres", "Obligations et titres de dette", ["F3"]),
    ("credits", "Crédits", ["F4"]),
    ("actions", "Actions et parts de fonds", ["F5"]),
    ("assurance", "Assurance-vie et retraite", ["F6"]),
    ("derives", "Produits dérivés", ["F7"]),
    ("autres_f", "Autres (crédits commerciaux, décalages)", ["F8"]),
]
bs_years = [y for y in years_of(nfa_t) if nfa(sector="S1", asset10="N1N", time=y) and fbs(sector="S1", finpos="ASS", na_item="F", time=y)]


def sumcodes(fn, codes):
    v = 0.0
    for c in codes:
        x = fn(c.lstrip("-")) or 0.0
        v += -x if c.startswith("-") else x
    return v


patrimoine = {}
for y in bs_years:
    secs = []
    for sid, lab, nfs, fs in BS_SECTORS:
        nf = {i: md(sumcodes(lambda c: nfa(sector=nfs, asset10=c, time=y), codes)) for i, _, codes in NF_ITEMS}
        fa = {i: md(sum(sumcodes(lambda c: fbs(sector=s, finpos="ASS", na_item=c, time=y), codes) for s in fs)) for i, _, codes in F_ITEMS}
        fl = {i: md(sum(sumcodes(lambda c: fbs(sector=s, finpos="LIAB", na_item=c, time=y), codes) for s in fs)) for i, _, codes in F_ITEMS}
        tot_a = sum(nf.values()) + sum(fa.values())
        tot_l = sum(fl.values())
        secs.append({"id": sid, "label": lab, "nf": nf, "fa": fa, "fl": fl,
                     "actifs": round(tot_a, 1), "passifs": round(tot_l, 1), "net": round(tot_a - tot_l, 1)})
    rdm = {"fa": {i: md(sumcodes(lambda c: fbs(sector="S2", finpos="ASS", na_item=c, time=y), codes)) for i, _, codes in F_ITEMS},
           "fl": {i: md(sumcodes(lambda c: fbs(sector="S2", finpos="LIAB", na_item=c, time=y), codes)) for i, _, codes in F_ITEMS}}
    patrimoine[y] = {"secteurs": secs, "reste_du_monde": rdm,
                     "pib": md(gdp(na_item="B1GQ", time=y)), "population": pop(y),
                     "dette_maastricht_pct": debt(unit="PC_GDP", time=y)}

# ================================================================= 5. Simulateur multiplicateur
last = gdp_years[-1]
simu = {
    "annee": last,
    "dette_pct": debt(unit="PC_GDP", time=last),
    "recettes_pct": round(100 * main(sector="S13", na_item="TR", time=last) / gdp(na_item="B1GQ", time=last), 1),
    "prelevements_pct": round(100 * tax(sector="S13", na_item="D2_D5_D91_D61_M_D995", time=last) / gdp(na_item="B1GQ", time=last), 1),
    "depenses_pct": round(100 * main(sector="S13", na_item="TE", time=last) / gdp(na_item="B1GQ", time=last), 1),
}

# ---------------------------------------------------------------- séries longues
interets = []
prev_debt = None
for y in gdp_years:
    i = main(sector="S13", na_item="D41PAY", time=y)
    dmd = debt(unit="MIO_EUR", time=y)
    tr = main(sector="S13", na_item="TR", time=y)
    if i is None or tr is None:
        prev_debt = dmd
        continue
    interets.append({
        "annee": y, "interets": md(i), "pib": md(gdp(na_item="B1GQ", time=y)), "recettes": md(tr),
        "dette": md(dmd), "dette_pct": debt(unit="PC_GDP", time=y),
        "pct_recettes": round(100 * i / tr, 2),
        "pct_pib": round(100 * i / gdp(na_item="B1GQ", time=y), 2),
        "taux_apparent": round(100 * i / prev_debt, 2) if prev_debt else None,
    })
    prev_debt = dmd

fonctions_hist = {"fonctions": [[f[0], f[1]] for f in FUNCS], "annees": []}
for y in gdp_years:
    if not exp(sector="S13", cofog99="TOTAL", time=y):
        continue
    def fv(codes):
        v = 0.0
        for c in codes:
            x = exp(sector="S13", cofog99=c.lstrip("-"), time=y) or 0.0
            v += -x if c.startswith("-") else x
        return v
    g = gdp(na_item="B1GQ", time=y)
    fonctions_hist["annees"].append({"annee": y, "pib": md(g), "md": {f[0]: md(fv(f[2])) for f in FUNCS},
                                     "pct": {f[0]: round(100 * fv(f[2]) / g, 3) for f in FUNCS}})

historique = []
for y in gdp_years:
    te, tr = main(sector="S13", na_item="TE", time=y), main(sector="S13", na_item="TR", time=y)
    historique.append({"annee": y, "pib": md(gdp(na_item="B1GQ", time=y)),
                       "depenses": md(te), "recettes": md(tr), "dette_pct": debt(unit="PC_GDP", time=y)})

out = {
    "genere_le": __import__("datetime").date.today().isoformat(),
    "historique": historique,
    "interets": interets,
    "fonctions_hist": fonctions_hist,
    "pib": pib,
    "sankey": sankey,
    "patrimoine": patrimoine,
    "simulateur": simu,
    "cnd": cnd_info,
    "labels": {
        "nf": [[i, l] for i, l, _ in NF_ITEMS],
        "f": [[i, l] for i, l, _ in F_ITEMS],
    },
}
json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("écrit", OUT, os.path.getsize(OUT), "octets")
print("PIB", {y: pib[y]["pib"] for y in pib})
for y, s in sankey.items():
    print("sankey", y, "dépenses", s["depenses"], "recettes", s["recettes"], "déficit", s["deficit"], "transferts", s["transferts"])
for y, p in patrimoine.items():
    print("patrimoine", y, {s["id"]: s["net"] for s in p["secteurs"]})
print("simu", simu)
