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
