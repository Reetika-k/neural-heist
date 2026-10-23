// Tabular Q-learning for the robot dog (Mission 2).
//
// The vault is a 10×10 grid. The player chooses the rewards. Each step the agent updates
//     Q(s,a) ← Q(s,a) + α · ( r + γ · max_a' Q(s',a') − Q(s,a) )
// and picks actions ε-greedily (random with probability ε, which decays over training).
// After training, the dog follows the greedy policy: always the action with the highest Q.
//
// 2026-10-23: the vault became an *environment* (makeEnv) so the Lab can offer, on top of the classic layout:
//   • a new random vault (generateLayout, always solvable)        • bonus batteries (state remembers which are taken)
//   • blinking lasers (state includes the blink phase; "wait")     • slippery puddles (moves off them sometimes slide)
// Puddles, not a whole slippery floor: every corridor runs beside a laser wall, so with slipping everywhere no safe route
// exists and the dog can only gamble or freeze (measured: 0 % success). Puddles lie in the wall gaps next to the lasers;
// a dry crossing is always a couple of steps away, so the dog must choose: quick and risky, or longer and safe.
// With every option off, the classic environment behaves exactly as before: same states, same actions and the
// same random numbers, so all earlier measurements (shortest route 28 steps, 20/20 seeds…) still hold.
import { mulberry32 } from "./rng.js";

export const VAULT = { size: 10, start: { x: 0, z: 9 }, goal: { x: 9, z: 0 } };
// Laser rows with gaps that force a zig-zag; the classic layout, drawn in the Lab and in Mission 2.
export const LASERS = new Set([
  ...[0, 1, 2, 3, 4, 5, 6].map((x) => `${x},7`),
  ...[3, 4, 5, 6, 7, 8, 9].map((x) => `${x},4`),
  ...[0, 1, 2, 3, 4, 5, 6].map((x) => `${x},1`),
  "9,8", "5,5",
]);
// up, down, left, right; "wait" is only available when lasers blink (the dog may need to wait for a gap)
export const ACTIONS = [{ dx: 0, dz: -1, name: "up" }, { dx: 0, dz: 1, name: "down" }, { dx: -1, dz: 0, name: "left" }, { dx: 1, dz: 0, name: "right" }, { dx: 0, dz: 0, name: "wait" }];
const PERPENDICULAR = [[2, 3], [2, 3], [0, 1], [0, 1]]; // where a slip sends each move
export const DEFAULT_REWARDS = { goal: 10, laser: -10, step: -0.1, battery: 1 };
export const HYPER = { alpha: 0.2, gamma: 0.95, epsilonStart: 1, epsilonEnd: 0.05, maxSteps: 120 };
export const BLINK = { period: 6, on: 3 }; // blinking lasers: on for 3 steps, off for 3

const key = (c) => `${c.x},${c.z}`;
const inside = (n, N) => n.x >= 0 && n.z >= 0 && n.x < N && n.z < N;

// Classic extras, chosen so each option teaches its lesson on the familiar layout:
// batteries off the 28-step route in corridors the dog explores (detours of 4 and 6 steps; measured: worth it once the
// bonus beats about 3 × the step cost); the right end of the row-4 wall blinks, opening a shortcut (19 steps).
const CLASSIC_LAYOUT = { lasers: LASERS, blink: ["7,4", "8,4", "9,4"], batteries: [{ x: 0, z: 2 }, { x: 9, z: 5 }] };

/**
 * An environment: layout ("classic" or a random seed) plus options.
 * @returns {{ id, label, size, start, goal, lasers: Set, blink: Set, batteries: {x,z}[], slip, nA, phases, masks }}
 */
export function makeEnv({ layout = "classic", seed = 0, batteries = false, blinking = false, slip = 0 } = {}) {
  const base = layout === "classic" ? CLASSIC_LAYOUT : generateLayout(seed);
  const bat = batteries ? base.batteries.map((c) => ({ ...c })) : [];
  const lasers = new Set(base.lasers);
  return {
    layout, seed: layout === "classic" ? 0 : seed,
    label: layout === "classic" ? "Classic vault" : `Vault #${seed}`,
    size: VAULT.size, start: { ...VAULT.start }, goal: { ...VAULT.goal },
    lasers, blink: new Set(blinking ? base.blink : []), batteries: bat,
    slip: Math.max(0, Math.min(0.5, slip)), wet: slip > 0 ? puddles(lasers, VAULT.size) : new Set(),
    nA: blinking ? 5 : 4, phases: blinking ? BLINK.period : 1, masks: 1 << bat.length,
  };
}
export const CLASSIC = makeEnv();

/** Puddles: free cells with a laser directly left or right of them, in rows that hold a laser wall (the wall gaps). */
export function puddles(lasers, N) {
  const wet = new Set();
  for (let z = 0; z < N; z++) {
    let laserCount = 0; for (let x = 0; x < N; x++) if (lasers.has(`${x},${z}`)) laserCount++;
    if (laserCount < 4) continue; // not a wall row
    for (let x = 0; x < N; x++) if (!lasers.has(`${x},${z}`) && (lasers.has(`${x - 1},${z}`) || lasers.has(`${x + 1},${z}`))) wet.add(`${x},${z}`);
  }
  return wet;
}

/** Is the laser in this cell on at time step t? Blinking lasers are on for BLINK.on steps out of every BLINK.period. */
export const laserOn = (env, c, t) => env.lasers.has(key(c)) && (!env.blink.has(key(c)) || ((t % BLINK.period) + BLINK.period) % BLINK.period < BLINK.on);
const stateIndex = (env, st) => (((st.t % env.phases) * env.masks + st.mask) * env.size + st.z) * env.size + st.x;
const isGoal = (env, c) => c.x === env.goal.x && c.z === env.goal.z;
const batteryAt = (env, c) => env.batteries.findIndex((b) => b.x === c.x && b.z === c.z);

/**
 * One environment step from state st = { x, z, mask, t }. Lasers and the goal end the episode; bumping a wall keeps
 * the dog in place. On a slippery floor a move slides sideways with probability env.slip (uses rng only then).
 */
export function stepEnv(env, st, action, rewards, rng) {
  let act = action;
  if (env.slip > 0 && action < 4 && rng && env.wet.has(`${st.x},${st.z}`) && rng() < env.slip) act = PERPENDICULAR[action][rng() < 0.5 ? 0 : 1];
  const a = ACTIONS[act];
  let n = { x: st.x + a.dx, z: st.z + a.dz };
  if (!inside(n, env.size)) n = { x: st.x, z: st.z };
  const t = st.t + 1;
  const next = { x: n.x, z: n.z, mask: st.mask, t };
  if (laserOn(env, n, t)) return { next, reward: rewards.laser, done: true, hit: "laser", slipped: act !== action };
  if (isGoal(env, n)) return { next, reward: rewards.goal, done: true, hit: "goal", slipped: act !== action };
  let reward = rewards.step;
  const b = batteryAt(env, n);
  if (b >= 0 && !(st.mask & (1 << b))) { reward += rewards.battery ?? 0; next.mask = st.mask | (1 << b); }
  return { next, reward, done: false, hit: null, slipped: act !== action };
}

/** Classic-environment step on a cell (kept for the existing tests and callers). */
export function envStep(cell, action, rewards, env = CLASSIC) {
  const { next, reward, done, hit } = stepEnv(env, { x: cell.x, z: cell.z, mask: 0, t: 0 }, action, rewards, null);
  return { next: { x: next.x, z: next.z }, reward, done, hit };
}

export function createAgent({ rewards = DEFAULT_REWARDS, episodes = 1500, seed = 1, env = CLASSIC } = {}) {
  const N = env.size;
  return {
    env, q: new Float64Array(N * N * env.masks * env.phases * env.nA), rewards: { ...rewards }, episodes, done: 0,
    epsilon: HYPER.epsilonStart, history: [], rng: mulberry32(seed), visits: new Uint32Array(N * N), firstSolvedAt: null,
  };
}

const bestAction = (q, s, nA, rng) => {
  let best = 0, bestV = -Infinity, ties = 0;
  for (let a = 0; a < nA; a++) {
    const v = q[s * nA + a];
    if (v > bestV) { bestV = v; best = a; ties = 1; } else if (v === bestV && rng && rng() < 1 / ++ties) best = a;
  }
  return best;
};

/** Run one training episode; returns { reward, steps, outcome, path }. */
export function trainEpisode(agent) {
  const { q, rewards, rng, env, visits } = agent, nA = env.nA, N = env.size;
  let st = { x: env.start.x, z: env.start.z, mask: 0, t: 0 }, total = 0, outcome = "timeout";
  const path = [{ x: st.x, z: st.z }];
  for (let i = 0; i < HYPER.maxSteps; i++) {
    const s = stateIndex(env, st);
    const a = rng() < agent.epsilon ? Math.floor(rng() * nA) : bestAction(q, s, nA, rng);
    const { next, reward, done, hit } = stepEnv(env, st, a, rewards, rng);
    const target = done ? reward : reward + HYPER.gamma * q[stateIndex(env, next) * nA + bestAction(q, stateIndex(env, next), nA)];
    q[s * nA + a] += HYPER.alpha * (target - q[s * nA + a]);
    total += reward; st = next; path.push({ x: st.x, z: st.z }); visits[st.z * N + st.x]++;
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

/**
 * Training challenge: note the first practice run after which the dog's route reaches the drive
 * (checked every `every` runs). Returns the run number, or null.
 */
export function noteMilestone(agent) {
  if (agent.firstSolvedAt == null && greedyPath(agent).outcome === "goal") agent.firstSolvedAt = agent.done;
  return agent.firstSolvedAt;
}
/** Train all planned episodes in chunks, recording the training-challenge milestone. */
export function trainWithMilestone(agent, every = 25) {
  while (agent.done < agent.episodes) { trainEpisodes(agent, every); noteMilestone(agent); }
  return agent;
}

/**
 * The route the dog intends to take: follow the best action, no slipping.
 * outcome: "goal" | "laser" | "loop" (revisits a state or runs out of steps).
 */
export function greedyPath(agent, maxSteps = 100) {
  const { env, q } = agent;
  let st = { x: env.start.x, z: env.start.z, mask: 0, t: 0 };
  const path = [{ x: st.x, z: st.z }], seen = new Set([stateIndex(env, st)]);
  for (let i = 0; i < maxSteps; i++) {
    const { next, hit } = stepEnv(env, st, bestAction(q, stateIndex(env, st), env.nA), agent.rewards, null);
    path.push({ x: next.x, z: next.z });
    if (hit) return { path, outcome: hit, batteries: popcount(next.mask) };
    const s = stateIndex(env, next);
    if (seen.has(s)) return { path, outcome: "loop", batteries: popcount(next.mask) };
    seen.add(s); st = next;
  }
  return { path, outcome: "loop", batteries: popcount(st.mask) };
}
const popcount = (m) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };

/** One real run on the (possibly slippery) floor: the best action each step, but moves may slide. */
export function rollout(agent, rng, maxSteps = 150) {
  const { env, q } = agent;
  let st = { x: env.start.x, z: env.start.z, mask: 0, t: 0 }, slips = 0;
  const path = [{ x: st.x, z: st.z }];
  for (let i = 0; i < maxSteps; i++) {
    const { next, hit, slipped } = stepEnv(env, st, bestAction(q, stateIndex(env, st), env.nA), agent.rewards, rng);
    if (slipped) slips++;
    path.push({ x: next.x, z: next.z });
    if (hit) return { path, outcome: hit, slips, batteries: popcount(next.mask) };
    st = next;
  }
  return { path, outcome: "loop", slips, batteries: popcount(st.mask) };
}

/** How the trained dog does over many real runs (matters on a slippery floor). */
export function evaluatePolicy(agent, runs = 200, seed = 7) {
  const rng = mulberry32(seed), out = { runs, goal: 0, laser: 0, loop: 0, steps: 0 };
  for (let i = 0; i < runs; i++) { const r = rollout(agent, rng); out[r.outcome]++; if (r.outcome === "goal") out.steps += r.path.length - 1; }
  out.successRate = out.goal / runs; out.avgSteps = out.goal ? out.steps / out.goal : null;
  return out;
}

/** Best action per cell (with no batteries taken, at blink phase 0), for drawing the policy arrows. */
export const policy = (agent) => Array.from({ length: agent.env.size ** 2 }, (_, c) => bestAction(agent.q, c, agent.env.nA));
/** How good the dog thinks each cell is: the best Q value for that cell in any situation (batteries taken, blink phase). */
export const valueMap = (agent) => {
  const { env, q } = agent, cells = env.size ** 2, layers = env.masks * env.phases;
  return Array.from({ length: cells }, (_, c) => { let m = -Infinity; for (let l = 0; l < layers; l++) for (let a = 0; a < env.nA; a++) m = Math.max(m, q[(l * cells + c) * env.nA + a]); return m; });
};

/** Shortest safe route (BFS over cell and blink phase, waiting allowed when lasers blink); batteries ignored. */
export function shortestSafe(env = CLASSIC) {
  const start = { x: env.start.x, z: env.start.z, t: 0 };
  const sk = (s) => `${s.x},${s.z},${s.t % env.phases}`;
  const queue = [[start, 0]], seen = new Set([sk(start)]);
  while (queue.length) {
    const [c, d] = queue.shift();
    if (isGoal(env, c)) return d;
    for (let a = 0; a < env.nA; a++) {
      const A = ACTIONS[a], n = { x: c.x + A.dx, z: c.z + A.dz, t: c.t + 1 };
      if (!inside(n, env.size) || laserOn(env, n, n.t) || seen.has(sk(n))) continue;
      seen.add(sk(n)); queue.push([n, d + 1]);
    }
  }
  return null;
}

/** Breadth-first distances from a cell over cells that are never lasers (blinking ones count as lasers). */
function distances(N, lasers, from) {
  const d = new Map([[key(from), 0]]), q = [from];
  while (q.length) {
    const c = q.shift();
    for (const A of ACTIONS.slice(0, 4)) {
      const n = { x: c.x + A.dx, z: c.z + A.dz };
      if (!inside(n, N) || lasers.has(key(n)) || d.has(key(n))) continue;
      d.set(key(n), d.get(key(c)) + 1); q.push(n);
    }
  }
  return d;
}

/**
 * A random vault: three laser walls, each with a gap, plus a few single lasers; always solvable, with a shortest
 * route of 22–38 steps; a blinking segment that would open a shortcut; two batteries off the shortest route
 * (detours of 4–12 steps). Deterministic for a seed.
 */
export function generateLayout(seed) {
  const rng = mulberry32(seed * 9973 + 17), N = VAULT.size;
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  for (let attempt = 0; attempt < 400; attempt++) {
    const rows = [ri(1, 2), ri(4, 5), ri(7, 8)];
    const lasers = new Set(), walls = [];
    for (const z of rows) {
      const atBorder = rng() < 0.5, g = atBorder ? 2 : 3; // a dry crossing always exists next to the puddles
      const gx = atBorder ? (rng() < 0.5 ? 0 : N - g) : ri(2, N - g - 2);
      const cells = [];
      for (let x = 0; x < N; x++) if (x < gx || x >= gx + g) { lasers.add(`${x},${z}`); cells.push(x); }
      walls.push({ z, gx, g, cells });
    }
    for (let i = ri(1, 3); i > 0; i--) lasers.add(`${ri(0, N - 1)},${ri(0, N - 1)}`);
    for (const c of [VAULT.start, VAULT.goal, { x: 1, z: 9 }, { x: 0, z: 8 }, { x: 8, z: 0 }, { x: 9, z: 1 }]) lasers.delete(key(c));
    const fromStart = distances(N, lasers, VAULT.start), fromGoal = distances(N, lasers, VAULT.goal);
    const best = fromStart.get(key(VAULT.goal));
    if (best == null || best < 22 || best > 38) continue;
    // batteries: free cells off every shortest route (detour 2–6 steps) in the part of the vault the dog explores
    // (no further than 70 % of the route from the start; batteries behind the last wall are never discovered)
    const candidates = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const k = `${x},${z}`; if (lasers.has(k) || !fromStart.has(k)) continue;
      const detour = fromStart.get(k) + fromGoal.get(k) - best;
      if (detour >= 2 && detour <= 6 && fromStart.get(k) <= 0.7 * best) candidates.push({ x, z, detour });
    }
    if (candidates.length < 2) continue;
    const b1 = candidates[ri(0, candidates.length - 1)];
    const far = candidates.filter((c) => Math.abs(c.x - b1.x) + Math.abs(c.z - b1.z) >= 4);
    if (!far.length) continue;
    const b2 = far[ri(0, far.length - 1)];
    // blinking: three wall cells at the end away from the gap, on the wall nearest the goal that has room
    const w = walls[0], end = w.gx < N / 2 ? w.cells.slice(-3) : w.cells.slice(0, 3);
    const blink = end.map((x) => `${x},${w.z}`).filter((k) => lasers.has(k));
    return { lasers, blink, batteries: [{ x: b1.x, z: b1.z }, { x: b2.x, z: b2.z }], shortest: best };
  }
  return { lasers: LASERS, blink: CLASSIC_LAYOUT.blink, batteries: CLASSIC_LAYOUT.batteries, shortest: 28 }; // fallback
}

/** Moving average of episode rewards (for the chart). */
export function movingAverage(xs, w = 25) {
  const out = []; let s = 0;
  xs.forEach((x, i) => { s += x; if (i >= w) s -= xs[i - w]; out.push(s / Math.min(i + 1, w)); });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// RETIRED 2026-10-23: the fixed-vault engine (one layout, cell-only state, four actions). Replaced by the
// environment-based functions above, which reproduce it exactly when every new option is off (makeEnv()).
// const idx = (c) => c.z * VAULT.size + c.x;
// const isLaser = (c) => LASERS.has(`${c.x},${c.z}`);
// const isGoal = (c) => c.x === VAULT.goal.x && c.z === VAULT.goal.z;
// export function envStep(cell, action, rewards) { … same rules, classic layout only … }
// export function createAgent({ rewards, episodes, seed }) { q: Float64Array(100 × 4), … }
// export function trainEpisode(agent) { … state = cell index … }
// export function greedyPath(agent, maxSteps = 60) { … loop = revisiting a cell … }
// export const policy = (agent) => …100 cells…;
// export function shortestSafe() { … BFS on the classic layout … }
// (The full previous version is in git history: commit 7b3f449, src/lab/qlearning.js.)
