// Mission 1 Lab: label camera snapshots, train the k-NN classifier, inspect accuracy on held-back images.
import { labDataset, SNAP } from "../lab/snapshots.js";
import { createClassifier, fit, predict, accuracy, confusion, trainingWarnings } from "../lab/classifier.js";

import { drawPortrait } from "./portrait.js";

// RETIRED 2026-10-20: the Lab used to show only the grain-free 32×32 frame at 8× scale.
// Why: the user found the characters too small and stiff (blocky full-body sprites, faceless, cues of 1–3 pixels).
// Replaced by drawPortrait() (illustrated head-and-shoulders CCTV portrait of the same person) plus a
// "Drone's view" toggle that shows the real grainy frame the classifier learns from (drawDroneView below).
// // Drawn at an exact 8× scale (each snapshot pixel = an 8×8 block) from the grain-free copy, so the
// // figures stay sharp at any card size. The model itself still works on the grainy camera pixels.
// const SCALE = 8;
// function drawSnapshot(canvas, snap) {
//   canvas.width = SNAP * SCALE; canvas.height = SNAP * SCALE;
//   const ctx = canvas.getContext("2d"), src = snap.view ?? snap.pixels;
//   for (let y = 0; y < SNAP; y++) for (let x = 0; x < SNAP; x++) {
//     const i = (y * SNAP + x) * 4;
//     ctx.fillStyle = `rgb(${src[i]},${src[i + 1]},${src[i + 2]})`;
//     ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
//   }
// }

const SCALE = 8;
/** What the classifier actually sees: the grainy 32×32 camera frame, each pixel an 8×8 block. */
function drawDroneView(canvas, snap) {
  canvas.width = SNAP * SCALE; canvas.height = SNAP * SCALE;
  const ctx = canvas.getContext("2d"), src = snap.pixels;
  for (let y = 0; y < SNAP; y++) for (let x = 0; x < SNAP; x++) {
    const i = (y * SNAP + x) * 4;
    ctx.fillStyle = `rgb(${src[i]},${src[i + 1]},${src[i + 2]})`;
    ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
  }
}
let droneView = false;
const drawSnapshot = (canvas, snap) => (droneView ? drawDroneView(canvas, snap) : drawPortrait(canvas, snap));

/**
 * Renders the Lab into `root`. Calls onDone({ model, report }) when the player starts the mission.
 * The dataset and labels live in `lab` so automated tests can inspect them.
 */
export function mountClassifierLab(root, { onDone, onBack }) {
  const { train, test } = labDataset();
  const labels = new Array(train.length).fill(null);
  let model = null, report = null, threshold = 0.5;

  root.innerHTML = `
    <div class="lab">
      <header class="lab-head">
        <div><p class="eyebrow">Mission 1 Lab · Image classification</p><h2>Teach the drone to spot guards</h2>
        <p class="lab-sub">Click a snapshot to label it: once for <b class="red">Guard</b>, twice for <b class="green">Civilian</b>, three times to clear. Then train. The drone will use exactly what you teach it.</p></div>
        <div class="lab-tools">
          <div class="view-toggle" role="group" aria-label="Snapshot view"><button type="button" id="view-photo" aria-pressed="true">Camera photo</button><button type="button" id="view-drone" aria-pressed="false">Drone's view</button></div>
          <div class="lab-counts">Guard <span id="lab-count-g">0</span> · Civilian <span id="lab-count-c">0</span> · Unlabelled <span id="lab-count-u">${train.length}</span></div>
        </div>
      </header>
      <div class="lab-body">
        <div class="snap-grid" id="snap-grid"></div>
        <aside class="lab-side">
          <button class="btn-primary" id="lab-train">Train model</button>
          <button class="btn-link" id="lab-clear">Clear labels</button>
          <div id="lab-warn" class="lab-warn hidden"></div>
          <div id="lab-results" class="lab-results hidden">
            <dl class="metric-row"><div><dt>Training accuracy</dt><dd id="lab-train-acc">–</dd></div><div><dt>Test accuracy</dt><dd id="lab-test-acc">–</dd></div></dl>
            <!-- RETIRED 2026-10-24: <p class="fine">Test = 10 held-back snapshots the model never saw. ...</p> (now 40, with a threshold and a table of mistakes) -->
            <p class="fine">Test = ${test.length} held-back snapshots the model never saw. Training accuracy on a k-NN is optimistic; trust the test number.</p>
            <label class="slider thr-slider">How sure before calling someone a guard <b id="v-thr"></b><input type="range" id="r-thr" min="0.2" max="0.8" step="0.1" aria-label="How sure the drone must be before calling someone a guard"><span class="q-hint" id="h-thr"></span></label>
            <table class="conf-table" aria-label="Right and wrong guesses on the test snapshots">
              <tr><th></th><th>Drone says <b class="red">Guard</b></th><th>Drone says <b class="green">Civilian</b></th></tr>
              <tr><th>Really a guard</th><td data-kind="good"><b id="c-tp">–</b> spotted</td><td data-kind="bad"><b id="c-fn">–</b> missed</td></tr>
              <tr><th>Really a civilian</th><td data-kind="warn"><b id="c-fp">–</b> false alarm</td><td data-kind="good"><b id="c-tn">–</b> cleared</td></tr>
            </table>
            <p class="fine conf-note"><b>Missed guard:</b> no vision cone in the mission, so you walk into it. <b>False alarm:</b> the drone's spotlight lands on a civilian and the nearest guard comes over to check.<br>Guards spotted (recall) <b id="c-recall">–</b> · guard calls that were right (precision) <b id="c-precision">–</b></p>
            <div class="test-grid" id="test-grid"></div>
          </div>
          <button class="btn-primary btn-go" id="lab-go" disabled>Start mission</button>
          <button class="btn-link" id="lab-skip">Start without a model (drone useless)</button>
          <button class="btn-link" id="lab-back">Back to briefing</button>
        </aside>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  droneView = false;
  const views = [];
  const drawInto = (canvas, snap) => { views.push([canvas, snap]); drawSnapshot(canvas, snap); };
  function setView(drone) {
    droneView = drone;
    $("#view-photo").setAttribute("aria-pressed", String(!drone)); $("#view-drone").setAttribute("aria-pressed", String(drone));
    root.querySelector(".lab").classList.toggle("drone-view", drone);
    for (const [c, s] of views) if (c.isConnected) drawSnapshot(c, s);
  }
  $("#view-photo").addEventListener("click", () => setView(false));
  $("#view-drone").addEventListener("click", () => setView(true));

  train.forEach((snap, i) => {
    const card = document.createElement("button");
    card.className = "snap-card"; card.dataset.index = i; card.type = "button";
    card.setAttribute("aria-label", `Snapshot ${i + 1}, unlabelled`);
    const c = document.createElement("canvas"); drawInto(c, snap);
    const tag = document.createElement("span"); tag.className = "snap-label";
    card.append(c, tag);
    card.addEventListener("click", () => cycle(i));
    $("#snap-grid").appendChild(card);
  });

  function refresh() {
    root.querySelectorAll(".snap-card").forEach((card, i) => {
      card.dataset.label = labels[i] ?? "";
      card.querySelector(".snap-label").textContent = labels[i] ? labels[i].toUpperCase() : "";
      card.setAttribute("aria-label", `Snapshot ${i + 1}, ${labels[i] ?? "unlabelled"}`);
    });
    $("#lab-count-g").textContent = labels.filter((l) => l === "guard").length;
    $("#lab-count-c").textContent = labels.filter((l) => l === "civilian").length;
    $("#lab-count-u").textContent = labels.filter((l) => !l).length;
  }
  function cycle(i) { labels[i] = labels[i] === null ? "guard" : labels[i] === "guard" ? "civilian" : null; model = null; $("#lab-go").disabled = true; refresh(); }
  function setLabel(i, l) { labels[i] = l; refresh(); }

  function trainModel() {
    const labelled = train.map((snapshot, i) => ({ snapshot, label: labels[i] })).filter((e) => e.label);
    const warnings = trainingWarnings(labelled);
    $("#lab-warn").classList.toggle("hidden", !warnings.length);
    $("#lab-warn").innerHTML = warnings.map((w) => `<p>⚠ ${w}</p>`).join("");
    if (!labelled.length) { $("#lab-results").classList.add("hidden"); return; }
    model = fit(createClassifier(3, threshold), labelled);
    report = { labelled: labelled.length, perClass: { guard: labelled.filter((e) => e.label === "guard").length, civilian: labelled.filter((e) => e.label === "civilian").length }, mislabelled: labelled.filter((e) => e.label !== e.snapshot.kind).length, warnings, k: model.k };
    $("#lab-results").classList.remove("hidden");
    evaluate(labelled);
    $("#lab-go").disabled = false;
  }
  /** Scores the model on the test set at the current threshold (re-run when the slider moves). */
  function evaluate(labelled = report.labelledSet) {
    // training accuracy is measured against the player's own labels (what the model was told)
    const trainAcc = labelled.filter((e) => predict(model, e.snapshot).label === e.label).length / labelled.length;
    const testAcc = accuracy(model, test), c = confusion(model, test);
    Object.assign(report, { trainAccuracy: trainAcc, testAccuracy: testAcc, threshold: model.threshold, confusion: { tp: c.tp, fn: c.fn, fp: c.fp, tn: c.tn }, precision: c.precision, recall: c.recall });
    Object.defineProperty(report, "labelledSet", { value: labelled, enumerable: false, configurable: true }); // not exported
    for (const k of ["tp", "fn", "fp", "tn"]) $(`#c-${k}`).textContent = c[k];
    $("#c-recall").textContent = `${Math.round(c.recall * 100)}%`; $("#c-precision").textContent = `${Math.round(c.precision * 100)}%`;
    $("#lab-train-acc").textContent = `${Math.round(trainAcc * 100)}%`;
    $("#lab-test-acc").textContent = `${Math.round(testAcc * 100)}%`;
    $("#lab-test-acc").dataset.good = String(testAcc >= 0.85);
    $("#test-grid").innerHTML = "";
    test.forEach((snap) => {
      const p = predict(model, snap);
      const cell = document.createElement("div"); cell.className = "test-cell"; cell.dataset.correct = String(p.label === snap.kind);
      const c = document.createElement("canvas"); drawInto(c, snap);
      // RETIRED 2026-10-24: full captions ("✓ guard 92%") did not fit 40 cells; the full text is now the tooltip.
      // const cap = document.createElement("span"); cap.textContent = `${p.label === snap.kind ? "✓" : "✗"} ${p.label} ${Math.round(p.confidence * 100)}%`;
      cell.title = `${p.label === snap.kind ? "Right" : "Wrong"}: ${p.label}, ${Math.round(p.pGuard * 100)}% guard (really a ${snap.kind})`;
      const cap = document.createElement("span"); cap.textContent = `${p.label === snap.kind ? "✓" : "✗"} ${p.label === "guard" ? "G" : "C"}`;
      cell.append(c, cap); $("#test-grid").appendChild(cell);
    });
  }
  // threshold: how sure (share of the guard vote) before the drone calls someone a guard
  const thrHint = (t) => t < 0.5 ? { kind: "warn", text: "Calls people guards on a hunch: fewer guards missed, more false alarms that bring guards over." }
    : t >= 0.7 ? { kind: "bad", text: "Only calls a guard when very sure: fewer false alarms, but some guards slip through with no cone." }
    : { kind: "good", text: "Balanced: the majority of the vote decides." };
  const showThr = () => { $("#v-thr").textContent = `${Math.round(threshold * 100)}%`; const h = thrHint(threshold), el = $("#h-thr"); el.textContent = (h.kind === "good" ? "✓ " : "⚠ ") + h.text; el.dataset.kind = h.kind; };
  $("#r-thr").value = threshold; showThr();
  $("#r-thr").addEventListener("input", () => { threshold = Number($("#r-thr").value); showThr(); if (model) { model.threshold = threshold; evaluate(); } });

  $("#lab-train").addEventListener("click", trainModel);
  $("#lab-clear").addEventListener("click", () => { labels.fill(null); model = null; $("#lab-go").disabled = true; $("#lab-results").classList.add("hidden"); $("#lab-warn").classList.add("hidden"); refresh(); });
  $("#lab-go").addEventListener("click", () => onDone({ model, report }));
  $("#lab-skip").addEventListener("click", () => onDone({ model: null, report: { labelled: 0, testAccuracy: 0, warnings: ["No model trained"] } }));
  $("#lab-back").addEventListener("click", onBack);
  refresh();
  const setThreshold = (t) => { $("#r-thr").value = t; $("#r-thr").dispatchEvent(new Event("input")); };
  return { train, test, labels, setLabel, trainModel, setThreshold, get model() { return model; }, get report() { return report; } };
}
