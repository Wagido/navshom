/* Thèmes : climat, eau, sols, alimentation, commerce, démographie, immigration, temps de travail, justice */
(() => {
"use strict";

const $ = s => document.querySelector(s);
const F = (d = 0) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d });
const n0 = v => F(0).format(v), n1 = v => F(1).format(v), n2 = v => F(2).format(v);
const pct = (v, d = 1) => F(d).format(v) + " %";
const mill = v => Math.abs(v) >= 1e6 ? n1(v / 1e6) + " M" : n0(v);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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
const kpis = (sel, items) => { $(sel).innerHTML = items.filter(Boolean).map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join(""); };
const legend = (sel, items) => { $(sel).innerHTML = items.map(([l, c, dash]) => `<span><i style="border-top-color:${c};opacity:1;border-top-width:${dash ? 2 : 10}px;${dash ? "border-top-style:dashed;" : ""}width:14px"></i>${esc(l)}</span>`).join(""); };
const regionName = (() => { try { const d = new Intl.DisplayNames(["fr"], { type: "region" }); return c => { try { return d.of(c === "EL" ? "GR" : c === "UK" ? "GB" : c); } catch (e) { return c; } }; } catch (e) { return c => c; } })();

/* ---------------------------------------------------------------- graphiques génériques */
function areaChart(el, data, keys, colors, labels, opts = {}) {
  const w = Math.max(320, el.clientWidth), h = opts.h || 300, m = { t: 12, r: opts.r || 14, b: 26, l: 56 };
  const pos = keys.filter(k => !opts.neg?.includes(k));
  const series = d3.stack().keys(pos).value((d, k) => Math.max(0, d[k] || 0))(data);
  const x = d3.scaleLinear(d3.extent(data, d => +d.annee), [m.l, w - m.r]);
  const ymax = d3.max([...series.at(-1).map(d => d[1]), ...(opts.lines || []).flatMap(l => data.map(d => d[l.k] || 0))]);
  const ymin = Math.min(0, d3.min(data, d => d3.sum(opts.neg || [], k => d[k] || 0)) || 0);
  const y = d3.scaleLinear([ymin, ymax * 1.05], [h - m.b, m.t]).nice();
  const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`);
  svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(5)).join("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
  svg.append("g").selectAll("path").data(series).join("path").attr("fill", d => colors[d.key]).attr("opacity", .88)
    .attr("d", d3.area().x(d => x(+d.data.annee)).y0(d => y(d[0])).y1(d => y(d[1])));
  (opts.neg || []).forEach(k => svg.append("path").attr("fill", colors[k]).attr("opacity", .75)
    .attr("d", d3.area().x(d => x(+d.annee)).y0(y(0)).y1(d => y(Math.min(0, d[k] || 0)))(data)));
  (opts.lines || []).forEach(l => svg.append("path").attr("fill", "none").attr("stroke", l.c).attr("stroke-width", 2).attr("stroke-dasharray", l.dash || null)
    .attr("d", d3.line().defined(d => d[l.k] != null).x(d => x(+d.annee)).y(d => y(d[l.k]))(data)));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(w < 560 ? 5 : 10));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(opts.yfmt || (v => n0(v)))).call(g => g.select(".domain").remove());
  const bis = d3.bisector(d => +d.annee).center;
  const cur = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", css("--muted")).attr("stroke-dasharray", "3 3").attr("opacity", 0);
  svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.t - m.b).attr("fill", "transparent")
    .on("pointermove", ev => {
      const d = data[bis(data, x.invert(d3.pointer(ev)[0]))]; if (!d) return;
      cur.attr("x1", x(+d.annee)).attr("x2", x(+d.annee)).attr("opacity", 1);
      showTip(`<b>${d.annee}</b><br>` + [...keys].reverse().filter(k => d[k] != null).map(k => `<span style="color:${colors[k]}">■</span> ${esc(labels[k])} : ${(opts.vfmt || n1)(d[k])}`).join("<br>") +
        (opts.lines || []).filter(l => d[l.k] != null).map(l => `<br><b>${esc(l.l)} : ${(opts.vfmt || n1)(d[l.k])}</b>`).join(""), ev);
    }).on("pointerleave", () => { hideTip(); cur.attr("opacity", 0); });
  el.replaceChildren(svg.node());
}

function lineChart(el, data, lines, opts = {}) {
  const w = Math.max(320, el.clientWidth), h = opts.h || 260, m = { t: 12, r: 14, b: 26, l: 56 };
  const x = d3.scaleLinear(d3.extent(data, d => +d.annee), [m.l, w - m.r]);
  const vals = data.flatMap(d => lines.map(l => d[l.k]).filter(v => v != null));
  const lo = opts.nozero ? d3.min(vals) - (d3.max(vals) - d3.min(vals)) * .08 : Math.min(0, d3.min(vals));
  const y = d3.scaleLinear([lo, d3.max(vals) + (opts.nozero ? (d3.max(vals) - d3.min(vals)) * .08 : d3.max(vals) * .08)], [h - m.b, m.t]).nice();
  const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`);
  svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(5)).join("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
  lines.forEach(l => svg.append("path").attr("fill", "none").attr("stroke", l.c).attr("stroke-width", 2.2).attr("stroke-dasharray", l.dash || null)
    .attr("d", d3.line().defined(d => d[l.k] != null).x(d => x(+d.annee)).y(d => y(d[l.k]))(data)));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(w < 560 ? 5 : 10));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(opts.yfmt || (v => n0(v)))).call(g => g.select(".domain").remove());
  const bis = d3.bisector(d => +d.annee).center;
  svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.t - m.b).attr("fill", "transparent")
    .on("pointermove", ev => { const d = data[bis(data, x.invert(d3.pointer(ev)[0]))]; if (!d) return;
      showTip(`<b>${d.annee}</b>` + lines.filter(l => d[l.k] != null).map(l => `<br><span style="color:${l.c}">■</span> ${esc(l.l)} : ${(opts.vfmt || n0)(d[l.k])}`).join(""), ev); })
    .on("pointerleave", hideTip);
  el.replaceChildren(svg.node());
}

function bars(el, rows, opts = {}) {
  const max = opts.max ?? d3.max(rows, r => Math.abs(r.v)) ?? 1;
  el.innerHTML = `<div class="bars">${rows.map(r => `<div class="bar-row"><span class="lab">${esc(r.l)}</span><span class="val">${r.t ?? n1(r.v)}</span>
    <span class="track"><span class="fill" style="width:${(100 * Math.abs(r.v) / max).toFixed(2)}%;background:${r.c || css("--accent")}"></span></span></div>`).join("")}</div>`;
}

let IDX = null, geo = "FR";
const sortState = {};
function table(el, key, cols, def) {
  if (!IDX) return;
  const st = sortState[key] || (sortState[key] = { k: def, dir: -1 });
  const col = cols.find(c => c.k === st.k);
  const rows = IDX.pays.filter(r => cols.some(c => c.f(r) != null)).sort((a, b) => { const va = col.f(a), vb = col.f(b); if (va == null) return 1; if (vb == null) return -1; return st.dir * (va - vb); });
  const cell = (c, r) => { const v = c.f(r); if (v == null || isNaN(v)) return `<td class="muted">–</td>`;
    return `<td>${c.fmt(v)}${c.max ? `<span class="ibar" style="width:${Math.min(70, Math.max(0, 70 * v / c.max))}px;background:${c.c}"></span>` : ""}</td>`; };
  el.innerHTML = `<div class="table-scroll"><table class="cmp-t"><thead><tr><th>Pays</th>${cols.map(c => `<th data-k="${c.k}" class="${c.k === st.k ? "sorted" : ""}">${esc(c.l)}${c.k === st.k ? (st.dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.code === geo ? "me" : ""}"><td>${esc(r.nom)} ${cols[0].y ? `<small class="muted">${cols[0].y(r) || ""}</small>` : ""}</td>${cols.map(c => cell(c, r)).join("")}</tr>`).join("")}</tbody></table></div>`;
  el.querySelectorAll("th[data-k]").forEach(th => th.onclick = () => { sortState[key] = st.k === th.dataset.k ? { k: st.k, dir: -st.dir } : { k: th.dataset.k, dir: -1 }; table(el, key, cols, def); });
}

/* ---------------------------------------------------------------- données */
const CACHE = {};
let COM = null;
async function load(g) {
  if (!(g in CACHE)) { try { CACHE[g] = await fetch(`data/themes/${g}.json`).then(r => r.json()); } catch (e) { CACHE[g] = null; } }
  return CACHE[g];
}
const D = () => CACHE[geo];
const popOf = y => { const s = D()?.demographie?.serie; if (!s) return null; const r = s.find(x => x.annee === String(y)) || s.at(-1); return r.population; };
const empty = (sel, msg = "Données non publiées pour ce pays.") => { const e = $(sel); if (e) e.innerHTML = `<p class="empty">${msg}</p>`; };

async function init() {
  try { IDX = await fetch("data/themes/index.json").then(r => r.json()); } catch (e) { return; }
  try { COM = await fetch("data/themes/commerce_FR.json").then(r => r.json()); } catch (e) { COM = null; }
  document.addEventListener("geochange", e => setGeo(e.detail));
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(drawAll, 200); });
  $("#al-year").onchange = drawAlim;
  await setGeo($("#geo")?.value || "FR");
}
async function setGeo(g) { geo = g; await load(g); drawAll(); }
function drawAll() {
  [drawClimat, drawEau, drawSols, drawAlim, drawCommerce, drawDemo, drawImmig, drawTravail, drawJustice].forEach(f => { try { f(); } catch (e) { console.error(f.name, e); } });
}

/* ---------------------------------------------------------------- climat */
function drawClimat() {
  const C = D()?.climat; if (!C) { kpis("#cl-kpis", []); empty("#cl-chart"); return; }
  const S = C.serie, last = S.at(-1), first = S.find(s => s.annee === "1990") || S[0];
  const pop = popOf(last.annee);
  kpis("#cl-kpis", [
    [n0(last.total) + " Mt", `de gaz à effet de serre émis en ${last.annee} (équivalent CO₂, hors forêts et sols)`],
    [(last.total < first.total ? "−" : "+") + pct(Math.abs(100 * (last.total / first.total - 1)), 0), `depuis ${first.annee} (${n0(first.total)} Mt)`],
    pop && [n1(last.total * 1e6 / pop) + " t", "par habitant et par an"],
    last.lulucf != null && [n0(last.lulucf) + " Mt", "absorbées (−) ou émises (+) par les forêts et les sols"],
    [n0((last.aviation_int || 0) + (last.maritime_int || 0)) + " Mt", "aviation et transport maritime internationaux (non comptés dans le total)"],
  ]);
  const keys = C.secteurs.map(s => s[0]), col = Object.fromEntries(C.secteurs.map(s => [s[0], s[2]])), lab = Object.fromEntries(C.secteurs.map(s => [s[0], s[1]]));
  col.lulucf = "#16a34a"; lab.lulucf = "Forêts et sols (absorption)";
  const data = S.map(s => ({ annee: s.annee, ...s.secteurs, lulucf: s.lulucf, total: s.total }));
  areaChart($("#cl-chart"), data, [...keys, "lulucf"], col, lab, { neg: ["lulucf"], lines: [{ k: "total", l: "Total (hors forêts)", c: css("--ink") }], vfmt: v => n1(v) + " Mt", yfmt: v => n0(v) + " Mt" });
  legend("#cl-legend", [...C.secteurs.map(s => [s[1], s[2]]), ["Forêts et sols (sous zéro : absorption)", "#16a34a"], ["Total", css("--ink"), true]]);
  const g = last.gaz, gl = C.gaz.filter(x => g[x[0]] != null);
  bars($("#cl-gaz"), gl.map(([k, l, c]) => ({ l, v: g[k], t: `${n0(g[k])} Mt · ${pct(100 * g[k] / last.total, 0)}`, c })), { max: last.total });
  table($("#cl-cmp"), "cl", [
    { k: "tot", l: "Émissions", f: r => r.climat?.total, fmt: v => n0(v) + " Mt", y: r => r.climat?.annee },
    { k: "hab", l: "par habitant", f: r => r.climat && r.demo ? r.climat.total * 1e6 / r.demo.population : null, fmt: v => n1(v) + " t", max: 20, c: "#475569" },
    { k: "evo", l: "Depuis 1990", f: r => r.climat?.evol_1990, fmt: v => (v > 0 ? "+" : "") + pct(v, 0) },
  ], "hab");
}

/* ---------------------------------------------------------------- eau */
function drawEau() {
  const E = D()?.eau; if (!E || !E.serie.length) { kpis("#eau-kpis", []); empty("#eau-chart"); $("#eau-legend").innerHTML = ""; return; }
  const S = E.serie.filter(s => s.total), last = S.at(-1);
  const col = Object.fromEntries(E.usages.map(u => [u[0], u[2]])), lab = Object.fromEntries(E.usages.map(u => [u[0], u[1]]));
  const top = Object.entries(last.usages).sort((a, b) => b[1] - a[1])[0];
  kpis("#eau-kpis", [
    [n1(last.total) + " km³", `d'eau douce prélevée en ${last.annee} (milliards de m³)`],
    last.par_hab && [n0(last.par_hab) + " m³", `par habitant, soit ${n0(last.par_hab * 1000 / 365)} litres par jour`],
    top && [pct(100 * top[1] / last.total, 0), `pour : ${lab[top[0]].toLowerCase()}`],
  ]);
  const data = S.map(s => ({ annee: s.annee, ...s.usages }));
  areaChart($("#eau-chart"), data, E.usages.map(u => u[0]), col, lab, { vfmt: v => n2(v) + " km³", yfmt: v => n0(v) + " km³" });
  legend("#eau-legend", E.usages.map(u => [u[1], u[2]]));
  table($("#eau-cmp"), "eau", [
    { k: "hab", l: "Prélèvements par habitant", f: r => r.eau?.par_hab, fmt: v => n0(v) + " m³", max: 1500, c: "#0ea5e9", y: r => r.eau?.annee },
    { k: "tot", l: "Total", f: r => r.eau?.total, fmt: v => n1(v) + " km³" },
  ], "hab");
}

/* ---------------------------------------------------------------- sols */
function drawSols() {
  const So = D()?.sols; if (!So) { kpis("#so-kpis", []); empty("#so-chart"); empty("#so-usage"); return; }
  const S = So.serie, last = S.at(-1);
  const share = (s, k) => 100 * (s.couverture[k] || 0) / s.total_km2;
  const a0 = S[0];
  kpis("#so-kpis", [
    [n0(last.total_km2) + " km²", `de territoire (enquête LUCAS ${last.annee})`],
    [pct(share(last, "A00")), `artificialisé (bâtiments, routes, parkings…), contre ${pct(share(a0, "A00"))} en ${a0.annee}`],
    [pct(share(last, "C00"), 0), "couvert de forêts et de bois"],
    [pct(share(last, "B00") + share(last, "E00"), 0), "de cultures et de prairies"],
  ]);
  const el = $("#so-chart");
  el.innerHTML = `<div class="cmp">${S.map(s => `<div class="cmp-row"><span class="cmp-name">${s.annee}</span><span class="cmp-stack" style="width:100%">${So.couverture.map(([k, l, c]) => {
    const v = share(s, k); return v > 0 ? `<span style="flex:${v} 0 0;background:${c}" data-t="${esc(l)} : ${pct(v)} (${n0(s.couverture[k])} km²)"></span>` : ""; }).join("")}</span><span class="cmp-val">${pct(share(s, "A00"))} artif.</span></div>`).join("")}</div>`;
  el.querySelectorAll("[data-t]").forEach(sp => { sp.onpointermove = ev => showTip(sp.dataset.t, ev); sp.onpointerleave = hideTip; });
  legend("#so-legend", So.couverture.map(c => [c[1], c[2]]));
  const tot = last.total_km2;
  bars($("#so-usage"), So.usage.filter(([k]) => last.usage[k]).map(([k, l, c]) => ({ l, v: 100 * last.usage[k] / tot, t: `${pct(100 * last.usage[k] / tot)} · ${n0(last.usage[k])} km²`, c })).sort((a, b) => b.v - a.v), { max: 60 });
  table($("#so-cmp"), "so", [
    { k: "A00", l: "Artificialisé", f: r => r.sols?.A00, fmt: v => pct(v), max: 15, c: "#9ca3af", y: r => r.sols?.annee },
    { k: "C00", l: "Forêts", f: r => r.sols?.C00, fmt: v => pct(v, 0), max: 80, c: "#166534" },
    { k: "B00", l: "Cultures", f: r => r.sols?.B00, fmt: v => pct(v, 0), max: 60, c: "#eab308" },
    { k: "E00", l: "Prairies", f: r => r.sols?.E00, fmt: v => pct(v, 0), max: 60, c: "#a3e635" },
  ], "A00");
}

/* ---------------------------------------------------------------- alimentation */
function drawAlim() {
  const A = D()?.alimentation, sel = $("#al-year");
  if (!A) { kpis("#al-kpis", []); empty("#al-sankey"); empty("#al-kcal"); sel.innerHTML = ""; return; }
  const ys = Object.keys(A.annees).sort();
  if (!ys.includes(sel.value)) sel.innerHTML = ys.map(y => `<option${y === ys.at(-1) ? " selected" : ""}>${y}</option>`).join("");
  const y = sel.value, Y = A.annees[y];
  const G = A.groupes, lab = Object.fromEntries(G.map(g => [g[0], g[1]])), col = Object.fromEntries(G.map(g => [g[0], g[2]]));
  const tot = k => d3.sum(Object.values(Y.groupes), g => g[k] || 0);
  const prod = tot("production"), supply = prod + tot("importations") - tot("exportations") + tot("stock");
  kpis("#al-kpis", [
    Y.kcal && [n0(Y.kcal) + " kcal", `disponibles par personne et par jour en ${y} (consommées ou gaspillées)`],
    Y.kcal_animal && [pct(100 * Y.kcal_animal / Y.kcal, 0), "des calories viennent de produits animaux"],
    [pct(100 * prod / supply, 0), "taux d'autosuffisance en tonnage (production ÷ disponibilité)"],
    [n0(tot("importations") / 1000) + " Mt", `importées, ${n0(tot("exportations") / 1000)} Mt exportées`],
  ]);
  // diagramme de flux
  const USES = [["alimentation", "Alimentation humaine", "#16a34a"], ["animaux", "Nourriture des animaux", "#a16207"], ["transformation", "Transformation (huile, sucre, alcool…)", "#7c3aed"],
    ["autres_usages", "Autres usages (biocarburants, industrie)", "#64748b"], ["semences", "Semences", "#84cc16"], ["pertes", "Pertes (stockage, transport)", "#9ca3af"], ["exportations", "Exportations", "#94a3b8"]];
  const nodes = [{ id: "o_prod", label: "Production nationale", color: "#16a34a" }, { id: "o_imp", label: "Importations", color: "#dc2626" }];
  const links = [];
  G.forEach(([k]) => {
    const g = Y.groupes[k]; if (!g) return;
    const ins = (g.production || 0) + (g.importations || 0);
    if (ins < 50) return;
    nodes.push({ id: k, label: lab[k], color: col[k] });
    if (g.production > 20) links.push({ source: "o_prod", target: k, value: g.production });
    if (g.importations > 20) links.push({ source: "o_imp", target: k, value: g.importations });
    USES.forEach(([u]) => { if ((g[u] || 0) > 20) links.push({ source: k, target: "u_" + u, value: g[u] }); });
  });
  USES.forEach(([u, l, c]) => { if (links.some(x => x.target === "u_" + u)) nodes.push({ id: "u_" + u, label: l, color: c }); });
  const el = $("#al-sankey"), W = 1100, H = 640;
  try {
    const Gr = d3.sankey().nodeId(d => d.id).nodeSort(null).nodeWidth(12).nodePadding(7).extent([[1, 20], [W - 230, H - 4]])({ nodes: nodes.map(n => ({ ...n })), links: links.map(l => ({ ...l })) });
    const svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`);
    ["Origine", "Produits", "Usages"].forEach((t, i) => svg.append("text").attr("class", "colhead").attr("x", [1, Gr.nodes.find(n => n.depth === 1)?.x0 || 300, Gr.nodes.find(n => n.depth === 2)?.x0 || 800][i]).attr("y", 12).text(t));
    svg.append("g").selectAll("path").data(Gr.links).join("path").attr("class", "link").attr("d", d3.sankeyLinkHorizontal())
      .attr("stroke", d => d.source.id.startsWith("o_") ? d.target.color : d.source.color).attr("stroke-width", d => Math.max(1, d.width))
      .on("pointermove", (ev, d) => showTip(`<b>${esc(d.source.label)} → ${esc(d.target.label)}</b><br>${n0(d.value)} milliers de tonnes`, ev)).on("pointerleave", hideTip);
    const nd = svg.append("g").selectAll("g").data(Gr.nodes).join("g").attr("class", "node");
    nd.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => d.x1 - d.x0).attr("height", d => Math.max(1, d.y1 - d.y0)).attr("fill", d => d.color);
    nd.append("text").attr("x", d => d.x1 + 6).attr("y", d => (d.y0 + d.y1) / 2).attr("dy", ".35em").text(d => `${d.label}  `).append("tspan").attr("class", "amt").text(d => n1(d.value / 1000) + " Mt");
    el.replaceChildren(svg.node());
  } catch (e) { el.innerHTML = `<p class="empty">Diagramme indisponible.</p>`; }
  bars($("#al-kcal"), G.filter(([k]) => Y.groupes[k]?.kcal).map(([k, l, c]) => ({ l, v: Y.groupes[k].kcal, t: `${n0(Y.groupes[k].kcal)} kcal · ${n0(Y.groupes[k].kg_hab || 0)} kg/an`, c })).sort((a, b) => b.v - a.v));
  table($("#al-cmp"), "al", [
    { k: "kcal", l: "Calories disponibles / jour", f: r => r.alim?.kcal, fmt: v => n0(v) + " kcal", max: 4000, c: "#16a34a", y: r => r.alim?.annee },
    { k: "anim", l: "Part animale", f: r => r.alim?.part_animal, fmt: v => pct(v, 0), max: 50, c: "#dc2626" },
  ], "kcal");
}

/* ---------------------------------------------------------------- commerce (France) */
const HS = { "01": "Animaux vivants", "02": "Viandes", "03": "Poissons", "04": "Lait, œufs, miel", "07": "Légumes", "08": "Fruits", "09": "Café, thé, épices", "10": "Céréales", "12": "Graines oléagineuses", "15": "Huiles et graisses", "16": "Préparations de viande, poisson", "17": "Sucres", "18": "Cacao", "19": "Préparations de céréales", "20": "Préparations de légumes, fruits", "21": "Préparations alimentaires diverses", "22": "Boissons (vins, spiritueux)", "23": "Aliments pour animaux", "24": "Tabac", "25": "Sel, pierres, ciment", "26": "Minerais", "27": "Combustibles (pétrole, gaz, électricité)", "28": "Chimie inorganique", "29": "Chimie organique", "30": "Médicaments", "31": "Engrais", "32": "Peintures, colorants", "33": "Parfums, cosmétiques", "34": "Savons, cires", "38": "Produits chimiques divers", "39": "Plastiques", "40": "Caoutchouc", "42": "Maroquinerie", "44": "Bois", "47": "Pâte à papier", "48": "Papier, carton", "49": "Livres, imprimés", "52": "Coton", "61": "Vêtements en maille", "62": "Vêtements (hors maille)", "63": "Textiles divers", "64": "Chaussures", "69": "Céramique", "70": "Verre", "71": "Perles, pierres et métaux précieux, bijoux", "72": "Fonte, fer, acier", "73": "Ouvrages en fer ou acier", "74": "Cuivre", "76": "Aluminium", "82": "Outils", "83": "Ouvrages en métaux", "84": "Machines, réacteurs, chaudières, ordinateurs", "85": "Machines et appareils électriques, électronique", "86": "Matériel ferroviaire", "87": "Voitures, camions, pièces", "88": "Avions, engins spatiaux", "89": "Navires", "90": "Optique, instruments médicaux", "91": "Horlogerie", "93": "Armes", "94": "Meubles, literie, luminaires", "95": "Jouets, jeux, sport", "96": "Ouvrages divers", "97": "Objets d'art", "99": "Divers non classés" };
function drawCommerce() {
  const sec = $("#commerce"); if (!sec) return;
  if (!COM) { empty("#co-partners"); return; }
  const A = COM.agregats.WORLD;
  kpis("#co-kpis", [
    [n0(A.export) + " Md€", `de marchandises exportées par la France en ${COM.annee}`],
    [n0(A.import) + " Md€", "importées"],
    [(A.export - A.import < 0 ? "−" : "+") + n0(Math.abs(A.export - A.import)) + " Md€", "solde commercial des biens"],
    [n0(A.import_t) + " Mt / " + n0(A.export_t) + " Mt", "tonnes importées / exportées : la France importe des matières lourdes, exporte des produits chers"],
    [pct(100 * COM.agregats.INT_EU27_2020.import / A.import, 0), "des importations viennent de l'Union européenne"],
  ]);
  const P = [...COM.partenaires].sort((a, b) => (b.import + b.export) - (a.import + a.export)).slice(0, 20);
  const mx = d3.max(P, p => Math.max(p.import, p.export));
  $("#co-partners").innerHTML = `<div class="cmp">${P.map(p => { const bal = p.export - p.import;
    return `<div class="cmp-row" style="grid-template-columns:minmax(110px,170px) 1fr 1fr minmax(70px,auto)"><span class="cmp-name">${esc(regionName(p.code) || p.nom)}</span>
      <span style="display:flex;justify-content:flex-end"><span style="height:14px;width:${100 * p.import / mx}%;background:#dc2626;border-radius:2px" title="Importations ${n1(p.import)} Md€"></span></span>
      <span><span style="display:block;height:14px;width:${100 * p.export / mx}%;background:#16a34a;border-radius:2px" title="Exportations ${n1(p.export)} Md€"></span></span>
      <span class="cmp-val" style="color:${bal < 0 ? "var(--neg)" : "var(--pos)"}">${bal < 0 ? "−" : "+"}${n1(Math.abs(bal))}</span></div>`; }).join("")}</div>`;
  legend("#co-legend", [["Importations (à gauche)", "#dc2626"], ["Exportations (à droite)", "#16a34a"]]);
  const pr = COM.produits.map(p => ({ ...p, nom: HS[p.code] || p.nom.charAt(0) + p.nom.slice(1).toLowerCase(), bal: p.export_tot - p.import_tot }));
  const deficits = [...pr].sort((a, b) => a.bal - b.bal).slice(0, 10), excedents = [...pr].sort((a, b) => b.bal - a.bal).slice(0, 10);
  bars($("#co-def"), deficits.map(p => ({ l: p.nom, v: p.bal, t: `${n1(p.bal)} Md€ (imp. ${n0(p.import_tot)}, exp. ${n0(p.export_tot)})`, c: "#dc2626" })));
  bars($("#co-exc"), excedents.map(p => ({ l: p.nom, v: p.bal, t: `+${n1(p.bal)} Md€ (exp. ${n0(p.export_tot)}, imp. ${n0(p.import_tot)})`, c: "#16a34a" })));
  lineChart($("#co-hist"), COM.historique.map(h => ({ ...h, solde: h.export - h.import })), [
    { k: "import", l: "Importations", c: "#dc2626" }, { k: "export", l: "Exportations", c: "#16a34a" }, { k: "solde", l: "Solde", c: css("--ink"), dash: "5 3" }],
    { yfmt: v => n0(v) + " Md€", vfmt: v => n1(v) + " Md€" });
}

/* ---------------------------------------------------------------- démographie */
function drawDemo() {
  const Dm = D()?.demographie; if (!Dm) { kpis("#de-kpis", []); empty("#de-pyr"); return; }
  const S = Dm.serie, last = S.at(-1), lastB = [...S].reverse().find(s => s.naissances != null);
  kpis("#de-kpis", [
    [n1(last.population / 1e6) + " M", `d'habitants au 1er janvier ${last.annee}`],
    lastB && [n0(lastB.naissances), `naissances en ${lastB.annee}`],
    lastB && [n0(lastB.deces), "décès"],
    lastB && lastB.solde_migratoire != null && [(lastB.solde_migratoire >= 0 ? "+" : "−") + n0(Math.abs(lastB.solde_migratoire)), "solde migratoire (arrivées − départs, estimé)"],
  ]);
  // pyramide
  const el = $("#de-pyr"), py = Dm.pyramide, Y = Object.keys(py).sort(), cur = py[Y.at(-1)], old = Y.length > 1 ? py[Y[0]] : null;
  if (cur) {
    const w = Math.max(300, Math.min(720, el.clientWidth)), h = 420, m = { t: 20, b: 24, mid: 30 };
    const mx = d3.max([...cur, ...(old || [])], r => Math.max(r[1], r[2]));
    const xL = d3.scaleLinear([0, mx], [w / 2 - m.mid, 10]), xR = d3.scaleLinear([0, mx], [w / 2 + m.mid, w - 10]);
    const y = d3.scaleLinear([0, 100], [h - m.b, m.t]), bh = (h - m.t - m.b) / 100;
    const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("g").selectAll("rect").data(cur).join("rect").attr("x", d => xL(d[1])).attr("y", d => y(d[0] + 1)).attr("width", d => xL(0) - xL(d[1])).attr("height", bh - .3).attr("fill", "#3b6fd6");
    svg.append("g").selectAll("rect").data(cur).join("rect").attr("x", xR(0)).attr("y", d => y(d[0] + 1)).attr("width", d => xR(d[2]) - xR(0)).attr("height", bh - .3).attr("fill", "#e15759");
    if (old) {
      svg.append("path").attr("fill", "none").attr("stroke", css("--ink")).attr("stroke-width", 1.2).attr("d", d3.line().curve(d3.curveStepAfter).x(d => xL(d[1])).y(d => y(d[0]))(old));
      svg.append("path").attr("fill", "none").attr("stroke", css("--ink")).attr("stroke-width", 1.2).attr("d", d3.line().curve(d3.curveStepAfter).x(d => xR(d[2])).y(d => y(d[0]))(old));
    }
    [0, 20, 40, 60, 80, 100].forEach(a => svg.append("text").attr("x", w / 2).attr("y", y(a)).attr("dy", ".35em").attr("text-anchor", "middle").attr("font-size", 10).attr("fill", css("--muted")).text(a));
    svg.append("text").attr("x", 10).attr("y", 12).attr("font-size", 11).attr("fill", "#3b6fd6").text("Hommes");
    svg.append("text").attr("x", w - 10).attr("y", 12).attr("text-anchor", "end").attr("font-size", 11).attr("fill", "#e15759").text("Femmes");
    svg.append("rect").attr("width", w).attr("height", h).attr("fill", "transparent").on("pointermove", ev => {
      const a = Math.max(0, Math.min(99, Math.floor(y.invert(d3.pointer(ev)[1])))); const r = cur.find(d => d[0] === a), o = old?.find(d => d[0] === a); if (!r) return;
      showTip(`<b>${a} ans</b> (né${a ? "s" : "s"} en ${+Y.at(-1) - a - 1})<br>Hommes : ${n0(r[1])}<br>Femmes : ${n0(r[2])}` + (o ? `<br><i>En ${Y[0]} : ${n0(o[1] + o[2])}</i>` : ""), ev);
    }).on("pointerleave", hideTip);
    el.replaceChildren(svg.node());
    legend("#de-pyr-legend", [[`Hommes ${Y.at(-1)}`, "#3b6fd6"], [`Femmes ${Y.at(-1)}`, "#e15759"], ...(old ? [[`Contour : ${Y[0]}`, css("--ink"), true]] : [])]);
  }
  lineChart($("#de-flux"), S.filter(s => s.naissances != null), [
    { k: "naissances", l: "Naissances", c: "#16a34a" }, { k: "deces", l: "Décès", c: css("--ink") }, { k: "solde_migratoire", l: "Solde migratoire", c: "#f97316", dash: "5 3" }], { yfmt: v => mill(v) });
  if (Dm.projection.length) {
    const P = Dm.projection.map(p => ({ annee: p.annee, moins20: p.moins20, a20_64: p.a20_64, a65_79: p.plus65 - p.plus80, plus80: p.plus80 }));
    areaChart($("#de-proj"), P, ["moins20", "a20_64", "a65_79", "plus80"], { moins20: "#84cc16", a20_64: "#3b6fd6", a65_79: "#f59e0b", plus80: "#dc2626" },
      { moins20: "Moins de 20 ans", a20_64: "20 à 64 ans", a65_79: "65 à 79 ans", plus80: "80 ans et plus" }, { vfmt: v => n1(v / 1e6) + " M", yfmt: v => n0(v / 1e6) + " M", h: 260 });
    legend("#de-proj-legend", [["Moins de 20 ans", "#84cc16"], ["20 à 64 ans", "#3b6fd6"], ["65 à 79 ans", "#f59e0b"], ["80 ans et plus", "#dc2626"]]);
  }
  table($("#de-cmp"), "de", [
    { k: "pop", l: "Population", f: r => r.demo?.population, fmt: v => n1(v / 1e6) + " M", y: r => r.demo?.annee },
    { k: "nat", l: "Naissances / 1000 hab.", f: r => r.demo?.naissances ? 1000 * r.demo.naissances / r.demo.population : null, fmt: v => n1(v), max: 15, c: "#16a34a" },
    { k: "dec", l: "Décès / 1000 hab.", f: r => r.demo?.deces ? 1000 * r.demo.deces / r.demo.population : null, fmt: v => n1(v), max: 18, c: "#475569" },
  ], "nat");
}

/* ---------------------------------------------------------------- immigration */
function drawImmig() {
  const I = D()?.immigration; if (!I) { kpis("#im-kpis", []); empty("#im-stock"); return; }
  const st = I.stock.at(-1), fl = [...I.flux].reverse().find(f => f.immigration != null);
  kpis("#im-kpis", [
    st && [n1(st.nes_etranger / 1e6) + " M", `de personnes nées à l'étranger au 1er janvier ${st.annee}, soit ${pct(100 * st.nes_etranger / st.total)} de la population`],
    st && st.nes_hors_ue != null && [n1(st.nes_hors_ue / 1e6) + " M", "nées hors de l'Union européenne"],
    fl && [n0(fl.immigration), `arrivées en ${fl.annee} (dont ${n0(fl.immig_nationaux || 0)} nationaux de retour)`],
    fl && fl.emigration != null && [n0(fl.emigration), `départs (dont ${n0(fl.emig_nationaux || 0)} nationaux)`],
  ]);
  if (I.stock.length) {
    const data = I.stock.map(s => ({ annee: s.annee, ue: s.nes_ue, hors_ue: s.nes_hors_ue, part: 100 * s.nes_etranger / s.total }));
    areaChart($("#im-stock"), data, ["ue", "hors_ue"], { ue: "#3b6fd6", hors_ue: "#f59e0b" }, { ue: "Nés dans un autre pays de l'UE", hors_ue: "Nés hors de l'UE" },
      { vfmt: v => n2(v / 1e6) + " M", yfmt: v => n0(v / 1e6) + " M", h: 260 });
    legend("#im-stock-legend", [["Nés dans un autre pays de l'UE", "#3b6fd6"], ["Nés hors de l'UE", "#f59e0b"]]);
  } else empty("#im-stock");
  if (I.flux.length) lineChart($("#im-flux"), I.flux, [
    { k: "immigration", l: "Arrivées (total)", c: "#f97316" }, { k: "immig_hors_ue", l: "dont étrangers hors UE", c: "#f59e0b", dash: "5 3" },
    { k: "immig_nationaux", l: "dont nationaux de retour", c: "#3b6fd6", dash: "2 3" }, { k: "emigration", l: "Départs (total)", c: css("--ink") }], { yfmt: v => n0(v / 1000) + " k" });
  table($("#im-cmp"), "im", [
    { k: "part", l: "Part de la population née à l'étranger", f: r => r.immig?.part_nes_etranger, fmt: v => pct(v), max: 50, c: "#f59e0b", y: r => r.immig?.annee },
    { k: "solde", l: "Solde migratoire / 1000 hab.", f: r => r.demo?.solde_migratoire != null ? 1000 * r.demo.solde_migratoire / r.demo.population : null, fmt: v => n1(v) },
  ], "part");
}

/* ---------------------------------------------------------------- temps de travail */
function drawTravail() {
  const T = D()?.travail; if (!T) { kpis("#tt-kpis", []); empty("#tt-chart"); return; }
  const S = T.serie, last = S.at(-1);
  const dispo = last.population * 8760;
  kpis("#tt-kpis", [
    [n1(last.heures / 1e9) + " Md h", `travaillées dans le pays en ${last.annee}`],
    [pct(100 * last.heures / dispo, 1), "du temps total de la population (habitants × 24 h × 365 j)"],
    [n0(last.heures / last.population) + " h", "par habitant et par an, tous âges confondus"],
    last.emplois && [n0(last.heures / last.emplois) + " h", `par personne en emploi (${n1(last.emplois / 1e6)} M d'emplois)`],
  ]);
  const B = T.branches, cols = d3.schemeTableau10;
  const col = Object.fromEntries(B.map((b, i) => [b[0], cols[i % 10]])), lab = Object.fromEntries(B);
  areaChart($("#tt-chart"), S.map(s => ({ annee: s.annee, ...Object.fromEntries(B.map(([k]) => [k, s.branches[k] / 1e9])) })), B.map(b => b[0]), col, lab,
    { vfmt: v => n2(v) + " Md h", yfmt: v => n0(v) + " Md h" });
  legend("#tt-legend", B.map(([k, l]) => [l, col[k]]));
  const E = T.emploi_du_temps;
  if (E) {
    const L = Object.fromEntries(T.tus_labels), C = ["#64748b", "#f59e0b", "#a8a29e", "#3b6fd6", "#8b5cf6", "#e07b39", "#16a34a", "#0ea5e9", "#d6d3d1"];
    const tot = d3.sum(Object.values(E.minutes).filter(v => v != null));
    const h = m => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
    $("#tt-jour").innerHTML = `<div class="cmp"><div class="cmp-row"><span class="cmp-name">Journée moyenne<small>${E.annee}, 15 ans et +</small></span><span class="cmp-stack" style="width:100%;height:26px">${T.tus_labels.map(([k], i) => E.minutes[k] ? `<span style="flex:${E.minutes[k]} 0 0;background:${C[i]}" data-t="${esc(L[k])} : ${h(E.minutes[k])}"></span>` : "").join("")}</span><span class="cmp-val">${h(tot)}</span></div></div>`;
    $("#tt-jour").querySelectorAll("[data-t]").forEach(sp => { sp.onpointermove = ev => showTip(sp.dataset.t, ev); sp.onpointerleave = hideTip; });
    legend("#tt-jour-legend", T.tus_labels.filter(([k]) => E.minutes[k]).map(([k, l], i) => [`${l} (${h(E.minutes[k])})`, C[T.tus_labels.findIndex(x => x[0] === k)]]));
  } else { empty("#tt-jour", "Pas d'enquête emploi du temps harmonisée pour ce pays."); $("#tt-jour-legend").innerHTML = ""; }
  table($("#tt-cmp"), "tt", [
    { k: "hab", l: "Heures travaillées par habitant", f: r => r.travail?.heures_hab, fmt: v => n0(v) + " h", max: 1000, c: "#3b6fd6", y: r => r.travail?.annee },
    { k: "emp", l: "par personne en emploi", f: r => r.travail?.heures_emploi, fmt: v => n0(v) + " h", max: 2000, c: "#64748b" },
  ], "hab");
}

/* ---------------------------------------------------------------- justice */
function drawJustice() {
  const J = D()?.justice; if (!J) { kpis("#ju-kpis", []); empty("#ju-off"); return; }
  const S = J.serie, last = k => [...S].reverse().find(s => s[k] != null);
  const det = last("detenus"), jug = last("juges"), pol = last("policiers");
  const lastOff = [...S].reverse().find(s => Object.values(s.taux).some(v => v != null));
  kpis("#ju-kpis", [
    det && [n0(det.detenus), `personnes détenues en ${det.annee}` + (det.places ? `, pour ${n0(det.places)} places (${pct(100 * det.detenus / det.places, 0)} d'occupation)` : "")],
    det?.detenus_100k && [n0(det.detenus_100k), "détenus pour 100 000 habitants"],
    pol && [n0(pol.policiers), `policiers et gendarmes (${pol.annee})`],
    jug && [n0(jug.juges), `juges professionnels (${jug.annee}), soit ${n1(jug.juges_100k)} pour 100 000 habitants`],
  ]);
  if (lastOff) {
    const L = Object.fromEntries(J.categories);
    bars($("#ju-off"), J.categories.filter(([k]) => lastOff.taux[k] != null).map(([k, l]) => ({ l, v: lastOff.taux[k], t: `${n1(lastOff.taux[k])} pour 100 000 hab. · ${n0(lastOff.infractions[k] || 0)} faits` }))
      .sort((a, b) => b.v - a.v));
    $("#ju-off-title").textContent = `Infractions enregistrées par la police et la gendarmerie en ${lastOff.annee}`;
  } else empty("#ju-off");
  lineChart($("#ju-pris"), S, [{ k: "detenus", l: "Détenus", c: "#dc2626" }, { k: "places", l: "Places de prison", c: css("--ink"), dash: "5 3" }], { yfmt: v => n0(v / 1000) + " k" });
  table($("#ju-cmp"), "ju", [
    { k: "det", l: "Détenus / 100 000 hab.", f: r => r.justice?.detenus_100k, fmt: v => n0(v), max: 250, c: "#dc2626" },
    { k: "pol", l: "Policiers / 100 000", f: r => r.justice?.policiers_100k, fmt: v => n0(v), max: 600, c: "#3b6fd6" },
    { k: "jug", l: "Juges / 100 000", f: r => r.justice?.juges_100k, fmt: v => n1(v), max: 45, c: "#8b5cf6" },
    { k: "hom", l: "Homicides / 100 000", f: r => r.justice?.homicides_100k, fmt: v => n2(v), max: 5, c: "#475569" },
  ], "det");
}

window.TH = { areaChart, lineChart, bars, kpis, legend, showTip, hideTip, table: null, esc, n0, n1, n2, pct, css };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
