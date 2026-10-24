// README scenario 11: on a phone-size screen the game loads, the menus are usable, and (since 2026-10-23) the game
// is playable with the touch joystick and buttons.
// Usage: node tests/phone-check.mjs [url]  (Chrome on --remote-debugging-port=9337)
const base = process.argv[2] || "http://localhost:5173/";
const target = await (await fetch(`http://localhost:9337/json/new?${encodeURIComponent(base)}`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true });
await send("Page.reload"); await sleep(1500);
for (let i = 0; i < 50 && !(await js("!!window.__heist")); i++) await sleep(100);
// a first-time player (no saved bests), so Start opens the Mission 1 briefing, not mission select
await js(`Object.keys(localStorage).filter(k => k.includes(".best.") || k.includes(".stars.")).forEach(k => localStorage.removeItem(k))`);
const fits = `document.documentElement.scrollWidth <= innerWidth + 1`;
// RETIRED 2026-10-23: only checked the width, so a button cut off below the screen (How to play's "Got it") still passed.
// const visible = (sel) => `(() => { const r = document.querySelector("${sel}").getBoundingClientRect(); return r.width > 40 && r.left >= 0 && r.right <= innerWidth + 1; })()`;
// Reachable = after scrolling to it, fully inside the screen and not covered by anything (what a finger needs).
const visible = (sel) => `(() => { const b = document.querySelector("${sel}"); b.scrollIntoView({ block: "nearest" }); const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.width > 40 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && (hit === b || b.contains(hit)); })()`;
check("start screen fits the phone width; Start visible", await js(fits) && await js(visible("#btn-start")));
await js(`document.querySelector("#btn-howto").click()`); await sleep(150);
check("How to play fits the width, scrolls, and Got it can be reached and tapped", await js(fits) && await js(visible("#screen-howto [data-back]")));
await js(`document.querySelector("#screen-howto [data-back]").click()`); await js(`document.querySelector("#btn-settings").click()`); await sleep(150);
check("Settings fit and controls are reachable", await js(fits) && await js(visible("#screen-settings [data-back]")));
await js(`document.querySelector("#screen-settings [data-back]").click()`); await js(`document.querySelector("#btn-start").click()`); await sleep(200);
check("Briefing fits; Enter the Lab visible", await js(fits) && await js(visible("#btn-brief-lab")));
await js(`document.querySelector("#btn-brief-lab").click()`); await sleep(300);
check("Lab: snapshot grid and Train button usable on a phone", await js(fits) && await js(visible("#lab-train")) && await js(`document.querySelectorAll(".snap-card").length === 30`));
const fs = await import("node:fs");
const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync("docs/screenshots/19-phone-lab.png", Buffer.from(r.result.data, "base64"));
// ---------- playing on a phone (playtesting: "not mobile friendly"; then: no joystick, drag anywhere) ----------
await js(`localStorage.removeItem("neural-heist.guide"); document.querySelector("#lab-skip").click()`);
for (let i = 0; i < 80 && (await js(`window.__heist.state.screen`)) !== "playing"; i++) await sleep(100);
await sleep(800);
check("phone gameplay: no joystick, SNEAK shown, action button hidden away from the console; nothing overflows", await js(fits) && !(await js(`!!document.querySelector("#joy")`)) && await js(visible("#t-sneak")) && await js(`document.querySelector("#t-use").classList.contains("hidden")`));
check("first-play guide explains moving by dragging", await js(`!document.querySelector("#guide").classList.contains("hidden") && /dragging anywhere/.test(document.querySelector("#guide-text").textContent)`));
const g = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync("docs/screenshots/21-phone-guide.png", Buffer.from(g.result.data, "base64"));
for (let i = 0; i < 4; i++) { await js(`document.querySelector("#guide-next").click()`); await sleep(120); }
const parkGuards = `window.__heist.state.guards.forEach(g => { g.patrol = [{ x: 17, z: 1 }]; g.pos = { x: 17.5, z: 1.5 }; g.path = []; g.state = "patrol"; g.suspicion = 0; })`;
const drag = async (x0, y0, x1, y1) => {
  const p0 = await js(`({ ...window.__heist.state.pos })`);
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x1, y: y1 }] });
  await sleep(150);
  const ind = await js(`(() => { const el = document.querySelector("#drag-ind"); const r = el.getBoundingClientRect(); return !el.classList.contains("hidden") && Math.abs(r.left + r.width / 2 - ${x0}) < 3 && Math.abs(r.top + r.height / 2 - ${y0}) < 3; })()`);
  for (let i = 0; i < 60; i++) { const p = await js(`({ ...window.__heist.state.pos })`); if (Math.hypot(p.x - p0.x, p.z - p0.z) > 0.8) break; await sleep(100); }
  const p1 = await js(`({ ...window.__heist.state.pos })`);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(150);
  return { ind, dx: p1.x - p0.x, dz: p1.z - p0.z };
};
// drag up from the middle of the screen: away from the camera, world direction about (-0.6, -0.8)
await js(parkGuards); await js(`window.__heist.state.pos = { x: 11.5, z: 8.5 }`); await sleep(400);
const up = await drag(195, 450, 195, 390);
const g2 = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync("docs/screenshots/22-phone-play.png", Buffer.from(g2.result.data, "base64"));
check("drag up anywhere: a ring appears under the finger and the player moves up the screen", up.ind && up.dz < -0.5 && up.dx <= 0.1, `dx ${up.dx.toFixed(2)}, dz ${up.dz.toFixed(2)}`);
await js(`window.__heist.state.pos = { x: 11.5, z: 8.5 }`); await sleep(400);
const left = await drag(250, 600, 190, 600);
check("drag left anywhere: the player moves left on screen; the ring disappears on release", left.dx < -0.5 && left.dz > 0 && await js(`document.querySelector("#drag-ind").classList.contains("hidden")`), `dx ${left.dx.toFixed(2)}, dz ${left.dz.toFixed(2)}`);
// the E key on a phone: a named button appears only next to the console
await js(`window.__heist.openBriefing(1)`); await sleep(200);
await js(`document.querySelector("#btn-brief-lab").click()`); for (let i = 0; i < 50 && !(await js(`!!document.querySelector("#q-go")`)); i++) await sleep(100);
await js(`window.__heist.state.lab.trainNow(1); document.querySelector("#q-go").click()`); await sleep(800);
for (let i = 0; i < 4; i++) { await js(`document.querySelector("#guide-next")?.click()`); await sleep(120); }
await js(parkGuards.replace("x: 17, z: 1", "x: 21, z: 14").replace("x: 17.5, z: 1.5", "x: 21.5, z: 14.5"));
const hiddenAway = await js(`document.querySelector("#t-use").classList.contains("hidden")`);
await js(`window.__heist.state.pos = { x: 10.5, z: 7.5 }`);
for (let i = 0; i < 40 && (await js(`document.querySelector("#t-use").classList.contains("hidden")`)); i++) await sleep(100);
const label = await js(`document.querySelector("#t-use").textContent`);
check("E on a phone: SEND DOG appears only next to the console", hiddenAway && label === "SEND DOG" && await js(visible("#t-use")), `label "${label}"`);
const b = await js(`(() => { const r = document.querySelector("#t-use").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x, y: b.y }] }); await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(400);
check("tapping SEND DOG sends the dog, and the button goes away", await js(`window.__heist.state.dog.status !== "idle" && document.querySelector("#t-use").classList.contains("hidden")`), await js(`window.__heist.state.dog.status`));
// ---------- pause and mission select on a phone (2026-10-24) ----------
check("pause button (❚❚) can be reached with a finger while playing", await js(visible("#btn-pause")));
await js(`document.querySelector("#btn-pause").click()`); await sleep(200);
check("pause menu fits the phone; Resume reachable", await js(`window.__heist.state.screen === "paused"`) && await js(fits) && await js(visible("#btn-resume")));
fs.writeFileSync("docs/screenshots/29-phone-pause.png", Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
await js(`document.querySelector("#btn-pause-quit").click(); localStorage.setItem("neural-heist.v2.best.m1", "1830"); localStorage.setItem("neural-heist.v2.stars.m1", "3"); document.querySelector("#btn-start").click()`); await sleep(300);
let msOk = false; // retried: the screen fades in, and a tap test during the fade can hit the screen behind
for (let i = 0; i < 20 && !msOk; i++) { msOk = await js(`window.__heist.state.screen === "missions"`) && await js(fits) && await js(visible("#mission-list [data-mission='2']")); if (!msOk) await sleep(100); }
check("mission select fits the phone; Mission 3 Play reachable", msOk);
fs.writeFileSync("docs/screenshots/28-mission-select.png", Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
check("no JavaScript errors", errors.length === 0, errors.join(" | "));
console.log(`\n${results.filter(Boolean).length} / ${results.length} phone checks passed`);
// close this test's tab: left open, finished test tabs kept playing the game's music in the background (2026-10-24)
await fetch(`http://localhost:9337/json/close/${target.id}`).catch(() => {});
ws.close(); process.exit(results.every(Boolean) ? 0 : 1);
