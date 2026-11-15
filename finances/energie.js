/* Section Énergie : bilan Eurostat (diagramme de flux), séries Our World in Data, éCO2mix en direct */
(() => {
"use strict";

const $ = s => document.querySelector(s);
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const twh = v => (Math.abs(v) >= 100 ? nf0.format(v) : nf1.format(v)) + " TWh";
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
let INDEX = null, POP = {}, geo = "FR", unit = "twh", histKind = "primaire", locked = null;

async function load(g) {
  if (!CACHE[g]) {
    try { CACHE[g] = await fetch(`data/energie/${g}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }); }
    catch (e) { CACHE[g] = null; }
  }
  return CACHE[g];
}

async function init() {
  try {
    INDEX = await fetch("data/energie/index.json").then(r => r.json());
    const cmp = await fetch("data/comparaison.json").then(r => r.json());
    cmp.comparaison.forEach(c => { if (c.pib) POP[c.code] = c.pib.population; });
  } catch (e) { return; }
  document.querySelectorAll("#en-unit button").forEach(b => b.onclick = () => {
    unit = b.dataset.u; document.querySelectorAll("#en-unit button").forEach(o => o.setAttribute("aria-pressed", o === b)); draw();
  });
  document.querySelectorAll("#en-hist-kind button").forEach(b => b.onclick = () => {
    histKind = b.dataset.k; document.querySelectorAll("#en-hist-kind button").forEach(o => o.setAttribute("aria-pressed", o === b)); drawHist();
  });
  $("#en-year").onchange = () => { locked = null; draw(); };
  document.addEventListener("geochange", e => setGeo(e.detail));
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { draw(); drawLive(); }, 150); });
  await setGeo($("#geo")?.value || "FR");
  drawCompare();
  loadLive();
}

async function setGeo(g) {
  geo = g;
  const D = await load(g);
  const years = D ? Object.keys(D.bilan).sort() : [];
  const sel = $("#en-year");
  const prev = sel.value;
  sel.innerHTML = years.map(y => `<option${y === (years.includes(prev) ? prev : years.at(-1)) ? " selected" : ""}>${y}</option>`).join("");
  sel.disabled = !years.length;
  $("#en-live-wrap").hidden = g !== "FR";
  locked = null;
  draw(); drawHist(); drawCompare();
}

function population() {
  return POP[geo] || null;
}
function fmt(v, total) {
  if (unit === "pct") return pct(100 * v / total);
  if (unit === "hab" && population()) return nf0.format(v * 1e9 / population()) + " kWh/hab.";
  return twh(v);
}

/* ---------------------------------------------------------------- diagramme de flux */
function draw() {
  const D = CACHE[geo], el = $("#en-sankey");
  if (!D) {
    $("#en-kpis").innerHTML = `<p class="empty">Eurostat ne publie pas de bilan énergétique pour ce pays.</p>`;
    el.replaceChildren(); return;
  }
  const y = $("#en-year").value, B = D.bilan[y], K = B.kpi;
  const P = population();
  kpis([
    [twh(K.disponible), `énergie disponible en ${y}${P ? ` (${nf0.format(K.disponible * 1e9 / P)} kWh par habitant)` : ""}`],
    [pct(K.independance, 0), "taux d'indépendance (production nationale ÷ disponible)"],
    [pct(K.part_fossile, 0), "part du pétrole, du gaz et du charbon dans la consommation"],
    [twh(K.conso_finale), "consommation finale (logements, transports, industrie…)"],
    [twh(K.pertes_conversion), "pertes de conversion dans les centrales et raffineries"],
  ]);
  const total = d3.sum(B.links.filter(l => l[0].startsWith("o_")), l => l[2]);

  const W = 1240, H = 780, top = 26;
  const usedCols = [...new Set(B.nodes.map(n => n.col))].sort((a, b) => a - b);   // pas de colonne vide (pays sans raffinerie…)
  const nodes = B.nodes.map(n => ({ ...n, _c: usedCols.indexOf(n.col) }));
  const links = B.links.map(([s, t, v, k]) => ({ source: s, target: t, value: v, kind: k }));
  const sk = d3.sankey().nodeId(d => d.id).nodeAlign(n => n._c).nodeSort(null)
    .nodeWidth(12).nodePadding(9).extent([[1, top], [W - 215, H - 4]]);
  let G;
  try { G = sk({ nodes, links }); } catch (e) { el.innerHTML = `<p class="empty">Diagramme indisponible pour ${y}.</p>`; return; }
  const svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`);
  const heads = ["Origine", "Énergies primaires", "Raffinage", "Centrales", "Énergie livrée", "Usages et pertes"];
  const colX = d3.rollup(G.nodes, v => v[0].x0, d => d.col);
  svg.append("g").selectAll("text").data([...colX]).join("text").attr("class", "colhead").attr("x", ([, x]) => x).attr("y", 12).text(([c]) => heads[c]);
  const defs = svg.append("defs");
  G.links.forEach((l, i) => {
    const gr = defs.append("linearGradient").attr("id", "eg" + i).attr("gradientUnits", "userSpaceOnUse").attr("x1", l.source.x1).attr("x2", l.target.x0);
    gr.append("stop").attr("offset", "0%").attr("stop-color", l.source.color);
    gr.append("stop").attr("offset", "100%").attr("stop-color", l.target.color);
    l._g = "eg" + i;
  });
  const link = svg.append("g").selectAll("path").data(G.links).join("path").attr("class", "link")
    .attr("d", d3.sankeyLinkHorizontal()).attr("stroke", d => `url(#${d._g})`).attr("stroke-width", d => Math.max(1, d.width))
    .on("pointermove", (ev, d) => showTip(`<b>${esc(d.source.label)} → ${esc(d.target.label)}</b><br>${fmt(d.value, total)}${unit !== "twh" ? ` (${twh(d.value)})` : ""}`, ev))
    .on("pointerleave", hideTip);
  const node = svg.append("g").selectAll("g").data(G.nodes).join("g").attr("class", "node");
  node.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => d.x1 - d.x0).attr("height", d => Math.max(1, d.y1 - d.y0)).attr("fill", d => d.color);
  const big = d => (d.y1 - d.y0) > 24;
  const lab = node.append("text").attr("x", d => d.x1 + 6).attr("y", d => (d.y0 + d.y1) / 2).attr("dy", d => big(d) ? "-0.15em" : "0.35em");
  lab.append("tspan").text(d => d.label + (big(d) ? "" : "  "));
  lab.append("tspan").attr("class", "amt").attr("x", d => big(d) ? d.x1 + 6 : null).attr("dy", d => big(d) ? "1.15em" : null)
    .text(d => (d.y1 - d.y0) > 7 ? fmt(d.value, total) : "");
  function hl(d) {
    if (!d) { link.classed("dim", false).classed("hi", false); node.classed("dim", false); return; }
    const set = new Set([...d.sourceLinks, ...d.targetLinks]), ns = new Set([d]);
    set.forEach(l => { ns.add(l.source); ns.add(l.target); });
    link.classed("dim", l => !set.has(l)).classed("hi", l => set.has(l)); node.classed("dim", n => !ns.has(n));
  }
  node.on("pointerenter", (ev, d) => { if (!locked) hl(d); })
    .on("pointermove", (ev, d) => {
      const outs = [...d.sourceLinks].sort((a, b) => b.value - a.value).slice(0, 6);
      const ins = [...d.targetLinks].sort((a, b) => b.value - a.value).slice(0, 6);
      showTip(`<b>${esc(d.label)}</b><br>${fmt(d.value, total)}${unit !== "twh" ? ` (${twh(d.value)})` : ""}` +
        (ins.length && d.col > 1 ? "<br>" + ins.map(l => `← ${esc(l.source.label)} : ${twh(l.value)}`).join("<br>") : "") +
        (outs.length ? "<br>" + outs.map(l => `→ ${esc(l.target.label)} : ${twh(l.value)}`).join("<br>") : ""), ev);
    })
    .on("pointerleave", () => { hideTip(); if (!locked) hl(null); })
    .on("click", (ev, d) => { ev.stopPropagation(); locked = locked === d.id ? null : d.id; hl(locked ? d : null); });
  svg.on("click", () => { locked = null; hl(null); });
  el.replaceChildren(svg.node());
}

function kpis(items) {
  $("#en-kpis").innerHTML = items.map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
}

/* ---------------------------------------------------------------- séries longues (OWID) */
function drawHist() {
  const D = CACHE[geo], el = $("#en-hist");
  const O = D?.owid;
  const rows = O ? O[histKind] : [];
  if (!rows || !rows.length) { el.innerHTML = `<p class="empty">Pas de série longue pour ce pays.</p>`; $("#en-hist-legend").innerHTML = ""; return; }
  const keys = O.sources.map(s => s[0]), lab = Object.fromEntries(O.sources.map(s => [s[0], s[1]])), col = Object.fromEntries(O.sources.map(s => [s[0], s[2]]));
  const data = rows.map(r => { const o = { annee: r.annee }; keys.forEach(k => o[k] = r[k] || 0); return o; });
  const w = Math.max(320, el.clientWidth), h = 320, m = { t: 12, r: 12, b: 26, l: 54 };
  const series = d3.stack().keys(keys)(data);
  const x = d3.scaleLinear(d3.extent(data, d => d.annee), [m.l, w - m.r]);
  const y = d3.scaleLinear([0, d3.max(series.at(-1), d => d[1]) * 1.05], [h - m.b, m.t]).nice();
  const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`);
  svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(5)).join("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
  svg.append("g").selectAll("path").data(series).join("path").attr("fill", d => col[d.key]).attr("opacity", .9)
    .attr("d", d3.area().x(d => x(d.data.annee)).y0(d => y(d[0])).y1(d => y(d[1])))
    .on("pointermove", (ev, s) => {
      const [mx] = d3.pointer(ev); const yr = Math.round(x.invert(mx)); const r = data.find(d => d.annee === yr); if (!r) return;
      const tot = d3.sum(keys, k => r[k]);
      showTip(`<b>${yr}</b> · ${esc(lab[s.key])}<br>${twh(r[s.key])} (${pct(100 * r[s.key] / tot, 0)})<br>Total : ${twh(tot)}`, ev);
    }).on("pointerleave", hideTip);
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(w < 560 ? 5 : 10));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => nf0.format(d) + " TWh")).call(g => g.select(".domain").remove());
  el.replaceChildren(svg.node());
  $("#en-hist-legend").innerHTML = O.sources.map(([k, l, c]) => `<span><i style="border-top-color:${c};opacity:1;border-top-width:10px;width:14px"></i>${esc(l)}</span>`).join("");
}

/* ---------------------------------------------------------------- éCO2mix en direct */
let LIVE = null;
const LIVE_SRC = [
  ["nucleaire", "Nucléaire", "#c084fc"], ["hydraulique", "Hydraulique", "#2b8cbe"], ["eolien", "Éolien", "#7bccc4"],
  ["solaire", "Solaire", "#f6c445"], ["bioenergies", "Bioénergies", "#6a994e"], ["gaz", "Gaz", "#4f7cac"],
  ["fioul", "Fioul", "#8c6d46"], ["charbon", "Charbon", "#2f2f2f"],
];
async function loadLive() {
  const el = $("#en-live");
  const url = "https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/eco2mix-national-tr/exports/json?" + new URLSearchParams({
    select: "date_heure,consommation,nucleaire,gaz,charbon,fioul,hydraulique,eolien,solaire,bioenergies,pompage,ech_physiques,taux_co2",
    where: "date_heure >= now(days=-7) and consommation is not null", order_by: "date_heure",
  });
  try {
    const r = await fetch(url); if (!r.ok) throw new Error("HTTP " + r.status);
    LIVE = (await r.json()).map(d => ({ ...d, t: new Date(d.date_heure) }));
    drawLive();
  } catch (e) {
    el.innerHTML = `<p class="empty">Impossible de joindre le portail ODRÉ (${esc(e.message)}). Les données en direct s'afficheront quand il sera accessible.</p>`;
  }
}
function drawLive() {
  if (!LIVE || !LIVE.length || geo !== "FR") return;
  const el = $("#en-live");
  const w = Math.max(320, el.clientWidth), h = 340, h2 = 90, m = { t: 12, r: 46, b: 24, l: 54 };
  const keys = LIVE_SRC.map(s => s[0]);
  const data = LIVE.map(d => { const o = { t: d.t }; keys.forEach(k => o[k] = Math.max(0, d[k] || 0) / 1000); o.conso = d.consommation / 1000; o.co2 = d.taux_co2; o.ech = (d.ech_physiques || 0) / 1000; return o; });
  const series = d3.stack().keys(keys)(data);
  const x = d3.scaleTime(d3.extent(data, d => d.t), [m.l, w - m.r]);
  const y = d3.scaleLinear([0, d3.max(data, d => Math.max(d.conso, d3.sum(keys, k => d[k]))) * 1.05], [h - m.b, m.t]).nice();
  const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h + h2}`);
  svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(5)).join("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
  const col = Object.fromEntries(LIVE_SRC.map(s => [s[0], s[2]])), lab = Object.fromEntries(LIVE_SRC.map(s => [s[0], s[1]]));
  svg.append("g").selectAll("path").data(series).join("path").attr("fill", d => col[d.key]).attr("opacity", .9)
    .attr("d", d3.area().x(d => x(d.data.t)).y0(d => y(d[0])).y1(d => y(d[1])));
  svg.append("path").attr("fill", "none").attr("stroke", css("--ink")).attr("stroke-width", 1.8).attr("d", d3.line().x(d => x(d.t)).y(d => y(d.conso))(data));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`)
    .call(d3.axisBottom(x).ticks(w < 560 ? 4 : 8).tickFormat(d => d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => d + " GW")).call(g => g.select(".domain").remove());
  // intensité carbone
  const y2 = d3.scaleLinear([0, Math.max(60, d3.max(data, d => d.co2) * 1.1)], [h + h2 - 20, h + 10]);
  svg.append("text").attr("x", m.l).attr("y", h + 8).attr("font-size", 11).attr("fill", css("--muted")).text("Intensité carbone (g CO₂ par kWh)");
  svg.append("path").attr("fill", "none").attr("stroke", css("--neg")).attr("stroke-width", 1.6).attr("d", d3.line().x(d => x(d.t)).y(d => y2(d.co2))(data.filter(d => d.co2 != null)));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y2).ticks(3)).call(g => g.select(".domain").remove());
  // survol
  const bis = d3.bisector(d => d.t).center;
  const cursor = svg.append("line").attr("y1", m.t).attr("y2", h + h2 - 20).attr("stroke", css("--muted")).attr("stroke-dasharray", "3 3").attr("opacity", 0);
  svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h + h2 - m.t - 20).attr("fill", "transparent")
    .on("pointermove", ev => {
      const [mx] = d3.pointer(ev); const d = data[bis(data, x.invert(mx))]; if (!d) return;
      cursor.attr("x1", x(d.t)).attr("x2", x(d.t)).attr("opacity", 1);
      const prod = d3.sum(keys, k => d[k]);
      showTip(`<b>${d.t.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</b><br>Consommation : ${nf1.format(d.conso)} GW<br>` +
        keys.filter(k => d[k] > 0.05).map(k => `${lab[k]} : ${nf1.format(d[k])} GW (${pct(100 * d[k] / prod, 0)})`).join("<br>") +
        `<br>Échanges : ${d.ech < 0 ? "exporte " : "importe "}${nf1.format(Math.abs(d.ech))} GW<br>CO₂ : ${d.co2 ?? "–"} g/kWh`, ev);
    })
    .on("pointerleave", () => { hideTip(); cursor.attr("opacity", 0); });
  el.replaceChildren(svg.node());
  const last = data.at(-1);
  $("#en-live-legend").innerHTML = LIVE_SRC.map(([k, l, c]) => `<span><i style="border-top-color:${c};opacity:1;border-top-width:10px;width:14px"></i>${l}</span>`).join("") +
    `<span><i style="border-top-color:${css("--ink")};opacity:1"></i>Consommation</span><span class="muted">Dernière mesure : ${last.t.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>`;
}

/* ---------------------------------------------------------------- comparaison */
let cmpSort = { k: "par_hab", dir: -1 };
function drawCompare() {
  if (!INDEX) return;
  const el = $("#en-cmp");
  const cols = [
    { k: "conso_interieure", l: "Consommation intérieure", f: r => r.conso_interieure, fmt: twh },
    { k: "par_hab", l: "par habitant", f: r => POP[r.code] ? r.conso_interieure * 1e9 / POP[r.code] / 1000 : null, fmt: v => nf1.format(v) + " MWh", max: 120, c: "#3b6fd6" },
    { k: "independance", l: "Indépendance", f: r => r.independance, fmt: v => pct(v, 0), max: 120, c: "#16a34a" },
    { k: "part_fossile", l: "Part fossile", f: r => r.part_fossile, fmt: v => pct(v, 0), max: 100, c: "#5b4636" },
    { k: "pertes", l: "Pertes de conversion", f: r => r.conso_interieure ? 100 * r.pertes_conversion / r.conso_interieure : null, fmt: v => pct(v, 0), max: 35, c: "#9ca3af" },
    { k: "elec", l: "Électricité produite", f: r => r.electricite_produite, fmt: twh },
  ];
  const col = cols.find(c => c.k === cmpSort.k);
  const rows = [...INDEX.pays].sort((a, b) => { const va = col.f(a), vb = col.f(b); if (va == null) return 1; if (vb == null) return -1; return cmpSort.dir * (va - vb); });
  const cell = (c, r) => { const v = c.f(r); if (v == null) return `<td class="muted">–</td>`;
    return `<td>${c.fmt(v)}${c.max ? `<span class="ibar" style="width:${Math.min(70, 70 * v / c.max)}px;background:${c.c}"></span>` : ""}</td>`; };
  el.innerHTML = `<div class="table-scroll"><table class="cmp-t"><thead><tr><th>Pays</th>${cols.map(c => `<th data-k="${c.k}" class="${c.k === cmpSort.k ? "sorted" : ""}">${esc(c.l)}${c.k === cmpSort.k ? (cmpSort.dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.code === geo ? "me" : ""}"><td>${esc(r.nom)} <small class="muted">${r.annee}</small></td>${cols.map(c => cell(c, r)).join("")}</tr>`).join("")}</tbody></table></div>`;
  el.querySelectorAll("th[data-k]").forEach(th => th.onclick = () => {
    cmpSort = cmpSort.k === th.dataset.k ? { k: th.dataset.k, dir: -cmpSort.dir } : { k: th.dataset.k, dir: -1 }; drawCompare();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
