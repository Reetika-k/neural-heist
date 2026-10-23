import { test } from "node:test";
import assert from "node:assert/strict";
import { MISSION_1, MISSION_1_GUARDS, parseMap } from "../src/world/map.js";
import { astar, bfs } from "../src/guards/astar.js";
import { canSee, lineOfSight, visionPolygon } from "../src/guards/vision.js";
import { createGuard, updateGuard, GUARD } from "../src/guards/guard.js";

const map = parseMap(MISSION_1);
const gridMap = (rows) => parseMap(rows);

// ---------- A* ----------
test("A* finds a shortest path on the mission map", () => {
  const p = astar(map, { x: 1, z: 1 }, { x: 18, z: 11 });
  const b = bfs(map, { x: 1, z: 1 }, { x: 18, z: 11 });
  assert.ok(p && b);
  assert.equal(p.length, b.length, "same length as BFS");
  assert.deepEqual(p[0], { x: 1, z: 1 }); assert.deepEqual(p.at(-1), { x: 18, z: 11 });
  for (let i = 1; i < p.length; i++) {
    assert.equal(Math.abs(p[i].x - p[i - 1].x) + Math.abs(p[i].z - p[i - 1].z), 1, "4-neighbour steps");
    assert.equal(map.isWall(p[i].x, p[i].z), false, "never through a wall");
  }
});

test("A* edge cases: start = goal, wall goal, out of bounds, unreachable", () => {
  assert.deepEqual(astar(map, { x: 1, z: 1 }, { x: 1, z: 1 }), [{ x: 1, z: 1 }]);
  assert.equal(astar(map, { x: 1, z: 1 }, { x: 0, z: 0 }), null, "goal is a wall");
  assert.equal(astar(map, { x: 1, z: 1 }, { x: 99, z: 1 }), null, "out of bounds");
  const sealed = gridMap(["#####", "#..##", "#####", "##..#", "#####"]);
  assert.equal(astar(sealed, { x: 1, z: 1 }, { x: 2, z: 3 }), null, "sealed rooms");
});

test("A* matches BFS length on 300 random mazes and expands fewer cells", () => {
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let astarExpanded = 0, bfsExpanded = 0, solvable = 0;
  for (let n = 0; n < 300; n++) {
    const rows = Array.from({ length: 12 }, (_, z) => Array.from({ length: 16 }, (_, x) => (x === 0 || z === 0 || x === 15 || z === 11 || rnd() < 0.28 ? "#" : ".")).join(""));
    const m = gridMap(rows);
    const s = { x: 1, z: 1 }, g = { x: 14, z: 10 };
    if (m.isWall(1, 1) || m.isWall(14, 10)) continue;
    const sa = {}, sb = {};
    const a = astar(m, s, g, sa), b = bfs(m, s, g, sb);
    assert.equal(a === null, b === null, `maze ${n}: reachability must agree`);
    if (a) { solvable++; assert.equal(a.length, b.length, `maze ${n}: optimal`); astarExpanded += sa.expanded; bfsExpanded += sb.expanded; }
  }
  assert.ok(solvable > 50, `enough solvable mazes (${solvable})`);
  assert.ok(astarExpanded < bfsExpanded, `A* expanded ${astarExpanded} vs BFS ${bfsExpanded}`);
});

// ---------- vision ----------
const guardAt = (x, z, facing) => ({ pos: { x, z }, facing });
test("vision: inside the cone is seen; outside the angle or range is not", () => {
  const g = guardAt(11.5, 1.5, 0); // facing +x along an open corridor
  assert.equal(canSee(map, g, { x: 15.5, z: 1.5 }, GUARD.range, GUARD.fov), true);
  assert.equal(canSee(map, g, { x: 11.5, z: 4.5 }, GUARD.range, GUARD.fov), false, "90° to the side");
  assert.equal(canSee(map, guardAt(1.5, 8.5, 0), { x: 10.5, z: 8.5 }, GUARD.range, GUARD.fov), false, "9 units away, range 8");
});

test("vision: walls block sight", () => {
  assert.equal(lineOfSight(map, { x: 8.5, z: 1.5 }, { x: 10.5, z: 1.5 }), false, "wall column at x=9");
  assert.equal(canSee(map, guardAt(10.5, 1.5, Math.PI), { x: 8.5, z: 1.5 }, GUARD.range, GUARD.fov), false);
  const poly = visionPolygon(map, guardAt(10.5, 1.5, Math.PI), GUARD.range, GUARD.fov);
  assert.ok(poly.every((p) => p.x > 9 - 1e-6), "cone polygon is clipped at the wall");
});

// ---------- state machine ----------
const run = (g, player, seconds, { sneaking = false, dt = 0.05 } = {}) => {
  const events = []; let caught = false;
  for (let t = 0; t < seconds && !caught; t += dt) { const r = updateGuard(g, { map, player, sneaking, dt }); events.push(...r.events); caught ||= r.caught; }
  return { events, caught };
};

test("patrol: guard walks its route with A* and loops", () => {
  const g = createGuard("G1", MISSION_1_GUARDS[0].patrol);
  const far = { x: 1.5, z: 11.5 };
  const start = { ...g.pos };
  run(g, far, 3);
  assert.equal(g.state, "patrol");
  assert.ok(Math.hypot(g.pos.x - start.x, g.pos.z - start.z) > 2, "moved along the route");
  run(g, far, 40);
  assert.equal(g.state, "patrol"); assert.equal(g.suspicion, 0);
});

test("seeing the player: Suspicious, meter fills, then Chase", () => {
  const g = createGuard("G", [{ x: 11, z: 1 }]); g.facing = 0;
  const player = { x: 16.5, z: 1.5 };
  let r = run(g, player, 0.2);
  assert.equal(g.state, "suspicious"); assert.ok(g.suspicion > 0);
  r = run(g, player, 3);
  assert.ok(r.events.includes("suspicious->chase"), JSON.stringify(r.events));
});

test("sneaking fills the meter more slowly", () => {
  const a = createGuard("A", [{ x: 11, z: 1 }]); a.facing = 0;
  const b = createGuard("B", [{ x: 11, z: 1 }]); b.facing = 0;
  run(a, { x: 16.5, z: 1.5 }, 0.5);
  run(b, { x: 16.5, z: 1.5 }, 0.5, { sneaking: true });
  assert.ok(b.suspicion < a.suspicion * 0.7, `${b.suspicion} vs ${a.suspicion}`);
});

test("losing sight: Search walks to the last-seen spot with A*, looks around, returns to Patrol", () => {
  const g = createGuard("G", [{ x: 11, z: 1 }]); g.facing = 0;
  run(g, { x: 15.5, z: 1.5 }, 0.3);
  assert.equal(g.state, "suspicious");
  const r = run(g, { x: 1.5, z: 11.5 }, 0.1); // player vanishes
  assert.ok(r.events.includes("suspicious->search"));
  assert.deepEqual(g.lastSeen, { x: 15.5, z: 1.5 });
  run(g, { x: 1.5, z: 11.5 }, 4);
  assert.ok(Math.hypot(g.pos.x - 15.5, g.pos.z - 1.5) < 0.6, "reached last-seen spot");
  const back = run(g, { x: 1.5, z: 11.5 }, GUARD.lookAroundTime + 1);
  assert.ok(back.events.includes("search->patrol"));
});

test("chase catches a player who stands still; a player out of sight is not caught", () => {
  const g = createGuard("G", [{ x: 11, z: 1 }]); g.facing = 0;
  const r = run(g, { x: 15.5, z: 1.5 }, 8);
  assert.equal(r.caught, true);
  const h = createGuard("H", [{ x: 11, z: 1 }]); h.facing = 0;
  assert.equal(run(h, { x: 8.5, z: 1.5 }, 8).caught, false, "behind the wall at x=9");
});

test("difficulty tuning: longer range sees further; hard fills faster and moves faster", () => {
  const target = { x: 18.5, z: 1.5 }; // 7 units in front of a guard at x 11.5 facing +x
  const a = createGuard("A", [{ x: 11, z: 1 }]); a.facing = 0;
  updateGuard(a, { map, player: target, dt: 0.05, tuning: { range: 6 } });
  assert.equal(a.sees, false, "easy range 6 cannot see 7 units");
  const b = createGuard("B", [{ x: 11, z: 1 }]); b.facing = 0;
  updateGuard(b, { map, player: target, dt: 0.05, tuning: { range: 8 } });
  assert.equal(b.sees, true, "normal range 8 can");
  const n = createGuard("N", [{ x: 11, z: 1 }]); n.facing = 0;
  const h = createGuard("H", [{ x: 11, z: 1 }]); h.facing = 0;
  for (let i = 0; i < 6; i++) { updateGuard(n, { map, player: { x: 15.5, z: 1.5 }, dt: 0.05 }); updateGuard(h, { map, player: { x: 15.5, z: 1.5 }, dt: 0.05, tuning: { range: 10, fillMul: 1.3 } }); }
  assert.ok(h.suspicion > n.suspicion * 1.2, `${h.suspicion} vs ${n.suspicion}`);
});

// ---------- 2026-10-24: false alarms and Mission 2's console patrol ----------
import { investigate } from "../src/guards/guard.js";
import { MISSION_2, MISSION_2_GUARDS } from "../src/world/map.js";

test("investigate: a patrolling guard walks over to check a spot, looks around, then patrols again", () => {
  const g = createGuard("G1", MISSION_1_GUARDS[0].patrol);
  const spot = { x: 13.5, z: 6.5 };
  assert.ok(investigate(g, map, spot)); assert.equal(g.state, "search");
  let reached = false;
  for (let t = 0; t < 30 && g.state !== "patrol"; t += 0.05) { updateGuard(g, { map, player: { x: -50, z: -50 }, dt: 0.05 }); if (Math.hypot(g.pos.x - spot.x, g.pos.z - spot.z) < 0.6) reached = true; }
  assert.ok(reached, "reached the spot"); assert.equal(g.state, "patrol", "went back to patrol");
  const chasing = { ...createGuard("G2", MISSION_1_GUARDS[1].patrol), state: "chase" };
  assert.equal(investigate(chasing, map, spot), false, "only a patrolling guard is distracted");
});

test("Mission 2: standing at the console while the dog crosses gets you caught; hiding beside it is safe", () => {
  const m2 = parseMap(MISSION_2);
  const run = (spot, arrive) => {
    const gs = MISSION_2_GUARDS.map((g) => createGuard(g.id, g.patrol));
    for (let t = 0; t < arrive; t += 0.05) for (const g of gs) updateGuard(g, { map: m2, player: { x: -50, z: -50 }, dt: 0.05 });
    for (let t = 0; t < 12; t += 0.05) for (const g of gs) { const r = updateGuard(g, { map: m2, player: spot, sneaking: true, dt: 0.05 }); if (r.caught || g.state === "chase") return false; }
    return true;
  };
  const arrivals = Array.from({ length: 30 }, (_, i) => i);
  assert.equal(arrivals.filter((a) => run({ x: 10.5, z: 7.5 }, a)).length, 0, "at the console: caught for every arrival time");
  assert.equal(arrivals.filter((a) => run({ x: 8.5, z: 8.5 }, a)).length, 30, "two steps west: safe for every arrival time");
});
