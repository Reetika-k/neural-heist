import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgent, trainEpisodes, greedyPath, envStep, shortestSafe, movingAverage, VAULT, LASERS, DEFAULT_REWARDS } from "../src/lab/qlearning.js";
import { createDog, deployDog, updateDog, dogScore, vaultToWorld } from "../src/teammates/dog.js";
import { MISSION_2, parseMap } from "../src/world/map.js";

const trained = (rewards, episodes = 1500, seed = 1) => { const a = createAgent({ rewards, episodes, seed }); trainEpisodes(a, episodes); return a; };

test("environment: lasers and goal end the episode; walls keep the dog in place", () => {
  assert.equal(LASERS.has(`${VAULT.start.x},${VAULT.start.z}`), false);
  assert.deepEqual(envStep({ x: 0, z: 9 }, 2, DEFAULT_REWARDS), { next: { x: 0, z: 9 }, reward: -0.1, done: false, hit: null }, "left wall");
  assert.equal(envStep({ x: 0, z: 8 }, 0, DEFAULT_REWARDS).hit, "laser", "row 7 has a laser at x=0");
  assert.equal(envStep({ x: 9, z: 1 }, 0, DEFAULT_REWARDS).hit, "goal");
  assert.equal(shortestSafe(), 28, "a safe path exists (28 steps)");
});

test("README scenario 7: sensible rewards → the dog reaches the drive safely, by the shortest path", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = greedyPath(trained(DEFAULT_REWARDS, 1500, seed));
    assert.equal(g.outcome, "goal", `seed ${seed}`);
    assert.equal(g.path.length - 1, shortestSafe(), `seed ${seed}: optimal length`);
    assert.ok(g.path.every((c) => !LASERS.has(`${c.x},${c.z}`)), "never touches a laser");
  }
});

test("README scenario 6: a positive reward for touching lasers → the dog learns to hit one", () => {
  for (const seed of [1, 2, 3]) assert.equal(greedyPath(trained({ goal: 10, laser: 5, step: -0.1 }, 1500, seed)).outcome, "laser");
});

test("no step penalty → the dog dawdles in a loop; too little training is unreliable", () => {
  assert.equal(greedyPath(trained({ goal: 10, laser: -10, step: 0 })).outcome, "loop");
  const outcomes = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => greedyPath(trained(DEFAULT_REWARDS, 600, s)).outcome);
  assert.ok(outcomes.includes("loop"), `600 episodes sometimes fails: ${outcomes}`);
});

test("training is reproducible with a seed; epsilon decays; rewards improve", () => {
  const a = trained(DEFAULT_REWARDS, 1500, 42), b = trained(DEFAULT_REWARDS, 1500, 42);
  assert.deepEqual([...a.q], [...b.q]);
  assert.ok(Math.abs(a.epsilon - 0.05) < 1e-9);
  const ma = movingAverage(a.history);
  assert.ok(ma.at(-1) > ma[50] + 5, `reward rises: ${ma[50].toFixed(1)} → ${ma.at(-1).toFixed(1)}`);
});

test("dog: follows the greedy path cell by cell and reports the outcome once", () => {
  const dog = createDog(trained(DEFAULT_REWARDS));
  assert.equal(updateDog(dog, 0.1), null, "idle until deployed");
  deployDog(dog);
  let out = null, t = 0;
  while (!out && t < 30) { out = updateDog(dog, 0.05); t += 0.05; }
  assert.equal(out, "goal");
  assert.equal(updateDog(dog, 0.05), null, "outcome reported once");
  assert.deepEqual(dog.pos, vaultToWorld(VAULT.goal));
  assert.equal(dogScore(dog), 1, "shortest path = full AI score");
  const bad = createDog(trained({ goal: 10, laser: 5, step: -0.1 }));
  deployDog(bad); let o = null; while (!o) o = updateDog(bad, 0.05);
  assert.equal(o, "laser"); assert.equal(dogScore(bad), 0);
  assert.equal(createDog(null).plan.outcome, "loop", "untrained dog cannot cross");
});

test("Mission 2 map: vault is 10×10 at the dog's origin, blocked for walkers, console reachable", () => {
  const map = parseMap(MISSION_2);
  assert.equal(map.vault.size, 100);
  assert.ok(map.vault.has("13,3") && map.vault.has("22,12"));
  assert.equal(map.isBlocked(13, 3), true, "player and guards cannot enter the vault");
  assert.equal(map.isWall(13, 3), false, "vault floor is not a wall");
  assert.deepEqual(map.console, { x: 10, z: 8 });
});

// ---------- 2026-10-23: new vaults, batteries, puddles, blinking lasers, challenge, views ----------
import { makeEnv, CLASSIC, generateLayout, evaluatePolicy, rollout, valueMap, trainWithMilestone, laserOn, puddles } from "../src/lab/qlearning.js";

import { mulberry32 } from "../src/lab/rng.js";
const trainedIn = (env, rewards, episodes, seed) => { const a = createAgent({ rewards: { ...DEFAULT_REWARDS, ...rewards }, episodes, seed, env }); trainEpisodes(a, episodes); return a; };

test("classic environment is the original vault: 100 states × 4 actions, shortest route 28", () => {
  assert.equal(CLASSIC.label, "Classic vault"); assert.equal(CLASSIC.nA, 4); assert.equal(CLASSIC.phases * CLASSIC.masks, 1);
  assert.equal(createAgent({}).q.length, 400); assert.equal(shortestSafe(CLASSIC), 28);
});

test("random vaults: same seed same vault; always solvable in 22–38 steps; batteries off the shortest route", () => {
  assert.deepEqual([...generateLayout(42).lasers], [...generateLayout(42).lasers]);
  for (let seed = 1; seed <= 60; seed++) {
    const env = makeEnv({ layout: "random", seed, batteries: true }), best = shortestSafe(makeEnv({ layout: "random", seed }));
    assert.ok(best >= 22 && best <= 38, `seed ${seed}: shortest ${best}`);
    assert.equal(env.batteries.length, 2);
    for (const b of env.batteries) assert.ok(!env.lasers.has(`${b.x},${b.z}`), "battery not on a laser");
  }
});

test("recommended rewards learn the shortest route on random vaults", () => {
  for (const seed of [3, 11, 27, 40, 58]) {
    const env = makeEnv({ layout: "random", seed }), g = greedyPath(trainedIn(env, {}, 1500, 1));
    assert.equal(g.outcome, "goal", `vault ${seed}`); assert.equal(g.path.length - 1, shortestSafe(env), `vault ${seed}`);
  }
});

test("batteries: a small bonus is skipped (28 steps), a bonus worth the detour is collected (38 steps, 2 batteries)", () => {
  const env = makeEnv({ batteries: true });
  for (const seed of [1, 2]) {
    const skip = greedyPath(trainedIn(env, { battery: 0.2 }, 2000, seed)), take = greedyPath(trainedIn(env, { battery: 1 }, 2000, seed));
    assert.equal(skip.batteries, 0); assert.equal(skip.path.length - 1, 28);
    assert.equal(take.batteries, 2); assert.equal(take.path.length - 1, 38);
  }
});

test("puddles: the dog learns a longer dry route and almost always arrives; a dry-floor dog does worse on puddles", () => {
  const env = makeEnv({ slip: 0.2 });
  assert.deepEqual([...env.wet].sort(), ["2,4", "7,1", "7,7"]);
  for (const seed of [1, 2]) {
    const a = trainedIn(env, {}, 1500, seed), g = greedyPath(a);
    assert.equal(g.path.length - 1, 32, "dry crossings: 4 steps longer than 28");
    assert.ok(evaluatePolicy(a, 300, seed).successRate >= 0.95);
  }
  const dry = trainedIn(CLASSIC, {}, 1500, 1), onPuddles = { ...dry, env };
  assert.ok(evaluatePolicy(onPuddles, 400, 3).successRate < evaluatePolicy(trainedIn(env, {}, 1500, 1), 400, 3).successRate);
});

test("blinking lasers: on 3 steps, off 3; the shortest route uses the gap (19 steps); a trained dog learns to slip through", () => {
  const env = makeEnv({ blinking: true });
  assert.equal(laserOn(env, { x: 8, z: 4 }, 0), true); assert.equal(laserOn(env, { x: 8, z: 4 }, 3), false); assert.equal(laserOn(env, { x: 0, z: 1 }, 3), true, "ordinary lasers never switch off");
  assert.equal(shortestSafe(env), 19); assert.equal(env.nA, 5, "the dog can wait");
  let through = 0;
  for (const seed of [1, 2, 3]) { const g = greedyPath(trainedIn(env, {}, 3000, seed)); if (g.outcome === "goal" && g.path.some((p) => env.blink.has(`${p.x},${p.z}`))) through++; }
  assert.ok(through >= 2, `${through}/3 learned the timing`);
});

test("training challenge: the first run after which the route reaches the drive is recorded", () => {
  const a = createAgent({ episodes: 1500, seed: 1 }); trainWithMilestone(a, 25);
  assert.ok(a.firstSolvedAt > 0 && a.firstSolvedAt <= 1500 && a.firstSolvedAt % 25 === 0, String(a.firstSolvedAt));
});

test("views: visits count every step; the learned value is higher next to the drive than at the start", () => {
  const a = trainedIn(CLASSIC, {}, 1500, 1), v = valueMap(a);
  assert.ok(a.visits.reduce((s, x) => s + x, 0) > 1500);
  assert.ok(v[0 * 10 + 8] > v[9 * 10 + 0], "cell beside the drive beats the start");
});

test("mission dog: walks the vault it trained on; on puddles each run is a real roll-out; batteries raise the score", () => {
  const env = makeEnv({ batteries: true }), a = trainedIn(env, { battery: 1 }, 2000, 1), dog = createDog(a);
  assert.equal(dog.env, env); assert.equal(dog.plan.batteries, 2);
  assert.ok(Math.abs(dogScore(dog) - Math.min(1, 28 / 38 + 0.2)) < 1e-9);
  const p = makeEnv({ slip: 0.2 }), b = trainedIn(p, {}, 1500, 1);
  assert.deepEqual(createDog(b, undefined, mulberry32(5)).plan.path, rollout(b, mulberry32(5)).path);
  assert.deepEqual([...puddles(LASERS, 10)].sort(), ["2,4", "7,1", "7,7"]);
});
