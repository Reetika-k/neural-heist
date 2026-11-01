// Mission 2 Lab: design rewards, watch tabular Q-learning train live, inspect what the dog learned.
// 2026-10-23: new vaults, bonus batteries, blinking lasers, slippery puddles, a training challenge and views of what
// the dog learned. (The previous version, without these, is in git history at commit 7b3f449.)
import { createAgent, trainEpisodes, trainWithMilestone, noteMilestone, greedyPath, evaluatePolicy, rollout, policy, valueMap, movingAverage, shortestSafe, makeEnv, laserOn, stepEnv, ACTIONS, DEFAULT_REWARDS, HYPER } from "../lab/qlearning.js";
import { mulberry32 } from "../lab/rng.js";
import { sliderHint, explainOutcome, explainStale, PRESETS } from "../lab/reward-advice.js";

const ARROWS = ["↑", "↓", "←", "→", "·"];
const BEST_KEY = "neural-heist.qlab.best";
const store = { get: () => { try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch { return {}; } }, set: (v) => { try { localStorage.setItem(BEST_KEY, JSON.stringify(v)); } catch { /* private mode */ } } };
const randomSeed = () => 1000 + Math.floor(Math.random() * 9000);
const GUIDE_KEY = "neural-heist.qlab.guided";
const seenGuide = () => { try { return localStorage.getItem(GUIDE_KEY) === "1"; } catch { return true; } };
const markGuide = () => { try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* private mode */ } };

/** Plain-language reward choices; each sets one exact reward (the sliders in Advanced Lab show the numbers). */
export const REWARD_CHOICES = [
  { key: "goal", emoji: "🦴", label: "Reaching the drive", options: [{ label: "No treat", v: 0 }, { label: "Small treat", v: 3 }, { label: "Big treat", v: 10 }] },
  { key: "laser", emoji: "⚡", label: "Touching a laser", options: [{ label: "Gives a treat", v: 5 }, { label: "Doesn't matter", v: 0 }, { label: "Hurts", v: -10 }] },
  { key: "step", emoji: "🐾", label: "Each step", options: [{ label: "Free", v: 0 }, { label: "Costs a little", v: -0.1 }, { label: "Costs a lot", v: -1 }] },
];
/** "Guess, then test": each experiment applies one ready-made setting; the guess is compared with what the dog really does. */
export const EXPERIMENTS = [
  { id: "reckless", preset: "reckless", question: "What if touching a laser gives the dog a treat?" },
  { id: "lazy", preset: "lazy", question: "What if walking is free (no cost per step)?" },
  { id: "rushed", preset: "rushed", question: "What if every step costs a lot?" },
  { id: "untrained", preset: "untrained", question: "What if the dog practises only 300 times?" },
];
export const GUESSES = [{ id: "goal", label: "Reaches the drive" }, { id: "laser", label: "Runs into a laser" }, { id: "loop", label: "Wanders and gets lost" }];
const OUTCOME_WORDS = { goal: "reached the drive", laser: "ran into a laser", loop: "wandered and got lost" };

export function mountQLab(root, { onDone, onBack, prev = null }) {
  // 2026-11-01 (playtesters: "so confusing to train the dog"): a guided first training (meet the untrained dog → watch it
  // learn → send it), plain-language reward choices, "guess, then test" experiments, one action bar that always shows the
  // next step, and a test run of the learned route. The exact sliders, vault extras and views moved into "Advanced Lab".
  // (Previous layout: git history, commit 3fa8b78.)
  const firstVisit = !seenGuide();
  root.innerHTML = `
    <div class="lab qlab${firstVisit ? " q-first" : ""}">
      <header class="lab-head">
        <div><p class="eyebrow">Mission 2 Lab · Reinforcement learning</p><h2>Train the robot dog</h2>
        <p class="lab-sub">Your dog must cross the laser vault to the <b class="gold">drive</b>. Nobody tells it the way: it learns by <b>trying again and again</b>, getting a <b>treat</b> 🦴 or a <b class="red">zap</b> ⚡ for what it does. You choose the treats and zaps.</p></div>
      </header>
      <ol class="q-steps" id="q-steps">
        <li data-step="1"><span class="hs-num">1</span><div><b>Meet your dog</b><p>See what an untrained dog does.</p><button type="button" class="btn-ghost q-step-btn" id="q-meet">Watch it</button></div></li>
        <li data-step="2"><span class="hs-num">2</span><div><b>Train it</b><p>Watch it practise and improve.</p></div></li>
        <li data-step="3"><span class="hs-num">3</span><div><b>Send it</b><p>Test its route, then start the mission.</p></div></li>
      </ol>
      <div class="lab-body">
        <div class="q-main">
          <div class="q-vault"><span><b id="q-vault-label">Vault</b> · shortest safe route <b id="q-shortest">–</b> steps</span></div>
          <canvas id="q-grid" width="420" height="420" aria-label="Vault grid"></canvas>
          <div class="q-legend"><span class="sw sw-start"></span>start <span class="sw sw-goal"></span>drive <span class="sw sw-laser"></span>laser <span class="sw sw-blink"></span>blinking <span class="sw sw-wet"></span>puddle <span class="sw sw-bat"></span>battery <span class="sw sw-path"></span>learned route</div>
          <div class="q-status" id="q-status" aria-live="polite"></div>
          <div id="q-verdict" class="lab-warn q-verdict hidden" aria-live="polite"></div>
          <p id="q-challenge" class="q-challenge hidden"></p>
        </div>
        <aside class="lab-side q-side">
          <section class="q-card q-rewards" id="q-rewards"><h3>Treats and zaps</h3>
            ${REWARD_CHOICES.map((g) => `<div class="q-choice" data-group="${g.key}"><span class="q-choice-q">${g.emoji} ${g.label}</span><div class="q-seg" role="radiogroup" aria-label="${g.label}">${g.options.map((o) => `<button type="button" role="radio" data-reward="${g.key}" data-value="${o.v}">${o.label}</button>`).join("")}</div><span class="q-hint q-choice-hint" data-hint="${g.key}"></span></div>`).join("")}
          </section>
          <section class="q-card q-experiments" id="q-experiments"><h3>Experiments: guess, then test</h3>
            <div class="q-exp-list">${EXPERIMENTS.map((x) => `<button type="button" class="q-exp" data-exp="${x.id}">${x.question}</button>`).join("")}</div>
            <div class="q-exp-ask hidden" id="q-exp-ask"><p class="q-exp-q" id="q-exp-q"></p><p class="fine">What will the dog do? Pick your guess and the dog trains straight away.</p>
              <div class="q-seg q-guesses">${GUESSES.map((g) => `<button type="button" data-guess="${g.id}">${g.label}</button>`).join("")}</div>
              <button type="button" class="btn-link" id="q-exp-cancel">Cancel</button></div>
          </section>
          <details class="q-advanced" id="q-advanced"><summary>Advanced Lab: exact numbers, vault extras, views</summary>
          <details class="q-how"><summary>How do rewards work?</summary>
            <p>The dog does not know the vault. It tries moves at random thousands of times. After every move it gets the points you set below, and it slowly learns which move in each square earns the most points <b>in total</b>. A run ends when it reaches the drive, touches a laser, or takes too long.</p>
            <p><b>Positive</b> = "do more of this". <b>Negative</b> = "avoid this". <b>Zero</b> = "I don't care". The dog does exactly what the points reward, not what you meant.</p>
            <p><b>Vault extras:</b> batteries are optional bonuses off the route; blinking lasers switch off every few steps (the dog can wait); puddles make it slide sideways sometimes.</p>
          </details>
          <div class="q-vault-btns"><span class="fine">Vault:</span><button type="button" class="q-preset" id="q-new">New vault</button><button type="button" class="q-preset" id="q-classic">Classic</button></div>
          <div class="view-toggle q-views" role="group" aria-label="What to show on the grid">
            <button type="button" data-view="arrows" aria-pressed="true">Best moves</button><button type="button" data-view="value" aria-pressed="false">What it learned</button><button type="button" data-view="visits" aria-pressed="false">Where it explored</button>
          </div>
          <p class="fine q-view-note" id="q-view-note"></p>
          <div class="q-presets" role="group" aria-label="Ready-made settings">${PRESETS.map((p) => `<button type="button" class="q-preset" data-preset="${p.id}" title="${p.note}">${p.label}</button>`).join("")}</div>
          <p class="q-preset-note fine" id="q-preset-note">Ready-made settings, or set exact numbers below.</p>
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
          <dl class="metric-row q-metrics"><div><dt>Episode</dt><dd id="q-ep">0</dd></div><div><dt>Epsilon <span class="nocaps">ε</span></dt><dd id="q-eps">1.00</dd></div></dl>
          <canvas id="q-chart" width="300" height="110" aria-label="Reward per episode"></canvas>
          <p class="fine">Reward per episode (25-episode moving average). α = ${HYPER.alpha}, γ = ${HYPER.gamma}, ε decays ${HYPER.epsilonStart} → ${HYPER.epsilonEnd}.</p>
          </details>
        </aside>
      </div>
      <div class="q-actionbar" id="q-actionbar">
        <p class="q-next" id="q-next"></p>
        <div class="q-actions">
          <button class="btn-link" id="q-back">Back to briefing</button>
          <button class="btn-ghost" id="q-test" disabled>Test run</button>
          <button class="btn-primary" id="q-train">Train the dog</button>
          <button class="btn-primary btn-go" id="q-go" disabled>Start mission</button>
        </div>
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
    // plain-language choices mirror the exact values (none lit = a custom value set in Advanced Lab)
    for (const g of REWARD_CHOICES) {
      root.querySelectorAll(`[data-reward="${g.key}"]`).forEach((b) => b.setAttribute("aria-checked", String(Math.abs(Number(b.dataset.value) - rewards[g.key]) < 1e-9)));
      const h = sliderHint(g.key, rewards[g.key], { step: rewards.step }), el = root.querySelector(`[data-hint="${g.key}"]`);
      el.textContent = h.text ? (h.kind === "good" ? "✓ " : "⚠ ") + h.text : ""; el.dataset.kind = h.kind;
    }
  }
  function invalidate() { // settings changed: the trained dog no longer matches
    if (agent && !stale) stale = null;
    agent = null; $("#q-go").disabled = true; $("#q-verdict").classList.add("hidden"); $("#q-challenge").classList.add("hidden");
    expMsg = null; updateBar();
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
    if (dog) { // the dog itself (meet, test run): a trail and the dog on its current square
      ctx.strokeStyle = dog.color; ctx.lineWidth = 3; ctx.beginPath();
      dog.trail.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, p.x * c + c / 2, p.z * c + c / 2)); ctx.stroke();
      const p = dog.trail[dog.trail.length - 1];
      ctx.font = `${c * 0.7}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(dog.icon, p.x * c + c / 2, p.z * c + c / 2 + 1);
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
    const g = verdictCore();
    // experiment: compare the player's guess with what the dog really learned
    if (pendingExp) {
      const right = pendingExp.guess === g.outcome, x = EXPERIMENTS.find((e) => e.id === pendingExp.id);
      $("#q-verdict").insertAdjacentHTML("afterbegin", `<p class="q-exp-result" data-kind="${right ? "good" : "bad"}">🧪 <b>${x.question}</b><br>You guessed: <b>${GUESSES.find((q) => q.id === pendingExp.guess).label.toLowerCase()}</b>. The dog <b>${OUTCOME_WORDS[g.outcome] ?? g.outcome}</b>. ${right ? "Well predicted!" : "Not quite: read why below."}</p><button type="button" class="btn-link q-exp-reset">Back to the recommended treats and zaps</button>`);
      $("#q-verdict .q-exp-reset").addEventListener("click", () => applyPreset("recommended"));
      expMsg = `🧪 You guessed <b>${GUESSES.find((q) => q.id === pendingExp.guess).label.toLowerCase()}</b>; the dog <b>${OUTCOME_WORDS[g.outcome] ?? g.outcome}</b>. ${right ? "Well predicted!" : "Not quite."} The reason is below the vault.`;
      pendingExp = null;
      requestAnimationFrame(() => $("#q-verdict").scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }
    if (root.querySelector(".lab").classList.contains("q-first")) { root.querySelector(".lab").classList.remove("q-first"); markGuide(); } // first training done: everything unlocks
    $("#q-status").innerHTML = g.outcome === "goal" ? `Trained on <b>${agent.done.toLocaleString()}</b> attempts. The <b class="green">green line</b> is the route it learned.` : `Trained on <b>${agent.done.toLocaleString()}</b> attempts, but its route does not reach the drive.`;
    updateBar();
    return g;
  }
  function verdictCore() {
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
    // RETIRED 2026-11-01: a fixed ~2 s burst. Now it starts slow (each early attempt is visible) and speeds up, with a
    // running tally of how attempts end, so players see the dog fail, explore and improve.
    // const perFrame = Math.max(5, Math.ceil(episodes / 120));
    const run = agent, recent = [];
    let frame = 0;
    dog = null; updateBar();
    const tick = () => {
      // A slider change (agent = null) or a new training run replaces the agent: stop this animation.
      if (agent !== run) { if (!agent) { training = false; $("#q-train").disabled = false; updateBar(); } return; }
      const perFrame = Math.max(1, Math.min(Math.ceil(episodes / 40), 1 + Math.floor(frame++ / 12)));
      for (let i = 0; i < perFrame && agent.done < agent.episodes; i++) {
        const ep = trainEpisodes(agent, 1);
        if (ep) { lastPath = ep.path; recent.push(ep.outcome === "goal" ? "goal" : ep.outcome === "laser" ? "laser" : "loop"); if (recent.length > 50) recent.shift(); }
      }
      noteMilestone(agent);
      $("#q-ep").textContent = agent.done; $("#q-eps").textContent = agent.epsilon.toFixed(2);
      showTraining(recent);
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
  root.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => applyPreset(b.dataset.preset)));
  function applyPreset(id) {
    const p = PRESETS.find((x) => x.id === id), b = root.querySelector(`[data-preset="${id}"]`);
    episodes = p.episodes; $("#r-eps").value = p.episodes; $("#r-eps").dispatchEvent(new Event("input"));
    setOptions({ batteries: !!p.options?.batteries, blinking: !!p.options?.blinking, slip: p.options?.slip ?? 0 });
    setRewards({ goal: p.goal, laser: p.laser, step: p.step, battery: p.battery ?? DEFAULT_REWARDS.battery });
    root.querySelectorAll("[data-preset]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    $("#q-preset-note").textContent = `${p.label}: ${p.note} Press Train.`;
  }
  $("#q-go").addEventListener("click", () => {
    const g = greedyPath(agent);
    onDone({ agent, report: { rewards: { ...rewards }, episodes, outcome: g.outcome, pathLength: g.path.length - 1, vault: env.label, batteries: env.batteries.length > 0, blinking: env.blink.size > 0, slip: env.slip, successRate: lastEval?.successRate ?? null, firstSolvedAt: agent.firstSolvedAt } });
  });
  $("#q-back").addEventListener("click", onBack);
  // ---------- 2026-11-01: guided steps, plain choices, experiments, test run, action bar ----------
  let dog = null, meetDone = !!prev, pendingExp = null, animToken = 0, expMsg = null;
  /** Walk the dog along a path square by square (the meet step and the test run). Resolves when it arrives. */
  function walk(path, { icon = "🐕", color = "rgba(41,230,255,.6)", ms = 140 } = {}) {
    const token = ++animToken;
    return new Promise((done) => {
      let i = 1; dog = { trail: [path[0]], icon, color }; draw();
      const timer = setInterval(() => {
        if (token !== animToken || !root.isConnected) { clearInterval(timer); return done(false); }
        if (i >= path.length) { clearInterval(timer); return done(true); }
        dog.trail.push(path[i++]); draw();
      }, ms);
    });
  }
  /** An untrained dog: random moves until it is zapped, finds the drive by luck, or gives up. */
  function untrainedWalk(seed = 3) {
    const rng = mulberry32(seed);
    let st = { x: env.start.x, z: env.start.z, mask: 0, t: 0 }, hit = null;
    const path = [{ x: st.x, z: st.z }];
    for (let i = 0; i < 60 && !hit; i++) { const r = stepEnv(env, st, Math.floor(rng() * 4), rewards, rng); st = r.next; hit = r.hit; path.push({ x: st.x, z: st.z }); }
    return { path, outcome: hit ?? "loop" };
  }
  $("#q-meet").addEventListener("click", async () => {
    $("#q-meet").disabled = true; const keep = lastPath; lastPath = null; // a trained dog is kept; only the picture changes
    const w = untrainedWalk();
    $("#q-status").innerHTML = "An untrained dog knows nothing about the vault: it moves at random…";
    await walk(w.path, { icon: w.outcome === "laser" ? "🐕" : "🐕", color: "rgba(255,140,60,.75)" });
    $("#q-status").innerHTML = w.outcome === "laser" ? `⚡ <b>Zapped by a laser</b> after ${w.path.length - 1} random steps. It has no idea where the drive is. <b>Training</b> teaches it from treats and zaps.` : w.outcome === "goal" ? "It stumbled onto the drive by pure luck. It could never do that again on purpose: it needs <b>training</b>." : `It wandered ${w.path.length - 1} steps without finding the drive. It needs <b>training</b>.`;
    dog = null; lastPath = keep; draw();
    meetDone = true; $("#q-meet").disabled = false; $("#q-meet").textContent = "Watch again"; updateBar();
  });
  // plain-language reward choices
  root.querySelectorAll("[data-reward]").forEach((b) => b.addEventListener("click", () => setRewards({ [b.dataset.reward]: Number(b.dataset.value) })));
  // experiments: question → guess → train → compare
  root.querySelectorAll("[data-exp]").forEach((b) => b.addEventListener("click", () => {
    pendingExp = { id: b.dataset.exp };
    $("#q-exp-q").textContent = EXPERIMENTS.find((x) => x.id === b.dataset.exp).question;
    $("#q-exp-ask").classList.remove("hidden"); root.querySelector(".q-exp-list").classList.add("hidden");
  }));
  const closeAsk = () => { $("#q-exp-ask").classList.add("hidden"); root.querySelector(".q-exp-list").classList.remove("hidden"); };
  $("#q-exp-cancel").addEventListener("click", () => { pendingExp = null; closeAsk(); });
  root.querySelectorAll("[data-guess]").forEach((b) => b.addEventListener("click", () => {
    const exp = { ...pendingExp, guess: b.dataset.guess };
    applyPreset(EXPERIMENTS.find((x) => x.id === exp.id).preset);
    pendingExp = exp; closeAsk(); train();
  }));
  // test run: the dog walks the route it learned (on a slippery floor: one real run, slips included)
  async function testRun() {
    if (!agent) return;
    const run = env.slip > 0 ? rollout(agent, mulberry32(Math.floor(Math.random() * 1e9))) : greedyPath(agent);
    $("#q-test").disabled = true;
    $("#q-status").textContent = "Test run: the dog follows exactly what it learned…";
    const ok = await walk(run.path, { color: "rgba(61,255,154,.8)", ms: 110 });
    if (ok) $("#q-status").innerHTML = run.outcome === "goal" ? `🐕 <b>Reached the drive in ${run.path.length - 1} steps.</b> It will do the same in the mission.` : run.outcome === "laser" ? "⚡ <b>It ran into a laser.</b> In the mission this sets off the alarm: change the treats and zaps, then train again." : "It went round in circles. In the mission the dog would get lost: train again.";
    dog = null; $("#q-test").disabled = !agent; updateBar();
  }
  $("#q-test").addEventListener("click", testRun);
  function showTraining(recent) {
    const n = { goal: 0, laser: 0, loop: 0 }; recent.forEach((o) => n[o]++);
    const pct = (k) => (recent.length ? (100 * n[k]) / recent.length : 0);
    // the bar at the bottom always shows the count, even when the grid's caption is below the screen edge
    $("#q-next").innerHTML = `Attempt <b>${agent.done.toLocaleString()}</b> of ${agent.episodes.toLocaleString()} · last ${recent.length}: <b class="green">${n.goal} reached the drive</b>, <b class="red">${n.laser} zapped</b>, ${n.loop} lost`;
    $("#q-status").innerHTML = `<div class="q-progress"><span>Attempt <b>${agent.done.toLocaleString()}</b> of ${agent.episodes.toLocaleString()}</span><i style="width:${(100 * agent.done) / agent.episodes}%"></i></div>
      <p>Last ${recent.length} attempts: <b class="green">${n.goal} reached the drive</b> · <b class="red">${n.laser} zapped</b> · ${n.loop} got lost</p>
      <div class="q-tally" aria-hidden="true"><i class="t-goal" style="width:${pct("goal")}%"></i><i class="t-laser" style="width:${pct("laser")}%"></i><i class="t-loop" style="width:${pct("loop")}%"></i></div>`;
  }
  /** One clear next step, always in view (the bar at the bottom of the Lab). */
  function updateBar() {
    const ready = !!agent && !training, ok = ready && greedyPath(agent).outcome === "goal";
    const steps = root.querySelectorAll("#q-steps li");
    const state = [meetDone || !!agent ? "done" : "active", ready ? "done" : meetDone || training ? "active" : "", ready ? "active" : ""];
    steps.forEach((li, i) => { li.classList.toggle("done", state[i] === "done"); li.classList.toggle("active", state[i] === "active"); });
    $("#q-train").textContent = training ? "Training…" : agent ? "Train again" : "Train the dog";
    $("#q-test").disabled = !ready || !!dog;
    $("#q-go").classList.toggle("btn-primary", !ready || ok); $("#q-go").classList.toggle("btn-ghost", ready && !ok); // a failing dog: retrain is the main action
    $("#q-train").classList.toggle("btn-primary", !ready || !ok); $("#q-train").classList.toggle("btn-ghost", ready && ok);
    if (training) return; // during training the bar shows the live count (showTraining)
    if (expMsg && ready) { $("#q-next").innerHTML = expMsg; return; }
    $("#q-next").innerHTML = training ? ""
      : ok ? "Next: <b>Test run</b> to watch its route, then <b>Start mission</b>."
      : ready ? "Its route does not reach the drive. Change the <b>treats and zaps</b> and train again."
      : meetDone ? "Next: press <b>Train the dog</b>." : "Start with <b>1. Meet your dog</b>, or go straight to <b>Train the dog</b>.";
  }

  rebuildEnv(); refreshHints();
  if (agent) verdict(); else draw();
  drawChart();
  updateBar();
  return { trainNow, setRewards, setOptions, setVault, testRun, untrainedWalk, applyPreset, get agent() { return agent; }, get env() { return env; }, ACTIONS };
}
