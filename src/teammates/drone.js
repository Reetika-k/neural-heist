// The drone teammate (Mission 1). It hovers ahead of the player and scans nearby characters
// with the classifier the player trained in the Lab. Its output is used as-is: a character it
// labels "guard" is marked (vision cone revealed); a guard it misses stays invisible.
import { predict } from "../lab/classifier.js";

export const DRONE = { scanRadius: 6.5, lead: 1.6, height: 2.2 };

export function createDrone(start) {
  return { pos: { x: start.x, z: start.z }, detections: new Map(), scans: 0 };
}

/**
 * @param characters [{ id, kind, pos, snapshot }] (kind is ground truth, used only to score accuracy)
 * @returns {string[]} ids newly scanned this frame
 */
export function updateDrone(d, { player, facing, characters, model, dt }) {
  const target = { x: player.x - Math.sin(facing) * DRONE.lead, z: player.z - Math.cos(facing) * DRONE.lead };
  const k = 1 - Math.exp(-4 * dt);
  d.pos = { x: d.pos.x + (target.x - d.pos.x) * k, z: d.pos.z + (target.z - d.pos.z) * k };
  const scanned = [];
  for (const c of characters) {
    if (d.detections.has(c.id)) continue;
    if (Math.hypot(c.pos.x - d.pos.x, c.pos.z - d.pos.z) > DRONE.scanRadius) continue;
    const p = model ? predict(model, c.snapshot) : { label: null, confidence: 0 };
    d.detections.set(c.id, { id: c.id, label: p.label, confidence: p.confidence, truth: c.kind, correct: p.label === c.kind });
    d.scans++;
    scanned.push(c.id);
  }
  return scanned;
}

/** Share of scanned characters the drone classified correctly (0 if nothing scanned). */
export function droneAccuracy(d) {
  const all = [...d.detections.values()];
  return all.length ? all.filter((x) => x.correct).length / all.length : 0;
}

export const isRevealed = (d, id) => d.detections.get(id)?.label === "guard";

/**
 * The drone's mission score (2026-10-24): accuracy of the trained model on every character in the mission, whoever the
 * drone happened to scan. droneAccuracy (above) counted only scanned characters, so a quick run that scanned one person
 * scored 0 % or 100 % by luck. Ground truth (kind) is used only for scoring.
 */
export function modelAccuracy(model, characters) {
  if (!model || !characters.length) return 0;
  return characters.filter((c) => predict(model, c.snapshot).label === c.kind).length / characters.length;
}
