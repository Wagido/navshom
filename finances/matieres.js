/* Section Matières : comptes de flux de matières (Eurostat) */
(() => {
"use strict";

const $ = s => document.querySelector(s);
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const mt = v => (Math.abs(v) >= 100 ? nf0.format(v) : nf1.format(v)) + " Mt";
const pct = (v, d = 1) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v) + " %";
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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

const CACHE = {};
let INDEX = null, geo = "FR", locked = null;

async function load(g) {
  if (!(g in CACHE)) {
    try { CACHE[g] = await fetch(`data/matieres/${g}.json`).then(r => { if (!r.ok) throw 0; return r.json(); }); }
    catch (e) { CACHE[g] = null; }
  }
  return CACHE[g];
}

async function init() {
  try { INDEX = await fetch("data/matieres/index.json").then(r => r.json()); } catch (e) { return; }
  $("#mt-year").onchange = () => { locked = null; draw(); };
  document.addEventListener("geochange", e => setGeo(e.detail));
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { draw(); drawHist(); }, 150); });
  await setGeo($("#geo")?.value || "FR");
}

async function setGeo(g) {
  geo = g;
  const D = await load(g);
  const years = D ? Object.keys(D.bilan).sort() : [];
  const sel = $("#mt-year"), prev = sel.value;
  sel.innerHTML = years.map(y => `<option${y === (years.includes(prev) ? prev : years.at(-1)) ? " selected" : ""}>${y}</option>`).join("");
  sel.disabled = !years.length;
  locked = null;
  draw(); drawDetail(); drawHist(); drawCompare();
}

/* ---------------------------------------------------------------- diagramme de flux */
function draw() {
  const D = CACHE[geo], el = $("#mt-sankey");
  const y = $("#mt-year").value;
  if (!D || !D.bilan[y]) {
    $("#mt-kpis").innerHTML = `<p class="empty">Eurostat ne publie pas ce bilan pour ce pays (seules les séries par habitant sont disponibles plus bas, le cas échéant).</p>`;
    el.replaceChildren(); return;
  }
  const B = D.bilan[y], K = B.kpi;
  const intrants = K.extraction + K.importations + K.recyclees;
  $("#mt-kpis").innerHTML = [
    [nf1.format(K.dmc_hab) + " t", `de matières consommées par habitant en ${y} (${nf0.format(K.dmc_hab * 1000 / 365)} kg par jour)`],
    [K.rmc_hab != null ? nf1.format(K.rmc_hab) + " t" : "–", "empreinte par habitant, avec ce qu'il a fallu extraire à l'étranger pour nos importations"],
    [mt(K.extraction), `extraites sur le territoire (${pct(100 * K.extraction / intrants, 0)} des entrées)`],
    [mt(K.importations), `importées (${pct(100 * K.importations / intrants, 0)} des entrées)`],
    [mt(K.stock), "ajoutées au stock (bâtiments, routes, objets durables)"],
    [K.circularite != null ? pct(K.circularite) : "–", "taux de recyclage : part des matières utilisées issue de déchets recyclés"],
  ].map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");

  const total = intrants;
  const W = 1220, H = 600, top = 26;
  const used = [...new Set(B.nodes.map(n => n.col))].sort((a, b) => a - b);
  const nodes = B.nodes.map(n => ({ ...n, _c: used.indexOf(n.col) }));
  const links = B.links.map(([s, t, v]) => ({ source: s, target: t, value: v }));
  let G;
  try {
    G = d3.sankey().nodeId(d => d.id).nodeAlign(n => n._c).nodeSort(null).nodeWidth(12).nodePadding(12)
      .extent([[1, top], [W - 250, H - 4]])({ nodes, links });
  } catch (e) { el.innerHTML = `<p class="empty">Diagramme indisponible.</p>`; return; }
  const svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`);
  const heads = ["Origine", "Matières", "Mise en œuvre", "Usage", "Destination"];
  const colX = d3.rollup(G.nodes, v => v[0].x0, d => d._c);
  svg.append("g").selectAll("text").data([...colX]).join("text").attr("class", "colhead").attr("x", ([, x]) => x).attr("y", 12)
    .text(([c]) => heads[used[c]]);
  const defs = svg.append("defs");
  G.links.forEach((l, i) => {
    const gr = defs.append("linearGradient").attr("id", "mg" + i).attr("gradientUnits", "userSpaceOnUse").attr("x1", l.source.x1).attr("x2", l.target.x0);
    gr.append("stop").attr("offset", "0%").attr("stop-color", l.source.color);
    gr.append("stop").attr("offset", "100%").attr("stop-color", l.target.color);
    l._g = "mg" + i;
  });
  const link = svg.append("g").selectAll("path").data(G.links).join("path").attr("class", "link")
    .attr("d", d3.sankeyLinkHorizontal()).attr("stroke", d => `url(#${d._g})`).attr("stroke-width", d => Math.max(1, d.width))
    .on("pointermove", (ev, d) => showTip(`<b>${esc(d.source.label)} → ${esc(d.target.label)}</b><br>${mt(d.value)} (${pct(100 * d.value / total, 0)} des entrées)`, ev))
    .on("pointerleave", hideTip);
  const node = svg.append("g").selectAll("g").data(G.nodes).join("g").attr("class", "node");
  node.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => d.x1 - d.x0).attr("height", d => Math.max(1, d.y1 - d.y0)).attr("fill", d => d.color);
  const big = d => (d.y1 - d.y0) > 24;
  const lab = node.append("text").attr("x", d => d.x1 + 6).attr("y", d => (d.y0 + d.y1) / 2).attr("dy", d => big(d) ? "-0.15em" : "0.35em");
  lab.append("tspan").text(d => d.label + (big(d) ? "" : "  "));
  lab.append("tspan").attr("class", "amt").attr("x", d => big(d) ? d.x1 + 6 : null).attr("dy", d => big(d) ? "1.15em" : null).text(d => mt(d.value));
  function hl(d) {
    if (!d) { link.classed("dim", false).classed("hi", false); node.classed("dim", false); return; }
    const set = new Set([...d.sourceLinks, ...d.targetLinks]), ns = new Set([d]);
    set.forEach(l => { ns.add(l.source); ns.add(l.target); });
    link.classed("dim", l => !set.has(l)).classed("hi", l => set.has(l)); node.classed("dim", n => !ns.has(n));
  }
  node.on("pointerenter", (ev, d) => { if (!locked) hl(d); })
    .on("pointermove", (ev, d) => showTip(`<b>${esc(d.label)}</b><br>${mt(d.value)}` +
      [...d.sourceLinks].sort((a, b) => b.value - a.value).map(l => `<br>→ ${esc(l.target.label)} : ${mt(l.value)}`).join(""), ev))
    .on("pointerleave", () => { hideTip(); if (!locked) hl(null); })
    .on("click", (ev, d) => { ev.stopPropagation(); locked = locked === d.id ? null : d.id; hl(locked ? d : null); });
  svg.on("click", () => { locked = null; hl(null); });
  el.replaceChildren(svg.node());
}

/* ---------------------------------------------------------------- détail par matière */
function drawDetail() {
  const D = CACHE[geo], el = $("#mt-detail");
  if (!D || !D.detail) { el.innerHTML = `<p class="empty">Détail non publié pour ce pays.</p>`; return; }
  const Dt = D.detail;
  $("#mt-detail-title").textContent = `Le détail par matière (${Dt.annee})`;
  const max = d3.max(Dt.groupes.flatMap(g => g.rows), r => Math.max(r.extraction, r.importations, r.exportations)) || 1;
  const bar = (v, c) => `<span class="ibar" style="width:${Math.max(0, 90 * v / max)}px;background:${c}"></span>`;
  const colors = Object.fromEntries(D.matieres.map(m => [m[0], m[2]]));
  el.innerHTML = `<div class="table-scroll"><table class="cmp-t"><thead><tr><th>Matière</th><th>Extraction</th><th>Importations</th><th>Exportations</th><th>Part importée</th></tr></thead><tbody>` +
    Dt.groupes.map(g => `<tr><td colspan="5" style="font-weight:700;background:var(--bg)"><span class="ibar" style="width:10px;margin:0 6px 0 0;background:${colors[g.code]}"></span>${esc(g.label)}</td></tr>` +
      g.rows.map(r => {
        const appro = r.extraction + r.importations;
        return `<tr><td style="padding-left:22px">${esc(r.label)}</td><td>${nf1.format(r.extraction)}${bar(r.extraction, "#16a34a")}</td><td>${nf1.format(r.importations)}${bar(r.importations, "#dc2626")}</td><td>${nf1.format(r.exportations)}${bar(r.exportations, "#94a3b8")}</td><td>${appro > 0.05 ? pct(100 * r.importations / appro, 0) : "–"}</td></tr>`;
      }).join("")).join("") + `</tbody></table></div>`;
}

/* ---------------------------------------------------------------- série par habitant */
function drawHist() {
  const D = CACHE[geo], el = $("#mt-hist");
  if (!D || !D.serie?.length) { el.innerHTML = `<p class="empty">Pas de série pour ce pays.</p>`; $("#mt-hist-legend").innerHTML = ""; return; }
  const M = D.matieres.slice(0, 4), keys = M.map(m => m[0]);
  const data = D.serie.map(d => { const o = { annee: +d.annee, rmc: d.rmc_hab, circ: d.circularite, dmc: d.dmc_hab }; keys.forEach(k => o[k] = Math.max(0, d[k] || 0)); return o; });
  const w = Math.max(320, el.clientWidth), h = 300, m = { t: 12, r: 46, b: 26, l: 46 };
  const series = d3.stack().keys(keys)(data);
  const x = d3.scaleLinear(d3.extent(data, d => d.annee), [m.l, w - m.r]);
  const y = d3.scaleLinear([0, d3.max(data, d => Math.max(d3.sum(keys, k => d[k]), d.rmc || 0)) * 1.08], [h - m.b, m.t]).nice();
  const y2 = d3.scaleLinear([0, Math.max(25, d3.max(data, d => d.circ || 0) * 1.2)], [h - m.b, m.t]);
  const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`);
  svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(5)).join("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
  const col = Object.fromEntries(M.map(mm => [mm[0], mm[2]])), lab = Object.fromEntries(M.map(mm => [mm[0], mm[1]]));
  svg.append("g").selectAll("path").data(series).join("path").attr("fill", d => col[d.key]).attr("opacity", .85)
    .attr("d", d3.area().x(d => x(d.data.annee)).y0(d => y(d[0])).y1(d => y(d[1])));
  const rm = data.filter(d => d.rmc != null);
  svg.append("path").attr("fill", "none").attr("stroke", css("--ink")).attr("stroke-width", 2).attr("d", d3.line().x(d => x(d.annee)).y(d => y(d.rmc))(rm));
  const ci = data.filter(d => d.circ != null);
  svg.append("path").attr("fill", "none").attr("stroke", "#0ea5e9").attr("stroke-width", 2).attr("stroke-dasharray", "5 3").attr("d", d3.line().x(d => x(d.annee)).y(d => y2(d.circ))(ci));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(w < 560 ? 5 : 10));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => d + " t")).call(g => g.select(".domain").remove());
  svg.append("g").attr("class", "axis").attr("transform", `translate(${w - m.r},0)`).call(d3.axisRight(y2).ticks(5).tickFormat(d => d + " %")).call(g => g.select(".domain").remove());
  const bis = d3.bisector(d => d.annee).center;
  svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.t - m.b).attr("fill", "transparent")
    .on("pointermove", ev => {
      const d = data[bis(data, x.invert(d3.pointer(ev)[0]))]; if (!d) return;
      showTip(`<b>${d.annee}</b><br>` + keys.map(k => `${esc(lab[k])} : ${nf1.format(d[k])} t`).join("<br>") +
        `<br><b>Consommation apparente : ${nf1.format(d.dmc)} t/hab.</b>` + (d.rmc != null ? `<br>Empreinte : ${nf1.format(d.rmc)} t/hab.` : "") +
        (d.circ != null ? `<br>Taux de recyclage : ${pct(d.circ)}` : ""), ev);
    }).on("pointerleave", hideTip);
  el.replaceChildren(svg.node());
  $("#mt-hist-legend").innerHTML = M.map(([k, l, c]) => `<span><i style="border-top-color:${c};opacity:1;border-top-width:10px;width:14px"></i>${esc(l)}</span>`).join("") +
    `<span><i style="border-top-color:${css("--ink")};opacity:1"></i>Empreinte matières</span><span><i style="border-top-color:#0ea5e9;opacity:1;border-top-style:dashed"></i>Taux de recyclage (axe droit)</span>`;
}

/* ---------------------------------------------------------------- comparaison */
let sortK = { k: "dmc_hab", dir: -1 };
function drawCompare() {
  if (!INDEX) return;
  const el = $("#mt-cmp");
  const cols = [
    { k: "dmc_hab", l: "Consommation / hab.", f: r => r.dmc_hab, fmt: v => nf1.format(v) + " t", max: 40, c: "#78716c" },
    { k: "rmc_hab", l: "Empreinte / hab.", f: r => r.rmc_hab, fmt: v => nf1.format(v) + " t", max: 40, c: "#404040" },
    { k: "part_imp", l: "Part importée", f: r => 100 * r.importations / (r.extraction + r.importations + r.recyclees), fmt: v => pct(v, 0), max: 100, c: "#dc2626" },
    { k: "stock", l: "Ajout au stock", f: r => r.dmc ? 100 * r.stock / r.dmc : null, fmt: v => pct(v, 0) + " de la conso.", max: 100, c: "#7c3aed" },
    { k: "circularite", l: "Taux de recyclage", f: r => r.circularite, fmt: v => pct(v, 1), max: 35, c: "#0ea5e9" },
  ];
  const col = cols.find(c => c.k === sortK.k);
  const rows = [...INDEX.pays].sort((a, b) => { const va = col.f(a), vb = col.f(b); if (va == null) return 1; if (vb == null) return -1; return sortK.dir * (va - vb); });
  const cell = (c, r) => { const v = c.f(r); if (v == null || isNaN(v)) return `<td class="muted">–</td>`;
    return `<td>${c.fmt(v)}<span class="ibar" style="width:${Math.min(70, 70 * v / c.max)}px;background:${c.c}"></span></td>`; };
  el.innerHTML = `<div class="table-scroll"><table class="cmp-t"><thead><tr><th>Pays</th>${cols.map(c => `<th data-k="${c.k}" class="${c.k === sortK.k ? "sorted" : ""}">${esc(c.l)}${c.k === sortK.k ? (sortK.dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.code === geo ? "me" : ""}"><td>${esc(r.nom)} <small class="muted">${r.annee}</small></td>${cols.map(c => cell(c, r)).join("")}</tr>`).join("")}</tbody></table></div>
    <p class="muted" style="font-size:.85rem;margin-top:8px">Les pays qui extraient beaucoup de minerais, de bois ou de schiste bitumineux (Finlande, Estonie, Roumanie, Suède) ont une consommation par habitant élevée, même si une partie part en exportations transformées. Les Pays-Bas paraissent très « circulaires » en partie parce qu'ils importent beaucoup de déchets à recycler.</p>`;
  el.querySelectorAll("th[data-k]").forEach(th => th.onclick = () => {
    sortK = sortK.k === th.dataset.k ? { k: th.dataset.k, dir: -sortK.dir } : { k: th.dataset.k, dir: -1 }; drawCompare();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
