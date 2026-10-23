import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSnapshot, features, labDataset, SNAP } from "../src/lab/snapshots.js";
import { createClassifier, fit, predict, accuracy, trainingWarnings } from "../src/lab/classifier.js";
import { createDrone, updateDrone, droneAccuracy, isRevealed } from "../src/teammates/drone.js";
import { createCivilian, updateCivilian } from "../src/world/civilians.js";
import { MISSION_1, MISSION_1_CIVILIANS, parseMap } from "../src/world/map.js";
import { mulberry32 } from "../src/lab/rng.js";

const { train, test: heldOut } = labDataset();
const bigTest = Array.from({ length: 200 }, (_, i) => makeSnapshot(i % 2 ? "guard" : "civilian", 7000 + i));
const correct = (snaps) => snaps.map((s) => ({ snapshot: s, label: s.kind }));

test("snapshots are deterministic 32×32 RGBA images", () => {
  const a = makeSnapshot("guard", 5), b = makeSnapshot("guard", 5), c = makeSnapshot("guard", 6);
  assert.equal(a.pixels.length, SNAP * SNAP * 4);
  assert.deepEqual(a.pixels, b.pixels, "same seed → same image");
  assert.notDeepEqual(a.pixels, c.pixels);
  assert.equal(features(a).length, 105, "5×7 cells × RGB");
});

test("lab dataset: 30 images to label (balanced), 10 held-back, no overlap", () => {
  assert.equal(train.length, 30); assert.equal(heldOut.length, 10);
  const g = train.filter((s) => s.kind === "guard").length;
  assert.ok(g >= 12 && g <= 18, `roughly balanced (${g} guards)`);
  const seeds = new Set(train.map((s) => s.seed));
  assert.ok(heldOut.every((s) => !seeds.has(s.seed)), "test images are never in the training pool");
});

test("README scenario 5: 30 correct labels → test accuracy above 85%", () => {
  const m = fit(createClassifier(3), correct(train));
  assert.ok(accuracy(m, heldOut) >= 0.85, `held-out ${accuracy(m, heldOut)}`);
  assert.ok(accuracy(m, bigTest) >= 0.8, `200 unseen ${accuracy(m, bigTest)}`);
});

test("README scenario 4: 4 labels → overfitting warning and clearly worse accuracy", () => {
  const few = correct([train[0], train[1], train[2], train[3]]);
  assert.match(trainingWarnings(few)[0], /overfit/);
  let sum = 0;
  for (let r = 0; r < 20; r++) { const rng = mulberry32(r + 3); const pick = [...train].sort(() => rng() - 0.5).slice(0, 4); sum += accuracy(fit(createClassifier(3), correct(pick)), bigTest); }
  const full = accuracy(fit(createClassifier(3), correct(train)), bigTest);
  assert.ok(sum / 20 < full - 0.12, `4 labels avg ${(sum / 20).toFixed(2)} vs 30 labels ${full.toFixed(2)}`);
});

test("wrong labels hurt: 40% mislabelled is much worse than correct labels", () => {
  const rng = mulberry32(9);
  const noisy = train.map((s) => ({ snapshot: s, label: rng() < 0.4 ? (s.kind === "guard" ? "civilian" : "guard") : s.kind }));
  const good = accuracy(fit(createClassifier(3), correct(train)), bigTest);
  const bad = accuracy(fit(createClassifier(3), noisy), bigTest);
  assert.ok(bad < good - 0.15, `${bad} vs ${good}`);
});

test("predict: confidence in 0.5..1, empty model answers null, single class warns", () => {
  const m = fit(createClassifier(3), correct(train));
  const p = predict(m, heldOut[0]);
  assert.ok(p.confidence >= 0.5 && p.confidence <= 1);
  assert.deepEqual(predict(createClassifier(), heldOut[0]), { label: null, confidence: 0, neighbours: 0 });
  assert.ok(trainingWarnings(correct(train.filter((s) => s.kind === "guard"))).some((w) => /one class/.test(w)));
});

test("drone: scans characters in range once, uses the real model output, reports accuracy", () => {
  const model = fit(createClassifier(3), correct(train));
  const chars = [
    { id: "G1", kind: "guard", pos: { x: 3, z: 1.5 }, snapshot: makeSnapshot("guard", 9100) },
    { id: "C1", kind: "civilian", pos: { x: 4, z: 1.5 }, snapshot: makeSnapshot("civilian", 9101) },
    { id: "G2", kind: "guard", pos: { x: 18, z: 11 }, snapshot: makeSnapshot("guard", 9102) },
  ];
  const d = createDrone({ x: 1.5, z: 1.5 });
  const first = updateDrone(d, { player: { x: 1.5, z: 1.5 }, facing: 0, characters: chars, model, dt: 0.05 });
  assert.deepEqual(first.sort(), ["C1", "G1"], "only characters within the scan radius");
  assert.deepEqual(updateDrone(d, { player: { x: 1.5, z: 1.5 }, facing: 0, characters: chars, model, dt: 0.05 }), [], "never rescans");
  assert.equal(d.detections.get("G1").label, predict(model, chars[0].snapshot).label, "label = model prediction");
  assert.equal(droneAccuracy(d), [...d.detections.values()].filter((x) => x.correct).length / 2);
  assert.equal(isRevealed(d, "G2"), false, "unscanned guard stays hidden");
  const blind = createDrone({ x: 1.5, z: 1.5 });
  updateDrone(blind, { player: { x: 1.5, z: 1.5 }, facing: 0, characters: chars, model: null, dt: 0.05 });
  assert.equal(isRevealed(blind, "G1"), false, "no model → no guard is ever marked");
});

test("civilians wander along their route with A*", () => {
  const map = parseMap(MISSION_1);
  const c = createCivilian("C1", MISSION_1_CIVILIANS[0].route);
  const start = { ...c.pos };
  for (let i = 0; i < 200; i++) updateCivilian(c, map, 0.05);
  assert.ok(Math.hypot(c.pos.x - start.x, c.pos.z - start.z) > 1, "moved");
  assert.equal(map.isBlocked(Math.floor(c.pos.x), Math.floor(c.pos.z)), false);
});

// 2026-10-24: the drone's mission score no longer depends on who it happened to scan
import { modelAccuracy } from "../src/teammates/drone.js";
test("drone mission score: the trained model on every Rooftop character; perfect labels give 100 %", () => {
  const { train } = labDataset();
  const perfect = fit(createClassifier(3), train.map((s) => ({ snapshot: s, label: s.kind })));
  const kinds = ["guard", "guard", "civilian", "civilian", "civilian"];
  const rooftop = kinds.map((kind, i) => ({ kind, snapshot: makeSnapshot(kind, 9130 + i) }));
  assert.equal(modelAccuracy(perfect, rooftop), 1);
  assert.equal(modelAccuracy(null, rooftop), 0, "no model, no points");
  const weak = fit(createClassifier(3), train.slice(0, 4).map((s) => ({ snapshot: s, label: s.kind })));
  assert.ok(modelAccuracy(weak, rooftop) < 1, "weak training loses points");
});
