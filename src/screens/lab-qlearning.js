// Mission 2 Lab: design rewards, watch tabular Q-learning train live, inspect what the dog learned.
// 2026-10-23: new vaults, bonus batteries, blinking lasers, slippery puddles, a training challenge and views of what
// the dog learned. (The previous version, without these, is in git history at commit 7b3f449.)
import { createAgent, trainEpisodes, trainWithMilestone, noteMilestone, greedyPath, evaluatePolicy, policy, valueMap, movingAverage, shortestSafe, makeEnv, laserOn, ACTIONS, DEFAULT_REWARDS, HYPER } from "../lab/qlearning.js";
import { sliderHint, explainOutcome, explainStale, PRESETS } from "../lab/reward-advice.js";

const ARROWS = ["↑", "↓", "←", "→", "·"];
const BEST_KEY = "neural-heist.qlab.best";
const store = { get: () => { try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch { return {}; } }, set: (v) => { try { localStorage.setItem(BEST_KEY, JSON.stringify(v)); } catch { /* private mode */ } } };
const randomSeed = () => 1000 + Math.floor(Math.random() * 9000);

export function mountQLab(root, { onDone, onBack, prev = null }) {
  root.innerHTML = `
    <div class="lab">
      <header class="lab-head">
        <div><p class="eyebrow">Mission 2 Lab · Reinforcement learning</p><h2>Train the robot dog</h2>
        <p class="lab-sub">The dog learns by trial and error. You decide what it is rewarded for. It starts at the bottom-left and must reach the drive at the top-right without touching a <b class="red">laser</b>. After training it follows its best-known action in every cell.</p></div>
      </header>
      <div class="lab-body">
        <div class="q-main">
          <div class="q-vault"><span><b id="q-vault-label">Vault</b> · shortest safe route <b id="q-shortest">–</b> steps</span>
            <span class="q-vault-btns"><button type="button" class="q-preset" id="q-new">New vault</button><button type="button" class="q-preset" id="q-classic">Classic</button></span></div>
          <canvas id="q-grid" width="420" height="420" aria-label="Vault grid"></canvas>
          <div class="q-legend"><span class="sw sw-start"></span>start <span class="sw sw-goal"></span>drive <span class="sw sw-laser"></span>laser <span class="sw sw-blink"></span>blinking <span class="sw sw-wet"></span>puddle <span class="sw sw-bat"></span>battery <span class="sw sw-path"></span>learned path</div>
          <div class="view-toggle q-views" role="group" aria-label="What to show on the grid">
            <button type="button" data-view="arrows" aria-pressed="true">Best moves</button><button type="button" data-view="value" aria-pressed="false">What it learned</button><button type="button" data-view="visits" aria-pressed="false">Where it explored</button>
          </div>
          <p class="fine q-view-note" id="q-view-note"></p>
          <div id="q-verdict" class="lab-warn q-verdict hidden" aria-live="polite"></div>
          <p id="q-challenge" class="q-challenge hidden"></p>
        </div>
        <aside class="lab-side">
          <details class="q-how"><summary>How do rewards work?</summary>
            <p>The dog does not know the vault. It tries moves at random thousands of times. After every move it gets the points you set below, and it slowly learns which move in each square earns the most points <b>in total</b>. A run ends when it reaches the drive, touches a laser, or takes too long.</p>
            <p><b>Positive</b> = "do more of this". <b>Negative</b> = "avoid this". <b>Zero</b> = "I don't care". The dog does exactly what the points reward, not what you meant.</p>
            <p><b>Vault extras:</b> batteries are optional bonuses off the route; blinking lasers switch off every few steps (the dog can wait); puddles make it slide sideways sometimes.</p>
          </details>
          <div class="q-presets" role="group" aria-label="Ready-made settings">${PRESETS.map((p) => `<button type="button" class="q-preset" data-preset="${p.id}" title="${p.note}">${p.label}</button>`).join("")}</div>
          <p class="q-preset-note fine" id="q-preset-note">Try a ready-made setting, or move the sliders yourself.</p>
          <label class="slider">Reward for reaching the drive <b id="v-goal"></b><input type="range" id="r-goal" min="0" max="20" step="1"><span class="q-hint" id="h-goal"></span></label>
          <label class="slider">Reward for touching a laser <b id="v-laser"></b><input type="range" id="r-laser" min="-20" max="10" step="1"><span class="q-hint" id="h-laser"></span></label>
          <label class="slider">Reward for each step <b id="v-step"></b><input type="range" id="r-step" min="-2" max="0" step="0.1"><span class="q-hint" id="h-step"></span></label>
          <label class="slider q-battery-slider">Reward for a battery <b id="v-battery"></b><input type="range" id="r-battery" min="0" max="5" step="0.1"><span class="q-hint" id="h-battery"></span></label>
          <fieldset class="q-options"><legend>Vault extras</legend>
            <label class="q-check"><input type="checkbox" id="o-batteries"> Bonus batteries</label>
            <label class="q-check"><input type="checkbox" id="o-blinking"> Blinking lasers</label>
            <label class="slider">Slippery puddles <b id="v-slip"></b><input type="range" id="r-slip" min="0" max="0.3" step="0.05"><span class="q-hint" id="h-slip"></span></label>
          </fieldset>
          <label class="slider">Training episodes (practice runs) <b id="v-eps"></b><input type="range" id="r-eps" min="100" max="6000" step="100"><span class="q-hint" id="h-eps"></span></label>
          <button class="btn-primary" id="q-train">Train</button>
          <dl class="metric-row q-metrics"><div><dt>Episode</dt><dd id="q-ep">0</dd></div><div><dt>Epsilon <span class="nocaps">ε</span></dt><dd id="q-eps">1.00</dd></div></dl>
          <canvas id="q-chart" width="300" height="110" aria-label="Reward per episode"></canvas>
          <p class="fine">Reward per episode (25-episode moving average). α = ${HYPER.alpha}, γ = ${HYPER.gamma}, ε decays ${HYPER.epsilonStart} → ${HYPER.epsilonEnd}.</p>
          <button class="btn-primary btn-go" id="q-go" disabled>Start mission</button>
          <button class="btn-link" id="q-back">Back to briefing</button>
        </aside>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const rewards = { ...DEFAULT_REWARDS, ...(prev?.rewards ?? {}) };
  let episodes = prev?.episodes ?? 1500;
  // the vault: keep the one the dog was trained on; a first visit gets a fresh random vault
  let vault = prev?.env ? { layout: prev.env.layout, seed: prev.env.seed } : { layout: "random", seed: randomSeed() };
  const options = { batteries: !!prev?.env?.batteries.length, blinking: !!prev?.env?.blink.size, slip: prev?.env?.slip ?? 0 };
  let env = makeEnv({ ...vault, ...options });
  let agent = prev, training = false, lastPath = null, view = "arrows", stale = null;
  const ctx = $("#q-grid").getContext("2d"), cctx = $("#q-chart").getContext("2d");

  // ---------- sliders, options, hints ----------
  const fmtR = (v) => (v > 0 ? "+" : "") + v;
  const SLIDERS = [["goal", "goal", fmtR], ["laser", "laser", fmtR], ["step", "step", (v) => v.toFixed(1)], ["battery", "battery", (v) => fmtR(+v.toFixed(1))], ["eps", "episodes", (v) => v], ["slip", "slip", (v) => `${Math.round(v * 100)} %`]];
  const valueOf = (key) => (key === "episodes" ? episodes : key === "slip" ? options.slip : rewards[key]);
  function refreshHints() {
    for (const [id, key, fmt] of SLIDERS) {
      const v = valueOf(key);
      $(`#v-${id}`).textContent = fmt(v);
      const extras = (options.batteries ? 1 : 0) + (options.blinking ? 1 : 0) + (options.slip > 0 ? 1 : 0);
      const h = sliderHint(key, v, { step: rewards.step, blinking: options.blinking, extras }), hint = $(`#h-${id}`);
      hint.textContent = h.text ? (h.kind === "good" ? "✓ " : "⚠ ") + h.text : ""; hint.dataset.kind = h.kind;
    }
    root.querySelector(".q-battery-slider").classList.toggle("hidden", !options.batteries);
  }
  function invalidate() { // settings changed: the trained dog no longer matches
    if (agent && !stale) stale = null;
    agent = null; $("#q-go").disabled = true; $("#q-verdict").classList.add("hidden"); $("#q-challenge").classList.add("hidden");
  }
  for (const [id, key] of SLIDERS) {
    const el = $(`#r-${id}`); el.value = valueOf(key);
    el.addEventListener("input", () => {
      const v = Number(el.value);
      if (key === "episodes") episodes = v; else if (key === "slip") { options.slip = v; rebuildEnv(); } else rewards[key] = v;
      refreshHints(); invalidate(); draw();
    });
  }
  $("#o-batteries").checked = options.batteries; $("#o-blinking").checked = options.blinking;
  $("#o-batteries").addEventListener("change", (e) => { options.batteries = e.target.checked; rebuildEnv(); refreshHints(); invalidate(); draw(); });
  $("#o-blinking").addEventListener("change", (e) => { options.blinking = e.target.checked; rebuildEnv(); refreshHints(); invalidate(); draw(); });

  function rebuildEnv() {
    env = makeEnv({ ...vault, ...options });
    $("#q-vault-label").textContent = env.label;
    $("#q-shortest").textContent = shortestSafe(env) ?? "–";
  }
  /** Switch vault. A dog trained on the old vault is replayed on the new one: the "new vault, new practice" lesson. */
  function setVault(v) {
    const old = agent;
    vault = v === "classic" ? { layout: "classic", seed: 0 } : { layout: "random", seed: v ?? randomSeed() };
    rebuildEnv();
    stale = null;
    if (old && old.q.length === createAgent({ env, episodes: 1 }).q.length && old.env.label !== env.label) {
      const shadow = { ...old, env };
      const g = greedyPath(shadow);
      stale = { path: g.path, ...explainStale(old.env.label, env.label, g.outcome, g.path.length - 1) };
    }
    agent = null; $("#q-go").disabled = true; $("#q-challenge").classList.add("hidden");
    const vEl = $("#q-verdict");
    if (stale) { lastPath = stale.path; vEl.innerHTML = `<p class="q-v-head">⚠ ${stale.headline}</p><p><b>Why:</b> ${stale.why}</p><p><b>Try:</b> ${stale.fix}</p>`; vEl.dataset.kind = "bad"; vEl.classList.remove("hidden"); }
    else { lastPath = null; vEl.classList.add("hidden"); }
    draw();
  }
  $("#q-new").addEventListener("click", () => setVault(randomSeed()));
  $("#q-classic").addEventListener("click", () => setVault("classic"));

  // ---------- drawing ----------
  const VIEW_NOTES = {
    arrows: "Arrows: the move the dog thinks is best in each square (· = wait).",
    value: "Colours: how many points the dog expects from each square (green = good, red = bad). Train first.",
    visits: "Brightness: how often the dog stepped on each square while practising. Train first.",
  };
  function draw() {
    const N = env.size, c = 420 / N, t = Math.floor(performance.now() / 500); // blinking preview: one phase step per 0.5 s
    ctx.fillStyle = "#0b1130"; ctx.fillRect(0, 0, 420, 420);
    const vals = agent && view === "value" ? valueMap(agent) : null, visits = agent && view === "visits" ? agent.visits : null;
    const vmin = vals ? Math.min(...vals.filter((v, i) => !env.lasers.has(`${i % N},${Math.floor(i / N)}`))) : 0, vmax = vals ? Math.max(...vals) : 1;
    const maxVisit = visits ? Math.log1p(Math.max(...visits)) : 1;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const k = `${x},${z}`, i = z * N + x;
      ctx.fillStyle = (x + z) % 2 ? "#121a44" : "#0f163a"; ctx.fillRect(x * c, z * c, c, c);
      if (vals && !env.lasers.has(k)) { const f = (vals[i] - vmin) / ((vmax - vmin) || 1); ctx.fillStyle = `hsla(${Math.round(f * 130)}, 80%, 45%, .55)`; ctx.fillRect(x * c, z * c, c, c); }
      if (visits && visits[i]) { ctx.fillStyle = `rgba(41,230,255,${(0.08 + 0.75 * Math.log1p(visits[i]) / maxVisit).toFixed(3)})`; ctx.fillRect(x * c, z * c, c, c); }
      if (env.wet.has(k)) { ctx.fillStyle = "rgba(80,160,255,.55)"; ctx.beginPath(); ctx.ellipse(x * c + c / 2, z * c + c / 2, c * 0.38, c * 0.26, 0, 0, 7); ctx.fill(); }
      if (env.lasers.has(k)) {
        const blinking = env.blink.has(k), on = laserOn(env, { x, z }, t);
        ctx.fillStyle = blinking ? (on ? "rgba(255,140,60,.28)" : "rgba(255,140,60,.08)") : "rgba(255,45,85,.25)"; ctx.fillRect(x * c, z * c, c, c);
        ctx.fillStyle = blinking ? (on ? "#ff8c3c" : "rgba(255,140,60,.25)") : "#ff2d55";
        if (blinking) for (let d = 0; d < c; d += 8) ctx.fillRect(x * c + d, z * c + c / 2 - 2, 5, 4); else ctx.fillRect(x * c, z * c + c / 2 - 2, c, 4);
      }
    }
    for (const b of env.batteries) { ctx.font = `${c * 0.55}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#b6ff4d"; ctx.fillText("⚡", b.x * c + c / 2, b.z * c + c / 2); }
    ctx.fillStyle = "rgba(41,230,255,.35)"; ctx.fillRect(env.start.x * c, env.start.z * c, c, c);
    ctx.fillStyle = "rgba(255,210,61,.45)"; ctx.fillRect(env.goal.x * c, env.goal.z * c, c, c);
    ctx.font = `${c * 0.5}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#ffd23d";
    ctx.fillText("◆", env.goal.x * c + c / 2, env.goal.z * c + c / 2);
    if (agent && !training && view === "arrows") {
      const pol = policy(agent);
      ctx.fillStyle = "rgba(230,236,255,.35)"; ctx.font = `${c * 0.36}px sans-serif`;
      pol.forEach((a, s) => { const x = s % N, z = Math.floor(s / N); if (!env.lasers.has(`${x},${z}`) && !(x === env.goal.x && z === env.goal.z)) ctx.fillText(ARROWS[a], x * c + c / 2, z * c + c / 2); });
    }
    const path = lastPath;
    if (path) {
      ctx.strokeStyle = training ? "rgba(41,230,255,.5)" : stale && !agent ? "#ff8c3c" : "#3dff9a"; ctx.lineWidth = training ? 2 : 4; ctx.beginPath();
      path.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, p.x * c + c / 2, p.z * c + c / 2)); ctx.stroke();
      const end = path[path.length - 1]; ctx.fillStyle = "#29e6ff"; ctx.beginPath(); ctx.arc(end.x * c + c / 2, end.z * c + c / 2, c * 0.22, 0, Math.PI * 2); ctx.fill();
    }
    $("#q-view-note").textContent = VIEW_NOTES[view];
  }
  // blinking lasers move: redraw the preview while the Lab is open
  const blinkTimer = setInterval(() => { if (!root.isConnected) clearInterval(blinkTimer); else if (env.blink.size && !training) draw(); }, 500);
  root.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    view = b.dataset.view; root.querySelectorAll("[data-view]").forEach((o) => o.setAttribute("aria-pressed", String(o === b))); draw();
  }));

  function drawChart() {
    const W = 300, H = 110; cctx.fillStyle = "#0b1130"; cctx.fillRect(0, 0, W, H);
    if (!agent || !agent.history.length) return;
    const ma = movingAverage(agent.history);
    const lo = Math.min(...ma, 0), hi = Math.max(...ma, 1);
    const y = (v) => H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 16);
    cctx.strokeStyle = "rgba(255,255,255,.15)"; cctx.beginPath(); cctx.moveTo(0, y(0)); cctx.lineTo(W, y(0)); cctx.stroke();
    cctx.strokeStyle = "#29e6ff"; cctx.lineWidth = 2; cctx.beginPath();
    ma.forEach((v, i) => (i ? cctx.lineTo : cctx.moveTo).call(cctx, (i / Math.max(1, agent.episodes - 1)) * W, y(v))); cctx.stroke();
  }

  // ---------- after training: what happened, why, and the training challenge ----------
  let lastEval = null;
  function verdict() {
    const g = greedyPath(agent);
    lastPath = g.path; stale = null;
    lastEval = env.slip > 0 ? evaluatePolicy(agent, 200, 7) : null;
    const waits = g.path.reduce((n, p, i) => n + (i && p.x === g.path[i - 1].x && p.z === g.path[i - 1].z ? 1 : 0), 0);
    const x = explainOutcome(g.outcome, rewards, episodes, g.path.length - 1, {
      shortest: shortestSafe(env), batteries: g.batteries, batteriesOn: env.batteries.length > 0, slip: env.slip,
      success: lastEval?.successRate, avgSteps: lastEval?.avgSteps, waits: env.blink.size ? waits : 0, blinking: env.blink.size > 0,
      blinkCrossed: g.path.some((p) => env.blink.has(`${p.x},${p.z}`)),
      extras: (env.batteries.length ? 1 : 0) + (env.blink.size ? 1 : 0) + (env.slip > 0 ? 1 : 0),
    });
    const v = $("#q-verdict"); v.classList.remove("hidden");
    const ok = g.outcome === "goal" && (!lastEval || lastEval.successRate >= 0.5);
    v.innerHTML = `<p class="q-v-head">${ok ? "✓" : "⚠"} ${x.headline}</p><p><b>Why:</b> ${x.why}</p>${x.fix ? `<p><b>Try:</b> ${x.fix}</p>` : ""}`;
    v.dataset.kind = ok ? "good" : "bad";
    // training challenge: how quickly did your reward design find a route?
    const ch = $("#q-challenge");
    if (g.outcome === "goal" && agent.firstSolvedAt) {
      const id = `${env.label}|b${+!!env.batteries.length}|k${+!!env.blink.size}|s${env.slip}`, best = store.get(), prevBest = best[id];
      const isBest = prevBest == null || agent.firstSolvedAt < prevBest;
      if (isBest) { best[id] = agent.firstSolvedAt; store.set(best); }
      ch.innerHTML = `🏁 <b>Training challenge:</b> the dog found a route after <b>${agent.firstSolvedAt.toLocaleString()}</b> practice runs. ${isBest ? (prevBest == null ? "Your first record on this vault." : `<b>New best!</b> (was ${prevBest.toLocaleString()})`) : `Your best here: ${prevBest.toLocaleString()}.`} Fewer is better: try other rewards.`;
      ch.classList.remove("hidden");
    } else ch.classList.add("hidden");
    $("#q-go").disabled = false;
    draw();
    return g;
  }
  function train() {
    agent = createAgent({ rewards, episodes, seed: Math.floor(Math.random() * 1e9), env });
    stale = null; training = true; $("#q-train").disabled = true; $("#q-go").disabled = true; $("#q-verdict").classList.add("hidden"); $("#q-challenge").classList.add("hidden");
    const perFrame = Math.max(5, Math.ceil(episodes / 120)); // ~2 seconds of visible learning
    const run = agent;
    const tick = () => {
      // A slider change (agent = null) or a new training run replaces the agent: stop this animation.
      if (agent !== run) { if (!agent) { training = false; $("#q-train").disabled = false; } return; }
      const ep = trainEpisodes(agent, perFrame);
      noteMilestone(agent);
      if (ep) lastPath = ep.path;
      $("#q-ep").textContent = agent.done; $("#q-eps").textContent = agent.epsilon.toFixed(2);
      draw(); drawChart();
      if (agent.done < agent.episodes && root.isConnected) requestAnimationFrame(tick);
      else { training = false; $("#q-train").disabled = false; verdict(); drawChart(); }
    };
    requestAnimationFrame(tick);
  }
  /** Synchronous training (for automated tests): same algorithm, no animation. */
  function trainNow(seed = 1) {
    agent = createAgent({ rewards, episodes, seed, env });
    trainWithMilestone(agent, 25);
    $("#q-ep").textContent = agent.done; $("#q-eps").textContent = agent.epsilon.toFixed(2);
    drawChart(); return verdict();
  }
  const setRewards = (r) => { Object.assign(rewards, r); for (const k of ["goal", "laser", "step", "battery"]) if (k in r) { $(`#r-${k}`).value = rewards[k]; $(`#r-${k}`).dispatchEvent(new Event("input")); } };
  const setOptions = (o) => {
    if ("batteries" in o) { $("#o-batteries").checked = o.batteries; $("#o-batteries").dispatchEvent(new Event("change")); }
    if ("blinking" in o) { $("#o-blinking").checked = o.blinking; $("#o-blinking").dispatchEvent(new Event("change")); }
    if ("slip" in o) { $("#r-slip").value = o.slip; $("#r-slip").dispatchEvent(new Event("input")); }
  };

  $("#q-train").addEventListener("click", train);
  root.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    const p = PRESETS.find((x) => x.id === b.dataset.preset);
    episodes = p.episodes; $("#r-eps").value = p.episodes; $("#r-eps").dispatchEvent(new Event("input"));
    setOptions({ batteries: !!p.options?.batteries, blinking: !!p.options?.blinking, slip: p.options?.slip ?? 0 });
    setRewards({ goal: p.goal, laser: p.laser, step: p.step, battery: p.battery ?? DEFAULT_REWARDS.battery });
    root.querySelectorAll("[data-preset]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    $("#q-preset-note").textContent = `${p.label}: ${p.note} Press Train.`;
  }));
  $("#q-go").addEventListener("click", () => {
    const g = greedyPath(agent);
    onDone({ agent, report: { rewards: { ...rewards }, episodes, outcome: g.outcome, pathLength: g.path.length - 1, vault: env.label, batteries: env.batteries.length > 0, blinking: env.blink.size > 0, slip: env.slip, successRate: lastEval?.successRate ?? null, firstSolvedAt: agent.firstSolvedAt } });
  });
  $("#q-back").addEventListener("click", onBack);
  rebuildEnv(); refreshHints();
  if (agent) verdict(); else draw();
  drawChart();
  return { trainNow, setRewards, setOptions, setVault, get agent() { return agent; }, get env() { return env; }, ACTIONS };
}
