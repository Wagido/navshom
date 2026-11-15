/* Santé, éducation, logement, transports, emploi, inégalités, déchets */
(() => {
"use strict";
const $ = s => document.querySelector(s);
const T = () => window.TH;
let IDX = null, geo = "FR";
const CACHE = {};
const D = () => CACHE[geo];
const empty = (sel, msg = "Données non publiées pour ce pays.") => { const e = $(sel); if (e) e.innerHTML = `<p class="empty">${msg}</p>`; };
const lastOf = (arr, k) => arr ? [...arr].reverse().find(x => x[k] != null) : null;
const sortState = {};

function table(el, key, cols, def) {
  const { esc } = T();
  const st = sortState[key] || (sortState[key] = { k: def, dir: -1 });
  const col = cols.find(c => c.k === st.k);
  const rows = IDX.pays.filter(r => cols.some(c => c.f(r) != null)).sort((a, b) => { const va = col.f(a), vb = col.f(b); if (va == null) return 1; if (vb == null) return -1; return st.dir * (va - vb); });
  const cell = (c, r) => { const v = c.f(r); if (v == null || isNaN(v)) return `<td class="muted">–</td>`;
    return `<td>${c.fmt(v)}${c.max ? `<span class="ibar" style="width:${Math.min(70, Math.max(0, 70 * v / c.max))}px;background:${c.c}"></span>` : ""}</td>`; };
  el.innerHTML = `<div class="table-scroll"><table class="cmp-t"><thead><tr><th>Pays</th>${cols.map(c => `<th data-k="${c.k}" class="${c.k === st.k ? "sorted" : ""}">${esc(c.l)}${c.k === st.k ? (st.dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.code === geo ? "me" : ""}"><td>${esc(r.nom)}</td>${cols.map(c => cell(c, r)).join("")}</tr>`).join("")}</tbody></table></div>`;
  el.querySelectorAll("th[data-k]").forEach(th => th.onclick = () => { sortState[key] = st.k === th.dataset.k ? { k: st.k, dir: -st.dir } : { k: th.dataset.k, dir: -1 }; table(el, key, cols, def); });
}

async function init() {
  if (!window.TH) { setTimeout(init, 100); return; }
  try { IDX = await fetch("data/societe/index.json").then(r => r.json()); } catch (e) { return; }
  document.addEventListener("geochange", e => setGeo(e.detail));
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(drawAll, 200); });
  await setGeo($("#geo")?.value || "FR");
}
async function setGeo(g) {
  geo = g;
  if (!(g in CACHE)) { try { CACHE[g] = await fetch(`data/societe/${g}.json`).then(r => r.json()); } catch (e) { CACHE[g] = null; } }
  drawAll();
}
function drawAll() { [sante, education, logement, transports, emploi, inegalites, dechets].forEach(f => { try { f(); } catch (e) { console.error(f.name, e); } }); }

/* ---------------------------------------------------------------- santé */
function sante() {
  const { kpis, lineChart, bars, legend, n0, n1, pct, css, esc, showTip, hideTip } = T();
  const S = D()?.sante; if (!S) { kpis("#sa-kpis", []); empty("#sa-flux"); return; }
  const e = lastOf(S.esperance, "t"), dep = lastOf(S.depenses, "pib");
  const F = S.flux;
  kpis("#sa-kpis", [
    e && [n1(e.t) + " ans", `d'espérance de vie à la naissance en ${e.annee} (femmes ${n1(e.f)}, hommes ${n1(e.h)})`],
    e?.t65 && [n1(e.t65) + " ans", "restant à vivre en moyenne à 65 ans"],
    dep && [pct(dep.pib), `du PIB consacrés aux soins en ${dep.annee}`],
    F && [n0(F.total / 1000) + " Md€", `de dépense courante de santé en ${F.annee}`],
    F && [pct(100 * (F.par_financeur.HF3 || 0) / F.total, 0), "payés directement par les ménages (reste à charge)"],
  ]);
  // qui paie quoi
  const el = $("#sa-flux");
  if (F) {
    const FIN = S.labels.financeurs, FCT = S.labels.fonctions, colF = { HF1: "#3b6fd6", HF21: "#8b5cf6", HF3: "#dc2626", HF22: "#16a34a", HF23: "#f59e0b" };
    const colC = d3.schemeTableau10;
    const nodes = [], links = [];
    FIN.forEach(([k, l]) => { if (F.par_financeur[k] > 100) nodes.push({ id: k, label: l, color: colF[k] }); });
    FCT.forEach(([k, l], i) => nodes.push({ id: k, label: l, color: colC[i % 10] }));
    FIN.forEach(([f]) => FCT.forEach(([c]) => { const v = F.matrice[f]?.[c]; if (v > 50) links.push({ source: f, target: c, value: v }); }));
    const used = new Set(links.flatMap(l => [l.source, l.target]));
    const W = 1000, H = 480;
    try {
      const G = d3.sankey().nodeId(d => d.id).nodeSort(null).nodeWidth(12).nodePadding(10).extent([[1, 20], [W - 260, H - 4]])({ nodes: nodes.filter(n => used.has(n.id)).map(n => ({ ...n })), links: links.map(l => ({ ...l })) });
      const svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`);
      svg.append("text").attr("class", "colhead").attr("x", 1).attr("y", 12).text("Qui paie");
      svg.append("text").attr("class", "colhead").attr("x", G.nodes.find(n => n.depth === 1)?.x0 || 700).attr("y", 12).text("Pour quels soins");
      svg.append("g").selectAll("path").data(G.links).join("path").attr("class", "link").attr("d", d3.sankeyLinkHorizontal())
        .attr("stroke", d => d.source.color).attr("stroke-width", d => Math.max(1, d.width))
        .on("pointermove", (ev, d) => showTip(`<b>${esc(d.source.label)} → ${esc(d.target.label)}</b><br>${n1(d.value / 1000)} Md€`, ev)).on("pointerleave", hideTip);
      const nd = svg.append("g").selectAll("g").data(G.nodes).join("g").attr("class", "node");
      nd.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => d.x1 - d.x0).attr("height", d => Math.max(1, d.y1 - d.y0)).attr("fill", d => d.color);
      nd.append("text").attr("x", d => d.x1 + 6).attr("y", d => (d.y0 + d.y1) / 2).attr("dy", ".35em").text(d => d.label + "  ").append("tspan").attr("class", "amt").text(d => n1(d.value / 1000) + " Md€");
      el.replaceChildren(svg.node());
    } catch (e2) { empty("#sa-flux", "Diagramme indisponible."); }
  } else empty("#sa-flux");
  lineChart($("#sa-esp"), S.esperance.filter(x => +x.annee >= 1960), [{ k: "f", l: "Femmes", c: "#e15759" }, { k: "h", l: "Hommes", c: "#3b6fd6" }, { k: "t", l: "Ensemble", c: css("--ink"), dash: "4 3" }],
    { vfmt: v => n1(v) + " ans", yfmt: v => v + " ans", nozero: true });
  legend("#sa-esp-legend", [["Femmes", "#e15759"], ["Hommes", "#3b6fd6"], ["Ensemble", css("--ink"), true]]);
  if (S.causes) {
    const C = S.causes, L = Object.fromEntries(S.labels.causes);
    bars($("#sa-causes"), S.labels.causes.filter(([k]) => C.causes[k]).map(([k, l]) => ({ l, v: C.causes[k], t: `${n0(C.causes[k])} · ${pct(100 * C.causes[k] / C.total, 0)}` })).sort((a, b) => b.v - a.v));
    $("#sa-causes-title").textContent = `Causes de décès en ${C.annee} (${n0(C.total)} décès)`;
  } else empty("#sa-causes");
  table($("#sa-cmp"), "sa", [
    { k: "esp", l: "Espérance de vie", f: r => r.sante?.esperance, fmt: v => n1(v) + " ans", max: 85, c: "#16a34a" },
    { k: "dep", l: "Dépenses de santé (% PIB)", f: r => r.sante?.dep_pib, fmt: v => pct(v), max: 13, c: "#3b6fd6" },
    { k: "rac", l: "dont reste à charge (% PIB)", f: r => r.sante?.rac_pib, fmt: v => pct(v), max: 4, c: "#dc2626" },
  ], "esp");
}

/* ---------------------------------------------------------------- éducation */
function education() {
  const { kpis, bars, lineChart, legend, n0, n1, pct, css } = T();
  const E = D()?.education; if (!E) { kpis("#ed-kpis", []); empty("#ed-eff"); return; }
  const ef = E.effectifs, dp = lastOf(E.diplomes, "sup"), c = E.cout;
  kpis("#ed-kpis", [
    ef && [n1(ef.total / 1e6) + " M", `d'élèves et d'étudiants en ${ef.annee}`],
    dp && [pct(dp.sup, 0), `des 25-64 ans diplômés du supérieur (${pct(dp.sup_jeunes, 0)} des 25-34 ans) en ${dp.annee}`],
    dp && [pct(dp.bas, 0), "des 25-64 ans sans diplôme du secondaire (brevet au plus)"],
    c && [n0(c.eur["ED3_4"]) + " €", `de dépense par lycéen et par an (${c.annee}), ${n0(c.eur["ED5-8"])} € par étudiant`],
  ]);
  if (ef) {
    const NV = E.labels.niveaux;
    bars($("#ed-eff"), NV.filter(([k]) => ef.niveaux[k]?.total).map(([k, l]) => { const v = ef.niveaux[k]; return { l, v: v.total, t: `${n0(v.total)}${v.public ? ` · ${pct(100 * v.public / v.total, 0)} public` : ""}` }; }));
  } else empty("#ed-eff");
  if (c) bars($("#ed-cout"), E.labels.cout.filter(([k]) => c.eur[k]).map(([k, l]) => ({ l, v: c.eur[k], t: `${n0(c.eur[k])} €` })), {}); else empty("#ed-cout");
  lineChart($("#ed-dip"), E.diplomes, [{ k: "sup", l: "Diplômés du supérieur (25-64 ans)", c: "#16a34a" }, { k: "sup_jeunes", l: "… parmi les 25-34 ans", c: "#16a34a", dash: "5 3" },
    { k: "bas", l: "Sans diplôme du secondaire (25-64 ans)", c: "#dc2626" }], { vfmt: v => pct(v), yfmt: v => v + " %", h: 240 });
  legend("#ed-dip-legend", [["Diplômés du supérieur (25-64 ans)", "#16a34a"], ["… parmi les 25-34 ans", "#16a34a", true], ["Sans diplôme du secondaire", "#dc2626"]]);
  table($("#ed-cmp"), "ed", [
    { k: "sup", l: "Diplômés du supérieur (25-64)", f: r => r.education?.sup, fmt: v => pct(v, 0), max: 60, c: "#16a34a" },
    { k: "jeu", l: "… 25-34 ans", f: r => r.education?.sup_jeunes, fmt: v => pct(v, 0), max: 70, c: "#84cc16" },
    { k: "bas", l: "Sans diplôme du secondaire", f: r => r.education?.bas, fmt: v => pct(v, 0), max: 50, c: "#dc2626" },
    { k: "sec", l: "Coût / lycéen (SPA)", f: r => r.education?.cout_sec, fmt: v => n0(v), max: 20000, c: "#64748b" },
  ], "sup");
}

/* ---------------------------------------------------------------- logement */
function logement() {
  const { kpis, lineChart, legend, n1, pct, css, esc, showTip, hideTip } = T();
  const L = D()?.logement; if (!L) { kpis("#lo-kpis", []); empty("#lo-statut"); return; }
  const s = lastOf(L.statut, "proprio"), p = L.prix.at(-1);
  kpis("#lo-kpis", [
    s && [pct((s.proprio || 0) + (s.proprio_credit || 0), 0), `de la population vit dans un logement dont elle est propriétaire (${s.annee})`],
    s?.pieces && [n1(s.pieces), `pièces par personne (${n1(s.pieces_proprio)} chez les propriétaires, ${n1(s.pieces_loc)} chez les locataires)`],
    s?.surpeuplement != null && [pct(s.surpeuplement), "vivent dans un logement surpeuplé"],
    s?.sous_occupation != null && [pct(s.sous_occupation, 0), "vivent dans un logement sous-occupé (pièces en trop)"],
    s?.surcout != null && [pct(s.surcout), "consacrent plus de 40 % de leur revenu au logement"],
    p && [(p.logement >= 100 ? "+" : "") + n1(p.logement - 100) + " %", `prix des logements depuis 2015 (inflation : ${p.prix_conso ? "+" + n1(p.prix_conso - 100) + " %" : "–"})`],
  ]);
  if (s) {
    const parts = [["proprio", "Propriétaires sans crédit", "#166534"], ["proprio_credit", "Propriétaires avec crédit", "#22c55e"], ["loc_marche", "Locataires au prix du marché", "#f59e0b"], ["loc_social", "Locataires à loyer réduit (HLM, logé gratuitement…)", "#3b6fd6"]];
    $("#lo-statut").innerHTML = `<div class="cmp">${L.statut.filter(x => x.proprio != null).map(x => `<div class="cmp-row"><span class="cmp-name">${x.annee}</span><span class="cmp-stack" style="width:100%">${parts.map(([k, l, c]) => x[k] ? `<span style="flex:${x[k]} 0 0;background:${c}" data-t="${esc(l)} : ${pct(x[k])}"></span>` : "").join("")}</span><span class="cmp-val">${pct((x.proprio || 0) + (x.proprio_credit || 0), 0)} propr.</span></div>`).join("")}</div>`;
    $("#lo-statut").querySelectorAll("[data-t]").forEach(sp => { sp.onpointermove = ev => showTip(sp.dataset.t, ev); sp.onpointerleave = hideTip; });
    legend("#lo-statut-legend", parts.map(([, l, c]) => [l, c]));
  } else empty("#lo-statut");
  if (L.prix.length) { lineChart($("#lo-prix"), L.prix, [{ k: "logement", l: "Prix des logements", c: "#dc2626" }, { k: "prix_conso", l: "Prix à la consommation", c: css("--ink"), dash: "5 3" }], { vfmt: v => n1(v), h: 240 });
    legend("#lo-prix-legend", [["Prix des logements (base 100 en 2015)", "#dc2626"], ["Prix à la consommation (inflation)", css("--ink"), true]]); } else empty("#lo-prix");
  table($("#lo-cmp"), "lo", [
    { k: "pro", l: "Propriétaires", f: r => r.logement?.proprio, fmt: v => pct(v, 0), max: 100, c: "#166534" },
    { k: "pie", l: "Pièces / personne", f: r => r.logement?.pieces, fmt: v => n1(v), max: 2.5, c: "#64748b" },
    { k: "sur", l: "Surpeuplement", f: r => r.logement?.surpeuplement, fmt: v => pct(v, 0), max: 50, c: "#dc2626" },
    { k: "cou", l: "Coût > 40 % du revenu", f: r => r.logement?.surcout, fmt: v => pct(v), max: 20, c: "#f59e0b" },
    { k: "prx", l: "Prix depuis 2015", f: r => r.logement?.prix_2015 ? r.logement.prix_2015 - 100 : null, fmt: v => (v > 0 ? "+" : "") + n1(v) + " %", max: 150, c: "#dc2626" },
  ], "pro");
}

/* ---------------------------------------------------------------- transports */
function transports() {
  const { kpis, areaChart, lineChart, legend, n0, n1, pct } = T();
  const R = D()?.transports; if (!R) { kpis("#tr2-kpis", []); empty("#tr2-modal"); return; }
  const m = lastOf(R.modal, "voiture"), f = lastOf(R.fret, "route"), v = lastOf(R.volumes, "train_gpkm"), a = lastOf(R.volumes, "avion_mpas"), c = lastOf(R.volumes, "camion_gtkm");
  kpis("#tr2-kpis", [
    m && [pct(m.voiture, 0), `des déplacements terrestres de voyageurs en voiture (${m.annee}, en km parcourus), ${pct(m.train, 0)} en train`],
    f && [pct(f.route, 0), `des marchandises transportées par la route (en tonnes-km), ${pct(f.rail, 0)} par le rail`],
    v && [n0(v.train_gpkm) + " Md", `de voyageurs-km en train en ${v.annee}`],
    a && [n0(a.avion_mpas) + " M", `de passagers aériens en ${a.annee}`],
    c && [n0(c.camion_gtkm) + " Md", `de tonnes-km par camion (pavillon national) en ${c.annee}`],
  ]);
  if (R.modal.length) { areaChart($("#tr2-modal"), R.modal, ["voiture", "bus", "train"], { voiture: "#64748b", bus: "#f59e0b", train: "#3b6fd6" }, { voiture: "Voiture", bus: "Car, bus, tram", train: "Train" }, { vfmt: v => pct(v), yfmt: v => v + " %", h: 220 });
    legend("#tr2-modal-legend", [["Voiture", "#64748b"], ["Car, bus, tram", "#f59e0b"], ["Train", "#3b6fd6"]]); } else empty("#tr2-modal");
  if (R.fret.length) { areaChart($("#tr2-fret"), R.fret, ["route", "rail", "fluvial"], { route: "#64748b", rail: "#3b6fd6", fluvial: "#0ea5e9" }, { route: "Route", rail: "Rail", fluvial: "Voies navigables" }, { vfmt: v => pct(v), yfmt: v => v + " %", h: 220 });
    legend("#tr2-fret-legend", [["Route", "#64748b"], ["Rail", "#3b6fd6"], ["Voies navigables", "#0ea5e9"]]); } else empty("#tr2-fret");
  table($("#tr2-cmp"), "tr2", [
    { k: "voi", l: "Part de la voiture", f: r => r.transports?.voiture, fmt: v => pct(v, 0), max: 100, c: "#64748b" },
    { k: "tra", l: "Part du train", f: r => r.transports?.train, fmt: v => pct(v, 1), max: 20, c: "#3b6fd6" },
    { k: "frr", l: "Fret par la route", f: r => r.transports?.fret_route, fmt: v => pct(v, 0), max: 100, c: "#64748b" },
    { k: "frl", l: "Fret par le rail", f: r => r.transports?.fret_rail, fmt: v => pct(v, 0), max: 60, c: "#3b6fd6" },
  ], "tra");
}

/* ---------------------------------------------------------------- emploi */
function emploi() {
  const { kpis, lineChart, bars, legend, n0, n1, pct, css, esc, showTip, hideTip } = T();
  const E = D()?.emploi; if (!E) { kpis("#em-kpis", []); empty("#em-act"); return; }
  const a = E.activite.at(-1), t = lastOf(E.taux, "chomage"), te = lastOf(E.taux, "emploi_20_64"), st = E.statuts.at(-1);
  kpis("#em-kpis", [
    a && [n1(a.emploi / 1000) + " M", `de personnes en emploi parmi les ${n1(a.pop / 1000)} M de 15-64 ans (${a.annee})`],
    t && [pct(t.chomage), `taux de chômage, ${pct(t.chomage_jeunes, 0)} chez les moins de 25 ans`],
    te && [pct(te.emploi_20_64, 0), "des 20-64 ans ont un emploi"],
    st && a && [pct(100 * st.SELF / a.emploi, 0), "des emplois sont des indépendants (artisans, commerçants, professions libérales, agriculteurs…)"],
  ]);
  if (a) {
    const parts = [["emploi", "En emploi", "#16a34a"], ["chomage", "Au chômage", "#dc2626"], ["inactifs", "Inactifs (études, retraite, foyer…)", "#a8a29e"]];
    $("#em-act").innerHTML = `<div class="cmp">${E.activite.filter((x, i, arr) => +x.annee % 5 === 0 || i === arr.length - 1).map(x => `<div class="cmp-row"><span class="cmp-name">${x.annee}</span><span class="cmp-stack" style="width:100%">${parts.map(([k, l, c]) => x[k] ? `<span style="flex:${x[k]} 0 0;background:${c}" data-t="${esc(l)} : ${n1(x[k] / 1000)} M (${pct(100 * x[k] / x.pop, 0)})"></span>` : "").join("")}</span><span class="cmp-val">${n1(x.pop / 1000)} M</span></div>`).join("")}</div>`;
    $("#em-act").querySelectorAll("[data-t]").forEach(sp => { sp.onpointermove = ev => showTip(sp.dataset.t, ev); sp.onpointerleave = hideTip; });
    legend("#em-act-legend", parts.map(([, l, c]) => [l, c]));
  }
  lineChart($("#em-taux"), E.taux, [{ k: "chomage", l: "Taux de chômage", c: "#dc2626" }, { k: "chomage_jeunes", l: "Chômage des moins de 25 ans", c: "#dc2626", dash: "5 3" }, { k: "emploi_20_64", l: "Taux d'emploi des 20-64 ans", c: "#16a34a" }],
    { vfmt: v => pct(v), yfmt: v => v + " %", h: 240 });
  legend("#em-taux-legend", [["Taux de chômage", "#dc2626"], ["Chômage des moins de 25 ans", "#dc2626", true], ["Taux d'emploi des 20-64 ans", "#16a34a"]]);
  if (E.metiers) { const M = E.metiers; bars($("#em-met"), E.labels.metiers.filter(([k]) => M.metiers[k]).map(([k, l]) => ({ l, v: M.metiers[k], t: `${n1(M.metiers[k] / 1000)} M · ${pct(100 * M.metiers[k] / M.total, 0)}` })).sort((a, b) => b.v - a.v)); }
  else empty("#em-met");
  table($("#em-cmp"), "em", [
    { k: "emp", l: "Taux d'emploi 20-64 ans", f: r => r.emploi?.emploi, fmt: v => pct(v, 0), max: 90, c: "#16a34a" },
    { k: "cho", l: "Chômage", f: r => r.emploi?.chomage, fmt: v => pct(v), max: 15, c: "#dc2626" },
    { k: "jeu", l: "Chômage des moins de 25 ans", f: r => r.emploi?.chomage_jeunes, fmt: v => pct(v, 0), max: 40, c: "#dc2626" },
  ], "emp");
}

/* ---------------------------------------------------------------- inégalités */
function inegalites() {
  const { kpis, lineChart, legend, n0, n1, n2, pct, css, showTip, hideTip } = T();
  const I = D()?.inegalites; if (!I) { kpis("#in-kpis", []); empty("#in-dec"); return; }
  const s = lastOf(I.serie, "pauvrete"), g = lastOf(I.serie, "gini"), d = I.deciles;
  kpis("#in-kpis", [
    s && [pct(s.pauvrete), `de la population sous le seuil de pauvreté en ${s.annee} (60 % du revenu médian)`],
    s?.avant_transferts && [pct(s.avant_transferts), "le serait sans les prestations sociales (hors retraites)"],
    s?.pauvrete_enfants && [pct(s.pauvrete_enfants), "des enfants vivent sous le seuil de pauvreté"],
    g && [n1(g.gini), "indice de Gini (0 = égalité parfaite, 100 = une personne a tout)"],
    g?.d10_d1 && [n1(g.d10_d1), "fois plus de revenu pour les 10 % les plus aisés que pour les 10 % les plus modestes"],
  ]);
  if (d) {
    const el = $("#in-dec"), w = Math.max(320, el.clientWidth), h = 260, m = { t: 14, r: 10, b: 30, l: 40 };
    const x = d3.scaleBand(d.parts.map((_, i) => "D" + (i + 1)), [m.l, w - m.r]).padding(.15), y = d3.scaleLinear([0, d3.max(d.parts) * 1.1], [h - m.b, m.t]);
    const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("g").selectAll("rect").data(d.parts).join("rect").attr("x", (v, i) => x("D" + (i + 1))).attr("width", x.bandwidth()).attr("y", v => y(v)).attr("height", v => y(0) - y(v))
      .attr("fill", (v, i) => d3.interpolateHcl("#2a9d8f", "#a3245e")(i / 9))
      .on("pointermove", (ev, v) => { const i = d.parts.indexOf(v); showTip(`<b>D${i + 1}</b> : ${pct(v)} du revenu total<br>${i < 9 ? `revenu annuel jusqu'à ${n0(d.seuils[i])} € par unité de consommation` : `au-delà de ${n0(d.seuils[8])} €`}`, ev); }).on("pointerleave", hideTip);
    svg.append("g").selectAll("text").data(d.parts).join("text").attr("x", (v, i) => x("D" + (i + 1)) + x.bandwidth() / 2).attr("y", v => y(v) - 4).attr("text-anchor", "middle").attr("font-size", 11).text(v => pct(v, 0));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x));
    el.replaceChildren(svg.node());
    $("#in-dec-title").textContent = `Part du revenu disponible de chaque dixième de la population (${d.annee})`;
  } else empty("#in-dec");
  lineChart($("#in-serie"), I.serie, [{ k: "avant_transferts", l: "Pauvreté avant prestations", c: css("--muted"), dash: "5 3" }, { k: "pauvrete", l: "Pauvreté après prestations", c: "#dc2626" },
    { k: "pauvrete_enfants", l: "Pauvreté des enfants", c: "#f59e0b" }, { k: "gini", l: "Indice de Gini", c: "#3b6fd6" }], { vfmt: v => n1(v), h: 240 });
  legend("#in-serie-legend", [["Pauvreté avant prestations (%)", css("--muted"), true], ["Pauvreté après prestations (%)", "#dc2626"], ["Pauvreté des enfants (%)", "#f59e0b"], ["Indice de Gini", "#3b6fd6"]]);
  table($("#in-cmp"), "in", [
    { k: "gin", l: "Gini", f: r => r.inegalites?.gini, fmt: v => n1(v), max: 40, c: "#3b6fd6" },
    { k: "pau", l: "Taux de pauvreté", f: r => r.inegalites?.pauvrete, fmt: v => pct(v), max: 25, c: "#dc2626" },
    { k: "ava", l: "… avant prestations", f: r => r.inegalites?.avant, fmt: v => pct(v), max: 35, c: "#a8a29e" },
    { k: "rap", l: "D10 / D1", f: r => r.inegalites?.d10_d1, fmt: v => n1(v), max: 12, c: "#7c3aed" },
  ], "gin");
}

/* ---------------------------------------------------------------- déchets */
function dechets() {
  const { kpis, bars, areaChart, legend, n0, n1, pct } = T();
  const W = D()?.dechets; if (!W) { kpis("#wa-kpis", []); empty("#wa-sect"); return; }
  const P = W.production, Tr = W.traitement, M = lastOf(W.menagers, "kg_hab");
  kpis("#wa-kpis", [
    P && [n0(P.total / 1e6) + " Mt", `de déchets produits en ${P.annee}, soit ${n1(P.kg_hab / 1000)} t par habitant`],
    P && P.secteurs.F && [pct(100 * P.secteurs.F / P.total, 0), "viennent du BTP (terres, gravats)"],
    M && [n0(M.kg_hab) + " kg", `de déchets ménagers par habitant en ${M.annee}`],
    Tr && [pct(100 * (Tr.modes.RCV_R || 0) / Tr.total, 0), "des déchets traités sont recyclés"],
    Tr && [pct(100 * (Tr.modes.DSP_L || 0) / Tr.total, 0), "finissent en décharge"],
  ]);
  if (P) bars($("#wa-sect"), W.labels.secteurs.filter(([k]) => P.secteurs[k]).map(([k, l]) => ({ l, v: P.secteurs[k], t: `${n1(P.secteurs[k] / 1e6)} Mt · ${pct(100 * P.secteurs[k] / P.total, 0)}` })).sort((a, b) => b.v - a.v)); else empty("#wa-sect");
  if (Tr) bars($("#wa-trt"), W.labels.modes.filter(([k]) => Tr.modes[k]).map(([k, l, c]) => ({ l, v: Tr.modes[k], t: `${n1(Tr.modes[k] / 1e6)} Mt · ${pct(100 * Tr.modes[k] / Tr.total, 0)}`, c })).sort((a, b) => b.v - a.v)); else empty("#wa-trt");
  if (W.menagers.length) {
    areaChart($("#wa-men"), W.menagers.filter(x => x.recyclage != null), ["recyclage", "compost", "incineration", "decharge"],
      { recyclage: "#16a34a", compost: "#84cc16", incineration: "#f97316", decharge: "#78716c" }, { recyclage: "Recyclage", compost: "Compostage", incineration: "Incinération", decharge: "Décharge" },
      { lines: [{ k: "kg_hab", l: "Total produit", c: T().css("--ink") }], vfmt: v => n0(v) + " kg", yfmt: v => v + " kg", h: 240 });
    legend("#wa-men-legend", [["Recyclage", "#16a34a"], ["Compostage", "#84cc16"], ["Incinération", "#f97316"], ["Décharge", "#78716c"], ["Total produit", T().css("--ink")]]);
  }
  table($("#wa-cmp"), "wa", [
    { k: "men", l: "Déchets ménagers / hab.", f: r => r.dechets?.menagers, fmt: v => n0(v) + " kg", max: 900, c: "#78716c" },
    { k: "rec", l: "Part recyclée (tous déchets)", f: r => r.dechets?.recyclage, fmt: v => pct(v, 0), max: 100, c: "#16a34a" },
    { k: "dec", l: "Part en décharge", f: r => r.dechets?.decharge, fmt: v => pct(v, 0), max: 100, c: "#dc2626" },
  ], "men");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
