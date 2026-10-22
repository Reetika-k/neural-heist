// k-nearest-neighbour image classifier (the same idea as Teachable Machine's KNN head),
// trained only on the labels the player gives in the Lab.
//
// fit:     store (feature vector, label) pairs
// predict: find the k closest stored vectors (Euclidean distance) and take a distance-weighted vote;
//          confidence = winning share of the vote.
import { features } from "./snapshots.js";

export const LABELS = ["guard", "civilian"];

export function createClassifier(k = 3) {
  return { k, examples: [] };
}

/** Train on labelled snapshots: [{ snapshot, label }]. Unlabelled items are ignored. */
export function fit(model, labelled) {
  model.examples = labelled.filter((e) => LABELS.includes(e.label)).map((e) => ({ f: features(e.snapshot), label: e.label }));
  return model;
}

const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };

/** @returns {{ label: string|null, confidence: number, neighbours: number }} */
export function predict(model, snapshot) {
  if (!model.examples.length) return { label: null, confidence: 0, neighbours: 0 };
  const f = features(snapshot);
  const near = model.examples.map((e) => ({ label: e.label, d: dist(f, e.f) })).sort((a, b) => a.d - b.d).slice(0, Math.min(model.k, model.examples.length));
  const votes = { guard: 0, civilian: 0 };
  for (const n of near) votes[n.label] += 1 / (n.d + 1e-6);
  const total = votes.guard + votes.civilian;
  const label = votes.guard >= votes.civilian ? "guard" : "civilian";
  return { label, confidence: votes[label] / total, neighbours: near.length };
}

/** Accuracy of the model on snapshots whose true kind is known. */
export function accuracy(model, snapshots, truth = (s) => s.kind) {
  if (!snapshots.length || !model.examples.length) return 0;
  return snapshots.filter((s) => predict(model, s).label === truth(s)).length / snapshots.length;
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
