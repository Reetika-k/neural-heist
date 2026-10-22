// Guard vision: a cone (range + field of view) where walls block sight.
// Facing convention everywhere: direction = (cos f, sin f) in world (x, z).

export const angleTo = (from, to) => Math.atan2(to.z - from.z, to.x - from.x);
export const angleDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

/** March along the segment a→b; false as soon as a sample lies inside a wall cell. */
export function lineOfSight(map, a, b, step = 0.1) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(d / step));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (map.isWall(Math.floor(a.x + (b.x - a.x) * t), Math.floor(a.z + (b.z - a.z) * t))) return false;
  }
  return true;
}

/** Is `target` inside the guard's cone and not hidden behind a wall? */
export function canSee(map, guard, target, range, fov) {
  const d = Math.hypot(target.x - guard.pos.x, target.z - guard.pos.z);
  if (d > range) return false;
  if (d > 0.01 && Math.abs(angleDiff(guard.facing, angleTo(guard.pos, target))) > fov / 2) return false;
  return lineOfSight(map, guard.pos, target);
}

/** Points of the visible cone, clipped where each ray hits a wall (used to draw the cone). */
export function visionPolygon(map, guard, range, fov, rays = 28, step = 0.08) {
  const pts = [];
  for (let i = 0; i <= rays; i++) {
    const a = guard.facing - fov / 2 + (fov * i) / rays;
    const cx = Math.cos(a), cz = Math.sin(a);
    let d = 0;
    while (d < range) {
      const nd = d + step;
      if (map.isWall(Math.floor(guard.pos.x + cx * nd), Math.floor(guard.pos.z + cz * nd))) break;
      d = nd;
    }
    pts.push({ x: guard.pos.x + cx * d, z: guard.pos.z + cz * d });
  }
  return pts;
}
