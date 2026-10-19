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

  /* ---------- the order every scene follows (invented shop, address and app) ---------- */
  const ORDER = Object.freeze({id: 'A101', restaurant: 'Noodle Kitchen', drop: 'Maple Court, Block 3', unit: 'Unit 1204', km: 4,
    items: [['Beef noodle soup', 2, 14.5], ['Iced lemon tea', 1, 4.5]], fee: 3.9, dropB: 'Canal Side Apartments'});
  const ITEMS = ORDER.items.map(([n, q]) => q + ' × ' + n).join(' · ');

  /* ---------- phone states ---------- */
  const restaurant = ORDER.restaurant;
  const rider = {
    idle: (msg) => ({kind: 'idle', msg: msg || 'Waiting for orders nearby'}),
    offer: (deadline) => ({kind: 'offer', id: 'A101', deadline, km: ORDER.km, pickup: restaurant, drop: ORDER.drop}),
    trip: (stage, orders, banner) => ({kind: 'trip', stage, orders, banner: banner || null}),
    result: (k, opts) => ({kind: 'result', caseNum: k, ...opts})
  };
  const customer = {
    confirming: () => ({kind: 'confirming', restaurant}),
    eta: (eta, status, banner) => ({kind: 'eta', restaurant, eta, status, banner: banner || null}),
    delivered: (at, eta) => ({kind: 'delivered', restaurant, at, eta})
  };

  function explain(k, d) {
    if (k === '02') return 'The kitchen’s 10 minutes already gave you until 12:44, so they can’t count twice. Nothing shows you caused the last 5 minutes, so nothing applies.';
    if (k === '03') return 'No one recorded why the order was late. Being late is not proof, so nothing applies.';
    if (k === '04') return 'A record shows you stopped from 12:34 to 12:44. This can now be assessed, but nothing has been deducted. You can see the record and ask a person to review it.';
    if (k === '05') return 'You went around a flooded underpass on a legal route. A safe choice is never held against you.';
    if (k === '06') return 'Traffic and the restaurant overlapped. Together they cover all 10 minutes.';
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
    if (k === '02') return {simple: 'Count the kitchen delay again: 5 min excused.', rtpl: 'Already used once: 0 new credit. No proof the rider caused the 5 min, so protected.'};
    if (k === '06') return {simple: 'Add both: 7 + 6 = 13 min.', rtpl: 'They overlap 12:38–12:41: 10 real minutes.'};
    if (k === '03') return {simple: 'Late means at fault: assess.', rtpl: 'No record of why: protect automatically.'};
    if (k === '04') return {simple: 'Late with a record: penalise now.', rtpl: 'Assess only. Nothing deducted; record shown; appeal open.'};
    if (k === '05') return {simple: 'Rider chose a slower route: rider’s fault.', rtpl: 'A safe, legal detour: protected.'};
    return null;
  }

  /* ---------- map states ---------- */
  const at = (place) => ({place});
  const pins = list => list;

  /* ---------- the hand-held customer phone (slides 2 and 5) ---------- */
  const PARTS01 = C.budgetParts(BASE);
  // What the AI time would demand: whatever is left after the stops must cover the whole 4 km.
  const STOPS = PARTS01.signals + PARTS01.wait + PARTS01.access + PARTS01.handover;
  const RIDE_LEFT = AI_PROPOSED - STOPS;
  const SPEED = Object.freeze({rideLeft: RIDE_LEFT, need: Math.round(BASE.distance / (RIDE_LEFT / 60)), legal: PARTS01.speed, km: BASE.distance});
  const hand = (script, stage) => ({script, stage, ai: AI_PROPOSED, parts: PARTS01, deadline: CHECK01.deadline, order: ORDER, speed: SPEED});

  /* ---------- scenes ---------- */
  const SCENES = [
    {id: 'slide-2', slide: 2, presenter: 'Liyuan Liang', title: 'One lunch order, one tight deadline', short: 'The order', group: 'main',
      beats: [
        {time: 0, center: 'handphone', solo: true, hand: hand('order', 0),
          caption: '12:00. A customer orders lunch from Noodle Kitchen: two beef noodle soups and an iced lemon tea, to Maple Court, 4 km away.',
          note: 'On page load this waits on the first frame: press → (or R) to start. Let the animation play: open the app, pick the shop, add the food, pay. Press → once it says Order placed.'},
        {time: 0, center: 'handphone', solo: true, hand: hand('order', 1), result: 'The AI suggests 12:24',
          caption: 'The order goes to the platform. Its AI picks a rider and suggests a delivery time: 12:24. That is only 24 minutes.',
          note: 'Point at 12:24. Press → to show what the trip really takes.'},
        {time: 0, center: 'handphone', solo: true, hand: hand('order', 2), result: '34 min needed, 24 given: 10 min short',
          caption: 'But the trip really takes 34 minutes: 12 to ride legally, plus 22 for lights, waiting for the food, getting into the building and handing over. Who makes up the missing 10?',
          note: 'Point at the speedometer: 2 minutes left to ride 4 km means 120 km/h. Ask the question, pause two seconds. Made-up example numbers. Back to the slides for 3 and 4.'}
      ]},

    {id: 'slide-5', slide: 5, presenter: 'Yanyu Zhu', title: 'Where RTPL sits', short: 'Overview', group: 'main',
      beats: [
        {time: 2, center: 'handphone', solo: true, hand: hand('status', 0),
          caption: 'The customer has paid. The app shows each step, and an arrival time of 12:34, not the AI’s 12:24. Why?',
          note: 'Let the four steps appear. Point at 12:34. Press → to look behind the screen.'},
        {time: 0, center: 'overview', solo: true, overview: {stage: 1, ai: AI_PROPOSED, out: CHECK01.deadline}, result: 'The AI’s 12:24 goes in. A checked 12:34 comes out.',
          caption: 'Behind the screen, RTPL sits between the AI and the apps. It checks three times: before the rider gets a time, after delivery, and if the rider disagrees.',
          note: 'Point at the AI box, the three RTPL steps, then the apps. Next: step 1 on the map.'}
      ]},

    {id: 'slide-6', slide: 6, presenter: 'Yanyu Zhu', title: 'Check 1: can a rider make it in time?', short: 'First check', group: 'main', caseNum: '01',
      beats: [
        {time: 0, center: 'map',
          map: {rider: at('hub'), pins: pins(['rest', 'custA']), routes: [{path: 'mainA', style: 'planned'}], tags: [{at: [640, 250], text: '4 km legal route'}],
            speedo: {kmh: SPEED.need, limit: SPEED.legal, label: 'Needed to reach 12:24'}},
          engine: deadlineEngine(BASE, AI_PROPOSED, null),
          caption: 'Back to 12:00. The AI suggests 12:24. Before anyone sees it, RTPL asks: can a rider really make it without speeding?',
          note: 'Point at the speedometer: 12:24 would need 120 km/h. Both phones show no time yet. Press → to run the check.',
          rider: rider.idle(), customer: customer.confirming()},
        {time: 0, center: 'map', result: '24 min was 10 short. Everyone gets 12:34.',
          map: {rider: at('hub'), pins: pins(['rest', 'custA']), routes: [{path: 'mainA', style: 'active'}], tags: [{at: [640, 250], text: '4 km at 20 km/h'}],
            speedo: {kmh: SPEED.legal, limit: SPEED.legal, label: 'Legal speed for 12:34'}},
          engine: deadlineEngine(BASE, AI_PROPOSED, CHECK01),
          caption: 'No. Riding 4 km at the legal 20 km/h takes 12 minutes, and the stops along the way add 22. That makes 34, so the rider and the customer both get 12:34.',
          note: 'Point at the 10 min short box, then both phones: 12:34.',
          rider: rider.offer(CHECK01.deadline), customer: customer.eta(CHECK01.deadline, 'Preparing')},
        {time: 2, center: 'map',
          map: {move: {path: 'toRest', from: 0, to: 1}, pins: pins(['rest', 'custA']), routes: [{path: 'toRest', style: 'pickup'}, {path: 'mainA', style: 'active'}]},
          engine: deadlineEngine(BASE, AI_PROPOSED, CHECK01, {locked: true}),
          caption: 'The rider accepts and heads to Noodle Kitchen. From now on, 12:34 can only move later, never earlier.',
          note: 'Point at the lock. Next: what happens when the road changes.',
          rider: rider.trip('pickup', [{id: 'A101', deadline: CHECK01.deadline}]), customer: customer.eta(CHECK01.deadline, 'Rider assigned')}
      ]},

    {id: 'slide-7', slide: 7, presenter: 'Yanyu Zhu', title: 'The road changes, the promise holds', short: 'Route change', group: 'main', caseNum: '01',
      beats: [
        {time: ROUTE_NOW, center: 'map',
          map: {rider: at('rest'), pins: pins(['rest', 'custA', 'custB']), routes: [{path: 'mainA', style: 'active'}, {path: 'onToB', style: 'active'}]},
          engine: {kind: 'bundle', stage: 0, rows: bundleRows(0), trace: traceBundle(0)},
          caption: '12:20. The rider picks up two orders: A101 to Maple Court, due 12:34, and B102 to Canal Side, due 12:42.',
          note: 'Two orders on one trip. Press → to close a road.',
          rider: rider.trip('pickup', [{id: 'A101', deadline: 34}, {id: 'B102', deadline: B102_ACCEPTED}]), customer: customer.eta(34, 'Rider at restaurant')},
        {time: ROUTE_NOW, center: 'map', result: 'A101 moves to 12:44, B102 to 12:50',
          map: {rider: at('rest'), pins: pins(['rest', 'custA', 'custB']), markers: ['closure'],
            routes: [{path: 'mainA', style: 'blocked'}, {path: 'closureA', style: 'active'}, {path: 'onToB', style: 'active'}]},
          engine: {kind: 'bundle', stage: 1, rows: bundleRows(1), trace: traceBundle(1, CLOSURE, FASTER)},
          caption: 'Harbour Road closes. The detour is longer, so RTPL gives both orders more time: 12:44 and 12:50. The rider and both customers are told together.',
          note: 'Point at the red closure, the new route, then the table. The customer phone now says 12:44.',
          rider: rider.trip('pickup', [{id: 'A101', deadline: 44, prev: 34}, {id: 'B102', deadline: 50, prev: 42}], {tone: 'info', text: 'Road closed. Both orders get more time.'}),
          customer: customer.eta(44, 'Rider at restaurant', 'A road is closed on the way. New arrival time: 12:44.')},
        {time: ROUTE_NOW, center: 'map', result: 'Neither time moves earlier',
          map: {move: {path: 'fasterA', from: 0, to: 0.55}, pins: pins(['rest', 'custA', 'custB']), markers: ['closure'],
            routes: [{path: 'mainA', style: 'blocked'}, {path: 'fasterA', style: 'faster'}, {path: 'onToB', style: 'active'}]},
          engine: {kind: 'bundle', stage: 2, rows: bundleRows(2), trace: traceBundle(2, CLOSURE, FASTER)},
          caption: 'Then a shortcut opens. A fresh estimate would say 12:33 and 12:35, but RTPL keeps 12:44 and 12:50. A time already promised to the rider never moves earlier.',
          note: 'Point at the crossed-out 12:33 / 12:35. Both phones still say 12:44. Hand over to Yixuan.',
          rider: rider.trip('delivering', [{id: 'A101', deadline: 44}, {id: 'B102', deadline: 50}], {tone: 'ok', text: 'Shortcut found. Your times stay the same.'}),
          customer: customer.eta(44, 'On the way', 'Same time as your rider: 12:44.')}
      ]},

    {id: 'slide-8', slide: 8, presenter: 'Yixuan Hu', title: 'A delay can only be excused once', short: 'Delay credit', group: 'main', caseNum: '02',
      beats: [
        {time: 34, center: 'map',
          map: {rider: at('rest'), pins: pins(['rest', 'custA']), markers: ['kitchen'], routes: [{path: 'mainA', style: 'active'}]},
          engine: creditEngine('02', false, {hideArrival: true}),
          caption: 'Same order, another day. The kitchen was 10 minutes late, so RTPL already moved the deadline from 12:34 to 12:44.',
          note: 'Blue bar = kitchen delay. Stripes = already added to the deadline. Press → to deliver.',
          rider: rider.trip('pickup', [{id: 'A101', deadline: 44, prev: 34}], {tone: 'info', text: 'Kitchen running late. Deadline now 12:44.'}),
          customer: customer.eta(44, 'Preparing', 'The restaurant needed more time. New arrival time: 12:44.')},
        {time: 49, center: 'map',
          map: {move: {path: 'mainA', from: 0, to: 1}, clockFrom: 44, pins: pins(['rest', 'custA']), markers: ['kitchen'], routes: [{path: 'mainA', style: 'done'}]},
          engine: creditEngine('02', false),
          caption: 'The rider arrives at 12:49. That is 5 minutes late.',
          note: 'Point at the red 5 min. Ask: can the kitchen delay excuse it again? Press →.',
          rider: rider.trip('delivered', [{id: 'A101', deadline: 44, completed: 49}]), customer: customer.delivered(49, 44)},
        {time: 49, center: 'map', result: '5 min late, 0 new credit, 5 still unexplained. Rider protected.',
          map: {rider: at('custA'), pins: pins(['rest', 'custA']), markers: ['kitchen'], routes: [{path: 'mainA', style: 'done'}]},
          engine: creditEngine('02', true),
          caption: 'Can the kitchen excuse those 5 minutes? No, it was already used once. But nothing shows the rider caused them, so the rider is still protected.',
          note: 'Read 5 / 0 / 5, then the comparison box. Keep going: next, two cases that are equally late.',
          rider: riderResult('02', D['02']), customer: customer.delivered(49, 44)}
      ]},

    {id: 'slide-9', slide: 9, presenter: 'Yixuan Hu', title: 'Late is not the same as at fault', short: 'Evidence', group: 'main', caseNum: '03 · 04',
      phones: ['rider:03', 'rider:04'],
      beats: [
        {time: 44, center: 'compare', compare: {reveal: 0, cases: compareCases()},
          caption: 'Two riders, both 10 minutes late. The only difference is the evidence.',
          note: 'Left phone is case 03, right phone is case 04. Press → for case 03.',
          riderL: rider.trip('delivered', [{id: 'A101', deadline: 34, completed: 44}]), riderR: rider.trip('delivered', [{id: 'A101', deadline: 34, completed: 44}])},
        {time: 44, center: 'compare', result: '10 min late, cause not established. Rider protected.', compare: {reveal: 1, cases: compareCases()},
          caption: 'Case 03: no one recorded why it was late. Being late proves nothing, so the rider is protected automatically.',
          note: 'Point at the dashed “?” and the green result. Press → for case 04.',
          riderL: riderResult('03', D['03']), riderR: rider.trip('delivered', [{id: 'A101', deadline: 34, completed: 44}])},
        {time: 44, center: 'compare', result: 'Assessment can proceed. Nothing is applied yet.', compare: {reveal: 2, cases: compareCases()},
          caption: 'Case 04: a reliable record shows the rider chose to stop for 10 minutes. Now it can be assessed, but nothing is deducted yet, and the rider can see the record.',
          note: 'Stress: assessed is not punished. The right phone offers Request human review. Hand over to Shengbao for the appeal.',
          riderL: riderResult('03', D['03']), riderR: riderResult('04', D['04'])}
      ]},

    {id: 'slide-10', slide: 10, presenter: 'Shengbao Lu', title: 'Appeal: pause first, then a person decides', short: 'Appeal', group: 'main', caseNum: '04',
      beats: [
        {time: 44, center: 'review', review: {stage: 0, decision: D['04'], trace: traceReview(0)},
          caption: 'The case 04 rider disagrees and taps Request human review.',
          note: 'Tap Request human review on the rider phone, or press →.',
          rider: riderResult('04', D['04'], 'available'), customer: customer.delivered(44, 34)},
        {time: 49, center: 'review', result: 'All four effects SUSPENDED.', review: {stage: 1, decision: APPEAL04, trace: traceReview(1)},
          caption: '12:49. All four possible penalties are paused straight away while a person looks at the case.',
          note: 'Four cards turn purple. The customer sees none of this. Optional: untick authority to show a refusal. Press → to decide.',
          rider: riderResult('04', APPEAL04, 'pending'), customer: customer.delivered(44, 34)},
        {time: 54, center: 'review', result: 'All four effects PROTECTED. Appeal REVERSE.', review: {stage: 2, decision: REVIEW04, trace: traceReview(2, REVIEW04)},
          caption: '12:54. A reviewer with authority reverses the decision and writes down why. All four are cleared.',
          note: 'Point at REVERSE and the reason the rider receives. Next: oversight.',
          rider: riderResult('04', REVIEW04, 'done'), customer: customer.delivered(44, 34)}
      ]},

    {id: 'slide-11', slide: 11, presenter: 'Shengbao Lu', title: 'A record for oversight, and nothing more', short: 'Oversight', group: 'main', caseNum: '04',
      beats: [
        {time: 54, center: 'audit', audit: {stage: 0, record: AUDIT04},
          caption: 'RTPL keeps a short record for checking later: which rule version, which rule, the outcome, and each of the four effects.',
          note: 'Point at DEMO-1.0, P06, REVERSE and the four effects. Press → for who sees what.',
          rider: riderResult('04', REVIEW04, 'done'), customer: customer.delivered(44, 34)},
        {time: 54, center: 'audit', result: 'A minimised record: no identity, GPS, raw evidence or free-text reason.', audit: {stage: 1, record: AUDIT04},
          caption: 'Each person sees only what they need. The record leaves out who the rider is, GPS, raw evidence and the reviewer’s notes.',
          note: 'Download audit summary saves the file. Then back to the slides for slide 12.',
          rider: riderResult('04', REVIEW04, 'done'), customer: customer.delivered(44, 34)}
      ]},

    /* ---------- question-time extras ---------- */
    {id: 'qa-07', slide: null, presenter: null, title: 'Out-of-date route data', short: '07 Stale data', group: 'extra', caseNum: '07',
      beats: [
        {time: 0, center: 'map',
          map: {rider: at('hub'), pins: pins(['rest', 'custA']), stale: true, routes: [{path: 'mainA', style: 'planned'}]},
          engine: deadlineEngine({...BASE, fresh: false}, AI_PROPOSED, null, {stale: true}),
          caption: 'Same order, but the map data is out of date. RTPL cannot check the time against today’s roads.',
          note: 'Press → to run the check.',
          rider: rider.idle(), customer: customer.confirming()},
        {time: 0, center: 'map', result: 'Dispatch held for review. No unchecked deadline published.',
          map: {rider: at('hub'), pins: pins(['rest', 'custA']), stale: true, routes: [{path: 'mainA', style: 'blocked'}]},
          engine: deadlineEngine({...BASE, fresh: false}, AI_PROPOSED, STALE, {stale: true}),
          caption: 'So it sends no time at all. The customer sees Confirming, and the rider gets no deadline to chase.',
          note: 'Rule P01 comes before any arithmetic.',
          rider: rider.idle('Order held for a dispatch check'), customer: customer.confirming()}
      ]},
    {id: 'qa-06', slide: null, presenter: null, title: 'Overlapping outside delays', short: '06 Overlap', group: 'extra', caseNum: '06',
      beats: [
        {time: 44, center: 'map',
          map: {rider: at('custA'), pins: pins(['rest', 'custA']), markers: ['traffic', 'handoff'], routes: [{path: 'mainA', style: 'done'}]},
          engine: creditEngine('06', false),
          caption: 'Arrived 12:44, 10 minutes late. Traffic held the rider 12:34–12:41, and the restaurant hand-off ran 12:38–12:44.',
          note: 'Two blue bars overlap. Press →.',
          rider: rider.trip('delivered', [{id: 'A101', deadline: 34, completed: 44}]), customer: customer.delivered(44, 34)},
        {time: 44, center: 'map', result: '10 unique minutes excused, not 13. Nothing left unexplained.',
          map: {rider: at('custA'), pins: pins(['rest', 'custA']), markers: ['traffic', 'handoff'], routes: [{path: 'mainA', style: 'done'}]},
          engine: creditEngine('06', true),
          caption: 'Adding them gives 13 minutes, but they overlap. RTPL counts the 10 real minutes, which covers the whole delay.',
          note: '7 + 6 − 3 overlapping = 10.',
          rider: riderResult('06', D['06']), customer: customer.delivered(44, 34)}
      ]},
    {id: 'qa-05', slide: null, presenter: null, title: 'Safe legal detour', short: '05 Detour', group: 'extra', caseNum: '05',
      beats: [
        {time: 34, center: 'map',
          map: {move: {path: 'safeDetour', from: 0, to: 1}, clockFrom: 24, pins: pins(['rest', 'custA']), markers: ['flood'], routes: [{path: 'mainA', style: 'blocked'}, {path: 'safeDetour', style: 'detour'}]},
          engine: creditEngine('05', false),
          caption: '10 minutes late, because the rider went around a flooded underpass on a longer, legal route.',
          note: 'Press → to check responsibility.',
          rider: rider.trip('delivered', [{id: 'A101', deadline: 34, completed: 44}]), customer: customer.delivered(44, 34)},
        {time: 44, center: 'map', result: 'Rider protected: a verified safe, legal detour.',
          map: {rider: at('custA'), pins: pins(['rest', 'custA']), markers: ['flood'], routes: [{path: 'mainA', style: 'blocked'}, {path: 'safeDetour', style: 'done'}]},
          engine: creditEngine('05', true),
          caption: 'A safe, legal detour is never held against the rider. Rule P05 keeps them protected.',
          note: 'P05 is checked before P04.',
          rider: riderResult('05', D['05']), customer: customer.delivered(44, 34)}
      ]},
    {id: 'sandbox', slide: null, presenter: null, title: 'Sandbox: your own numbers', short: 'Sandbox', group: 'extra', caseNum: null, sandbox: true,
      beats: [{time: null, center: 'sandbox', caption: 'Change any number. The same rules respond. Nothing here matches the slides.', note: 'Use during questions only.'}]}
  ];

  // Shown as a lower-third name card when a new presenter takes over.
  const SECTIONS = {'Liyuan Liang': 'Slide 2 · The problem', 'Yanyu Zhu': 'Slides 5–7 · Checking the time', 'Yixuan Hu': 'Slides 8–9 · Delays and evidence', 'Shengbao Lu': 'Slides 10–12 · Appeal, oversight, program logic'};
  // Who presents each of the 15 PPT slides; the handover card uses it for the slides shown only in PowerPoint.
  const PPT_TOTAL = 15;
  const PPT_OWNER = {1: 'Liyuan Liang', 2: 'Liyuan Liang', 3: 'Liyuan Liang', 4: 'Liyuan Liang', 5: 'Yanyu Zhu', 6: 'Yanyu Zhu', 7: 'Yanyu Zhu',
    8: 'Yixuan Hu', 9: 'Yixuan Hu', 10: 'Shengbao Lu', 11: 'Shengbao Lu', 12: 'Shengbao Lu', 13: 'Can Shang', 14: 'Enci Li', 15: 'Liyuan Liang'};

  // The talk as one sequence: every PPT page in order, and right after a page that has a website scene, that scene.
  // Items: 'p3' = PPT page 3 (assets/slides/03.webp); 'w:slide-6' = the website scene for slide 6.
  const SHOW_DEFAULT = Object.freeze([].concat(...Array.from({length: PPT_TOTAL}, (_, k) => {
    const n = k + 1, sc = SCENES.find(s => s.group === 'main' && s.slide === n);
    return sc ? ['p' + n, 'w:' + sc.id] : ['p' + n];
  })));

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
      {num: '03', title: 'No record of why', record: 'Nobody recorded what caused the delay.', recordTone: 'missing', decision: D['03'], compare: compareFor('03', D['03'])},
      {num: '04', title: 'Record: the rider chose to stop', record: 'Reliable record: the rider stopped 12:34–12:44, the whole delay.', recordTone: 'found', decision: D['04'], compare: compareFor('04', D['04'])}
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

  return {SCENES, byId, clock, ORDER, ITEMS, SPEED, SECTIONS, PPT_TOTAL, PPT_OWNER, SHOW_DEFAULT, BASE, AI_PROPOSED, B102_ACCEPTED, ROUTE_NOW, REVIEW_REASON, BOUNDARY, SIMULATED, SANDBOX_DEFAULT, sandbox,
    results: {CHECK01, CLOSURE, FASTER, STALE, D, APPEAL04, REVIEW04, AUDIT04}, CASE, EFFECTS: C.EFFECTS, CONFIG: C.CONFIG, core: C};
});
