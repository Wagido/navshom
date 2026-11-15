/* Comptes de la France : rendu des graphiques à partir de data/finances.json */
(() => {
"use strict";

const $ = s => document.querySelector(s);
const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const md = v => (Math.abs(v) >= 1000 ? nf0.format(v) : nf1.format(v)) + " Md€";
const pct = (v, d = 1) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v) + " %";
const eur = v => nf0.format(v) + " €";
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------------------------------------------------------------- infobulle */
const tip = $("#tip");
function showTip(html, ev) {
  tip.innerHTML = html; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
  tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
}
const hideTip = () => { tip.hidden = true; };
document.addEventListener("scroll", hideTip, { passive: true });

/* ---------------------------------------------------------------- utilitaires */
function fillSelect(sel, years, def) {
  sel.innerHTML = years.map(y => `<option${y === def ? " selected" : ""}>${y}</option>`).join("");
}
function kpis(el, items) {
  el.innerHTML = items.map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
}
function barList(el, items, total, opts = {}) {
  const max = opts.max ?? d3.max(items, d => Math.abs(d.v));
  el.innerHTML = `<div class="bars">${items.map(d => `
    <div class="bar-row">
      <span class="lab">${esc(d.label)}</span>
      <span class="val">${md(d.v)}${total ? ` · ${pct(100 * d.v / total)}` : ""}</span>
      <span class="track"><span class="fill${d.v < 0 ? " neg" : ""}" style="width:${(100 * Math.abs(d.v) / max).toFixed(2)}%;${d.color ? `background:${d.color}` : ""}"></span></span>
    </div>`).join("")}</div>`;
}

let DATA, CMP, GEO = "FR";
const CACHE = {};
const C = () => CACHE[GEO];
Promise.all([fetch("data/finances.json").then(r => r.json()), fetch("data/comparaison.json").then(r => r.json())])
  .then(([d, c]) => { DATA = d; CMP = c; CACHE.FR = { nom: "France", pib: d.pib, historique: d.historique, interets: d.interets, fonctions_hist: d.fonctions_hist, simulateur: d.simulateur }; init(); })
  .catch(e => { document.querySelector("main").insertAdjacentHTML("afterbegin", `<p class="panel">Impossible de charger les données (${esc(e.message)}).</p>`); });

function init() {
  const sel = $("#geo");
  const pays = [...CMP.pays].sort((a, b) => a.code === "FR" ? -1 : b.code === "FR" ? 1 : a.nom.localeCompare(b.nom, "fr"));
  sel.innerHTML = pays.map(p => `<option value="${p.code}">${esc(p.nom)}</option>`).join("");
  try { const g = localStorage.getItem("geo"); if (g && pays.some(p => p.code === g)) sel.value = g; } catch (e) {}
  sel.onchange = () => setGeo(sel.value);
  initCompare();
  initPib();
  initSankey();
  initSimu();
  initBilan();
  drawInterets(); drawFonctions();
  if (sel.value !== "FR") setGeo(sel.value);
  $("#gen-date").textContent = `Données générées le ${new Date(DATA.genere_le).toLocaleDateString("fr-FR", { dateStyle: "long" })}.`;
  // onglet actif selon la section visible
  const links = [...document.querySelectorAll(".tabs a")];
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id));
  }), { rootMargin: "-40% 0px -55% 0px" });
  document.querySelectorAll("section.panel").forEach(s => io.observe(s));
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { drawSankey(); drawSimu(); drawHisto(); drawBilan(); drawInterets(); drawFonctions(); }, 150); });
  document.querySelectorAll(".geo-tag").forEach(t => t.textContent = "France");
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { drawSankey(); drawSimu(); drawHisto(); drawBilan(); drawInterets(); drawFonctions(); });
}

async function setGeo(g) {
  if (!CACHE[g]) {
    try { CACHE[g] = await fetch(`data/pays/${g}.json`).then(r => r.json()); }
    catch (e) { return; }
  }
  GEO = g;
  try { localStorage.setItem("geo", g); } catch (e) {}
  $("#geo").value = g;
  document.querySelectorAll(".geo-tag").forEach(t => t.textContent = C().nom);
  fnOnly = null;
  initPib(); resetSimu(); drawInterets(); drawFonctions(); drawCompare();
  document.dispatchEvent(new CustomEvent("geochange", { detail: g }));
}

/* ================================================================= PIB */
function initPib() {
  const years = Object.keys(C().pib).sort();
  const sel = $("#pib-year");
  fillSelect(sel, years, years.at(-1));
  sel.onchange = drawPib;
  sel.disabled = !years.length;
  drawPib();
  drawHisto();
}

function drawPib() {
  const body = $("#pib-body");
  if (!Object.keys(C().pib).length) {
    $("#pib-kpis").innerHTML = `<p class="empty">Eurostat ne publie pas la valeur ajoutée par secteur pour ${esc(C().nom)} : la décomposition du PIB n'est pas disponible.</p>`;
    body.hidden = true; return;
  }
  body.hidden = false;
  const y = $("#pib-year").value, P = C().pib[y], prev = C().pib[String(+y - 1)];
  const parHab = P.pib * 1e9 / P.population;
  kpis($("#pib-kpis"), [
    [md(P.pib), `PIB ${y}`],
    [eur(parHab), "par habitant"],
    [prev ? (P.pib >= prev.pib ? "+" : "") + pct(100 * (P.pib / prev.pib - 1)) : "–", "évolution sur un an (prix courants, inflation comprise)"],
    [P.dette_maastricht_pct ? pct(P.dette_maastricht_pct) : "–", "dette publique en % du PIB"],
  ]);

  // --- cascade
  const CAS = P.cascade;
  let run = 0;
  const rows = CAS.map(c => {
    let from, to;
    if (c.type === "total") { from = 0; to = c.v; run = c.v; }
    else { from = run + c.v; to = run; run = from; }
    return { ...c, from, to };
  });
  const max = P.pib;
  $("#cascade").innerHTML = `<div class="cascade">${rows.map((r, i) => `
    <div class="cas-row${r.type === "total" ? " tot" : ""}" data-i="${i}">
      <span class="cas-lab">${r.note ? `<sup>${i}</sup> ` : ""}${esc(r.label)}</span>
      <span class="cas-track"><span class="cas-bar" style="left:${(100 * Math.min(r.from, r.to) / max).toFixed(2)}%;width:${(100 * Math.abs(r.to - r.from) / max).toFixed(2)}%"></span></span>
      <span class="cas-val">${r.type === "total" ? md(r.v) : "− " + md(-r.v)} <small>${pct(100 * Math.abs(r.v) / P.pib, 0)}</small></span>
    </div>`).join("")}</div>`;
  $("#cascade-notes").innerHTML = rows.map((r, i) => r.note ? `<li value="${i}"><b>${esc(r.label)}.</b> ${esc(r.note)}</li>` : "").join("");

  // --- achats publics
  const ach = P.achats_publics, tot = d3.sum(ach, d => d.v);
  barList($("#achats"), ach, P.pib, { max: P.pib * 0.1 });
  $("#achats").insertAdjacentHTML("beforeend", `<p class="muted" style="font-size:.88rem;margin:8px 0 0">Total : <b>${md(tot)}</b>, soit ${pct(100 * tot / P.pib)} du PIB, à rapprocher des ${md(CAS.at(-1).v)} de valeur ajoutée nette vendue.</p>`);

  // --- trois optiques
  const pal = d3.schemeTableau10;
  barList($("#pib-production"), P.production.map((d, i) => ({ ...d, color: pal[i] })), P.pib, { max: P.pib * 0.55 });
  barList($("#pib-demande"), P.demande.map((d, i) => ({ ...d, color: pal[i] })), P.pib, { max: P.pib * 0.55 });
  barList($("#pib-revenus"), P.revenus.map((d, i) => ({ ...d, color: pal[i + 3] })), P.pib, { max: P.pib * 0.55 });
  const vaTot = d3.sum(P.branches, d => d.v);
  barList($("#pib-branches"), [...P.branches].sort((a, b) => b.v - a.v), vaTot);
  $("#pib-branches").insertAdjacentHTML("beforeend", `<p class="muted" style="font-size:.85rem;margin:8px 0 0">Pourcentages de la valeur ajoutée totale (${md(vaTot)}, soit le PIB moins les impôts nets sur les produits).</p>`);
}

function drawHisto() {
  const el = $("#pib-histo"); if (!DATA) return;
  const H = C().historique.map(d => ({ ...d, dep: 100 * d.depenses / d.pib, rec: 100 * d.recettes / d.pib }));
  const w = Math.max(320, el.clientWidth), h = 260, m = { t: 16, r: 54, b: 26, l: 40 };
  const x = d3.scalePoint(H.map(d => d.annee), [m.l, w - m.r]).padding(.3);
  const lo = d3.min(H, d => Math.min(d.dep, d.rec)), hi = d3.max(H, d => Math.max(d.dep, d.rec));
  const y = d3.scaleLinear([Math.floor((lo - 3) / 5) * 5, Math.ceil((hi + 3) / 5) * 5], [h - m.b, m.t]);
  const dMax = d3.max(H, d => d.dette_pct) || 100;
  const y2 = d3.scaleLinear([0, Math.ceil(dMax * 1.1 / 10) * 10], [h - m.b, m.t]);
  const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`);
  svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(5)).join("line")
    .attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickSizeOuter(0).tickValues(H.map(d => d.annee).filter(a => +a % (w < 560 ? 10 : 5) === 0)));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => d + " %")).call(g => g.select(".domain").remove());
  svg.append("g").attr("class", "axis").attr("transform", `translate(${w - m.r},0)`).call(d3.axisRight(y2).ticks(5).tickFormat(d => d + " %")).call(g => g.select(".domain").remove());
  const series = [
    { k: "dep", lab: "Dépenses publiques (% PIB, axe gauche)", c: css("--neg"), s: y },
    { k: "rec", lab: "Recettes publiques (% PIB, axe gauche)", c: css("--pos"), s: y },
    { k: "dette_pct", lab: "Dette publique (% PIB, axe droit)", c: css("--accent"), s: y2, dash: "5 4" },
  ];
  for (const s of series) {
    svg.append("path").attr("fill", "none").attr("stroke", s.c).attr("stroke-width", 2.2).attr("stroke-dasharray", s.dash || null)
      .attr("d", d3.line().x(d => x(d.annee)).y(d => s.s(d[s.k]))(H.filter(d => d[s.k] != null)));
    svg.append("g").selectAll("circle").data(H.filter(d => d[s.k] != null)).join("circle")
      .attr("cx", d => x(d.annee)).attr("cy", d => s.s(d[s.k])).attr("r", 3.2).attr("fill", s.c)
      .on("pointermove", (ev, d) => showTip(`<b>${d.annee}</b><br>${s.lab.split(" (")[0]} : ${pct(d[s.k])}${s.k !== "dette_pct" ? `<br>${md(s.k === "dep" ? d.depenses : d.recettes)}` : ""}`, ev))
      .on("pointerleave", hideTip);
  }
  el.replaceChildren(svg.node());
  el.insertAdjacentHTML("beforeend", `<div class="legend-row">${series.map(s => `<span><i style="border-top-color:${s.c};opacity:1;${s.dash ? "border-top-style:dashed" : ""}"></i>${s.lab}</span>`).join("")}</div>`);
}

/* ================================================================= SANKEY */
let skUnit = "md", skLocked = null;
const APU_COL = { s_C: "#3b6fd6", s_SS: "#8e5bd0", s_L: "#e08a2c" };
const INSTR_COL = {
  i_cotisations: "#4e79a7", i_csg: "#76b7b2", i_ir: "#59a14f", i_is: "#8cd17d", i_tva: "#e15759",
  i_accises: "#ff9d9a", i_prod: "#b07aa1", i_patrimoine: "#d4a6c8", i_autres: "#9d9a96", i_emprunt: "#d7a32a",
};
const FUNC_PAL = ["#3b6fd6", "#e15759", "#f28e2b", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#5aa469", "#6b6ecf", "#8c564b", "#7f7f7f", "#d7a32a"];
const decColor = d3.interpolateHcl("#2a9d8f", "#a3245e");

function initSankey() {
  const years = Object.keys(DATA.sankey).sort();
  fillSelect($("#sk-year"), years, years.at(-1));
  $("#sk-year").onchange = () => { skLocked = null; drawSankey(); };
  document.querySelectorAll("#sk-unit button").forEach(b => b.onclick = () => {
    skUnit = b.dataset.u;
    document.querySelectorAll("#sk-unit button").forEach(o => o.setAttribute("aria-pressed", o === b));
    drawSankey();
  });
  drawSankey();
}

function skFmt(v, S) {
  if (skUnit === "pib") return pct(100 * v / S.pib, 2) + " du PIB";
  if (skUnit === "hab") return eur(v * 1e9 / S.population) + " / hab.";
  return md(v);
}
function skFmtShort(v, S) {
  if (skUnit === "pib") return pct(100 * v / S.pib, 1);
  if (skUnit === "hab") return eur(v * 1e9 / S.population);
  return md(v);
}

function nodeColor(n) {
  if (n.kind === "decile") return decColor((+n.id.slice(1) - 1) / 9);
  if (n.kind === "instrument") return INSTR_COL[n.id];
  if (n.kind === "apu") return APU_COL[n.id];
  if (n.kind === "fonction") return n._c;
  if (n.kind === "futur") return INSTR_COL.i_emprunt;
  return "#9d9a96";
}

function drawSankey() {
  if (!DATA) return;
  const y = $("#sk-year").value, S = DATA.sankey[y];
  const el = $("#sankey");
  kpis($("#sk-kpis"), [
    [skFmtShort(S.depenses, S), `dépenses publiques ${y}`],
    [pct(100 * S.depenses / S.pib), "des richesses produites (PIB)"],
    [skFmtShort(S.recettes, S), "recettes (impôts, cotisations, autres)"],
    [skFmtShort(S.deficit, S), "financés par l'emprunt"],
  ]);
  document.documentElement.style.setProperty("--d1", decColor(0));
  document.documentElement.style.setProperty("--d10", decColor(1));

  const W = 1220, H = 820, top = 26;
  let fi = 0;
  const nodes = S.nodes.map(n => ({ ...n, _c: n.kind === "fonction" ? FUNC_PAL[fi++ % FUNC_PAL.length] : null }));
  const links = S.links.map(l => ({ ...l }));
  const sk = d3.sankey().nodeId(d => d.id).nodeAlign(n => n.col).nodeSort(null)
    .nodeWidth(12).nodePadding(7).extent([[1, top], [W - 100, H - 4]]);
  const G = sk({ nodes, links });

  const svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
    .attr("aria-label", `Diagramme des flux de l'argent public en ${y}`);
  const defs = svg.append("defs");

  const heads = ["Qui paie", "Comment", "À qui", "", "Pour quoi", "Qui reçoit"];
  const colX = d3.rollup(G.nodes, v => v[0].x0, d => d.col);
  svg.append("g").selectAll("text").data([...colX]).join("text").attr("class", "colhead")
    .attr("x", ([c, x]) => x).attr("y", 12)
    .text(([c]) => c === 2 ? "À qui (qui collecte et dépense)" : heads[c]);

  G.links.forEach((l, i) => {
    const id = `g${i}`;
    const gr = defs.append("linearGradient").attr("id", id).attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", l.source.x1).attr("x2", l.target.x0);
    gr.append("stop").attr("offset", "0%").attr("stop-color", nodeColor(l.source));
    gr.append("stop").attr("offset", "100%").attr("stop-color", nodeColor(l.target));
    l._g = id;
  });

  const link = svg.append("g").selectAll("path").data(G.links).join("path")
    .attr("class", "link").attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke", d => `url(#${d._g})`).attr("stroke-width", d => Math.max(1, d.width))
    .attr("stroke-dasharray", d => d.kind === "dette" || d.kind === "transfert" ? "5 3" : null)
    .on("pointermove", (ev, d) => showTip(`<b>${esc(d.source.label)} → ${esc(d.target.label)}</b><br>${skFmt(d.value, S)}${skUnit !== "md" ? ` (${md(d.value)})` : ""}${d.kind === "transfert" ? "<br><i>Dotations et transferts nets entre administrations</i>" : ""}`, ev))
    .on("pointerleave", hideTip);

  const node = svg.append("g").selectAll("g").data(G.nodes).join("g").attr("class", "node");
  node.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => d.x1 - d.x0)
    .attr("height", d => Math.max(1, d.y1 - d.y0)).attr("fill", nodeColor)
    .attr("stroke", d => d.kind === "futur" ? css("--ink") : null).attr("stroke-dasharray", d => d.kind === "futur" ? "3 2" : null);
  const lab = node.append("text")
    .attr("x", d => d.x1 + 6)
    .attr("y", d => (d.y0 + d.y1) / 2)
    .attr("dy", d => (d.y1 - d.y0) > 24 ? "-0.15em" : "0.35em");
  lab.append("tspan").text(d => d.label + ((d.y1 - d.y0) > 24 ? "" : "  "));
  lab.append("tspan").attr("class", "amt")
    .attr("x", d => (d.y1 - d.y0) > 24 ? d.x1 + 6 : null)
    .attr("dy", d => (d.y1 - d.y0) > 24 ? "1.15em" : null)
    .text(d => (d.y1 - d.y0) > 9 ? skFmtShort(d.value, S) : "");

  // bilan payé / reçu par tranche
  const paid = {}, got = {};
  G.links.forEach(l => {
    if (/^p\d+$/.test(l.source.id)) paid[l.source.id.slice(1)] = (paid[l.source.id.slice(1)] || 0) + l.value;
    if (/^r\d+$/.test(l.target.id)) got[l.target.id.slice(1)] = (got[l.target.id.slice(1)] || 0) + l.value;
  });
  const decTip = d => {
    const k = d.id.slice(1), p = paid[k] || 0, g = got[k] || 0, net = g - p;
    return `<br>Paie : ${skFmt(p, S)}<br>Reçoit : ${skFmt(g, S)}<br><b>Solde : ${net >= 0 ? "+" : "−"}${skFmt(Math.abs(net), S)}</b><br><i>${k === "1" ? "Les 10 % les plus modestes" : k === "10" ? "Les 10 % les plus aisés" : `${(+k - 1) * 10} à ${k * 10} % des niveaux de vie`}</i>`;
  };
  const nodeTip = d => {
    let h = `<b>${esc(d.label)}</b><br>${skFmt(d.value, S)}${skUnit !== "md" ? ` (${md(d.value)})` : ""}`;
    if (d.kind === "decile") h += decTip(d);
    else {
      const outs = [...d.sourceLinks].sort((a, b) => b.value - a.value).slice(0, 5);
      if (outs.length && d.col > 0) h += "<br>" + outs.map(l => `→ ${esc(l.target.label)} : ${skFmtShort(l.value, S)}`).join("<br>");
    }
    return h;
  };

  function highlight(d) {
    if (!d) { link.classed("dim", false).classed("hi", false); node.classed("dim", false); return; }
    const set = new Set([...d.sourceLinks, ...d.targetLinks]);
    const nset = new Set([d]); set.forEach(l => { nset.add(l.source); nset.add(l.target); });
    link.classed("dim", l => !set.has(l)).classed("hi", l => set.has(l));
    node.classed("dim", n => !nset.has(n));
  }
  node.on("pointerenter", (ev, d) => { if (!skLocked) highlight(d); })
    .on("pointermove", (ev, d) => showTip(nodeTip(d), ev))
    .on("pointerleave", () => { hideTip(); if (!skLocked) highlight(null); })
    .on("click", (ev, d) => { ev.stopPropagation(); skLocked = skLocked === d.id ? null : d.id; highlight(skLocked ? d : null); });
  svg.on("click", () => { skLocked = null; highlight(null); });
  if (skLocked) highlight(G.nodes.find(n => n.id === skLocked));

  el.replaceChildren(svg.node());

  $("#sk-legend").innerHTML = `<span><i class="ramp"></i>Tranches de niveau de vie, des 10 % les plus modestes (D1) aux 10 % les plus aisés (D10)</span>
    <span><i class="dash"></i>Emprunt et transferts entre administrations</span>`;
  const t = S.transferts;
  const COLLECTIF = new Set(["f_economie", "f_cadre", "f_defense", "f_securite", "f_services"]);
  const fn = G.nodes.filter(n => n.kind === "fonction");
  const interets = d3.sum(fn.filter(n => n.id === "f_dette"), n => n.value);
  const indiv = d3.sum(fn.filter(n => n.id !== "f_dette" && !COLLECTIF.has(n.id)), n => n.value);
  $("#sk-explain").innerHTML = `<p>En ${y}, les administrations publiques ont dépensé <b>${md(S.depenses)}</b>, soit <b>${pct(100 * S.depenses / S.pib)}</b> du PIB et <b>${eur(S.depenses * 1e9 / S.population)}</b> par habitant. Les impôts et cotisations, plus les recettes non fiscales, en ont couvert ${md(S.recettes)}. Le reste, <b>${md(S.deficit)}</b>, a été emprunté : c'est le bloc « Générations futures ».</p>
    <p>L'État reverse en net ${md(t.vers_collectivites)} aux collectivités locales${t.vers_secu > 0.5 ? ` et ${md(t.vers_secu)} à la Sécurité sociale` : ""}. Une partie de la TVA va directement à la Sécurité sociale et aux collectivités : elle apparaît comme leur recette propre.</p>
    <p>Ces ${pct(100 * S.depenses / S.pib, 0)} du PIB ne disparaissent pas : <b>${pct(100 * indiv / S.depenses, 0)}</b> reviennent directement aux ménages, en argent (retraites, chômage, allocations) ou en nature (soins, école, culture). Le reste finance des services collectifs (${pct(100 * (S.depenses - indiv - interets) / S.depenses, 0)}) et les intérêts de la dette (${pct(100 * interets / S.depenses, 0)}). Le solde payé/reçu de chaque tranche s'affiche au survol des blocs de gauche et de droite.</p>`;
}

/* ================================================================= SIMULATEUR */
function simuOf() {
  if (C().simulateur) return C().simulateur;
  const h = C().historique.at(-1);
  return { annee: h.annee, dette_pct: null, prelevements_pct: Math.round(100 * h.recettes / h.pib), manque: true };
}
function resetSimu() {
  const S = simuOf();
  $("#s-b").value = Math.round(S.dette_pct ?? 60); $("#s-t").value = S.prelevements_pct ?? 40; $("#s-m").value = 0.8; $("#s-cut").value = 40;
  drawSimu();
}
function initSimu() {
  ["#s-cut", "#s-m", "#s-b", "#s-t"].forEach(s => $(s).oninput = drawSimu);
  $("#s-reset").onclick = resetSimu;
  resetSimu();
}

function drawSimu() {
  if (!DATA) return;
  const S = simuOf();
  const hist = C().historique.find(h => h.annee === S.annee) || C().historique.at(-1);
  const P = { pib: hist.pib };
  const cut = +$("#s-cut").value, m = +$("#s-m").value, b = +$("#s-b").value / 100, t = +$("#s-t").value / 100;
  $("#o-cut").textContent = md(cut);
  $("#o-m").textContent = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(m);
  $("#o-b").textContent = pct(b * 100, 0); $("#o-t").textContent = pct(t * 100, 1);
  const Y = P.pib, B = b * Y;
  const dY = -m * cut, dRec = -t * m * cut, dDebt = -(cut + dRec);
  const r0 = B / Y, r1 = (B + dDebt) / (Y + dY);
  const thr = 1 / (b + t), up = r1 > r0 + 1e-9;
  $("#simu-result").innerHTML = (S.manque ? `<p class="empty" style="margin:0 0 6px">Dette publique non publiée par Eurostat pour ce pays : réglez-la avec le curseur.</p>` : "") + `<div class="verdict ${up ? "up" : "down"}">${up ? "La coupe fait MONTER le ratio dette/PIB" : "La coupe fait baisser le ratio dette/PIB"}</div>
    <p style="margin:0 0 8px">Seuil : m* = 1 / (${nf1.format(b * 100)} % + ${nf1.format(t * 100)} %) = <b>${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(thr)}</b>. Avec m = ${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(m)}, on est ${m > thr ? "au-dessus" : "en dessous"}.</p>
    <table>
      <tr><td>Dépenses publiques</td><td>− ${md(cut)}</td></tr>
      <tr><td>PIB (première année)</td><td>${dY ? "− " : ""}${md(-dY)} (${pct(100 * dY / Y, 2)})</td></tr>
      <tr><td>Impôts et cotisations perdus</td><td>${dRec ? "− " : ""}${md(-dRec)}</td></tr>
      <tr><td>Baisse réelle de la dette</td><td>− ${md(-dDebt)}</td></tr>
      <tr><td>Dette / PIB</td><td>${pct(100 * r0, 2)} → <b>${pct(100 * r1, 2)}</b></td></tr>
    </table>`;

  const el = $("#simu-chart");
  const w = Math.max(300, el.clientWidth), h = 300, mg = { t: 14, r: 14, b: 40, l: 44 };
  const x = d3.scaleLinear([20, 200], [mg.l, w - mg.r]), yy = d3.scaleLinear([0, 2], [h - mg.b, mg.t]);
  const pts = d3.range(20, 201, 2).map(v => [v, Math.min(2, 1 / (v / 100 + t))]);
  const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`);
  svg.append("path").attr("fill", css("--neg")).attr("opacity", .12)
    .attr("d", d3.area().x(d => x(d[0])).y0(yy(2)).y1(d => yy(d[1]))(pts));
  svg.append("path").attr("fill", css("--pos")).attr("opacity", .12)
    .attr("d", d3.area().x(d => x(d[0])).y0(yy(0)).y1(d => yy(d[1]))(pts));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - mg.b})`).call(d3.axisBottom(x).ticks(w < 500 ? 5 : 9).tickFormat(d => d + " %"));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(yy).ticks(5));
  svg.append("text").attr("class", "axis").attr("x", (mg.l + w - mg.r) / 2).attr("y", h - 6).attr("text-anchor", "middle").attr("fill", css("--muted")).attr("font-size", 11).text("Dette publique (% du PIB)");
  svg.append("text").attr("transform", `translate(12,${(h - mg.b + mg.t) / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("fill", css("--muted")).attr("font-size", 11).text("Multiplicateur");
  svg.append("path").attr("fill", "none").attr("stroke", css("--ink")).attr("stroke-width", 2).attr("d", d3.line().x(d => x(d[0])).y(d => yy(d[1]))(pts));
  svg.append("text").attr("x", x(150)).attr("y", yy(1.65)).attr("text-anchor", "middle").attr("fill", css("--neg")).attr("font-size", 12).attr("font-weight", 600).text("la coupe fait monter le ratio");
  svg.append("text").attr("x", x(60)).attr("y", yy(0.2)).attr("text-anchor", "middle").attr("fill", css("--pos")).attr("font-size", 12).attr("font-weight", 600).text("la coupe fait baisser le ratio");
  svg.append("circle").attr("cx", x(Math.min(200, Math.max(20, b * 100)))).attr("cy", yy(Math.min(2, m))).attr("r", 7).attr("fill", css("--accent")).attr("stroke", css("--surface")).attr("stroke-width", 2);
  svg.append("text").attr("x", x(Math.min(200, Math.max(20, b * 100))) + 10).attr("y", yy(Math.min(2, m)) - 8).attr("font-size", 12).attr("font-weight", 650).attr("fill", css("--accent")).text(`${C().nom} ${S.annee} (hypothèse m)`);
  el.replaceChildren(svg.node());
}

/* ================================================================= SUR 30 ANS */
function drawInterets() {
  if (!DATA) return;
  const I = C().interets;
  if (!I.length) { $("#int-kpis").innerHTML = ""; $("#int-lead").textContent = "Données non disponibles pour ce pays."; $("#int-chart").replaceChildren(); return; }
  const last = I.at(-1), first = I[0];
  const dFirst = I.find(d => d.dette), mult = dFirst && last.dette ? last.dette / dFirst.dette : null;
  $("#int-lead").innerHTML = `${mult ? `Entre ${dFirst.annee} et ${last.annee}, la dette publique a été multipliée par ${nf1.format(mult)}, et les intérêts payés par ${nf1.format(last.interets / first.interets)}. ` : ""}Le <strong>taux apparent</strong> (intérêts de l'année ÷ dette de fin d'année précédente) mesure le coût moyen de la dette. Il réagit lentement aux taux du marché, car la dette se renouvelle progressivement à mesure que les anciens emprunts arrivent à échéance.`;
  const peak = I.reduce((a, b) => b.pct_recettes > a.pct_recettes ? b : a);
  const lowT = I.filter(d => d.taux_apparent != null).reduce((a, b) => (!a || b.taux_apparent < a.taux_apparent) ? b : a, null);
  kpis($("#int-kpis"), [
    [md(last.interets), `intérêts payés en ${last.annee} (${md(first.interets)} en ${first.annee})`],
    [pct(last.pct_recettes), `des recettes publiques (maximum : ${pct(peak.pct_recettes)} en ${peak.annee})`],
    [last.taux_apparent != null ? pct(last.taux_apparent, 2) : "–", lowT ? `taux apparent (minimum : ${pct(lowT.taux_apparent, 2)} en ${lowT.annee})` : "taux apparent"],
    [last.dette ? md(last.dette) : "–", `dette publique fin ${last.annee}${dFirst ? ` (${md(dFirst.dette)} en ${dFirst.annee})` : ""}`],
  ]);
  const el = $("#int-chart");
  const w = Math.max(320, el.clientWidth), h = 300, m = { t: 16, r: 46, b: 26, l: 46 };
  const x = d3.scaleBand(I.map(d => d.annee), [m.l, w - m.r]).padding(.18);
  const y = d3.scaleLinear([0, d3.max(I, d => d.interets) * 1.1], [h - m.b, m.t]).nice();
  const y2 = d3.scaleLinear([0, Math.ceil(d3.max(I, d => Math.max(d.pct_recettes, d.taux_apparent || 0)) + 0.5)], [h - m.b, m.t]);
  const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`);
  svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(5)).join("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickSizeOuter(0).tickValues(I.map(d => d.annee).filter(a => +a % (w < 560 ? 10 : 5) === 0)));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => d + " Md€")).call(g => g.select(".domain").remove());
  svg.append("g").attr("class", "axis").attr("transform", `translate(${w - m.r},0)`).call(d3.axisRight(y2).ticks(5).tickFormat(d => d + " %")).call(g => g.select(".domain").remove());
  const tipI = d => `<b>${d.annee}</b><br>Intérêts : ${md(d.interets)} (${pct(d.pct_pib, 2)} du PIB)<br>Part des recettes publiques : ${pct(d.pct_recettes, 2)}<br>Taux apparent : ${d.taux_apparent != null ? pct(d.taux_apparent, 2) : "–"}<br>Dette : ${md(d.dette)} (${pct(d.dette_pct)} du PIB)`;
  svg.append("g").selectAll("rect").data(I).join("rect")
    .attr("x", d => x(d.annee)).attr("width", x.bandwidth()).attr("y", d => y(d.interets)).attr("height", d => y(0) - y(d.interets))
    .attr("fill", css("--total")).attr("opacity", .35).attr("rx", 1.5)
    .on("pointermove", (ev, d) => showTip(tipI(d), ev)).on("pointerleave", hideTip);
  const cx = d => x(d.annee) + x.bandwidth() / 2;
  const lines = [
    { k: "pct_recettes", c: css("--neg"), lab: "Intérêts en % des recettes publiques (axe droit)" },
    { k: "taux_apparent", c: css("--accent"), lab: "Taux d'intérêt apparent de la dette (axe droit)", dash: "5 4" },
  ];
  for (const L of lines) {
    const pts = I.filter(d => d[L.k] != null);
    svg.append("path").attr("fill", "none").attr("stroke", L.c).attr("stroke-width", 2.2).attr("stroke-dasharray", L.dash || null)
      .attr("d", d3.line().x(cx).y(d => y2(d[L.k]))(pts));
  }
  // zone de survol pleine hauteur
  svg.append("g").selectAll("rect").data(I).join("rect").attr("x", d => x(d.annee)).attr("width", x.step()).attr("y", m.t).attr("height", h - m.t - m.b)
    .attr("fill", "transparent").on("pointermove", (ev, d) => showTip(tipI(d), ev)).on("pointerleave", hideTip);
  el.replaceChildren(svg.node());
  el.insertAdjacentHTML("beforeend", `<div class="legend-row"><span><i style="border-top-color:${css("--total")};opacity:.5;border-top-width:10px"></i>Intérêts payés, en Md€ courants (axe gauche)</span>${lines.map(L => `<span><i style="border-top-color:${L.c};opacity:1;${L.dash ? "border-top-style:dashed" : ""}"></i>${L.lab}</span>`).join("")}</div>`);
}

let fnOnly = null;
function drawFonctions() {
  if (!DATA) return;
  const FH = C().fonctions_hist, A = FH.annees, keys = FH.fonctions.map(f => f[0]);
  if (!A.length) { $("#fn-chart").innerHTML = `<p class="empty">Données non disponibles pour ce pays.</p>`; $("#fn-legend").innerHTML = ""; $("#fn-var").innerHTML = ""; $("#fn-var-title").textContent = ""; return; }
  const lab = Object.fromEntries(FH.fonctions);
  const col = Object.fromEntries(keys.map((k, i) => [k, FUNC_PAL[i % FUNC_PAL.length]]));
  const shown = fnOnly ? [fnOnly] : keys;
  const el = $("#fn-chart");
  const w = Math.max(320, el.clientWidth), h = 340, m = { t: 12, r: 12, b: 26, l: 42 };
  const series = d3.stack().keys(shown).value((d, k) => d.pct[k])(A);
  const x = d3.scalePoint(A.map(d => d.annee), [m.l, w - m.r]);
  const y = d3.scaleLinear([0, d3.max(series.at(-1), d => d[1]) * 1.05], [h - m.b, m.t]).nice();
  const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`);
  svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(6)).join("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
  svg.append("g").selectAll("path").data(series).join("path").attr("fill", d => col[d.key]).attr("opacity", .88)
    .attr("d", d3.area().x(d => x(d.data.annee)).y0(d => y(d[0])).y1(d => y(d[1])))
    .on("pointermove", (ev, s) => {
      const [mx] = d3.pointer(ev); const i = Math.max(0, Math.min(A.length - 1, Math.round((mx - m.l) / x.step())));
      const d = A[i]; showTip(`<b>${esc(lab[s.key])}</b> · ${d.annee}<br>${pct(d.pct[s.key], 2)} du PIB<br>${md(d.md[s.key])}`, ev);
    }).on("pointerleave", hideTip).on("click", (ev, s) => { fnOnly = fnOnly === s.key ? null : s.key; drawFonctions(); });
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickSizeOuter(0).tickValues(A.map(d => d.annee).filter(a => +a % (w < 560 ? 10 : 5) === 0)));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(d => d + " %")).call(g => g.select(".domain").remove());
  el.replaceChildren(svg.node());
  $("#fn-legend").innerHTML = keys.map(k => `<span data-k="${k}" class="${fnOnly && fnOnly !== k ? "off" : ""}"><i style="border-top-color:${col[k]}"></i>${esc(lab[k])}</span>`).join("");
  $("#fn-legend").querySelectorAll("span").forEach(sp => sp.onclick = () => { fnOnly = fnOnly === sp.dataset.k ? null : sp.dataset.k; drawFonctions(); });

  const a0 = A[0], a1 = A.at(-1);
  const tot0 = d3.sum(keys, k => a0.pct[k]), tot1 = d3.sum(keys, k => a1.pct[k]);
  $("#fn-var-title").textContent = `Variation ${a0.annee} → ${a1.annee}, en points de PIB (total : ${pct(tot0)} → ${pct(tot1)})`;
  const vars = keys.map(k => ({ label: lab[k], v: a1.pct[k] - a0.pct[k], a: a0.pct[k], b: a1.pct[k], color: col[k] })).sort((p, q) => q.v - p.v);
  const mx = d3.max(vars, d => Math.abs(d.v));
  $("#fn-var").innerHTML = `<div class="bars">${vars.map(d => `
    <div class="bar-row">
      <span class="lab">${esc(d.label)}</span>
      <span class="val">${d.v >= 0 ? "+" : "−"}${nf1.format(Math.abs(d.v)).replace(/^0,0$/, "0,0")} pt · ${pct(d.a)} → ${pct(d.b)}</span>
      <span class="track"><span class="fill" style="left:${d.v < 0 ? 50 - 50 * Math.abs(d.v) / mx : 50}%;width:${50 * Math.abs(d.v) / mx}%;background:${d.v < 0 ? css("--pos") : css("--neg")}"></span><span style="position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--muted)"></span></span>
    </div>`).join("")}</div>`;
}

/* ================================================================= COMPARAISON */
let cmpView = "cascade";
const CASC_PARTS = [
  ["reste", "Vendu à des clients (net)", "#2f8f5b"],
  ["amortissement", "Usure du capital des entreprises", "#9aa5b8"],
  ["loyers_imputes", "Loyers imputés", "#d4a6c8"],
  ["isblsm", "Associations (au coût)", "#f2b880"],
  ["apu", "Services publics (au coût)", "#3b6fd6"],
  ["impots_produits", "Impôts nets sur les produits", "#c2413a"],
];
function initCompare() {
  document.querySelectorAll("#cmp-view button").forEach(b => b.onclick = () => {
    cmpView = b.dataset.v;
    document.querySelectorAll("#cmp-view button").forEach(o => o.setAttribute("aria-pressed", o === b));
    drawCompare();
  });
  drawCompare();
}

function stackRows(rows, parts, opts) {
  // rows: [{code, nom, annee, vals:{k:v}, total, note}] ; parts: [[k,label,color]]
  const max = opts.max ?? d3.max(rows, r => d3.sum(parts, p => Math.max(0, r.vals[p[0]] || 0)));
  return `<div class="cmp">${rows.map(r => `
    <div class="cmp-row${r.code === GEO ? " me" : ""}" data-code="${r.code}">
      <span class="cmp-name">${esc(r.nom)}<small>${r.annee || ""}${r.note || ""}</small></span>
      <span class="cmp-stack" style="width:${(100 * d3.sum(parts, p => Math.max(0, r.vals[p[0]] || 0)) / max).toFixed(2)}%">${parts.map(([k, l, c]) => {
        const v = Math.max(0, r.vals[k] || 0); if (!v) return "";
        return `<span style="flex:${v} 0 0;background:${c}" data-tip="${esc(r.nom)}|${esc(l)}|${v}"></span>`; }).join("")}</span>
      <span class="cmp-val">${opts.val(r)}</span>
    </div>`).join("")}</div>`;
}

function bindStackTips(el, fmt) {
  el.querySelectorAll("[data-tip]").forEach(sp => {
    sp.onpointermove = ev => { const [n, l, v] = sp.dataset.tip.split("|"); showTip(`<b>${n}</b><br>${l} : ${fmt(+v)}`, ev); };
    sp.onpointerleave = hideTip;
  });
  el.querySelectorAll(".cmp-row").forEach(r => r.onclick = () => setGeo(r.dataset.code));
}

function legend(parts) {
  $("#cmp-legend").innerHTML = parts.map(([k, l, c]) => `<span><i style="border-top-color:${c};opacity:1;border-top-width:10px;width:14px"></i>${esc(l)}</span>`).join("");
}

function drawCompare() {
  if (!CMP) return;
  const el = $("#cmp-chart"), L = CMP.comparaison;
  if (cmpView === "cascade") {
    const rows = L.filter(c => c.pib).map(c => {
      const P = c.pib, vals = {};
      CASC_PARTS.forEach(([k]) => vals[k] = 100 * Math.abs(P.cascade[k]) / P.pib);
      return { code: c.code, nom: c.nom, annee: P.annee, vals, note: P.loyers_estimes === null ? " · sans loyers imputés" : "" };
    }).sort((a, b) => b.vals.reste - a.vals.reste);
    $("#cmp-lead").textContent = "Part du PIB qui correspond à des ventes à des clients (en vert), et parts comptées par convention : services publics et associations évalués à leur coût, loyers fictifs des propriétaires, impôts inclus dans les prix, remplacement du capital usé. Chaque barre fait 100 % du PIB. Cliquez sur un pays pour l'afficher dans les autres sections.";
    el.innerHTML = stackRows(rows, CASC_PARTS, { max: 100, val: r => pct(r.vals.reste, 0) + " vendu" });
    bindStackTips(el, v => pct(v) + " du PIB");
    legend(CASC_PARTS);
    $("#cmp-notes").innerHTML = `<p>Les pays où l'État produit lui-même beaucoup de services (pays nordiques, France) ont une part « vendue » plus faible. Ce n'est pas forcément moins de richesse : ces services existent, ils sont simplement payés par l'impôt plutôt qu'au guichet, et donc comptés à leur coût. Inversement, une santé ou une éducation privées apparaissent comme « vendues ».</p><p>L'Irlande et le Luxembourg ont un PIB gonflé par les profits de multinationales, ce qui augmente mécaniquement leur part « vendue ».</p>`;
  } else if (cmpView === "fonctions") {
    const F = CMP.fonctions, parts = F.map(([k, l], i) => [k, l, FUNC_PAL[i % FUNC_PAL.length]]);
    const rows = L.filter(c => c.fonctions).map(c => ({ code: c.code, nom: c.nom, annee: c.fonctions.annee, vals: c.fonctions.pct, tot: d3.sum(F, f => c.fonctions.pct[f[0]]) }))
      .sort((a, b) => b.tot - a.tot);
    $("#cmp-lead").textContent = "Dépenses de toutes les administrations publiques (État, collectivités, sécurité sociale), par fonction, en % du PIB. Survolez un segment pour le détail.";
    el.innerHTML = stackRows(rows, parts, { val: r => pct(r.tot, 1) });
    bindStackTips(el, v => pct(v, 2) + " du PIB");
    legend(parts);
    const fr = rows.find(r => r.code === "FR"), de = rows.find(r => r.code === "DE");
    $("#cmp-notes").innerHTML = fr && de ? `<p>Écart France − Allemagne : ${nf1.format(fr.tot - de.tot)} points de PIB, dont retraites ${nf1.format(fr.vals.retraites - de.vals.retraites)} pt, santé ${nf1.format(fr.vals.sante - de.vals.sante)} pt, économie ${nf1.format(fr.vals.economie - de.vals.economie)} pt, enseignement ${nf1.format(fr.vals.enseignement - de.vals.enseignement)} pt.</p><p>Une partie des écarts tient aux systèmes : quand la retraite ou la santé passent par des assurances privées obligatoires (Pays-Bas, Suisse), elles sortent de la dépense publique.</p>` : "";
  } else if (cmpView === "apu") {
    const cols = [
      { k: "depenses_pct", l: "Dépenses publiques", f: d => d.apu?.depenses_pct, max: 65, c: "#c2413a" },
      { k: "recettes_pct", l: "Recettes publiques", f: d => d.apu?.recettes_pct, max: 65, c: "#2f8f5b" },
      { k: "solde", l: "Solde public", f: d => d.apu ? d.apu.recettes_pct - d.apu.depenses_pct : null, div: 8 },
      { k: "dette_pct", l: "Dette publique", f: d => d.apu?.dette_pct, max: 160, c: "#3b6fd6" },
      { k: "int_pib", l: "Intérêts", f: d => d.interets?.pct_pib, max: 5, c: "#d7a32a" },
      { k: "int_rec", l: "Intérêts / recettes", f: d => d.interets?.pct_recettes, max: 10, c: "#d7a32a" },
      { k: "taux", l: "Taux apparent", f: d => d.interets?.taux_apparent, max: 6, c: "#8e5bd0" },
    ];
    drawTable(el, L.filter(c => c.apu), cols, "dette_pct", r => r.apu.annee, "%");
    $("#cmp-lead").textContent = "Dépenses, recettes, solde et dette des administrations publiques, en % du PIB, et charge d'intérêts. Cliquez sur un en-tête pour trier, sur un pays pour l'afficher dans les autres sections.";
    $("#cmp-legend").innerHTML = "";
    $("#cmp-notes").innerHTML = `<p>La dette au sens de Maastricht n'est pas publiée pour la Norvège, la Suisse et l'Islande dans cette série. Le taux apparent rapporte les intérêts de l'année à la dette de fin d'année précédente.</p>`;
  } else {
    const B = L.filter(c => c.bilan).map(c => ({ ...c, b: c.bilan }));
    const p = (r, v) => v == null ? null : 100 * v / r.b.pib;
    const S = (r, s) => r.b.secteurs[s];
    const cols = [
      { k: "men_fa", l: "Ménages : actifs financiers", f: r => p(r, S(r, "menages").fa), max: 450, c: "#3b6fd6" },
      { k: "men_fl", l: "Ménages : dettes", f: r => p(r, S(r, "menages").fl), max: 120, c: "#c2413a" },
      { k: "men_nf", l: "Ménages : biens réels", f: r => p(r, S(r, "menages").nf), max: 500, c: "#c9772b" },
      { k: "snf_net", l: "Entreprises : solde financier", f: r => p(r, S(r, "snf").fa - S(r, "snf").fl), div: 250 },
      { k: "apu_fl", l: "État & adm. : passifs", f: r => p(r, S(r, "apu").fl), max: 180, c: "#c2413a" },
      { k: "apu_net", l: "État & adm. : solde financier", f: r => p(r, S(r, "apu").fa - S(r, "apu").fl), div: 150 },
      { k: "ext", l: "Position face à l'étranger", f: r => p(r, r.b.position_ext), div: 250 },
    ];
    drawTable(el, B, cols, "men_fa", r => r.b.annee, "%");
    $("#cmp-lead").textContent = "Actifs et passifs par grand secteur, en % du PIB. Le « solde financier » est ce que le secteur détient en actifs financiers moins ce qu'il doit. La position face à l'étranger est la somme de tous ces soldes : positive, le pays prête au reste du monde ; négative, il lui emprunte.";
    $("#cmp-legend").innerHTML = "";
    $("#cmp-notes").innerHTML = `<p>Les biens réels (logements, terrains) ne sont publiés que pour une poignée de pays, et sans les terrains pour la plupart : la colonne est souvent vide. Les passifs des entreprises comprennent leurs actions à la valeur de marché, d'où un solde financier très négatif dans les pays à grandes entreprises cotées. Cela reflète la valeur de ces entreprises, pas un endettement.</p><p>La Norvège (fonds pétrolier), la Suisse, l'Allemagne et les Pays-Bas prêtent massivement au reste du monde. La France est proche de l'équilibre.</p>`;
  }
}

let cmpSort = null;
function drawTable(el, data, cols, defSort, yearFn, unit) {
  if (!cmpSort || !cols.some(c => c.k === cmpSort.k)) cmpSort = { k: defSort, dir: -1 };
  const col = cols.find(c => c.k === cmpSort.k);
  const rows = [...data].sort((a, b) => {
    const va = col.f(a), vb = col.f(b);
    if (va == null) return 1; if (vb == null) return -1;
    return cmpSort.dir * (va - vb);
  });
  const cell = (c, r) => {
    const v = c.f(r); if (v == null) return `<td class="muted">–</td>`;
    const txt = pct(v, Math.abs(v) < 10 ? 1 : 0);
    if (c.div) {
      const w = Math.min(50, 50 * Math.abs(v) / c.div);
      return `<td>${txt}<span class="dbar"><span style="${v < 0 ? `right:50%` : `left:50%`};width:${w}%;background:${v < 0 ? "var(--neg)" : "var(--pos)"}"></span></span></td>`;
    }
    return `<td>${txt}<span class="ibar" style="width:${Math.min(70, 70 * v / c.max)}px;background:${c.c}"></span></td>`;
  };
  el.innerHTML = `<div class="table-scroll"><table class="cmp-t"><thead><tr><th>Pays</th>${cols.map(c => `<th data-k="${c.k}" class="${c.k === cmpSort.k ? "sorted" : ""}">${esc(c.l)}${c.k === cmpSort.k ? (cmpSort.dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.code === GEO ? "me" : ""}" data-code="${r.code}" style="cursor:pointer"><td>${esc(r.nom)} <small class="muted">${yearFn(r)}</small></td>${cols.map(c => cell(c, r)).join("")}</tr>`).join("")}</tbody></table></div>`;
  el.querySelectorAll("th[data-k]").forEach(th => th.onclick = () => {
    cmpSort = cmpSort.k === th.dataset.k ? { k: th.dataset.k, dir: -cmpSort.dir } : { k: th.dataset.k, dir: -1 };
    drawCompare();
  });
  el.querySelectorAll("tr[data-code]").forEach(tr => tr.onclick = () => setGeo(tr.dataset.code));
}

/* ================================================================= PATRIMOINE */
function initBilan() {
  const years = Object.keys(DATA.patrimoine).sort();
  fillSelect($("#bs-year"), years, years.at(-1));
  $("#bs-year").onchange = drawBilan;
  drawBilan();
}

function drawBilan() {
  if (!DATA) return;
  document.querySelector(".bs-why")?.remove();
  const y = $("#bs-year").value, B = DATA.patrimoine[y], secs = B.secteurs;
  const L = DATA.labels;
  const sum = o => d3.sum(Object.values(o));
  const nfTot = d3.sum(secs, s => sum(s.nf));
  const netTot = d3.sum(secs, s => s.net);
  const extNet = d3.sum(secs, s => sum(s.fa) - sum(s.fl));
  const faTot = d3.sum(secs, s => sum(s.fa)), flTot = d3.sum(secs, s => sum(s.fl));
  kpis($("#bs-kpis"), [
    [md(nfTot + faTot), `total des actifs (brut) : ${md(nfTot)} de biens réels + ${md(faTot)} d'actifs financiers`],
    ["− " + md(flTot), "total des dettes et passifs"],
    ["= " + md(netTot), `patrimoine net de la France fin ${y}, soit ${eur(netTot * 1e9 / B.population)} par habitant et ${nf1.format(netTot / B.pib)} années de PIB`],
    [(extNet >= 0 ? "+" : "−") + md(Math.abs(extNet)), "dont position financière nette face à l'étranger (le reste, ce sont les biens réels)"],
  ]);
  $("#bs-kpis").insertAdjacentHTML("afterend", `<p class="muted bs-why" style="font-size:.86rem;margin:-2px 0 10px;max-width:100ch">Pourquoi ${md(nfTot + faTot)} d'actifs mais seulement ${md(netTot)} de patrimoine ? Un dépôt bancaire est à la fois un actif (pour le déposant) et une dette (pour la banque) : les ${md(faTot)} d'actifs financiers sont presque entièrement compensés par les ${md(flTot)} de dettes. À l'échelle du pays, le patrimoine net se réduit aux biens réels plus le solde avec l'étranger.</p>`);

  // --- graphique : actifs à droite, passifs à gauche
  const el = $("#bs-chart");
  const NF_COL = { logements: "#e07b39", terrains: "#8c5a2b", batiments: "#f2b544", machines: "#c0392b", pi: "#e8a0a0", stocks: "#a8a032", valeur: "#ffd84d", autres_nf: "#cdb89a" };
  const F_COL = { depots: "#1f78b4", titres: "#8fc3e8", credits: "#17a2b8", actions: "#3949ab", assurance: "#8e5bd0", derives: "#c9b3e6", autres_f: "#90a4ae" };
  const SHORT = { logements: "Logements", terrains: "Terrains", batiments: "Bâtiments", machines: "Équipements", pi: "Logiciels, R&D", stocks: "Stocks", valeur: "Valeur", autres_nf: "Autres",
                  depots: "Dépôts", titres: "Obligations", credits: "Crédits", actions: "Actions", assurance: "Assurance-vie", derives: "Dérivés", autres_f: "Autres" };
  const total = { label: "France entière", nf: {}, fa: {}, fl: {} };
  L.nf.forEach(([k]) => total.nf[k] = d3.sum(secs, s => s.nf[k]));
  L.f.forEach(([k]) => { total.fa[k] = d3.sum(secs, s => s.fa[k]); total.fl[k] = d3.sum(secs, s => s.fl[k]); });
  total.actifs = sum(total.nf) + sum(total.fa); total.passifs = sum(total.fl); total.net = total.actifs - total.passifs;

  const w = Math.max(320, el.clientWidth), narrow = w < 640;
  const mg = { l: narrow ? 44 : 236, r: 52 };
  const tx = c => `<span style="color:var(--muted)">${c}</span>`;

  function chart(rows, rowH, annotate) {
    const top = narrow ? 34 : 22;
    const h = top + rows.length * rowH + 6 + (annotate ? 34 : 0);
    const maxA = d3.max(rows, s => s.actifs), maxL = d3.max(rows, s => s.passifs);
    const x = d3.scaleLinear([-maxL, maxA], [mg.l, w - mg.r]);
    const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const defs = svg.append("defs");
    Object.entries(F_COL).forEach(([k, c]) => {
      const pt = defs.append("pattern").attr("id", "hatch-" + k).attr("patternUnits", "userSpaceOnUse").attr("width", 6).attr("height", 6).attr("patternTransform", "rotate(45)");
      pt.append("rect").attr("width", 6).attr("height", 6).attr("fill", c).attr("opacity", .35);
      pt.append("rect").attr("width", 2.5).attr("height", 6).attr("fill", c);
    });
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", top - 4).attr("y2", h).attr("stroke", css("--ink"));
    svg.append("text").attr("x", x(0) + 6).attr("y", 11).attr("font-size", 11).attr("fill", css("--muted")).text("Ce qu'ils possèdent →");
    svg.append("text").attr("x", x(0) - 6).attr("y", 11).attr("text-anchor", "end").attr("font-size", 11).attr("fill", css("--muted")).text("← Ce qu'ils doivent");
    rows.forEach((s, i) => {
      const lab = narrow ? 16 : 0;
      const yy = top + i * rowH + lab, bh = rowH - 14 - lab;
      const lx = narrow ? 0 : 0, ly = narrow ? yy - 5 : yy + bh / 2;
      svg.append("text").attr("x", lx).attr("y", ly).attr("dy", narrow ? 0 : "-.15em").attr("font-size", 12).attr("font-weight", 650)
        .text(narrow ? `${s.label} · net ${s.net < 0 ? "−" : ""}${md(Math.abs(s.net))}` : s.label);
      if (!narrow) svg.append("text").attr("x", 0).attr("y", ly).attr("dy", "1.05em").attr("font-size", 11).attr("fill", s.net < 0 ? css("--neg") : css("--muted")).text(`net ${s.net >= 0 ? "" : "−"}${md(Math.abs(s.net))}`);
      const seg = (x0, x1, fill, k, tipHtml) => {
        const r = svg.append("rect").attr("x", x(x0)).attr("y", yy).attr("width", Math.max(0, x(x1) - x(x0))).attr("height", bh).attr("fill", fill)
          .attr("stroke", css("--surface")).attr("stroke-width", .6)
          .on("pointermove", ev => showTip(tipHtml, ev)).on("pointerleave", hideTip);
        if (Math.abs(x(x1) - x(x0)) > SHORT[k].length * 6.2 + 8 && bh >= 16)
          svg.append("text").attr("x", (x(x0) + x(x1)) / 2).attr("y", yy + bh / 2).attr("dy", ".35em").attr("text-anchor", "middle")
            .attr("font-size", 10.5).attr("fill", String(fill).startsWith("url") ? css("--ink") : "#fff").attr("pointer-events", "none").attr("font-weight", 600)
            .attr("paint-order", String(fill).startsWith("url") ? "stroke" : null).attr("stroke", String(fill).startsWith("url") ? css("--surface") : null).attr("stroke-width", 3).text(SHORT[k]);
        return r;
      };
      let acc = 0;
      L.nf.forEach(([k, l]) => { const v = s.nf[k]; if (v > 0) { seg(acc, acc + v, NF_COL[k], k, `<b>${esc(s.label)}</b><br>Bien réel : ${esc(l)}<br>${md(v)}`); acc += v; } });
      L.f.forEach(([k, l]) => { const v = s.fa[k]; if (v > 0) { seg(acc, acc + v, F_COL[k], k, `<b>${esc(s.label)}</b><br>Actif financier : ${esc(l)}<br>${md(v)}`); acc += v; } });
      let accL = 0;
      L.f.forEach(([k, l]) => { const v = s.fl[k]; if (v > 0) { seg(-(accL + v), -accL, `url(#hatch-${k})`, k, `<b>${esc(s.label)}</b><br>Dette / passif : ${esc(l)}<br>${md(v)}`); accL += v; } });
      svg.append("text").attr("x", x(acc) + 5).attr("y", yy + bh / 2).attr("dy", ".35em").attr("font-size", 11).attr("font-weight", 600).attr("fill", css("--ink"))
        .text(nf0.format(acc));
      svg.append("text").attr("x", x(-accL) - 5).attr("y", yy + bh / 2).attr("dy", ".35em").attr("font-size", 11).attr("font-weight", 600).attr("fill", css("--ink"))
        .attr("text-anchor", "end").text(nf0.format(accL));
      if (annotate && s.id === "apu") {
        const debtMV = (s.fl.depots || 0) + (s.fl.titres || 0) + (s.fl.credits || 0);
        const xa = x(-debtMV), xb = x(0), yb = yy + bh + 4, col = css("--neg");
        svg.append("rect").attr("x", xa - 1).attr("y", yy - 2).attr("width", xb - xa + 2).attr("height", bh + 4).attr("fill", "none")
          .attr("stroke", col).attr("stroke-width", 2).attr("rx", 3);
        svg.append("path").attr("d", `M${xa},${yb} v6 H${xb} v-6`).attr("fill", "none").attr("stroke", col).attr("stroke-width", 1.5);
        const mtxt = B.dette_maastricht_pct ? ` · ${md(B.dette_maastricht_pct * B.pib / 100)} au sens de Maastricht (${pct(B.dette_maastricht_pct)} du PIB)` : "";
        svg.append("text").attr("x", narrow ? 0 : xb).attr("y", yb + 20).attr("text-anchor", narrow ? "start" : "end").attr("font-size", 11.5).attr("font-weight", 700).attr("fill", col)
          .text(`↑ La « dette publique » : ${md(debtMV)}${narrow ? "" : mtxt}`);
      }
    });
    return svg.node();
  }

  el.innerHTML = `<h4 style="margin:8px 0 4px">France entière : ${md(total.actifs)} d'actifs, ${md(total.passifs)} de passifs</h4>`;
  el.appendChild(chart([total], narrow ? 62 : 52));
  el.insertAdjacentHTML("beforeend", `<p class="muted" style="font-size:.84rem;margin:2px 0 14px">Les actifs financiers d'un Français sont souvent la dette d'un autre Français (le dépôt d'un ménage est une dette de sa banque) : à l'échelle du pays, ils s'annulent presque. Le patrimoine net (${md(total.net)}) se résume donc aux biens réels (${md(sum(total.nf))}) plus la position face à l'étranger (${extNet >= 0 ? "+" : "−"}${md(Math.abs(extNet))}).</p><h4 style="margin:8px 0 4px">Par secteur (même échelle pour les quatre)</h4>`);
  el.appendChild(chart(secs, narrow ? 56 : 46, true));
  const sw = (c, hatch) => `<i style="width:14px;height:12px;border:0;opacity:1;background:${hatch ? `repeating-linear-gradient(45deg, ${c} 0 2.5px, color-mix(in srgb, ${c} 35%, transparent) 2.5px 6px)` : c}"></i>`;
  el.insertAdjacentHTML("beforeend", `
    <div class="legend-row"><b style="color:var(--ink)">Biens réels</b>${L.nf.map(([k, l]) => `<span>${sw(NF_COL[k])}${esc(l)}</span>`).join("")}</div>
    <div class="legend-row"><b style="color:var(--ink)">Actifs financiers</b> (pleins, à droite) <b style="color:var(--ink)">et dettes</b> (hachurés, à gauche)${L.f.map(([k, l]) => `<span>${sw(F_COL[k])}${sw(F_COL[k], true)}${esc(l)}</span>`).join("")}</div>`);

  // --- tableau
  const cols = [...secs.map(s => s.label), "France entière"];
  const cell = (v, cls = "") => `<td class="${cls}${v < -0.05 ? " neg" : ""}">${Math.abs(v) < 0.05 ? "–" : nf0.format(v)}</td>`;
  const row = (label, vals, cls = "") => `<tr class="${cls}"><td>${esc(label)}</td>${vals.map((v, i) => cell(v, i === vals.length - 1 ? "tot" : "")).join("")}</tr>`;
  const tot = arr => [...arr, d3.sum(arr)];
  let html = `<thead><tr><th>En milliards d'euros, fin ${y}</th>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>`;
  html += `<tr class="grp"><td colspan="${cols.length + 1}">Biens réels (actifs non financiers)</td></tr>`;
  L.nf.forEach(([k, l]) => { html += row(l, tot(secs.map(s => s.nf[k]))); });
  html += row("Total biens réels", tot(secs.map(s => sum(s.nf))), "sum");
  html += `<tr class="grp"><td colspan="${cols.length + 1}">Actifs financiers (ce qu'on détient sur les autres)</td></tr>`;
  L.f.forEach(([k, l]) => { html += row(l, tot(secs.map(s => s.fa[k]))); });
  html += row("Total actifs financiers", tot(secs.map(s => sum(s.fa))), "sum");
  html += `<tr class="grp"><td colspan="${cols.length + 1}">Passifs (ce qu'on doit)</td></tr>`;
  L.f.forEach(([k, l]) => { html += row(l === "Actions et parts de fonds" ? "Actions et parts émises" : l, tot(secs.map(s => s.fl[k]))); });
  html += row("Total passifs", tot(secs.map(s => sum(s.fl))), "sum");
  html += row("Patrimoine net", tot(secs.map(s => s.net)), "net");
  html += `</tbody>`;
  $("#bs-table").innerHTML = html;

  const apu = secs.find(s => s.id === "apu"), snf = secs.find(s => s.id === "snf"), men = secs.find(s => s.id === "menages");
  $("#bs-notes").innerHTML = `
    <p><b>Les ménages détiennent ${pct(100 * men.net / netTot, 0)} du patrimoine net</b>, dont ${md(men.nf.logements + men.nf.terrains)} en logements et terrains. Leurs dettes sont surtout des crédits immobiliers (${md(men.fl.credits)}).</p>
    <p><b>La dette publique dont on parle</b> est la partie entourée en rouge à gauche de la barre des administrations : obligations d'État (${md(apu.fl.titres)}), crédits (${md(apu.fl.credits)}) et dépôts (${md(apu.fl.depots)}), soit ${md(apu.fl.titres + apu.fl.credits + apu.fl.depots)} à la valeur de marché. Elle pèse moins que les dettes des entreprises (${md(snf.passifs)}, actions comprises) ou du secteur financier, mais c'est la seule qui est remboursée par l'impôt. En face, les administrations détiennent ${md(apu.actifs)} d'actifs (routes, bâtiments, participations, trésorerie).</p>
    <p><b>Administrations publiques :</b> leurs passifs (${md(apu.passifs)}) sont mesurés à la valeur de marché. La dette « au sens de Maastricht » est mesurée à sa valeur nominale : ${B.dette_maastricht_pct ? pct(B.dette_maastricht_pct) + " du PIB" : "–"}. Leurs actifs sont surtout des routes, bâtiments publics, réseaux et terrains, difficiles à vendre. Leur patrimoine net reste positif (${md(apu.net)}), mais il fond depuis des années.</p>
    <p><b>Entreprises :</b> leurs actions sont comptées comme un passif (elles « appartiennent » aux actionnaires), à la valeur de la Bourse. Leur patrimoine net (${md(snf.net)}) est donc faible par construction. La richesse des entreprises se retrouve dans les actions détenues par les ménages, les assureurs et l'étranger.</p>
    <p><b>Où sont Versailles et la Joconde ?</b> Le château de Versailles est compté dans les « autres bâtiments et ouvrages » des administrations. Il n'est pas évalué à une valeur de marché ou symbolique, mais par l'accumulation des dépenses de construction et de restauration, diminuée de l'usure : un bâtiment du XVII<sup>e</sup> siècle n'y pèse donc presque que ses rénovations récentes. Son terrain compte dans les terrains publics. La Joconde et les collections des musées nationaux, inaliénables et donc sans prix de marché, ne sont pas valorisées. Les « objets de valeur » du tableau sont l'or, les bijoux et l'art détenus par les ménages. Le patrimoine public est donc sous-évalué par construction.</p>
    <p>Le patrimoine net de la France est presque entièrement fait de <b>biens réels</b> (${md(nfTot)}), dont ${pct(100 * d3.sum(secs, s => s.nf.terrains) / nfTot, 0)} de terrains. Les créances et dettes financières entre Français s'annulent ; seul compte le solde avec l'étranger (${extNet >= 0 ? "+" : "−"}${md(Math.abs(extNet))}).</p>`;
}
})();
