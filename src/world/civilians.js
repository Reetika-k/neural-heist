// Civilians wander between points with A*. They never raise an alarm; they exist so the
// drone's classifier has to tell guards from civilians in the mission.
import { astar } from "../guards/astar.js";

const cellOf = (p) => ({ x: Math.floor(p.x), z: Math.floor(p.z) });
const centre = (c) => ({ x: c.x + 0.5, z: c.z + 0.5 });
export const CIVILIAN_SPEED = 1.2;

export function createCivilian(id, route) {
  return { id, kind: "civilian", route, routeIndex: 0, pos: centre(route[0]), facing: 0, path: [], pause: 0 };
}

export function updateCivilian(c, map, dt) {
  if (c.pause > 0) { c.pause -= dt; return; }
  if (!c.path.length) {
    c.routeIndex = (c.routeIndex + 1) % c.route.length;
    const cells = astar(map, cellOf(c.pos), c.route[c.routeIndex]);
    c.path = cells ? cells.slice(1).map(centre) : [];
    c.pause = 0.8;
    return;
  }
  let budget = CIVILIAN_SPEED * dt;
  while (c.path.length && budget > 0) {
    const t = c.path[0], dx = t.x - c.pos.x, dz = t.z - c.pos.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) c.facing = Math.atan2(dz, dx);
    if (d <= budget) { c.pos = { ...t }; c.path.shift(); budget -= d; }
    else { c.pos = { x: c.pos.x + (dx / d) * budget, z: c.pos.z + (dz / d) * budget }; budget = 0; }
  }
}
