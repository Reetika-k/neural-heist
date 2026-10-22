// Illustrated CCTV portrait for the Mission 1 Lab (display only).
// Each portrait is drawn from the `traits` of the same generated person whose 32×32 grainy frame the
// classifier learns from: same uniform colour, visor, cap, badge, hair, sunglasses, scarf, lighting,
// background and neon sign. Only the framing (head and shoulders) and the drawing style differ.
// Extra variety that the model never sees (hairstyle, collar, CCTV overlay) comes from a separate RNG,
// so changing the look here can never change the AI's data.
import { mulberry32 } from "../lab/rng.js";

export const PORTRAIT_SIZE = 256;

const rgb = (c, k = 1, a = 1) => `rgba(${Math.round(Math.min(255, c[0] * k))},${Math.round(Math.min(255, c[1] * k))},${Math.round(Math.min(255, c[2] * k))},${a})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
/** Night scenes are dark; lift very dark colours just enough that shapes read, keeping their hue. */
const lift = (c, min = 0.13) => { const l = lum(c); return l >= min ? c : mix(c, [c[0] + 40, c[1] + 40, c[2] + 50], Math.min(1, (min - l) / min)); };

function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

export function drawPortrait(canvas, snap, { cam = true } = {}) {
  const S = PORTRAIT_SIZE, t = snap.traits;
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext("2d");
  const r = mulberry32(snap.seed * 131 + (t.guard ? 17 : 29)); // display-only variety
  const L = Math.max(0.85, Math.min(1.12, t.light));            // scene lighting from the frame
  const cx = S / 2 + t.shift * 5, k = t.scale;
  const neonX = t.neonLeft ? 36 : S - 36, neonY = 78 + t.neonY * 110; // kept below the CAM label and REC dot

  // ---------- background: night street, neon sign, bokeh ----------
  const bg = ctx.createLinearGradient(0, 0, 0, S);
  bg.addColorStop(0, rgb(lift(t.top, 0.07), L)); bg.addColorStop(1, rgb(lift(t.bottom, 0.1), L));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 7; i++) {
    const bx = r() * S, by = 20 + r() * 150, br = 6 + r() * 16;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, rgb(i % 2 ? t.neon : [255, 190, 120], 1, 0.16)); g.addColorStop(1, rgb(t.neon, 1, 0));
    ctx.fillStyle = g; ctx.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  const glow = ctx.createRadialGradient(neonX, neonY, 4, neonX, neonY, 120);
  glow.addColorStop(0, rgb(t.neon, 1, 0.35)); glow.addColorStop(1, rgb(t.neon, 1, 0));
  ctx.fillStyle = glow; ctx.fillRect(0, 0, S, S);
  ctx.save(); ctx.shadowColor = rgb(t.neon); ctx.shadowBlur = 18;
  roundRect(ctx, neonX - 22, neonY - 13, 44, 26, 6); ctx.lineWidth = 3.5; ctx.strokeStyle = rgb(t.neon, 1.15); ctx.stroke();
  ctx.fillStyle = rgb(t.neon, 1.2, 0.9); ctx.fillRect(neonX - 13, neonY - 5, 26, 3.5); ctx.fillRect(neonX - 13, neonY + 2, 16, 3.5);
  ctx.restore();

  const skin = t.skin, skinLit = rgb(skin, 1.08 * L), skinShade = rgb(skin, 0.78 * L);
  const torso = lift(t.torso, t.guard ? 0.1 : 0.12);
  const headY = 108, hrx = 40 * k, hry = 48 * k;
  const civilianHair = !t.guard && t.hair ? lift(t.hair, 0.09) : null;
  const style = civilianHair ? ["crop", "side", "curly", "long", "bun"][Math.floor(r() * 5)] : null;
  const collar = t.guard ? "uniform" : ["crew", "hoodie", "jacket"][Math.floor(r() * 3)];

  // long hair falls behind the shoulders
  if (style === "long") { ctx.fillStyle = rgb(civilianHair, L); roundRect(ctx, cx - hrx - 6, headY - hry * 0.6, hrx * 2 + 12, hry * 1.9, 30); ctx.fill(); }

  // ---------- shoulders and torso ----------
  const sw = 92 * k, top = 172;
  const body = ctx.createLinearGradient(cx - sw, top, cx + sw, S);
  body.addColorStop(0, rgb(torso, 1.25 * L)); body.addColorStop(0.55, rgb(torso, 1 * L)); body.addColorStop(1, rgb(torso, 0.7 * L));
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(cx - sw - 14, S + 2); ctx.quadraticCurveTo(cx - sw - 6, top + 6, cx - 34, top - 4); ctx.lineTo(cx + 34, top - 4); ctx.quadraticCurveTo(cx + sw + 6, top + 6, cx + sw + 14, S + 2); ctx.closePath(); ctx.fill();
  // neon rim light on the sign's side
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = rgb(t.neon, 1, 0.35); ctx.lineWidth = 3;
  ctx.beginPath(); if (t.neonLeft) { ctx.moveTo(cx - sw - 13, S); ctx.quadraticCurveTo(cx - sw - 5, top + 7, cx - 34, top - 3); } else { ctx.moveTo(cx + sw + 13, S); ctx.quadraticCurveTo(cx + sw + 5, top + 7, cx + 34, top - 3); } ctx.stroke(); ctx.restore();

  // neck
  ctx.fillStyle = skinShade; roundRect(ctx, cx - 17 * k, headY + hry - 14, 34 * k, 40, 10); ctx.fill();

  // collars
  if (collar === "uniform") {
    ctx.fillStyle = rgb(torso, 0.6 * L);
    ctx.beginPath(); ctx.moveTo(cx - 30, top - 4); ctx.lineTo(cx, top + 30); ctx.lineTo(cx + 30, top - 4); ctx.lineTo(cx + 18, top - 4); ctx.lineTo(cx, top + 16); ctx.lineTo(cx - 18, top - 4); ctx.closePath(); ctx.fill();
    if (!t.offDuty) { // epaulettes and buttons
      ctx.fillStyle = rgb(torso, 0.55 * L); roundRect(ctx, cx - sw + 6, top + 8, 44, 12, 4); ctx.fill(); roundRect(ctx, cx + sw - 50, top + 8, 44, 12, 4); ctx.fill();
      ctx.fillStyle = "rgba(240,200,60,.85)"; ctx.fillRect(cx - sw + 6, top + 18, 44, 2); ctx.fillRect(cx + sw - 50, top + 18, 44, 2);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx, top + 40 + i * 20, 3, 0, 7); ctx.fill(); }
    } else { ctx.strokeStyle = rgb(torso, 0.55 * L); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, top + 28); ctx.lineTo(cx, S); ctx.stroke(); } // plain zip jacket
  } else if (collar === "crew") {
    ctx.strokeStyle = rgb(torso, 0.7 * L); ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(cx, top - 2, 26 * k, 12, 0, 0.1, Math.PI - 0.1); ctx.stroke();
  } else if (collar === "hoodie") {
    ctx.fillStyle = rgb(torso, 0.75 * L); ctx.beginPath(); ctx.ellipse(cx, top + 2, 46 * k, 16, 0, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = rgb(torso, 1.5 * L); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx - 12, top + 12); ctx.lineTo(cx - 14, top + 46); ctx.moveTo(cx + 12, top + 12); ctx.lineTo(cx + 14, top + 46); ctx.stroke();
  } else {
    ctx.fillStyle = rgb(torso, 0.65 * L);
    ctx.beginPath(); ctx.moveTo(cx - 34, top - 4); ctx.lineTo(cx - 4, top + 54); ctx.lineTo(cx - 20, top + 10); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 34, top - 4); ctx.lineTo(cx + 4, top + 54); ctx.lineTo(cx + 20, top + 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgb(mix(torso, [230, 230, 235], 0.75), L); ctx.beginPath(); ctx.moveTo(cx - 18, top - 2); ctx.lineTo(cx, top + 40); ctx.lineTo(cx + 18, top - 2); ctx.closePath(); ctx.fill();
  }

  // badge: gold shield on the chest
  if (t.badge) {
    const bx = cx - 46 * k, by = top + 30;
    ctx.save(); ctx.shadowColor = "rgba(255,210,80,.8)"; ctx.shadowBlur = 8;
    ctx.fillStyle = "#f0c83c"; ctx.beginPath(); ctx.moveTo(bx - 10, by - 10); ctx.lineTo(bx + 10, by - 10); ctx.lineTo(bx + 10, by + 3); ctx.quadraticCurveTo(bx, by + 16, bx, by + 16); ctx.quadraticCurveTo(bx - 10, by + 8, bx - 10, by + 3); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.fillStyle = "#fff6c8"; ctx.fillRect(bx - 6, by - 6, 4, 4);
  }

  // scarf
  if (t.scarf) {
    ctx.fillStyle = rgb([220, 40, 55], L); roundRect(ctx, cx - 40 * k, top - 14, 80 * k, 22, 10); ctx.fill();
    ctx.fillStyle = rgb([190, 30, 45], L); roundRect(ctx, cx + 8, top + 4, 18, 44, 6); ctx.fill();
  }

  // ---------- head ----------
  ctx.fillStyle = skinShade; ctx.beginPath(); ctx.ellipse(cx - hrx + 1, headY + 6, 8, 12, 0, 0, 7); ctx.ellipse(cx + hrx - 1, headY + 6, 8, 12, 0, 0, 7); ctx.fill();
  const face = ctx.createRadialGradient(cx - hrx * 0.35, headY - hry * 0.35, 6, cx, headY, hry * 1.15);
  face.addColorStop(0, skinLit); face.addColorStop(1, skinShade);
  ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(cx, headY, hrx, hry, 0, 0, 7); ctx.fill();

  const eyeY = headY - 2;
  const coveredEyes = t.visor || t.sunglasses;
  if (!coveredEyes) {
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.ellipse(cx - 15 * k, eyeY, 6.5, 4.5, 0, 0, 7); ctx.ellipse(cx + 15 * k, eyeY, 6.5, 4.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#1a1420"; ctx.beginPath(); ctx.arc(cx - 15 * k + 1, eyeY, 3.2, 0, 7); ctx.arc(cx + 15 * k + 1, eyeY, 3.2, 0, 7); ctx.fill();
    ctx.strokeStyle = rgb(skin, 0.45); ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx - 22 * k, eyeY - 11); ctx.lineTo(cx - 8 * k, eyeY - 13); ctx.moveTo(cx + 8 * k, eyeY - 13); ctx.lineTo(cx + 22 * k, eyeY - 11); ctx.stroke();
  }
  ctx.strokeStyle = rgb(skin, 0.62); ctx.lineWidth = 2.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx + 1, eyeY + 8); ctx.lineTo(cx - 3, eyeY + 20); ctx.lineTo(cx + 3, eyeY + 21); ctx.stroke();
  ctx.strokeStyle = rgb(skin, 0.5); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - 9, eyeY + 32); ctx.quadraticCurveTo(cx, eyeY + (t.guard ? 33 : 36), cx + 9, eyeY + 32); ctx.stroke();

  // red visor: the strongest guard cue, it glows
  if (t.visor) {
    ctx.save(); ctx.shadowColor = "rgba(255,40,70,.95)"; ctx.shadowBlur = 16;
    ctx.fillStyle = "#eb2840"; roundRect(ctx, cx - hrx - 4, eyeY - 10, hrx * 2 + 8, 19, 9); ctx.fill(); ctx.restore();
    ctx.fillStyle = "rgba(255,190,200,.75)"; roundRect(ctx, cx - hrx + 6, eyeY - 6, hrx * 1.2, 4, 2); ctx.fill();
  }
  if (t.sunglasses) {
    ctx.fillStyle = "#0f0f14"; roundRect(ctx, cx - 30 * k, eyeY - 8, 25 * k, 15, 6); ctx.fill(); roundRect(ctx, cx + 5 * k, eyeY - 8, 25 * k, 15, 6); ctx.fill();
    ctx.fillRect(cx - 6 * k, eyeY - 5, 12 * k, 3);
    ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.fillRect(cx - 26 * k, eyeY - 5, 8, 3); ctx.fillRect(cx + 9 * k, eyeY - 5, 8, 3);
  }

  // ---------- hair and caps ----------
  if (t.guard && t.cap) {
    const capC = lift([16.6, 22.4, 45.9], 0.08); // the model's cap navy
    ctx.fillStyle = rgb(capC, 1.1 * L); ctx.beginPath(); ctx.ellipse(cx, headY - hry * 0.55, hrx + 5, hry * 0.55, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = rgb(capC, 0.75 * L); roundRect(ctx, cx - hrx - 12, headY - hry * 0.6, hrx * 2 + 24, 14, 7); ctx.fill();
    ctx.fillStyle = "#f0c83c"; ctx.beginPath(); ctx.arc(cx, headY - hry * 0.82, 6, 0, 7); ctx.fill();
  } else if (t.guard) {
    ctx.fillStyle = rgb([28, 24, 30], L); ctx.beginPath(); ctx.ellipse(cx, headY - hry * 0.62, hrx * 0.92, hry * 0.42, 0, Math.PI, 0); ctx.fill(); // buzz cut
  } else if (civilianHair) {
    const hc = rgb(civilianHair, L), hl = rgb(civilianHair, 1.6 * L);
    ctx.fillStyle = hc;
    if (style === "curly") { for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * hrx * 0.85, headY - hry * 0.45 + Math.sin(a) * hry * 0.55, 15, 0, 7); ctx.fill(); } }
    else { ctx.beginPath(); ctx.ellipse(cx, headY - hry * 0.5, hrx + 3, hry * 0.6, 0, Math.PI, 0); ctx.fill(); }
    if (style === "side") { ctx.beginPath(); ctx.moveTo(cx - hrx - 3, headY - hry * 0.5); ctx.quadraticCurveTo(cx - 10, headY - hry * 0.2, cx + hrx + 3, headY - hry * 0.42); ctx.lineTo(cx + hrx + 3, headY - hry * 0.5); ctx.closePath(); ctx.fill(); }
    if (style === "bun") { ctx.beginPath(); ctx.arc(cx, headY - hry - 8, 17, 0, 7); ctx.fill(); }
    if (style === "long") { ctx.fillRect(cx - hrx - 4, headY - hry * 0.5, 12, hry * 1.1); ctx.fillRect(cx + hrx - 8, headY - hry * 0.5, 12, hry * 1.1); }
    ctx.strokeStyle = hl; ctx.globalAlpha = 0.35; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx - 6, headY - hry * 0.55, hrx * 0.6, Math.PI * 1.15, Math.PI * 1.55); ctx.stroke(); ctx.globalAlpha = 1;
  } else if (!t.guard) {
    ctx.fillStyle = rgb(skin, 0.7 * L, 0.55); ctx.beginPath(); ctx.ellipse(cx, headY - hry * 0.6, hrx * 0.9, hry * 0.4, 0, Math.PI, 0); ctx.fill(); // shaved
  }

  // ---------- CCTV overlay ----------
  if (cam) {
    ctx.fillStyle = "rgba(0,0,0,.10)"; for (let y = 0; y < S; y += 4) ctx.fillRect(0, y, S, 1.5);
    const v = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)"); ctx.fillStyle = v; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 3;
    const c = 22, m = 12;
    ctx.beginPath(); ctx.moveTo(m, m + c); ctx.lineTo(m, m); ctx.lineTo(m + c, m); ctx.moveTo(S - m - c, m); ctx.lineTo(S - m, m); ctx.lineTo(S - m, m + c);
    ctx.moveTo(m, S - m - c); ctx.lineTo(m, S - m); ctx.lineTo(m + c, S - m); ctx.moveTo(S - m - c, S - m); ctx.lineTo(S - m, S - m); ctx.lineTo(S - m, S - m - c); ctx.stroke();
    ctx.font = "700 17px ui-monospace, Menlo, monospace"; ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.fillText(`CAM ${String((snap.seed % 12) + 1).padStart(2, "0")}`, 24, 38);
    ctx.fillStyle = "#ff3355"; ctx.beginPath(); ctx.arc(S - 30, 31, 6, 0, 7); ctx.fill();
  }
}
