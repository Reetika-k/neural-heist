import { test } from "node:test";
import assert from "node:assert/strict";
import { MISSION_1, parseMap } from "../src/world/map.js";
import { collides, inputVector, step, WALK_SPEED } from "../src/player/movement.js";

const map = parseMap(MISSION_1);

test("map parses: size, start and walls", () => {
  assert.equal(map.width, 20);
  assert.equal(map.depth, 13);
  assert.deepEqual(map.start, { x: 1, z: 1 });
  assert.equal(map.isWall(0, 0), true);
  assert.equal(map.isWall(1, 1), false);
  assert.ok(MISSION_1.every((r) => r.length === map.width), "all rows same width");
});

test("collision: centre of a floor cell is free, overlapping a wall is not", () => {
  assert.equal(collides(map, 1.5, 1.5), false);
  assert.equal(collides(map, 1.1, 1.5), true, "radius 0.3 reaches the wall at x=0");
  assert.equal(collides(map, 0.5, 0.5), true);
});

test("input vector is normalised so diagonals are not faster", () => {
  const v = inputVector(new Set(["up", "right"]));
  assert.ok(Math.abs(Math.hypot(v.dx, v.dz) - 1) < 1e-9);
  assert.deepEqual(inputVector(new Set()), { dx: 0, dz: 0 });
  assert.deepEqual(inputVector(new Set(["left", "right"])), { dx: 0, dz: 0 }, "opposite keys cancel");
});

test("walls block movement and the player slides along them", () => {
  let p = { x: 1.5, z: 1.5 };
  for (let i = 0; i < 100; i++) p = step(map, p, { dx: -1, dz: 0 }, WALK_SPEED, 0.05);
  assert.ok(p.x >= 1.3 - 1e-9 && p.x < 1.35, `stopped at the wall, x=${p.x}`);
  // pushing diagonally into the top wall still moves along x
  let q = { x: 3.5, z: 1.5 };
  for (let i = 0; i < 10; i++) q = step(map, q, { dx: Math.SQRT1_2, dz: -Math.SQRT1_2 }, WALK_SPEED, 0.05);
  assert.ok(q.x > 3.5 + 1, "slid along x");
  assert.ok(q.z >= 1.3 - 1e-9, "did not enter the wall");
});

test("a huge frame (tab switch) cannot tunnel through a wall", () => {
  const p = step(map, { x: 8.5, z: 1.5 }, { dx: 1, dz: 0 }, WALK_SPEED, 10);
  assert.ok(p.x < 9 - 0.3 + 1e-9, `x=${p.x} must stay left of the wall at x=9`);
});

import { KEY_TO_DIR } from "../src/player/movement.js";
test("arrow keys and WASD map to the same directions", () => {
  assert.equal(KEY_TO_DIR.arrowup, "up"); assert.equal(KEY_TO_DIR.w, "up");
  assert.equal(KEY_TO_DIR.arrowleft, "left"); assert.equal(KEY_TO_DIR.a, "left");
  assert.equal(KEY_TO_DIR.arrowdown, KEY_TO_DIR.s); assert.equal(KEY_TO_DIR.arrowright, KEY_TO_DIR.d);
});
