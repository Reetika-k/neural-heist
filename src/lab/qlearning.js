// Tabular Q-learning for the robot dog (Mission 2).
//
// The vault is a 10×10 grid. State = the dog's cell (100 states). Actions = up, down, left, right.
// The player chooses the three rewards. Each step the agent updates
//     Q(s,a) ← Q(s,a) + α · ( r + γ · max_a' Q(s',a') − Q(s,a) )
// and picks actions ε-greedily (random with probability ε, which decays over training).
// After training, the dog follows the greedy policy: always the action with the highest Q.
import { mulberry32 } from "./rng.js";

export const VAULT = { size: 10, start: { x: 0, z: 9 }, goal: { x: 9, z: 0 } };
// Laser rows with gaps that force a zig-zag; the same layout is drawn in the Lab and in Mission 2.
export const LASERS = new Set([
  ...[0, 1, 2, 3, 4, 5, 6].map((x) => `${x},7`),
  ...[3, 4, 5, 6, 7, 8, 9].map((x) => `${x},4`),
  ...[0, 1, 2, 3, 4, 5, 6].map((x) => `${x},1`),
  "9,8", "5,5",
]);
export const ACTIONS = [{ dx: 0, dz: -1, name: "up" }, { dx: 0, dz: 1, name: "down" }, { dx: -1, dz: 0, name: "left" }, { dx: 1, dz: 0, name: "right" }];
export const DEFAULT_REWARDS = { goal: 10, laser: -10, step: -0.1 };
export const HYPER = { alpha: 0.2, gamma: 0.95, epsilonStart: 1, epsilonEnd: 0.05, maxSteps: 120 };

const idx = (c) => c.z * VAULT.size + c.x;
const isLaser = (c) => LASERS.has(`${c.x},${c.z}`);
const isGoal = (c) => c.x === VAULT.goal.x && c.z === VAULT.goal.z;

/** One environment step. Lasers and the goal end the episode; bumping a wall keeps the dog in place. */
export function envStep(cell, action, rewards) {
  const a = ACTIONS[action];
  const n = { x: cell.x + a.dx, z: cell.z + a.dz };
  if (n.x < 0 || n.z < 0 || n.x >= VAULT.size || n.z >= VAULT.size) return { next: cell, reward: rewards.step, done: false, hit: null };
  if (isLaser(n)) return { next: n, reward: rewards.laser, done: true, hit: "laser" };
  if (isGoal(n)) return { next: n, reward: rewards.goal, done: true, hit: "goal" };
  return { next: n, reward: rewards.step, done: false, hit: null };
}

export function createAgent({ rewards = DEFAULT_REWARDS, episodes = 1500, seed = 1 } = {}) {
  return { q: new Float64Array(VAULT.size * VAULT.size * ACTIONS.length), rewards: { ...rewards }, episodes, done: 0, epsilon: HYPER.epsilonStart, history: [], rng: mulberry32(seed) };
}

const bestAction = (q, s, rng) => {
  let best = 0, bestV = -Infinity, ties = 0;
  for (let a = 0; a < ACTIONS.length; a++) {
    const v = q[s * 4 + a];
    if (v > bestV) { bestV = v; best = a; ties = 1; } else if (v === bestV && rng && rng() < 1 / ++ties) best = a;
  }
  return best;
};

/** Run one training episode; returns { reward, steps, outcome, path }. */
export function trainEpisode(agent) {
  const { q, rewards, rng } = agent;
  let cell = { ...VAULT.start }, total = 0, outcome = "timeout";
  const path = [cell];
  for (let t = 0; t < HYPER.maxSteps; t++) {
    const s = idx(cell);
    const a = rng() < agent.epsilon ? Math.floor(rng() * ACTIONS.length) : bestAction(q, s, rng);
    const { next, reward, done, hit } = envStep(cell, a, rewards);
    const target = done ? reward : reward + HYPER.gamma * q[idx(next) * 4 + bestAction(q, idx(next))];
    q[s * 4 + a] += HYPER.alpha * (target - q[s * 4 + a]);
    total += reward; cell = next; path.push(cell);
    if (done) { outcome = hit; break; }
  }
  agent.done++;
  // linear ε decay over the first 80% of the planned episodes
  const frac = Math.min(1, agent.done / (agent.episodes * 0.8));
  agent.epsilon = HYPER.epsilonStart + (HYPER.epsilonEnd - HYPER.epsilonStart) * frac;
  agent.history.push(total);
  return { reward: total, steps: path.length - 1, outcome, path };
}

export function trainEpisodes(agent, n) {
  let last = null;
  for (let i = 0; i < n && agent.done < agent.episodes; i++) last = trainEpisode(agent);
  return last;
}

/** Follow the greedy policy from the start. outcome: "goal" | "laser" | "loop" (revisits a cell or runs out of steps). */
export function greedyPath(agent, maxSteps = 60) {
  let cell = { ...VAULT.start };
  const path = [cell], seen = new Set([idx(cell)]);
  for (let t = 0; t < maxSteps; t++) {
    const { next, hit } = envStep(cell, bestAction(agent.q, idx(cell)), agent.rewards);
    path.push(next);
    if (hit) return { path, outcome: hit };
    if (seen.has(idx(next))) return { path, outcome: "loop" };
    seen.add(idx(next)); cell = next;
  }
  return { path, outcome: "loop" };
}

/** Best action per cell, for drawing the policy arrows. */
export const policy = (agent) => Array.from({ length: VAULT.size * VAULT.size }, (_, s) => bestAction(agent.q, s));

/** Shortest safe path length (BFS), used to score how efficient the learned path is. */
export function shortestSafe() {
  const q = [[VAULT.start, 0]], seen = new Set([idx(VAULT.start)]);
  while (q.length) {
    const [c, d] = q.shift();
    if (isGoal(c)) return d;
    for (const a of ACTIONS) {
      const n = { x: c.x + a.dx, z: c.z + a.dz };
      if (n.x < 0 || n.z < 0 || n.x >= VAULT.size || n.z >= VAULT.size || isLaser(n) || seen.has(idx(n))) continue;
      seen.add(idx(n)); q.push([n, d + 1]);
    }
  }
  return null;
}

/** Moving average of episode rewards (for the chart). */
export function movingAverage(xs, w = 25) {
  const out = []; let s = 0;
  xs.forEach((x, i) => { s += x; if (i >= w) s -= xs[i - w]; out.push(s / Math.min(i + 1, w)); });
  return out;
}
