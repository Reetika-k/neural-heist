// k-nearest-neighbour image classifier (the same idea as Teachable Machine's KNN head),
// trained only on the labels the player gives in the Lab.
//
// fit:     store (feature vector, label) pairs
// predict: find the k closest stored vectors (Euclidean distance) and take a distance-weighted vote;
//          confidence = winning share of the vote.
import { features } from "./snapshots.js";

export const LABELS = ["guard", "civilian"];

/** threshold (2026-10-24): how sure the drone must be (share of the guard vote) before it calls someone a guard. */
export function createClassifier(k = 3, threshold = 0.5) {
  return { k, threshold, examples: [] };
}

/** Train on labelled snapshots: [{ snapshot, label }]. Unlabelled items are ignored. */
export function fit(model, labelled) {
  model.examples = labelled.filter((e) => LABELS.includes(e.label)).map((e) => ({ f: features(e.snapshot), label: e.label }));
  return model;
}

const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };

/** @returns {{ label: string|null, confidence: number, pGuard: number, neighbours: number }} */
export function predict(model, snapshot) {
  if (!model.examples.length) return { label: null, confidence: 0, pGuard: 0, neighbours: 0 };
  const f = features(snapshot);
  const near = model.examples.map((e) => ({ label: e.label, d: dist(f, e.f) })).sort((a, b) => a.d - b.d).slice(0, Math.min(model.k, model.examples.length));
  const votes = { guard: 0, civilian: 0 };
  for (const n of near) votes[n.label] += 1 / (n.d + 1e-6);
  const total = votes.guard + votes.civilian;
  // RETIRED 2026-10-24: a fixed 50 % cut-off; the player now chooses it in the Lab (precision vs recall).
  // const label = votes.guard >= votes.civilian ? "guard" : "civilian";
  const pGuard = votes.guard / total;
  const label = pGuard >= (model.threshold ?? 0.5) ? "guard" : "civilian";
  return { label, confidence: votes[label] / total, pGuard, neighbours: near.length };
}

/** Accuracy of the model on snapshots whose true kind is known. */
export function accuracy(model, snapshots, truth = (s) => s.kind) {
  if (!snapshots.length || !model.examples.length) return 0;
  return snapshots.filter((s) => predict(model, s).label === truth(s)).length / snapshots.length;
}

/**
 * Right and wrong guesses on snapshots with a known kind, with "guard" as the positive class.
 * Missed guards (fn) are dangerous in the mission (no cone shown); false alarms (fp) draw a guard to check.
 */
export function confusion(model, snapshots, truth = (s) => s.kind) {
  const c = { tp: 0, fn: 0, fp: 0, tn: 0 };
  if (model.examples.length) for (const s of snapshots) {
    const g = predict(model, s).label === "guard", isG = truth(s) === "guard";
    c[isG ? (g ? "tp" : "fn") : (g ? "fp" : "tn")]++;
  }
  return { ...c, precision: c.tp + c.fp ? c.tp / (c.tp + c.fp) : 0, recall: c.tp + c.fn ? c.tp / (c.tp + c.fn) : 0 };
}

/** Warnings the Lab shows before the model is used. */
export function trainingWarnings(labelled) {
  const n = labelled.filter((e) => LABELS.includes(e.label)).length;
  const per = LABELS.map((l) => labelled.filter((e) => e.label === l).length);
  const w = [];
  if (n < 10) w.push(`Only ${n} labelled image${n === 1 ? "" : "s"}: the model will memorise them and may overfit. Label at least 10.`);
  if (per.some((c) => c === 0) && n > 0) w.push("Only one class labelled: the model can only ever answer that class.");
  return w;
}
