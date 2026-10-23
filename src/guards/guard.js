// Guard brain: a finite state machine driven by what the guard sees.
//
//   Patrol ──sees player──▶ Suspicious ──meter full──▶ Chase ──touches player──▶ CAUGHT
//     ▲                         │ loses sight                │ loses sight
//     │                         ▼                            ▼
//     └──────── looked around ── Search (A* to last-seen position, then look around)
//
// Pure logic: no Three.js, so it is unit-tested in Node.
import { astar } from "./astar.js";
import { canSee, angleTo, angleDiff } from "./vision.js";

export const GUARD = {
  range: 8,               // vision cone length (units)
  fov: Math.PI / 3,       // 60 degrees
  patrolSpeed: 1.6,
  searchSpeed: 2.4,
  chaseSpeed: 3.4,        // slower than the player's 4.0 walk, so escaping is possible
  fillRate: 0.55,         // suspicion per second at the edge of the cone (doubles up close)
  sneakFactor: 0.55,      // sneaking fills the meter more slowly
  decay: 0.2,             // suspicion lost per second out of sight
  catchDistance: 0.7,
  lookAroundTime: 3,      // seconds spent looking around at the last-seen spot
  repathEvery: 0.3,       // chase re-plans the A* route this often (seconds)
  turnSpeed: 4,           // radians per second
};

export const STATES = ["patrol", "suspicious", "search", "chase"];
const cellOf = (p) => ({ x: Math.floor(p.x), z: Math.floor(p.z) });
const centre = (c) => ({ x: c.x + 0.5, z: c.z + 0.5 });

export function createGuard(id, patrolCells) {
  const p = centre(patrolCells[0]);
  return { id, patrol: patrolCells, patrolIndex: 0, pos: { ...p }, facing: 0, state: "patrol", suspicion: 0, path: [], lastSeen: null, lookTimer: 0, repathTimer: 0, sees: false, expanded: 0 };
}

/**
 * Something drew this guard's attention (2026-10-24: the drone's spotlight on a civilian it wrongly flagged).
 * A patrolling guard walks over to look (search state: A* to the spot, look around, back to patrol).
 * @returns true if the guard went to check (only a patrolling guard does)
 */
export function investigate(g, map, pos) {
  if (g.state !== "patrol") return false;
  g.state = "search"; g.lookTimer = 0; g.lastSeen = { ...pos };
  planTo(g, map, cellOf(pos));
  return true;
}

/** Plan an A* route to a cell; the guard then walks cell centre to cell centre. */
function planTo(g, map, goalCell) {
  const stats = {};
  const cells = astar(map, cellOf(g.pos), goalCell, stats);
  g.expanded = stats.expanded ?? 0;
  g.path = cells ? cells.slice(1).map(centre) : [];
  return !!cells;
}

function turnToward(g, angle, dt) {
  const d = angleDiff(g.facing, angle);
  const s = GUARD.turnSpeed * dt;
  g.facing += Math.abs(d) <= s ? d : Math.sign(d) * s;
}

/** Walk along the planned path; returns true when the path is finished. */
function followPath(g, speed, dt) {
  let budget = speed * dt;
  while (g.path.length && budget > 0) {
    const t = g.path[0];
    const dx = t.x - g.pos.x, dz = t.z - g.pos.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) turnToward(g, Math.atan2(dz, dx), dt);
    if (d <= budget) { g.pos = { ...t }; g.path.shift(); budget -= d; }
    else { g.pos = { x: g.pos.x + (dx / d) * budget, z: g.pos.z + (dz / d) * budget }; budget = 0; }
  }
  return g.path.length === 0;
}

/**
 * Advance one guard by dt seconds.
 * @param {object} ctx { map, player: {x,z}, sneaking: boolean, dt, tuning?: { range, speedMul, fillMul } }
 * @returns {{ caught: boolean, events: string[] }}
 */
export function updateGuard(g, { map, player, sneaking = false, dt, tuning = {} }) {
  const events = [];
  const range = tuning.range ?? GUARD.range, sp = tuning.speedMul ?? 1, fill = GUARD.fillRate * (tuning.fillMul ?? 1);
  const dist = Math.hypot(player.x - g.pos.x, player.z - g.pos.z);
  g.sees = canSee(map, g, player, range, GUARD.fov);

  if (g.sees) {
    g.lastSeen = { ...player };
    const closeness = 1 + (1 - Math.min(dist, range) / range); // 1 at the edge, 2 up close
    g.suspicion = Math.min(1, g.suspicion + fill * closeness * (sneaking ? GUARD.sneakFactor : 1) * dt);
  } else {
    g.suspicion = Math.max(0, g.suspicion - GUARD.decay * dt);
  }

  const enter = (s) => { if (g.state !== s) { events.push(`${g.state}->${s}`); g.state = s; } };

  switch (g.state) {
    case "patrol":
      if (g.sees) { enter("suspicious"); g.path = []; break; }
      if (followPath(g, GUARD.patrolSpeed * sp, dt)) {
        g.patrolIndex = (g.patrolIndex + 1) % g.patrol.length;
        planTo(g, map, g.patrol[g.patrolIndex]);
      }
      break;

    case "suspicious":
      if (g.suspicion >= 1) { enter("chase"); g.repathTimer = 0; break; }
      if (!g.sees) { enter("search"); g.lookTimer = 0; planTo(g, map, cellOf(g.lastSeen)); break; }
      turnToward(g, angleTo(g.pos, player), dt); // stop and stare
      break;

    case "search":
      if (g.sees) { enter(g.suspicion >= 1 ? "chase" : "suspicious"); g.path = []; break; }
      if (followPath(g, GUARD.searchSpeed * sp, dt)) {
        g.lookTimer += dt;
        g.facing += 1.8 * dt; // look around
        if (g.lookTimer >= GUARD.lookAroundTime) { enter("patrol"); planTo(g, map, g.patrol[g.patrolIndex]); }
      }
      break;

    case "chase":
      if (!g.sees) { enter("search"); g.lookTimer = 0; planTo(g, map, cellOf(g.lastSeen)); break; }
      g.suspicion = 1;
      g.repathTimer -= dt;
      if (g.repathTimer <= 0 || !g.path.length) { planTo(g, map, cellOf(player)); g.repathTimer = GUARD.repathEvery; }
      followPath(g, GUARD.chaseSpeed * sp, dt);
      if (!g.path.length) { // same cell as the player: close the last gap directly
        const d = Math.hypot(player.x - g.pos.x, player.z - g.pos.z) || 1;
        const s = Math.min(d, GUARD.chaseSpeed * sp * dt);
        g.pos = { x: g.pos.x + ((player.x - g.pos.x) / d) * s, z: g.pos.z + ((player.z - g.pos.z) / d) * s };
      }
      break;
  }

  const caught = Math.hypot(player.x - g.pos.x, player.z - g.pos.z) < GUARD.catchDistance;
  if (caught) events.push("caught");
  return { caught, events };
}
