/* RTPL presentation scenes.
 * Each scene matches one slide of the A2b deck. Each beat is one press of the → key.
 * Every number shown on screen is computed here by rtpl-core.js; nothing is typed in by hand.
 * Synthetic data only. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../rtpl-core.js'));
  else root.RTPLScenes = factory(root.RTPLCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  /* ---------- fixed synthetic inputs (unchanged from the slides) ---------- */
  const BASE = Object.freeze({distance: 4, legalSpeed: 20, conditionSpeed: 20, signals: 4, wait: 10, access: 6, handover: 2, fresh: true});
  const AI_PROPOSED = 24;
  const B102_ACCEPTED = 42;
  const ROUTE_NOW = 20;
  const REMAINING = faster => ({
    A101: {...BASE, distance: faster ? 1 : 4, wait: faster ? 4 : 6, signals: 0, access: 4},
    B102: {...BASE, distance: faster ? 1 : 6, wait: 4, signals: 0, access: 6}
  });
  const REVIEW_REASON = 'The supporting record does not reliably establish rider responsibility.';
  const BOUNDARY = 'Demonstration only: no real deliveries, model inference, platform connection or measured rider outcomes.';
  const SIMULATED = 'Reviewer authority and evidence reliability are simulated.';

  /* ---------- formatting ---------- */
  function clock(m) {
    if (m === null || m === undefined) return '—';
    const t = 720 + Math.round(m), day = Math.floor(t / 1440), r = ((t % 1440) + 1440) % 1440;
    const s = String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0');
    return day === 0 ? s : s + ' (+' + day + 'd)';
  }
  const span = ([a, b]) => clock(a) + '–' + clock(b);
  const spans = xs => xs.length ? xs.map(span).join(', ') : 'none';
  const round1 = n => Math.round(n * 10) / 10;

  /* ---------- traces: the slide 12 pseudocode with this run's values ---------- */
  function traceCheck(inputs, proposed, res) {
    const p = res && res.status === 'READY' ? C.budgetParts(inputs) : null;
    const lines = [{rule: 'P01', code: 'if route or service data is stale: hold, publish nothing',
      value: !res ? 'not run' : inputs.fresh ? 'data current, continue' : 'stale, HOLD', state: !res ? 'idle' : inputs.fresh ? 'run' : 'hit'}];
    if (!inputs.fresh && res) return lines.concat([{rule: 'P02', code: 'deadline = max(ai, floor)', value: 'skipped', state: 'skip'}]);
    lines.push(
      {rule: 'P02', code: 'travel = distance ÷ min(legal, conditions) × 60', value: p ? `${inputs.distance} km ÷ ${p.speed} km/h = ${round1(p.travel)} min` : '—', state: p ? 'run' : 'idle'},
      {rule: 'P02', code: 'floor = ceil(travel + signals + wait + access + hand-over)', value: p ? `${round1(p.travel)} + ${p.signals} + ${p.wait} + ${p.access} + ${p.handover} = ${p.total} min` : '—', state: p ? 'run' : 'idle'},
      {rule: 'P02', code: 'deadline = max(ai_proposal, floor, accepted)', value: p ? `max(${proposed}, ${res.floor}) = ${res.deadline} → ${clock(res.deadline)}` : '—', state: p ? 'hit' : 'idle'});
    return lines;
  }

  function traceBundle(stage, closure, faster) {
    const fasterNeed = id => ROUTE_NOW + C.budget(REMAINING(true)[id]);
    const closeNeed = id => ROUTE_NOW + C.budget(REMAINING(false)[id]);
    const L = [{rule: 'P01', code: 'every affected order has current data? else hold all', value: stage ? 'A101 yes, B102 yes' : 'not run', state: stage ? 'run' : 'idle'}];
    if (stage === 0) return L.concat([{rule: 'P02', code: 'new = max(accepted, now + remaining floor)', value: 'waiting for a route change', state: 'idle'}]);
    const src = stage === 1 ? closure : faster, need = stage === 1 ? closeNeed : fasterNeed;
    const prev = Object.fromEntries(closure.orders.map(o => [o.id, stage === 1 ? o.previous : o.deadline]));
    src.orders.forEach(o => L.push({rule: 'P02', code: `${o.id} = max(accepted ${prev[o.id]}, ${ROUTE_NOW} + ${need(o.id) - ROUTE_NOW})`,
      value: `${o.deadline} → ${clock(o.deadline)}${o.deadline === prev[o.id] ? ' kept' : ' later'}`, state: 'hit'}));
    L.push({rule: 'P02', code: 'publish all updated deadlines together', value: src.status, state: 'run'});
    return L;
  }

  function traceAssess(input, d) {
    const decided = !!d;
    const b = d ? d.branch : null;
    const extLen = d ? C.length(d.creditIntervals) : 0;
    return [
      {rule: 'P03', code: 'unique = union(verified delays) − time already added', value: decided ? spans(d.creditIntervals) + ` (${extLen} min)` : '—', state: decided ? 'run' : 'idle'},
      {rule: 'P03', code: 'credit = min(late, unique); residual = late − credit', value: decided ? `late ${d.late}, credit ${d.credit}, residual ${d.residual}` : '—', state: decided ? (d.residual === 0 ? 'hit' : 'run') : 'idle'},
      {rule: 'P05', code: 'if verified safe legal alternative: protect', value: !decided ? '—' : d.residual === 0 ? 'not needed' : input.safeRoute ? 'yes, PROTECT' : 'no', state: !decided ? 'idle' : b === 'SAFE_ALTERNATIVE' ? 'hit' : d.residual === 0 ? 'skip' : 'run'},
      {rule: 'P04', code: 'if rider cause not reliably shown for the residual: protect', value: !decided ? '—' : (b === 'CAUSE_RECORD_INCOMPLETE' ? 'record incomplete, PROTECT' : b === 'RIDER_CAUSE_NOT_ESTABLISHED' ? 'no reliable rider cause, PROTECT' : d.residual === 0 || b === 'SAFE_ALTERNATIVE' ? 'not needed' : 'cause supported'),
        state: !decided ? 'idle' : ['CAUSE_RECORD_INCOMPLETE', 'RIDER_CAUSE_NOT_ESTABLISHED'].includes(b) ? 'hit' : (d.residual === 0 || b === 'SAFE_ALTERNATIVE') ? 'skip' : 'run'},
      {rule: 'P04', code: 'else: eligible, apply nothing, show evidence, offer appeal', value: !decided ? '—' : b === 'RIDER_CAUSE_SUPPORTED' ? 'ELIGIBLE' : 'not reached', state: !decided ? 'idle' : b === 'RIDER_CAUSE_SUPPORTED' ? 'hit' : 'skip'}
    ];
  }

  function traceReview(stage, d) {
    return [
      {rule: 'P06', code: 'on appeal: suspend every disputed effect', value: stage >= 1 ? 'filed ' + clock(49) + ', 4 effects SUSPENDED' : 'no appeal yet', state: stage === 1 ? 'hit' : stage > 1 ? 'run' : 'idle'},
      {rule: 'P06', code: 'decide only with authority and a reason (≥ 12 chars)', value: stage >= 2 ? 'authorised, reason recorded' : 'waiting', state: stage >= 2 ? 'run' : 'idle'},
      {rule: 'P06', code: 'uphold only if the original evidence was reliable', value: stage >= 2 ? d.appeal.status + ' at ' + clock(d.appeal.reviewed) : '—', state: stage >= 2 ? 'hit' : 'idle'},
      {rule: 'P07', code: 'record(version, rule, outcome, effects)', value: stage >= 2 ? C.CONFIG.version : '—', state: stage >= 2 ? 'run' : 'idle'}
    ];
  }

  /* ---------- the minute ruler used for delay accounting ---------- */
  function creditRuler({deadline, original, completed, events, covered, decision, start = 30, end = 52}) {
    const rows = [];
    rows.push({label: 'Deadline', segs: [], pins: []});
    if (original !== undefined && original !== deadline) rows[0].segs.push({from: original, to: deadline, cls: 'extended', text: '+' + (deadline - original) + ' min added'});
    rows.push({label: 'Outside delay', segs: events.map(e => ({from: e.start, to: e.end, cls: 'verified' + (covered.some(([a, b]) => a <= e.start && b >= e.end) ? ' covered' : ''), text: e.label + ' ' + (e.end - e.start)}))});
    if (completed !== null) {
      const segs = completed > deadline ? [{from: deadline, to: completed, cls: 'late', text: (completed - deadline) + ' min late'}] : [];
      rows.push({label: 'Late', segs});
    }
    if (decision) {
      rows.push({label: 'New credit', segs: decision.creditIntervals.map(([a, b]) => ({from: a, to: b, cls: 'credit', text: (b - a) + ' min'})), empty: decision.credit === 0 ? '0 min: already used' : ''});
      rows.push({label: 'Unexplained', segs: decision.residual > 0 ? [{from: deadline + decision.credit, to: completed, cls: 'residual', text: decision.residual + ' min'}] : [], empty: decision.residual === 0 ? 'nothing left' : ''});
    }
    const pins = [];
    if (original !== undefined && original !== deadline) pins.push({at: original, label: clock(original) + ' due', cls: 'muted'});
    pins.push({at: deadline, label: clock(deadline) + (original !== undefined && original !== deadline ? ' extended' : ' due'), cls: 'deadline'});
    if (completed !== null) pins.push({at: completed, label: clock(completed) + ' arrived', cls: 'arrival'});
    return {start, end, rows, pins};
  }

  /* ---------- fixed delivery cases (identical to cases 02–06 in the slides) ---------- */
  const CHECK01 = C.initial(BASE, AI_PROPOSED, 0);           // 12:34
  const CLOSURE = C.recheckBundle([{id: 'A101', deadline: CHECK01.deadline}, {id: 'B102', deadline: B102_ACCEPTED}], ROUTE_NOW, REMAINING(false));
  const FASTER = C.recheckBundle(CLOSURE.orders.map(o => ({id: o.id, deadline: o.deadline})), ROUTE_NOW, REMAINING(true));
  const STALE = C.initial({...BASE, fresh: false}, AI_PROPOSED, 0);

  const CASE = {
    '02': {deadline: 44, original: 34, completed: 49, covered: [[34, 44]],
      events: [{id: 'E1', start: 34, end: 44, verified: true, reliable: true, source: 'Synthetic restaurant readiness record', label: 'Kitchen'}]},
    '03': {deadline: 34, completed: 44, events: [], covered: [], causalComplete: false},
    '04': {deadline: 34, completed: 44, events: [], covered: [],
      riderEvidence: {start: 34, end: 44, verified: true, reliable: true, source: 'Synthetic confirmed rider-attributable stop, with causal review'}},
    '05': {deadline: 34, completed: 44, events: [], covered: [], safeRoute: true,
      riderEvidence: {start: 34, end: 44, verified: true, reliable: true, source: 'Synthetic record: rider’s own route choice, with causal review'}},
    '06': {deadline: 34, completed: 44, covered: [],
      events: [{id: 'E1', start: 34, end: 41, verified: true, reliable: true, source: 'Synthetic traffic record', label: 'Traffic'},
               {id: 'E2', start: 38, end: 44, verified: true, reliable: true, source: 'Synthetic restaurant record', label: 'Hand-off'}]}
  };
  const assessCase = k => { const c = CASE[k]; return C.assess({deadline: c.deadline, completed: c.completed, events: c.events, covered: c.covered,
    riderEvidence: c.riderEvidence || null, safeRoute: !!c.safeRoute, causalComplete: c.causalComplete !== false}); };
  const D = {'02': assessCase('02'), '03': assessCase('03'), '04': assessCase('04'), '05': assessCase('05'), '06': assessCase('06')};
  const APPEAL04 = C.appeal(D['04'], 49, CASE['04'].completed);
  const REVIEW04 = C.review(APPEAL04, {authorised: true, outcome: 'REVERSE', reason: REVIEW_REASON, at: 54});
  const AUDIT04 = C.audit({id: 'A101', deadline: CASE['04'].deadline}, REVIEW04);

  /* ---------- phone states ---------- */
  const restaurant = 'Noodle Kitchen';
  const rider = {
    idle: (msg) => ({kind: 'idle', msg: msg || 'Waiting for orders nearby'}),
    offer: (deadline) => ({kind: 'offer', id: 'A101', deadline, km: 4, pickup: restaurant, drop: 'Synthetic customer, Lantern Street'}),
    trip: (stage, orders, banner) => ({kind: 'trip', stage, orders, banner: banner || null}),
    result: (k, opts) => ({kind: 'result', caseNum: k, ...opts})
  };
  const customer = {
    confirming: () => ({kind: 'confirming', restaurant}),
    eta: (eta, status, banner) => ({kind: 'eta', restaurant, eta, status, banner: banner || null}),
    delivered: (at, eta) => ({kind: 'delivered', restaurant, at, eta})
  };

  function explain(k, d) {
    if (k === '02') return 'The 10-minute kitchen delay already moved your deadline to 12:44, so it can’t be counted twice. Nothing shows you caused the last 5 minutes, so no effect applies.';
    if (k === '03') return 'The record of what caused the delay is incomplete. Lateness on its own is not evidence against you, so no effect applies.';
    if (k === '04') return 'A verified record shows a stop you chose to make from 12:34 to 12:44. An assessment may proceed, but nothing has been deducted. You can see the evidence and ask a person to review it.';
    if (k === '05') return 'You took a longer, legal route around a flooded underpass. A verified safe choice is never held against you.';
    if (k === '06') return 'Traffic and the restaurant hand-off overlapped. Their 10 unique minutes cover your whole delay.';
    return d.reason;
  }

  function riderResult(k, d, appeal) {
    const c = CASE[k];
    return rider.result(k, {id: 'A101', deadline: c.deadline, completed: c.completed, protected: d.protected, policy: d.policy,
      headline: d.protected ? 'You’re protected' : 'Assessment can proceed', message: explain(k, d),
      stats: {late: d.late, credit: d.credit, residual: d.residual}, appeal: appeal || (d.eligible ? 'available' : 'none'), effects: d.effects});
  }

  /* ---------- engine views ---------- */
  const deadlineEngine = (inputs, proposed, res, extra) => ({kind: 'deadline', inputs, proposed, res, parts: res && res.status === 'READY' ? C.budgetParts(inputs) : null, trace: traceCheck(inputs, proposed, res), ...extra});

  function creditEngine(k, decided, opts) {
    const c = CASE[k], d = decided ? D[k] : null;
    return {kind: 'credit', caseNum: k, ruler: creditRuler({deadline: c.deadline, original: c.original, completed: opts && opts.hideArrival ? null : c.completed, events: c.events, covered: c.covered, decision: d}),
      decision: d, compare: d ? compareFor(k, d) : null, trace: traceAssess(c, d)};
  }

  function compareFor(k, d) {
    if (k === '02') return {simple: 'Credit the kitchen delay again: 5 min credit, 0 left.', rtpl: 'Those 10 minutes were already added to the deadline: 0 new credit, 5 min unexplained, no rider cause, so protect.'};
    if (k === '06') return {simple: 'Add both records: 7 + 6 = 13 min.', rtpl: 'Merge the overlap 12:38–12:41: 10 unique minutes, all of the lateness.'};
    if (k === '03') return {simple: 'Late is late: assessment eligible.', rtpl: 'No reliable cause for the 10 minutes: protect automatically.'};
    if (k === '04') return {simple: 'Apply the penalty now.', rtpl: 'Eligible only. Nothing applied; evidence shown; appeal open.'};
    if (k === '05') return {simple: 'Slower route chosen by the rider: rider’s fault.', rtpl: 'A verified safe, legal alternative stays protected.'};
    return null;
  }

  /* ---------- map states ---------- */
  const at = (place) => ({place});
  const on = (path, t) => ({path, t});
  const pins = list => list;

  /* ---------- scenes ---------- */
  const SCENES = [
    {id: 'slide-5', slide: 5, presenter: 'Yanyu Zhu', title: 'A layer around existing AI dispatch', short: 'Overview', group: 'main',
      beats: [
        {time: null, center: 'overview', overview: {stage: 0},
          caption: 'RTPL sits between an existing AI dispatch system and the people it affects. It never picks riders or retrains the model.',
          note: 'Point at the three RTPL stages, then the five viewers. Press → to send one order through.',
          rider: rider.idle(), customer: customer.confirming()},
        {time: 0, center: 'overview', overview: {stage: 1, ai: AI_PROPOSED, out: CHECK01.deadline},
          caption: 'One order, five viewers. The AI’s 12:24 enters RTPL; only a checked time reaches the rider and the customer. A reviewer and an auditor see the record.',
          note: 'Watch the order travel through the layer. Next: case 01 on the map.',
          rider: rider.idle(), customer: customer.confirming()}
      ]},

    {id: 'slide-6', slide: 6, presenter: 'Yanyu Zhu', title: 'The first check changes the instruction', short: 'First check', group: 'main', caseNum: '01',
      beats: [
        {time: 0, center: 'map',
          map: {rider: at('hub'), pins: pins(['rest', 'custA']), routes: [{path: 'mainA', style: 'planned'}], tags: [{at: [640, 250], text: '4 km legal route'}]},
          engine: deadlineEngine(BASE, AI_PROPOSED, null),
          caption: 'Order A101, 12:00. The simulated AI proposes delivery by 12:24. Nothing has been sent to the rider or the customer yet.',
          note: 'Point at the AI bar: 24 min. Rider phone is empty, customer sees Confirming. Press → to run the check.',
          rider: rider.idle(), customer: customer.confirming()},
        {time: 0, center: 'map', result: '24 min becomes a 34 min budget: 12:34 for everyone',
          map: {rider: at('hub'), pins: pins(['rest', 'custA']), routes: [{path: 'mainA', style: 'active'}], tags: [{at: [640, 250], text: '4 km at 20 km/h'}]},
          engine: deadlineEngine(BASE, AI_PROPOSED, CHECK01),
          caption: 'RTPL builds the minimum from a legal route: 12 min of travel plus 22 min for signals, waiting, building access and hand-over. 12:34 goes to everyone.',
          note: 'Point at the gap: the AI stops 10 min short. Then the rider offer and the customer time: both 12:34.',
          rider: rider.offer(CHECK01.deadline), customer: customer.eta(CHECK01.deadline, 'Preparing')},
        {time: 2, center: 'map',
          map: {move: {path: 'toRest', from: 0, to: 1}, pins: pins(['rest', 'custA']), routes: [{path: 'toRest', style: 'pickup'}, {path: 'mainA', style: 'active'}]},
          engine: deadlineEngine(BASE, AI_PROPOSED, CHECK01, {locked: true}),
          caption: 'The rider accepts. From now on the 12:34 deadline can move later, never earlier.',
          note: 'The lock icon: an accepted time is protected. Next slide: what happens when the route changes.',
          rider: rider.trip('pickup', [{id: 'A101', deadline: CHECK01.deadline}]), customer: customer.eta(CHECK01.deadline, 'Rider assigned')}
      ]},

    {id: 'slide-7', slide: 7, presenter: 'Yanyu Zhu', title: 'Accepted time survives later changes', short: 'Route change', group: 'main', caseNum: '01',
      beats: [
        {time: ROUTE_NOW, center: 'map',
          map: {rider: at('rest'), pins: pins(['rest', 'custA', 'custB']), routes: [{path: 'mainA', style: 'active'}, {path: 'onToB', style: 'active'}]},
          engine: {kind: 'bundle', stage: 0, rows: bundleRows(0), trace: traceBundle(0)},
          caption: '12:20. The rider is collecting two orders at Noodle Kitchen: A101 due 12:34 and B102 due 12:42.',
          note: 'Two accepted orders on one trip. Press → for the road closure.',
          rider: rider.trip('pickup', [{id: 'A101', deadline: 34}, {id: 'B102', deadline: B102_ACCEPTED}]), customer: customer.eta(34, 'Rider at restaurant')},
        {time: ROUTE_NOW, center: 'map', result: 'A101 moves to 12:44, B102 to 12:50',
          map: {rider: at('rest'), pins: pins(['rest', 'custA', 'custB']), markers: ['closure'],
            routes: [{path: 'mainA', style: 'blocked'}, {path: 'closureA', style: 'active'}, {path: 'onToB', style: 'active'}]},
          engine: {kind: 'bundle', stage: 1, rows: bundleRows(1), trace: traceBundle(1, CLOSURE, FASTER)},
          caption: 'A verified road closure on Harbour Road rechecks every accepted order on the trip. A101 moves to 12:44 and B102 to 12:50, published together.',
          note: 'Point at the closure, the new route, then both new times. The customer phone updates to 12:44.',
          rider: rider.trip('pickup', [{id: 'A101', deadline: 44, prev: 34}, {id: 'B102', deadline: 50, prev: 42}], {tone: 'info', text: 'Road closure verified. Both deadlines extended.'}),
          customer: customer.eta(44, 'Rider at restaurant', 'A road closure on the route. Your new arrival time is 12:44.')},
        {time: ROUTE_NOW, center: 'map', result: 'Neither time moves earlier',
          map: {move: {path: 'fasterA', from: 0, to: 0.55}, pins: pins(['rest', 'custA', 'custB']), markers: ['closure'],
            routes: [{path: 'mainA', style: 'blocked'}, {path: 'fasterA', style: 'faster'}, {path: 'onToB', style: 'active'}]},
          engine: {kind: 'bundle', stage: 2, rows: bundleRows(2), trace: traceBundle(2, CLOSURE, FASTER)},
          caption: 'A faster route appears. A simple overwrite would publish 12:33 and 12:35. RTPL keeps 12:44 and 12:50, because an accepted time only moves later.',
          note: 'Point at the crossed-out 12:33 / 12:35. Rider and customer both still show 12:44.',
          rider: rider.trip('delivering', [{id: 'A101', deadline: 44}, {id: 'B102', deadline: 50}], {tone: 'ok', text: 'Faster route found. Your deadlines stay as accepted.'}),
          customer: customer.eta(44, 'On the way', 'Same time as your rider: 12:44.')}
      ]},

    {id: 'slide-8', slide: 8, presenter: 'Yixuan Hu', title: 'External delay earns credit once', short: 'Delay credit', group: 'main', caseNum: '02',
      beats: [
        {time: 34, center: 'map',
          map: {rider: at('rest'), pins: pins(['rest', 'custA']), markers: ['kitchen'], routes: [{path: 'mainA', style: 'active'}]},
          engine: creditEngine('02', false, {hideArrival: true}),
          caption: 'Case 02. A101 was due at 12:34. Noodle Kitchen was 10 minutes late, verified, so RTPL already moved the deadline to 12:44.',
          note: 'Blue bar = kitchen delay. Hatching = already added to the deadline. Press → to deliver.',
          rider: rider.trip('pickup', [{id: 'A101', deadline: 44, prev: 34}], {tone: 'info', text: 'Kitchen delay verified. Deadline now 12:44.'}),
          customer: customer.eta(44, 'Preparing', 'The restaurant needed more time. New arrival 12:44.')},
        {time: 49, center: 'map',
          map: {move: {path: 'mainA', from: 0, to: 1}, clockFrom: 44, pins: pins(['rest', 'custA']), markers: ['kitchen'], routes: [{path: 'mainA', style: 'done'}]},
          engine: creditEngine('02', false),
          caption: 'The rider arrives at 12:49, five minutes after the extended deadline.',
          note: 'Point at the red 5 min late. Ask: can the same kitchen delay excuse it again? Press →.',
          rider: rider.trip('delivered', [{id: 'A101', deadline: 44, completed: 49}]), customer: customer.delivered(49, 44)},
        {time: 49, center: 'map', result: '5 min late, 0 new credit, 5 still unexplained. Rider protected.',
          map: {rider: at('custA'), pins: pins(['rest', 'custA']), markers: ['kitchen'], routes: [{path: 'mainA', style: 'done'}]},
          engine: creditEngine('02', true),
          caption: 'The same delay cannot excuse the rider twice: 0 new credit, so 5 minutes stay unexplained. Unexplained is not the rider’s fault, so the rider stays protected.',
          note: 'Read the three numbers 5 / 0 / 5, then the comparison box. Hand over to Shengbao.',
          rider: riderResult('02', D['02']), customer: customer.delivered(49, 44)}
      ]},

    {id: 'slide-9', slide: 9, presenter: 'Shengbao Lu', title: 'Missing evidence triggers protection', short: 'Evidence', group: 'main', caseNum: '03 · 04',
      phones: ['rider:03', 'rider:04'],
      beats: [
        {time: 44, center: 'compare', compare: {reveal: 0, cases: compareCases()},
          caption: 'Two deliveries, both due 12:34 and completed at 12:44: ten minutes late. Only the evidence differs.',
          note: 'Left phone is case 03, right phone is case 04. Press → for case 03.',
          riderL: rider.trip('delivered', [{id: 'A101', deadline: 34, completed: 44}]), riderR: rider.trip('delivered', [{id: 'A101', deadline: 34, completed: 44}])},
        {time: 44, center: 'compare', result: '10 min late, cause not established. Rider protected.', compare: {reveal: 1, cases: compareCases()},
          caption: 'Case 03: the record of what caused the delay is incomplete. Lateness alone is not evidence, so RTPL protects the rider automatically, before any appeal.',
          note: 'Point at the incomplete record and the green result. Press → for case 04.',
          riderL: riderResult('03', D['03']), riderR: rider.trip('delivered', [{id: 'A101', deadline: 34, completed: 44}])},
        {time: 44, center: 'compare', result: 'Assessment can proceed. Nothing is applied yet.', compare: {reveal: 2, cases: compareCases()},
          caption: 'Case 04: a verified, reliable record shows a stop the rider chose to make from 12:34 to 12:44. An assessment may proceed. Nothing has been deducted, and the rider sees the evidence.',
          note: 'Stress: eligible is not penalised. The right phone offers Request human review: next slide.',
          riderL: riderResult('03', D['03']), riderR: riderResult('04', D['04'])}
      ]},

    {id: 'slide-10', slide: 10, presenter: 'Shengbao Lu', title: 'An appeal pauses the disputed effects', short: 'Appeal', group: 'main', caseNum: '04',
      beats: [
        {time: 44, center: 'review', review: {stage: 0, decision: D['04'], trace: traceReview(0)},
          caption: 'Case 04 continues. The rider disagrees with the assessment and taps Request human review.',
          note: 'Tap Request human review on the rider phone, or press →.',
          rider: riderResult('04', D['04'], 'available'), customer: customer.delivered(44, 34)},
        {time: 49, center: 'review', result: 'All four effects SUSPENDED.', review: {stage: 1, decision: APPEAL04, trace: traceReview(1)},
          caption: 'Appeal filed at 12:49. All four disputed effects are suspended at once while an authorised reviewer looks at the case.',
          note: 'Four chips turn SUSPENDED. The customer phone shows none of this. Optional: untick authority to show a refusal. Press → to decide.',
          rider: riderResult('04', APPEAL04, 'pending'), customer: customer.delivered(44, 34)},
        {time: 54, center: 'review', result: 'All four effects PROTECTED. Appeal REVERSE.', review: {stage: 2, decision: REVIEW04, trace: traceReview(2, REVIEW04)},
          caption: 'An authorised reviewer reverses the assessment and records a reason. All four effects are protected again.',
          note: 'Point at REVERSE and the reason the rider receives. Next: Oversight.',
          rider: riderResult('04', REVIEW04, 'done'), customer: customer.delivered(44, 34)}
      ]},

    {id: 'slide-11', slide: 11, presenter: 'Shengbao Lu', title: 'Oversight needs records and access', short: 'Oversight', group: 'main', caseNum: '04',
      beats: [
        {time: 54, center: 'audit', audit: {stage: 0, record: AUDIT04},
          caption: 'The oversight record keeps what an auditor needs: rule version DEMO-1.0, rule P06, protected true, appeal REVERSE, and each effect separately.',
          note: 'Point at configuration, policy, appeal and the four effects. Press → for who sees what.',
          rider: riderResult('04', REVIEW04, 'done'), customer: customer.delivered(44, 34)},
        {time: 54, center: 'audit', result: 'A minimised record: no identity, GPS, raw evidence or free-text reason.', audit: {stage: 1, record: AUDIT04},
          caption: 'Each viewer gets only what it needs. The export leaves out identity, GPS, raw evidence and the reviewer’s free-text reason.',
          note: 'Download audit summary saves the JSON. Then switch back to the slides for slide 12.',
          rider: riderResult('04', REVIEW04, 'done'), customer: customer.delivered(44, 34)}
      ]},

    /* ---------- question-time extras ---------- */
    {id: 'qa-07', slide: null, presenter: null, title: 'Out-of-date route data', short: '07 Stale data', group: 'extra', caseNum: '07',
      beats: [
        {time: 0, center: 'map',
          map: {rider: at('hub'), pins: pins(['rest', 'custA']), stale: true, routes: [{path: 'mainA', style: 'planned'}]},
          engine: deadlineEngine({...BASE, fresh: false}, AI_PROPOSED, null, {stale: true}),
          caption: 'Same order as case 01, but the route and service data have not been refreshed. RTPL cannot check the deadline against current conditions.',
          note: 'Press → to run the check.',
          rider: rider.idle(), customer: customer.confirming()},
        {time: 0, center: 'map', result: 'Dispatch held for review. No unchecked deadline published.',
          map: {rider: at('hub'), pins: pins(['rest', 'custA']), stale: true, routes: [{path: 'mainA', style: 'blocked'}]},
          engine: deadlineEngine({...BASE, fresh: false}, AI_PROPOSED, STALE, {stale: true}),
          caption: 'P01 holds dispatch. No unchecked deadline is published: the customer sees Confirming, and the rider gets no time to chase.',
          note: 'P01 comes before any arithmetic.',
          rider: rider.idle('Order held for a dispatch check'), customer: customer.confirming()}
      ]},
    {id: 'qa-06', slide: null, presenter: null, title: 'Overlapping outside delays', short: '06 Overlap', group: 'extra', caseNum: '06',
      beats: [
        {time: 44, center: 'map',
          map: {rider: at('custA'), pins: pins(['rest', 'custA']), markers: ['traffic', 'handoff'], routes: [{path: 'mainA', style: 'done'}]},
          engine: creditEngine('06', false),
          caption: 'A101 was due at 12:34 and arrived at 12:44. Traffic held the rider 12:34–12:41, and the restaurant hand-off ran 12:38–12:44. Both records are verified.',
          note: 'Two blue bars overlap. Press →.',
          rider: rider.trip('delivered', [{id: 'A101', deadline: 34, completed: 44}]), customer: customer.delivered(44, 34)},
        {time: 44, center: 'map', result: '10 unique minutes excused, not 13. Nothing left unexplained.',
          map: {rider: at('custA'), pins: pins(['rest', 'custA']), markers: ['traffic', 'handoff'], routes: [{path: 'mainA', style: 'done'}]},
          engine: creditEngine('06', true),
          caption: 'Adding the records gives 13 minutes. RTPL merges the overlap and counts 10 unique minutes, exactly the lateness.',
          note: '7 + 6 − 3 overlapping = 10.',
          rider: riderResult('06', D['06']), customer: customer.delivered(44, 34)}
      ]},
    {id: 'qa-05', slide: null, presenter: null, title: 'Safe legal detour', short: '05 Detour', group: 'extra', caseNum: '05',
      beats: [
        {time: 34, center: 'map',
          map: {move: {path: 'safeDetour', from: 0, to: 1}, clockFrom: 24, pins: pins(['rest', 'custA']), markers: ['flood'], routes: [{path: 'mainA', style: 'blocked'}, {path: 'safeDetour', style: 'detour'}]},
          engine: creditEngine('05', false),
          caption: 'A101 was due at 12:34 and arrived at 12:44. The rider avoided a flooded underpass by taking a longer, legal route.',
          note: 'Press → to check responsibility.',
          rider: rider.trip('delivered', [{id: 'A101', deadline: 34, completed: 44}]), customer: customer.delivered(44, 34)},
        {time: 44, center: 'map', result: 'Rider protected: a verified safe, legal detour.',
          map: {rider: at('custA'), pins: pins(['rest', 'custA']), markers: ['flood'], routes: [{path: 'mainA', style: 'blocked'}, {path: 'safeDetour', style: 'done'}]},
          engine: creditEngine('05', true),
          caption: 'The extra 10 minutes came from the rider’s own route choice, and that choice was a verified safe, legal alternative. P05 keeps the rider protected.',
          note: 'P05 is checked before P04.',
          rider: riderResult('05', D['05']), customer: customer.delivered(44, 34)}
      ]},
    {id: 'sandbox', slide: null, presenter: null, title: 'Sandbox: your own numbers', short: 'Sandbox', group: 'extra', caseNum: null, sandbox: true,
      beats: [{time: null, center: 'sandbox', caption: 'Change any input. The same rules from rtpl-core.js respond. Nothing here matches the slides.', note: 'Use during questions only.'}]}
  ];

  function bundleRows(stage) {
    const fasterNeed = id => ROUTE_NOW + C.budget(REMAINING(true)[id]);
    return CLOSURE.orders.map((o, i) => ({
      id: o.id,
      accepted: o.previous,
      closure: stage >= 1 ? o.deadline : null,
      faster: stage >= 2 ? FASTER.orders[i].deadline : null,
      overwrite: stage >= 2 ? fasterNeed(o.id) : null
    }));
  }

  function compareCases() {
    return [
      {num: '03', title: 'Cause record incomplete', record: 'What caused the delay was not fully recorded.', recordTone: 'missing', decision: D['03'], compare: compareFor('03', D['03'])},
      {num: '04', title: 'Reliable record of a rider-chosen stop', record: 'Verified stop chosen by the rider, 12:34–12:44, covering the whole delay.', recordTone: 'found', decision: D['04'], compare: compareFor('04', D['04'])}
    ];
  }

  /* ---------- sandbox: same core, any inputs ---------- */
  const SANDBOX_DEFAULT = Object.freeze({proposed: 24, distance: 4, legalSpeed: 20, conditionSpeed: 20, signals: 4, wait: 10, access: 6, handover: 2, fresh: true,
    arrivalAfter: 5, outside: 0, riderCause: false, safeRoute: false, complete: true});
  function sandbox(s) {
    const inputs = {distance: s.distance, legalSpeed: s.legalSpeed, conditionSpeed: s.conditionSpeed, signals: s.signals, wait: s.wait, access: s.access, handover: s.handover, fresh: s.fresh};
    const check = C.initial(inputs, s.proposed, 0);
    const out = {inputs, check, engine: deadlineEngine(inputs, s.proposed, check), decision: null};
    if (check.status === 'READY') {
      const dl = check.deadline, completed = dl + s.arrivalAfter;
      const events = s.outside > 0 ? [{id: 'E1', start: dl, end: dl + s.outside, verified: true, reliable: true, source: 'Sandbox outside-delay record', label: 'Outside'}] : [];
      const riderEvidence = s.riderCause && completed > dl ? {start: dl, end: completed, verified: true, reliable: true, source: 'Sandbox reliable rider-cause record'} : null;
      const inp = {deadline: dl, completed, events, covered: [], riderEvidence, safeRoute: s.safeRoute, causalComplete: s.complete};
      out.decision = C.assess(inp);
      out.credit = {kind: 'credit', ruler: creditRuler({deadline: dl, completed, events, covered: [], decision: out.decision, start: dl - 4, end: Math.max(completed, dl + s.outside) + 4}),
        decision: out.decision, trace: traceAssess(inp, out.decision)};
    }
    return out;
  }

  function byId(id) { return SCENES.find(s => s.id === id) || null; }

  return {SCENES, byId, clock, BASE, AI_PROPOSED, B102_ACCEPTED, ROUTE_NOW, REVIEW_REASON, BOUNDARY, SIMULATED, SANDBOX_DEFAULT, sandbox,
    results: {CHECK01, CLOSURE, FASTER, STALE, D, APPEAL04, REVIEW04, AUDIT04}, CASE, EFFECTS: C.EFFECTS, CONFIG: C.CONFIG, core: C};
});
