// Mission 1 Lab: label camera snapshots, train the k-NN classifier, inspect accuracy on held-back images.
import { labDataset, SNAP } from "../lab/snapshots.js";
import { createClassifier, fit, predict, accuracy, trainingWarnings } from "../lab/classifier.js";

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
  let model = null, report = null;

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
            <p class="fine">Test = 10 held-back snapshots the model never saw. Training accuracy on a k-NN is optimistic; trust the test number.</p>
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
    model = fit(createClassifier(3), labelled);
    // training accuracy is measured against the player's own labels (what the model was told)
    const trainAcc = labelled.filter((e) => predict(model, e.snapshot).label === e.label).length / labelled.length;
    const testAcc = accuracy(model, test);
    report = { labelled: labelled.length, perClass: { guard: labelled.filter((e) => e.label === "guard").length, civilian: labelled.filter((e) => e.label === "civilian").length }, mislabelled: labelled.filter((e) => e.label !== e.snapshot.kind).length, trainAccuracy: trainAcc, testAccuracy: testAcc, warnings, k: model.k };
    $("#lab-results").classList.remove("hidden");
    $("#lab-train-acc").textContent = `${Math.round(trainAcc * 100)}%`;
    $("#lab-test-acc").textContent = `${Math.round(testAcc * 100)}%`;
    $("#lab-test-acc").dataset.good = String(testAcc >= 0.85);
    $("#test-grid").innerHTML = "";
    test.forEach((snap) => {
      const p = predict(model, snap);
      const cell = document.createElement("div"); cell.className = "test-cell"; cell.dataset.correct = String(p.label === snap.kind);
      const c = document.createElement("canvas"); drawInto(c, snap);
      const cap = document.createElement("span"); cap.textContent = `${p.label === snap.kind ? "✓" : "✗"} ${p.label} ${Math.round(p.confidence * 100)}%`;
      cell.append(c, cap); $("#test-grid").appendChild(cell);
    });
    $("#lab-go").disabled = false;
  }

  $("#lab-train").addEventListener("click", trainModel);
  $("#lab-clear").addEventListener("click", () => { labels.fill(null); model = null; $("#lab-go").disabled = true; $("#lab-results").classList.add("hidden"); $("#lab-warn").classList.add("hidden"); refresh(); });
  $("#lab-go").addEventListener("click", () => onDone({ model, report }));
  $("#lab-skip").addEventListener("click", () => onDone({ model: null, report: { labelled: 0, testAccuracy: 0, warnings: ["No model trained"] } }));
  $("#lab-back").addEventListener("click", onBack);
  refresh();
  return { train, test, labels, setLabel, trainModel, get model() { return model; }, get report() { return report; } };
}
