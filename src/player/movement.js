// Pure movement + collision (no Three.js), so it can be unit-tested in Node.
// The player is a circle of radius r centred at (x, z); walls are 1×1 cells.

export const PLAYER_RADIUS = 0.3;
export const WALK_SPEED = 4.0;   // units per second
export const SNEAK_SPEED = 1.8;

/** Keyboard key → movement direction. Arrow keys are primary; WASD also works. */
export const KEY_TO_DIR = {
  arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right",
  w: "up", s: "down", a: "left", d: "right",
};

/** Does a circle at (x, z) overlap any wall cell? */
export function collides(map, x, z, r = PLAYER_RADIUS) {
  for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++) {
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
      if (!(map.isBlocked ?? map.isWall)(cx, cz)) continue;
      const px = Math.max(cx, Math.min(x, cx + 1));
      const pz = Math.max(cz, Math.min(z, cz + 1));
      if ((x - px) ** 2 + (z - pz) ** 2 < r * r) return true;
    }
  }
  return false;
}

/** Held directions ("up", "down", "left", "right") → normalised {dx, dz} (diagonals are not faster). */
export function inputVector(dirs) {
  let dx = 0, dz = 0;
  if (dirs.has("up")) dz -= 1;
  if (dirs.has("down")) dz += 1;
  if (dirs.has("left")) dx -= 1;
  if (dirs.has("right")) dx += 1;
  const len = Math.hypot(dx, dz);
  return len ? { dx: dx / len, dz: dz / len } : { dx: 0, dz: 0 };
}

/**
 * Move by (dx, dz)·speed·dt, resolving each axis separately so the player slides along walls
 * instead of sticking. dt is clamped so a long frame (tab switch) cannot tunnel through a wall.
 */
export function step(map, pos, dir, speed, dt) {
  const t = Math.min(dt, 0.05);
  let { x, z } = pos;
  const nx = x + dir.dx * speed * t;
  if (!collides(map, nx, z)) x = nx;
  const nz = z + dir.dz * speed * t;
  if (!collides(map, x, nz)) z = nz;
  return { x, z };
}
