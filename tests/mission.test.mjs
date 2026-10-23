import { test } from "node:test";
import assert from "node:assert/strict";
import { MISSION_1, parseMap } from "../src/world/map.js";
import { createMission, updateMission, failMission, scoreMission, MISSION_RULES } from "../src/world/mission.js";

const map = parseMap(MISSION_1);
const calm = [{ state: "patrol" }, { state: "patrol" }];
const tick = (m, player, guards = calm, seconds = 0.05, dt = 0.05) => { const ev = []; for (let t = 0; t < seconds - 1e-9; t += dt) ev.push(...updateMission(m, { player, guards, dt })); return ev; };

test("map has a drive and an exit on floor cells", () => {
  assert.deepEqual(map.drive, { x: 18, z: 11 });
  assert.deepEqual(map.exit, { x: 1, z: 11 });
  assert.equal(map.isWall(map.drive.x, map.drive.z), false);
  assert.equal(map.isWall(map.exit.x, map.exit.z), false);
});

test("exit is locked until the drive is picked up", () => {
  const m = createMission(map);
  assert.deepEqual(tick(m, m.exit), [], "standing on the exit without the drive does nothing");
  assert.equal(m.outcome, null);
  assert.deepEqual(tick(m, m.drive), ["pickup"]);
  assert.equal(m.hasDrive, true);
  assert.deepEqual(tick(m, m.exit), ["win"]);
  assert.equal(m.outcome, "win");
});

test("a chase starts the alarm once; it does not reset; reaching 0 loses", () => {
  const m = createMission(map);
  const chasing = [{ state: "chase" }, { state: "patrol" }];
  assert.ok(tick(m, { x: 5.5, z: 5.5 }, chasing).includes("alarm"));
  assert.equal(m.spotted, true);
  tick(m, { x: 5.5, z: 5.5 }, calm, 5);
  assert.ok(Math.abs(m.alarm - (MISSION_RULES.alarmTime - 5.05)) < 0.06, `alarm keeps counting: ${m.alarm}`);
  assert.equal(tick(m, { x: 5.5, z: 5.5 }, chasing).includes("alarm"), false, "no second alarm event");
  const ev = tick(m, { x: 5.5, z: 5.5 }, calm, MISSION_RULES.alarmTime);
  assert.ok(ev.includes("lose"));
  assert.equal(m.reason, "alarm");
});

test("winning with time left on the alarm still counts as a win", () => {
  const m = createMission(map);
  tick(m, m.drive, [{ state: "chase" }]);
  assert.deepEqual(tick(m, m.exit), ["win"]);
});

test("caught ends the mission and freezes it", () => {
  const m = createMission(map);
  failMission(m, "caught");
  assert.equal(m.outcome, "lose"); assert.equal(m.reason, "caught");
  assert.deepEqual(tick(m, m.drive), [], "no events after the mission is over");
  assert.equal(m.hasDrive, false);
});

test("scoring: three stars for a clean, fast run; fewer otherwise; zero for a loss", () => {
  const P = MISSION_RULES.points;
  const clean = { outcome: "win", spotted: false, time: 30, parTime: 45 };
  assert.deepEqual(scoreMission(clean).stars, [true, true, true]);
  assert.equal(scoreMission(clean).score, P.finish + P.stealth + 15 * P.perSecondUnderPar);
  const rushed = { outcome: "win", spotted: false, time: 1, parTime: 75 };
  assert.equal(scoreMission(rushed).breakdown.time, P.timeCap, "time bonus is capped");
  assert.ok(P.timeCap < P.ai, "speed can never outweigh a perfectly trained AI");
  assert.equal(scoreMission(clean, 0.8).breakdown.ai, Math.round(0.8 * P.ai), "AI accuracy adds points");
  assert.equal(scoreMission(clean, 7).breakdown.ai, P.ai, "AI score is clamped to 0..1");
  const spottedSlow = { outcome: "win", spotted: true, time: 80, parTime: 45 };
  const s = scoreMission(spottedSlow);
  assert.deepEqual(s.stars, [true, false, false]);
  assert.equal(s.score, P.finish, "no stealth or time bonus");
  assert.equal(scoreMission({ outcome: "lose", spotted: false, time: 10 }).score, 0);
});

import { triggerAlarm } from "../src/world/mission.js";
test("missions take their own par and alarm times; triggerAlarm starts the alarm once", () => {
  const m = createMission(map, { parTime: 70, alarmTime: 30 });
  assert.equal(m.parTime, 70); assert.equal(m.alarmTime, 30);
  assert.equal(triggerAlarm(m), true); assert.equal(m.alarm, 30); assert.equal(m.spotted, true);
  assert.equal(triggerAlarm(m), false, "second trigger does nothing");
});

test("a mission without a drive cell can still be won once the drive is delivered", () => {
  const noDrive = parseMap(MISSION_1.map((r) => r.replace("D", ".")));
  const m = createMission(noDrive);
  assert.equal(m.drive, null);
  assert.deepEqual(tick(m, m.exit), []);
  m.hasDrive = true; // delivered by a teammate
  assert.deepEqual(tick(m, m.exit), ["win"]);
});

import { MISSIONS } from "../src/world/missions.js";
test("every neon sign hangs over a wall cell, never over walkable floor", () => {
  for (const m of MISSIONS) {
    const map = parseMap(m.rows);
    for (const [x, z, , text] of m.signs) assert.equal(map.isWall(Math.floor(x), Math.floor(z)), true, `Mission ${m.id} sign "${text}" at (${x}, ${z})`);
  }
});
