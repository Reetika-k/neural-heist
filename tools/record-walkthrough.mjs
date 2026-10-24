// Records a captioned, silent gameplay walkthrough of the live game (report section 15).
//   1) Chrome: --headless=new --mute-audio --remote-debugging-port=9337 --remote-allow-origins=*
//   2) node tools/record-walkthrough.mjs [url] [out.mp4]      (needs ffmpeg)
// The real game is played through the Chrome DevTools Protocol: real Labs, real training, the live language model.
// Long walks are cut (the recording pauses while the player is moved), and captions explain each step.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const base = process.argv[2] || "https://reetika-k.github.io/neural-heist/";
const out = path.resolve(process.argv[3] || "public/demo/neural-heist-walkthrough.mp4");
const frames = fs.mkdtempSync(path.join(os.tmpdir(), "nh-walkthrough-"));

const target = await (await fetch(`http://localhost:9337/json/new?${encodeURIComponent(base)}`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
const shots = []; let recording = false, cutPending = false;
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Page.screencastFrame") {
    const { data, metadata, sessionId } = m.params;
    ws.send(JSON.stringify({ id: ++id, method: "Page.screencastFrameAck", params: { sessionId } }));
    if (!recording) return;
    const file = path.join(frames, `f${String(shots.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    shots.push({ file, t: metadata.timestamp, cut: cutPending }); cutPending = false;
  }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || e); return r.result?.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(expr)) return true; await sleep(100); } throw new Error(`timed out: ${expr}`); };
const key = (type, k, code) => send("Input.dispatchKeyEvent", { type, key: k, code, text: type === "keyDown" && k.length === 1 ? k : undefined });
const press = async (k, code) => { await key("keyDown", k, code); await key("keyUp", k, code); };
const hold = async (k, code, ms) => { await key("keyDown", k, code); await sleep(ms); await key("keyUp", k, code); };
const S = "window.__heist.state";
const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click()`);

// on-screen caption (exists only in the recording)
const caption = (text) => js(`(() => { let c = document.querySelector("#demo-caption"); if (!c) { c = document.createElement("div"); c.id = "demo-caption"; c.style.cssText = "position:fixed;left:50%;bottom:26px;transform:translateX(-50%);max-width:880px;padding:12px 20px;border-radius:12px;background:rgba(6,10,28,.88);border:1px solid rgba(41,230,255,.55);color:#e9f6ff;font:600 19px/1.35 Inter,system-ui,sans-serif;text-align:center;z-index:99999;box-shadow:0 8px 30px rgba(0,0,0,.5);pointer-events:none"; document.body.appendChild(c); } c.textContent = ${JSON.stringify(text)}; c.style.display = ${JSON.stringify(text ? "block" : "none")}; })()`);
const card = (html) => js(`(() => { let c = document.querySelector("#demo-card"); if (!c) { c = document.createElement("div"); c.id = "demo-card"; c.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(circle at 50% 40%,#1b1450,#05071a 70%);color:#fff;font:600 22px/1.4 Inter,system-ui,sans-serif;text-align:center;z-index:100000"; document.body.appendChild(c); } c.innerHTML = ${JSON.stringify(html)}; c.style.display = ${JSON.stringify(html ? "flex" : "none")}; })()`);
/** Move the player without filming the walk: the video jumps straight to the destination. */
const cutTo = async (x, z, settle = 400) => { recording = false; await js(`${S}.pos = { x: ${x}, z: ${z} }`); await sleep(settle); cutPending = true; recording = true; };

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await waitFor("!!window.__heist", 30000);
await js(`localStorage.clear(); localStorage.setItem("neural-heist.guide", JSON.stringify({ 1: 1, 2: 1, 3: 1 }))`);
await send("Page.reload"); await sleep(2000); await waitFor("!!window.__heist", 30000);
await send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
recording = true;

try {
  // ---------- title ----------
  await card(`<div style="font-size:15px;letter-spacing:.25em;color:#7fe9ff">GAMEPLAY WALKTHROUGH</div><div style="font:800 64px/1 Orbitron,system-ui;color:#29e6ff;letter-spacing:.06em">NEURAL HEIST</div><div>Train your own AI teammates, then trust them with the job</div><div style="font-size:15px;color:#b8bfe6">Recorded on the live site · ${base}</div>`);
  await sleep(4000); await card("");
  await caption("Three missions. Each needs one AI skill that you train yourself in a Lab before playing.");
  await sleep(4000);
  await click("#btn-start"); await waitFor(`${S}.screen === "briefing"`);
  await caption("Mission 1: guards and night-shift staff look alike. Teach the drone to tell them apart.");
  await sleep(4500);

  // ---------- Mission 1 Lab: image classification ----------
  await click("#btn-brief-lab"); await waitFor(`${S}.screen === "lab" && !!document.querySelector(".snap-card")`);
  await caption("Label 30 camera snapshots: click once for Guard, twice for Civilian.");
  const kinds = await js(`${S}.lab.train.map(s => s.kind)`);
  for (let i = 0; i < kinds.length; i++) {
    await js(`(() => { const c = document.querySelectorAll(".snap-card")[${i}]; c.click(); ${kinds[i] === "civilian" ? "c.click();" : ""} })()`);
    await sleep(110);
  }
  await sleep(800);
  await caption("Train a k-nearest-neighbour classifier. It is tested on 40 photos it has never seen.");
  await click("#lab-train"); await sleep(1500);
  await js(`document.querySelector("#lab-results").scrollIntoView({ block: "start" })`); await sleep(3500);
  await js(`document.querySelector("#r-thr").scrollIntoView({ block: "center" })`);
  await caption("Precision vs recall: a low threshold calls more people guards, so there are more false alarms…");
  await js(`${S}.lab.setThreshold(0.3)`); await sleep(3800);
  await caption("…a high one misses guards. A missed guard has no visible vision cone in the mission.");
  await js(`${S}.lab.setThreshold(0.7)`); await sleep(3800);
  await js(`${S}.lab.setThreshold(0.5)`); await caption("Balanced at 50 %: no guard missed on the test photos."); await sleep(2800);
  await click("#lab-go"); await waitFor(`${S}.screen === "playing"`, 15000);

  // ---------- Mission 1 ----------
  await caption("Arrow keys to move. The drone scans everyone nearby; the guards it recognises show their vision cones.");
  await hold("ArrowRight", "ArrowRight", 1300); await hold("ArrowDown", "ArrowDown", 700); await sleep(2500);
  await caption("The AI Brain panel (Tab) shows every AI's live numbers: here, the drone's predictions.");
  await press("Tab", "Tab"); await sleep(4500); await press("Tab", "Tab"); await sleep(600);
  await caption("Find the data drive…");
  await cutTo(18.5, 11.5); await waitFor(`${S}.mission.hasDrive`, 8000); await sleep(1500);
  await caption("…and reach the exit.");
  await cutTo(1.5, 11.5); await waitFor(`${S}.screen === "debrief"`, 10000);
  await caption("Score = finish + stealth + time bonus + the drone's measured accuracy on every character.");
  await sleep(5500);

  // ---------- Mission 2: reinforcement learning ----------
  await click("#btn-next"); await waitFor(`${S}.screen === "briefing"`);
  await caption("Mission 2: only the robot dog fits through the laser vault.");
  await sleep(3500);
  await click("#btn-brief-lab"); await waitFor(`${S}.screen === "lab" && !!document.querySelector("#q-train")`);
  await click("#q-classic"); await sleep(800);
  await caption("Design the dog's rewards (goal +10, laser −10, each step −0.1) and train it with Q-learning.");
  await sleep(2500);
  await click("#q-train"); await waitFor(`!document.querySelector("#q-go").disabled`, 90000);
  await caption("The arrows are the learned policy: the shortest safe route, 28 steps, around every laser.");
  await sleep(4500);
  await click("#q-go"); await waitFor(`${S}.screen === "playing"`, 15000);
  await caption("The arrow and the glowing beacon lead to the console beside the vault. A guard patrols right past it…");
  await sleep(2500);
  await waitFor(`${S}.guards.find((g) => g.id === "G2").pos.z > 10.2`, 40000); // go while the patrol is at the far end
  await caption("At the console, press E: the dog crosses using exactly the policy it learned.");
  await cutTo(10.5, 7.5, 250); await press("e", "KeyE"); await sleep(1300);
  await caption("…so slip away and hide (Shift to sneak) while the dog works.");
  await key("keyDown", "Shift", "ShiftLeft");
  await cutTo(4.5, 12.5);
  await waitFor(`${S}.mission.hasDrive || ${S}.screen !== "playing"`, 45000); await key("keyUp", "Shift", "ShiftLeft");
  if (!(await js(`${S}.mission.hasDrive`))) throw new Error("Mission 2 did not deliver the drive");
  await caption("The dog brings the drive. Now to the exit.");
  await sleep(2000);
  await cutTo(1.5, 14.5); await waitFor(`${S}.screen === "debrief"`, 10000);
  await caption("Path quality 100 %: the dog took the shortest safe route.");
  await sleep(4500);

  // ---------- Mission 3: retrieval-augmented generation ----------
  await click("#btn-next"); await waitFor(`${S}.screen === "briefing"`);
  await caption("Mission 3: the vault password is hidden in pieces across 40 leaked emails.");
  await sleep(3500);
  await click("#btn-brief-lab"); await waitFor(`!!document.querySelector("#rag-build")`);
  await caption("Build the search index (TF-IDF) that the hacking assistant uses to find the clues.");
  await click("#rag-build"); await sleep(4500);
  await caption("With one search hop, only 1 of the 3 clue emails is found: the assistant could not answer.");
  await click('[data-hops="1"]'); await js(`document.querySelector("#rag-summary").scrollIntoView({ block: "center" })`); await sleep(4000);
  await caption("The second hop follows the lead from the best email: 3 of 3 clues found.");
  await click('[data-hops="2"]'); await sleep(4000);
  await click("#rag-go"); await waitFor(`${S}.screen === "playing"`, 15000);
  await caption("At the terminal, the assistant retrieves the emails and asks a real language model (Gemini, live).");
  await cutTo(8.5, 8.5); await press("e", "KeyE");
  await waitFor(`document.querySelector("#terminal").dataset.state === "ready"`, 60000); await sleep(5500);
  await caption("The model only suggests: the player types the password, and the game's code checks it.");
  for (const ch of "KESTREL37") { await js(`document.querySelector("#term-input").value += ${JSON.stringify(ch)}`); await sleep(120); }
  await sleep(600); await js(`document.querySelector("#term-form").requestSubmit()`);
  await waitFor(`${S}.screen === "playing" && ${S}.doorOpen`, 10000); await sleep(1500);
  await caption("Access granted. Grab the last drive…");
  await cutTo(19.5, 8.5); await waitFor(`${S}.mission.hasDrive`, 8000); await sleep(1200);
  await cutTo(1.5, 12.5); await waitFor(`${S}.screen === "debrief"`, 10000);
  await caption("Mission 3 AI score = retrieval recall: how many clue emails the index found.");
  await sleep(4000);
  await click("#btn-next"); await waitFor(`${S}.screen === "complete"`, 10000);
  await caption("Heist complete: three AI skills, each trained by the player.");
  await sleep(4500); await caption("");

  // ---------- end ----------
  await card(`<div style="font:800 46px/1 Orbitron,system-ui;color:#29e6ff">NEURAL HEIST</div><div>Play: reetika-k.github.io/neural-heist</div><div>Dashboard: reetika-k.github.io/neural-heist/dashboard.html</div><div style="font-size:16px;color:#b8bfe6">Image classification · Reinforcement learning · Retrieval-augmented generation with a live LLM</div>`);
  await sleep(4500);
} catch (e) {
  console.log("state at failure:", await js(`JSON.stringify({ screen: ${S}.screen, dog: ${S}.dog?.status, plan: ${S}.dog?.plan?.outcome, pos: ${S}.pos, caughtBy: ${S}.caughtBy, reason: ${S}.mission?.reason })`).catch(() => "?"));
  throw e;
} finally {
  recording = false;
  await send("Page.stopScreencast");
  await fetch(`http://localhost:9337/json/close/${target.id}`).catch(() => {});
  ws.close();
}

// frames → video: each frame lasts until the next one; across a cut, the jump is shown as a quick 0.25 s step
const list = [];
for (let i = 0; i < shots.length; i++) {
  const next = shots[i + 1];
  const d = next ? (next.cut ? 0.25 : Math.min(next.t - shots[i].t, 30)) : 1;
  list.push(`file '${shots[i].file}'`, `duration ${Math.max(d, 0.02).toFixed(3)}`);
}
list.push(`file '${shots.at(-1).file}'`);
fs.writeFileSync(path.join(frames, "list.txt"), list.join("\n"));
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(frames, "list.txt"),
  "-vf", "fps=20,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
  "-c:v", "libx264", "-crf", "27", "-preset", "slow", "-movflags", "+faststart", out]);
const secs = shots.length ? (shots.at(-1).t - shots[0].t) : 0;
console.log(`walkthrough: ${path.relative(process.cwd(), out)} · ${shots.length} frames · ~${Math.round(secs)} s of wall time · ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
fs.rmSync(frames, { recursive: true, force: true });
process.exit(0);
