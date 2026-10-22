// All sound is synthesised with the Web Audio API: no files to download, works offline.
// Footsteps, guard alert, alarm siren, hack success, mission win/fail, and a quiet ambient loop.
export function createSound({ volume = 0.7, muted = false } = {}) {
  let ctx = null, master = null, musicGain = null, music = null, sirenOsc = null;
  const state = { volume, muted, started: false };

  function ensure() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return true; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
    master = ctx.createGain(); master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.18; musicGain.connect(master);
    apply();
    return true;
  }
  function apply() { if (master) master.gain.value = state.muted ? 0 : state.volume; }

  function tone(freq, start, dur, { type = "sine", gain = 0.2, to = null, dest = master } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + start, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(start, dur, gain = 0.08, freq = 900) {
    if (!ctx) return;
    const t = ctx.currentTime + start, len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = "lowpass"; f.frequency.value = freq; g.gain.value = gain;
    src.connect(f).connect(g).connect(master); src.start(t);
  }

  const SFX = {
    step: (soft) => noise(0, 0.06, soft ? 0.025 : 0.06, soft ? 500 : 900),
    suspicious: () => { tone(660, 0, 0.12, { type: "triangle", gain: 0.12 }); tone(880, 0.1, 0.14, { type: "triangle", gain: 0.12 }); },
    chase: () => { tone(440, 0, 0.18, { type: "square", gain: 0.1 }); tone(330, 0.16, 0.25, { type: "square", gain: 0.1 }); },
    pickup: () => [523, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.18, { type: "triangle", gain: 0.15 })),
    hack: () => [440, 660, 880, 1320].forEach((f, i) => tone(f, i * 0.06, 0.12, { type: "square", gain: 0.06 })),
    denied: () => tone(220, 0, 0.35, { type: "sawtooth", gain: 0.12, to: 110 }),
    dog: () => { tone(900, 0, 0.05, { type: "square", gain: 0.05 }); tone(1200, 0.06, 0.05, { type: "square", gain: 0.05 }); },
    zap: () => { tone(1800, 0, 0.3, { type: "sawtooth", gain: 0.12, to: 120 }); noise(0, 0.3, 0.1, 3000); },
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.3, { type: "triangle", gain: 0.15 })),
    fail: () => { tone(392, 0, 0.3, { type: "triangle", gain: 0.15 }); tone(262, 0.28, 0.6, { type: "triangle", gain: 0.15 }); },
    click: () => tone(1200, 0, 0.04, { type: "square", gain: 0.04 }),
  };

  function startMusic() {
    if (!ensure() || music) return;
    // ambient loop: low drone + slow minor arpeggio, scheduled bar by bar
    const notes = [110, 130.81, 164.81, 196, 164.81, 130.81];
    let bar = 0;
    const drone = ctx.createOscillator(), dg = ctx.createGain();
    drone.type = "sawtooth"; drone.frequency.value = 55; dg.gain.value = 0.05;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 300;
    drone.connect(lp).connect(dg).connect(musicGain); drone.start();
    const timer = setInterval(() => { notes.forEach((f, i) => tone(f * 2, i * 0.35, 0.5, { type: "sine", gain: 0.12, dest: musicGain })); bar++; }, 2100);
    music = { drone, timer };
  }
  function stopMusic() { if (!music) return; clearInterval(music.timer); try { music.drone.stop(); } catch { /* already stopped */ } music = null; }
  function siren(on) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = 600; lfo.frequency.value = 1.6; lg.gain.value = 180;
      lfo.connect(lg).connect(o.frequency); g.gain.value = 0.035; o.connect(g).connect(master); o.start(); lfo.start();
      sirenOsc = { o, lfo };
    } else if (!on && sirenOsc) { try { sirenOsc.o.stop(); sirenOsc.lfo.stop(); } catch { /* ignore */ } sirenOsc = null; }
  }

  return {
    state,
    unlock: ensure,
    play(name, arg) { if (ensure() && SFX[name]) SFX[name](arg); },
    startMusic, stopMusic, siren,
    setVolume(v) { state.volume = v; apply(); },
    setMuted(m) { state.muted = m; apply(); },
    get audible() { return !state.muted && state.volume > 0; },
  };
}
