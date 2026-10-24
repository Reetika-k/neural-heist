// All sound is synthesised with the Web Audio API: no files to download, works offline.
// Footsteps, guard alert, alarm, hack success, mission win/fail, and a soft ambient pad.
// 2026-10-24 (player feedback: "the sound is so annoying"): calmer music with its own volume, ducked on reading
// screens; quieter, sparser footsteps that can be switched off; a soft alarm beep instead of a wailing siren; and
// everything suspends while the page is hidden.
const MUSIC_BASE = 0.1; // loudest music gain (was a fixed 0.18 under the master volume)
export function createSound({ volume = 0.7, muted = false, music: musicLevel = 0.4, footsteps = true } = {}) {
  let ctx = null, master = null, musicGain = null, music = null, sirenOsc = null;
  const state = { volume, muted, music: musicLevel, footsteps, ducked: false, started: false };

  function ensure() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return true; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
    master = ctx.createGain(); master.connect(ctx.destination);
    // RETIRED 2026-10-24: fixed music level. musicGain = ctx.createGain(); musicGain.gain.value = 0.18; musicGain.connect(master);
    musicGain = ctx.createGain(); musicGain.connect(master);
    apply();
    return true;
  }
  function apply() {
    if (master) master.gain.value = state.muted ? 0 : state.volume;
    if (musicGain) musicGain.gain.value = MUSIC_BASE * state.music * (state.ducked ? 0.35 : 1);
  }

  function tone(freq, start, dur, { type = "sine", gain = 0.2, to = null, dest = master, attack = 0.012 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + start, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
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
    // RETIRED 2026-10-24: louder, brighter steps. step: (soft) => noise(0, 0.06, soft ? 0.025 : 0.06, soft ? 500 : 900),
    step: (soft) => { if (state.footsteps) noise(0, 0.05, soft ? 0.012 : 0.028, soft ? 380 : 560); },
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

  // RETIRED 2026-10-24: a buzzing sawtooth drone plus the same six-note arpeggio every 2.1 s, forever.
  // function startMusic() {
  //   if (!ensure() || music) return;
  //   const notes = [110, 130.81, 164.81, 196, 164.81, 130.81];
  //   ... drone (sawtooth 55 Hz) + setInterval(arpeggio, 2100) ...
  // }
  // Soft pad: a slow four-chord progression (Am, F, C, G), each chord fading in and out over 4 s, with an
  // occasional quiet high note, and two bars of silence after every eight so it never becomes a loop you notice.
  const CHORDS = [[110, 130.81, 164.81], [87.31, 110, 130.81], [130.81, 164.81, 196], [98, 123.47, 146.83]];
  const SPARKLE = [440, 493.88, 523.25, 587.33, 659.25];
  function startMusic() {
    if (!ensure() || music) return;
    let bar = 0;
    const playBar = () => {
      const pos = bar % 10; bar++;
      if (pos >= 8) return; // rest
      const chord = CHORDS[pos % 4];
      chord.forEach((f) => tone(f, 0, 4.2, { type: "sine", gain: 0.22, dest: musicGain, attack: 1.2 }));
      if (Math.random() < 0.45) tone(SPARKLE[Math.floor(Math.random() * SPARKLE.length)], 1 + Math.random() * 2, 1.6, { type: "triangle", gain: 0.05, dest: musicGain, attack: 0.08 });
    };
    playBar();
    music = { timer: setInterval(playBar, 4000) };
  }
  function stopMusic() { if (!music) return; clearInterval(music.timer); music = null; }
  /* RETIRED 2026-10-24 (continued): the old start/stop pair.
  function startMusicOld() {
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
  function stopMusicOld() { if (!music) return; clearInterval(music.timer); try { music.drone.stop(); } catch { } music = null; }
  RETIRED 2026-10-24: a continuous sawtooth siren (600 Hz ± 180 Hz wail), harsh over a 25 s alarm.
  function sirenOld(on) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = 600; lfo.frequency.value = 1.6; lg.gain.value = 180;
      lfo.connect(lg).connect(o.frequency); g.gain.value = 0.035; o.connect(g).connect(master); o.start(); lfo.start();
      sirenOsc = { o, lfo };
    } else if (!on && sirenOsc) { try { sirenOsc.o.stop(); sirenOsc.lfo.stop(); } catch { } sirenOsc = null; }
  }
  */
  // Alarm: a soft two-tone beep every 1.4 s, urgent enough to notice, quiet enough to think.
  function siren(on) {
    if (!ctx) return;
    const beep = () => { tone(880, 0, 0.16, { type: "triangle", gain: 0.06 }); tone(660, 0.2, 0.2, { type: "triangle", gain: 0.05 }); };
    if (on && !sirenOsc) { beep(); sirenOsc = { timer: setInterval(beep, 1400) }; }
    else if (!on && sirenOsc) { clearInterval(sirenOsc.timer); sirenOsc = null; }
  }

  return {
    state,
    unlock: ensure,
    play(name, arg) { if (ensure() && SFX[name]) SFX[name](arg); },
    startMusic, stopMusic, siren,
    setVolume(v) { state.volume = v; apply(); },
    setMusic(v) { state.music = v; apply(); },
    setFootsteps(on) { state.footsteps = on; },
    /** Quieter music on reading screens (briefings, Labs, menus); full level while playing. */
    duck(on) { state.ducked = on; apply(); },
    /** Stop all audio while the page is hidden or closed; carry on when it is visible again. */
    suspend() { if (ctx && ctx.state === "running") ctx.suspend(); },
    resume() { if (ctx && ctx.state === "suspended") ctx.resume(); },
    setMuted(m) { state.muted = m; apply(); },
    get audible() { return !state.muted && state.volume > 0; },
  };
}
