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
