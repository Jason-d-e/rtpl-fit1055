/* Presenter controller: one scene per slide, one beat per → press. */
(function () {
  'use strict';
  const S = window.RTPLScenes, R = window.RTPLRender, G = window.RTPLGeo, C = window.RTPLCore;
  const A = window.RTPLMusic || {on: false, unlock() {}, sfx() {}, freeze() {}, toggle() { return false; }, onChange() {}};
  const $ = id => document.getElementById(id);
  const SCENES = S.SCENES;
  const MAIN = SCENES.filter(s => s.group === 'main');
  // The animations are the demo, so the Windows/OS "reduce motion" setting is not followed
  // (it silently turned every scene into a still on some laptops). Add ?calm to the URL for a still version.
  const CALM = new URLSearchParams(location.search).has('calm');
  const reduced = () => CALM;

  // hold: the page has just opened on slide 2 and waits on its first frame until the presenter starts it.
  // deck: the PowerPoint slides shown inside the page (see "PowerPoint slides" below).
  const st = {i: 0, b: 0, live: {}, sb: {...S.SANDBOX_DEFAULT}, prev: null, raf: 0, notes: false, timers: [], looping: true, loop: 0, gate: null, hold: false,
    deck: null, deckOpen: false, deckBack: null, deckMuted: false,
    paused: false, pauseMuted: false, pausedAnims: [],
    show: null, k: 0, pptOn: false, busy: false, entering: false, tl: false};   // the PPT + website sequence (see below)   // Pause (K): the current step's motion stops where it is

  /* ---------- navigation ---------- */
  function scene() { return SCENES[st.i]; }
  function beat() { return scene().beats[st.b]; }

  function go(i, b, animate) {
    setPaused(false);
    hideGate();
    // Jumping to a scene from a PPT page (rail, number keys, Q&A menu): show the website at once.
    if (st.pptOn && !st.entering) { st.pptOn = false; pvHideNow(); }
    // Leaving the opening hold plays the full scene entrance, as a fresh page load used to.
    const prev = st.hold ? null : {scene: scene(), beat: beat(), i: st.i, b: st.b};
    if (st.hold) { st.hold = false; A.unlock(); }
    st.i = Math.max(0, Math.min(SCENES.length - 1, i));
    st.b = Math.max(0, Math.min(scene().beats.length - 1, b));
    st.live = {};
    const k = st.show.indexOf('w:' + scene().id);
    if (k >= 0) st.k = k;
    render(prev, !!animate);
  }
  // → walks the steps of a website scene, then moves to the next item of the sequence (a PPT page or a scene).
  function next() {
    const s = scene();
    setPaused(false);
    if (st.busy) { st.queued = 'next'; return; }
    if (st.hold) return go(st.i, 0, true);
    if (st.gate) return st.deck && st.gate.pptOnly.length ? openDeck('gate') : gateGo();
    if (!st.pptOn && st.b < s.beats.length - 1) return go(st.i, st.b + 1, true);
    const k = curK();
    if (k >= 0 && k < st.show.length - 1) toItem(k + 1, 'first');
  }
  // ← goes back a step, or quickly to the previous item.
  function back() {
    setPaused(false);
    if (st.busy) { st.queued = 'back'; return; }
    if (st.gate) { hideGate(); renderChrome(); scheduleLoop(); return; }
    if (!st.pptOn && st.b > 0) return go(st.i, st.b - 1, false);
    const k = curK();
    if (k > 0) toItem(k - 1, 'last', true);
  }

  /* ---------- handover card between presenters / back to PowerPoint ---------- */
  function showGate(from, to) {
    const pptOnly = [];
    for (let n = from.slide + 1; n < (to ? to.slide : S.PPT_TOTAL + 1); n++) pptOnly.push(n);
    st.gate = {from, to, pptOnly};
    clearTimeout(st.loop); clearTimers(); cancelAnimationFrame(st.raf);
    renderGate();
    $('gate').hidden = false;
    renderChrome();
  }
  function renderGate() { if (st.gate) $('gate').innerHTML = R.gate(st.gate.from, st.gate.to, st.gate.pptOnly, !!st.deck); }
  function gateGo() { const to = st.gate && st.gate.to; if (to) go(SCENES.indexOf(to), 0, true); }
  function hideGate() {
    if (!st.gate) return;
    st.gate = null;
    $('gate').hidden = true;
  }

  /* ---------- PowerPoint slides inside the page (presenter's computer only) ---------- */
  // A Canva embed link saved in this browser's localStorage; the public site carries no link.
  // Canva links cannot open at a given page, so the slides stay loaded (hidden) and keep their place.
  const DECK_KEY = 'rtpl.deck';
  const DECK_UI = false;   // Canva slides button and P key: off for now
  function deckParse(text) {
    const m = /https:\/\/www\.canva\.com\/design\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/(view|watch|edit)\b/.exec(String(text || ''));
    if (!m) return {error: 'Paste the Canva embed link of the slides (Share → See all → Embed).'};
    // An edit link would let anyone who sees it change the slides.
    if (m[3] === 'edit') return {error: 'This is an edit link: anyone who sees it could change the slides. In Canva use Share → See all → Embed and paste that link.'};
    return {url: `https://www.canva.com/design/${m[1]}/${m[2]}/view?embed`};
  }
  function deckSaved() { try { return deckParse(localStorage.getItem(DECK_KEY)).url || null; } catch (e) { return null; } }
  function deckStore(url) { try { if (url) localStorage.setItem(DECK_KEY, url); else localStorage.removeItem(DECK_KEY); return true; } catch (e) { return false; } }
  function setDeck(url) {
    if (!url && st.deckOpen) closeDeck(false);
    st.deck = url;
    const box = $('deck-frame');
    box.innerHTML = '';
    if (url) {
      const f = document.createElement('iframe');
      f.id = 'deck-iframe'; f.title = 'PowerPoint slides'; f.allow = 'fullscreen'; f.src = url;
      box.appendChild(f);
    }
    // The Canva slides inside the page are switched off for now: the PPT pages are part of the talk itself.
    // The code stays for later; the button and the P key are hidden (DECK_UI).
    $('ppt-btn').hidden = !(DECK_UI && url);
    renderGate(); renderChrome();
  }
  function openDeck(from) {
    if (!st.deck) return openSetup();
    setPaused(false);
    const to = from === 'gate' && st.gate ? st.gate.to : null;
    st.deckBack = to ? 'gate' : 'stay';
    $('deck-back').textContent = to ? `Back to the website · PPT slide ${to.slide} →` : 'Back to the website →';
    clearTimeout(st.loop);
    // The slides have no music; it comes back with the website. (While the opening holds, nothing plays yet.)
    if (A.on && !st.hold) { A.toggle(); st.deckMuted = true; }
    st.deckOpen = true;
    $('deck').classList.add('open'); $('deck').setAttribute('aria-hidden', 'false');
    const f = $('deck-iframe'); if (f) f.focus();     // the clicker and arrow keys now turn the slides
  }
  function closeDeck(follow) {
    if (!st.deckOpen) return;
    st.deckOpen = false;
    $('deck').classList.remove('open'); $('deck').setAttribute('aria-hidden', 'true');
    if (st.deckMuted) { st.deckMuted = false; A.toggle(); }
    document.querySelector('.stage').focus({preventScroll: true});
    if (follow && st.deckBack === 'gate') return gateGo();
    scheduleLoop();
  }
  // One-click setup for the presenting computer: open the site at …/#ppt=<Canva link>. The link is saved in this
  // browser and the address goes back to the scene; the part after # is never sent to the web server.
  function takePptLink(raw) {
    let text = raw;
    try { text = decodeURIComponent(raw); } catch (e) { /* use it as it is */ }
    const r = deckParse(text);
    if (r.error) { openSetup(); $('ds-msg').textContent = r.error; return; }
    deckStore(r.url);
    setDeck(r.url);
  }
  function openSetup() {
    $('ds-input').value = st.deck || '';
    $('ds-msg').textContent = '';
    $('ds-forget').hidden = !st.deck;
    $('deck-setup').hidden = false;
    $('ds-input').focus();
  }
  function closeSetup() {
    $('deck-setup').hidden = true;
    const f = st.deckOpen && $('deck-iframe');
    (f || document.querySelector('.stage')).focus({preventScroll: true});
  }
  $('ds-form').addEventListener('submit', e => {
    e.preventDefault();
    const r = deckParse($('ds-input').value);
    if (r.error) { $('ds-msg').textContent = r.error; return; }
    setDeck(r.url);
    if (deckStore(r.url)) closeSetup();
    else $('ds-msg').textContent = 'Linked for this visit only: this browser does not allow saving it.';
  });

  function hashFor() { return st.pptOn ? '#ppt-' + pageOf(st.show[st.k]) : '#' + scene().id + (st.b ? '/' + (st.b + 1) : ''); }
  function fromHash() {
    const pg = /^#ppt-(\d+)$/.exec(location.hash || '');
    if (pg && st.show.includes('p' + pg[1])) { st.pptOn = true; st.k = st.show.indexOf('p' + pg[1]); return true; }
    const m = /^#([a-z0-9-]+)(?:\/(\d+))?$/.exec(location.hash || '');
    if (!m) return false;
    st.pptOn = false;
    // Old Case Lab links (#01–#07) still land on the matching scene.
    const OLD = {'01': 'slide-6', '02': 'slide-8', '03': 'slide-9', '04': 'slide-9', '05': 'qa-05', '06': 'qa-06', '07': 'qa-07'};
    const id = OLD[m[1]] || m[1];
    const i = SCENES.findIndex(s => s.id === id);
    if (i < 0) return false;
    st.i = i; st.b = Math.max(0, Math.min(SCENES[i].beats.length - 1, (+m[2] || 1) - 1));
    return true;
  }

  /* ---------- chrome ---------- */
  function buildRail() {
    $('rail').innerHTML = MAIN.map(s => `<button type="button" data-go="${s.id}"><span class="n">${s.slide}</span><span class="t">${R.esc(s.short)}</span></button>`).join('');
    $('qa-menu').insertAdjacentHTML('beforeend', SCENES.filter(s => s.group === 'extra').map(s => `<button type="button" data-go="${s.id}"><span>${R.esc(s.short)}</span><small>${R.esc(s.title)}</small></button>`).join(''));
  }

  function renderChrome() {
    const s = scene(), b = beat();
    document.querySelectorAll('[data-go]').forEach(el => {
      const on = el.dataset.go === s.id;
      if (on) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
      const k = MAIN.findIndex(x => x.id === el.dataset.go);
      el.classList.toggle('done', k >= 0 && k < MAIN.indexOf(s));
    });
    $('ppt').innerHTML = R.pptBadge(s);
    $('tag').innerHTML = (s.caseNum ? `<span class="case">Case ${R.esc(s.caseNum)}</span>` : '') + '<span>Made-up order A101 · Noodle Kitchen → Maple Court</span>';
    $('title').textContent = s.title;
    const cap = st.live.caption || b.caption;
    const res = st.live.result !== undefined ? st.live.result : b.result;
    $('caption').textContent = cap;
    $('result').innerHTML = res ? `<span class="result">${R.esc(res)}</span>` : '';
    $('dots').innerHTML = s.beats.length > 1 ? s.beats.map((_, k) => `<button type="button" class="${k <= st.b ? 'on' : ''}" data-beat="${k}" aria-label="Step ${k + 1} of ${s.beats.length}"></button>`).join('') : '';
    const last = st.b === s.beats.length - 1, nl = nextLabel();
    $('hint').textContent = st.paused ? 'Paused · K or Resume to continue' : !last ? `Step ${st.b + 1} of ${s.beats.length}` : nl ? `Last step · → ${nl}` : '';
    $('next').disabled = last && !nl;
    $('next').textContent = last && nl && nl.startsWith('PPT') ? 'PPT →' : 'Next →';
    $('notes').innerHTML = `<b>${s.slide ? 'Slide ' + s.slide + ' · ' + R.esc(s.presenter) : 'Q&A extra'}</b>${R.esc(b.note || '')}<br><small>Keys: <kbd>→</kbd>/<kbd>Space</kbd> next · <kbd>←</kbd> back · <kbd>R</kbd> restart scene · <kbd>N</kbd> notes · <kbd>K</kbd> pause · <kbd>M</kbd> sound · <kbd>L</kbd> loop · <kbd>T</kbd> timeline · <kbd>2</kbd>, <kbd>5</kbd>–<kbd>9</kbd>, <kbd>0</kbd>=10, <kbd>1</kbd>=11 jump</small>`;
    $('notes').hidden = !st.notes;
    if (location.hash !== hashFor()) history.replaceState(null, '', hashFor());
    if (st.tl) renderTimeline();
  }

  /* ---------- phones ---------- */
  function phoneStates() {
    const s = scene(), b = beat();
    if (s.sandbox) {
      const out = sandboxCompute();
      const ok = out && out.check && out.check.status === 'READY';
      const d = out && out.decision;
      const rider = !ok ? {kind: 'idle', msg: 'Order held for a dispatch check'}
        : d ? {kind: 'result', caseNum: 'sandbox', id: 'A101', protected: d.protected, policy: d.policy, headline: d.protected ? 'You’re protected' : 'Assessment can proceed',
            message: d.reason, stats: {late: d.late, credit: d.credit, residual: d.residual}, appeal: 'none', effects: d.effects}
        : {kind: 'offer', id: 'A101', deadline: out.check.deadline, km: st.sb.distance, pickup: 'Noodle Kitchen', drop: 'Synthetic customer'};
      return [{kind: 'form'}, {kind: 'rider', state: rider, label: 'Sandbox rider · deadline ' + (ok ? S.clock(out.check.deadline) : 'held')}];
    }
    if (b.solo) return [{kind: 'none'}, {kind: 'none'}];
    if (s.phones) return [{kind: 'rider', state: b.riderL, label: 'Rider · case 03'}, {kind: 'rider', state: b.riderR, label: 'Rider · case 04'}];
    let rider = b.rider;
    const ld = st.live.decision;
    if (ld && ld.appeal.status !== 'PENDING' && rider && rider.kind === 'result') rider = {...rider, appeal: ld.appeal.status === 'REVERSE' ? 'done' : 'upheld', protected: ld.protected, effects: ld.effects, reviewReason: ld.appeal.reason};
    return [{kind: 'rider', state: rider}, {kind: 'customer', state: b.customer}];
  }

  const lastPhone = {left: '', right: ''};
  function renderPhones(force) {
    const t = beat().time === null ? 0 : beat().time;
    const [l, r] = phoneStates();
    const html = p => p.kind === 'none' ? '' : p.kind === 'form' ? R.sandboxForm(st.sb) : p.kind === 'rider' ? R.riderPhone(p.state, t, p.label) : R.customerPhone(p.state, t);
    const key = p => JSON.stringify(p) + t;
    if (force || key(l) !== lastPhone.left) { $('left').innerHTML = html(l); lastPhone.left = key(l); }
    if (force || key(r) !== lastPhone.right) { $('right').innerHTML = html(r); lastPhone.right = key(r); }
    document.querySelector('.floor').classList.toggle('solo', !!beat().solo);
  }

  /* ---------- centre ---------- */
  function renderCenter(prev, animate) {
    const s = scene(), b = beat(), c = $('center');
    cancelAnimationFrame(st.raf);
    clearTimers();
    if (b.center === 'handphone') {
      c.innerHTML = R.handPhone(b.hand);
      handFx(b.hand, prev && prev.scene === s ? prev : null, animate);
      const grow = !(prev && prev.beat && prev.beat.hand && prev.beat.hand.stage >= 2);
      bars(grow && animate);
    } else if (b.center === 'map') {
      const samePrev = prev && prev.scene === s && prev.beat && prev.beat.map && prev.b === st.b - 1;
      c.innerHTML = R.mapHtml(b.map, b.time, samePrev ? prev.beat.map.routes : null) + R.engine(b.engine);
      placeRider(b, prev, animate && samePrev || (animate && b.map.move));
      const growBars = !(prev && prev.scene === s && prev.beat.engine && prev.beat.engine.parts && b.engine && b.engine.parts);
      bars(growBars && animate);
    } else if (b.center === 'overview') {
      c.innerHTML = R.overview(b.overview);
      requestAnimationFrame(() => overviewFx(b.overview.stage, animate && !reduced()));
    } else if (b.center === 'compare') c.innerHTML = R.compare(b.compare);
    else if (b.center === 'review') c.innerHTML = R.review(b.review, st.live);
    else if (b.center === 'audit') c.innerHTML = R.audit(b.audit);
    else if (b.center === 'sandbox') {
      c.innerHTML = `<div class="sb-out" id="sb-out"></div>`;
      renderSandboxOut();
    }
  }

  function bars(grow) {
    document.querySelectorAll('.seg[data-w]').forEach(el => {
      const w = el.dataset.w + '%';
      if (!grow || reduced()) { el.style.transition = 'none'; el.style.width = w; return; }
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.width = w; }));
    });
  }

  function riderPoint(m) {
    if (m.move) return G.pointAt(m.move.path, m.move.to);
    if (m.rider && m.rider.place) { const p = G.PLACES[m.rider.place]; return [p.x, p.y]; }
    if (m.rider && m.rider.path) return G.pointAt(m.rider.path, m.rider.t);
    return [G.PLACES.hub.x, G.PLACES.hub.y];
  }

  function placeRider(b, prev, animate) {
    const el = document.getElementById('rider'), clk = document.getElementById('mapclock');
    if (!el) return;
    const m = b.map, end = riderPoint(m);
    const set = (x, y) => el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    if (!m.move || !animate || reduced()) { set(end[0], end[1]); return; }
    const t0 = clock(), dur = 2600;
    const fromClock = m.clockFrom !== undefined ? m.clockFrom : (prev && prev.beat && prev.beat.time !== null ? prev.beat.time : b.time);
    const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    const step = () => {
      const k = Math.min(1, (clock() - t0) / dur), e = ease(k);
      const p = G.pointAt(m.move.path, m.move.from + (m.move.to - m.move.from) * e);
      set(p[0], p[1]);
      if (clk && b.time !== null) clk.textContent = S.clock(Math.round(fromClock + (b.time - fromClock) * e));
      if (k < 1) st.raf = requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame(step);
  }

  function overviewFx(stage, animate) {
    const ov = document.getElementById('ov'); if (!ov) return;
    const box = ov.getBoundingClientRect();
    const r = id => { const q = document.getElementById(id).getBoundingClientRect(); return {l: q.left - box.left, r: q.right - box.left, t: q.top - box.top, b: q.bottom - box.top, cx: q.left - box.left + q.width / 2, cy: q.top - box.top + q.height / 2}; };
    const ai = r('ov-ai'), g = r('ov-rtpl'), rd = r('ov-rider'), cu = r('ov-cust'), rv = r('ov-rev'), au = r('ov-aud');
    const wires = [[ai.r, ai.cy, g.l, ai.cy], [g.r, rd.cy, rd.l, rd.cy], [g.r, cu.cy, cu.l, cu.cy], [rv.cx, g.b, rv.cx, rv.t], [au.cx, g.b, au.cx, au.t]];
    const svg = `<svg class="ov-wires" aria-hidden="true"><defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#8995A1"/></marker></defs>${wires.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2 - (x2 > x1 ? 3 : 0)}" y2="${y2 - (y2 > y1 ? 3 : 0)}" stroke="#8995A1" stroke-width="2.5" stroke-dasharray="6 5" marker-end="url(#ah)"/>`).join('')}</svg>`;
    ov.insertAdjacentHTML('afterbegin', svg);
    if (stage < 1) return;
    const mk = (txt, ok) => { const p = document.createElement('div'); p.className = 'packet' + (ok ? ' ok' : ''); p.textContent = txt; ov.appendChild(p); return p; };
    const fly = (p, from, to, delay, dur, fade) => {
      const w = p.offsetWidth / 2, h = p.offsetHeight / 2;
      const kf = [{transform: `translate(${from[0] - w}px, ${from[1] - h}px)`, opacity: 1}, {transform: `translate(${to[0] - w}px, ${to[1] - h}px)`, opacity: fade ? 0 : 1}];
      p.style.transform = kf[animate ? 0 : 1].transform; if (!animate && fade) p.style.opacity = 0;
      if (animate) p.animate(kf, {duration: dur, delay, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both'});
    };
    fly(mk(S.clock(S.AI_PROPOSED)), [ai.cx, ai.cy], [g.l + 40, ai.cy], 100, 1100, true);
    const out = S.clock(S.results.CHECK01.deadline);
    fly(mk(out, true), [g.r - 30, rd.cy], [(g.r + rd.l) / 2, rd.cy], 1300, 900, false);
    fly(mk(out, true), [g.r - 30, cu.cy], [(g.r + cu.l) / 2, cu.cy], 1450, 900, false);
  }

  /* ---------- the hand-held phone: ordering (slide 2) and order status (slide 5) ---------- */
  // Index fingertip of the tapping hand as a fraction of its box (FINGER in render.js; transform-origin in app.css).
  const FINGER_TIP = {x: 0.136, y: 0.025};
  // Step timers run on a clock that stands still while paused, so a resumed step carries on where it stopped.
  function later(ms, fn) {
    const t = {due: clock() + ms, id: 0};
    t.arm = () => { t.id = setTimeout(() => { st.timers = st.timers.filter(x => x !== t); fn(); }, Math.max(0, t.due - clock())); };
    st.timers.push(t);
    if (!st.paused) t.arm();
  }
  function clearTimers() { st.timers.forEach(t => clearTimeout(t.id)); st.timers = []; }

  function handFx(h, prev, animate) {
    const hp = $('hp'), cam = $('hp-cam'), dev = $('hp-dev'), scr = $('hp-screen'), finger = $('hp-finger');
    if (!hp) return;
    const show = (name, arg) => { scr.innerHTML = R.apScreen(name, h, arg); };
    // Position inside the (possibly zoomed) device, in unscaled device pixels.
    const local = el => {
      const d = dev.getBoundingClientRect(), r = el.getBoundingClientRect(), k = d.width / dev.offsetWidth || 1;
      return [(r.left + r.width / 2 - d.left) / k, (r.top + r.height / 2 - d.top) / k];
    };
    const place = (x, y, instant) => {
      if (instant) finger.style.transition = 'none';
      finger.style.left = (x - finger.offsetWidth * FINGER_TIP.x) + 'px';
      finger.style.top = (y - finger.offsetHeight * FINGER_TIP.y) + 'px';
      if (instant) { void finger.offsetWidth; finger.style.transition = ''; }
    };
    const park = instant => place(dev.offsetWidth * 1.3, dev.offsetHeight * 1.08, instant);
    const point = sel => { const t = scr.querySelector(sel); if (t) place(...local(t)); };
    const tap = sel => {
      const t = scr.querySelector(sel); if (!t) return;
      const [x, y] = local(t);
      finger.classList.add('press'); later(150, () => finger.classList.remove('press'));
      t.classList.add('tapped');
      const rip = document.createElement('span'); rip.className = 'hp-ripple'; rip.style.left = x + 'px'; rip.style.top = y + 'px';
      dev.appendChild(rip); later(650, () => rip.remove());
    };
    const guide = k => document.querySelectorAll('#hp-guide li').forEach((li, i) => { li.classList.toggle('on', i <= k); li.classList.toggle('now', i === k); });
    if ((animate || st.hold) && !reduced() && h.script === 'order' && h.stage === 0) {
      // Start close on the top half of the screen, with no transition into the close-up.
      cam.style.transition = 'none'; cam.classList.remove('mid'); cam.classList.add('zoom'); show('home');
      void cam.offsetWidth; cam.style.transition = '';
    }
    park(true);
    if (st.hold) return guide(0);
    if (!animate || reduced()) return;

    if (h.script === 'status') {
      [1, 2, 3, 4].forEach((n, i) => later(i * 1300, () => show('status', n)));
      return;
    }
    if (h.stage === 0) {
      guide(0);
      const steps = [
        [1100, () => { cam.classList.remove('zoom'); cam.classList.add('mid'); }],
        [1800, () => { guide(1); point('[data-tap="rest"]'); }], [2500, () => tap('[data-tap="rest"]')], [2750, () => { guide(2); show('menu', {soup: 0, tea: 0}); }],
        [3300, () => point('[data-tap="add-soup"]')], [3950, () => tap('[data-tap="add-soup"]')], [4050, () => show('menu', {soup: 1, tea: 0})],
        [4450, () => tap('[data-tap="add-soup"]')], [4550, () => show('menu', {soup: 2, tea: 0})],
        [5050, () => point('[data-tap="add-tea"]')], [5700, () => tap('[data-tap="add-tea"]')], [5800, () => show('menu', {soup: 2, tea: 1})],
        [6300, () => point('[data-tap="cart"]')], [6950, () => tap('[data-tap="cart"]')], [7150, () => show('checkout')],
        [7750, () => { guide(3); point('[data-tap="pay"]'); }], [8400, () => tap('[data-tap="pay"]')], [8550, () => show('paying')],
        [8800, () => park()], [9600, () => { guide(4); show('paid'); }]
      ];
      steps.forEach(([ms, fn]) => later(ms, fn));
      return;
    }
    const fromCentre = prev && prev.beat && prev.beat.hand && prev.beat.hand.stage === 0;
    if (h.stage === 1) {
      // Slide the phone left (first time only), then send the order ticket into the AI dispatch panel.
      if (fromCentre) {
        hp.classList.remove('with-side'); cam.classList.add('mid'); hp.classList.add('anim');
        void hp.offsetWidth;
        hp.classList.add('with-side'); cam.classList.remove('mid');
      }
      hp.classList.add('fly');
      hp.style.setProperty('--ai-delay', fromCentre ? '2.1s' : '1.4s');
      later(fromCentre ? 1000 : 300, () => {
        const src = scr.querySelector('#ap-ticket'), dst = $('be-ticket');
        if (!src || !dst) return;
        const box = hp.getBoundingClientRect(), a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
        const fly = document.createElement('div'); fly.className = 'hp-fly'; fly.textContent = h.order.id + ' · ' + h.order.restaurant + ' → ' + h.order.drop;
        hp.appendChild(fly);
        const kf = [{left: a.left - box.left + 'px', top: a.top - box.top + 'px', width: a.width + 'px', opacity: 1},
                    {left: b.left - box.left + 'px', top: b.top - box.top + 'px', width: b.width + 'px', opacity: 1}];
        fly.animate(kf, {duration: 900, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both'}).onfinish = () => { dst.classList.add('landed'); fly.remove(); };
      });
    }
  }

  /* ---------- the talk as one sequence: PPT pages and website scenes, with keynote-style transitions ---------- */
  // st.show lists the items in playing order ('p3' = PPT page 3, 'w:slide-6' = website scene). The timeline (T)
  // lets the team drag items into another order; that order is kept in this browser only.
  const SHOW_KEY = 'rtpl.show';
  const pad2 = n => String(n).padStart(2, '0');
  const slideSrc = n => `./assets/slides/${pad2(n)}.webp`;
  function loadShow() {
    try {
      const v = JSON.parse(localStorage.getItem(SHOW_KEY) || 'null');
      const same = Array.isArray(v) && v.length === S.SHOW_DEFAULT.length && [...v].sort().join() === [...S.SHOW_DEFAULT].sort().join();
      if (same) return v;
    } catch (e) { /* storage blocked or bad data: use the default */ }
    return [...S.SHOW_DEFAULT];
  }
  function saveShow() { try { localStorage.setItem(SHOW_KEY, JSON.stringify(st.show)); } catch (e) { /* this visit only */ } }
  const sceneOf = it => SCENES.find(s => s.id === it.slice(2));
  function curK() { return st.pptOn ? st.k : st.show.indexOf('w:' + scene().id); }
  const pageOf = it => +it.slice(1);

  const ease = 'cubic-bezier(.65, 0, .25, 1)';
  const anim = (el, kf, ms, delay) => el.animate(kf, {duration: ms, delay: delay || 0, easing: ease, fill: 'both'});
  // State changes run on timers, not on animation 'finish' events: those never fire while the window is not drawn.
  const after = (ms, fn) => setTimeout(fn, ms);
  const settle = el => el.getAnimations().forEach(a => a.cancel());
  // A press during a transition is kept and carried out as soon as the transition ends.
  function free() { st.busy = false; const q = st.queued; st.queued = null; if (q === 'next') next(); else if (q === 'back') back(); }
  let pvFront = 'pv-a';
  function pvImg(n) {
    const back = $(pvFront === 'pv-a' ? 'pv-b' : 'pv-a');
    back.src = slideSrc(n); back.alt = 'PPT slide ' + n;
    $('pv-n').textContent = `PPT ${n} / ${S.PPT_TOTAL}`;
    return back;
  }
  function pvShowNow(n) {
    const img = pvImg(n), other = $(pvFront);
    img.getAnimations().forEach(a => a.cancel()); other.getAnimations().forEach(a => a.cancel());
    img.style.opacity = 1; other.style.opacity = 0; pvFront = img.id;
    $('pv').hidden = false; $('site').classList.add('away');
  }
  function pvHideNow() { $('pv').hidden = true; $('site').classList.remove('away'); $('site').getAnimations().forEach(a => a.cancel()); }
  function setHash() { if (location.hash !== hashFor()) history.replaceState(null, '', hashFor()); }
  // Wait for the page image, but never more than 0.8 s (a slow disk or network must not stop the talk).
  const ready = img => Promise.race([img.decode ? img.decode().catch(() => {}) : Promise.resolve(), new Promise(r => setTimeout(r, 800))]);

  // PPT page → PPT page: a slow dissolve with a slight push in.
  function pptToPpt(n, quick) {
    const img = pvImg(n), old = $(pvFront);
    st.busy = true;
    ready(img).then(() => {
      const ms = quick ? 260 : 1100;
      anim(old, [{opacity: 1, transform: 'scale(1)', filter: 'blur(0)'}, {opacity: 0, transform: 'scale(.985)', filter: 'blur(4px)'}], ms);
      anim(img, [{opacity: 0, transform: 'scale(1.035)', filter: 'blur(10px)'}, {opacity: 1, transform: 'scale(1)', filter: 'blur(0)'}], ms);
      pvFront = img.id;
      after(ms, () => { img.style.opacity = 1; old.style.opacity = 0; settle(img); settle(old); free(); });
      if (!quick) A.sfx('whoosh', .3);
    });
    setHash();
  }
  // Website → PPT page: the website sinks back and blurs away, the page comes forward.
  function webToPpt(n, quick) {
    st.busy = true;
    clearTimeout(st.loop); clearTimers(); cancelAnimationFrame(st.raf);
    const img = pvImg(n), other = $(pvFront);
    other.style.opacity = 0;
    st.pptOn = true;
    ready(img).then(() => {
      const ms = quick ? 280 : 1300;
      $('pv').hidden = false;
      anim($('site'), [{opacity: 1, transform: 'scale(1)', filter: 'blur(0)'}, {opacity: 0, transform: 'scale(.9)', filter: 'blur(14px)'}], ms * .8);
      anim($('pv'), [{opacity: 0}, {opacity: 1}], ms * .7, ms * .15);
      anim(img, [{opacity: 0, transform: 'scale(1.08)', filter: 'blur(12px)'}, {opacity: 1, transform: 'scale(1)', filter: 'blur(0)'}], ms, ms * .25);
      pvFront = img.id;
      after(ms * 1.25, () => { img.style.opacity = 1; settle(img); settle($('pv')); settle($('site')); $('site').classList.add('away'); free(); });
      if (!quick) A.sfx('whoosh', .55);
    });
    setHash();
  }
  // PPT page → website: the page opens up and blurs away, a LIVE card names what comes next, and the website
  // grows into place. This is the clear "switch from slides to demo" the tutor asked for.
  // Where the website screenshot sits on a PPT page (1920 × 1080 image): the zoom-through goes into it.
  const SHOT = {2: [108, 513, 370, 457], 6: [108, 200, 347, 502]};
  function fitShot([x, y, w, h]) {
    const W = innerWidth, H = innerHeight, s = Math.min(W / 1920, H / 1080), ox = (W - 1920 * s) / 2, oy = (H - 1080 * s) / 2;
    return {left: ox + x * s, top: oy + y * s, width: w * s, height: h * s};
  }
  // PPT page → website by flying into the screenshot on the page: the page zooms until the screenshot fills the
  // screen while the real website grows out of the same spot, then the page fades away. A LIVE badge confirms the switch.
  function zoomThrough(i, b, n) {
    st.busy = true;
    const W = innerWidth, H = innerHeight, r = fitShot(SHOT[n]), img = $(pvFront), site = $('site');
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, k = Math.max(W / r.width, H / r.height) * 1.04, s0 = 1 / k;
    const ms = 1300, zoom = 'cubic-bezier(.7, 0, .2, 1)';
    A.sfx('whoosh', .85);
    img.style.transformOrigin = `${cx}px ${cy}px`;
    img.animate([{transform: 'none', filter: 'blur(0)'}, {transform: `translate(${W / 2 - cx}px, ${H / 2 - cy}px) scale(${k})`, filter: 'blur(3px)'}],
      {duration: ms, easing: zoom, fill: 'both'});
    st.pptOn = false; st.entering = true;
    $('site').classList.remove('away');
    go(i, b, true);
    st.entering = false;
    site.style.transformOrigin = '50% 50%';
    site.animate([{transform: `translate(${cx - W / 2}px, ${cy - H / 2}px) scale(${s0})`}, {transform: 'none'}], {duration: ms, easing: zoom, fill: 'both'});
    $('pv').animate([{opacity: 1}, {opacity: 1, offset: .45}, {opacity: 0}], {duration: ms, easing: 'linear', fill: 'both'});
    const pill = document.createElement('div'); pill.className = 'live-pill'; pill.innerHTML = '<i></i>LIVE PROTOTYPE';
    document.body.appendChild(pill);
    after(2600, () => pill.remove());
    after(ms, () => { $('pv').hidden = true; settle($('pv')); settle(img); img.style.transformOrigin = ''; settle(site); site.style.transformOrigin = ''; free(); });
  }
  function pptToWeb(i, b, quick) {
    if (!quick && SHOT[SCENES[i].slide]) return zoomThrough(i, b, SCENES[i].slide);
    st.busy = true;
    const img = $(pvFront), sc = SCENES[i], live = $('live');
    const ms = quick ? 300 : 2000;
    if (!quick) {
      live.innerHTML = `<b><i></i>LIVE PROTOTYPE</b><span>PPT slide ${sc.slide} on the website · ${R.esc(sc.short)}</span>`;
      live.hidden = false;
      anim(live, [{opacity: 0, transform: 'translate(-50%, -50%) scale(.9)'}, {opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: .3},
        {opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: .75}, {opacity: 0, transform: 'translate(-50%, -50%) scale(1.06)'}], ms * 1.1);
      after(ms * 1.1, () => { live.hidden = true; settle(live); });
      A.sfx('whoosh', .75);
    }
    anim(img, [{transform: 'scale(1)', filter: 'blur(0)', opacity: 1}, {transform: 'scale(1.18)', filter: 'blur(16px)', opacity: 0}], ms * .7);
    setTimeout(() => {
      // Draw the scene now, so its own animation starts as it comes into view.
      st.pptOn = false; st.entering = true;
      $('site').classList.remove('away');
      go(i, b, true);
      st.entering = false;
      anim($('site'), [{opacity: 0, transform: 'scale(.94)', filter: 'blur(12px)'}, {opacity: 1, transform: 'scale(1)', filter: 'blur(0)'}], ms * .6);
      anim($('pv'), [{opacity: 1}, {opacity: 0}], ms * .35);
      after(ms * .35, () => { $('pv').hidden = true; settle($('pv')); settle(img); });
      after(ms * .6, () => { settle($('site')); free(); });
    }, ms * .4);
  }
  // Move to item k of the show. where: 'first' (going forward) or 'last' step of a scene (going back).
  function toItem(k, where, quick) {
    const it = st.show[k];
    if (!it) return;
    st.k = k;
    if (it[0] === 'p') return st.pptOn ? pptToPpt(pageOf(it), quick) : webToPpt(pageOf(it), quick);
    const i = SCENES.indexOf(sceneOf(it)), b = where === 'last' ? SCENES[i].beats.length - 1 : 0;
    if (st.pptOn) return pptToWeb(i, b, quick);
    go(i, b, where !== 'last');
  }
  function nextLabel() {
    const k = curK(), nx = k >= 0 ? st.show[k + 1] : null;
    if (!nx) return null;
    return nx[0] === 'p' ? 'PPT slide ' + pageOf(nx) : 'website, slide ' + sceneOf(nx).slide;
  }

  /* ---------- timeline: the order of the talk, PPT pages on top, website scenes below; drag to reorder ---------- */
  function openTimeline(v) {
    st.tl = v;
    $('tl').hidden = !v;
    if (v) { renderTimeline(); const now = $('tl').querySelector('.tl-col.now'); if (now) now.scrollIntoView({inline: 'center', block: 'nearest'}); }
  }
  function renderTimeline() {
    const cur = curK();
    $('tl-axis').innerHTML = st.show.map((it, k) => {
      const isP = it[0] === 'p';
      let card;
      if (isP) {
        const n = pageOf(it);
        card = `<div class="tl-card p" data-k="${k}" title="PPT slide ${n} · ${R.esc(S.PPT_OWNER[n] || '')}"><img src="./assets/slides/thumb/${pad2(n)}.webp" alt="" draggable="false"><span>PPT ${n}</span></div>`;
      } else {
        const sc = sceneOf(it);
        card = `<div class="tl-card w" data-k="${k}" title="Website scene for slide ${sc.slide}"><em>WEB</em><b>${sc.slide}</b><span>${R.esc(sc.short)}</span><small>${sc.beats.length} steps · ${R.esc(String(sc.presenter).split(' ')[0])}</small></div>`;
      }
      return `<div class="tl-col${k === cur ? ' now' : ''}" data-k="${k}"><div class="tl-lane">${isP ? card : ''}</div><div class="tl-tick"><i></i><span>${k + 1}</span></div><div class="tl-lane">${isP ? '' : card}</div></div>`;
    }).join('');
    // The tutor marks against the submitted PowerPoint, so warn when its pages are out of order.
    const pages = st.show.filter(x => x[0] === 'p').map(pageOf);
    const inOrder = pages.every((n, j) => j === 0 || n > pages[j - 1]);
    $('tl-warn').textContent = inOrder ? '' : 'PPT pages are not in the submitted order';
    $('tl-same').hidden = st.show.join() === S.SHOW_DEFAULT.join();
  }
  // Pointer drag: a card follows the pointer along the axis and drops between two columns.
  let drag = null;
  document.addEventListener('pointerdown', e => {
    const card = e.target.closest && e.target.closest('.tl-card');
    if (!card || e.button !== 0) return;
    drag = {card, k: +card.dataset.k, x0: e.clientX, moved: false, to: +card.dataset.k};
    card.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) < 6) return;
    drag.moved = true;
    drag.card.classList.add('dragging');
    drag.card.style.transform = `translateX(${dx}px)`;
    const cols = [...$('tl-axis').children];
    let to = cols.length;
    for (let j = 0; j < cols.length; j++) { const r = cols[j].getBoundingClientRect(); if (e.clientX < r.left + r.width / 2) { to = j; break; } }
    drag.to = to;
    cols.forEach((c, j) => c.classList.toggle('drop', j === to && j !== drag.k && j !== drag.k + 1));
    $('tl-axis').classList.toggle('drop-end', to === cols.length && drag.k !== cols.length - 1);
  });
  document.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) { openTimeline(false); return toItem(d.k, 'first', true); }
    const curId = st.pptOn ? st.show[st.k] : null;
    const item = st.show.splice(d.k, 1)[0];
    st.show.splice(d.to > d.k ? d.to - 1 : d.to, 0, item);
    if (curId) st.k = st.show.indexOf(curId);
    saveShow(); renderTimeline(); renderChrome();
  });

  /* ---------- sandbox ---------- */
  function sandboxCompute() {
    try { st.sbErr = null; return S.sandbox(st.sb); } catch (e) { st.sbErr = e.message; return null; }
  }
  function renderSandboxOut() {
    const out = sandboxCompute(), el = $('sb-out');
    if (el) { el.innerHTML = R.sandboxOut(out, st.sbErr); bars(false); }
  }

  /* ---------- looping: every step replays its animation after a pause to read it ---------- */
  function cycleFor(b) {
    if (b.center === 'sandbox') return 0;
    if (b.center === 'handphone') return b.hand.script === 'status' ? 9000 : b.hand.stage === 0 ? 14000 : 8500;
    return b.center === 'map' ? 7500 : 7000;
  }
  function scheduleLoop() {
    clearTimeout(st.loop);
    const ms = cycleFor(beat());
    if (st.looping && ms && !reduced() && !st.gate && !st.hold && !st.paused && !st.pptOn) st.loop = setTimeout(replay, ms);
  }
  function restartCss(el) {
    if (!el || !el.getAnimations) return;
    el.getAnimations({subtree: true}).forEach(a => {
      const t = a.effect && a.effect.getTiming && a.effect.getTiming();
      if (t && t.iterations !== Infinity) { a.currentTime = 0; a.play(); }
    });
  }
  function replay() {
    const s = scene(), b = beat();
    const prevBeat = st.b > 0 ? {scene: s, beat: s.beats[st.b - 1], b: st.b - 1} : null;
    // The review desk keeps what the presenter typed, so only its CSS motion replays.
    if (b.center === 'review') restartCss($('center'));
    else renderCenter(b.center === 'handphone' && b.hand.stage === 1 ? null : prevBeat, true);
    restartCss($('left')); restartCss($('right'));
    scheduleLoop();
  }
  /* ---------- pause: freeze the current step (motion, step timers, replays, music) until resumed ---------- */
  let pausedAt = 0, pausedFor = 0;
  function clock() { return (st.paused ? pausedAt : performance.now()) - pausedFor; }
  function setPaused(v) {
    if (v === st.paused) return;
    if (v) {
      pausedAt = performance.now();
      st.paused = true;
      clearTimeout(st.loop);
      st.timers.forEach(t => clearTimeout(t.id));
      // CSS animations, transitions and scripted animations that are still running; finished ones stay as they are.
      st.pausedAnims = document.getAnimations().filter(a => a.playState === 'running');
      st.pausedAnims.forEach(a => a.pause());
      A.freeze(true);
    } else {
      pausedFor += performance.now() - pausedAt;
      st.paused = false;
      st.pausedAnims.forEach(a => { if (a.playState === 'paused') a.play(); });
      st.pausedAnims = [];
      st.timers.forEach(t => t.arm());
      A.freeze(false);
      scheduleLoop();
    }
    const btn = $('pause-btn');
    btn.setAttribute('aria-pressed', st.paused); btn.textContent = st.paused ? 'Resume' : 'Pause';
    renderChrome();
  }
  function setLooping(v) {
    st.looping = v; $('loop-btn').setAttribute('aria-pressed', v); $('loop-btn').classList.toggle('off', !v);
    scheduleLoop();
  }

  /* ---------- music and the presenter name card ---------- */
  function soundButton(on) { const el = $('sound-btn'); el.setAttribute('aria-pressed', on); el.classList.toggle('off', !on); el.title = on ? 'Music on (M to mute)' : 'Music off (M to turn on)'; }
  A.onChange(soundButton);
  // While the opening holds, a stray click (for example to focus the window) stays silent; go() unlocks on start.
  ['keydown', 'pointerdown'].forEach(t => document.addEventListener(t, () => { if (!st.hold) A.unlock(); }, {once: false, passive: true}));

  // A big name card slides in when a new presenter takes over, then shrinks into the
  // footer badge, which stays until the next presenter.
  let cardTimer = 0;
  function nameCard(s, animate) {
    clearTimeout(cardTimer);
    const old = document.querySelector('.namecard'); if (old) old.remove();
    const chip = $('speaker'), known = s.presenter && S.SECTIONS[s.presenter];
    chip.innerHTML = known ? `<b>${R.esc(s.presenter)}</b><span>${R.esc(S.SECTIONS[s.presenter])}</span>` : '<b>Q&amp;A</b><span>Section owner answers first</span>';
    chip.classList.remove('land');
    if (!known || !animate || reduced()) { chip.classList.add('show'); return; }
    chip.classList.remove('show');
    const el = document.createElement('div'); el.className = 'namecard';
    el.innerHTML = chip.innerHTML;
    document.querySelector('.stage').appendChild(el);
    cardTimer = setTimeout(() => {
      const a = el.getBoundingClientRect(), b = chip.getBoundingClientRect();
      const dock = el.animate([{transform: 'none', opacity: 1}, {transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width}, ${b.height / a.height})`, opacity: .4}],
        {duration: 650, easing: 'cubic-bezier(.5, 0, .3, 1)', fill: 'forwards'});
      dock.onfinish = () => { el.remove(); chip.classList.add('show', 'land'); };
    }, 2800);
  }

  // A large "PPT slide N" flashes in the middle whenever the website moves to a new PPT slide.
  let flashTimer = 0;
  function pptFlash(s, animate) {
    clearTimeout(flashTimer);
    const old = document.querySelector('.pptflash'); if (old) old.remove();
    const b = $('ppt'); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
    if (!animate || reduced()) return;
    const el = document.createElement('div'); el.className = 'pptflash'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = R.pptFlash(s);
    document.querySelector('.stage').appendChild(el);
    flashTimer = setTimeout(() => el.remove(), 1900);
  }

  /* ---------- render ---------- */
  function render(prev, animate) {
    const newScene = !prev || prev.scene !== scene();
    renderChrome();
    renderPhones(newScene);
    renderCenter(prev, animate);
    if (newScene && animate) { const h = $('title'); h.classList.remove('in'); void h.offsetWidth; h.classList.add('in'); }
    if (newScene && scene().slide && !st.entering) pptFlash(scene(), animate);
    if (!prev || prev.scene.presenter !== scene().presenter) nameCard(scene(), animate);
    scheduleLoop();
  }

  /* ---------- actions ---------- */
  function review(action) {
    const live = st.live;
    if (action === 'overdue') {
      live.overdue = true; live.msg = 'Review target missed. The case is escalated and all four effects stay SUSPENDED: time alone cannot uphold a penalty.'; live.msgTone = 'info';
      return refreshReview();
    }
    const auth = $('rv-auth'), out = $('rv-outcome'), reason = $('rv-reason');
    live.authorised = auth ? auth.checked : true; live.outcome = out ? out.value : 'REVERSE'; live.reason = reason ? reason.value : S.REVIEW_REASON;
    const pending = S.results.APPEAL04;
    const at = live.overdue ? pending.appeal.reviewDue + 1 : 54;
    try {
      const d = C.review(pending, {authorised: live.authorised, outcome: live.outcome, reason: live.reason, at});
      if (d.appeal.status === 'REVERSE' && !live.overdue && live.reason.trim() === S.REVIEW_REASON) return go(st.i, 2, true);
      live.decision = d; live.msg = null;
      live.caption = d.appeal.status === 'REVERSE' ? 'An authorised reviewer reversed the assessment after the review target. All four effects are protected again.' : 'The reviewer upheld the assessment with a recorded reason. The effects stay eligible; the rider sees the reason.';
      live.result = d.appeal.status === 'REVERSE' ? 'All four effects PROTECTED. Appeal REVERSE.' : 'Appeal UPHOLD. Reason recorded.';
      renderChrome(); renderPhones(); refreshReview();
    } catch (e) {
      live.msg = e.message; live.msgTone = 'err';
      refreshReview();
    }
  }
  function refreshReview() { $('center').innerHTML = R.review(beat().review, st.live); }

  function download() {
    const rec = beat().audit ? beat().audit.record : S.results.AUDIT04;
    const blob = new Blob([JSON.stringify(rec, null, 2) + '\n'], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'RTPL-synthetic-audit.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-go],[data-beat],[data-act],#next,#prev,#restart,#notes-btn,#qa-btn,#sound-btn,#loop-btn,#ppt-btn,#pause-btn,#tl-btn');
    if (!t) { if (!e.target.closest('#qa')) closeQA(); return; }
    if (t.id === 'pause-btn') return setPaused(!st.paused);
    if (t.id === 'tl-btn') return openTimeline(!st.tl);
    if (t.id === 'ppt-btn') return st.deckOpen ? closeDeck(false) : openDeck('bar');
    if (t.id === 'sound-btn') return A.toggle();
    if (t.id === 'loop-btn') return setLooping(!st.looping);
    if (t.id === 'next') return next();
    if (t.id === 'prev') return back();
    if (t.id === 'restart') return go(st.i, 0, true);
    if (t.id === 'notes-btn') return toggleNotes();
    if (t.id === 'qa-btn') { const q = $('qa'); const open = !q.classList.contains('open'); q.classList.toggle('open', open); t.setAttribute('aria-expanded', open); return; }
    if (t.dataset.go) { closeQA(); const i = SCENES.findIndex(s => s.id === t.dataset.go); return go(i, 0, true); }
    if (t.dataset.beat) return go(st.i, +t.dataset.beat, +t.dataset.beat === st.b + 1);
    const act = t.dataset.act;
    if (act === 'tl-open') return openTimeline(true);
    if (act === 'tl-close') return openTimeline(false);
    if (act === 'tl-reset') { st.show = [...S.SHOW_DEFAULT]; saveShow(); st.k = Math.max(0, curK()); return renderTimeline(); }
    if (act === 'gate-go') return gateGo();
    if (act === 'gate-stay') return back();
    if (act === 'gate-ppt') return openDeck('gate');
    if (act === 'deck-back') return closeDeck(true);
    if (act === 'deck-setup') return openSetup();
    if (act === 'ds-cancel') return closeSetup();
    if (act === 'ds-forget') { deckStore(null); setDeck(null); return closeSetup(); }
    if (act === 'next') return next();
    if (act === 'appeal') {
      if (scene().id === 'slide-10' && st.b === 0) return next();
      return go(SCENES.findIndex(s => s.id === 'slide-10'), 1, true);
    }
    if (act === 'decide' || act === 'overdue') return review(act);
    if (act === 'download') return download();
    if (act === 'sb-reset') { st.sb = {...S.SANDBOX_DEFAULT}; return go(st.i, 0, false); }
  });

  document.addEventListener('input', e => {
    const k = e.target.dataset && e.target.dataset.sb;
    if (!k) return;
    st.sb[k] = e.target.type === 'checkbox' ? e.target.checked : (e.target.value === '' ? 0 : Number(e.target.value));
    renderSandboxOut(); renderPhones();
  });

  function closeQA() { $('qa').classList.remove('open'); $('qa-btn').setAttribute('aria-expanded', 'false'); }
  function toggleNotes() { st.notes = !st.notes; $('notes').hidden = !st.notes; $('notes-btn').setAttribute('aria-pressed', st.notes); }

  let lastStep = 0;
  document.addEventListener('keydown', e => {
    // The opening show (splash, film, team) takes the keys until it hands over to PPT page 1.
    if (window.RTPLStage && window.RTPLStage.active()) { window.RTPLStage.key(e); return; }
    if (!$('deck-setup').hidden) { if (e.key === 'Escape') closeSetup(); return; }
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const step = k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'ArrowLeft' || k === 'PageUp';
    if (k === 't' || k === 'T') return openTimeline(!st.tl);
    if (k === 'Escape' && st.tl) return openTimeline(false);
    if ((k === 'p' || k === 'P') && DECK_UI) return st.deck ? (st.deckOpen ? closeDeck(false) : openDeck(st.gate ? 'gate' : 'bar')) : openSetup();
    // Slides showing but the page has the keyboard (a button was clicked): hand the keys back to the slides.
    if (st.deckOpen) { if (step) { e.preventDefault(); const f = $('deck-iframe'); if (f) f.focus(); } return; }
    if (step) {
      e.preventDefault();
      // A held-down key or a double press of the clicker moves only one step.
      const now = performance.now();
      if (e.repeat || now - lastStep < 350) return;
      lastStep = now;
    }
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') next();
    else if (k === 'ArrowLeft' || k === 'PageUp') back();
    else if (k === 'Escape' && st.gate) back();
    else if (k === 'r' || k === 'R') go(st.i, 0, true);
    else if (k === 'n' || k === 'N') toggleNotes();
    else if (k === 'm' || k === 'M') A.toggle();
    else if (k === 'l' || k === 'L') setLooping(!st.looping);
    // K, or a clicker's blank-screen button (it sends B or .), pauses and resumes.
    else if (k === 'k' || k === 'K' || k === 'b' || k === 'B' || k === '.') setPaused(!st.paused);
    else if (k === 'Escape') closeQA();
    else if (/^[0-9]$/.test(k)) {
      const slide = {'0': 10, '1': 11}[k] || +k;
      const i = SCENES.findIndex(s => s.slide === slide);
      if (i >= 0) go(i, 0, true);
    }
  });

  window.addEventListener('hashchange', () => {
    const m = /^#ppt=(.+)$/.exec(location.hash);
    if (m) { history.replaceState(null, '', location.pathname + location.search + hashFor()); return takePptLink(m[1]); }
    if (location.hash !== hashFor() && fromHash()) {
      closeDeck(false); hideGate(); st.hold = false;
      if (st.pptOn) { clearTimeout(st.loop); pvShowNow(pageOf(st.show[st.k])); } else { pvHideNow(); render(null, false); }
    }
  });
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (beat().center === 'overview' || beat().center === 'handphone') renderCenter(null, false); }, 150); });

  document.body.classList.toggle('calm', CALM);
  buildRail();
  soundButton(A.on);
  const pptLink = /^#ppt=(.+)$/.exec(location.hash);   // read before render() rewrites the address
  const initialHash = location.hash.length > 1;
  st.show = loadShow();
  // Opens on the first item, the cover page; a link to a page (#ppt-6) or a scene (#slide-6/2) still works.
  if (!fromHash()) { st.pptOn = st.show[0][0] === 'p'; st.k = 0; if (!st.pptOn) st.i = SCENES.indexOf(sceneOf(st.show[0])); }
  st.hold = false;
  if (st.pptOn) {
    // The website is drawn underneath (still), ready for the first switch.
    const w = st.show.find(x => x[0] === 'w'); st.i = SCENES.indexOf(sceneOf(w)); st.b = 0;
    render(null, false); clearTimeout(st.loop);
    pvShowNow(pageOf(st.show[st.k])); setHash();
  } else render(null, true);
  // A fresh visit (no #… in the address) starts with the opening show; ?nointro, ?calm or any link to a page skips it.
  if (!location.search.includes('nointro') && !CALM && !initialHash && window.RTPLStage) window.RTPLStage.start();
  // PowerPoint slides: a link saved earlier on this computer, a one-click #ppt=<link>, or ?ppt to paste one.
  setDeck(deckSaved());
  if (pptLink) takePptLink(pptLink[1]);
  const query = new URLSearchParams(location.search);
  if (query.has('ppt')) {
    query.delete('ppt');
    history.replaceState(null, '', location.pathname + (query.toString() ? '?' + query : '') + location.hash);
    openSetup();
  }
  window.RTPLApp = {go, next, back, state: st};
})();
