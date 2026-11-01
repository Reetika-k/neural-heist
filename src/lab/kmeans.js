// k-means clustering (unsupervised learning) for the Mission 4 Lab. Pure functions: no DOM, unit-tested in Node.
//
//   standardize: rescale each measurement to mean 0, spread 1, so no measurement dominates just because its numbers are big
//   kmeans:      k-means++ start, then alternate "assign each point to its nearest centre" and "move each centre to the
//                mean of its points" until nothing changes; the best of several starts (lowest inertia) is kept
//   inertia:     sum of squared distances from points to their centre (the elbow chart)
//   silhouette:  how much closer each point is to its own group than to the next one (-1 … 1; higher = cleaner groups)
import { mulberry32 } from "./rng.js";

const dist2 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return s; };

/** Columns to mean 0 / standard deviation 1. Returns the scaled rows and the per-column mean and spread. */
export function standardize(rows) {
  const d = rows[0].length, n = rows.length;
  const mean = Array.from({ length: d }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / n);
  const sd = mean.map((m, j) => Math.sqrt(rows.reduce((s, r) => s + (r[j] - m) ** 2, 0) / n) || 1);
  return { rows: rows.map((r) => r.map((v, j) => (v - mean[j]) / sd[j])), mean, sd };
}

/** k-means++ start: the first centre at random, each next one far from the centres chosen so far. */
function initCentres(rows, k, rng) {
  const centres = [rows[Math.floor(rng() * rows.length)].slice()];
  while (centres.length < k) {
    const d = rows.map((r) => Math.min(...centres.map((c) => dist2(r, c))));
    const total = d.reduce((a, b) => a + b, 0);
    let pick = rng() * total, i = 0;
    while (i < rows.length - 1 && pick > d[i]) { pick -= d[i]; i++; }
    centres.push(rows[i].slice());
  }
  return centres;
}

function runOnce(rows, k, rng, maxIter) {
  let centres = initCentres(rows, k, rng), labels = new Array(rows.length).fill(-1);
  const history = [{ centres: centres.map((c) => c.slice()), labels: labels.slice() }];
  for (let it = 0; it < maxIter; it++) {
    const next = rows.map((r) => { let best = 0, bd = Infinity; centres.forEach((c, j) => { const d = dist2(r, c); if (d < bd) { bd = d; best = j; } }); return best; });
    const changed = next.some((l, i) => l !== labels[i]);
    labels = next;
    centres = centres.map((c, j) => { const pts = rows.filter((_, i) => labels[i] === j); return pts.length ? c.map((_, d) => pts.reduce((s, p) => s + p[d], 0) / pts.length) : c; });
    history.push({ centres: centres.map((c) => c.slice()), labels: labels.slice() });
    if (!changed) break;
  }
  return { centres, labels, history, inertia: inertia(rows, labels, centres) };
}

/**
 * @param rows   numeric feature rows (already scaled if wanted)
 * @param k      number of groups
 * @returns { labels, centres, inertia, iterations, history } (history: centres and labels after every step, for the Lab animation)
 */
export function kmeans(rows, k, { seed = 1, restarts = 8, maxIter = 50 } = {}) {
  const rng = mulberry32(seed);
  let best = null;
  for (let r = 0; r < restarts; r++) { const run = runOnce(rows, k, rng, maxIter); if (!best || run.inertia < best.inertia - 1e-9) best = run; }
  return { ...best, iterations: best.history.length - 1 };
}

export const inertia = (rows, labels, centres) => rows.reduce((s, r, i) => s + dist2(r, centres[labels[i]]), 0);

/** Mean silhouette over all points (0 for a single group). */
export function silhouette(rows, labels) {
  const groups = [...new Set(labels)];
  if (groups.length < 2) return 0;
  const d = (a, b) => Math.sqrt(dist2(a, b));
  return rows.reduce((sum, r, i) => {
    const meanTo = (g) => { const pts = rows.filter((_, j) => labels[j] === g && j !== i); return pts.length ? pts.reduce((s, p) => s + d(r, p), 0) / pts.length : 0; };
    const own = rows.filter((_, j) => labels[j] === labels[i]).length > 1 ? meanTo(labels[i]) : 0;
    const other = Math.min(...groups.filter((g) => g !== labels[i]).map(meanTo));
    return sum + (Math.max(own, other) ? (other - own) / Math.max(own, other) : 0);
  }, 0) / rows.length;
}

/** Inertia for k = 1 … maxK (the elbow chart). */
export const elbow = (rows, maxK = 7, opts = {}) => Array.from({ length: maxK }, (_, i) => ({ k: i + 1, inertia: kmeans(rows, i + 1, opts).inertia }));

/** How well a chosen set of servers matches the true set: precision, recall and F1. */
export function matchScore(chosen, truth) {
  const c = new Set(chosen), t = new Set(truth);
  const hit = [...c].filter((x) => t.has(x)).length;
  const precision = c.size ? hit / c.size : 0, recall = t.size ? hit / t.size : 0;
  return { precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
}
