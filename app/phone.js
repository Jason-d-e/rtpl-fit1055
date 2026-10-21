/* The phone: a home screen with the three places RTPL shows up (rider, customer, reviewer)
   plus Settings. Taps go through RTPLPhone.act, which calls rtpl-core.js. */
(function () {
  'use strict';
  const P = window.RTPLPhone, O = P.ORDER, clock = P.clock;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

  let S = P.start();
  const ui = {app: 'home', why: false, err: null, reviewErr: null, auth: true, outcome: 'REVERSE', reason: '', message: ''};

  const APPS = {
    rider: {name: 'Lantern Rider', cls: 'rider'},
    customer: {name: 'Lantern Eats', cls: 'eats'},
    review: {name: 'RTPL Review', cls: 'review'},
    settings: {name: 'Settings', cls: 'settings'}
  };
  const ICON = {
    rider: '<svg viewBox="0 0 32 32"><circle cx="9" cy="23" r="4" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="24" cy="23" r="4" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M9 23h8l4-9h-6m6 0 3 9M15 14l-3-4H8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="3" y="11" width="8" height="7" rx="1.5" fill="currentColor"/></svg>',
    eats: '<svg viewBox="0 0 32 32"><path d="M5 15h22a11 11 0 0 1-22 0Z" fill="currentColor"/><path d="M11 6c0 2 2 2 2 4s-2 2-2 4M16 5c0 2 2 2 2 4s-2 2-2 4M21 6c0 2 2 2 2 4s-2 2-2 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    review: '<svg viewBox="0 0 32 32"><path d="M16 5v22M9 27h14M6 9h20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6 9 2 18a4.5 4.5 0 0 0 8 0Zm20 0-4 9a4.5 4.5 0 0 0 8 0Z" fill="currentColor"/></svg>',
    settings: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="4.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M16 3v5M16 24v5M3 16h5M24 16h5M6.8 6.8l3.5 3.5M21.7 21.7l3.5 3.5M6.8 25.2l3.5-3.5M21.7 10.3l3.5-3.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    lock: '<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2H13v8H3V7h1.5Zm1.5 0h4V5a2 2 0 0 0-4 0v2Z"/></svg>',
    shield: '<svg viewBox="0 0 16 16" width="13" height="13"><path fill="currentColor" d="M8 1 2.5 3v4.3c0 3.4 2.3 6.3 5.5 7.4 3.2-1.1 5.5-4 5.5-7.4V3L8 1Zm-1 10.2L4.3 8.5l1.1-1.1L7 9l3.6-3.6 1.1 1.1L7 11.2Z"/></svg>'
  };

  /* ---------- actions ---------- */
  function act(type, args) {
    const before = S;
    const r = P.act(S, type, args);
    if (r.error) { ui.err = r.error; render(); return false; }
    S = r.state; ui.err = null;
    // Tell the other apps when something they show has changed.
    if (S.deadline !== before.deadline && before.deadline !== null) toast('customer', `Arrival updated to ${clock(S.deadline)}`);
    else if (type === 'deliver') toast('customer', `Delivered at ${clock(S.completed)}`);
    if (type === 'appeal') toast('review', 'New appeal: order A101');
    if (type === 'review') toast('rider', `Review complete: ${S.decision.appeal.status === 'REVERSE' ? 'reversed' : 'upheld'}`);
    render();
    return true;
  }
  function restart(fresh) {
    S = P.start({fresh: fresh === undefined ? S.fresh : fresh});
    Object.assign(ui, {why: false, err: null, reviewErr: null, auth: true, outcome: 'REVERSE', reason: '', message: '', stars: 0});
    render();
  }

  let toastTimer = 0;
  function toast(app, text) {
    if (ui.app === app) return;
    const el = $('toast');
    el.innerHTML = `<button type="button" data-open="${app}"><b class="ic ${APPS[app].cls}">${ICON[APPS[app].cls]}</b><span><strong>${APPS[app].name}</strong>${esc(text)}</span><small>now</small></button>`;
    el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
  }

  function open(app) {
    ui.app = app; ui.err = null;
    if (S.seen[app] === false) S.seen[app] = true;
    $('toast').hidden = true;
    render();
    $('view').scrollTop = 0;
  }

  /* ---------- pieces ---------- */
  const appBar = (app, extra) => `<header class="ab ${APPS[app].cls}"><button type="button" class="ab-back" data-open="home" aria-label="Home">‹</button><b>${APPS[app].name}</b>${extra || ''}</header>`;
  const err = () => ui.err ? `<p class="err">${esc(ui.err)}</p>` : '';
  const rule = r => r && r !== '—' ? `<span class="rule">${r}</span>` : '';
  const lastRule = () => S.log.find(l => l.rule !== '—') || {};
  const whyBox = () => {
    const parts = P.BASE, travel = parts.distance / parts.legalSpeed * 60;
    return `<details class="why"${ui.why ? ' open' : ''} data-why>
      <summary>Why ${clock(S.deadline)}?</summary>
      <div class="why-b">
        <p><b class="ai">AI proposed ${clock(P.AI)}</b> · ${P.AI} min. With 22 min of stops, that leaves 2 min for ${O.km} km: <b>120 km/h</b>.</p>
        <div class="bars"><span style="--w:${P.AI / 34 * 100}%" class="b-ai">AI ${P.AI}</span></div>
        <div class="bars"><span style="--w:${travel / 34 * 100}%">Ride ${travel}</span><span style="--w:${4 / 34 * 100}%">4</span><span style="--w:${10 / 34 * 100}%">Food 10</span><span style="--w:${6 / 34 * 100}%">6</span><span style="--w:${2 / 34 * 100}%">2</span></div>
        <p>Legal minimum = ride ${travel} + lights 4 + food 10 + building 6 + hand-over 2 = <b>34 min</b>. RTPL sends the longer time. ${rule('P02')}</p>
      </div></details>`;
  };
  const orderHead = () => `<div class="oh"><span class="pin p">P</span><div><b>${O.restaurant}</b><small>${O.items}</small></div></div>
    <div class="oh"><span class="pin d">D</span><div><b>${O.drop}</b><small>${O.km} km · order ${O.id}</small></div></div>`;
  const steps = (k, names) => `<ol class="steps">${names.map((n, i) => `<li class="${i < k ? 'done' : i === k ? 'now' : ''}"><i></i>${n}</li>`).join('')}</ol>`;
  function effectsList(d) {
    return `<ul class="fx">${P.EFFECTS.map(e => { const v = d.effects[e]; const c = v === 'PROTECTED' ? 'ok' : v === 'SUSPENDED' ? 'pause' : 'warn';
      return `<li><span>${e}</span><b class="${c}">${v === 'ASSESSMENT ELIGIBLE' ? 'Eligible · not applied' : v}</b></li>`; }).join('')}</ul>`;
  }

  /* ---------- screens ---------- */
  function home() {
    const badge = a => S.seen[a] === false ? '<i class="badge">1</i>' : '';
    return `<div class="home">
      <div class="h-clock"><b>${clock(S.now)}</b><span>Lunch rush · simulated city</span></div>
      <div class="grid">${Object.keys(APPS).map(a => `<button type="button" class="app" data-open="${a}"><b class="ic ${APPS[a].cls}">${ICON[APPS[a].cls]}${badge(a)}</b><span>${APPS[a].name}</span></button>`).join('')}</div>
      <div class="h-card"><b>One order, three viewpoints.</b> Start in <em>Lantern Rider</em>. When something changes, the other apps get a notification.</div>
    </div>`;
  }

  function rider() {
    const online = '<span class="online">● Online</span>';
    if (S.phase === 'held') return appBar('rider', online) + `<div class="body">
      <div class="card hold"><span class="tag">Order held · ${rule('P01')}</span><h3>No time sent yet</h3><p>Route and safety data are out of date, so RTPL holds dispatch instead of guessing a deadline. Nothing reaches the rider or the customer until the data is fresh.</p>
      <button type="button" class="btn ghost" data-open="settings">Open Settings</button></div></div>`;
    if (S.phase === 'offer') return appBar('rider', online) + `<div class="body">
      <div class="card offer"><div class="row"><span class="tag new">New order</span><span class="checked">${ICON.shield} Checked by RTPL</span></div>
        ${orderHead()}
        <div class="dl"><small>Deliver by</small><b>${clock(S.deadline)}</b></div>
        ${whyBox()}
        <button type="button" class="btn" data-act="accept">Accept order</button>
      </div>${err()}</div>`;
    if (S.phase === 'delivered') return appBar('rider', online) + `<div class="body">${result()}</div>`;

    // On the trip: restaurant, then riding.
    const atKitchen = S.phase === 'restaurant';
    const eta = P.arrival(S), late = eta > S.deadline;
    const changed = S.reason !== 'Checked by RTPL' ? `<p class="upd">Updated: ${esc(S.reason)} ${rule(lastRule().rule)}</p>` : '';
    const acts = atKitchen ? `
        <h4>At ${O.restaurant}</h4>
        <div class="opt"><span>Food is late</span>${S.kitchen ? `<em>+${S.kitchen} min recorded</em>` : [5, 10, 15].map(m => `<button type="button" data-act="kitchenLate" data-min="${m}">+${m}</button>`).join('')}</div>
        <button type="button" class="btn" data-act="pickUp">Picked up the food</button>`
      : `
        <h4>Something happened?</h4>
        <div class="opt"><span>Road closed ahead</span>${S.closureAt !== null ? '<em>reported</em>' : '<button type="button" data-act="roadClosed">Report</button>'}</div>
        ${S.closureAt !== null ? `<div class="opt"><span>A faster shortcut opened</span>${S.shortcut ? '<em>taken</em>' : '<button type="button" data-act="shortcut">Take it</button>'}</div>` : ''}
        <div class="opt"><span>I stopped (personal)</span>${[5, 10].map(m => `<button type="button" data-act="stop" data-min="${m}">+${m}</button>`).join('')}${S.stop ? `<em>${S.stop} min</em>` : ''}</div>
        <div class="opt"><span>Stuck in traffic, no record</span>${[5, 10].map(m => `<button type="button" data-act="jam" data-min="${m}">+${m}</button>`).join('')}${S.jam ? `<em>${S.jam} min</em>` : ''}</div>
        <div class="opt"><span>Safer legal detour (+${P.SAFE_DETOUR})</span>${S.detour ? '<em>taken</em>' : '<button type="button" data-act="detour">Take it</button>'}</div>
        <div class="opt"><span>Phone lost part of the trip log</span>${S.incomplete ? '<em>lost</em>' : '<button type="button" data-act="gpsLost">Lose it</button>'}</div>
        <button type="button" class="btn" data-act="deliver">Delivered</button>`;
    return appBar('rider', online) + `<div class="body">
      <div class="card trip"><div class="row"><span class="tag">${atKitchen ? 'Collecting' : 'Delivering'} · ${O.id}</span><span class="checked">${ICON.shield} Protected</span></div>
        <div class="dl"><small>Deliver by</small><b>${clock(S.deadline)}</b><span class="lock">${ICON.lock} only later</span></div>
        <div class="eta ${late ? 'late' : ''}">Expected arrival <b>${clock(eta)}</b>${late ? ` · ${eta - S.deadline} min late` : ''}</div>
        ${changed}
        ${steps(atKitchen ? 0 : 1, ['Restaurant', 'On the way', 'Delivered'])}
      </div>
      <div class="card acts">${acts}</div>${err()}</div>`;
  }

  function result() {
    const d = S.decision, ap = d.appeal.status;
    const verdict = ap === 'PENDING' ? ['pause', 'Under human review', 'All four effects are paused until an authorised person decides.']
      : ap === 'REVERSE' ? ['ok', 'Review complete: reversed', 'You’re protected. Nothing applies to your score, rating, bonus or future orders.']
      : ap === 'UPHOLD' ? ['warn', 'Review complete: upheld', 'The reviewer kept the assessment and recorded a reason you can read.']
      : d.late === 0 ? ['ok', 'On time', 'Delivered by the checked deadline.']
      : d.protected ? ['ok', 'You’re protected', d.policy === 'P05' ? 'A verified safe, legal detour explains the extra time.' : d.branch === 'CAUSE_RECORD_INCOMPLETE' ? 'Part of the trip record is missing, so lateness can’t be blamed on you.' : d.credit ? 'A verified outside delay covers the lateness.' : 'Nothing reliable shows you caused the delay, so nothing applies.']
      : ['warn', 'Assessment can proceed', 'A reliable log shows a stop you chose to make. Nothing is deducted yet; you can ask a person to review it.'];
    return `<div class="card res ${verdict[0]}"><span class="tag">Delivered ${clock(S.completed)} · due ${clock(S.deadline)}</span>
      <h3>${verdict[1]}</h3><p>${verdict[2]} ${rule(d.policy)}</p>
      <div class="stats"><div><b>${d.late}</b><small>min late</small></div><div><b>${d.credit}</b><small>new credit</small></div><div><b>${d.residual}</b><small>unexplained</small></div></div>
      ${ap === 'REVERSE' || ap === 'UPHOLD' ? `<blockquote>“${esc(d.appeal.reason)}”<small>Reviewer’s reason</small></blockquote>` : ''}
      ${effectsList(d)}
      ${d.eligible && ap === 'NONE' ? `<label class="msg">Tell the reviewer (optional)<textarea data-field="message" rows="2" placeholder="e.g. I stopped because the lift was broken">${esc(ui.message)}</textarea></label>
        <button type="button" class="btn" data-act="appeal">Request human review</button>` : ''}
      ${ap === 'PENDING' ? '<button type="button" class="btn ghost" data-open="review">Open the reviewer console</button>' : ''}
      <button type="button" class="btn ghost" data-act="restart">Start a new order</button></div>${err()}`;
  }

  function customer() {
    const stepIx = {offer: 0, restaurant: 0, riding: 2, delivered: 3}[S.phase];
    const head = `<div class="c-shop"><b class="ic eats">${ICON.eats}</b><div><b>${O.restaurant}</b><small>${O.items}</small></div></div>`;
    if (S.phase === 'held') return appBar('customer') + `<div class="body">${head}<div class="card c-time"><small>Arrival time</small><b class="dim">Confirming…</b><p>We’re checking your delivery time.</p></div></div>`;
    const done = S.phase === 'delivered';
    const why = S.reason !== 'Checked by RTPL' && !done ? `<p class="upd">${/road/i.test(S.reason) ? 'A road is closed on the way. New arrival time.' : /kitchen/i.test(S.reason) ? 'The restaurant needs a little longer. New arrival time.' : 'Arrival time updated.'}</p>` : '';
    return appBar('customer') + `<div class="body">${head}
      <div class="card c-time"><small>${done ? 'Delivered' : 'Arrives by'}</small><b>${clock(done ? S.completed : S.deadline)}</b>${why}
        ${steps(stepIx, ['Preparing', 'Rider', 'On the way', 'Delivered'])}</div>
      ${done ? rating() : ''}
      <p class="priv">${ICON.shield} You see the delivery time and a short reason. Rider evidence, assessments and appeals stay private.</p></div>`;
  }

  // The customer can always rate; RTPL decides whether the rating may count against the rider.
  function rating() {
    const fx = S.decision.effects['Customer rating'];
    const note = !ui.stars ? '' : fx === 'PROTECTED' ? 'Thanks! The delay was explained, so this rating is not held against your rider.'
      : fx === 'SUSPENDED' ? 'Thanks! Your rider asked for a review, so this rating is on hold until a person decides.'
      : 'Thanks! Your rating is recorded.';
    return `<div class="card"><p class="rate">How was your order?</p>
      <div class="stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-stars="${n}" class="${n <= ui.stars ? 'on' : ''}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</div>
      ${note ? `<p class="upd">${note}</p>` : ''}</div>`;
  }

  function review() {
    const d = S.decision;
    if (!d || d.appeal.status === 'NONE') return appBar('review') + `<div class="body"><div class="empty"><b class="ic review">${ICON.review}</b><h3>No appeals waiting</h3><p>When a rider asks for review, the case appears here with its evidence. Effects stay paused until you decide.</p></div></div>`;
    const ev = [];
    if (S.kitchen) ev.push(`Kitchen delay ${S.kitchen} min · restaurant log · already added to the deadline`);
    if (S.stop) ev.push(`Rider pause ${clock(P.baseArrival(S))}–${clock(P.baseArrival(S) + S.stop)} · rider app log · reliable`);
    if (S.jam) ev.push(`Traffic ${S.jam} min · no outside record`);
    const head = `<div class="card rv"><div class="row"><span class="tag">Case ${O.id}</span><span class="tag ${d.appeal.status === 'PENDING' ? 'pause' : 'ok'}">${d.appeal.status === 'PENDING' ? 'Pending · effects suspended' : 'Decided · ' + d.appeal.status}</span></div>
      <div class="stats"><div><b>${clock(S.deadline)}</b><small>due</small></div><div><b>${clock(S.completed)}</b><small>delivered</small></div><div><b>${d.residual}</b><small>unexplained</small></div></div>
      <h4>Evidence</h4><ul class="ev">${ev.map(x => `<li>${esc(x)}</li>`).join('') || '<li>None</li>'}</ul>
      ${S.appealMessage ? `<h4>Rider says</h4><blockquote>“${esc(S.appealMessage)}”</blockquote>` : ''}</div>`;
    if (d.appeal.status === 'PENDING') return appBar('review') + `<div class="body">${head}
      <div class="card form"><label class="chk"><input type="checkbox" data-field="auth" ${ui.auth ? 'checked' : ''}> I have correction authority <small>(simulated)</small></label>
        <div class="seg"><button type="button" class="${ui.outcome === 'REVERSE' ? 'on' : ''}" data-outcome="REVERSE">Reverse</button><button type="button" class="${ui.outcome === 'UPHOLD' ? 'on' : ''}" data-outcome="UPHOLD">Uphold</button></div>
        <label class="msg">Reason (at least 12 characters)<textarea data-field="reason" rows="3" placeholder="Why you decided this">${esc(ui.reason)}</textarea></label>
        <button type="button" class="btn" data-act="review">Record reasoned decision</button>${err()}</div></div>`;
    return appBar('review') + `<div class="body">${head}
      <div class="card"><h4>Decision</h4><p><b>${d.appeal.status}</b> · “${esc(d.appeal.reason)}” ${rule('P06')}</p>${effectsList(d)}</div>
      <div class="card audit"><h4>Audit record ${rule('P07')}</h4><pre>${esc(JSON.stringify(S.record, null, 1))}</pre>
        <p class="priv">Never exported: rider identity, GPS trace, raw evidence, the reviewer’s free-text reason.</p></div></div>`;
  }

  function settings() {
    return appBar('settings') + `<div class="body">
      <div class="card"><label class="tg"><span><b>Route &amp; safety data up to date</b><small>Turn off to see RTPL hold dispatch instead of guessing (P01).</small></span>
        <input type="checkbox" data-field="fresh" ${S.fresh ? 'checked' : ''}><i></i></label></div>
      <div class="card"><button type="button" class="btn ghost" data-act="restart">Start a new order</button></div>
      <p class="priv">Teaching prototype. The app, order, restaurant and city are made up; the AI proposal is simulated.</p></div>`;
  }

  // The safeguard, its pseudocode line (02 ethics and pseudocode) and its ethical basis, shown beside each decision.
  const RULES = {
    P01: {name: 'Data quality gate', code: 'IF route or safety data is stale:\n  HOLD dispatch; publish no time', ethic: 'Deontology · do not cause avoidable harm'},
    P02: {name: 'Safe time floor', code: 'deadline = MAX(ai_proposal, legal_floor)\nnew = MAX(accepted, recheck)  # never earlier', ethic: 'ACM 1.2 · no avoidable time pressure'},
    P03: {name: 'Honest delay credit', code: 'credit = UNION(verified delays) − already_covered', ethic: 'ACM 1.4 · fair, no double counting'},
    P04: {name: 'Evidence before blame', code: 'IF cause record incomplete: PROTECT rider\nELSE: assessment ELIGIBLE, nothing applied', ethic: 'Deontology · lateness ≠ responsibility'},
    P05: {name: 'Safety is never punished', code: 'IF verified legal safe detour: PROTECT rider', ethic: 'Deontology · safety before speed'},
    P06: {name: 'Right to correction', code: 'ON appeal: SUSPEND all 4 effects\nREQUIRE authority AND reason ≥ 12 chars', ethic: 'ACM 1.3 / 3.4 · virtue: reasoned human review'},
    P07: {name: 'Minimal disclosure', code: 'EXPORT version, rule, outcome\nNEVER identity, GPS, raw evidence', ethic: 'Privacy · scrutiny without exposure'}
  };

  /* ---------- render ---------- */
  function render() {
    $('view').innerHTML = {home, rider, customer, review, settings}[ui.app]();
    $('view').className = 'view ' + ui.app;
    $('sb-time').textContent = clock(S.now);
    $('log').innerHTML = S.log.map(l => { const r = RULES[l.rule]; return `<li class="${l.tone}"><time>${l.at}</time>${r ? `<span class="rule">${l.rule}</span> <b class="sg">${r.name}</b>` : ''}<p>${esc(l.text)}</p>${r ? `<pre class="pc">${esc(r.code)}</pre><small class="eth">${r.ethic}</small>` : ''}</li>`; }).join('');
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-open],[data-act],[data-outcome],[data-stars]');
    if (!t) return;
    if (t.dataset.stars) { ui.stars = +t.dataset.stars; return render(); }
    if (t.dataset.open) return open(t.dataset.open);
    if (t.dataset.outcome) { ui.outcome = t.dataset.outcome; return render(); }
    const a = t.dataset.act, min = +t.dataset.min;
    if (a === 'restart') return restart();
    if (a === 'fidelity') { document.body.classList.toggle('lofi', t.dataset.v === 'lo'); document.querySelectorAll('[data-act="fidelity"]').forEach(b => b.classList.toggle('on', b === t)); return; }
    if (a === 'kitchenLate' || a === 'stop' || a === 'jam') return act(a, {minutes: min});
    if (a === 'appeal') return act('appeal', {message: ui.message});
    if (a === 'review') return act('review', {authorised: ui.auth, outcome: ui.outcome, reason: ui.reason});
    act(a);
  });
  document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('[data-why]')) ui.why = e.target.open; }, true);
  document.addEventListener('input', e => {
    const f = e.target.dataset && e.target.dataset.field;
    if (!f) return;
    if (f === 'fresh') return restart(e.target.checked);
    ui[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  });

  // Fit the device to the window height on desktop.
  function fit() {
    const dev = $('device'), wrap = $('wrap');
    if (innerWidth <= 640) { dev.style.transform = ''; wrap.style.height = ''; return; }
    const k = Math.min(1, (innerHeight - 32) / 812);
    dev.style.transform = `scale(${k})`;
    wrap.style.height = 812 * k + 'px'; wrap.style.width = 392 * k + 'px';
  }
  addEventListener('resize', fit);
  fit();
  document.querySelectorAll('.who .ic').forEach(b => { b.innerHTML = ICON[b.classList[1]]; });
  render();
  window.RTPLPhoneApp = {get state() { return S; }, ui, open, act, restart};
})();
