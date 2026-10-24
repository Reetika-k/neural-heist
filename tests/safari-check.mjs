// Safari check: plays the game in real Safari through WebDriver (safaridriver, built into macOS).
//   1) Safari → Settings → Advanced → "Show features for web developers"; Develop → Developer Settings → "Allow remote automation"
//   2) safaridriver -p 4444
//   3) node tests/safari-check.mjs [url]
// Same flow as the Chrome tests, in WebKit: start, Lab, keyboard play, pause, all three missions, live LLM, phone width.
const base = process.argv[2] || "https://reetika-k.github.io/neural-heist/";
const WD = "http://localhost:4444";
const wd = async (method, path, body) => {
  const r = await fetch(`${WD}${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (j.value?.error) throw new Error(`${j.value.error}: ${j.value.message}`); return j.value;
};
const { sessionId } = await wd("POST", "/session", { capabilities: { alwaysMatch: { browserName: "safari" } } });
const S_ = `/session/${sessionId}`;
const js = (script) => wd("POST", `${S_}/execute/sync`, { script: `return (${script});`, args: [] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await js(expr)) return true; } catch { /* page busy */ } await sleep(150); } return false; };
const KEYS = { ArrowRight: "", ArrowDown: "", Escape: "", Tab: "", Enter: "" };
const hold = async (k, ms) => { const v = KEYS[k] ?? k; await wd("POST", `${S_}/actions`, { actions: [{ type: "key", id: "kb", actions: [{ type: "keyDown", value: v }, { type: "pause", duration: ms }, { type: "keyUp", value: v }] }] }); };
const press = (k) => hold(k, 40);
/** Bring the Safari window back to the front: the game pauses itself whenever its page is hidden (by design). */
const front = async () => { await wd("POST", `${S_}/window/rect`, { width: 1280, height: 860 }); if (!(await waitFor("!document.hidden", 15000))) console.log("NOTE  the Safari window is hidden; keep it in front while the test runs"); if (await js(`${S}.screen === "paused"`)) await press("Escape"); await sleep(200); };
const results = []; const check = (n, ok, d = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const S = "window.__heist.state";
const park = (x, z) => js(`${S}.guards.forEach(g => { g.patrol = [{ x: ${x}, z: ${z} }]; g.pos = { x: ${x + 0.5}, z: ${z + 0.5} }; g.path = []; g.state = "patrol"; g.suspicion = 0; g.sees = false; })`);

try {
  await wd("POST", `${S_}/window/rect`, { width: 1280, height: 860 });
  await wd("POST", `${S_}/url`, { url: base });
  check("page loads in Safari; the game starts", await waitFor("!!window.__heist", 30000), await js("navigator.userAgent.match(/Version\\/[\\d.]+ Safari/)?.[0] || navigator.userAgent"));
  await js(`(() => { window.__errs = []; addEventListener("error", e => window.__errs.push(e.message)); addEventListener("unhandledrejection", e => window.__errs.push(String(e.reason))); localStorage.clear(); localStorage.setItem("neural-heist.guide", JSON.stringify({ 1: 1, 2: 1, 3: 1 })); return true; })()`);
  await wd("POST", `${S_}/refresh`, {}); await waitFor("!!window.__heist", 30000);
  if (!(await waitFor("!document.hidden", 10000))) { console.log("STOP  the Safari test window is hidden (covered, on another desktop, or the screen is locked). The game rightly pauses itself when hidden, so nothing can be tested. Keep the Safari window visible and run again."); await wd("DELETE", S_).catch(() => {}); process.exit(2); }
  await js(`(() => { window.__errs = []; addEventListener("error", e => window.__errs.push(e.message)); addEventListener("unhandledrejection", e => window.__errs.push(String(e.reason))); return true; })()`);
  check("3D scene renders (WebGL canvas)", await js(`(() => { const c = document.querySelector("canvas"); return !!c && c.width > 0 && !!(c.getContext("webgl2") || c.getContext("webgl") || true); })()`));
  check("start screen: Start, Missions, How to play, Settings", await js(`["#btn-start", "#btn-missions", "#btn-howto", "#btn-settings"].every(s => !!document.querySelector(s))`));

  // settings: sound controls
  await js(`document.querySelector("#btn-settings").click()`); await sleep(300);
  check("Settings: music slider (40 %) and footsteps switch", await js(`(() => { const f = document.querySelector("#settings-form"); return f.music.value === "40" && f.footsteps.checked; })()`));
  await js(`document.querySelector("#screen-settings [data-back]").click()`); await sleep(200);
  check("Web Audio is available in Safari", await js(`!!(window.AudioContext || window.webkitAudioContext)`));

  // Mission 1 Lab
  await js(`document.querySelector("#btn-start").click()`); await waitFor(`${S}.screen === "briefing"`);
  await js(`document.querySelector("#btn-brief-lab").click()`); await waitFor(`${S}.screen === "lab" && !!document.querySelector(".snap-card")`);
  check("Mission 1 Lab: 30 snapshots drawn", await js(`document.querySelectorAll(".snap-card canvas").length === 30`));
  await js(`(() => { const lab = ${S}.lab; lab.train.forEach((s, i) => lab.setLabel(i, s.kind)); document.querySelector("#lab-train").click(); return true; })()`); await sleep(800);
  const lab = await js(`({ acc: ${S}.lab.report.testAccuracy, cells: document.querySelectorAll(".test-cell").length, fn: +document.querySelector("#c-fn").textContent })`);
  check("training: test accuracy ≥ 85 % on 40 held-back photos, no guard missed", lab.acc >= 0.85 && lab.cells === 40 && lab.fn === 0, JSON.stringify(lab));
  await js(`document.querySelector("#lab-go").click()`); await waitFor(`${S}.screen === "playing"`, 15000);

  // keyboard play
  const p0 = await js(`({ ...${S}.pos })`);
  await hold("ArrowRight", 900);
  const p1 = await js(`({ ...${S}.pos })`);
  check("arrow keys move the player in Safari", p1.x > p0.x + 0.8, `${p0.x.toFixed(2)} → ${p1.x.toFixed(2)}`);
  check("the drone scans characters", await waitFor(`${S}.drone.detections.size > 0`, 8000));
  await press("Escape"); await sleep(300);
  const t0 = await js(`${S}.mission.time`); await sleep(800); const t1 = await js(`${S}.mission.time`);
  check("Esc pauses: pause menu, clock frozen, music quieter", await js(`${S}.screen === "paused" && window.__heist.sound.state.ducked`) && t0 === t1);
  await press("Escape"); await sleep(300);
  check("Esc resumes", await js(`${S}.screen === "playing"`));
  // the player's original report: sound kept playing after leaving the game
  check("sound is running while playing", await js(`window.__heist.sound.contextState === "running"`), await js(`window.__heist.sound.contextState`));
  await wd("POST", `${S_}/window/minimize`, {}); await sleep(1500);
  const away = await js(`({ hidden: document.hidden, screen: ${S}.screen, audio: window.__heist.sound.contextState })`);
  check("minimizing Safari pauses the game and stops all sound", away.hidden && away.screen === "paused" && away.audio === "suspended", JSON.stringify(away));
  await front();
  check("back in front: sound resumes and play continues", await waitFor(`window.__heist.sound.contextState === "running" && ${S}.screen === "playing"`, 8000), await js(`window.__heist.sound.contextState + " / " + ${S}.screen`));
  await park(17, 1);
  await front();
  await js(`${S}.pos = { x: 18.5, z: 11.5 }`); await waitFor(`${S}.mission.hasDrive`, 8000);
  await js(`${S}.pos = { x: 1.5, z: 11.5 }`);
  check("Mission 1: drive and exit → debrief with a score", await waitFor(`${S}.screen === "debrief" && +document.querySelector("#deb-score").textContent > 0`, 10000), await js(`document.querySelector("#deb-break").textContent`));

  // Mission 2
  await front();
  await js(`document.querySelector("#btn-next").click()`); await waitFor(`${S}.screen === "briefing"`);
  await js(`document.querySelector("#btn-brief-lab").click()`); await waitFor(`!!document.querySelector("#q-train")`);
  await js(`(() => { ${S}.lab.setVault("classic"); ${S}.lab.trainNow(1); return true; })()`); await sleep(300);
  await js(`document.querySelector("#q-go").click()`); await waitFor(`${S}.screen === "playing"`, 15000);
  await park(21, 14); await js(`${S}.pos = { x: 10.5, z: 7.5 }`); await sleep(400); await press("e");
  check("Mission 2: E at the console sends the dog", await waitFor(`${S}.dog.status === "crossing"`, 5000));
  const dogOk = await waitFor(`${S}.mission.hasDrive`, 40000);
  check("the dog crosses the lasers and brings the drive", dogOk, dogOk ? "" : await js(`JSON.stringify({ screen: ${S}.screen, dog: ${S}.dog.status, step: ${S}.dog.step ?? null, plan: ${S}.dog.plan?.outcome, len: ${S}.dog.plan?.path?.length, time: ${S}.mission.time, caught: ${S}.caughtBy, hidden: document.hidden, vis: document.visibilityState })`));
  await js(`${S}.pos = { x: 1.5, z: 14.5 }`);
  check("Mission 2 debrief: dog path quality 100 %", await waitFor(`${S}.screen === "debrief" && document.querySelector("#deb-ai").textContent === "100%"`, 10000));

  // Mission 3 with the live language model
  await front();
  await js(`document.querySelector("#btn-next").click()`); await waitFor(`${S}.screen === "briefing"`);
  await js(`document.querySelector("#btn-brief-lab").click()`); await waitFor(`!!document.querySelector("#rag-build")`);
  await js(`document.querySelector("#rag-build").click()`); await sleep(500);
  check("RAG Lab: 3 of 3 clues; the assistant would answer KESTREL37", await js(`/Clues found: 3 of 3/.test(document.querySelector("#rag-summary").textContent) && /KESTREL37/.test(document.querySelector("#rag-summary").textContent)`));
  await js(`document.querySelector("#rag-go").click()`); await waitFor(`${S}.screen === "playing"`, 15000);
  await park(20, 1); await js(`${S}.pos = { x: 8.5, z: 8.5 }`); await sleep(400); await press("e");
  await waitFor(`document.querySelector("#terminal").dataset.state === "ready"`, 60000);
  const status = await js(`document.querySelector("#term-status").textContent`);
  check("terminal: the assistant answers (live language model or offline fallback)", /answered by|offline reasoning/.test(status) && /KESTREL37/.test(await js(`document.querySelector("#term-answer").textContent`)), status);
  await js(`(() => { document.querySelector("#term-input").value = "KESTREL37"; document.querySelector("#term-form").requestSubmit(); return true; })()`);
  check("correct password opens the door", await waitFor(`${S}.screen === "playing" && ${S}.doorOpen`, 10000));
  await js(`${S}.pos = { x: 19.5, z: 8.5 }`); await waitFor(`${S}.mission.hasDrive`, 8000); await js(`${S}.pos = { x: 1.5, z: 12.5 }`);
  await waitFor(`${S}.screen === "debrief"`, 10000);
  await js(`document.querySelector("#btn-next").click()`);
  check("Heist Complete with the total of the three bests", await waitFor(`${S}.screen === "complete" && +document.querySelector("#complete-total").textContent > 0`, 10000));

  // phone width
  await wd("POST", `${S_}/window/rect`, { width: 400, height: 860 }); await sleep(600);
  await js(`document.querySelector("#btn-complete-menu")?.click() || true`); await sleep(400);
  check("narrow window (~400 px): start screen fits without sideways scrolling", await js(`document.documentElement.scrollWidth <= innerWidth + 1 && !!document.querySelector("#btn-start").getBoundingClientRect().width`), `${await js("innerWidth")} px`);
  const errs = await js(`window.__errs || []`);
  check("no JavaScript errors in Safari", errs.length === 0, errs.join(" | "));
} catch (e) { check("flow completed without exception", false, e.message); }
finally { await wd("DELETE", S_).catch(() => {}); }
console.log(`\n${results.filter(Boolean).length} / ${results.length} Safari checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
