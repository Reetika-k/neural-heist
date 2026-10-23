// Score scenarios: plays the real game in a browser (Chrome on --remote-debugging-port=9337) through many outcomes
// and checks every debrief against the scoring rules, computed independently here:
//   score = 1000 finish + 500 if never chased + 20 per second under par + round(AI × 500); 0 if the mission is lost
//   stars = finished · never chased · under par;   best = highest score per mission (never lowered);
//   Heist Complete total = sum of the three bests;  bests survive a reload.
// Usage: node tests/score-scenarios.mjs [url]
const base = process.argv[2] || "http://localhost:5173/";
const target = await (await fetch(`http://localhost:9337/json/new?${encodeURIComponent(base)}`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(expr)) return true; await sleep(100); } return false; };
const press = async (k, code) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, text: k.length === 1 ? k : undefined }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code }); };
const rows = []; const check = (n, ok, d = "") => { rows.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const S = "window.__heist.state";
const park = (x, z) => js(`${S}.guards.forEach(g => { g.patrol = [{ x: ${x}, z: ${z} }]; g.pos = { x: ${x + 0.5}, z: ${z + 0.5} }; g.path = []; g.state = "patrol"; g.suspicion = 0; g.sees = false; })`);
const PAR = { 1: 35, 2: 45, 3: 50 }; // 2026-10-24: tighter pars; time bonus 10/s capped at 300

/** Reach the exit with the drive at a chosen mission time; returns the debrief as shown, plus the inputs used. */
async function finish(mission, { time, chased = false, exit }) {
  await js(`${S}.mission.time = ${time}; ${S}.mission.spotted = ${chased}; ${S}.pos = { x: ${exit.x}, z: ${exit.z} }`);
  await waitFor(`${S}.screen === "debrief"`, 10000);
  return js(`(() => { const s = ${S}; return { screen: s.screen, t: s.mission.time, spotted: s.mission.spotted, ai: s.result.ai,
    score: Number(document.querySelector("#deb-score").textContent), breakdown: document.querySelector("#deb-break").textContent,
    stars: [1, 2, 3].map(i => document.querySelector("#deb-star-" + i).classList.contains("on")),
    best: Number(document.querySelector("#deb-best").textContent), newBest: !document.querySelector("#deb-newbest").classList.contains("hidden") }; })()`);
}
function expected(mission, d) {
  const timePts = Math.min(300, Math.max(0, Math.round((PAR[mission] - d.t) * 10))), aiPts = Math.round(Math.max(0, Math.min(1, d.ai)) * 500);
  return { score: 1000 + (d.spotted ? 0 : 500) + timePts + aiPts, breakdown: `1000 finish + ${d.spotted ? 0 : 500} stealth + ${timePts} time + ${aiPts} AI`, stars: [true, !d.spotted, d.t <= PAR[mission]] };
}
const verify = (name, mission, d, prevBest) => {
  const e = expected(mission, d);
  check(`${name}: score and breakdown follow the rules`, d.screen === "debrief" && d.score === e.score && d.breakdown === e.breakdown, `${d.score} = ${d.breakdown} (expected ${e.score})`);
  check(`${name}: stars`, JSON.stringify(d.stars) === JSON.stringify(e.stars), d.stars.map((x) => (x ? "★" : "☆")).join(""));
  check(`${name}: best score ${d.score > prevBest ? "raised" : "kept"} (${prevBest} → ${Math.max(prevBest, d.score)})`, d.best === Math.max(prevBest, d.score) && d.newBest === d.score > prevBest);
  return Math.max(prevBest, d.score);
};
const best = { 1: 0, 2: 0, 3: 0 };

await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await waitFor("!!window.__heist", 30000);
await js(`localStorage.clear(); localStorage.setItem("neural-heist.guide", JSON.stringify({ 1: 1, 2: 1, 3: 1 }))`);
await send("Page.reload"); await sleep(1500); await waitFor("!!window.__heist", 30000);

try {
  // ---------- Mission 1: drone ----------
  const startM1 = async (train, threshold = 0.5) => {
    await js(`window.__heist.openBriefing(0)`); await sleep(150); await js(`document.querySelector("#btn-brief-lab").click()`); await waitFor(`${S}.screen === "lab"`);
    if (train) { await js(`(() => { const lab = ${S}.lab; document.querySelectorAll(".snap-card").forEach((c, i) => { c.click(); if (lab.train[i].kind === "civilian") c.click(); }); document.querySelector("#lab-train").click(); })()`); await sleep(200); await js(`${S}.lab.setThreshold(${threshold}); document.querySelector("#lab-go").click()`); }
    else await js(`document.querySelector("#lab-skip").click()`);
    await waitFor(`${S}.screen === "playing"`); await park(17, 1);
  };
  const m1Exit = { x: 1.5, z: 11.5 }, m1Drive = { x: 18.5, z: 11.5 };
  const grab1 = async () => { await js(`${S}.pos = { x: 13.5, z: 1.5 }`); await sleep(700); await js(`${S}.pos = { x: ${m1Drive.x}, z: ${m1Drive.z} }`); await waitFor(`${S}.mission.hasDrive`); };

  await startM1(true); await grab1();
  let d = await finish(1, { time: 20, exit: m1Exit });
  best[1] = verify("M1 trained drone, stealthy, 15 s under par", 1, d, best[1]);
  check("M1 a perfectly trained drone identifies every Rooftop character (100 %, full AI points)", Math.abs(d.ai - 1) < 1e-9, `${Math.round(d.ai * 100)}%`);

  await js(`document.querySelector("#btn-retry").click()`); await waitFor(`${S}.screen === "playing"`); await park(17, 1); await grab1();
  d = await finish(1, { time: 60, chased: true, exit: m1Exit });
  best[1] = verify("M1 replay chased and over par (worse)", 1, d, best[1]);

  await startM1(false); await js(`${S}.pos = { x: ${m1Drive.x}, z: ${m1Drive.z} }`); await waitFor(`${S}.mission.hasDrive`);
  d = await finish(1, { time: 3, exit: m1Exit });
  best[1] = verify("M1 without a model, rushed (AI scores 0)", 1, d, best[1]);
  check("M1 rushed: time bonus capped at 300 (cannot outweigh the AI points)", /\+ 300 time \+/.test(d.breakdown), d.breakdown);
  check("M1 without a model: AI 0 points", d.ai === 0 && /\+ 0 AI$/.test(d.breakdown), d.breakdown);

  // false alarm (2026-10-24): at 30 % sure, the well-trained drone calls one Rooftop civilian a guard; a guard comes to check
  await startM1(true, 0.3);
  let fa = null;
  for (const id of ["C1", "C2", "C3"]) {
    await js(`(() => { const c = ${S}.civilians.find(c => c.id === "${id}"); ${S}.pos = { x: c.pos.x + 0.3, z: c.pos.z + 0.3 }; })()`);
    if (await waitFor(`${S}.runLog.some(e => e.type === "false_alarm")`, 2500)) { fa = await js(`${S}.runLog.find(e => e.type === "false_alarm")`); break; }
  }
  check("M1 at 30 % sure: the drone flags a civilian, a guard leaves its patrol to check, the HUD says why", !!fa && await js(`${S}.guards.find(g => g.id === "${fa?.guard}")?.state !== "patrol"`) && /False alarm/.test(await js(`document.querySelector("#hud-tip").textContent`)), JSON.stringify(fa));

  // a lost mission never scores and never lowers the best
  await js(`document.querySelector("#btn-retry").click()`); await waitFor(`${S}.screen === "playing"`); await park(17, 1);
  await js(`${S}.mission.alarm = 0.05`); await waitFor(`${S}.screen === "caught"`, 10000);
  check("M1 lost to the alarm: LOCKDOWN, best unchanged", await js(`document.querySelector("#caught-title").textContent === "LOCKDOWN"`) && Number(await js(`localStorage.getItem("neural-heist.v2.best.m1")`)) === best[1]);

  // ---------- Mission 2: robot dog ----------
  const startM2 = async (opts, rewards) => {
    await js(`window.__heist.openBriefing(1)`); await sleep(150); await js(`document.querySelector("#btn-brief-lab").click()`); await waitFor(`${S}.screen === "lab"`);
    await js(`${S}.lab.setVault("classic"); ${S}.lab.setOptions(${JSON.stringify(opts)}); ${S}.lab.setRewards(${JSON.stringify(rewards)}); ${S}.lab.trainNow(1); document.querySelector("#q-go").click()`);
    await waitFor(`${S}.screen === "playing"`); await park(21, 14);
    await js(`${S}.pos = { x: 10.5, z: 7.5 }`); await sleep(300); await press("e", "KeyE");
  };
  const m2Exit = { x: 1.5, z: 14.5 };
  await startM2({ batteries: false, blinking: false, slip: 0 }, { goal: 10, laser: -10, step: -0.1 });
  await waitFor(`${S}.mission.hasDrive`, 30000);
  d = await finish(2, { time: 40, exit: m2Exit });
  best[2] = verify("M2 shortest route (28 steps)", 2, d, best[2]);
  check("M2 dog path quality 100 % for the shortest route", Math.abs(d.ai - 1) < 1e-9, `${Math.round(d.ai * 100)}%`);

  await startM2({ batteries: true, blinking: false, slip: 0 }, { goal: 10, laser: -10, step: -0.1, battery: 1 });
  await waitFor(`${S}.mission.hasDrive`, 40000);
  d = await finish(2, { time: 50, exit: m2Exit });
  best[2] = verify("M2 battery detour (38 steps, 2 batteries)", 2, d, best[2]);
  check("M2 batteries: path quality 28/38 + 0.2 = 94 %", Math.abs(d.ai - (28 / 38 + 0.2)) < 1e-9, `${Math.round(d.ai * 100)}%`);

  await startM2({ batteries: false, blinking: false, slip: 0 }, { goal: 10, laser: 5, step: -0.1 });
  await waitFor(`${S}.screen === "caught"`, 30000);
  check("M2 laser-rewarded dog: LASER TRIPPED, no score, best unchanged", await js(`document.querySelector("#caught-title").textContent === "LASER TRIPPED"`) && Number(await js(`localStorage.getItem("neural-heist.v2.best.m2")`)) === best[2]);

  // ---------- Mission 3: hacking assistant ----------
  const startM3 = async (chunk, k) => {
    await js(`window.__heist.openBriefing(2)`); await sleep(150); await js(`document.querySelector("#btn-brief-lab").click()`); await waitFor(`!!document.querySelector("#rag-build")`);
    await js(`${S}.lab.setParams(${chunk}, ${k}); document.querySelector("#rag-build").click()`); await sleep(200); await js(`document.querySelector("#rag-go").click()`);
    await waitFor(`${S}.screen === "playing"`); await park(20, 1);
    await js(`${S}.pos = { x: 8.5, z: 8.5 }`); await sleep(300); await press("e", "KeyE");
    await waitFor(`document.querySelector("#terminal").dataset.state === "ready"`, 60000);
    const relab = await js(`!document.querySelector("#term-relab").classList.contains("hidden")`);
    await js(`(() => { const i = document.querySelector("#term-input"); i.value = "KESTREL37"; document.querySelector("#term-form").requestSubmit(); })()`);
    await waitFor(`${S}.screen === "playing" && ${S}.doorOpen`, 10000);
    await js(`${S}.pos = { x: 19.5, z: 8.5 }`); await waitFor(`${S}.mission.hasDrive`);
    return relab;
  };
  const m3Exit = { x: 1.5, z: 12.5 };
  check("M3 good index: no 'back to the Lab' button at the terminal", (await startM3(2, 3)) === false);
  d = await finish(3, { time: 30, exit: m3Exit });
  best[3] = verify("M3 good index (3 of 3 clues)", 3, d, best[3]);
  check("M3 AI points = retrieval recall 100 %", Math.abs(d.ai - 1) < 1e-9);

  check("M3 weak index: the terminal offers 'Improve the search index (back to the Lab)'", (await startM3(2, 1)) === true);
  d = await finish(3, { time: 30, exit: m3Exit });
  best[3] = verify("M3 weak index (k = 1, 2 of 3 clues)", 3, d, best[3]);
  check("M3 weak index: AI points from recall 67 % (333)", /\+ 333 AI$/.test(d.breakdown), d.breakdown);

  // ---------- Heist complete and persistence ----------
  await js(`document.querySelector("#btn-next").click()`); await waitFor(`${S}.screen === "complete"`);
  const total = Number(await js(`document.querySelector("#complete-total").textContent`));
  const listed = await js(`[...document.querySelectorAll("#complete-list b")].map(b => Number(b.textContent))`);
  check("Heist Complete lists each mission's best and the total is their sum", JSON.stringify(listed) === JSON.stringify([best[1], best[2], best[3]]) && total === best[1] + best[2] + best[3], `${listed.join(" + ")} = ${total}`);
  await send("Page.reload"); await sleep(1500); await waitFor("!!window.__heist", 30000);
  check("best scores survive a page reload", await js(`[1, 2, 3].map(i => Number(localStorage.getItem("neural-heist.v2.best.m" + i)))`).then((b) => JSON.stringify(b) === JSON.stringify([best[1], best[2], best[3]])));
  // mission select (2026-10-24): returning players get the list, every mission open, with best and stars
  await js(`document.querySelector("#btn-start").click()`); await waitFor(`${S}.screen === "missions"`);
  const cards = await js(`[...document.querySelectorAll("#mission-list .mission-item")].map(li => ({ done: li.classList.contains("done"), stats: li.querySelector(".mi-stats").textContent, play: !!li.querySelector("[data-mission]") }))`);
  check("Start opens mission select for a returning player: 3 missions, all playable, each with its best and stars", cards.length === 3 && cards.every((c, i) => c.done && c.play && c.stats.startsWith(`Best ${best[i + 1]}`) && /★/.test(c.stats)), cards.map((c) => c.stats).join(" | "));
  await js(`document.querySelector('#mission-list [data-mission="2"]').click()`); await sleep(200);
  check("mission select opens Mission 3 directly", await js(`${S}.screen === "briefing" && ${S}.config.id === 3`));
} catch (e) { check("scenario run completed without exception", false, e.message); }
check("no JavaScript errors", errors.length === 0, errors.join(" | "));
console.log(`\n${rows.filter(Boolean).length} / ${rows.length} score checks passed`);
ws.close(); process.exit(rows.every(Boolean) ? 0 : 1);
