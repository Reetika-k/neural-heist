// Mission 4 Lab: group the server farm's readings with k-means (unsupervised learning), then pick the archive group.
// There are no labels: the player chooses the readings, scaling and k, watches k-means move its centres, judges k with
// the elbow chart and the silhouette score, and decides from each group's averages which one behaves like an archive.
import { kmeans, standardize, silhouette, elbow } from "../lab/kmeans.js";
import { serverFarm, featureRows, SERVER_FEATURES } from "../lab/servers.js";

const COLORS = ["#29e6ff", "#ff3d9a", "#ffd23d", "#3dff9a", "#b26bff", "#ff8a3d"];
const NAMES = ["A", "B", "C", "D", "E", "F"];
const fmt = (v) => (v >= 100 ? Math.round(v).toLocaleString("en-IN") : v.toFixed(1));

/** Hints, from measurements on the game's server farm (see tests/kmeans.test.mjs). */
export function kmHint(key, v) {
  if (key === "scale") return v
    ? { kind: "good", text: "Every reading counts equally: each one is rescaled to the same spread before measuring distances." }
    : { kind: "bad", text: "Without scaling, \"data stored\" (thousands of GB) outweighs readings like CPU load (0–100), so servers are grouped almost only by storage." };
  if (key === "features") return v < 2
    ? { kind: "bad", text: "Choose at least two readings to group by." }
    : { kind: "good", text: `${v} readings: servers are compared on all of them at once.` };
  return { kind: "info", text: "" };
}

export function mountKmeansLab(root, { onDone, onBack, seed = 4, prev = null }) {
  const farm = serverFarm(seed);
  let keys = prev?.features ?? SERVER_FEATURES.map((f) => f.key), scaled = prev?.scaled ?? true, k = prev?.k ?? 3;
  let result = null, chosen = null, axisX = "requests", axisY = "storage", animTimer = null;

  root.innerHTML = `
    <div class="lab">
      <header class="lab-head">
        <div><p class="eyebrow">Mission 4 Lab · Unsupervised learning (k-means clustering)</p><h2>Group the servers by how they behave</h2>
        <p class="lab-sub"><b>Nobody labelled these servers.</b> k-means puts servers with similar readings into the same group, without being told what any server is. Then <b>you</b> decide which group behaves like the archive that holds the records. Your scanner lights that group up in the mission.</p></div>
        <div class="lab-counts"><b>${farm.servers.length}</b> servers · 4 readings each</div>
      </header>
      <ol class="rag-steps">
        <li><span class="hs-num">1</span><div><b>Choose the readings</b><p>Which measurements to compare, and whether to scale them.</p></div></li>
        <li><span class="hs-num">2</span><div><b>Group with k-means</b><p>Pick k, the number of groups, and watch the centres move.</p></div></li>
        <li><span class="hs-num">3</span><div><b>Pick the archive</b><p>Read each group's averages: an archive stores a lot but is rarely used.</p></div></li>
      </ol>
      <div class="lab-body">
        <div class="km-main">
          <div class="km-axes">
            <label>Across <select id="km-x">${SERVER_FEATURES.map((f) => `<option value="${f.key}">${f.label}</option>`).join("")}</select></label>
            <label>Up <select id="km-y">${SERVER_FEATURES.map((f) => `<option value="${f.key}">${f.label}</option>`).join("")}</select></label>
            <span class="fine" id="km-step"></span>
          </div>
          <canvas id="km-plot" class="km-plot" width="640" height="400" aria-label="Scatter plot of the servers"></canvas>
          <div id="km-groups" class="km-groups"><p class="fine">Press <b>Run k-means</b>. Each dot is a server; after grouping, each colour is one group and ✕ marks its centre.</p></div>
        </div>
        <aside class="lab-side">
          <details class="q-how"><summary>How does k-means work?</summary>
            <p><b>1.</b> Put k centres among the servers (spread out: "k-means++").</p>
            <p><b>2.</b> Each server joins its <b>nearest</b> centre.</p>
            <p><b>3.</b> Each centre moves to the <b>average</b> of its servers. Repeat 2–3 until nothing changes.</p>
            <p><b>Choosing k:</b> the elbow chart shows how tight the groups are for each k (lower = tighter); pick where the line stops dropping steeply. The silhouette score (−1 to 1) says how clearly separated the groups are: higher is better.</p>
          </details>
          <fieldset class="km-feats"><legend>Readings to compare</legend>
            ${SERVER_FEATURES.map((f) => `<label><input type="checkbox" name="feat" value="${f.key}"> ${f.label}</label>`).join("")}
            <span class="q-hint" id="h-feat"></span>
          </fieldset>
          <label class="km-scale"><input type="checkbox" id="km-scale"> Scale the readings (same spread for each)</label>
          <span class="q-hint" id="h-scale"></span>
          <label class="slider">Number of groups (k) <b id="v-k"></b><input type="range" id="r-k" min="2" max="6" step="1"></label>
          <button class="btn-primary" id="km-run">Run k-means</button>
          <dl class="metric-row"><div><dt>Silhouette</dt><dd id="km-sil">–</dd></div><div><dt>Steps</dt><dd id="km-it">–</dd></div></dl>
          <div class="km-elbow"><p class="hop-label">Elbow chart: tightness for each k</p><canvas id="km-elbow" width="300" height="120" aria-label="Elbow chart"></canvas></div>
          <p class="fine" id="km-pick-note">Run k-means, then choose the archive group in the table.</p>
          <button class="btn-primary btn-go" id="km-go" disabled>Start mission</button>
          <button class="btn-link" id="km-back">Back to briefing</button>
        </aside>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const hint = (id, h) => { const el = $(`#${id}`); el.textContent = h.text ? (h.kind === "good" ? "✓ " : "⚠ ") + h.text : ""; el.dataset.kind = h.kind; };

  // ---------- data and drawing ----------
  const raw = (key) => farm.servers.map((s) => s[key]);
  const range = (key) => { const v = raw(key); const lo = Math.min(...v), hi = Math.max(...v); const pad = (hi - lo) * 0.08 || 1; return [lo - pad, hi + pad]; };
  function draw(labels = null, showCentres = true) {
    const c = $("#km-plot"), g = c.getContext("2d"), W = c.width, H = c.height, L = 56, B = 40;
    g.clearRect(0, 0, W, H);
    const [x0, x1] = range(axisX), [y0, y1] = range(axisY);
    const px = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - 12), py = (v) => H - B - ((v - y0) / (y1 - y0)) * (H - B - 12);
    g.strokeStyle = "rgba(255,255,255,.15)"; g.lineWidth = 1; g.beginPath(); g.moveTo(L, 8); g.lineTo(L, H - B); g.lineTo(W - 8, H - B); g.stroke();
    g.fillStyle = "#9aa3c7"; g.font = "13px Inter, sans-serif";
    g.textAlign = "center"; g.fillText(SERVER_FEATURES.find((f) => f.key === axisX).label, (L + W) / 2, H - 10);
    g.save(); g.translate(16, (H - B) / 2); g.rotate(-Math.PI / 2); g.fillText(SERVER_FEATURES.find((f) => f.key === axisY).label, 0, 0); g.restore();
    g.textAlign = "left"; g.fillText(fmt(x0 < 0 ? 0 : x0), L, H - B + 16); g.textAlign = "right"; g.fillText(fmt(x1), W - 10, H - B + 16); g.fillText(fmt(y1), L - 6, 18);
    farm.servers.forEach((s, i) => {
      const col = labels && labels[i] >= 0 ? COLORS[labels[i]] : "#c9d3ff";
      g.beginPath(); g.arc(px(s[axisX]), py(s[axisY]), 6, 0, Math.PI * 2);
      g.fillStyle = col; g.globalAlpha = labels && chosen !== null && labels[i] !== chosen ? 0.35 : 1; g.fill(); g.globalAlpha = 1;
      g.strokeStyle = "rgba(0,0,0,.5)"; g.stroke();
    });
    if (labels && showCentres) {
      for (let j = 0; j < k; j++) {
        const m = farm.servers.filter((_, i) => labels[i] === j); if (!m.length) continue;
        const cx = px(m.reduce((a, s) => a + s[axisX], 0) / m.length), cy = py(m.reduce((a, s) => a + s[axisY], 0) / m.length);
        g.strokeStyle = COLORS[j]; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 8, cy - 8); g.lineTo(cx + 8, cy + 8); g.moveTo(cx + 8, cy - 8); g.lineTo(cx - 8, cy + 8); g.stroke();
        g.fillStyle = COLORS[j]; g.font = "bold 13px Inter, sans-serif"; g.textAlign = "left"; g.fillText(NAMES[j], cx + 10, cy - 8);
      }
    }
  }
  function drawElbow() {
    const c = $("#km-elbow"), g = c.getContext("2d"), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    if (keys.length < 2) return;
    const pts = elbow(rows(), 7, { seed: 1 }), max = pts[0].inertia || 1;
    const px = (kk) => 18 + ((kk - 1) / 6) * (W - 30), py = (v) => H - 20 - (v / max) * (H - 32);
    g.strokeStyle = "#29e6ff"; g.lineWidth = 2; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(px(p.k), py(p.inertia)) : g.moveTo(px(p.k), py(p.inertia)))); g.stroke();
    pts.forEach((p) => { g.beginPath(); g.arc(px(p.k), py(p.inertia), p.k === k ? 5 : 3, 0, Math.PI * 2); g.fillStyle = p.k === k ? "#ffd23d" : "#29e6ff"; g.fill(); });
    g.fillStyle = "#9aa3c7"; g.font = "11px Inter, sans-serif"; g.textAlign = "center"; pts.forEach((p) => g.fillText(String(p.k), px(p.k), H - 5));
  }
  const rows = () => { const r = featureRows(farm.servers, keys); return scaled ? standardize(r).rows : r; };

  function groupsTable() {
    if (!result) return;
    const lab = result.labels;
    $("#km-groups").innerHTML = `<table class="km-table"><tr><th>Group</th><th>Servers</th>${SERVER_FEATURES.map((f) => `<th>${f.short}</th>`).join("")}<th>Archive?</th></tr>${Array.from({ length: k }, (_, j) => {
      const m = farm.servers.filter((_, i) => lab[i] === j);
      return `<tr data-group="${j}" class="${chosen === j ? "km-chosen" : ""}"><td><span class="km-sw" style="background:${COLORS[j]}"></span> ${NAMES[j]}</td><td>${m.length}</td>${SERVER_FEATURES.map((f) => `<td>${m.length ? fmt(m.reduce((a, s) => a + s[f.key], 0) / m.length) : "–"}</td>`).join("")}<td><input type="radio" name="km-arch" value="${j}" ${chosen === j ? "checked" : ""} aria-label="Group ${NAMES[j]} is the archive"></td></tr>`;
    }).join("")}</table><p class="fine">Averages per group. An archive keeps a lot of data but is rarely used: few requests, little outgoing traffic, low CPU.</p>`;
    root.querySelectorAll('input[name="km-arch"]').forEach((r) => r.addEventListener("change", () => pick(Number(r.value))));
  }
  function pick(j) {
    chosen = j;
    const n = result.labels.filter((l) => l === j).length;
    $("#km-pick-note").textContent = `Group ${NAMES[j]} chosen: the scanner will flag its ${n} rack${n === 1 ? "" : "s"}.`;
    $("#km-go").disabled = false;
    groupsTable(); draw(result.labels);
  }

  // ---------- controls ----------
  root.querySelectorAll('input[name="feat"]').forEach((cb) => { cb.checked = keys.includes(cb.value); cb.addEventListener("change", () => { keys = [...root.querySelectorAll('input[name="feat"]:checked')].map((x) => x.value); changed(); }); });
  $("#km-scale").checked = scaled; $("#km-scale").addEventListener("change", () => { scaled = $("#km-scale").checked; changed(); });
  $("#r-k").value = k; $("#v-k").textContent = k; $("#r-k").addEventListener("input", () => { k = Number($("#r-k").value); $("#v-k").textContent = k; changed(); });
  $("#km-x").value = axisX; $("#km-y").value = axisY;
  $("#km-x").addEventListener("change", () => { axisX = $("#km-x").value; draw(result?.labels); });
  $("#km-y").addEventListener("change", () => { axisY = $("#km-y").value; draw(result?.labels); });
  function changed() {
    clearInterval(animTimer); result = null; chosen = null;
    $("#km-go").disabled = true; $("#km-sil").textContent = "–"; $("#km-it").textContent = "–"; $("#km-step").textContent = "";
    $("#km-run").disabled = keys.length < 2;
    $("#km-groups").innerHTML = `<p class="fine">Settings changed: press <b>Run k-means</b> again.</p>`;
    $("#km-pick-note").textContent = "Run k-means, then choose the archive group in the table.";
    hint("h-feat", kmHint("features", keys.length)); hint("h-scale", kmHint("scale", scaled));
    draw(); drawElbow();
  }

  /** Run k-means; animate its steps unless told not to (tests). */
  function run({ animate = true } = {}) {
    if (keys.length < 2) return null;
    clearInterval(animTimer); chosen = null; $("#km-go").disabled = true;
    const data = rows();
    result = kmeans(data, k, { seed: 1 });
    result.silhouette = silhouette(data, result.labels);
    const finish = () => {
      $("#km-step").textContent = `Done: settled after ${result.iterations} step${result.iterations === 1 ? "" : "s"}`;
      $("#km-sil").textContent = result.silhouette.toFixed(2); $("#km-it").textContent = result.iterations;
      draw(result.labels); groupsTable(); drawElbow();
    };
    if (!animate) { finish(); return result; }
    let step = 1; $("#km-run").disabled = true;
    animTimer = setInterval(() => {
      const h = result.history[step];
      $("#km-step").textContent = `Step ${step}: each server joins its nearest centre, then each centre moves to its group's average`;
      draw(h.labels);
      if (++step >= result.history.length) { clearInterval(animTimer); $("#km-run").disabled = false; finish(); }
    }, 550);
    return result;
  }
  $("#km-run").addEventListener("click", () => run());
  $("#km-back").addEventListener("click", () => { clearInterval(animTimer); onBack(); });
  $("#km-go").addEventListener("click", () => {
    const chosenIds = farm.servers.filter((_, i) => result.labels[i] === chosen).map((s) => s.id);
    onDone({
      clusters: { chosenIds, k, scaled, features: keys, seed },
      report: { k, scaled, features: keys, silhouette: Number(result.silhouette.toFixed(3)), iterations: result.iterations, groupSizes: Array.from({ length: k }, (_, j) => result.labels.filter((l) => l === j).length), flagged: chosenIds.length },
    });
  });
  changed();

  return {
    farm,
    run, pick,
    set(opts) {
      if (opts.features) root.querySelectorAll('input[name="feat"]').forEach((cb) => { cb.checked = opts.features.includes(cb.value); });
      if (opts.features) keys = opts.features.slice();
      if (typeof opts.scaled === "boolean") { scaled = opts.scaled; $("#km-scale").checked = scaled; }
      if (opts.k) { k = opts.k; $("#r-k").value = k; $("#v-k").textContent = k; }
      changed();
    },
    /** Index of the group whose average requests are lowest (what a careful player reading the table would call the archive). */
    quietestGroup() { if (!result) return null; let best = 0, bv = Infinity; for (let j = 0; j < k; j++) { const m = farm.servers.filter((_, i) => result.labels[i] === j); const v = m.reduce((a, s) => a + s.requests, 0) / (m.length || 1); if (m.length && v < bv) { bv = v; best = j; } } return best; },
    get result() { return result; },
    get chosen() { return chosen; },
  };
}
