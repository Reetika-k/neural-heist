// Mission 2 Lab: design rewards, watch tabular Q-learning train live, inspect the learned policy.
import { createAgent, trainEpisodes, greedyPath, policy, movingAverage, VAULT, LASERS, ACTIONS, DEFAULT_REWARDS, HYPER } from "../lab/qlearning.js";

const ARROWS = ["↑", "↓", "←", "→"];

export function mountQLab(root, { onDone, onBack, prev = null }) {
  root.innerHTML = `
    <div class="lab">
      <header class="lab-head">
        <div><p class="eyebrow">Mission 2 Lab · Reinforcement learning</p><h2>Train the robot dog</h2>
        <p class="lab-sub">The dog learns by trial and error. You decide what it is rewarded for. It starts at the bottom-left and must reach the drive at the top-right without touching a <b class="red">laser</b>. After training it follows its best-known action in every cell.</p></div>
      </header>
      <div class="lab-body">
        <div class="q-main">
          <canvas id="q-grid" width="420" height="420" aria-label="Vault grid"></canvas>
          <div class="q-legend"><span class="sw sw-start"></span>start <span class="sw sw-goal"></span>drive <span class="sw sw-laser"></span>laser <span class="sw sw-path"></span>learned path</div>
        </div>
        <aside class="lab-side">
          <label class="slider">Reward for reaching the drive <b id="v-goal"></b><input type="range" id="r-goal" min="0" max="20" step="1"></label>
          <label class="slider">Reward for touching a laser <b id="v-laser"></b><input type="range" id="r-laser" min="-20" max="10" step="1"></label>
          <label class="slider">Reward for each step <b id="v-step"></b><input type="range" id="r-step" min="-2" max="0" step="0.1"></label>
          <label class="slider">Training episodes <b id="v-eps"></b><input type="range" id="r-eps" min="100" max="3000" step="100"></label>
          <button class="btn-primary" id="q-train">Train</button>
          <dl class="metric-row q-metrics"><div><dt>Episode</dt><dd id="q-ep">0</dd></div><div><dt>Epsilon <span class="nocaps">ε</span></dt><dd id="q-eps">1.00</dd></div></dl>
          <canvas id="q-chart" width="300" height="110" aria-label="Reward per episode"></canvas>
          <p class="fine">Reward per episode (25-episode moving average). α = ${HYPER.alpha}, γ = ${HYPER.gamma}, ε decays ${HYPER.epsilonStart} → ${HYPER.epsilonEnd}.</p>
          <div id="q-verdict" class="lab-warn hidden"></div>
          <button class="btn-primary btn-go" id="q-go" disabled>Start mission</button>
          <button class="btn-link" id="q-back">Back to briefing</button>
        </aside>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const rewards = { ...(prev?.rewards ?? DEFAULT_REWARDS) };
  let episodes = prev?.episodes ?? 1500;
  let agent = prev, training = false, lastPath = null;
  const ctx = $("#q-grid").getContext("2d"), cctx = $("#q-chart").getContext("2d");

  const bind = (id, key, fmt) => {
    const el = $(`#r-${id}`); el.value = key === "eps" ? episodes : rewards[key];
    const show = () => ($(`#v-${id}`).textContent = fmt(Number(el.value)));
    el.addEventListener("input", () => { if (key === "eps") episodes = Number(el.value); else rewards[key] = Number(el.value); show(); agent = null; $("#q-go").disabled = true; $("#q-verdict").classList.add("hidden"); draw(); });
    show();
  };
  bind("goal", "goal", (v) => (v > 0 ? "+" : "") + v); bind("laser", "laser", (v) => (v > 0 ? "+" : "") + v); bind("step", "step", (v) => v.toFixed(1)); bind("eps", "eps", (v) => v);

  function draw() {
    const N = VAULT.size, c = 420 / N;
    ctx.fillStyle = "#0b1130"; ctx.fillRect(0, 0, 420, 420);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      ctx.fillStyle = (x + z) % 2 ? "#121a44" : "#0f163a"; ctx.fillRect(x * c, z * c, c, c);
      if (LASERS.has(`${x},${z}`)) { ctx.fillStyle = "rgba(255,45,85,.25)"; ctx.fillRect(x * c, z * c, c, c); ctx.fillStyle = "#ff2d55"; ctx.fillRect(x * c, z * c + c / 2 - 2, c, 4); }
    }
    ctx.fillStyle = "rgba(41,230,255,.35)"; ctx.fillRect(VAULT.start.x * c, VAULT.start.z * c, c, c);
    ctx.fillStyle = "rgba(255,210,61,.45)"; ctx.fillRect(VAULT.goal.x * c, VAULT.goal.z * c, c, c);
    ctx.font = `${c * 0.5}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("◆", VAULT.goal.x * c + c / 2, VAULT.goal.z * c + c / 2);
    if (agent && !training) {
      const pol = policy(agent);
      ctx.fillStyle = "rgba(230,236,255,.35)"; ctx.font = `${c * 0.36}px sans-serif`;
      pol.forEach((a, s) => { const x = s % N, z = Math.floor(s / N); if (!LASERS.has(`${x},${z}`) && !(x === VAULT.goal.x && z === VAULT.goal.z)) ctx.fillText(ARROWS[a], x * c + c / 2, z * c + c / 2); });
    }
    const path = lastPath;
    if (path) {
      ctx.strokeStyle = training ? "rgba(41,230,255,.5)" : "#3dff9a"; ctx.lineWidth = training ? 2 : 4; ctx.beginPath();
      path.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, p.x * c + c / 2, p.z * c + c / 2)); ctx.stroke();
      const end = path[path.length - 1]; ctx.fillStyle = "#29e6ff"; ctx.beginPath(); ctx.arc(end.x * c + c / 2, end.z * c + c / 2, c * 0.22, 0, Math.PI * 2); ctx.fill();
    }
  }
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
  function verdict() {
    const g = greedyPath(agent);
    lastPath = g.path;
    const v = $("#q-verdict"); v.classList.remove("hidden");
    const msgs = {
      goal: [`Learned path reaches the drive in ${g.path.length - 1} steps without touching a laser.`, "good"],
      laser: ["Learned path runs into a laser. Check the laser reward: is touching one actually punished?", "bad"],
      loop: ["The dog goes in circles and never reaches the drive. Try a step penalty or more episodes.", "bad"],
    };
    v.textContent = (g.outcome === "goal" ? "✓ " : "⚠ ") + msgs[g.outcome][0];
    v.dataset.kind = msgs[g.outcome][1];
    $("#q-go").disabled = false;
    draw();
    return g;
  }
  function train() {
    agent = createAgent({ rewards, episodes, seed: Math.floor(Math.random() * 1e9) });
    training = true; $("#q-train").disabled = true; $("#q-go").disabled = true; $("#q-verdict").classList.add("hidden");
    const perFrame = Math.max(5, Math.ceil(episodes / 120)); // ~2 seconds of visible learning
    const run = agent;
    const tick = () => {
      // A slider change (agent = null) or a new training run replaces the agent: stop this animation.
      if (agent !== run) { if (!agent) { training = false; $("#q-train").disabled = false; } return; }
      const ep = trainEpisodes(agent, perFrame);
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
    agent = createAgent({ rewards, episodes, seed });
    trainEpisodes(agent, episodes);
    $("#q-ep").textContent = agent.done; $("#q-eps").textContent = agent.epsilon.toFixed(2);
    drawChart(); return verdict();
  }
  const setRewards = (r) => { Object.assign(rewards, r); ["goal", "laser", "step"].forEach((k) => { $(`#r-${k}`).value = rewards[k]; $(`#r-${k}`).dispatchEvent(new Event("input")); }); };

  $("#q-train").addEventListener("click", train);
  $("#q-go").addEventListener("click", () => onDone({ agent, report: { rewards: { ...rewards }, episodes, outcome: greedyPath(agent).outcome, pathLength: greedyPath(agent).path.length - 1 } }));
  $("#q-back").addEventListener("click", onBack);
  if (agent) verdict(); else draw();
  drawChart();
  return { trainNow, setRewards, get agent() { return agent; }, ACTIONS };
}
