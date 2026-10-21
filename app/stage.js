/* The opening of the talk, staged like a product launch:
 *   0  splash   — black screen, one rider icon. A click or → starts the show.
 *   1  film     — a night city, a rider rides in, the order's route and times flash up on the beat,
 *                 and the title RTPL lands on the music's drop (about 7 s).
 *   2  team     — six cards arrive on the beat, dimmed. One bar later they flip and light up together
 *                 by themselves (→ does it at once), and the music drops low while the members introduce themselves.
 *   3  cover    — a rider sweeps across and the night scene wipes into PPT page 1; the title and names fly
 *                 to where they sit on that page, and the song plays its own ending.
 * After that the normal sequence (PPT pages and website scenes) carries on. Synthetic story only.
 * Animation: GSAP (assets/vendor/gsap.min.js, standard no-charge licence). */
(function () {
  'use strict';
  const gsap = window.gsap, M = window.RTPLMusic;
  const $ = id => document.getElementById(id);
  const TEAM = [
    {name: 'Liyuan Liang', role: 'The problem, ethics and our ask', slides: 'Slides 1–4 · 15'},
    {name: 'Yanyu Zhu', role: 'Live demo: checking the time', slides: 'Slides 5–7'},
    {name: 'Yixuan Hu', role: 'Delays and evidence', slides: 'Slides 8–9'},
    {name: 'Shengbao Lu', role: 'Appeal, oversight, program logic', slides: 'Slides 10–12'},
    {name: 'Can Shang', role: 'Comparing the rules', slides: 'Slide 13'},
    {name: 'Enci Li', role: 'The pilot plan', slides: 'Slide 14'}
  ];
  // Where things sit on PPT page 1 (1920 × 1080 image): the ".RTPL" title and the line of names.
  const COVER = {title: [108, 745, 800, 225], names: [1145, 900, 555, 90]};
  const TRACK_KEY = 'rtpl.track';
  const ST = {phase: 'off', tl: null, raf: 0, idle: null};

  /* ---------- artwork ---------- */
  // Side view of a delivery rider on a scooter, facing right. 420 × 300 units; wheels centred at (105, 248) and (330, 248).
  const RIDER = `<svg class="rider-svg" viewBox="0 0 420 300" aria-hidden="true">
    <defs><linearGradient id="beam" x1="0" x2="1"><stop offset="0" stop-color="#FFF6C8" stop-opacity=".85"/><stop offset="1" stop-color="#FFF6C8" stop-opacity="0"/></linearGradient></defs>
    <path class="beam" d="M372 182 L760 110 L760 300 Z" fill="url(#beam)"/>
    <g class="wheel"><circle cx="105" cy="248" r="40" fill="#15191e"/><circle cx="105" cy="248" r="24" fill="none" stroke="#3a434d" stroke-width="5"/><path d="M105 224v48M81 248h48" stroke="#59636e" stroke-width="4"/></g>
    <g class="wheel"><circle cx="330" cy="248" r="40" fill="#15191e"/><circle cx="330" cy="248" r="24" fill="none" stroke="#3a434d" stroke-width="5"/><path d="M330 224v48M306 248h48" stroke="#59636e" stroke-width="4"/></g>
    <path d="M70 230 Q90 196 150 196 L250 196 Q268 168 300 150 L330 120 L348 126 L326 168 Q352 188 360 222 L300 226 Q284 204 250 214 L150 220 Q120 220 110 236 Z" fill="#2b323a"/>
    <rect x="18" y="92" width="116" height="104" rx="12" fill="#FFC20E"/><rect x="30" y="118" width="92" height="22" rx="5" fill="#1F262D"/><circle cx="76" cy="165" r="12" fill="#1F262D"/>
    <path d="M150 196 L196 196 L232 230 L214 238 L182 212 L150 214 Z" fill="#1F262D"/>
    <path d="M150 112 Q170 84 214 92 L238 150 Q232 176 210 192 L156 196 Q138 160 150 112 Z" fill="#FFC20E"/>
    <path d="M214 104 Q262 116 300 140 L292 152 Q252 136 222 132 Z" fill="#FFC20E"/><circle cx="302" cy="146" r="9" fill="#F2C29C"/>
    <circle cx="196" cy="62" r="34" fill="#FFC20E"/><path d="M196 62 L232 56 Q232 82 214 88 L196 80 Z" fill="#1F262D"/><path d="M168 46 Q196 22 226 40" fill="none" stroke="#E0A100" stroke-width="5"/>
    <circle class="lamp" cx="356" cy="182" r="8" fill="#FFF6C8"/><rect x="58" y="214" width="12" height="8" rx="2" fill="#E1251B" class="tail"/>
  </svg>`;

  // Night city: two layers of buildings with lit windows (fixed seed, so it looks the same every time).
  function skyline(seed, base, hmin, hmax, color, lit) {
    let x = 0, s = seed, out = '';
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    while (x < 3900) {
      const w = 90 + rnd() * 170, h = hmin + rnd() * (hmax - hmin);
      out += `<rect x="${x.toFixed(0)}" y="${(base - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${color}"/>`;
      for (let wy = base - h + 22; wy < base - 30; wy += 34) for (let wx = x + 16; wx < x + w - 22; wx += 30) {
        if (rnd() < lit) out += `<rect class="win" x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="12" height="16" fill="#FFD56B" opacity="${(0.35 + rnd() * .55).toFixed(2)}"/>`;
      }
      x += w + 8 + rnd() * 24;
    }
    return out;
  }

  function build() {
    const team = TEAM.map((m, i) => `<div class="tm" data-i="${i}"><div class="tm-av"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="30" r="22" fill="#FFC20E"/><path d="M32 30 L54 27 Q54 44 42 47 L32 42 Z" fill="#1F262D"/></svg><b>${m.name.split(' ').map(w => w[0]).join('')}</b></div>
      <h3>${m.name}</h3><p>${m.role}</p><small>${m.slides}</small></div>`).join('');
    const tracks = Object.entries(M.TRACKS).map(([id, t]) => `<button type="button" data-track="${id}">${t.name}<small>${t.by}</small></button>`).join('');
    $('show').innerHTML = `
      <div class="sh-film" id="sh-film">
        <svg class="sh-city" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070c"/><stop offset=".7" stop-color="#121a2a"/><stop offset="1" stop-color="#1c2638"/></linearGradient></defs>
          <rect width="1920" height="1080" fill="url(#sky)"/>
          <g class="stars">${Array.from({length: 70}, (_, k) => `<circle cx="${(k * 277) % 1920}" cy="${(k * 131) % 520}" r="${k % 3 ? 1.2 : 2}" fill="#fff" opacity="${(0.2 + (k % 5) / 8).toFixed(2)}"/>`).join('')}</g>
          <g class="far">${skyline(7, 860, 180, 420, '#0f1520', .18)}</g>
          <g class="near">${skyline(19, 900, 120, 300, '#0a0e15', .28)}</g>
          <rect y="880" width="1920" height="200" fill="#0b0d10"/><rect y="878" width="1920" height="6" fill="#2a313a"/>
          <g class="lane"><path d="M0 985 H3900" stroke="#FFC20E" stroke-width="8" stroke-dasharray="70 70" opacity=".8"/></g>
          <g class="route" opacity="0">
            <path id="sh-route" d="M260 520 C 520 360, 720 640, 960 470 S 1460 300, 1660 420" fill="none" stroke="#FFC20E" stroke-width="7" stroke-linecap="round"/>
            <g class="pin pa" transform="translate(260 520)"><circle r="16" fill="#1F262D" stroke="#FFC20E" stroke-width="5"/><text x="0" y="-30" text-anchor="middle">Noodle Kitchen</text></g>
            <g class="pin pb" transform="translate(1660 420)"><circle r="16" fill="#fff" stroke="#FFC20E" stroke-width="5"/><text x="0" y="-30" text-anchor="middle">Maple Court · 4 km</text></g>
          </g>
        </svg>
        <div class="sh-rider" id="sh-rider">${RIDER}</div>
        <div class="sh-hud" id="sh-hud"><span class="h1">12:00</span><span class="h2">AI says <b>12:24</b></span><span class="h3">Real trip <b>34 min</b></span><span class="h4"><b>120 km/h</b> to make it?</span></div>
        <div class="sh-flash" id="sh-flash"></div>
      </div>
      <div class="sh-cover" id="sh-cover"><img src="./assets/slides/01.webp" alt=""></div>
      <div class="sh-title" id="sh-title"><b><i></i>RTPL</b><span>Rider Time Protection Layer</span></div>
      <div class="sh-team" id="sh-team"><div class="sh-tlabel">Meet the team · T1 Mixue Bingcheng</div><div class="sh-cards">${team}<i class="sh-shine"></i></div></div>
      <div class="sh-sweep" id="sh-sweep">${RIDER}</div>
      <div class="sh-splash" id="sh-splash">
        <button type="button" class="sh-go" id="sh-go" aria-label="Start the presentation">${RIDER}</button>
        <p>T1 · Mixue Bingcheng</p>
        <div class="sh-pick"><span>Opening music</span>${tracks}</div>
      </div>
      <div class="sh-hint" id="sh-hint"></div>`;
  }

  /* ---------- helpers ---------- */
  // A rectangle on the 1920 × 1080 PPT image → screen pixels (the image is shown with object-fit: contain).
  function fit([x, y, w, h]) {
    const W = innerWidth, H = innerHeight, s = Math.min(W / 1920, H / 1080), ox = (W - 1920 * s) / 2, oy = (H - 1080 * s) / 2;
    return {left: ox + x * s, top: oy + y * s, width: w * s, height: h * s};
  }
  function hint(t) { $('sh-hint').textContent = t || ''; }
  function chosenTrack() { try { return localStorage.getItem(TRACK_KEY) || 'higher-up'; } catch (e) { return 'higher-up'; } }
  // The film starts 16 beats (about 7 s) before the song's drop, so the title lands quickly.
  function filmFrom(t) { return t.drop - Math.min(t.drop - t.start, 16 * 60 / t.bpm); }
  // Load the chosen track while the splash shows, already at the film's start point, so the film starts on time.
  function prime() {
    const t = M.track === M.TRACKS[chosenTrack()] ? M.track : M.use(chosenTrack());
    M.cue(filmFrom(t));
    return t;
  }
  function markTrack(id) { document.querySelectorAll('[data-track]').forEach(b => b.classList.toggle('on', b.dataset.track === id)); }

  /* ---------- 0 splash ---------- */
  function splash() {
    ST.phase = 'splash';
    $('show').hidden = false;
    gsap.set('#sh-title', {xPercent: -50, yPercent: -50});
    gsap.set('#sh-team', {xPercent: -50});
    markTrack(chosenTrack());
    prime();
    gsap.set('#sh-splash', {autoAlpha: 1});
    gsap.fromTo('#sh-go', {scale: .85, autoAlpha: 0}, {scale: 1, autoAlpha: 1, duration: 1.6, ease: 'power3.out'});
    hint('Click the rider or press → to start');
  }

  /* ---------- 1 film, built on the beat ---------- */
  function film() {
    ST.phase = 'film';
    // D: the drop, counted from where the film starts in the song.
    const t = prime(), beat = 60 / t.bpm, from = filmFrom(t), D = t.drop - from, skip = from - t.start;
    hint('');
    M.play(from);
    const tl = gsap.timeline({paused: true});
    ST.tl = tl;
    tl.to('#sh-splash', {autoAlpha: 0, scale: 1.08, duration: .8, ease: 'power2.in'}, 0)
      .fromTo('#sh-film', {autoAlpha: 0}, {autoAlpha: 1, duration: 1.2}, .4)
      .fromTo('.sh-city .far', {x: 0}, {x: -900, duration: D + 30, ease: 'none'}, 0)
      .fromTo('.sh-city .near', {x: 0}, {x: -1700, duration: D + 30, ease: 'none'}, 0)
      .fromTo('.sh-city .lane', {x: 0}, {x: -1960, duration: (D + 30) / 3, ease: 'none', repeat: 2}, 0)
      .fromTo('#sh-rider', {xPercent: -160, x: 0}, {xPercent: 0, x: 0, duration: 4 * beat, ease: 'power3.out'}, .6)
      .to('#sh-rider .wheel', {rotation: 360 * 40, transformOrigin: '50% 50%', duration: D + 30, ease: 'none'}, 0)
      .fromTo('#sh-rider', {y: 0}, {y: -4, duration: beat / 2, yoyo: true, repeat: Math.ceil(D / beat) * 2, ease: 'sine.inOut'}, 0);
    // The route draws, then the times slam in on the beats before the drop.
    const len = 1700;
    tl.set('.sh-city .route', {opacity: 1}, D - 10 * beat)
      .fromTo('#sh-route', {strokeDasharray: len, strokeDashoffset: len}, {strokeDashoffset: 0, duration: 4 * beat, ease: 'power2.inOut'}, D - 10 * beat)
      .fromTo('.pin.pa', {scale: 0, transformOrigin: '50% 50%'}, {scale: 1, duration: .4, ease: 'back.out(3)'}, D - 10 * beat)
      .fromTo('.pin.pb', {scale: 0, transformOrigin: '50% 50%'}, {scale: 1, duration: .4, ease: 'back.out(3)'}, D - 6 * beat);
    ['.h1', '.h2', '.h3', '.h4'].forEach((sel, k) => {
      const at = D - (8 - 2 * k) * beat;
      tl.fromTo(`#sh-hud ${sel}`, {autoAlpha: 0, scale: 1.6, y: 20}, {autoAlpha: 1, scale: 1, y: 0, duration: .22, ease: 'power4.out'}, at)
        .to(`#sh-hud ${sel}`, {autoAlpha: 0, y: -30, duration: .25}, at + 2 * beat - .05);
    });
    // The drop: flash, the rider brakes, the title lands, the camera shakes.
    tl.fromTo('#sh-flash', {autoAlpha: 0}, {autoAlpha: .9, duration: .06}, D - .02).to('#sh-flash', {autoAlpha: 0, duration: .7}, D + .06)
      .to('#sh-rider', {rotation: -6, x: 60, duration: .25, ease: 'power2.out', transformOrigin: '70% 90%'}, D)
      .to('#sh-rider', {rotation: 0, duration: .5, ease: 'elastic.out(1, .4)'}, D + .25)
      .to('.sh-city .route', {opacity: .25, duration: .6}, D)
      .fromTo('#sh-title b', {autoAlpha: 0, scale: 2.6, letterSpacing: '0.4em'}, {autoAlpha: 1, scale: 1, letterSpacing: '0em', duration: .5, ease: 'expo.out'}, D)
      .fromTo('#sh-title b i', {scale: 0}, {scale: 1, duration: .4, ease: 'back.out(4)'}, D + .3)
      .fromTo('#sh-title span', {autoAlpha: 0, y: 20}, {autoAlpha: 1, y: 0, duration: .6}, D + .5)
      .fromTo('#sh-film', {x: -16}, {x: 16, duration: .05, repeat: 7, yoyo: true, ease: 'none'}, D).set('#sh-film', {x: 0}, D + .42);
    // One bar later: the title rises, the rider moves aside, the team arrives two cards per beat.
    const T = D + 4 * beat;
    tl.to('#sh-title', {y: '-30vh', scale: .55, duration: 1.1, ease: 'power3.inOut'}, T)
      .to('#sh-rider', {xPercent: 140, autoAlpha: 0, duration: 1.4, ease: 'power3.in'}, T)
      .to('#sh-hud', {autoAlpha: 0, duration: .3}, T)
      .fromTo('.sh-tlabel', {autoAlpha: 0, y: 20}, {autoAlpha: 1, y: 0, duration: .5}, T + .4)
      .fromTo('.tm', {autoAlpha: 0, y: 80, rotationX: -40}, {autoAlpha: 1, y: 0, rotationX: 0, duration: .6, ease: 'back.out(1.6)', stagger: beat / 2}, T + 2 * beat)
      .call(() => { ST.phase = 'team'; teamIdle(); }, null, T + 2 * beat + 4 * beat)
      // One bar after the last card lands, the whole team lights up on its own.
      .call(() => { if (ST.phase === 'team') teamTogether(); }, null, T + 2 * beat + 4 * beat + 4 * beat);
    // Run the timeline on the music's clock, so the picture stays on the beat. While the music is still
    // starting the picture waits; with no sound (muted, blocked, or still silent after 2 s) it runs on the wall
    // clock from where it is. It never jumps backwards.
    const t0 = performance.now();
    let wall = null, last = 0;
    const tick = () => {
      const p = M.position(), waited = (performance.now() - t0) / 1000;
      if (wall === null && (p === null || (p - skip <= 0 && waited > 2))) wall = performance.now() - last * 1000;
      const now = wall !== null ? (performance.now() - wall) / 1000 : Math.max(0, p - skip);
      last = Math.max(last, now);
      tl.time(last, false);
      if (ST.tl === tl && tl.time() < tl.duration()) ST.raf = requestAnimationFrame(tick);
    };
    ST.raf = requestAnimationFrame(tick);
  }

  /* ---------- 2 team: the cards float, then light up together (on their own, or at once with →) ---------- */
  function teamIdle() {
    if (ST.idle) ST.idle.kill();
    ST.idle = gsap.to('.tm', {y: -10, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut', stagger: {each: .22, repeat: -1, yoyo: true}});
  }
  function teamTogether() {
    ST.phase = 'team-lit';
    if (ST.idle) ST.idle.kill();
    M.sfx('hit', .8);
    document.querySelectorAll('.tm').forEach(el => el.classList.add('lit'));
    const tl = gsap.timeline();
    tl.to('.tm', {rotationY: 360, y: -24, scale: 1.06, duration: .9, ease: 'power3.inOut', stagger: .07}, 0)
      .to('.tm', {y: 0, scale: 1, duration: .6, ease: 'back.out(2)', stagger: .07}, .9)
      .fromTo('.sh-shine', {xPercent: -120, autoAlpha: 1}, {xPercent: 620, duration: 1.3, ease: 'power2.inOut'}, .2)
      .set('.sh-shine', {autoAlpha: 0})
      .set('.tm', {rotationY: 0})
      .call(teamIdle);
    // The members now introduce themselves: the music steps back under their voices.
    setTimeout(() => M.duck(.22, 1600), 1400);
    hint('Team introductions · → to the cover');
  }

  /* ---------- handover card: who presents next (between presenters, shown until → ) ---------- */
  const HO = {open: false, go: null};
  function partOf(name, closing) { const i = TEAM.findIndex(m => m.name === name); return closing ? 'Closing' : String(i + 1).padStart(2, '0'); }
  function handover(name, go, closing) {
    const m = TEAM.find(x => x.name === name) || {name, role: '', slides: ''};
    const el = $('hand');
    el.innerHTML = `<div class="ho-road"></div><div class="ho-rider">${RIDER}</div>
      <div class="ho-txt"><small>Next up</small><em>${partOf(name, closing)}</em><h2>${m.name}</h2><p>${closing ? 'Our ask and thanks' : m.role}</p><span>${m.slides}</span></div>
      <div class="ho-hint">${m.name.split(' ')[0]} · press → to start</div>`;
    el.hidden = false;
    HO.open = true; HO.go = go;
    M.sfx('whoosh', .7); setTimeout(() => M.sfx('hit', .75), 450);
    const W = innerWidth;
    gsap.timeline()
      .fromTo(el, {clipPath: 'inset(0 100% 0 0)'}, {clipPath: 'inset(0 0% 0 0)', duration: .7, ease: 'power3.inOut'}, 0)
      .fromTo('#hand .ho-rider', {x: -0.4 * W}, {x: 1.2 * W, duration: 1.3, ease: 'power2.inOut'}, 0)
      .fromTo('#hand .ho-road', {scaleX: 0}, {scaleX: 1, duration: 1.1, ease: 'power3.out', transformOrigin: '0 50%'}, .1)
      .fromTo('#hand .ho-txt em', {autoAlpha: 0, scale: 1.8}, {autoAlpha: 1, scale: 1, duration: .6, ease: 'expo.out'}, .45)
      .fromTo('#hand .ho-txt small, #hand .ho-txt h2, #hand .ho-txt p, #hand .ho-txt span', {autoAlpha: 0, y: 30}, {autoAlpha: 1, y: 0, duration: .55, stagger: .08, ease: 'power3.out'}, .6)
      .fromTo('#hand .ho-hint', {autoAlpha: 0}, {autoAlpha: 1, duration: .6}, 1.4);
  }
  // → on the card: switch to the new presenter's first page underneath, then wipe the card away.
  function handoverGo() {
    if (!HO.open) return;
    HO.open = false;
    const go = HO.go; HO.go = null;
    if (go) go();
    M.sfx('whoosh', .5);
    gsap.to('#hand', {clipPath: 'inset(0 0 0 100%)', duration: .75, ease: 'power3.inOut', delay: .25, onComplete: () => { $('hand').hidden = true; gsap.set('#hand', {clipPath: 'none'}); }});
  }
  function handoverCancel() { if (!HO.open) return; HO.open = false; HO.go = null; gsap.to('#hand', {autoAlpha: 0, duration: .3, onComplete: () => { $('hand').hidden = true; gsap.set('#hand', {autoAlpha: 1}); }}); }

  /* ---------- curtain call after the last page: thank you, the team, a QR code to the prototype ---------- */
  const SITE = 'https://jason-d-e.github.io/rtpl-fit1055/';
  function curtain() {
    ST.phase = 'curtain';
    let qr = '';
    try { const q = window.qrcode(0, 'M'); q.addData(SITE); q.make(); qr = q.createSvgTag({cellSize: 4, margin: 2, scalable: true}); } catch (e) { /* no QR, the link is still shown */ }
    const team = TEAM.map(m => `<div class="tm lit"><div class="tm-av"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="30" r="22" fill="#FFC20E"/><path d="M32 30 L54 27 Q54 44 42 47 L32 42 Z" fill="#1F262D"/></svg><b>${m.name.split(' ').map(w => w[0]).join('')}</b></div><h3>${m.name}</h3><small>${m.slides}</small></div>`).join('');
    $('show').innerHTML = `<div class="cc">
        <div class="cc-lights"></div>
        <h1 class="cc-title" id="cc-title"><i></i><span id="cc-word">Thank you</span></h1>
        <p class="cc-sub" id="cc-sub">RTPL · Rider Time Protection Layer · T1 Mixue Bingcheng</p>
        <div class="sh-cards cc-cards">${team}</div>
        <div class="cc-qr"><div class="cc-code">${qr}</div><span>Try the prototype<b>${SITE.replace('https://', '')}</b></span></div>
        <div class="sh-sweep cc-rider">${RIDER}</div>
      </div><div class="sh-hint" id="sh-hint"></div>`;
    $('show').hidden = false;
    gsap.set('#show', {autoAlpha: 1});
    const t = M.use(localTrack()), beat = 60 / t.bpm;
    M.play(Math.max(0, t.drop - 4 * beat));          // straight into the song's high point
    M.sfx('whoosh', .8);
    const W = innerWidth;
    gsap.timeline()
      .fromTo('#show', {clipPath: 'circle(0% at 50% 50%)'}, {clipPath: 'circle(150% at 50% 50%)', duration: 1.2, ease: 'power3.inOut'}, 0)
      .fromTo('.cc-rider', {x: -0.4 * W, autoAlpha: 1}, {x: 1.2 * W, duration: 1.6, ease: 'power2.inOut'}, .2)
      .fromTo('#cc-title', {autoAlpha: 0, scale: 2.2, letterSpacing: '.3em'}, {autoAlpha: 1, scale: 1, letterSpacing: '0em', duration: .9, ease: 'expo.out'}, 4 * beat)
      .fromTo('#cc-sub', {autoAlpha: 0, y: 20}, {autoAlpha: 1, y: 0, duration: .6}, 4 * beat + .4)
      .fromTo('.cc-cards .tm', {autoAlpha: 0, y: 120, rotationX: -50}, {autoAlpha: 1, y: 0, rotationX: 0, duration: .8, ease: 'back.out(1.5)', stagger: beat / 2}, 4 * beat + .6)
      .fromTo('.cc-qr', {autoAlpha: 0, scale: .8}, {autoAlpha: 1, scale: 1, duration: .6, ease: 'back.out(2)'}, 4 * beat + 2)
      .call(() => { ST.idle = gsap.to('.cc-cards .tm', {y: -10, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut', stagger: {each: .22, repeat: -1, yoyo: true}}); });
    hint('→ questions');
  }
  // → on the curtain: the song plays its own ending and the screen turns to questions.
  function questions() {
    ST.phase = 'qa';
    M.outro();
    gsap.timeline()
      .to('#cc-word', {autoAlpha: 0, y: -30, duration: .35}, 0)
      .add(() => { $('cc-word').textContent = 'Questions?'; }, .35)
      .fromTo('#cc-word', {autoAlpha: 0, y: 30}, {autoAlpha: 1, y: 0, duration: .5, ease: 'power3.out'}, .36)
      .to('#cc-sub', {autoAlpha: 0, duration: .3}, 0)
      .add(() => { $('cc-sub').textContent = 'Each section owner answers first · the live website stays open for demos'; }, .35)
      .to('#cc-sub', {autoAlpha: 1, duration: .4}, .4);
    hint('→ back to the website');
  }
  function localTrack() { return chosenTrack(); }

  /* ---------- 3 into the cover: a rider sweeps the night into PPT page 1 ---------- */
  // The film follows the music's clock; once the opening moves on it must stop listening, or a later
  // song (the curtain call) would rewind it and replay its steps.
  function stopFilm() { cancelAnimationFrame(ST.raf); if (ST.tl) { ST.tl.kill(); ST.tl = null; } }
  function toCover() {
    ST.phase = 'cover'; hint('');
    stopFilm();
    M.outro(); M.sfx('whoosh', .9);
    const W = innerWidth, title = fit(COVER.title), names = fit(COVER.names);
    gsap.set('#sh-cover', {autoAlpha: 1, clipPath: 'inset(0 100% 0 0)'});
    // The title block is centred on its "RTPL" (the subtitle hangs below it), so it can be scaled from its centre.
    const tb = $('sh-title').querySelector('b').getBoundingClientRect(), cards = $('sh-team').getBoundingClientRect();
    const ts = gsap.getProperty('#sh-title', 'scale'), cs = gsap.getProperty('#sh-team', 'scale');
    const tl = gsap.timeline({onComplete: done});
    if (ST.idle) ST.idle.kill();
    tl.to('.tm', {scale: 1, y: 0, duration: .3}, 0)
      .fromTo('#sh-sweep', {x: -0.45 * W, autoAlpha: 1}, {x: 1.15 * W, duration: 1.5, ease: 'power2.inOut'}, .2)
      .to('#sh-cover', {clipPath: 'inset(0 0% 0 0)', duration: 1.5, ease: 'power2.inOut'}, .2)
      // The title flies to the ".RTPL" on the cover and fades into it; the cards shrink into the line of names.
      .to('#sh-title', {x: '+=' + (title.left + title.width / 2 - (tb.left + tb.width / 2)), y: '+=' + (title.top + title.height / 2 - (tb.top + tb.height / 2)),
        scale: ts * title.height / tb.height, duration: 1.1, ease: 'power3.inOut'}, .25)
      .to('#sh-title b', {color: '#1b1b1b', duration: .8}, .25)
      .to('#sh-title', {autoAlpha: 0, duration: .45, ease: 'power1.in'}, .8)      // hand over to the RTPL printed on the page
      .to('#sh-title span', {autoAlpha: 0, duration: .3}, .2)
      .to('#sh-team', {x: '+=' + (names.left + names.width / 2 - (cards.left + cards.width / 2)), y: '+=' + (names.top + names.height / 2 - (cards.top + cards.height / 2)),
        scale: cs * names.width / cards.width, duration: 1.1, ease: 'power3.inOut'}, .25)
      .to('#sh-team', {autoAlpha: 0, duration: .5, ease: 'power1.in'}, .7)
      .to('#sh-film', {autoAlpha: 0, duration: .4}, 1.5);
  }
  function done() {
    ST.phase = 'off';
    stopFilm();
    if (ST.idle) ST.idle.kill();
    gsap.to('#show', {autoAlpha: 0, duration: .4, onComplete: () => { $('show').hidden = true; $('show').innerHTML = ''; }});
    document.dispatchEvent(new CustomEvent('rtpl:stage-done'));
  }

  function skip() { M.stop(400); done(); }
  document.addEventListener('click', e => { if (HO.open && e.target.closest('#hand')) handoverGo(); });

  /* ---------- input while the show is on ---------- */
  function next() {
    if (ST.phase === 'splash') return film();
    if (ST.phase === 'film') return;                     // the film runs to the music
    if (ST.phase === 'team') return teamTogether();
    if (ST.phase === 'team-lit') return toCover();
    if (ST.phase === 'curtain') return questions();
    if (ST.phase === 'qa') { M.stop(1500); return done(); }
  }
  function back() { if (ST.phase === 'curtain' || ST.phase === 'qa') { M.stop(600); done(); } }
  document.addEventListener('click', e => {
    if (ST.phase === 'off') return;
    const tb = e.target.closest('[data-track]');
    if (tb) { try { localStorage.setItem(TRACK_KEY, tb.dataset.track); } catch (err) { /* this visit only */ } markTrack(tb.dataset.track); prime(); return; }
    if (e.target.closest('#sh-go')) next();
  });

  window.RTPLStage = {
    active: () => ST.phase !== 'off' || HO.open,
    // Keys while the show (or a handover card) is on. Returns true when it used the key.
    key(e) {
      const k = e.key;
      if (HO.open) {
        if (k === 'ArrowRight' || k === ' ' || k === 'PageDown' || k === 'Enter') { e.preventDefault(); handoverGo(); }
        else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Escape') { e.preventDefault(); handoverCancel(); }
        else if (k === 'm' || k === 'M') M.toggle();
        return true;
      }
      if (ST.phase === 'off') return false;
      if (k === 'ArrowRight' || k === ' ' || k === 'PageDown' || k === 'Enter') { e.preventDefault(); next(); return true; }
      if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); back(); return true; }
      if (k === 's' || k === 'S') { skip(); return true; }       // skip the opening (rehearsals)
      if (k === 'm' || k === 'M') { M.toggle(); return true; }
      return true;
    },
    start() { if (!gsap) return false; build(); splash(); return true; },
    // Between presenters: show who is next, and run go() when the new presenter presses →.
    handover(name, go, closing) { if (!gsap) { go(); return; } handover(name, go, closing); },
    curtain() { if (gsap) curtain(); },
    TEAM,
    fit
  };
})();
