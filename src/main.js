// Game controller: screens (start → briefing → lab → mission → debrief), the mission loop and the HUD.
// Game logic lives in pure modules (map, movement, guards, mission, lab, teammates) so it can be tested
// without a browser; this file only wires input, rendering and UI.
import * as THREE from "three";
import { createScene } from "./engine/scene.js";
import { parseMap } from "./world/map.js";
import { MISSIONS } from "./world/missions.js";
import { buildWorld } from "./world/build.js";
import { createProps } from "./world/props.js";
import { createMission, updateMission, failMission, scoreMission } from "./world/mission.js";
import { createCivilian, updateCivilian } from "./world/civilians.js";
import { createPlayerMesh } from "./player/player.js";
import { animatePerson } from "./engine/people.js";
import { inputVector, step, KEY_TO_DIR, WALK_SPEED, SNEAK_SPEED } from "./player/movement.js";
import { createGuard, updateGuard } from "./guards/guard.js";
import { createGuardView } from "./guards/render.js";
import { makeSnapshot } from "./lab/snapshots.js";
import { createDrone, updateDrone, droneAccuracy, isRevealed, DRONE } from "./teammates/drone.js";
import { createCivilianView, createDroneView, createDetectionTag } from "./teammates/views.js";
import { mountClassifierLab } from "./screens/lab-classifier.js";
import { mountQLab } from "./screens/lab-qlearning.js";
import { createDog, deployDog, updateDog, dogScore } from "./teammates/dog.js";
import { createVaultView } from "./world/vault.js";
import { triggerAlarm } from "./world/mission.js";
import { mountRagLab, renderHits } from "./screens/lab-rag.js";
import { askAssistant, extractPassword } from "./teammates/assistant.js";
import { createTerminalView } from "./world/terminal.js";
import { normalisePassword } from "./lab/rag.js";
import { CONFIG } from "./config.js";
import { createBrainPanel } from "./brain-panel/panel.js";
import { buildExport, eventsToCsv, download } from "./brain-panel/export.js";
import { loadSettings, saveSettings, tuningFor, DIFFICULTY } from "./settings.js";
import { createSound } from "./audio/sound.js";
import { addDecor } from "./world/decor.js";

let EMAILS = null;
const loadEmails = async () => (EMAILS ??= await (await fetch("data/emails.json")).json());

const $ = (s) => document.querySelector(s);
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: keep playing */ } },
};
const bestKey = (id) => `neural-heist.best.m${id}`;
const getBest = (id) => Number(store.get(bestKey(id), 0)) || 0;

const settings = loadSettings();
const sound = createSound({ volume: settings.volume, muted: settings.muted });
// The game needs WebGL (3D graphics in the browser). If the browser has it turned off (hardware acceleration
// disabled, or Chrome's graphics process crashed), say so on the start screen instead of failing silently:
// without this check the renderer threw on load and every button, including Start, stopped responding.
function hasWebGL() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // release the test context straight away
    return !!gl;
  } catch { return false; }
}
if (!hasWebGL()) {
  $("#btn-start").disabled = true;
  $("#no-webgl").classList.remove("hidden");
  throw new Error("Neural Heist needs WebGL, and this browser has it turned off (see the message on the start screen).");
}
const { scene, camera, follow, render, setQuality } = createScene($("#scene"), { quality: settings.quality });
const playerMesh = createPlayerMesh(scene);

const state = {
  screen: "start", missionIndex: 0, config: null, map: null, level: null,
  pos: { x: 1.5, z: 1.5 }, facing: 0, guards: [], civilians: [], mission: null, drone: null,
  models: { classifier: null, agent: null, rag: null }, assist: null, attempts: 0, doorOpen: false, labReports: {}, caughtBy: null, result: null, runLog: [], lab: null,
  dog: null, failTimer: null, failReason: null,
};
const log = (type, detail = {}) => state.runLog.push({ t: Number((state.mission?.time ?? 0).toFixed(2)), mission: state.config?.id ?? 0, type, ...detail });

// ---------- level (everything that belongs to one mission's 3D scene) ----------
function buildLevel(config) {
  if (state.level) { scene.remove(state.level.root); state.level.dispose(); }
  const root = new THREE.Group();
  scene.add(root);
  const map = parseMap(config.rows);
  buildWorld(root, map, { signs: config.signs });
  const decor = addDecor(root, map, { signs: config.signs, seed: config.id });
  const overlay = $("#overlay");
  const props = createProps(root);
  const guardViews = config.guards.map(() => createGuardView(root, overlay, map));
  const civViews = (config.civilians ?? []).map((_, i) => createCivilianView(root, overlay, i));
  const tags = new Map();
  const droneView = config.teammate === "drone" ? createDroneView(root, DRONE.scanRadius) : null;
  const vaultView = config.teammate === "dog" ? createVaultView(root, config.vaultOrigin, map.console, state.models.agent?.env, { touch: IS_TOUCH }) : null; // the vault the dog trained on
  const terminalView = config.teammate === "assistant" ? createTerminalView(root, map, { touch: IS_TOUCH }) : null;
  state.map = map;
  state.level = {
    root, map, props, guardViews, civViews, droneView, vaultView, terminalView, decor, tags,
    tagFor(id) { if (!tags.has(id)) tags.set(id, createDetectionTag(overlay)); return tags.get(id); },
    dispose() { guardViews.forEach((v) => v.dispose()); civViews.forEach((v) => v.dispose()); tags.forEach((t) => t.dispose()); root.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
}

function resetMission() {
  const cfg = state.config, map = state.map;
  // rebuild the level so locked doors, guards and props start fresh
  buildLevel(cfg);
  state.pos = { x: state.map.start.x + 0.5, z: state.map.start.z + 0.5 };
  state.facing = 0;
  state.guards = cfg.guards.map((g) => ({ ...createGuard(g.id, g.patrol), kind: "guard" }));
  state.civilians = (cfg.civilians ?? []).map((c) => createCivilian(c.id, c.route));
  // every character carries its own camera snapshot for the drone to classify
  // RETIRED 2026-10-23: seeds 9100–9104 for the Rooftop gave two civilians that even a perfectly trained drone calls
  // guards, so the drone's mission accuracy (the AI points) could never exceed 60 %.
  // [...state.guards, ...state.civilians].forEach((c, i) => { c.snapshot = makeSnapshot(c.kind, 9000 + cfg.id * 100 + i); });
  // Seeds chosen by measurement: a perfectly trained drone gets every Rooftop character right (100 %), while
  // 4 labels average 53 % and 30 % wrong labels 73 %, so training still decides the score.
  const SNAPSHOT_BASE = { 1: 9130 };
  [...state.guards, ...state.civilians].forEach((c, i) => { c.snapshot = makeSnapshot(c.kind, (SNAPSHOT_BASE[cfg.id] ?? 9000 + cfg.id * 100) + i); });
  state.mission = createMission(state.map, cfg.rules);
  state.drone = cfg.teammate === "drone" ? createDrone(state.pos) : null;
  state.dog = cfg.teammate === "dog" ? createDog(state.models.agent, cfg.vaultOrigin) : null;
  state.failTimer = null; state.failReason = null;
  state.assist = null; assistRequest = null; state.attempts = 0; state.doorOpen = false; state.dogChimed = false;
  sound.siren(false);
  state.caughtBy = null; state.result = null;
  follow(state.pos, 0, true);
  log("mission_start", { name: cfg.name, model: !!state.models.classifier });
  updateHud(); // the HUD otherwise refreshes only while the game runs; the first-play guide pauses it
  void map;
}

// ---------- AI Brain panel ----------
const brain = createBrainPanel($("#brain"), {
  getState: () => state,
  onExport(kind) {
    const data = buildExport(state, MISSIONS, getBest);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (kind === "json") download(`neural-heist-run-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
    else download(`neural-heist-events-${stamp}.csv`, eventsToCsv(state.runLog), "text/csv");
    log("export", { kind });
  },
});
$("#btn-brain").addEventListener("click", () => brain.toggle());

// ---------- input ----------
/** True only where the player types text (password box, text fields): there, letters must not trigger shortcuts. */
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "range", "button", "submit", "reset", "color"]);
const isTyping = (el) => el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(el.type)) || el?.isContentEditable === true;
const dirs = new Set();
let sneaking = false;          // effective sneak state, recomputed every step from the three sources below
let shiftHeld = false, sneakToggle = false;
// Touch joystick (phones/tablets): an analogue direction in SCREEN space turned into world space.
const touchMove = { active: false, sx: 0, sy: 0, mag: 0 };
const IS_TOUCH = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
document.body.classList.toggle("touch-ui", IS_TOUCH);
addEventListener("keydown", (e) => {
  // RETIRED 2026-10-22: skipped every key while ANY input had focus, so after clicking a radio button, the
  // volume slider or the Mute checkbox on Settings, the M key did nothing. Replaced by the text-only check below.
  // if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) { if (e.key === "Escape" && state.screen === "terminal") show("playing"); return; }
  if (isTyping(e.target)) { if (e.key === "Escape" && state.screen === "terminal") show("playing"); return; }
  if (guide.open) { // the guide pauses the mission: Enter/Space = next, Esc = skip
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); guideNext(); }
    else if (e.key === "Escape") closeGuide();
    return;
  }
  if (e.key === "?" && state.screen === "playing") { openGuide(state.config.id, true); return; }
  const dir = KEY_TO_DIR[e.key.toLowerCase()];
  if (dir && state.screen === "playing") { dirs.add(dir); if (e.key.startsWith("Arrow")) e.preventDefault(); }
  if (e.key === "Shift") shiftHeld = true;
  if (e.key === "Tab" && ["playing", "caught", "debrief"].includes(state.screen)) { e.preventDefault(); brain.toggle(); }
  if ((e.key === "m" || e.key === "M") && !e.repeat) { e.preventDefault(); toggleMute(); }
  if (e.key === "Escape" && state.screen === "playing") show("start");
  else if (e.key === "Escape" && state.screen === "terminal") show("playing");
  if (e.key === "Enter" && state.screen === "caught") restart();
  if ((e.key === "e" || e.key === "E") && state.screen === "playing") interact();
});
addEventListener("keyup", (e) => {
  const dir = KEY_TO_DIR[e.key.toLowerCase()];
  if (dir) dirs.delete(dir);
  if (e.key === "Shift") shiftHeld = false;
});
addEventListener("blur", () => { dirs.clear(); shiftHeld = false; touchMove.active = false; }); // avoid stuck keys after alt-tab

/** E: use the console (Mission 2) or the terminal (Mission 3) when standing next to it. */
const near = (cell, r = 1.3) => cell && Math.hypot(state.pos.x - (cell.x + 0.5), state.pos.z - (cell.z + 0.5)) <= r;
function interact() {
  if (state.dog && near(state.map.console) && state.dog.status === "idle") { sound.play("dog"); deployDog(state.dog); log("dog_deployed", { outcome: state.dog.plan.outcome, steps: state.dog.plan.path.length - 1 }); }
  if (state.config.teammate === "assistant" && near(state.map.terminal) && !state.doorOpen) openTerminal();
}

// ---------- Mission 3 terminal ----------
const MAX_ATTEMPTS = 3;
let assistRequest = null; // the assistant's in-flight request for this mission run (one at a time)
const locked = () => state.attempts >= MAX_ATTEMPTS;
function showAttempts() {
  $("#term-attempts").textContent = locked() ? "Terminal locked" : `${MAX_ATTEMPTS - state.attempts} attempts left`;
  $("#term-input").disabled = locked();
}
async function openTerminal() {
  show("terminal");
  const panel = $("#terminal");
  $("#term-status").textContent = state.models.rag ? "Assistant: retrieving emails…" : "Assistant: no search index. Train me in the Lab.";
  $("#term-hits").innerHTML = ""; $("#term-answer").textContent = ""; $("#term-prompt").textContent = "";
  // RETIRED 2026-10-22: could show "-1 attempts left" after a fourth wrong guess; replaced by showAttempts().
  // $("#term-attempts").textContent = `${3 - state.attempts} attempts left`;
  showAttempts();
  $("#term-input").value = ""; $("#term-msg").textContent = locked() ? "TERMINAL LOCKED · ALARM ACTIVE" : "";
  panel.dataset.state = "loading";
  if (!state.models.rag) { $("#term-answer").textContent = "No index: I cannot search the leaked emails."; panel.dataset.state = "ready"; $("#term-input").focus(); return; }
  // RETIRED 2026-10-22: pressing E again while the model was still answering sent a second LLM request, and an
  // answer arriving after a restart was stored in the new run. Replaced by the shared request below.
  // if (!state.assist) {
  //   state.assist = await askAssistant(state.models.rag.index, "What is the vault password?", { k: state.models.rag.k, llmUrl: CONFIG.llmUrl, timeoutMs: CONFIG.llmTimeoutMs });
  //   log("assistant", { ... });
  // }
  if (!state.assist) {
    const req = (assistRequest ??= askAssistant(state.models.rag.index, "What is the vault password?", { k: state.models.rag.k, llmUrl: CONFIG.llmUrl, timeoutMs: CONFIG.llmTimeoutMs }));
    const answer = await req;
    if (assistRequest !== req) return; // the mission was restarted while the model was answering
    if (!state.assist) {
      state.assist = answer;
      log("assistant", { source: answer.source, recall: Number(answer.recall.toFixed(2)), latencyMs: answer.latencyMs, retrieved: answer.context.map((r) => r.chunk.id), suggested: extractPassword(answer.answer) });
    }
    if (state.screen !== "terminal") return; // the player closed the terminal meanwhile; the answer is kept for next time
  }
  const a = state.assist;
  $("#term-status").textContent = a.source === "llm" ? `Assistant: answered by ${a.model ?? "LLM"} in ${(a.latencyMs / 1000).toFixed(1)} s${a.tokens ? ` · ${a.tokens} tokens` : ""}`
    : a.error === "no LLM configured" ? "Assistant: offline reasoning over the retrieved emails (no language model connected)"
    : `Assistant: language model unavailable (${a.error}) · offline reasoning over the retrieved emails`;
  $("#term-hits").innerHTML = renderHits(a.hop1, "Hop 1 · question", { markClues: true }) + renderHits(a.hop2, "Hop 2 · following the lead", { markClues: true });
  $("#term-prompt").textContent = a.prompt;
  $("#term-answer").textContent = a.source === "llm" || !a.steps?.length ? a.answer : `${a.answer}\n\nHow I worked it out:\n${a.steps.map((s) => `• ${s}`).join("\n")}`;
  panel.dataset.state = "ready";
  if (!locked()) $("#term-input").focus();
}
function submitPassword() {
  const guess = normalisePassword($("#term-input").value);
  if (!guess || locked()) return; // after three wrong passwords the terminal stays locked for this run
  if (guess === normalisePassword(state.config.password)) {
    state.doorOpen = true; state.map.unlockAll(); sound.play("hack");
    log("door_unlocked", { attempts: state.attempts + 1 });
    $("#term-msg").textContent = "ACCESS GRANTED"; $("#term-msg").dataset.ok = "true";
    setTimeout(() => { if (state.screen === "terminal") show("playing"); }, 700);
    return;
  }
  state.attempts++;
  sound.play("denied");
  log("wrong_password", { guess, attempt: state.attempts });
  $("#term-msg").dataset.ok = "false";
  if (state.attempts >= 3) {
    triggerAlarm(state.mission);
    $("#term-msg").textContent = "ACCESS DENIED · ALARM TRIGGERED";
    setTimeout(() => { if (state.screen === "terminal") show("playing"); }, 900);
  } else $("#term-msg").textContent = `ACCESS DENIED · ${3 - state.attempts} attempts left`;
  showAttempts();
}
$("#term-form").addEventListener("submit", (e) => { e.preventDefault(); submitPassword(); });
$("#term-close").addEventListener("click", () => show("playing"));

// ---------- screens ----------
const SCREENS = ["start", "briefing", "lab", "caught", "debrief", "complete", "terminal", "settings", "howto"];
function show(name) {
  state.screen = name;
  document.body.dataset.screen = name; // lets CSS place the 🔊 button per screen
  for (const s of SCREENS) $(`#screen-${s}`).classList.toggle("hidden", name !== s);
  const inMission = ["playing", "caught", "debrief", "terminal"].includes(name);
  $("#hud").classList.toggle("hidden", !inMission);
  $("#overlay").classList.toggle("hidden", !inMission);
  $("#btn-brain").classList.toggle("hidden", !inMission);
  if (!inMission && brain.open) brain.toggle(false);
  if (state.level) state.level.root.visible = name !== "lab";
  $("#btn-help").classList.toggle("hidden", name !== "playing");
  $("#touch").classList.toggle("hidden", !(IS_TOUCH && name === "playing"));
  if (name !== "playing") { closeGuide(false); touchMove.active = false; }
}

function openBriefing(index) {
  state.missionIndex = index;
  state.config = MISSIONS[index];
  const c = state.config;
  $("#brief-eyebrow").textContent = `Mission ${c.id} of ${MISSIONS.length} · ${c.concept}`;
  $("#brief-title").textContent = c.name.toUpperCase();
  $("#brief-text").textContent = c.briefing;
  $("#brief-best").textContent = getBest(c.id);
  buildLevel(c);
  state.pos = { x: state.map.start.x + 0.5, z: state.map.start.z + 0.5 };
  follow(state.pos, 0, true);
  show("briefing");
}

async function openLab() {
  const c = state.config;
  const root = $("#lab-root");
  const onBack = () => show("briefing");
  if (c.lab === "rag") {
    const emails = await loadEmails();
    state.lab = mountRagLab(root, { emails, onBack, prev: state.models.rag, onDone: ({ rag, report }) => { state.models.rag = rag; state.labReports[c.id] = report; log("lab_trained", { lab: "rag", ...report }); startMission(); } });
  }
  if (c.lab === "qlearning") {
    state.lab = mountQLab(root, { onBack, prev: state.models.agent, onDone: ({ agent, report }) => { state.models.agent = agent; state.labReports[c.id] = report; log("lab_trained", { lab: "qlearning", ...report }); startMission(); } });
  }
  if (c.lab === "classifier") {
    state.lab = mountClassifierLab(root, { onBack, onDone: ({ model, report }) => { state.models.classifier = model; state.labReports[c.id] = report; log("lab_trained", { lab: "classifier", ...report, warnings: undefined }); startMission(); } });
  }
  show("lab");
}

function startMission() { resetMission(); show("playing"); openGuide(state.config.id); }
function restart() { resetMission(); show("playing"); }

$("#btn-start").addEventListener("click", () => { sound.unlock(); sound.startMusic(); openBriefing(0); });

// ---------- settings, how to play, mute ----------
function applySettings() {
  sound.setVolume(settings.volume); sound.setMuted(settings.muted);
  setQuality(settings.quality);
  saveSettings(settings);
  $("#btn-mute").textContent = settings.muted ? "🔇" : "🔊";
  $("#btn-mute").setAttribute("aria-label", settings.muted ? "Unmute" : "Mute");
  $("#btn-mute").setAttribute("aria-pressed", String(settings.muted));
  $("#settings-form").muted.checked = settings.muted; // keep the Settings checkbox in step with M and 🔊
}
function openSettings() {
  const f = $("#settings-form");
  f.difficulty.value = settings.difficulty; f.quality.value = settings.quality; f.palette.value = settings.palette;
  f.volume.value = Math.round(settings.volume * 100); f.muted.checked = settings.muted;
  $("#set-volume-v").textContent = `${f.volume.value}%`;
  $("#set-diff-desc").textContent = describeDifficulty(settings.difficulty);
  show("settings");
}
const describeDifficulty = (d) => { const x = DIFFICULTY[d]; return `Guards see ${x.range} units, move at ${Math.round(x.speedMul * 100)}% speed, notice you ${x.fillMul === 1 ? "at normal speed" : x.fillMul < 1 ? "more slowly" : "faster"}.`; };
$("#settings-form").addEventListener("input", (e) => {
  const f = e.currentTarget;
  const wasMuted = settings.muted;
  Object.assign(settings, { difficulty: f.difficulty.value, quality: f.quality.value, palette: f.palette.value, volume: Number(f.volume.value) / 100, muted: f.muted.checked });
  if (settings.muted !== wasMuted) announceSound();
  $("#set-volume-v").textContent = `${f.volume.value}%`;
  $("#set-diff-desc").textContent = describeDifficulty(settings.difficulty);
  applySettings();
});
$("#btn-settings").addEventListener("click", openSettings);
$("#btn-howto").addEventListener("click", () => show("howto"));
document.querySelectorAll("[data-back=start]").forEach((b) => b.addEventListener("click", () => show("start")));
// Every mute change says so on screen: M and 🔊 flip the state, and with only a small icon to show it,
// players who had ticked "Mute" in Settings pressed M expecting silence and switched the sound back on.
let toastTimer = null;
function announceSound() {
  const t = $("#sound-toast");
  t.textContent = settings.muted ? "🔇 Sound off · press M to turn it on" : "🔊 Sound on · press M to mute";
  t.dataset.on = String(!settings.muted);
  t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 1800);
}
function toggleMute() { settings.muted = !settings.muted; sound.unlock(); applySettings(); announceSound(); }
$("#btn-mute").addEventListener("click", toggleMute);
applySettings();
$("#btn-brief-lab").addEventListener("click", openLab);
$("#btn-brief-back").addEventListener("click", () => show("start"));
$("#btn-restart").addEventListener("click", restart);
$("#btn-caught-lab").addEventListener("click", openLab);
$("#btn-retry").addEventListener("click", restart);
$("#btn-relab").addEventListener("click", openLab);
$("#btn-next").addEventListener("click", () => { if (state.missionIndex + 1 < MISSIONS.length) openBriefing(state.missionIndex + 1); else showComplete(); });
$("#btn-menu").addEventListener("click", () => show("start"));
$("#btn-complete-menu").addEventListener("click", () => show("start"));

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** How well the trained teammate did in this mission (0..1); feeds the score. */
function aiScore() {
  if (state.config.teammate === "drone") return droneAccuracy(state.drone);
  if (state.config.teammate === "dog") return dogScore(state.dog);
  if (state.config.teammate === "assistant") return state.assist?.recall ?? 0;
  return 0;
}

function endMission(outcome) {
  const m = state.mission, cfg = state.config;
  if (outcome === "lose") {
    const reasons = {
      alarm: ["LOCKDOWN", "The alarm timer ran out. The building is in lockdown."],
      caught: ["CAUGHT", "A guard spotted you and closed in."],
      laser: ["LASER TRIPPED", "Your robot dog walked into a laser and set off the alarm. Retrain it: is touching a laser really punished?"],
      lost: ["DOG LOST", "Your robot dog went in circles and never reached the drive. Try a step penalty or more training episodes."],
    };
    const [title, text] = reasons[m.reason] ?? reasons.caught;
    $("#caught-title").textContent = title;
    $("#caught-reason").textContent = text;
    $("#caught-best").textContent = getBest(cfg.id);
    log("mission_lost", { reason: m.reason, by: state.caughtBy });
    sound.siren(false); sound.play("fail");
    show("caught");
    return;
  }
  const ai = aiScore();
  const r = scoreMission(m, ai);
  const prev = getBest(cfg.id);
  const isBest = r.score > prev;
  if (isBest) store.set(bestKey(cfg.id), r.score);
  state.result = { ...r, time: m.time, isBest, ai };
  sound.siren(false); sound.play("win");
  log("mission_won", { score: r.score, stars: r.stars.filter(Boolean).length, ai: Number(ai.toFixed(3)), time: Number(m.time.toFixed(1)) });
  $("#deb-eyebrow").textContent = `Mission ${cfg.id} · ${cfg.name} · complete`;
  $("#deb-stars").innerHTML = r.stars.map((on) => `<span class="star ${on ? "on" : ""}">★</span>`).join("");
  r.stars.forEach((on, i) => $(`#deb-star-${i + 1}`).classList.toggle("on", on));
  $("#deb-score").textContent = r.score;
  $("#deb-break").textContent = `${r.breakdown.finish} finish + ${r.breakdown.stealth} stealth + ${r.breakdown.time} time + ${r.breakdown.ai} AI`;
  $("#deb-time").textContent = fmtTime(m.time);
  $("#deb-par").textContent = `par ${fmtTime(m.parTime)}`;
  $("#deb-ai").textContent = `${Math.round(ai * 100)}%`;
  $("#deb-ai-label").textContent = { drone: "Drone accuracy", dog: "Dog path quality", assistant: "Retrieval recall" }[cfg.teammate] ?? "AI";
  $("#deb-best").textContent = Math.max(prev, r.score);
  $("#deb-newbest").classList.toggle("hidden", !isBest);
  const last = state.missionIndex + 1 >= MISSIONS.length;
  $("#btn-next").textContent = last ? "Finish" : "Next mission";
  show("debrief");
}

function showComplete() {
  const total = MISSIONS.reduce((a, m) => a + getBest(m.id), 0);
  $("#complete-total").textContent = total;
  $("#complete-list").innerHTML = MISSIONS.map((m) => `<li><span>${m.id}. ${m.name}</span><b>${getBest(m.id)}</b></li>`).join("");
  show("complete");
}

// ---------- HUD ----------
function updateHud() {
  const m = state.mission, cfg = state.config;
  $("#hud-mission").innerHTML = `<b>MISSION ${cfg.id}</b> · ${cfg.name}`;
  const objectiveText = m.hasDrive ? cfg.objective.exit : state.dog?.status === "crossing" ? cfg.objective.working : state.doorOpen ? cfg.objective.unlocked : cfg.objective.find;
  // phones have no E key: name the button that appears instead
  $("#hud-objective").textContent = IS_TOUCH ? objectiveText.replace(" (E)", "").replace("press E", "tap SEND DOG") : objectiveText;
  $("#hud-objective").classList.toggle("got", m.hasDrive);
  $("#hud-time").textContent = fmtTime(m.time);
  $("#hud-time").classList.toggle("over", m.time > m.parTime);
  const alarm = $("#hud-alarm");
  alarm.classList.toggle("hidden", m.alarm === null);
  if (m.alarm !== null) alarm.textContent = `ALARM ${Math.ceil(m.alarm)}s`;
  const top = state.guards.reduce((a, g) => (g.suspicion > a.suspicion ? g : a), state.guards[0]);
  $("#hud-alert").textContent = `Alert ${Math.round(top.suspicion * 100)}%`;
  $("#hud-alert").dataset.level = top.state === "chase" ? "chase" : top.suspicion > 0.5 ? "high" : top.suspicion > 0 ? "low" : "none";
  $("#hud-sneak").classList.toggle("on", sneaking);
  const tm = $("#hud-teammate");
  if (state.drone) {
    const found = state.guards.filter((g) => isRevealed(state.drone, g.id)).length;
    tm.textContent = state.models.classifier ? `Drone: ${found}/${state.guards.length} guards marked` : "Drone: no model";
    tm.classList.remove("hidden");
  } else if (state.dog) {
    const st = { idle: state.models.agent ? "ready at the console" : "untrained", crossing: "crossing the vault", goal: "drive delivered", laser: "hit a laser!", loop: "lost" }[state.dog.status];
    tm.textContent = `Dog: ${st}`;
    tm.classList.remove("hidden");
  } else tm.classList.add("hidden");
  if (cfg.teammate === "assistant") {
    tm.textContent = state.doorOpen ? "Assistant: door open" : state.models.rag ? `Assistant: index ready (k=${state.models.rag.k})` : "Assistant: no index";
    tm.classList.remove("hidden");
  }
  $("#hud-hint").classList.toggle("hidden", !((state.dog && state.dog.status === "idle" && near(state.map.console)) || (cfg.teammate === "assistant" && !state.doorOpen && near(state.map.terminal))));
  // Players walked up to the vault expecting to go in: say who crosses and where to go instead.
  const atVault = state.dog?.status === "idle" && !near(state.map.console) && nearVaultWall();
  $("#hud-tip").textContent = atVault ? "Only your robot dog can cross the lasers · go to the glowing console" : "";
  $("#hud-tip").classList.toggle("hidden", !atVault);
}
// Edge-of-screen arrow towards the Mission 2 console while it is off-screen and the dog is waiting:
// from the start the console was out of view, and players headed for the visible vault instead.
const navArrow = $("#nav-arrow"), navVec = new THREE.Vector3();
// RETIRED 2026-10-23: the arrow only pointed to the Mission 2 console. Playtesters did not know where to go in any
// mission, so it now points to the current objective everywhere (drive, console, terminal, exit); see objectiveTarget().
// const target = state.screen === "playing" && state.dog?.status === "idle" && !state.mission?.outcome ? state.map?.console : null;
/** Which objective is next, for the 3D beacons (unlike the arrow, it stays during the guide). */
function currentObjectiveKind() {
  const m = state.mission, cfg = state.config;
  if (!m || m.outcome) return null;
  if (m.hasDrive) return "exit";
  if (cfg.teammate === "dog") return null;                         // the dog fetches the drive; the console has its own beacon
  if (cfg.teammate === "assistant" && !state.doorOpen) return null; // the terminal has its own beacon
  return "drive";
}
function objectiveTarget() {
  const m = state.mission, cfg = state.config;
  if (state.screen !== "playing" || !m || m.outcome || guide.open) return null;
  if (m.hasDrive) return { cell: state.map.exit, label: "EXIT", kind: "exit" };
  if (cfg.teammate === "dog") return state.dog?.status === "idle" ? { cell: state.map.console, label: "CONSOLE", kind: "use" } : null;
  if (cfg.teammate === "assistant" && !state.doorOpen) return { cell: state.map.terminal, label: "TERMINAL", kind: "use" };
  return state.map.drive ? { cell: state.map.drive, label: "DATA DRIVE", kind: "drive" } : null;
}
function updateNavArrow() {
  const obj = objectiveTarget(), target = obj?.cell;
  // Phones: the E key becomes a button that appears only next to something usable, named after the action.
  const act = IS_TOUCH ? currentAction() : null, useBtn = $("#t-use");
  useBtn.classList.toggle("hidden", !act);
  if (act && useBtn.textContent !== act) useBtn.textContent = act;
  if (!target) { navArrow.classList.add("hidden"); return; }
  if (navArrow.dataset.kind !== obj.kind) navArrow.dataset.kind = obj.kind;
  if ($("#nav-text").textContent !== obj.label) $("#nav-text").textContent = obj.label;
  navVec.set(target.x + 0.5, 1, target.z + 0.5).project(camera);
  const W = innerWidth, H = innerHeight, sx = ((navVec.x + 1) / 2) * W, sy = ((1 - navVec.y) / 2) * H, m = 70;
  if (sx > m && sx < W - m && sy > m + 60 && sy < H - m) { navArrow.classList.add("hidden"); return; } // target on screen: no arrow needed
  const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
  const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m - 30) / Math.abs(dy || 1e-6));
  // keep the arrow clear of the HUD (top) and, on phones, of the joystick and buttons (bottom 190 px)
  const bottomLimit = H - (IS_TOUCH ? 200 : m), x = Math.max(90, Math.min(W - 90, cx + dx * k)), y = Math.max(m + 40, Math.min(bottomLimit, cy + dy * k + 30));
  navArrow.style.left = `${x}px`; navArrow.style.top = `${y}px`;
  navArrow.querySelector(".nav-chev").style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  navArrow.classList.remove("hidden");
}
/** Within about a cell of the vault's outer wall (Mission 2). */
function nearVaultWall() {
  const o = state.config?.vaultOrigin; if (!o) return false;
  const { x, z } = state.pos, x0 = o.x - 1, x1 = o.x + 10, z0 = o.z - 1, z1 = o.z + 10; // wall ring around the 10×10 vault
  const dx = Math.max(x0 - x, 0, x - (x1 + 1)), dz = Math.max(z0 - z, 0, z - (z1 + 1));
  return Math.hypot(dx, dz) < 1.2;
}

// ---------- first-play guide (playtesters found the game confusing) ----------
const K = (keys, touch) => (IS_TOUCH ? touch : keys);
const GUIDE = {
  1: [
    () => K(`<b>Move</b> with the <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> arrow keys (or WASD). Hold <kbd>Shift</kbd> to move quietly.`,
            `<b>Move</b> by <b>dragging anywhere</b> on the screen, in the direction you want to go. A <b>short drag</b> sneaks quietly, a long drag walks (or tap <b>SNEAK</b>).`),
    () => `<b>Guards</b> see inside their cones. <span class="g-white">White</span> = calm, <span class="g-yellow">yellow</span> = noticing you, <span class="g-red">red</span> = chasing. Walls hide you. If a guard touches you, you are caught.`,
    () => `<b>Your drone</b> is the AI you just trained. It scans everyone nearby: guards it recognises get a tag and a visible cone. Train it badly and some guards stay invisible.`,
    () => `<b>Goal:</b> follow the <b class="green">green arrow</b> to the <b class="gold">data drive</b>, then to the <b class="green">exit</b>. ${K("Press <kbd>?</kbd>", "Tap <b>?</b>")} any time to see this again.`,
  ],
  2: [
    () => `This vault is full of <b class="red">lasers</b>. You cannot go in: your <b>robot dog</b> crosses it, following the path it learned in the Lab.`,
    () => `Follow the <b class="green">arrow</b> to the glowing <b>console</b> and ${K("press <kbd>E</kbd>", "tap the <b>SEND DOG</b> button that appears there")} to send the dog.`,
    () => `If the dog touches a laser, the alarm starts: go back to the Lab and fix its rewards. When it brings the <b class="gold">drive</b>, run to the <b class="green">exit</b>.`,
  ],
  3: [
    () => `The <b class="gold">drive</b> is locked in the CEO's room. Follow the <b class="green">arrow</b> to the <b>terminal</b> and ${K("press <kbd>E</kbd>", "tap the <b>HACK TERMINAL</b> button that appears there")}.`,
    () => `Your <b>hacking assistant</b> searches the leaked emails with the index you built, and works out the password. Type it in. <b class="red">3 wrong passwords</b> start the alarm.`,
    () => `Then grab the <b class="gold">drive</b> and reach the <b class="green">exit</b>.`,
  ],
};
const GUIDE_KEY = "neural-heist.guide";
const guide = { open: false, mission: 0, i: 0 };
function openGuide(id, force = false) {
  const seen = store.get(GUIDE_KEY, {});
  if (!GUIDE[id] || (!force && seen[id])) return;
  Object.assign(guide, { open: true, mission: id, i: 0 });
  dirs.clear(); touchMove.active = false;
  renderGuide();
  $("#guide").classList.remove("hidden");
}
function renderGuide() {
  const steps = GUIDE[guide.mission];
  $("#guide-count").textContent = `Mission ${guide.mission} guide · ${guide.i + 1} / ${steps.length}`;
  $("#guide-text").innerHTML = steps[guide.i]();
  $("#guide-next").textContent = guide.i === steps.length - 1 ? "Let's go" : "Next";
}
function guideNext() { if (guide.i < GUIDE[guide.mission].length - 1) { guide.i++; renderGuide(); } else closeGuide(); }
function closeGuide(markSeen = true) {
  if (!guide.open) return;
  if (markSeen) { const seen = store.get(GUIDE_KEY, {}); seen[guide.mission] = 1; store.set(GUIDE_KEY, seen); }
  guide.open = false; dirs.clear();
  $("#guide").classList.add("hidden");
}
$("#guide-next").addEventListener("click", guideNext);
$("#guide-skip").addEventListener("click", () => closeGuide());
$("#btn-help").addEventListener("click", () => { if (state.screen === "playing") openGuide(state.config.id, true); });

// RETIRED 2026-10-23 (user request): the fixed joystick plus drag-anywhere version, replaced by drag-only movement below.
// // ---------- touch controls: joystick (fixed or drag anywhere), SNEAK, USE ----------
// // RETIRED 2026-10-23: the joystick only worked inside its circle at the bottom left. Players asked to steer by
// // dragging anywhere on the screen, so a drag on the game view now moves the joystick under the finger
// // ("floating joystick") and it returns to its corner when released. Same movement maths as before.
// (() => {
//   const joy = $("#joy"), knob = $("#joy-knob"), scene = $("#scene");
//   let pid = null, origin = null; // origin: { x, y, R } in screen pixels
//   const moveTo = (e) => {
//     const { x, y, R } = origin;
//     const vx = (e.clientX - x) / R, vy = (e.clientY - y) / R;
//     const len = Math.hypot(vx, vy), mag = Math.min(1, len);
//     knob.style.transform = `translate(${(len ? vx / len : 0) * mag * R * 0.55}px, ${(len ? vy / len : 0) * mag * R * 0.55}px)`;
//     if (mag < 0.2) { touchMove.mag = 0; return; } // dead zone
//     Object.assign(touchMove, { active: true, sx: vx / len, sy: -vy / len, mag });
//   };
//   const begin = (e, el, floating) => {
//     if (state.screen !== "playing" || guide.open || pid !== null) return;
//     e.preventDefault();
//     pid = e.pointerId; el.setPointerCapture(pid); touchMove.active = true;
//     const r = joy.getBoundingClientRect(), R = r.width / 2;
//     if (floating) { // centre the joystick under the finger
//       joy.classList.add("floating");
//       joy.style.left = `${e.clientX - R}px`; joy.style.top = `${e.clientY - R}px`;
//       origin = { x: e.clientX, y: e.clientY, R };
//     } else origin = { x: r.left + R, y: r.top + R, R };
//     moveTo(e);
//   };
//   const end = (e) => {
//     if (e && e.pointerId !== pid) return;
//     pid = null; origin = null; Object.assign(touchMove, { active: false, mag: 0 });
//     knob.style.transform = ""; joy.classList.remove("floating"); joy.style.left = ""; joy.style.top = "";
//   };
//   for (const [el, floating] of [[joy, false], [scene, true]]) {
//     el.addEventListener("pointerdown", (e) => { if (floating && e.pointerType === "mouse") return; begin(e, el, floating); });
//     el.addEventListener("pointermove", (e) => { if (e.pointerId === pid && origin) moveTo(e); });
//     el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end); el.addEventListener("lostpointercapture", end);
//   }
//   $("#t-use").addEventListener("click", () => { if (state.screen === "playing" && !guide.open) interact(); });
//   $("#t-sneak").addEventListener("click", () => { sneakToggle = !sneakToggle; $("#t-sneak").setAttribute("aria-pressed", String(sneakToggle)); });
// })();

// ---------- touch controls: drag anywhere to move, SNEAK, context action (the E key) ----------
/** What E would do right now, as a button label for phones; null when there is nothing to use. */
function currentAction() {
  if (state.screen !== "playing" || guide.open || !state.config) return null;
  if (state.dog && state.dog.status === "idle" && near(state.map.console)) return "SEND DOG";
  if (state.config.teammate === "assistant" && !state.doorOpen && near(state.map.terminal)) return "HACK TERMINAL";
  return null;
}
(() => {
  const scene = $("#scene"), ind = $("#drag-ind"), dot = $("#drag-dot");
  const R = 60; // drag radius in pixels for full walking speed
  let pid = null, origin = null;
  const moveTo = (e) => {
    const vx = (e.clientX - origin.x) / R, vy = (e.clientY - origin.y) / R;
    const len = Math.hypot(vx, vy), mag = Math.min(1, len);
    dot.style.transform = `translate(${(len ? vx / len : 0) * mag * R * 0.7}px, ${(len ? vy / len : 0) * mag * R * 0.7}px)`;
    if (mag < 0.2) { touchMove.mag = 0; return; } // dead zone: a tap does not move
    Object.assign(touchMove, { active: true, sx: vx / len, sy: -vy / len, mag });
  };
  const end = (e) => {
    if (e && e.pointerId !== pid) return;
    pid = null; origin = null; Object.assign(touchMove, { active: false, mag: 0 });
    dot.style.transform = ""; ind.classList.add("hidden");
  };
  scene.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || state.screen !== "playing" || guide.open || pid !== null) return;
    e.preventDefault();
    pid = e.pointerId; scene.setPointerCapture(pid); touchMove.active = true;
    origin = { x: e.clientX, y: e.clientY };
    ind.style.left = `${e.clientX}px`; ind.style.top = `${e.clientY}px`; ind.classList.remove("hidden");
    moveTo(e);
  });
  scene.addEventListener("pointermove", (e) => { if (e.pointerId === pid && origin) moveTo(e); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) scene.addEventListener(ev, end);
  $("#t-use").addEventListener("click", () => { if (currentAction()) interact(); });
  $("#t-sneak").addEventListener("click", () => { sneakToggle = !sneakToggle; $("#t-sneak").setAttribute("aria-pressed", String(sneakToggle)); });
})();

// ---------- loop ----------
let last = performance.now(), t = 0, lastPlayer = { ...state.pos }, stepTimer = 0;
show("start");
// Fixed-size simulation steps: each step is at most 0.05 s (no tunnelling through walls), but a slow
// frame runs several steps, so the game stays real-time at low frame rates instead of slowing down.
const MAX_STEP = 0.05, MAX_FRAME = 0.25;
const OPAQUE_SCREENS = new Set(["start", "settings", "howto", "briefing", "lab"]);
function frame(now) {
  const frameDt = Math.min((now - last) / 1000, MAX_FRAME); last = now; t += frameDt;
  const steps = Math.max(1, Math.ceil(frameDt / MAX_STEP));
  for (let i = 0; i < steps && state.screen === "playing" && !guide.open; i++) simulate(frameDt / steps);
  // Skip the 3D render (with bloom) while an opaque full-screen page hides the city: it was wasted work
  // that also forced the browser to recomposite the page every frame (Mission 1 Lab ran at ~3 fps in a
  // software renderer). Caught, debrief, terminal and complete are see-through, so they keep rendering.
  if (!OPAQUE_SCREENS.has(state.screen)) draw(frameDt);
  updateNavArrow();
  requestAnimationFrame(frame);
}

function simulate(dt) {
  {
    let dir = inputVector(dirs), speedScale = 1;
    if (touchMove.active && touchMove.mag > 0) {
      // screen up = away from the camera; camera offset (6, 18, 8) → forward (-0.6, -0.8), right (0.8, -0.6)
      const { sx, sy } = touchMove;
      dir = { dx: sx * 0.8 - sy * 0.6, dz: -sx * 0.6 - sy * 0.8 };
      speedScale = Math.max(0.45, touchMove.mag);
    }
    sneaking = shiftHeld || sneakToggle || (touchMove.active && touchMove.mag > 0 && touchMove.mag < 0.55);
    state.pos = step(state.map, state.pos, dir, (sneaking ? SNEAK_SPEED : WALK_SPEED) * speedScale, dt);
    if (dir.dx || dir.dz) state.facing = Math.atan2(dir.dx, dir.dz) + Math.PI;
    for (const g of state.guards) {
      const before = g.state;
      const r = updateGuard(g, { map: state.map, player: state.pos, sneaking, dt, tuning: tuningFor(settings) });
      if (g.state !== before) { log("guard_state", { guard: g.id, from: before, to: g.state }); if (g.state === "suspicious" && before === "patrol") sound.play("suspicious"); if (g.state === "chase") sound.play("chase"); }
      if (r.caught && !state.mission.outcome) { state.caughtBy = g.id; failMission(state.mission, "caught"); }
    }
    for (const c of state.civilians) updateCivilian(c, state.map, dt);
    if (state.drone) {
      const ids = updateDrone(state.drone, { player: state.pos, facing: state.facing, characters: [...state.guards, ...state.civilians], model: state.models.classifier, dt });
      ids.forEach((id) => { const d = state.drone.detections.get(id); log("drone_scan", { id, label: d.label, confidence: Number(d.confidence.toFixed(3)), correct: d.correct }); });
    }
    if (state.dog) {
      const out = updateDog(state.dog, dt);
      if (out) log("dog_finished", { outcome: out });
      if (out === "goal") { state.mission.hasDrive = true; log("pickup", { via: "dog" }); }
      if (out === "laser") { sound.play("zap"); triggerAlarm(state.mission); state.failTimer = 3; state.failReason = "laser"; }
      if (out === "loop") { state.failTimer = 2; state.failReason = "lost"; }
    }
    if (state.failTimer !== null) { state.failTimer -= dt; if (state.failTimer <= 0) { failMission(state.mission, state.failReason); state.failTimer = null; } }
    const ev = updateMission(state.mission, { player: state.pos, guards: state.guards, dt });
    ev.forEach((e) => { log(e); if (e === "pickup") sound.play("pickup"); });
    if (state.mission.hasDrive && state.dog && state.dog.status === "goal" && !state.dogChimed) { state.dogChimed = true; sound.play("pickup"); }
    sound.siren(state.mission.alarm !== null && !state.mission.outcome);
    // footsteps
    stepTimer -= dt;
    if ((dir.dx || dir.dz) && stepTimer <= 0) { sound.play("step", sneaking); stepTimer = sneaking ? 0.5 : 0.32; }
    updateHud();
    if (state.mission.outcome) endMission(state.mission.outcome);
  }
}

function draw(dt) {
  const L = state.level;
  if (L) {
    const moved = Math.hypot(state.pos.x - lastPlayer.x, state.pos.z - lastPlayer.z) / Math.max(dt, 1e-3);
    lastPlayer = { ...state.pos };
    playerMesh.position.set(state.pos.x, 0, state.pos.z);
    playerMesh.rotation.y += (state.facing - playerMesh.rotation.y) * 0.25;
    animatePerson(playerMesh, moved, t);
    if (state.mission) L.props.update(state.mission, t, currentObjectiveKind());
    state.guards.forEach((g, i) => {
      const revealed = !state.drone || isRevealed(state.drone, g.id);
      L.guardViews[i]?.update(g, camera, { revealed, t, dt, range: tuningFor(settings).range, palette: settings.palette });
      if (state.drone) L.tagFor(g.id).update(g.pos, state.drone.detections.get(g.id), camera);
    });
    state.civilians.forEach((c, i) => {
      const det = state.drone?.detections.get(c.id);
      L.civViews[i]?.update(c, t, dt, det);
      if (state.drone) L.tagFor(c.id).update(c.pos, det, camera);
    });
    if (L.droneView && state.drone) L.droneView.update(state.drone, t);
    L.decor.update(t);
    if (L.terminalView) L.terminalView.update(!state.doorOpen && near(state.map.terminal), state.doorOpen, t);
    if (L.vaultView && state.mission) L.vaultView.update(state.dog, state.mission, state.dog?.status === "idle" && near(state.map.console), t);
  }
  brain.tick(dt);
  playerMesh.visible = state.screen !== "lab";
  // while the robot dog works, frame both the player and the dog
  const camTarget = state.dog?.status === "crossing" && state.screen === "playing" ? { x: (state.pos.x + state.dog.pos.x) / 2, z: (state.pos.z + state.dog.pos.z) / 2 } : state.pos;
  follow(camTarget, dt);
  render();
}
requestAnimationFrame(frame);

window.__heist = { state, restart, openBriefing, openLab, MISSIONS, CONFIG, brain, sound, settings }; // exposed for automated browser tests
