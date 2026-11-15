/* Section Territoire : carte des régions (électricité, PIB, revenu, population) */
(() => {
"use strict";

const $ = s => document.querySelector(s);
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
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

let T = null, view = "elec";
const VIEWS = {
  elec: { label: "Électricité", years: () => Object.keys(T.electricite).sort() },
  pib_hab: { label: "PIB par habitant", years: () => yearsWith("pib_hab") },
  revenu_hab: { label: "Revenu disponible par habitant", years: () => yearsWith("revenu_hab") },
  ratio: { label: "Revenu ÷ PIB", years: () => yearsWith("revenu_hab").filter(y => yearsWith("pib_hab").includes(y)) },
  pop: { label: "Population", years: () => yearsWith("pop") },
};
function yearsWith(k) {
  const s = new Set();
  Object.values(T.regions).forEach(r => Object.entries(r.serie).forEach(([y, v]) => { if (v[k] != null) s.add(y); }));
  return [...s].sort();
}

async function init() {
  try { T = await fetch("data/territoire.json").then(r => r.json()); } catch (e) { return; }
  document.querySelectorAll("#tr-view button").forEach(b => b.onclick = () => {
    view = b.dataset.v; document.querySelectorAll("#tr-view button").forEach(o => o.setAttribute("aria-pressed", o === b));
    fillYears(); draw();
  });
  $("#tr-year").onchange = draw;
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(draw, 150); });
  fillYears(); draw();
}

function fillYears() {
  const ys = VIEWS[view].years(), sel = $("#tr-year"), prev = sel.value;
  sel.innerHTML = ys.map(y => `<option${y === (ys.includes(prev) ? prev : ys.at(-1)) ? " selected" : ""}>${y}</option>`).join("");
}

function value(code, y) {
  const s = T.regions[code].serie[y] || {};
  if (view === "pib_hab") return s.pib_hab;
  if (view === "revenu_hab") return s.revenu_hab;
  if (view === "ratio") return s.revenu_hab && s.pib_hab ? 100 * s.revenu_hab / s.pib_hab : null;
  if (view === "pop") return s.pop;
  return null;
}
const fmtV = v => view === "ratio" ? nf0.format(v) + " %" : view === "pop" ? nf1.format(v / 1e6) + " M hab." : nf0.format(v) + " €";

function draw() {
  if (!T) return;
  const el = $("#tr-map"), y = $("#tr-year").value;
  const w = Math.min(760, Math.max(300, el.clientWidth)), h = Math.round(w * 0.95);
  const proj = d3.geoConicConformal().parallels([44, 49]).rotate([-3, 0]).fitExtent([[10, 10], [w - 10, h - 10]], T.geojson);
  const path = d3.geoPath(proj);
  const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`);
  const defs = svg.append("defs");
  defs.append("marker").attr("id", "tr-arrow").attr("viewBox", "0 0 10 10").attr("refX", 6).attr("refY", 5).attr("markerWidth", 3.2).attr("markerHeight", 3.2).attr("orient", "auto-start-reverse")
    .append("path").attr("d", "M0,0 L10,5 L0,10 z").attr("fill", css("--ink"));
  const feats = T.geojson.features;
  let fill, legendHtml = "", side = [];

  if (view === "elec") {
    const E = T.electricite[y];
    const max = d3.max(Object.values(E.regions), r => Math.abs(r.solde));
    const col = d3.scaleDiverging([-max, 0, max], t => d3.interpolateRdYlGn(1 - t));
    fill = code => E.regions[code] ? col(E.regions[code].solde) : css("--bg");
    legendHtml = `<span><i style="border-top-color:${col(-max)};opacity:1;border-top-width:10px;width:14px"></i>Produit plus qu'elle ne consomme</span><span><i style="border-top-color:${col(max)};opacity:1;border-top-width:10px;width:14px"></i>Consomme plus qu'elle ne produit</span><span><i style="border-top-color:${css("--ink")};opacity:1"></i>Flux estimés (largeur proportionnelle)</span>`;
    side = Object.entries(E.regions).map(([c, r]) => ({ c, nom: T.regions[c].nom, v: r.solde, txt: `${r.solde < 0 ? "exporte" : "importe"} ${nf1.format(Math.abs(r.solde))} TWh` }))
      .sort((a, b) => a.v - b.v);
    $("#tr-kpis").innerHTML = [
      [nf0.format(d3.sum(Object.values(E.regions), r => r.prod)) + " TWh", `électricité produite en ${y} (France continentale)`],
      [nf0.format(d3.sum(Object.values(E.regions), r => r.conso)) + " TWh", "consommée"],
      [nf0.format(-E.solde_national) + " TWh", "exportées en net vers les pays voisins"],
    ].map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
  } else {
    const vals = feats.map(f => value(f.properties.code, y)).filter(v => v != null);
    const col = view === "ratio" ? d3.scaleSequential(d3.extent(vals), d3.interpolateBlues) : d3.scaleSequential(d3.extent(vals), d3.interpolateYlOrBr);
    fill = code => { const v = value(code, y); return v == null ? css("--bg") : col(v); };
    const ex = d3.extent(vals);
    legendHtml = `<span>${fmtV(ex[0])}</span><span><i class="ramp" style="background:linear-gradient(90deg, ${col(ex[0])}, ${col(ex[1])});height:10px;width:120px;border:0;opacity:1"></i></span><span>${fmtV(ex[1])}</span>`;
    side = feats.map(f => ({ c: f.properties.code, nom: f.properties.nom, v: value(f.properties.code, y) })).filter(d => d.v != null)
      .map(d => ({ ...d, txt: fmtV(d.v) })).sort((a, b) => b.v - a.v);
    const fr = Object.values(T.regions);
    const tot = k => d3.sum(fr, r => r.serie[y]?.[k] || 0);
    const k = [];
    if (view === "pop") k.push([nf1.format(tot("pop") / 1e6) + " M", `habitants en métropole au 1er janvier ${y}`]);
    else {
      k.push([nf0.format(tot("pib")) + " Md€", `PIB des régions métropolitaines en ${y}`]);
      if (tot("revenu")) k.push([nf0.format(tot("revenu")) + " Md€", "revenu disponible des ménages"]);
      const idf = T.regions["11"].serie[y];
      if (idf?.pib_hab && idf?.revenu_hab) k.push([nf0.format(100 * idf.revenu_hab / idf.pib_hab) + " %", "rapport revenu / PIB en Île-de-France (le plus bas)"]);
    }
    $("#tr-kpis").innerHTML = k.map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
  }

  svg.append("g").selectAll("path").data(feats).join("path").attr("d", path).attr("fill", d => fill(d.properties.code))
    .attr("stroke", css("--surface")).attr("stroke-width", 1.2)
    .on("pointermove", (ev, d) => showTip(regionTip(d.properties.code, y), ev)).on("pointerleave", hideTip);

  if (view === "elec") {
    const E = T.electricite[y], wmax = d3.max(E.flux, f => f[2]) || 1, sw = v => 2 + 14 * v / wmax;
    const pt = c => proj(T.regions[c].centre);
    const g = svg.append("g").attr("pointer-events", "none");
    E.flux.forEach(([a, b, v]) => {
      const [x1, y1] = pt(a), [x2, y2] = pt(b);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), k = 0.18;
      const sx = x1 + dx * k, sy = y1 + dy * k, ex = x2 - dx * k, ey = y2 - dy * k;
      const mx = (sx + ex) / 2 - dy * 0.12, my = (sy + ey) / 2 + dx * 0.12;
      g.append("path").attr("d", `M${sx},${sy} Q${mx},${my} ${ex},${ey}`).attr("fill", "none").attr("stroke", css("--ink")).attr("stroke-opacity", .55)
        .attr("stroke-width", sw(v)).attr("stroke-linecap", "round").attr("marker-end", "url(#tr-arrow)");
      g.append("text").attr("x", mx).attr("y", my).attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 700)
        .attr("paint-order", "stroke").attr("stroke", css("--surface")).attr("stroke-width", 3).text(nf0.format(v));
    });
    const [cx, cy] = proj([2.5, 46.6]);
    E.export.forEach(([a, v]) => {
      const [x1, y1] = pt(a); let dx = x1 - cx, dy = y1 - cy; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
      const L = 30 + 30 * v / wmax;
      g.append("line").attr("x1", x1 + dx * 10).attr("y1", y1 + dy * 10).attr("x2", x1 + dx * L).attr("y2", y1 + dy * L)
        .attr("stroke", "#2563eb").attr("stroke-opacity", .7).attr("stroke-width", sw(v)).attr("stroke-linecap", "round");
      g.append("text").attr("x", x1 + dx * (L + 12)).attr("y", y1 + dy * (L + 12)).attr("text-anchor", "middle").attr("dy", ".35em").attr("font-size", 10.5).attr("fill", "#2563eb")
        .attr("font-weight", 700).attr("paint-order", "stroke").attr("stroke", css("--surface")).attr("stroke-width", 3).text("↗ " + nf0.format(v));
    });
    legendHtml += `<span><i style="border-top-color:#2563eb;opacity:1"></i>Vers l'étranger (solde exportateur restant)</span>`;
  }
  svg.append("g").attr("pointer-events", "none").selectAll("text").data(feats).join("text")
    .attr("x", d => proj(T.regions[d.properties.code].centre)[0]).attr("y", d => proj(T.regions[d.properties.code].centre)[1] + (view === "elec" ? 16 : 0))
    .attr("text-anchor", "middle").attr("font-size", w < 500 ? 9 : 10.5).attr("fill", css("--ink")).attr("paint-order", "stroke").attr("stroke", css("--surface")).attr("stroke-width", 2.5)
    .text(d => { const n = d.properties.nom; return w < 500 ? n.split(/[- ]/)[0] : n.length > 18 ? n.split("-")[0] : n; });
  el.replaceChildren(svg.node());
  $("#tr-legend").innerHTML = legendHtml;
  const mx = d3.max(side, d => Math.abs(d.v)) || 1;
  $("#tr-side").innerHTML = `<div class="bars">${side.map(d => `<div class="bar-row"><span class="lab">${esc(d.nom)}</span><span class="val">${d.txt}</span>
    <span class="track"><span class="fill" style="width:${100 * Math.abs(d.v) / mx}%;background:${fill(d.c)}"></span></span></div>`).join("")}</div>`;
}

function regionTip(code, y) {
  const r = T.regions[code];
  let h = `<b>${esc(r.nom)}</b>`;
  if (view === "elec") {
    const e = T.electricite[y].regions[code];
    if (!e) return h + "<br>Pas de données (réseau électrique propre)";
    h += `<br>Production : ${nf1.format(e.prod)} TWh<br>Consommation : ${nf1.format(e.conso)} TWh<br><b>${e.solde < 0 ? "Exporte" : "Importe"} ${nf1.format(Math.abs(e.solde))} TWh</b>`;
    h += "<br>" + Object.entries(e.mix).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} : ${nf1.format(v)} TWh`).join("<br>");
    return h;
  }
  const s = r.serie[y] || {};
  if (s.pop) h += `<br>Population : ${nf1.format(s.pop / 1e6)} M`;
  if (s.pib_hab) h += `<br>PIB par habitant : ${nf0.format(s.pib_hab)} €`;
  if (s.revenu_hab) h += `<br>Revenu disponible par habitant : ${nf0.format(s.revenu_hab)} €`;
  if (s.pib_hab && s.revenu_hab) h += `<br>Revenu ÷ PIB : ${nf0.format(100 * s.revenu_hab / s.pib_hab)} %`;
  return h;
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
