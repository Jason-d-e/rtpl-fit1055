/* Presenter controller: one scene per slide, one beat per → press. */
(function () {
  'use strict';
  const S = window.RTPLScenes, R = window.RTPLRender, G = window.RTPLGeo, C = window.RTPLCore;
  const A = window.RTPLSound || {on: false, unlock() {}, toggle() { return false; }, onChange() {}, mood() {}, fx() {}};
  const $ = id => document.getElementById(id);
  const SCENES = S.SCENES;
  const MAIN = SCENES.filter(s => s.group === 'main');
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const st = {i: 0, b: 0, live: {}, sb: {...S.SANDBOX_DEFAULT}, prev: null, raf: 0, notes: false, timers: [], looping: true, loop: 0};

  /* ---------- navigation ---------- */
  function scene() { return SCENES[st.i]; }
  function beat() { return scene().beats[st.b]; }

  function go(i, b, animate) {
    const prev = {scene: scene(), beat: beat(), i: st.i, b: st.b};
    st.i = Math.max(0, Math.min(SCENES.length - 1, i));
    st.b = Math.max(0, Math.min(scene().beats.length - 1, b));
    st.live = {};
    render(prev, !!animate);
  }
  function next() {
    const s = scene();
    if (st.b < s.beats.length - 1) return go(st.i, st.b + 1, true);
    const m = MAIN.indexOf(s);
    if (m >= 0 && m < MAIN.length - 1) go(SCENES.indexOf(MAIN[m + 1]), 0, true);
  }
  function back() {
    if (st.b > 0) return go(st.i, st.b - 1, false);
    const m = MAIN.indexOf(scene());
    if (m > 0) { const p = SCENES.indexOf(MAIN[m - 1]); go(p, SCENES[p].beats.length - 1, false); }
  }

  function hashFor() { return '#' + scene().id + (st.b ? '/' + (st.b + 1) : ''); }
  function fromHash() {
    const m = /^#([a-z0-9-]+)(?:\/(\d+))?$/.exec(location.hash || '');
    if (!m) return false;
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
    $('tag').innerHTML = (s.slide ? `<span class="slide">Slide ${s.slide}</span><span class="who">${R.esc(s.presenter)}</span>` : '<span class="slide">Q&amp;A extra</span>') +
      (s.caseNum ? `<span class="case">Case ${R.esc(s.caseNum)}</span>` : '') + '<span>Made-up order A101 · Noodle Kitchen → Maple Court</span>';
    $('title').textContent = s.title;
    const cap = st.live.caption || b.caption;
    const res = st.live.result !== undefined ? st.live.result : b.result;
    $('caption').textContent = cap;
    $('result').innerHTML = res ? `<span class="result">${R.esc(res)}</span>` : '';
    $('dots').innerHTML = s.beats.length > 1 ? s.beats.map((_, k) => `<button type="button" class="${k <= st.b ? 'on' : ''}" data-beat="${k}" aria-label="Step ${k + 1} of ${s.beats.length}"></button>`).join('') : '';
    const m = MAIN.indexOf(s);
    $('hint').textContent = st.b < s.beats.length - 1 ? `Step ${st.b + 1} of ${s.beats.length}` : m >= 0 && m < MAIN.length - 1 ? `Next: slide ${MAIN[m + 1].slide}` : s.group === 'main' ? 'Back to the slides' : '';
    $('next').disabled = st.b === s.beats.length - 1 && (m < 0 || m === MAIN.length - 1);
    $('notes').innerHTML = `<b>${s.slide ? 'Slide ' + s.slide + ' · ' + R.esc(s.presenter) : 'Q&A extra'}</b>${R.esc(b.note || '')}<br><small>Keys: <kbd>→</kbd>/<kbd>Space</kbd> next · <kbd>←</kbd> back · <kbd>R</kbd> restart scene · <kbd>N</kbd> notes · <kbd>M</kbd> sound · <kbd>L</kbd> loop · <kbd>2</kbd>, <kbd>5</kbd>–<kbd>9</kbd>, <kbd>0</kbd>=10, <kbd>1</kbd>=11 jump</small>`;
    $('notes').hidden = !st.notes;
    if (location.hash !== hashFor()) history.replaceState(null, '', hashFor());
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
    const t0 = performance.now(), dur = 2600;
    const fromClock = m.clockFrom !== undefined ? m.clockFrom : (prev && prev.beat && prev.beat.time !== null ? prev.beat.time : b.time);
    const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = ease(k);
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
    if (animate) { A.fx('whoosh', 150); A.fx('ping', 1400); }
    fly(mk(S.clock(S.AI_PROPOSED)), [ai.cx, ai.cy], [g.l + 40, ai.cy], 100, 1100, true);
    const out = S.clock(S.results.CHECK01.deadline);
    fly(mk(out, true), [g.r - 30, rd.cy], [(g.r + rd.l) / 2, rd.cy], 1300, 900, false);
    fly(mk(out, true), [g.r - 30, cu.cy], [(g.r + cu.l) / 2, cu.cy], 1450, 900, false);
  }

  /* ---------- the hand-held phone: ordering (slide 2) and order status (slide 5) ---------- */
  function later(ms, fn) { st.timers.push(setTimeout(fn, ms)); }
  function clearTimers() { st.timers.forEach(clearTimeout); st.timers = []; }

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
      finger.style.left = (x - finger.offsetWidth * 0.471) + 'px';
      finger.style.top = (y - finger.offsetHeight * 0.0133) + 'px';
      if (instant) { void finger.offsetWidth; finger.style.transition = ''; }
    };
    const park = instant => place(dev.offsetWidth * 1.3, dev.offsetHeight * 1.08, instant);
    const point = sel => { const t = scr.querySelector(sel); if (t) place(...local(t)); };
    const tap = sel => {
      const t = scr.querySelector(sel); if (!t) return;
      const [x, y] = local(t);
      finger.classList.add('press'); later(150, () => finger.classList.remove('press')); A.fx('tap');
      t.classList.add('tapped');
      const rip = document.createElement('span'); rip.className = 'hp-ripple'; rip.style.left = x + 'px'; rip.style.top = y + 'px';
      dev.appendChild(rip); later(650, () => rip.remove());
    };
    if (animate && !reduced() && h.script === 'order' && h.stage === 0) {
      // Start close on the top half of the screen, with no transition into the close-up.
      cam.style.transition = 'none'; cam.classList.remove('mid'); cam.classList.add('zoom'); show('home');
      void cam.offsetWidth; cam.style.transition = '';
    }
    park(true);
    if (!animate || reduced()) return;

    if (h.script === 'status') {
      [1, 2, 3, 4].forEach((n, i) => later(i * 1300, () => { show('status', n); A.fx(n === 4 ? 'success' : 'ping'); }));
      return;
    }
    if (h.stage === 0) {
      const items = [...document.querySelectorAll('#hp-guide li')];
      const guide = k => items.forEach((li, i) => { li.classList.toggle('on', i <= k); li.classList.toggle('now', i === k); });
      guide(0);
      const steps = [
        [1100, () => { cam.classList.remove('zoom'); cam.classList.add('mid'); }],
        [1800, () => { guide(1); point('[data-tap="rest"]'); }], [2500, () => tap('[data-tap="rest"]')], [2750, () => { guide(2); show('menu', {soup: 0, tea: 0}); }],
        [3300, () => point('[data-tap="add-soup"]')], [3950, () => tap('[data-tap="add-soup"]')], [4050, () => show('menu', {soup: 1, tea: 0})],
        [4450, () => tap('[data-tap="add-soup"]')], [4550, () => show('menu', {soup: 2, tea: 0})],
        [5050, () => point('[data-tap="add-tea"]')], [5700, () => tap('[data-tap="add-tea"]')], [5800, () => show('menu', {soup: 2, tea: 1})],
        [6300, () => point('[data-tap="cart"]')], [6950, () => tap('[data-tap="cart"]')], [7150, () => show('checkout')],
        [7750, () => { guide(3); point('[data-tap="pay"]'); }], [8400, () => tap('[data-tap="pay"]')], [8550, () => show('paying')],
        [8800, () => park()], [9600, () => { guide(4); show('paid'); A.fx('chime'); }]
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
        A.fx('whoosh');
        const src = scr.querySelector('#ap-ticket'), dst = $('be-ticket');
        if (!src || !dst) return;
        const box = hp.getBoundingClientRect(), a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
        const fly = document.createElement('div'); fly.className = 'hp-fly'; fly.textContent = h.order.id + ' · ' + h.order.restaurant + ' → ' + h.order.drop;
        hp.appendChild(fly);
        const kf = [{left: a.left - box.left + 'px', top: a.top - box.top + 'px', width: a.width + 'px', opacity: 1},
                    {left: b.left - box.left + 'px', top: b.top - box.top + 'px', width: b.width + 'px', opacity: 1}];
        fly.animate(kf, {duration: 900, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both'}).onfinish = () => { dst.classList.add('landed'); fly.remove(); A.fx('ping', 250); };
      });
    }
  }

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
    if (st.looping && ms && !reduced()) st.loop = setTimeout(replay, ms);
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
    cue(b);
    scheduleLoop();
  }
  function setLooping(v) {
    st.looping = v; $('loop-btn').setAttribute('aria-pressed', v); $('loop-btn').classList.toggle('off', !v);
    scheduleLoop();
  }

  /* ---------- sound and the presenter name card ---------- */
  function cue(b) {
    A.mood(b.mood || 'calm');
    if (b.sfx) A.fx(b.sfx, b.sfxAt);
  }
  function soundButton(on) { const el = $('sound-btn'); el.setAttribute('aria-pressed', on); el.classList.toggle('off', !on); el.title = on ? 'Sound on (M to mute)' : 'Sound off (M to turn on)'; }
  A.onChange(soundButton);
  ['keydown', 'pointerdown'].forEach(t => document.addEventListener(t, () => A.unlock(), {once: false, passive: true}));

  function nameCard(s) {
    const old = document.querySelector('.namecard'); if (old) old.remove();
    if (!s.presenter || !S.SECTIONS[s.presenter]) return;
    const el = document.createElement('div'); el.className = 'namecard';
    el.innerHTML = `<b>${R.esc(s.presenter)}</b><span>${R.esc(S.SECTIONS[s.presenter])}</span>`;
    document.querySelector('.stage').appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  /* ---------- render ---------- */
  function render(prev, animate) {
    const newScene = !prev || prev.scene !== scene();
    renderChrome();
    renderPhones(newScene);
    renderCenter(prev, animate);
    if (newScene && animate) {
      const h = $('title'); h.classList.remove('in'); void h.offsetWidth; h.classList.add('in');
      if (!prev || prev.scene.presenter !== scene().presenter) nameCard(scene());
    }
    if (animate) cue(beat()); else A.mood(beat().mood || 'calm');
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
    const t = e.target.closest('[data-go],[data-beat],[data-act],#next,#prev,#restart,#notes-btn,#qa-btn,#sound-btn,#loop-btn');
    if (!t) { if (!e.target.closest('#qa')) closeQA(); return; }
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

  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { e.preventDefault(); next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); back(); }
    else if (k === 'r' || k === 'R') go(st.i, 0, true);
    else if (k === 'n' || k === 'N') toggleNotes();
    else if (k === 'm' || k === 'M') A.toggle();
    else if (k === 'l' || k === 'L') setLooping(!st.looping);
    else if (k === 'Escape') closeQA();
    else if (/^[0-9]$/.test(k)) {
      const slide = {'0': 10, '1': 11}[k] || +k;
      const i = SCENES.findIndex(s => s.slide === slide);
      if (i >= 0) go(i, 0, true);
    }
  });

  window.addEventListener('hashchange', () => { if (location.hash !== hashFor() && fromHash()) render(null, false); });
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (beat().center === 'overview' || beat().center === 'handphone') renderCenter(null, false); }, 150); });

  buildRail();
  soundButton(A.on);
  fromHash();
  render(null, true);
  window.RTPLApp = {go, next, back, state: st};
})();
