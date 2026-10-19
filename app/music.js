/* Music and sound effects for the talk.
 *
 * Music is used like a stage show: one real track plays from a chosen start point under the opening film,
 * drops in volume while the team introduce themselves, then crosses into the track's own ending so it
 * finishes on its last chord. Nobody speaks over full music, and no song is ever cut into short snippets.
 * Transitions use short recorded sound effects instead.
 *
 * Tracks (all CC BY 4.0, credited in the footer and README):
 *   Higher Up — Shane Ivers (silvermansound.com) · Epic Intro 2019 — Sascha Ende (ende.app)
 *   Volatile Reaction, Hyperfun — Kevin MacLeod (incompetech.com)
 * Sound effects (CC0): air whoosh by Almitory (OpenGameArt), impacts by Kenney (kenney.nl). */
(function (root) {
  'use strict';
  // start: where the opening film begins in the song; drop: where the title lands (start + ~15 s);
  // outro: where the song's own ending starts (about 7 s before the sound stops).
  const TRACKS = {
    'higher-up':         {name: 'Higher Up', by: 'Shane Ivers', src: './assets/music/higher-up.mp3', bpm: 130, start: 0, drop: 14.77, outro: 186.4},
    'epic-intro-2019':   {name: 'Epic Intro 2019', by: 'Sascha Ende', src: './assets/music/epic-intro-2019.mp3', bpm: 150, start: 52.36, drop: 67.36, outro: 127},
    'volatile-reaction': {name: 'Volatile Reaction', by: 'Kevin MacLeod', src: './assets/music/volatile-reaction.mp3', bpm: 155, start: 14.43, drop: 29.43, outro: 154},
    'hyperfun':          {name: 'Hyperfun', by: 'Kevin MacLeod', src: './assets/music/hyperfun.mp3', bpm: 100, start: 0, drop: 14.41, outro: 222}
  };
  const SFX = {whoosh: './assets/sfx/whoosh.wav', hit: './assets/sfx/hit.ogg', tap: './assets/sfx/tap.ogg'};
  const FULL = 0.85;
  let on = true, frozen = false, track = null, main = null, tail = null;
  const faders = new Map(), listeners = [];
  const doc = root.document;

  function audio(src) { const a = doc.createElement('audio'); a.src = src; a.preload = 'auto'; return a; }
  // Ramp an element's volume to `to` over `ms` (smooth, so nothing ever jumps).
  function ramp(el, to, ms, done) {
    if (!el) return;
    clearInterval(faders.get(el));
    const from = el._v === undefined ? el.volume : el._v, t0 = Date.now();
    const id = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / Math.max(1, ms)), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      el._v = from + (to - from) * e;
      el.volume = on ? Math.max(0, Math.min(1, el._v)) : 0;
      if (k >= 1) { clearInterval(id); faders.delete(el); if (done) done(); }
    }, 30);
    faders.set(el, id);
  }

  const Music = {
    TRACKS,
    get on() { return on; },
    get track() { return track; },
    use(id) {
      track = TRACKS[id] || TRACKS['higher-up'];
      Music.stop(0);
      main = audio(track.src); main._v = 0; main.volume = 0;
      return track;
    },
    // Start the opening music (from a key press or click, which browsers require before any sound).
    play(from) {
      if (!main) Music.use();
      main.currentTime = from === undefined ? track.start : from;
      main._v = 0; main.volume = 0;
      const p = main.play(); if (p && p.catch) p.catch(() => {});
      ramp(main, FULL, 600);
    },
    // Seconds into the opening (0 = start point), or null when the music is not playing.
    position() { return main && !main.paused ? main.currentTime - track.start : null; },
    duck(to, ms) { ramp(main, to, ms || 1200); },
    // Cross into the song's own ending, so it stops on its final chord.
    outro() {
      if (!main || main.paused) return;
      tail = audio(track.src); tail._v = 0; tail.volume = 0;
      tail.currentTime = track.outro;
      const p = tail.play(); if (p && p.catch) p.catch(() => {});
      ramp(tail, FULL, 900);
      const old = main; ramp(old, 0, 1100, () => old.pause());
    },
    stop(ms) {
      [main, tail].forEach(a => { if (a) ramp(a, 0, ms || 0, () => a.pause()); });
    },
    sfx(name, vol) {
      if (!on || frozen || !SFX[name]) return;
      const a = audio(SFX[name]); a.volume = Math.min(1, vol === undefined ? .7 : vol);
      const p = a.play(); if (p && p.catch) p.catch(() => {});
    },
    // Pause (K) stops everything where it is; resume carries on.
    freeze(v) {
      frozen = v;
      [main, tail].forEach(a => { if (a && a.currentTime > 0 && !a.ended) { if (v) a.pause(); else a.play().catch(() => {}); } });
    },
    toggle() {
      on = !on;
      [main, tail].forEach(a => { if (a) a.volume = on ? Math.max(0, Math.min(1, a._v || 0)) : 0; });
      listeners.forEach(fn => fn(on));
      return on;
    },
    onChange(fn) { listeners.push(fn); },
    unlock() {}
  };
  root.RTPLMusic = Music;
})(typeof globalThis !== 'undefined' ? globalThis : this);
