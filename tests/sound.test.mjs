import { test } from "node:test";
import assert from "node:assert/strict";

// A minimal fake Web Audio API that records gain nodes, so the test sees what would reach the speakers.
const gains = [];
class Node { connect(n) { return n; } }
const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
class Gain extends Node { constructor() { super(); this.gain = { ...param(), value: 1 }; gains.push(this); } }
class Osc extends Node { constructor() { super(); this.frequency = param(); } start() {} stop() {} }
globalThis.window = { AudioContext: class {
  constructor() { this.state = "running"; this.currentTime = 0; this.sampleRate = 8000; this.destination = new Node(); }
  createGain() { return new Gain(); } createOscillator() { return new Osc(); }
  createBiquadFilter() { const n = new Node(); n.frequency = param(); return n; }
  createBuffer() { return { getChannelData: () => new Float32Array(10) }; }
  createBufferSource() { const n = new Node(); n.start = () => {}; return n; } resume() {} } };
const { createSound } = await import("../src/audio/sound.js");

test("mute silences everything: music, sound effects and the alarm siren", () => {
  gains.length = 0;
  const s = createSound({ volume: 0.7, muted: false });
  s.startMusic(); const master = gains[0];
  assert.equal(master.gain.value, 0.7);
  s.setMuted(true); s.play("chase"); s.siren(true);
  assert.equal(master.gain.value, 0, "master output is 0 while muted");
  s.setVolume(0.4);
  assert.equal(master.gain.value, 0, "changing the volume does not unmute");
  s.setMuted(false);
  assert.equal(master.gain.value, 0.4, "unmuting restores the chosen volume");
  s.siren(false); s.stopMusic(); // stop the music timer so the test process can exit
});

test("a saved mute applies from the very first sound", () => {
  gains.length = 0;
  const s = createSound({ volume: 0.7, muted: true });
  s.unlock();
  assert.equal(gains[0].gain.value, 0);
});

// 2026-10-24: calmer sound after player feedback ("the sound is so annoying")
test("music has its own level, is quieter on reading screens, and can be switched off", () => {
  gains.length = 0;
  const s = createSound({ volume: 0.7, music: 0.4 });
  s.startMusic(); const musicGain = gains[1];
  assert.ok(Math.abs(musicGain.gain.value - 0.04) < 1e-9, "40 % of the music ceiling");
  s.duck(true); assert.ok(musicGain.gain.value < 0.04 && musicGain.gain.value > 0, "ducked while reading");
  s.duck(false); s.setMusic(0); assert.equal(musicGain.gain.value, 0, "music 0 = off");
  s.stopMusic();
});

test("footsteps can be switched off; the alarm beeps on a timer that stops cleanly", () => {
  gains.length = 0;
  const s = createSound({ footsteps: false }); s.unlock();
  const before = gains.length; s.play("step", false);
  assert.equal(gains.length, before, "no step sound when footsteps are off");
  s.siren(true); s.siren(true); s.siren(false); // idempotent; must not leave a timer running (the test would hang)
});

test("suspend and resume follow the page being hidden and shown", () => {
  let st = "running"; // the fake context has no suspend/resume: add them
  globalThis.window.AudioContext.prototype.suspend = function () { this.state = "suspended"; st = "suspended"; };
  globalThis.window.AudioContext.prototype.resume = function () { this.state = "running"; st = "running"; };
  const s = createSound(); s.unlock(); s.suspend(); assert.equal(st, "suspended"); s.resume(); assert.equal(st, "running");
});

test("a sound started while the page is hidden does not wake the audio up", () => {
  let st = "running";
  globalThis.window.AudioContext.prototype.suspend = function () { this.state = "suspended"; st = "suspended"; };
  globalThis.window.AudioContext.prototype.resume = function () { this.state = "running"; st = "running"; };
  globalThis.document = { hidden: false };
  const s = createSound(); s.unlock(); s.suspend();
  globalThis.document.hidden = true;
  s.play("pickup"); s.resume();
  assert.equal(st, "suspended", "still silent while hidden");
  globalThis.document.hidden = false; s.resume();
  assert.equal(st, "running", "resumes once visible");
  delete globalThis.document;
});
