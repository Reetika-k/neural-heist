// Procedural "CCTV snapshots" (32×32 RGBA) of guards and civilians.
// Pure pixel generation, so the same images exist in the browser, in tests and in the mission:
// every character in Mission 1 carries a snapshot generated from its own seed.
//
// What makes a guard: a dark navy uniform, usually a red visor, often a cap, a gold badge.
// Hard cases on purpose: off-duty guards (no visor, no cap) and civilians in dark coats,
// sunglasses or red scarves. So good labels and enough examples genuinely matter.
import { mulberry32, randRange, gauss } from "./rng.js";

export const SNAP = 32;

function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

export function makeSnapshot(kind, seed) {
  const rng = mulberry32(seed * 7919 + (kind === "guard" ? 1 : 2));
  const px = new Float32Array(SNAP * SNAP * 3);
  const set = (x, y, c) => { if (x < 0 || y < 0 || x >= SNAP || y >= SNAP) return; const i = (y * SNAP + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; };

  // background: dark street with a neon sign blob
  const top = hsl(randRange(rng, 200, 280), 0.5, randRange(rng, 0.06, 0.16));
  const bottom = hsl(randRange(rng, 200, 300), 0.4, randRange(rng, 0.1, 0.22));
  for (let y = 0; y < SNAP; y++) for (let x = 0; x < SNAP; x++) set(x, y, top.map((v, i) => v + (bottom[i] - v) * (y / SNAP)));
  const neon = hsl(rng() < 0.5 ? randRange(rng, 170, 200) : randRange(rng, 300, 340), 0.9, 0.55);
  const nx = rng() < 0.5 ? Math.floor(randRange(rng, 0, 6)) : Math.floor(randRange(rng, 24, 30)), ny = Math.floor(randRange(rng, 2, 20));
  for (let y = ny; y < ny + 4; y++) for (let x = nx; x < nx + 4; x++) set(x, y, neon);

  // figure
  const dx = Math.round(randRange(rng, -3, 3)), s = randRange(rng, 0.9, 1.1);
  const cx = 16 + dx, headY = 9, headR = 4.2 * s;
  const guard = kind === "guard";
  const offDuty = guard && rng() < 0.12;
  const skin = hsl(randRange(rng, 20, 35), randRange(rng, 0.35, 0.6), randRange(rng, 0.35, 0.7));
  let torso;
  if (guard) torso = hsl(randRange(rng, 215, 235), randRange(rng, 0.35, 0.6), randRange(rng, 0.12, offDuty ? 0.35 : 0.22));
  else torso = rng() < 0.22 ? hsl(randRange(rng, 0, 360), 0.1, randRange(rng, 0.1, 0.22)) : hsl(randRange(rng, 0, 360), randRange(rng, 0.5, 0.9), randRange(rng, 0.35, 0.6));
  const legs = guard ? hsl(225, 0.4, 0.12) : hsl(randRange(rng, 0, 360), randRange(rng, 0.1, 0.5), randRange(rng, 0.15, 0.4));

  for (let y = 13; y < 24; y++) for (let x = Math.round(cx - 6 * s); x <= Math.round(cx + 6 * s); x++) set(x, y, torso);
  for (let y = 14; y < 23; y++) { set(Math.round(cx - 7 * s), y, torso); set(Math.round(cx + 7 * s), y, torso); }
  for (let y = 24; y < 31; y++) { for (let x = Math.round(cx - 5 * s); x <= cx - 1; x++) set(x, y, legs); for (let x = cx + 1; x <= Math.round(cx + 5 * s); x++) set(x, y, legs); }
  for (let y = 0; y < SNAP; y++) for (let x = 0; x < SNAP; x++) if ((x - cx) ** 2 + (y - headY) ** 2 <= headR * headR) set(x, y, skin);

  const look = { visor: false, cap: false, badge: false, hair: null, sunglasses: false, scarf: false }; // what the Lab portrait draws
  if (guard && !offDuty) {
    look.badge = true;
    if ((look.visor = rng() < 0.88)) for (let x = Math.round(cx - headR); x <= Math.round(cx + headR); x++) { set(x, 8, [235, 40, 60]); set(x, 9, [235, 40, 60]); } // red visor
    if ((look.cap = rng() < 0.65)) for (let y = 4; y < 7; y++) for (let x = Math.round(cx - headR - 1); x <= Math.round(cx + headR + 1); x++) set(x, y, hsl(225, 0.5, 0.12)); // cap
    set(cx - 3, 16, [240, 200, 60]); set(cx - 2, 16, [240, 200, 60]); set(cx - 3, 17, [240, 200, 60]); // badge
  } else if (!guard) {
    if (rng() < 0.6) for (let y = 4; y < 7; y++) for (let x = Math.round(cx - headR); x <= Math.round(cx + headR); x++) { const c = hsl(randRange(rng, 0, 50), 0.4, randRange(rng, 0.08, 0.3)); look.hair ??= c; set(x, y, c); } // hair (each pixel its own shade)
    if ((look.sunglasses = rng() < 0.15)) for (let x = Math.round(cx - 3); x <= Math.round(cx + 3); x++) set(x, 9, [15, 15, 20]); // sunglasses
    if ((look.scarf = rng() < 0.12)) for (let x = Math.round(cx - 5); x <= Math.round(cx + 5); x++) set(x, 13, [220, 40, 55]); // red scarf
  }

  // camera noise and lighting
  const light = randRange(rng, 0.75, 1.15);
  const out = new Uint8ClampedArray(SNAP * SNAP * 4);
  const view = new Uint8ClampedArray(SNAP * SNAP * 4); // same image without the grain (no longer drawn since the Lab portraits, 2026-10-20; kept for reference)
  for (let i = 0; i < SNAP * SNAP; i++) {
    for (let c = 0; c < 3; c++) { out[i * 4 + c] = px[i * 3 + c] * light + gauss(rng) * 12; view[i * 4 + c] = px[i * 3 + c] * light; }
    out[i * 4 + 3] = 255; view[i * 4 + 3] = 255;
  }
  // `pixels` (with camera grain) is what the classifier trains and predicts on; `view` is only drawn in the Lab.
  // `traits` describe the same person for the Lab's illustrated portrait (display only).
  const traits = { guard, offDuty, skin, torso, legs, top, bottom, neon, neonLeft: nx < 16, neonY: ny / SNAP, shift: dx, scale: s, light, ...look };
  return { kind, seed, pixels: out, view, traits };
}

/**
 * Feature vector for the classifier: the central crop averaged into 4×4-pixel cells (RGB, 0..1).
 * Cropping to where people stand removes most background, so neighbours are compared on the person.
 */
export function features(snapshot) {
  const { pixels } = snapshot, f = [];
  for (let cy = 2; cy < 30; cy += 4) for (let cx = 6; cx < 26; cx += 4) {
    const sum = [0, 0, 0];
    for (let y = cy; y < cy + 4; y++) for (let x = cx; x < cx + 4; x++) for (let c = 0; c < 3; c++) sum[c] += pixels[(y * SNAP + x) * 4 + c];
    f.push(sum[0] / 16 / 255, sum[1] / 16 / 255, sum[2] / 16 / 255);
  }
  return f;
}

/** The Lab's dataset: 30 images to label and 10 held-back test images (ground truth known to the game only). */
export function labDataset() {
  const kinds = (n, seed) => { const r = mulberry32(seed); return Array.from({ length: n }, (_, i) => (i % 2 === 0) !== (r() < 0.2) ? "guard" : "civilian"); };
  const train = kinds(30, 11).map((k, i) => makeSnapshot(k, 100 + i));
  const test = ["guard", "civilian", "guard", "civilian", "guard", "civilian", "guard", "civilian", "guard", "civilian"].map((k, i) => makeSnapshot(k, 500 + i));
  return { train, test };
}
