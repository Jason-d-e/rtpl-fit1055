/* Background music and sound effects, synthesised live with the Web Audio API.
 * No audio files and no network: every note is generated in the browser.
 * The music has four moods that follow the story; effects mark taps, alerts and results. */
(function (root) {
  'use strict';
  let on = true;
  let ctx = null, master, music, sfx, echo, noiseBuf = null, ticker = 0;
  let nextTime = 0, step = 0, bar = 0, mood = 'calm', wanted = 'calm';
  const listeners = [];
  const BPM = 88, SIX = 60 / BPM / 4;              // one sixteenth note, in seconds
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // Four chords per mood. Each chord: [bass, ...chord tones] as MIDI notes.
  const MOODS = {
    bright:  {chords: [[41, 57, 60, 64, 65], [36, 55, 60, 62, 64], [38, 57, 60, 62, 65], [34, 53, 57, 62, 65]],
      arp: [0, 2, 1, 3, 2, 4, 3, 1], arpEvery: 2, bass: [0, 6, 8, 14], kick: [0, 8], hat: [2, 6, 10, 14], cut: 2400, pad: .030},
    calm:    {chords: [[36, 52, 55, 59, 62], [33, 52, 55, 57, 60], [29, 53, 57, 60, 64], [31, 50, 55, 59, 62]],
      arp: [0, 2, 3, 1], arpEvery: 4, bass: [0, 10], kick: [0], hat: [4, 12], cut: 1500, pad: .034},
    tense:   {chords: [[33, 52, 57, 60, 64], [29, 53, 57, 60, 65], [26, 50, 53, 57, 62], [28, 52, 56, 59, 64]],
      arp: [0, 1, 2, 1], arpEvery: 2, bass: [0, 2, 4, 6, 8, 10, 12, 14], kick: [0, 4, 8, 12], hat: [2, 6, 10, 14], cut: 1000, pad: .036},
    resolve: {chords: [[41, 57, 60, 64, 69], [43, 55, 59, 62, 67], [40, 55, 59, 64, 67], [45, 57, 60, 64, 69]],
      arp: [0, 2, 4, 3, 1, 2, 3, 4], arpEvery: 2, bass: [0, 8], kick: [0, 8], hat: [4, 12], cut: 2800, pad: .030}
  };

  /* ---------- instruments ---------- */
  function env(g, t, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function osc(type, f, t, stop, dest) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest); o.start(t); o.stop(stop); return o;
  }
  function pad(f, t, dur, cut, level) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = cut; lp.Q.value = 0.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.7);
    g.gain.setValueAtTime(level, t + dur - 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
    [-7, 7].forEach(d => { const o = osc('sawtooth', f, t, t + dur + 0.6, lp); o.detune.value = d; });
    lp.connect(g); g.connect(music);
  }
  function bass(f, t, dur) { const g = ctx.createGain(); env(g, t, 0.01, 0.20, dur); osc('triangle', f, t, t + dur + 0.1, g); g.connect(music); }
  function pluck(f, t) { const g = ctx.createGain(); env(g, t, 0.004, 0.06, 0.34); osc('triangle', f, t, t + 0.45, g); g.connect(music); g.connect(echo); }
  function kick(t) {
    const g = ctx.createGain(), o = osc('sine', 120, t, t + 0.3, g);
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    env(g, t, 0.003, 0.30, 0.22); g.connect(music);
  }
  function noise(t, dur, hp, level, dest) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
    env(g, t, 0.002, level, dur); s.connect(f); f.connect(g); g.connect(dest || music); s.start(t); s.stop(t + dur + 0.05);
    return f;
  }

  /* ---------- the sequencer: schedules a little ahead of the clock ---------- */
  function playStep(s, t) {
    const M = MOODS[mood], ch = M.chords[bar], tones = ch.slice(1);
    if (s === 0) tones.forEach(n => pad(mtof(n), t, SIX * 16, M.cut, M.pad));
    if (M.bass.includes(s)) bass(mtof(ch[0]), t, mood === 'tense' ? SIX * 1.6 : SIX * 3.5);
    if (s % M.arpEvery === 0) pluck(mtof(tones[M.arp[(s / M.arpEvery) % M.arp.length] % tones.length] + 12), t);
    if (M.kick.includes(s)) kick(t);
    if (M.hat.includes(s)) noise(t, 0.045, 7000, 0.035);
  }
  function tick() {
    while (nextTime < ctx.currentTime + 0.15) {
      playStep(step, nextTime);
      nextTime += SIX;
      step = (step + 1) % 16;
      if (step === 0) { bar = (bar + 1) % 4; if (wanted !== mood) { mood = wanted; bar = 0; } }
    }
  }

  /* ---------- effects ---------- */
  function blip(f, t, dur, level, type, cut) {
    const g = ctx.createGain(); env(g, t, 0.004, level, dur);
    if (cut) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut; osc(type || 'sine', f, t, t + dur + 0.05, lp); lp.connect(g); }
    else osc(type || 'sine', f, t, t + dur + 0.05, g);
    g.connect(sfx);
  }
  const FX = {
    tap: t => { blip(1700, t, 0.035, 0.10); noise(t, 0.02, 3000, 0.05, sfx); },
    ping: t => { blip(mtof(81), t, 0.18, 0.12); blip(mtof(88), t + 0.09, 0.3, 0.11); },
    chime: t => [72, 76, 79, 84].forEach((m, i) => blip(mtof(m), t + i * 0.07, 0.55, 0.09)),
    success: t => [67, 71, 74, 79, 83].forEach((m, i) => blip(mtof(m), t + i * 0.055, 0.7, 0.08)),
    alert: t => { blip(mtof(72), t, 0.14, 0.07, 'square', 1800); blip(mtof(67), t + 0.17, 0.26, 0.07, 'square', 1800); },
    flip: t => { kick(t); blip(mtof(79), t + 0.02, 0.09, 0.06); blip(mtof(84), t + 0.12, 0.12, 0.05); },
    whoosh: t => { const f = noise(t, 0.45, 400, 0.10, sfx); f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(5000, t + 0.4); },
    type: t => { for (let i = 0; i < 14; i++) blip(2200 + (i % 3) * 350, t + i * 0.07, 0.02, 0.035); }
  };

  /* ---------- public ---------- */
  function start() {
    if (ctx) return true;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain(); master.gain.value = 0;
    music = ctx.createGain(); music.gain.value = 0.55;
    sfx = ctx.createGain(); sfx.gain.value = 0.9;
    echo = ctx.createDelay(); echo.delayTime.value = SIX * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.28; echo.connect(fb); fb.connect(echo); echo.connect(music);
    music.connect(master); sfx.connect(master); master.connect(comp); comp.connect(ctx.destination);
    nextTime = ctx.currentTime + 0.1; mood = wanted;
    ticker = setInterval(tick, 25);
    return true;
  }
  function fade(to) { if (ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(to, ctx.currentTime, 0.35); } }

  const Sound = {
    get on() { return on; },
    // Call from a key press or click: browsers only allow audio after a user gesture.
    unlock() {
      if (!on || !start()) return;
      if (ctx.state === 'suspended') ctx.resume();
      fade(0.8);
    },
    toggle() {
      on = !on;
      if (on) Sound.unlock(); else fade(0);
      listeners.forEach(fn => fn(on));
      return on;
    },
    onChange(fn) { listeners.push(fn); },
    mood(m) { if (MOODS[m]) wanted = m; },
    fx(name, delayMs) {
      if (!on || !ctx || ctx.state !== 'running' || !FX[name]) return;
      FX[name](ctx.currentTime + 0.01 + (delayMs || 0) / 1000);
    },
    stop() { clearInterval(ticker); if (ctx) ctx.close(); ctx = null; }
  };
  root.RTPLSound = Sound;
})(typeof globalThis !== 'undefined' ? globalThis : this);
