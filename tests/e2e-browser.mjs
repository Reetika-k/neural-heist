// Browser test via Chrome DevTools Protocol (no dependencies).
// 1) npm run dev   2) Chrome --headless=new --remote-debugging-port=9337 --remote-allow-origins=*
// 3) node tests/e2e-browser.mjs [url]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const base = process.argv[2] || "http://localhost:5173/";
const target = await (await fetch(`http://localhost:9337/json/new?${encodeURIComponent(base)}`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; const tm = setTimeout(() => { pending.delete(i); res({}); }, 30000); pending.set(i, (m) => { clearTimeout(tm); res(m); }); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result?.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = async (type, k, code) => send("Input.dispatchKeyEvent", { type, key: k, code });
const hold = async (k, code, ms) => { await key("keyDown", k, code); await sleep(ms); await key("keyUp", k, code); };
const press = async (k, code) => { await key("keyDown", k, code); await key("keyUp", k, code); };
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); if (r.result) fs.writeFileSync(`docs/screenshots/${name}`, Buffer.from(r.result.data, "base64")); };
const waitFor = async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(expr)) return true; await sleep(100); } return false; };
// Hold a key until a condition holds (or a timeout), then optionally keep holding a little longer.
// Checks wait for outcomes instead of fixed windows, so a slow or busy machine does not fail them.
const holdUntil = async (k, code, cond, maxMs = 8000, extraMs = 0) => { await key("keyDown", k, code); await waitFor(cond, maxMs); if (extraMs) await sleep(extraMs); await key("keyUp", k, code); };
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const S = "window.__heist.state";
const park = `${S}.guards.forEach(g => { g.patrol = [g.patrol[0]]; g.pos = { x: g.patrol[0].x + 0.5, z: g.patrol[0].z + 0.5 }; g.path = []; g.facing = -Math.PI / 2; g.state = "patrol"; g.suspicion = 0; g.patrol = [{ x: 17, z: 1 }]; g.pos = { x: 17.5, z: 1.5 }; })`;

await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await waitFor("!!window.__heist", 30000);
await js(`localStorage.clear(); localStorage.setItem("neural-heist.guide", JSON.stringify({ 1: 1, 2: 1, 3: 1 }))`);

try {
  // ---------- settings, how to play, mute ----------
  check("start screen shows title, Start, How to play and Settings", await js(`document.querySelector(".title").textContent.includes("NEURAL") && !!document.querySelector("#btn-howto") && !!document.querySelector("#btn-settings")`));
  await js(`document.querySelector("#btn-howto").click()`); await sleep(150);
  check("How to play: three steps (briefing, lab, mission), keyboard and phone controls, rules", await js(`${S}.screen === "howto" && document.querySelectorAll(".howto-steps li").length === 3 && document.querySelectorAll(".howto-table tr").length >= 5 && /Phone/.test(document.querySelector(".howto-table").textContent) && document.querySelectorAll(".howto-list li").length >= 3`));
  await js(`document.querySelector("#screen-howto [data-back]").click()`); await sleep(100);
  await js(`document.querySelector("#btn-settings").click()`); await sleep(150);
  await js(`(() => { const f = document.querySelector("#settings-form"); f.difficulty.value = "hard"; f.palette.value = "colorblind"; f.quality.value = "low"; f.muted.checked = true; f.dispatchEvent(new Event("input", { bubbles: true })); })()`); await sleep(150);
  check("Settings apply immediately (hard: guards see 10 units; muted)", await js(`window.__heist.settings.difficulty === "hard" && window.__heist.sound.state.muted && /10 units/.test(document.querySelector("#set-diff-desc").textContent)`));
  await send("Page.reload"); await sleep(1500); await waitFor("!!window.__heist", 30000);
  check("README scenario 10: settings (including mute) persist after reload", await js(`window.__heist.settings.difficulty === "hard" && window.__heist.settings.palette === "colorblind" && window.__heist.sound.state.muted && document.querySelector("#btn-mute").textContent === "🔇"`));
  await press("m", "KeyM"); await sleep(100);
  check("M toggles mute", await js(`!window.__heist.sound.state.muted && document.querySelector("#btn-mute").textContent === "🔊"`));
  check("M says so on screen (sound on / off message)", await js(`!document.querySelector("#sound-toast").classList.contains("hidden") && /Sound on/.test(document.querySelector("#sound-toast").textContent)`));
  await js(`localStorage.clear(); localStorage.setItem("neural-heist.guide", JSON.stringify({ 1: 1, 2: 1, 3: 1 }))`); await send("Page.reload"); await sleep(1500); await waitFor("!!window.__heist");
  check("cleared storage → default settings (normal, high quality)", await js(`window.__heist.settings.difficulty === "normal" && window.__heist.settings.quality === "high"`));

  // ---------- start → briefing → lab ----------
  await js(`document.querySelector("#btn-start").click()`); await sleep(200);
  check("Start → Mission 1 briefing", await js(`${S}.screen === "briefing" && document.querySelector("#brief-title").textContent === "ROOFTOP"`));
  await js(`document.querySelector("#btn-brief-lab").click()`); await sleep(300);
  check("Lab shows 30 snapshots and 0 labelled", await js(`${S}.screen === "lab" && document.querySelectorAll(".snap-card").length === 30 && document.querySelector("#lab-count-u").textContent === "30"`));
  check("Start mission is disabled before training", await js(`document.querySelector("#lab-go").disabled`));

  // README scenario 4: label only 4 images (correctly) and train
  await js(`(() => { const lab = window.__heist.state.lab; [0,1,2,3].forEach(i => { const card = document.querySelectorAll(".snap-card")[i]; card.click(); if (lab.train[i].kind === "civilian") card.click(); }); })()`);
  check("clicking cards labels them (Guard → Civilian)", await js(`document.querySelector("#lab-count-u").textContent === "26"`));
  await js(`document.querySelector("#lab-train").click()`); await sleep(200);
  const few = await js(`({ warn: document.querySelector("#lab-warn").textContent, test: document.querySelector("#lab-test-acc").textContent })`);
  check("4 labels → overfitting warning", /overfit/.test(few.warn), `${few.warn.slice(0, 80)} · test ${few.test}`);

  // README scenario 5: label all 30 correctly and train
  await js(`(() => { const lab = window.__heist.state.lab; lab.train.forEach((s, i) => lab.setLabel(i, s.kind)); })()`);
  await js(`document.querySelector("#lab-train").click()`); await sleep(300);
  const full = await js(`({ warn: !document.querySelector("#lab-warn").classList.contains("hidden"), test: ${S}.lab.report.testAccuracy, cells: document.querySelectorAll(".test-cell").length })`);
  check("30 correct labels → test accuracy ≥ 85%, 10 test results shown, no warning", full.test >= 0.85 && full.cells === 10 && !full.warn, `test ${Math.round(full.test * 100)}%`);
  await shot("08-lab.png");
  await js(`document.querySelector("#lab-go").click()`);
  if (!(await waitFor(`${S}.screen === "playing"`, 10000))) { await js(`document.querySelector("#lab-go")?.click()`); await waitFor(`${S}.screen === "playing"`, 10000); }
  check("Start mission → playing with the trained model", await js(`${S}.screen === "playing" && !!${S}.models.classifier`));

  // ---------- movement ----------
  const p0 = await js(`({...${S}.pos})`);
  await holdUntil("ArrowRight", "ArrowRight", `${S}.pos.x > ${p0.x + 1}`);
  const p1 = await js(`({...${S}.pos})`);
  check("→ moves the player right", p1.x > p0.x + 1, `${p0.x.toFixed(2)} → ${p1.x.toFixed(2)}`);
  await holdUntil("ArrowRight", "ArrowRight", `${S}.pos.x > 8.5`, 15000, 800); // keep pushing into the wall
  const p2 = await js(`({...${S}.pos})`);
  check("player reaches the wall at x=9 and stops", p2.x > 8.5 && p2.x <= 8.7 + 1e-6, `x = ${p2.x.toFixed(2)}`);
  await holdUntil("ArrowDown", "ArrowDown", `${S}.pos.z > ${p2.z + 1}`);
  const p3 = await js(`({...${S}.pos})`);
  check("↓ moves the player down", p3.z > p2.z + 1, `z ${p2.z.toFixed(2)} → ${p3.z.toFixed(2)}`);
  await holdUntil("a", "KeyA", `${S}.pos.x < ${p3.x - 0.5}`);
  const p4 = await js(`({...${S}.pos})`);
  check("WASD still works as a fallback (A moves left)", p4.x < p3.x - 0.5);

  // ---------- drone ----------
  await waitFor(`${S}.drone.detections.size > 0`, 8000);
  check("drone has scanned characters near the player", await js(`${S}.drone.detections.size > 0`), `scanned ${await js(`${S}.drone.detections.size`)}`);
  const det = await js(`[...${S}.drone.detections.values()].map(d => d.id + ":" + d.label + ":" + Math.round(d.confidence*100))`);
  check("drone labels come from the model (label + confidence per character)", det.every((s) => /:(guard|civilian):\d+$/.test(s)), det.join(", "));
  await js(`${S}.pos = { x: 13.5, z: 1.5 }`); await sleep(500);
  await shot("09-drone.png");
  const g1 = await js(`(() => { const d = ${S}.drone.detections.get("G1"); return d ? d.label : "unscanned"; })()`);
  const marked = await js(`document.querySelectorAll(".det-tag").length > 0`);
  check("guard G1 scanned by the drone; tags drawn", g1 !== "unscanned" && marked, `G1 → ${g1}`);

  // ---------- AI Brain panel ----------
  await press("Tab", "Tab"); await sleep(300);
  check("Tab opens the AI Brain panel on the Guards tab with live rows", await js(`document.querySelector("#brain").classList.contains("open") && document.querySelectorAll("#brain [data-guard]").length === 2`));
  await js(`window.__heist.brain.setTab("drone")`); await sleep(100);
  check("Drone tab: test accuracy and per-character predictions with confidence", await js(`/Test accuracy/.test(document.querySelector(".bp-body").textContent) && document.querySelectorAll(".bp-body .bp-table tr").length > 1`));
  await shot("15-brain.png");
  await js(`window.__heist.brain.setTab("run")`); await sleep(100);
  const dl = path.join(os.tmpdir(), "neural-heist-downloads"); fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl, { recursive: true });
  await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dl });
  await js(`document.querySelector("[data-export=json]").click()`); await sleep(400);
  await js(`document.querySelector("[data-export=csv]").click()`); await sleep(800);
  const files = fs.readdirSync(dl);
  const jsonFile = files.find((f) => f.endsWith(".json")), csvFile = files.find((f) => f.endsWith(".csv"));
  const exported = jsonFile ? JSON.parse(fs.readFileSync(`${dl}/${jsonFile}`, "utf8")) : null;
  check("README scenario 12: Export downloads a JSON run file and a CSV event log", !!exported && !!csvFile && exported.events.length > 0 && exported.labReports[1]?.testAccuracy >= 0.85 && fs.readFileSync(`${dl}/${csvFile}`, "utf8").startsWith("t,mission,type,details"), files.join(", "));
  await press("Tab", "Tab"); await sleep(300);
  check("Tab closes the panel", await js(`!document.querySelector("#brain").classList.contains("open")`));

  // ---------- guards ----------
  await js(`window.__heist.restart()`); await sleep(200);
  check("restart: two guards and three civilians", await js(`${S}.guards.length === 2 && ${S}.civilians.length === 3`));
  await js(`${S}.pos = { x: 15.5, z: 1.5 }`); await waitFor(`${S}.guards[0].suspicion > 0 && ["suspicious", "chase"].includes(${S}.guards[0].state)`, 8000);
  const g = await js(`({ state: ${S}.guards[0].state, s: ${S}.guards[0].suspicion })`);
  check("in G1's cone: suspicion rises and G1 turns Suspicious", g.s > 0 && ["suspicious", "chase"].includes(g.state), `state=${g.state} suspicion=${g.s.toFixed(2)}`);
  await waitFor(`${S}.screen === "caught"`, 12000);
  check("standing still: G1 chases and catches → CAUGHT screen", await js(`${S}.screen === "caught" && document.querySelector("#caught-title").textContent === "CAUGHT"`));
  check("CAUGHT screen offers Retrain in Lab", await js(`!!document.querySelector("#btn-caught-lab")`));
  await press("Enter", "Enter"); await sleep(200);
  check("Enter restarts cleanly (player at start, guards reset)", await js(`(() => { const s = ${S}; return s.screen === "playing" && s.pos.x === 1.5 && s.pos.z === 1.5 && s.guards.every(g => g.suspicion === 0 && g.state === "patrol"); })()`));

  // ---------- mission flow ----------
  await js(park);
  await js(`${S}.pos = { x: 1.5, z: 11.5 }`); await sleep(300);
  check("exit is locked without the drive", await js(`${S}.screen === "playing" && !${S}.mission.hasDrive`));
  await js(`${S}.pos = { x: 18.5, z: 11.5 }`); await waitFor(`${S}.mission.hasDrive`, 8000);
  check("walking onto the drive picks it up; objective changes", await js(`${S}.mission.hasDrive && document.querySelector("#hud-objective").textContent === "Reach the exit"`));
  await js(`${S}.pos = { x: 1.5, z: 11.5 }`); await waitFor(`${S}.screen === "debrief"`, 8000);
  const deb = await js(`({ screen: ${S}.screen, stars: document.querySelectorAll("#deb-stars .star.on").length, score: Number(document.querySelector("#deb-score").textContent), ai: document.querySelector("#deb-ai").textContent, best: localStorage.getItem("neural-heist.v2.best.m1") })`);
  check("exit with the drive → debrief with stars, score and drone accuracy", deb.screen === "debrief" && deb.stars >= 2 && /\d+%/.test(deb.ai), JSON.stringify(deb));
  check("best score saved in localStorage", Number(deb.best) === deb.score);
  await shot("06-debrief.png");
  await js(`document.querySelector("#btn-retry").click()`); await sleep(200);
  check("Retry starts a fresh mission", await js(`${S}.screen === "playing" && !${S}.mission.hasDrive && ${S}.mission.time < 1`));
  await js(park); await js(`${S}.mission.alarm = 0.05`); await waitFor(`${S}.screen === "caught"`, 8000);
  check("alarm reaching 0 → LOCKDOWN with best score", await js(`${S}.screen === "caught" && document.querySelector("#caught-title").textContent === "LOCKDOWN" && Number(document.querySelector("#caught-best").textContent) > 0`));

  // ---------- without a model ----------
  await js(`document.querySelector("#btn-caught-lab").click()`); await sleep(300);
  await js(`document.querySelector("#lab-skip").click()`); await sleep(300);
  await js(`${S}.pos = { x: 13.5, z: 1.5 }`); await sleep(500);
  check("no model: drone marks no guards and their cones stay hidden", await js(`${S}.guards.every(g => ${S}.drone.detections.get(g.id)?.label !== "guard")`));
  // ---------- Mission 2: Q-learning lab and robot dog ----------
  const parkAt = (x, z) => `${S}.guards.forEach(g => { g.patrol = [{ x: ${x}, z: ${z} }]; g.pos = { x: ${x + 0.5}, z: ${z + 0.5} }; g.path = []; g.facing = 0; g.state = "patrol"; g.suspicion = 0; })`;
  await js(`window.__heist.openBriefing(1)`); await sleep(200);
  check("Mission 2 briefing: LASER VAULT", await js(`${S}.screen === "briefing" && document.querySelector("#brief-title").textContent === "LASER VAULT"`));
  await js(`document.querySelector("#btn-brief-lab").click()`); await sleep(300);
  check("Q-learning Lab: grid, three reward sliders, chart", await js(`${S}.screen === "lab" && !!document.querySelector("#q-grid") && document.querySelectorAll(".slider input").length >= 4 && !!document.querySelector("#q-chart")`));
  // a first visit gets a fresh random vault; the checks below use the Classic vault, whose numbers are known (28 steps)
  check("first visit to the Lab: a fresh random vault with its shortest route shown", await js(`/^Vault #\\d+$/.test(document.querySelector("#q-vault-label").textContent) && Number(document.querySelector("#q-shortest").textContent) >= 22`), await js(`document.querySelector("#q-vault-label").textContent`));
  await js(`${S}.lab.setVault("classic")`);
  check("Classic button: the original vault, shortest route 28", await js(`document.querySelector("#q-vault-label").textContent === "Classic vault" && document.querySelector("#q-shortest").textContent === "28"`));
  await js(`document.querySelector("#q-train").click()`); await waitFor(`Number(document.querySelector("#q-ep").textContent) > 0 && Number(document.querySelector("#q-eps").textContent) < 1`, 10000);
  const live = await js(`({ ep: Number(document.querySelector("#q-ep").textContent), eps: Number(document.querySelector("#q-eps").textContent) })`);
  check("Train runs Q-learning live (episodes rise, epsilon falls)", live.ep > 0 && live.eps < 1, JSON.stringify(live));
  await waitFor(`!document.querySelector("#q-verdict").classList.contains("hidden")`, 15000);
  await shot("10-qlab.png");
  // README scenario 6: positive reward for lasers
  await js(`${S}.lab.setRewards({ goal: 10, laser: 5, step: -0.1 })`);
  const badV = await js(`${S}.lab.trainNow(1).outcome`);
  check("laser reward +5 → learned path hits a laser (verdict shown)", badV === "laser" && /laser/.test(await js(`document.querySelector("#q-verdict").textContent`)));
  check("the Lab explains why: the laser hint warns, the verdict gives a reason and a fix", await js(`/prize/.test(document.querySelector("#h-laser").textContent) && /Why:.*rewarded lasers/.test(document.querySelector("#q-verdict").textContent) && /Try:/.test(document.querySelector("#q-verdict").textContent)`));
  await js(`${S}.lab.setOptions({ batteries: true }); ${S}.lab.setRewards({ goal: 10, laser: -10, step: -0.1, battery: 1 })`);
  const bat = await js(`(() => { const g = ${S}.lab.trainNow(1); return { steps: g.path.length - 1, batteries: g.batteries, verdict: document.querySelector("#q-verdict").textContent, challenge: document.querySelector("#q-challenge").textContent }; })()`);
  check("batteries worth +1: the dog grabs both (38 steps) and the Lab explains the detour; the training challenge records the run", bat.steps === 38 && bat.batteries === 2 && /grabs 2 batteries/.test(bat.verdict) && /found a route after/.test(bat.challenge), JSON.stringify({ steps: bat.steps, batteries: bat.batteries }));
  await js(`document.querySelector('[data-view="value"]').click()`); await sleep(100);
  check("views: 'What it learned' and 'Where it explored' explain themselves", await js(`/expects from each square/.test(document.querySelector("#q-view-note").textContent)`) && await js(`(() => { document.querySelector('[data-view="visits"]').click(); return /practising/.test(document.querySelector("#q-view-note").textContent); })()`));
  await js(`document.querySelector('[data-view="arrows"]').click(); document.querySelector("#q-new").click()`); await sleep(200);
  check("New vault after training: the old dog's route is replayed and the Lab says it must retrain", await js(`/This dog learned Classic vault/.test(document.querySelector("#q-verdict").textContent) && document.querySelector("#q-go").disabled`));
  await js(`${S}.lab.setVault("classic"); ${S}.lab.setOptions({ batteries: false })`);
  await js(`document.querySelector('[data-preset="lazy"]').click()`); await sleep(100);
  check("ready-made setting 'Lazy dog' sets the step reward to 0 and warns about it", await js(`document.querySelector("#r-step").value === "0" && /no reason to hurry/.test(document.querySelector("#h-step").textContent) && /Lazy dog/.test(document.querySelector("#q-preset-note").textContent)`));
  await js(`${S}.lab.setRewards({ goal: 10, laser: 5, step: -0.1 }); ${S}.lab.trainNow(1)`); // back to the laser-rewarded dog for the next steps
  await js(`document.querySelector("#q-go").click()`); await sleep(300);
  await js(parkAt(21, 14));
  check("Mission 2 start: an arrow at the screen edge points to the off-screen console", await waitFor(`!document.querySelector("#nav-arrow").classList.contains("hidden")`, 8000));
  await js(`${S}.pos = { x: 11.5, z: 4.5 }`); await waitFor(`!document.querySelector("#hud-tip").classList.contains("hidden")`, 8000);
  check("at the vault wall: tip says only the dog can cross the lasers", await js(`/Only your robot dog can cross/.test(document.querySelector("#hud-tip").textContent)`));
  await js(`${S}.pos = { x: 10.5, z: 7.5 }`); await waitFor(`!document.querySelector("#hud-hint").classList.contains("hidden")`, 8000);
  check("standing at the console shows the E prompt; arrow and tip hide", await js(`!document.querySelector("#hud-hint").classList.contains("hidden") && document.querySelector("#nav-arrow").classList.contains("hidden") && document.querySelector("#hud-tip").classList.contains("hidden")`));
  await press("e", "KeyE"); await waitFor(`${S}.dog?.status === "crossing"`, 5000);
  check("E deploys the dog", await js(`${S}.dog.status === "crossing"`));
  await waitFor(`${S}.screen === "caught"`, 20000);
  check("bad policy: dog trips a laser → alarm → LASER TRIPPED", await js(`document.querySelector("#caught-title").textContent === "LASER TRIPPED" && ${S}.mission.alarm !== null`));
  // README scenario 7: sensible rewards
  await js(`document.querySelector("#btn-caught-lab").click()`); await sleep(300);
  await js(`${S}.lab.setRewards({ goal: 10, laser: -10, step: -0.1 })`);
  const goodV = await js(`${S}.lab.trainNow(1).outcome`);
  check("sensible rewards → learned path reaches the drive", goodV === "goal");
  await js(`document.querySelector("#q-go").click()`); await sleep(300);
  await js(parkAt(21, 14)); await js(`${S}.pos = { x: 10.5, z: 7.5 }`); await waitFor(`!document.querySelector("#hud-hint").classList.contains("hidden")`, 8000);
  await press("e", "KeyE");
  await sleep(2500); await shot("11-dog.png");
  await waitFor(`${S}.mission.hasDrive`, 20000);
  await js(`window.__heist.brain.toggle(true); window.__heist.brain.setTab("dog")`); await sleep(200);
  check("Brain panel, Robot Dog tab: rewards, episodes, reward chart", await js(`/goal 10, laser -10/.test(document.querySelector(".bp-body").textContent) && !!document.querySelector(".bp-chart")`));
  await js(`window.__heist.brain.toggle(false)`);
  check("dog crosses safely and delivers the drive", await js(`${S}.dog.status === "goal" && ${S}.mission.hasDrive && ${S}.mission.alarm === null`));
  await js(parkAt(21, 14)); await js(`${S}.pos = { x: 1.5, z: 14.5 }`); await waitFor(`${S}.screen === "debrief"`, 8000);
  check("exit → Mission 2 debrief with dog path quality 100%", await js(`${S}.screen === "debrief" && document.querySelector("#deb-ai-label").textContent === "Dog path quality" && document.querySelector("#deb-ai").textContent === "100%"`), await js(`document.querySelector("#deb-break").textContent`));

  // ---------- Mission 3: RAG lab, terminal, password ----------
  await js(`document.querySelector("#btn-next").click()`); await sleep(300);
  check("Next → Mission 3 briefing: EXECUTIVE FLOOR", await js(`${S}.screen === "briefing" && document.querySelector("#brief-title").textContent === "EXECUTIVE FLOOR"`));
  await js(`document.querySelector("#btn-brief-lab").click()`);
  await waitFor(`${S}.screen === "lab" && !!document.querySelector("#rag-build")`);
  check("RAG Lab: 40 emails, chunk and k sliders, Start disabled before building", await js(`document.querySelectorAll(".rag-emails p").length === 40 && document.querySelector("#rag-go").disabled`));
  await js(`document.querySelector("#rag-build").click()`); await sleep(100);
  await js(`document.querySelector("#rag-search").click()`); await sleep(200);
  const hits = await js(`[...document.querySelectorAll("#rag-results .hit-head span")].map(s => s.textContent)`);
  check("RAG Lab explains itself: no password typed here; clues found 3 of 3; the assistant would answer KESTREL37", await js(`/You don't type the password here/.test(document.querySelector(".lab-sub").textContent) && /Clues found: 3 of 3/.test(document.querySelector("#rag-summary").textContent) && /KESTREL37/.test(document.querySelector("#rag-summary").textContent) && document.querySelectorAll("#rag-results .clue-badge").length === 3`));
  check("search shows two hops with similarity scores; the rotation email ranks first", hits[0] === "Vault access rotation" && hits.length >= 4, hits.slice(0, 6).join(" | "));
  await shot("12-raglab.png");
  await js(`document.querySelector("#rag-go").click()`); await sleep(300);
  await js(parkAt(20, 1)); await js(`${S}.pos = { x: 8.5, z: 8.5 }`); await sleep(300);
  check("door is locked before hacking", await js(`${S}.map.isBlocked(13, 8) && document.querySelector("#hud-objective").textContent === "Hack the terminal (E)"`));
  await press("e", "KeyE");
  await waitFor(`document.querySelector("#terminal").dataset.state === "ready"`, 180000);
  const term = await js(`({ screen: ${S}.screen, status: document.querySelector("#term-status").textContent, hits: document.querySelectorAll("#term-hits .hit").length, prompt: document.querySelector("#term-prompt").textContent.includes("PASSWORD:"), answer: document.querySelector("#term-answer").textContent.slice(0, 160) })`);
  check("E opens the terminal: retrieved emails, exact prompt and an answer", term.screen === "terminal" && term.hits >= 4 && term.prompt && term.answer.length > 10, `${term.status} · ${term.answer}`);
  const expectLlm = await js(`!!window.__heist.CONFIG.llmUrl`);
  check(expectLlm ? "LLM configured: answer comes from the model" : "no LLM configured: the assistant reasons offline and finds the password", expectLlm ? /answered by/.test(term.status) : /offline reasoning/.test(term.status) && /PASSWORD: KESTREL37/.test(term.answer) && /How I worked it out/.test(term.answer));
  await shot("13-terminal.png");
  await js(`document.querySelector("#term-close").click()`); await sleep(100);
  await js(`window.__heist.brain.toggle(true); window.__heist.brain.setTab("assistant")`); await sleep(200);
  check("Brain panel, Assistant tab: source, latency, recall and per-hop similarity", await js(`/Recall/.test(document.querySelector(".bp-body").textContent) && document.querySelectorAll(".bp-body .bp-table tr").length >= 5`));
  await js(`window.__heist.brain.toggle(false)`);
  await press("e", "KeyE"); await waitFor(`document.querySelector("#terminal").dataset.state === "ready"`, 60000);
  await js(`(() => { const i = document.querySelector("#term-input"); i.value = "ORION12"; document.querySelector("#term-form").requestSubmit(); })()`); await sleep(200);
  check("wrong password (the retired decoy) is denied, 2 attempts left", await js(`/DENIED/.test(document.querySelector("#term-msg").textContent) && ${S}.attempts === 1`));
  await js(`(() => { const i = document.querySelector("#term-input"); i.value = "kestrel 37"; document.querySelector("#term-form").requestSubmit(); })()`); await waitFor(`${S}.screen === "playing"`, 5000);
  check("correct password (case and spaces ignored) opens the door and closes the terminal", await js(`${S}.doorOpen && !${S}.map.isBlocked(13, 8) && ${S}.screen === "playing"`));
  await js(parkAt(20, 1)); await js(`${S}.pos = { x: 19.5, z: 8.5 }`); await waitFor(`${S}.mission.hasDrive`, 8000);
  check("drive inside the opened room can be picked up", await js(`${S}.mission.hasDrive`));
  await js(`${S}.pos = { x: 1.5, z: 12.5 }`); await waitFor(`${S}.screen === "debrief"`, 8000);
  check("exit → Mission 3 debrief with retrieval recall 100%", await js(`${S}.screen === "debrief" && document.querySelector("#deb-ai-label").textContent === "Retrieval recall" && document.querySelector("#deb-ai").textContent === "100%"`));
  await js(`document.querySelector("#btn-next").click()`); await sleep(300);
  check("Finish → HEIST COMPLETE with a total of all best scores", await js(`${S}.screen === "complete" && Number(document.querySelector("#complete-total").textContent) > 0 && document.querySelectorAll("#complete-list li").length === 3`));
  await shot("14-complete.png");
  // three wrong passwords → alarm
  await js(`window.__heist.openBriefing(2)`); await sleep(200); await js(`window.__heist.restart()`); await sleep(200);
  await js(parkAt(20, 1)); await js(`${S}.pos = { x: 8.5, z: 8.5 }`); await press("e", "KeyE");
  await waitFor(`document.querySelector("#terminal").dataset.state === "ready"`, 180000);
  for (const g of ["AAA", "BBB", "CCC"]) { await js(`(() => { const i = document.querySelector("#term-input"); i.value = "${g}"; document.querySelector("#term-form").requestSubmit(); })()`); await sleep(150); }
  await waitFor(`${S}.mission.alarm !== null && ${S}.screen === "playing"`, 5000);
  check("three wrong passwords → alarm triggered", await js(`${S}.mission.alarm !== null && ${S}.screen === "playing"`));
  await press("e", "KeyE"); await waitFor(`document.querySelector("#terminal").dataset.state === "ready"`, 60000);
  check("after three wrong passwords the terminal stays locked (no negative count)", await js(`document.querySelector("#term-input").disabled && document.querySelector("#term-attempts").textContent === "Terminal locked"`), await js(`document.querySelector("#term-attempts").textContent`));
  await js(`(() => { const i = document.querySelector("#term-input"); i.disabled = false; i.value = "KESTREL37"; document.querySelector("#term-form").requestSubmit(); })()`); await sleep(300);
  check("a locked terminal refuses even the right password", await js(`!${S}.doorOpen && ${S}.map.isBlocked(13, 8)`));
  await js(`document.querySelector("#term-close").click()`); await sleep(100);

  // ---------- first-play guide (added after playtesting) ----------
  await js(`localStorage.removeItem("neural-heist.guide"); window.__heist.openBriefing(0)`); await sleep(200);
  await js(`document.querySelector("#btn-brief-lab").click()`); await waitFor(`${S}.screen === "lab"`, 8000);
  await js(`document.querySelector("#lab-skip").click()`); await waitFor(`${S}.screen === "playing"`, 8000);
  check("first play of a mission opens the guide (step 1 explains how to move)", await waitFor(`!document.querySelector("#guide").classList.contains("hidden") && /Move/.test(document.querySelector("#guide-text").textContent)`, 8000), await js(`document.querySelector("#guide-count").textContent`));
  const gp0 = await js(`({ ...${S}.pos })`);
  await key("keyDown", "ArrowRight", "ArrowRight"); await sleep(1500); await key("keyUp", "ArrowRight", "ArrowRight");
  const gp1 = await js(`({ ...${S}.pos })`);
  check("the mission is paused while the guide is open", gp1.x === gp0.x && gp1.z === gp0.z, `${gp0.x} → ${gp1.x}`);
  for (let i = 0; i < 4; i++) { await press("Enter", "Enter"); await sleep(150); }
  check("Enter steps through the guide and closes it; it is remembered", await js(`document.querySelector("#guide").classList.contains("hidden") && JSON.parse(localStorage.getItem("neural-heist.guide") || "{}")[1] === 1`));
  await js(`document.querySelector("#btn-help").click()`); await sleep(150);
  check("the ? button shows the guide again", await js(`!document.querySelector("#guide").classList.contains("hidden")`));
  await js(`document.querySelector("#guide-skip").click()`); await sleep(100);
  check("objective arrow points to the data drive in Mission 1", await waitFor(`document.querySelector("#nav-text").textContent === "DATA DRIVE" || document.querySelector("#nav-arrow").classList.contains("hidden")`, 5000), await js(`document.querySelector("#nav-text").textContent`));

  // RETIRED 2026-10-24: Esc used to quit to the menu; it now pauses.
  // await press("Escape", "Escape"); await js(`document.querySelector("#btn-menu")?.click()`); await sleep(200);
  // check("Main menu returns to the start screen", await js(`${S}.screen === "start"`));
  await press("Escape", "Escape"); await sleep(200);
  const pp0 = await js(`({ ...${S}.pos, t: ${S}.mission.time })`);
  await key("keyDown", "ArrowRight", "ArrowRight"); await sleep(1000); await key("keyUp", "ArrowRight", "ArrowRight");
  const pp1 = await js(`({ ...${S}.pos, t: ${S}.mission.time })`);
  check("Esc pauses the mission: menu shown, player and clock frozen", await js(`${S}.screen === "paused"`) && pp0.x === pp1.x && pp0.t === pp1.t);
  await press("Escape", "Escape"); await sleep(200);
  check("Esc again resumes", await js(`${S}.screen === "playing"`));
  await js(`document.querySelector("#btn-pause").click()`); await sleep(150);
  check("the pause button opens the same menu", await js(`${S}.screen === "paused"`));
  await js(`document.querySelector("#btn-pause-lab").click()`); await sleep(300);
  check("Pause → Retrain in the Lab opens this mission's Lab", await js(`${S}.screen === "lab"`));
  await js(`window.__heist.restart()`); await waitFor(`${S}.screen === "playing"`); await press("Escape", "Escape"); await sleep(150);
  await js(`document.querySelector("#btn-pause-quit").click()`); await sleep(200);
  check("Pause → Quit returns to the start screen", await js(`${S}.screen === "start"`));
} catch (e) { check("flow completed without exception", false, e.message); }
check("no JavaScript errors", errors.length === 0, errors.join(" | "));
console.log(`\n${results.filter(Boolean).length} / ${results.length} checks passed`);
ws.close(); process.exit(results.every(Boolean) ? 0 : 1);
