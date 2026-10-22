// A* shortest path on the mission grid (4-neighbour moves, cost 1 per step).
// Heuristic: Manhattan distance, which never overestimates on a 4-neighbour grid (admissible),
// so A* returns a shortest path while expanding far fewer cells than breadth-first search.

const inBounds = (map, c) => c.x >= 0 && c.z >= 0 && c.x < map.width && c.z < map.depth;
const free = (map, c) => inBounds(map, c) && !(map.isBlocked ?? map.isWall)(c.x, c.z);
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * @returns {{x:number,z:number}[] | null} cells from start to goal inclusive, or null if unreachable.
 * `stats.expanded` (optional) receives the number of cells expanded, for comparisons.
 */
export function astar(map, start, goal, stats = {}) {
  if (!free(map, start) || !free(map, goal)) return null;
  const key = (c) => c.z * map.width + c.x;
  const h = (c) => Math.abs(c.x - goal.x) + Math.abs(c.z - goal.z);
  const g = new Map([[key(start), 0]]);
  const came = new Map();
  const open = [{ c: start, f: h(start), g: 0 }];
  const closed = new Set();
  stats.expanded = 0;
  while (open.length) {
    // lowest f first; ties broken by larger g (prefers cells closer to the goal)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f || (open[i].f === open[bi].f && open[i].g > open[bi].g)) bi = i;
    const { c } = open.splice(bi, 1)[0];
    const k = key(c);
    if (closed.has(k)) continue;
    closed.add(k);
    stats.expanded++;
    if (c.x === goal.x && c.z === goal.z) {
      const path = [c];
      let cur = k;
      while (came.has(cur)) { cur = came.get(cur); path.push({ x: cur % map.width, z: Math.floor(cur / map.width) }); }
      return path.reverse();
    }
    for (const [dx, dz] of NEIGHBOURS) {
      const n = { x: c.x + dx, z: c.z + dz };
      if (!free(map, n)) continue;
      const nk = key(n), ng = g.get(k) + 1;
      if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); came.set(nk, k); open.push({ c: n, f: ng + h(n), g: ng }); }
    }
  }
  return null;
}

/** Breadth-first search: always shortest on an unweighted grid; used as the correctness baseline in tests. */
export function bfs(map, start, goal, stats = {}) {
  if (!free(map, start) || !free(map, goal)) return null;
  const key = (c) => c.z * map.width + c.x;
  const came = new Map([[key(start), null]]);
  const queue = [start];
  stats.expanded = 0;
  while (queue.length) {
    const c = queue.shift();
    stats.expanded++;
    if (c.x === goal.x && c.z === goal.z) {
      const path = [];
      for (let k = key(c); k !== null; k = came.get(k)) path.push({ x: k % map.width, z: Math.floor(k / map.width) });
      return path.reverse();
    }
    for (const [dx, dz] of NEIGHBOURS) {
      const n = { x: c.x + dx, z: c.z + dz };
      if (free(map, n) && !came.has(key(n))) { came.set(key(n), key(c)); queue.push(n); }
    }
  }
  return null;
}
