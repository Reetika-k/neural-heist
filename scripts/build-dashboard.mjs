#!/usr/bin/env node
// Build reports/dashboard.html for Neural Heist from the game's own code and recorded files:
//   src/world/*, src/guards/astar.js        missions, rules, and an A* vs BFS comparison on every mission map
//   src/lab/classifier.js + snapshots.js    Mission 1: drone accuracy by number of labels, by k, and with label mistakes
//   src/lab/qlearning.js                    Mission 2: learning curve and reward-design experiments over 20 seeds
//   src/lab/rag.js + public/data/emails.json Mission 3: two-hop retrieval trace and recall by k
//   tests/results/unit-latest.tap           the latest unit-test run (npm run test:tap)
//   docs/test-report.md, docs/challenges.md the recorded browser test table and the problems found
//   docs/screenshots/*.png                  a few screens, embedded
// No dependencies, no network, no browser. Everything is seeded, so every number is reproducible.
// Usage: npm run dashboard   (writes reports/dashboard.html, self-contained)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MISSIONS } from "../src/world/missions.js";
import { MISSION_RULES } from "../src/world/mission.js";
import { parseMap } from "../src/world/map.js";
import { astar, bfs } from "../src/guards/astar.js";
import { GUARD } from "../src/guards/guard.js";
import { DIFFICULTY } from "../src/settings.js";
import { makeSnapshot, labDataset } from "../src/lab/snapshots.js";
import { createClassifier, fit, accuracy } from "../src/lab/classifier.js";
import { createAgent, trainEpisodes, greedyPath, shortestSafe, movingAverage, DEFAULT_REWARDS, HYPER } from "../src/lab/qlearning.js";
import { buildIndex, multiHop, recall, VAULT_QUESTION, RELEVANT } from "../src/lab/rag.js";
import { mulberry32 } from "../src/lab/rng.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...parts) => path.join(root, ...parts);
const exists = (f) => fs.existsSync(f);
const read = (f) => (exists(p(f)) ? fs.readFileSync(p(f), "utf8") : "");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pct = (x) => `${Math.round(100 * x)} %`;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

// ---------- 1. guards: A* vs BFS on each mission map ----------

const paths = MISSIONS.map((m) => {
  const map = parseMap(m.rows);
  const goals = [["start → drive", map.drive], ["start → exit", map.exit], ["start → terminal", map.terminal], ["start → console", map.console]].filter(([, g]) => g);
  return goals.map(([label, goal]) => {
    const sa = {}, sb = {};
    const a = astar(map, map.start, goal, sa), b = bfs(map, map.start, goal, sb);
    return { mission: m.name, label, size: `${map.width}×${map.depth}`, aLen: a ? a.length - 1 : null, bLen: b ? b.length - 1 : null, aExp: sa.expanded, bExp: sb.expanded };
  });
}).flat();

// ---------- 2. Mission 1: k-NN classifier ----------

const UNSEEN = 400;
const unseen = Array.from({ length: UNSEEN }, (_, i) => makeSnapshot(i % 2 ? "civilian" : "guard", 5000 + i));
const { train, test } = labDataset();
const trials = 30;
function accWith(nLabels, k = 3, mistakes = 0) {
  const accs = [];
  for (let t = 0; t < trials; t++) {
    const rng = mulberry32(900 + t * 31 + nLabels);
    const pick = [...train].sort(() => rng() - 0.5).slice(0, nLabels);
    const flip = new Set(pick.slice(0, mistakes));
    const labelled = pick.map((s) => ({ snapshot: s, label: flip.has(s) ? (s.kind === "guard" ? "civilian" : "guard") : s.kind }));
    accs.push(accuracy(fit(createClassifier(k), labelled), unseen));
    if (nLabels === train.length && mistakes === 0) break; // the full set has only one subset
  }
  return mean(accs);
}
const labelCounts = [2, 4, 6, 10, 15, 20, 30].map((n) => ({ n, acc: accWith(n) }));
const kValues = [1, 3, 5, 7].map((k) => ({ k, acc: accWith(30, k) }));
const noise = [0, 3, 6, 9].map((m) => ({ m, acc: accWith(30, 3, m) }));
const fullModel = fit(createClassifier(3), train.map((s) => ({ snapshot: s, label: s.kind })));
const labTestAcc = accuracy(fullModel, test);

// ---------- 3. Mission 2: Q-learning ----------

const SEEDS = 20;
const shortest = shortestSafe();
function qExperiment(name, rewards) {
  const runs = Array.from({ length: SEEDS }, (_, i) => { const ag = createAgent({ rewards, seed: i + 1 }); trainEpisodes(ag, ag.episodes); return { ag, g: greedyPath(ag) }; });
  const out = { goal: 0, laser: 0, loop: 0 };
  runs.forEach((r) => out[r.g.outcome]++);
  const lens = runs.filter((r) => r.g.outcome === "goal").map((r) => r.g.path.length - 1);
  return { name, rewards, ...out, meanLen: lens.length ? mean(lens) : null, optimal: lens.filter((l) => l === shortest).length, curve: runs[0].ag.history };
}
const qRuns = [
  qExperiment("sensible (default)", DEFAULT_REWARDS),
  qExperiment("laser rewarded +5", { ...DEFAULT_REWARDS, laser: 5 }),
  qExperiment("no step penalty", { ...DEFAULT_REWARDS, step: 0 }),
  qExperiment("weak laser penalty −1", { ...DEFAULT_REWARDS, laser: -1 }),
];

// ---------- 4. Mission 3: RAG ----------

const emails = JSON.parse(read("public/data/emails.json") || "[]");
const index = buildIndex(emails);
const trace = multiHop(index, VAULT_QUESTION, 3);
const recallByK = [1, 2, 3, 4, 5].map((k) => ({ k, r: recall(multiHop(index, VAULT_QUESTION, k).context, RELEVANT) }));
const recallByChunk = [1, 2, 3, 4].map((c) => ({ c, r: recall(multiHop(buildIndex(emails, { chunkSize: c }), VAULT_QUESTION, 3).context, RELEVANT) }));

// ---------- 5. recorded files ----------

const tapPath = p("tests/results/unit-latest.tap");
let unit = null;
if (exists(tapPath)) {
  const tap = fs.readFileSync(tapPath, "utf8");
  const num = (k) => Number((tap.match(new RegExp(`^# ${k} (\\S+)`, "m")) || [])[1] || 0);
  unit = { tests: num("tests"), pass: num("pass"), fail: num("fail"), ms: Math.round(num("duration_ms")), names: [...tap.matchAll(/^\s*ok \d+ - (.+)$/gm)].map((m) => m[1]).filter((n) => !/\.test\.mjs$/.test(n)), when: fs.statSync(tapPath).mtime.toISOString().slice(0, 16).replace("T", " ") };
}
const report = read("docs/test-report.md");
const summaryRows = [...report.matchAll(/^\| ([^|#][^|]*)\| \*\*([^*]+)\*\*([^|]*)\|$/gm)].map((m) => [m[1].trim(), m[2].trim() + m[3].trim()]);
const playRows = [...report.matchAll(/^\| (\d+) \| ([^|]+)\| ([^|]+)\| ([^|]+)\| ([^|]+)\|$/gm)].map((m) => ({ n: m[1], action: m[2].trim(), expected: m[3].trim(), actual: m[4].trim(), status: m[5].trim() }));
const challenges = read("docs/challenges.md").split(/^## /m).slice(1).map((sec) => ({ title: sec.split("\n")[0].trim(), broke: ((sec.match(/^What broke: (.+)$/m) || [])[1] || sec.split("\n").slice(1).join(" ").trim()).slice(0, 220) }));
const shots = ["03-spotted.png", "08-lab.png", "10-qlab.png", "12-raglab.png", "15-brain.png", "18-look-m3.png"].filter((f) => exists(p("docs/screenshots", f)));
const img = (f) => `<figure><img src="data:image/png;base64,${fs.readFileSync(p("docs/screenshots", f)).toString("base64")}" alt="${esc(f)}"><figcaption>${esc(f)}</figcaption></figure>`;

// ---------- tiny SVG charts ----------

function bars(items, { height = 180, barW = 46, gap = 16, max = 1, fmt = (v) => v, colour = "#29e6ff" } = {}) {
  const w = items.length * (barW + gap) + gap, top = 24, bottom = 34, h = height - top - bottom;
  const rects = items.map((it, i) => {
    const x = gap + i * (barW + gap), bh = Math.max(1, Math.round((it.value / max) * h)), y = top + h - bh;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="5" fill="${it.colour || colour}"/><text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="#e8eeff">${esc(fmt(it.value))}</text><text x="${x + barW / 2}" y="${top + h + 16}" text-anchor="middle" font-size="10" fill="#8a94b8">${esc(it.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${height}" width="${w}" height="${height}" role="img"><rect width="${w}" height="${height}" fill="#161a33" rx="10"/>${rects.join("")}</svg>`;
}
function line(series, { width = 640, height = 220, colour = "#ff3d9a" } = {}) {
  const pad = 36, lo = Math.min(...series), hi = Math.max(...series);
  const X = (i) => pad + (i / (series.length - 1)) * (width - pad * 2), Y = (v) => height - pad - ((v - lo) / (hi - lo || 1)) * (height - pad * 2);
  const d = series.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const zero = lo < 0 && hi > 0 ? `<line x1="${pad}" x2="${width - pad}" y1="${Y(0)}" y2="${Y(0)}" stroke="#3a4170" stroke-dasharray="4 4"/><text x="${pad - 6}" y="${Y(0) + 4}" text-anchor="end" font-size="10" fill="#8a94b8">0</text>` : "";
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"><rect width="${width}" height="${height}" fill="#161a33" rx="10"/>${zero}<path d="${d}" fill="none" stroke="${colour}" stroke-width="2"/><text x="${pad - 6}" y="${Y(hi) + 4}" text-anchor="end" font-size="10" fill="#8a94b8">${hi.toFixed(1)}</text><text x="${pad - 6}" y="${Y(lo) + 4}" text-anchor="end" font-size="10" fill="#8a94b8">${lo.toFixed(1)}</text><text x="${pad}" y="${height - 10}" font-size="10" fill="#8a94b8">episode 1</text><text x="${width - pad}" y="${height - 10}" text-anchor="end" font-size="10" fill="#8a94b8">episode ${series.length}</text></svg>`;
}
const table = (head, rows) => `<div class="scroll"><table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></div>`;
const status = (s) => (/^pass/i.test(s) ? `<span class="ok">${esc(s)}</span>` : /fail/i.test(s) ? `<span class="bad">${esc(s)}</span>` : `<span class="warn">${esc(s)}</span>`);

// ---------- sections ----------

const parts = [];
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
parts.push(`<h1>Neural Heist — Project dashboard</h1><p class="sub">IIT Patna AI/ML capstone, Project 2 · Reetika Kukreja. Missions, guard AI, the three player-trained AI teammates, the unit tests and the recorded browser test. Generated ${stamp}; every figure is computed from the game's own code with fixed seeds or read from recorded files.</p>`);

const def = qRuns[0];
parts.push(`<div class="grid">${[
  ["missions", MISSIONS.length], ["AI teammates you train", 3],
  ["drone accuracy, 30 labels", pct(labelCounts.at(-1).acc)], ["dog reaches goal (sensible rewards)", `${def.goal}/${SEEDS} seeds`],
  ["assistant retrieval recall (k = 3)", pct(recall(trace.context, RELEVANT))], ["unit tests", unit ? `${unit.pass}/${unit.tests}` : "not recorded"],
].map(([k, v]) => `<div class="card stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join("")}</div>`);

// 1 missions
parts.push(`<h2>1. Missions and rules</h2><p>From <code>src/world/missions.js</code> and <code>src/world/mission.js</code>. Score = finish ${MISSION_RULES.points.finish} + stealth ${MISSION_RULES.points.stealth} (never chased) + ${MISSION_RULES.points.perSecondUnderPar} per second under par + up to ${MISSION_RULES.points.ai} for how well your AI did. Stars: finished · never chased · under par. The alarm countdown starts on the first chase and never resets.</p>`
  + table(["#", "mission", "AI concept", "teammate", "map", "guards", "civilians", "par (s)", "alarm (s)", "AI score measured as"], MISSIONS.map((m) => { const map = parseMap(m.rows); return [m.id, esc(m.name), esc(m.concept), esc(m.teammate), `${map.width}×${map.depth}`, m.guards.length, m.civilians.length, m.rules.parTime, m.rules.alarmTime, { drone: "drone accuracy on the mission's people", dog: "learned path vs shortest safe path", assistant: "retrieval recall of the 3 clue emails" }[m.teammate]]; })));

// 2 guards
parts.push(`<h2>2. Guard AI</h2><p>Each guard runs a state machine (Patrol → Suspicious → Search → Chase), sees with a ${GUARD.range}-unit, ${Math.round((GUARD.fov * 180) / Math.PI)}° vision cone blocked by walls, and chases with A* (Manhattan heuristic), re-planning every ${GUARD.repathEvery} s. A* returns the same path length as breadth-first search, but expands fewer cells:</p>`
  + table(["mission", "map", "route", "A* length", "BFS length", "A* cells expanded", "BFS cells expanded", "saved"], paths.map((r) => r.aLen == null ? [esc(r.mission), r.size, esc(r.label), "behind the locked door", "—", r.aExp, r.bExp, "—"] : [esc(r.mission), r.size, esc(r.label), r.aLen, r.bLen, r.aExp, r.bExp, r.bExp ? pct(1 - r.aExp / r.bExp) : "—"]))
  + `<p><b>Difficulty</b> (Settings, from <code>src/settings.js</code>):</p>` + table(["level", "vision range", "guard speed", "suspicion fill rate"], Object.values(DIFFICULTY).map((d) => [esc(d.label), d.range, `× ${d.speedMul}`, `× ${d.fillMul}`])));

// 3 classifier
parts.push(`<h2>3. Mission 1 — drone image classifier (k-nearest neighbours)</h2><p>The player labels 32×32 CCTV snapshots as guard or civilian; the drone stores them and classifies new people by their 3 nearest neighbours. Measured on ${UNSEEN} unseen snapshots, averaged over ${trials} random label subsets. With all 30 lab images labelled correctly, the lab's own 10 held-back images score ${pct(labTestAcc)}.</p>`
  + `<div class="row"><div>${bars(labelCounts.map((x) => ({ label: `${x.n} labels`, value: x.acc })), { max: 1, fmt: pct, barW: 52 })}<p class="muted">Accuracy by number of labelled images (k = 3).</p></div>`
  + `<div>${bars(kValues.map((x) => ({ label: `k = ${x.k}`, value: x.acc, colour: x.k === 3 ? "#29e6ff" : "#5b6699" })), { max: 1, fmt: pct })}<p class="muted">Accuracy by k, 30 labels. The game uses k = 3: one neighbour can score about the same, but a single mislabelled image then decides every look-alike.</p></div>`
  + `<div>${bars(noise.map((x) => ({ label: `${x.m} wrong`, value: x.acc, colour: "#ff3d9a" })), { max: 1, fmt: pct })}<p class="muted">Accuracy when some of the 30 labels are wrong.</p></div></div>`
  + `<p>The lab warns below 10 labels (overfitting) and when only one class is labelled. A known limitation: with k = 3 the vote-share confidence is overconfident (see challenges).</p>`);

// 4 Q-learning
parts.push(`<h2>4. Mission 2 — robot dog (tabular Q-learning)</h2><p>A 10×10 laser vault. α = ${HYPER.alpha}, γ = ${HYPER.gamma}, ε from ${HYPER.epsilonStart} to ${HYPER.epsilonEnd}, 1,500 episodes, at most ${HYPER.maxSteps} steps each. The player sets the three rewards; after training the dog follows the greedy policy. Shortest safe path: ${shortest} steps. Each reward design below was trained on ${SEEDS} seeds.</p>`
  + table(["reward design", "goal / laser / step", "reaches goal", "hits a laser", "loops (dog lost)", "mean path (steps)", "shortest path found"], qRuns.map((r) => [esc(r.name), `${r.rewards.goal} / ${r.rewards.laser} / ${r.rewards.step}`, `${r.goal}/${SEEDS}`, r.laser ? `<span class="bad">${r.laser}/${SEEDS}</span>` : `0/${SEEDS}`, r.loop ? `<span class="warn">${r.loop}/${SEEDS}</span>` : `0/${SEEDS}`, r.meanLen ? r.meanLen.toFixed(1) : "—", `${r.optimal}/${SEEDS}`]))
  + `<div class="row"><div>${line(movingAverage(def.curve, 25))}<p class="muted">Learning curve, sensible rewards, seed 1: episode reward, moving average of 25.</p></div></div>`);

// 5 RAG
parts.push(`<h2>5. Mission 3 — hacking assistant (two-hop retrieval + language model)</h2><p>${emails.length} fictional emails split into ${index.chunks.length} chunks of 2 sentences, embedded as TF-IDF vectors (${index.vocabulary} words). The password is spread over three emails (${RELEVANT.join(", ")}), and a retired decoy password sits in another. Hop 1 searches with the question; hop 2 searches with the words of the best hop-1 chunk. The retrieved emails go to a language model (Cloudflare Worker, or the offline fallback).</p>`
  + `<p><b>Trace for "${esc(VAULT_QUESTION)}"</b> (k = 3). Hop-2 query: <code>${esc(trace.hop2Query.slice(0, 160))}${trace.hop2Query.length > 160 ? "…" : ""}</code></p>`
  + table(["hop", "chunk", "subject", "similarity", "clue email?"], [...trace.hop1.map((r) => ["1", r]), ...trace.hop2.map((r) => ["2", r])].map(([h, r]) => [h, esc(r.chunk.id), esc(r.chunk.subject), r.score.toFixed(2), RELEVANT.includes(r.chunk.emailId) ? `<span class="ok">yes</span>` : ""]))
  + `<div class="row"><div>${bars(recallByK.map((x) => ({ label: `k = ${x.k}`, value: x.r })), { max: 1, fmt: pct })}<p class="muted">Recall of the 3 clue emails by k (chunk size 2).</p></div><div>${bars(recallByChunk.map((x) => ({ label: `${x.c} sent.`, value: x.r, colour: "#b26bff" })), { max: 1, fmt: pct })}<p class="muted">Recall by chunk size (k = 3).</p></div></div>`
  + `<p>Recorded with a local model (Ollama): full recall gave the right password, KESTREL37; with k = 1 (recall 67 %) the model invented ROBOTX37. That is why the debrief scores the assistant on retrieval recall.</p>`);

// 6 unit tests
parts.push(`<h2>6. Unit tests (no browser)</h2>`);
parts.push(unit ? `<div class="card"><b>${unit.pass} of ${unit.tests} passed</b>, ${unit.fail} failed, ${unit.ms} ms, run ${esc(unit.when)} UTC (<code>tests/results/unit-latest.tap</code>; regenerate with <code>npm run test:tap</code>).</div><details><summary>All ${unit.names.length} test names</summary><ul>${unit.names.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></details>` : `<p class="muted">No unit-test record: run <code>npm run test:tap</code>.</p>`);

// 7 browser test
parts.push(`<h2>7. Browser test (recorded in docs/test-report.md)</h2>`);
if (summaryRows.length) parts.push(table(["suite", "result"], summaryRows.map(([a, b]) => [esc(a.replace(/`/g, "")), `<b>${esc(b)}</b>`])));
parts.push(playRows.length ? `<p>Headless Chrome drives the real game (<code>npm run test:e2e</code>). The table is quoted from the recorded run; this dashboard does not launch a browser.</p>` + table(["#", "user action", "expected", "actual (recorded)", "status"], playRows.map((r) => [r.n, esc(r.action), esc(r.expected), esc(r.actual.replace(/`/g, "")), status(r.status)])) : `<p class="muted">docs/test-report.md has no test table.</p>`);

// 8 challenges
parts.push(`<h2>8. Problems found and fixed (docs/challenges.md)</h2>`);
parts.push(challenges.length ? table(["problem", "what broke"], challenges.map((c) => [`<b>${esc(c.title)}</b>`, esc(c.broke.replace(/`/g, ""))])) : `<p class="muted">none recorded</p>`);

// 9 screens
parts.push(`<h2>9. Screens</h2><div class="shots">${shots.length ? shots.map(img).join("") : `<p class="muted">No screenshots found.</p>`}</div>`);

// 10 limitations
parts.push(`<h2>10. Limitations</h2><div class="card"><ul>
<li>Classifier, Q-learning and retrieval figures come from seeded scripts with correct labels or fixed rewards, not from real players.</li>
<li>The browser test is quoted from its recorded run; the language-model answer was recorded with a local model, not the deployed Worker.</li>
<li>Gameplay needs a keyboard; on a phone only the menus and labs are usable.</li>
<li>The public URL is added once the game is deployed (docs/DEPLOYMENT.md).</li>
</ul></div>`);
parts.push(`<h2>Reproduce</h2><div class="card"><code>npm test</code> → <code>npm run test:tap</code> (records the unit run) → <code>npm run dashboard</code> (all experiments run inside the build). This file embeds its figures and screenshots and works offline.</div>`);

// ---------- write ----------

const css = `
body{margin:0;background:#0b0e1f;color:#e8eeff;font:15px/1.55 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif}
main{max-width:1100px;margin:0 auto;padding:32px 16px 60px}
h1{font-size:30px;margin:0 0 4px}h2{font-size:21px;margin:40px 0 10px;border-bottom:1px solid #2a3060;padding-bottom:6px}
.sub{color:#8a94b8;margin:0 0 18px}.card{background:#161a33;border:1px solid #2a3060;border-radius:12px;padding:16px 18px;margin:12px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.stat b{display:block;font-size:22px;color:#29e6ff}
.stat span{color:#8a94b8;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}.row>div{min-width:0;max-width:100%}.row p{margin:2px 0 0;max-width:420px}
.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}figure{margin:0}figcaption{color:#8a94b8;font-size:12px}
img{max-width:100%;height:auto;border-radius:10px;border:1px solid #2a3060}svg{max-width:100%;height:auto;margin:8px 0}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #2a3060;vertical-align:top}
th{color:#8a94b8;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.06em}
.ok{color:#18e0aa;font-weight:700}.bad{color:#ff3d9a;font-weight:700}.warn{color:#ffd23d;font-weight:700}.muted{color:#8a94b8}
code{background:#05070f;padding:2px 6px;border-radius:6px;font-size:13px;word-break:break-word}summary{cursor:pointer;color:#29e6ff}
`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Neural Heist — Project dashboard</title><style>${css}</style></head><body><main>${parts.join("")}</main></body></html>`;
fs.mkdirSync(p("reports"), { recursive: true });
fs.writeFileSync(p("reports/dashboard.html"), html);
console.log(`dashboard: reports/dashboard.html (${(html.length / 1e6).toFixed(2)} MB) · unit ${unit ? `${unit.pass}/${unit.tests}` : "none"} · browser rows ${playRows.length} · challenges ${challenges.length}`);
console.log("classifier by labels:", labelCounts.map((x) => `${x.n}:${pct(x.acc)}`).join(" "), "| by k:", kValues.map((x) => `${x.k}:${pct(x.acc)}`).join(" "), "| noise:", noise.map((x) => `${x.m}:${pct(x.acc)}`).join(" "), "| lab test:", pct(labTestAcc));
console.log("q-learning:", qRuns.map((r) => `${r.name}: goal ${r.goal} laser ${r.laser} loop ${r.loop} optimal ${r.optimal}`).join(" | "), "| shortest", shortest);
console.log("rag recall by k:", recallByK.map((x) => `${x.k}:${pct(x.r)}`).join(" "), "| by chunk:", recallByChunk.map((x) => `${x.c}:${pct(x.r)}`).join(" "));
console.log("paths:", paths.map((r) => `${r.mission} ${r.label} A*${r.aExp}/BFS${r.bExp}`).join(" | "));
