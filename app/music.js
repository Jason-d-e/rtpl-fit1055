/* Transition music. One real track, played the way a keynote uses music: it swells while the
 * screen changes (PPT page → website, website → PPT page, page → page) and fades out while
 * someone is speaking. The track keeps running underneath, so each swell picks up later in the song.
 *
 * Track: "Higher Up" by Shane Ivers (https://www.silvermansound.com), CC BY 4.0. Credited in the page footer.
 * Browsers only allow sound after a key press or click, so unlock() is called from the first one. */
(function (root) {
  'use strict';
  const SRC = './assets/music/higher-up.mp3';
  const PEAK = 0.7;            // volume during a transition
  const BED = 0;               // volume while someone speaks
  let el = null, on = true, unlocked = false, frozen = false, fader = 0, holdTimer = 0, level = 0;
  const listeners = [];

  function audio() {
    if (el || !root.document) return el;
    el = root.document.createElement('audio');
    el.src = SRC; el.loop = true; el.preload = 'auto'; el.volume = 0;
    return el;
  }
  // Move the volume to `to` over `ms`, then call done.
  function fade(to, ms, done) {
    clearInterval(fader);
    const a = audio(); if (!a) return;
    const from = level, t0 = Date.now();
    fader = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / Math.max(1, ms));
      level = from + (to - from) * (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      a.volume = on ? Math.max(0, Math.min(1, level)) : 0;
      if (k >= 1) { clearInterval(fader); if (done) done(); }
    }, 30);
  }

  const Music = {
    get on() { return on; },
    // From the first key press or click.
    unlock() {
      if (unlocked) return;
      const a = audio(); if (!a) return;
      unlocked = true;
      const p = a.play(); if (p && p.catch) p.catch(() => { unlocked = false; });
    },
    // A transition: rise to the peak, stay for holdMs, then fade out under the speaker.
    swell(holdMs) {
      if (!unlocked || frozen) return;
      clearTimeout(holdTimer);
      fade(PEAK, 700);
      holdTimer = setTimeout(() => fade(BED, 2600), 700 + (holdMs || 1600));
    },
    // Pause (K) stops the music where it is; resume carries on.
    freeze(v) {
      frozen = v; const a = audio(); if (!a || !unlocked) return;
      if (v) { clearTimeout(holdTimer); clearInterval(fader); a.pause(); }
      else { a.play().catch(() => {}); fade(BED, 800); }
    },
    toggle() {
      on = !on;
      const a = audio(); if (a) a.volume = on ? level : 0;
      listeners.forEach(fn => fn(on));
      return on;
    },
    onChange(fn) { listeners.push(fn); },
    get level() { return level; }
  };
  root.RTPLMusic = Music;
})(typeof globalThis !== 'undefined' ? globalThis : this);
