// The robot dog teammate (Mission 2). It crosses the laser vault by following the greedy policy of
// the Q-table the player trained. A badly trained dog really touches a laser or goes in circles.
import { greedyPath, rollout, VAULT, CLASSIC, shortestSafe } from "../lab/qlearning.js";
// 2026-10-23: the dog walks the vault it was trained on (agent.env). On slippery puddles each mission run is a real
// roll-out, so a slide can change the route (or end it on a laser); on a dry floor it is the learned route.

export const DOG = { cellsPerSecond: 3, vaultOrigin: { x: 13, z: 3 } };
export const vaultToWorld = (c, origin = DOG.vaultOrigin) => ({ x: origin.x + c.x + 0.5, z: origin.z + c.z + 0.5 });

export function createDog(agent, origin = DOG.vaultOrigin, rng = Math.random) {
  const env = agent?.env ?? CLASSIC;
  const plan = !agent ? { path: [{ ...VAULT.start }], outcome: "loop", batteries: 0 } : env.slip > 0 ? rollout(agent, rng) : greedyPath(agent);
  return { origin, env, plan, step: 0, progress: 0, pos: vaultToWorld(plan.path[0], origin), status: "idle", facing: 0 };
}

/** Start crossing (when the player activates the console). */
export const deployDog = (dog) => { if (dog.status === "idle") dog.status = "crossing"; };

/**
 * Move along the planned path. Returns "goal" | "laser" | "loop" once, when the walk ends.
 */
export function updateDog(dog, dt) {
  if (dog.status !== "crossing") return null;
  dog.progress += DOG.cellsPerSecond * dt;
  while (dog.progress >= 1 && dog.step < dog.plan.path.length - 1) { dog.progress -= 1; dog.step++; }
  const a = vaultToWorld(dog.plan.path[dog.step], dog.origin);
  const last = dog.step >= dog.plan.path.length - 1;
  const b = last ? a : vaultToWorld(dog.plan.path[dog.step + 1], dog.origin);
  const f = last ? 0 : Math.min(1, dog.progress);
  dog.pos = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
  if (b.x !== a.x || b.z !== a.z) dog.facing = Math.atan2(b.z - a.z, b.x - a.x);
  if (last) { dog.status = dog.plan.outcome; return dog.plan.outcome; }
  return null;
}

/** 1.0 for the shortest safe path, less for longer detours (each battery collected adds 0.1), 0 if it failed. */
export function dogScore(dog) {
  if (dog.plan.outcome !== "goal") return 0;
  return Math.min(1, shortestSafe(dog.env ?? CLASSIC) / (dog.plan.path.length - 1) + 0.1 * (dog.plan.batteries ?? 0));
}
