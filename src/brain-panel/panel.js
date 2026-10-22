// AI Brain panel (Tab): live, real values from every AI in the game. Read-only view of game state.
import { GUARD } from "../guards/guard.js";
import { movingAverage, HYPER } from "../lab/qlearning.js";
import { droneAccuracy } from "../teammates/drone.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
const bar = (x, cls = "") => `<span class="mini-bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, x)) * 100)}%"></i></span>`;
export const TABS = ["guards", "drone", "dog", "assistant", "run"];
const TITLES = { guards: "Guards", drone: "Drone", dog: "Robot Dog", assistant: "Assistant", run: "Run" };

export function createBrainPanel(el, { getState, onExport }) {
  let tab = "guards", open = false, timer = 0;
  el.innerHTML = `
    <header class="bp-head"><span class="bp-title">🧠 AI BRAIN</span><button class="bp-close btn-link" aria-label="Close AI Brain panel">close [Tab]</button></header>
    <nav class="bp-tabs" role="tablist">${TABS.map((t) => `<button role="tab" data-tab="${t}">${TITLES[t]}</button>`).join("")}</nav>
    <div class="bp-body" aria-live="off"></div>`;
  const body = el.querySelector(".bp-body");
  el.querySelector(".bp-close").addEventListener("click", () => toggle(false));
  el.querySelector(".bp-tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { tab = b.dataset.tab; render(); } });
  body.addEventListener("click", (e) => { const b = e.target.closest("[data-export]"); if (b) onExport(b.dataset.export); });

  function guards(s) {
    if (!s.guards.length) return "<p class='fine'>No mission running.</p>";
    return `<p class="bp-note">Finite state machine: Patrol → Suspicious → Search → Chase. Vision ${GUARD.range} units, ${Math.round(GUARD.fov * 180 / Math.PI)}°, walls block sight. Routes are planned with A* on the map grid (Manhattan heuristic).</p>
      <table class="bp-table"><tr><th>Guard</th><th>State</th><th>Suspicion</th><th>Sees you</th><th>A* expanded</th><th>Path</th></tr>
      ${s.guards.map((g) => `<tr data-guard="${g.id}"><td>${g.id}</td><td><span class="st st-${g.state}">${g.state}</span></td><td>${bar(g.suspicion, "warm")} ${pct(g.suspicion)}</td><td>${g.sees ? "yes" : "no"}</td><td>${g.expanded ?? 0} cells</td><td>${g.path.length} steps</td></tr>`).join("")}</table>
      ${s.guards.some((g) => g.lastSeen) ? `<p class="fine">Last seen positions: ${s.guards.filter((g) => g.lastSeen).map((g) => `${g.id} (${g.lastSeen.x.toFixed(1)}, ${g.lastSeen.z.toFixed(1)})`).join(", ")}</p>` : ""}`;
  }
  function drone(s) {
    const rep = s.labReports[1];
    const head = rep ? `<dl class="bp-kv"><dt>Model</dt><dd>k-NN, k = ${rep.k ?? 3}</dd><dt>Labelled images</dt><dd>${rep.labelled} (${rep.perClass?.guard ?? 0} guard / ${rep.perClass?.civilian ?? 0} civilian)</dd><dt>Training accuracy</dt><dd>${pct(rep.trainAccuracy)}</dd><dt>Test accuracy (10 held-back)</dt><dd>${pct(rep.testAccuracy)}</dd>${rep.mislabelled ? `<dt>Your labels that were wrong</dt><dd>${rep.mislabelled}</dd>` : ""}</dl>` : "<p class='fine'>Not trained yet (Mission 1 Lab).</p>";
    if (!s.drone) return head + "<p class='fine'>The drone flies in Mission 1.</p>";
    const det = [...s.drone.detections.values()];
    return head + `<p class="bp-note">Scanned ${det.length} characters · accuracy so far ${pct(droneAccuracy(s.drone))}. Confidence = distance-weighted share of the 3 nearest training images.</p>
      <table class="bp-table"><tr><th>Character</th><th>Prediction</th><th>Confidence</th><th>Correct</th></tr>
      ${det.map((d) => `<tr><td>${d.id}</td><td>${d.label ?? "no model"}</td><td>${bar(d.confidence)} ${pct(d.confidence)}</td><td>${d.label ? (d.correct ? "✓" : `✗ (was ${d.truth})`) : "–"}</td></tr>`).join("") || "<tr><td colspan=4>Nothing scanned yet.</td></tr>"}</table>`;
  }
  function dog(s) {
    const a = s.models.agent;
    if (!a) return "<p class='fine'>Not trained yet (Mission 2 Lab).</p>";
    const rep = s.labReports[2] ?? {};
    return `<dl class="bp-kv"><dt>Algorithm</dt><dd>Tabular Q-learning, 100 states × 4 actions</dd><dt>Rewards</dt><dd>goal ${a.rewards.goal}, laser ${a.rewards.laser}, step ${a.rewards.step}</dd><dt>Episodes</dt><dd>${a.done}</dd><dt>α / γ / final ε</dt><dd>${HYPER.alpha} / ${HYPER.gamma} / ${a.epsilon.toFixed(2)}</dd><dt>Learned path</dt><dd>${rep.outcome ?? "?"}${rep.outcome === "goal" ? `, ${rep.pathLength} steps` : ""}</dd>${s.dog ? `<dt>Dog now</dt><dd>${s.dog.status}, step ${s.dog.step}/${s.dog.plan.path.length - 1}</dd>` : ""}</dl>
      <canvas class="bp-chart" width="340" height="110" data-chart="dog"></canvas><p class="fine">Reward per episode (25-episode moving average).</p>`;
  }
  function assistant(s) {
    const r = s.models.rag;
    const head = r ? `<dl class="bp-kv"><dt>Index</dt><dd>${r.index.chunks.length} chunks, ${r.index.vocabulary} words, chunk size ${r.chunkSize}</dd><dt>Retrieval</dt><dd>TF-IDF cosine, two hops, k = ${r.k}</dd></dl>` : "<p class='fine'>No index yet (Mission 3 Lab).</p>";
    const a = s.assist;
    if (!a) return head + "<p class='fine'>The assistant has not been asked yet (use the terminal in Mission 3).</p>";
    return head + `<dl class="bp-kv"><dt>Answer source</dt><dd>${a.source === "llm" ? `LLM (${esc(a.model)})` : `fallback: ${esc(a.error)}`}</dd><dt>Latency</dt><dd>${(a.latencyMs / 1000).toFixed(1)} s</dd><dt>Tokens</dt><dd>${a.tokens ?? "n/a"}</dd><dt>Recall (relevant emails found)</dt><dd>${pct(a.recall)}</dd></dl>
      <table class="bp-table"><tr><th>Hop</th><th>Chunk</th><th>Similarity</th></tr>${[...a.hop1.map((h) => [1, h]), ...a.hop2.map((h) => [2, h])].map(([n, h]) => `<tr><td>${n}</td><td>${esc(h.chunk.subject)}</td><td>${bar(h.score / (a.hop1[0]?.score || 1))} ${h.score.toFixed(3)}</td></tr>`).join("")}</table>
      <pre class="bp-pre">${esc(a.answer)}</pre>`;
  }
  function run(s) {
    const m = s.mission;
    const ev = s.runLog.slice(-14).reverse();
    return `<dl class="bp-kv"><dt>Mission</dt><dd>${s.config ? `${s.config.id}. ${esc(s.config.name)}` : "–"}</dd><dt>Time</dt><dd>${m ? m.time.toFixed(1) + " s" : "–"}</dd><dt>Alarm</dt><dd>${m?.alarm != null ? m.alarm.toFixed(1) + " s left" : "off"}</dd><dt>Events logged</dt><dd>${s.runLog.length}</dd></dl>
      <div class="bp-export"><button class="btn-primary" data-export="json">Export JSON</button><button class="btn-ghost" data-export="csv">Export CSV</button></div>
      <table class="bp-table bp-log"><tr><th>t</th><th>Event</th><th>Details</th></tr>${ev.map((e) => { const { t, mission, type, ...rest } = e; return `<tr><td>${t}</td><td>${esc(type)}</td><td>${esc(JSON.stringify(rest).slice(0, 90))}</td></tr>`; }).join("")}</table>`;
  }
  const VIEWS = { guards, drone, dog, assistant, run };

  function drawChart() {
    const c = body.querySelector("[data-chart=dog]"), a = getState().models.agent;
    if (!c || !a?.history.length) return;
    const ctx = c.getContext("2d"), W = c.width, H = c.height, ma = movingAverage(a.history);
    const lo = Math.min(...ma, 0), hi = Math.max(...ma, 1), y = (v) => H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 12);
    ctx.fillStyle = "#0b1130"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#29e6ff"; ctx.lineWidth = 2; ctx.beginPath();
    ma.forEach((v, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (i / Math.max(1, ma.length - 1)) * W, y(v))); ctx.stroke();
  }
  function render() {
    el.querySelectorAll(".bp-tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    body.innerHTML = VIEWS[tab](getState());
    drawChart();
  }
  function toggle(on = !open) { open = on; el.classList.toggle("open", open); el.setAttribute("aria-hidden", String(!open)); if (open) render(); }
  return {
    toggle, render, get open() { return open; }, get tab() { return tab; },
    setTab(t) { tab = t; render(); },
    tick(dt) { if (!open) return; timer += dt; if (timer > 0.25) { timer = 0; render(); } }, // 4 updates per second
  };
}
