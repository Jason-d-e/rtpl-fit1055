'use strict';

// Every scene value is produced by rtpl-core.js and every beat renders.

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../rtpl-core.js');
const G = require('../app/geo.js');
const S = require('../app/scenes.js');

globalThis.RTPLCore = C;
globalThis.RTPLGeo = G;
globalThis.RTPLScenes = S;
require('../app/render.js');
const R = globalThis.RTPLRender;

const beat = (id, k) => S.byId(id).beats[k];

test('Slide 2: the order story uses the same 24 min proposal and the core 34 min breakdown', () => {
  const h = beat('slide-2', 2).hand;
  assert.equal(h.ai, 24);
  assert.deepEqual([h.parts.travel, h.parts.signals, h.parts.wait, h.parts.access, h.parts.handover, h.parts.total], [12, 4, 10, 6, 2, 34]);
  const html = R.handPhone(h);
  assert.ok(html.includes('12:24') && html.includes('34 min') && html.includes('10 min short'));
  assert.ok(R.apScreen('checkout', h).includes('$37.40'), '2 × 14.50 + 4.50 + 3.90 delivery');
});

test('Slide 2 and 6: 12:24 leaves 2 minutes to ride 4 km, which needs 120 km/h against a legal 20', () => {
  assert.deepEqual({...S.SPEED}, {rideLeft: 2, need: 120, legal: 20, km: 4});
  assert.equal(beat('slide-6', 0).map.speedo.kmh, 120);
  assert.equal(beat('slide-6', 1).map.speedo.kmh, 20);
  assert.ok(R.speedo(beat('slide-6', 0).map.speedo).includes('120 km/h'));
});

test('Two pieces of music: Liyuan’s opening has its own theme, everyone else shares one', () => {
  const fx = ['tap', 'ping', 'chime', 'success', 'alert', 'flip', 'whoosh', 'type', null];
  for (const s of S.SCENES) for (const b of s.beats) {
    assert.equal(b.theme, s.presenter === 'Liyuan Liang' ? 'opening' : 'main', s.id);
    assert.ok(fx.includes(b.sfx), s.id + ' ' + b.sfx);
  }
  for (const p of Object.keys(S.SECTIONS)) assert.ok(S.SCENES.some(s => s.presenter === p), p);
});

test('Slide 5: the customer app shows the checked 12:34, never the AI time', () => {
  const h = beat('slide-5', 0).hand;
  const html = R.apScreen('status', h);
  assert.ok(html.includes('12:34') && !html.includes('12:24'));
  assert.ok(!R.apScreen('status', h, 3).includes('12:34'), 'no time before the rider is assigned');
});

test('Slide 6: the AI proposal is extended to the checked floor and published to both apps', () => {
  const b = beat('slide-6', 1);
  assert.equal(b.engine.res.deadline, 34);
  assert.equal(b.engine.res.floor, 34);
  assert.equal(b.engine.parts.travel, 12);
  assert.equal(b.rider.deadline, 34);
  assert.equal(b.customer.eta, 34);
  assert.equal(beat('slide-6', 0).engine.res, null, 'nothing is published before the check');
  assert.equal(beat('slide-6', 0).customer.kind, 'confirming');
});

test('Slide 7: the closure extends both orders; the faster route shortens neither', () => {
  const close = beat('slide-7', 1).engine.rows, fast = beat('slide-7', 2).engine.rows;
  assert.deepEqual(close.map(r => [r.id, r.accepted, r.closure]), [['A101', 34, 44], ['B102', 42, 50]]);
  assert.deepEqual(fast.map(r => [r.id, r.faster, r.overwrite]), [['A101', 44, 33], ['B102', 50, 35]]);
  assert.equal(beat('slide-7', 2).customer.eta, beat('slide-7', 2).rider.orders[0].deadline, 'rider and customer share one time');
});

test('Slide 8: an already compensated delay earns no new credit', () => {
  const d = beat('slide-8', 2).engine.decision;
  assert.deepEqual([d.late, d.credit, d.residual, d.protected], [5, 0, 5, true]);
});

test('Slide 9: the same lateness with different evidence gives different decisions', () => {
  const [c03, c04] = beat('slide-9', 2).compare.cases.map(c => c.decision);
  assert.deepEqual([c03.late, c03.protected, c03.branch], [10, true, 'CAUSE_RECORD_INCOMPLETE']);
  assert.deepEqual([c04.late, c04.protected, c04.branch], [10, false, 'RIDER_CAUSE_SUPPORTED']);
  assert.ok(Object.values(c04.effects).every(v => v === 'ASSESSMENT ELIGIBLE'));
});

test('Slide 10: appeal suspends all four effects; authorised reversal protects all four', () => {
  assert.ok(Object.values(beat('slide-10', 1).review.decision.effects).every(v => v === 'SUSPENDED'));
  const d = beat('slide-10', 2).review.decision;
  assert.equal(d.appeal.status, 'REVERSE');
  assert.ok(Object.values(d.effects).every(v => v === 'PROTECTED'));
});

test('Slide 11: the audit record has only the minimised fields', () => {
  const rec = beat('slide-11', 0).audit.record;
  assert.deepEqual(Object.keys(rec), ['case', 'configuration', 'protectedDeadline', 'policy', 'late', 'credit', 'residual', 'protected', 'appeal', 'effects']);
  assert.deepEqual([rec.configuration, rec.policy, rec.protected, rec.appeal], ['DEMO-1.0', 'P06', true, 'REVERSE']);
  const text = JSON.stringify(rec);
  for (const banned of ['name', 'gps', 'lat', 'lng', 'source', 'reason', 'message']) assert.equal(new RegExp(`"${banned}"`, 'i').test(text), false, banned);
});

test('Extras: overlap counts 10 not 13; detour is P05; stale data holds dispatch', () => {
  const o = beat('qa-06', 1).engine.decision;
  assert.deepEqual([o.late, o.credit, o.residual], [10, 10, 0]);
  assert.equal(beat('qa-05', 1).engine.decision.policy, 'P05');
  const h = beat('qa-07', 1).engine.res;
  assert.deepEqual([h.status, h.policy, h.deadline], ['HOLD', 'P01', null]);
  assert.equal(beat('qa-07', 1).customer.kind, 'confirming');
});

test('Customer views never carry workplace decision data', () => {
  for (const s of S.SCENES) for (const b of s.beats) {
    if (!b.customer) continue;
    const keys = Object.keys(b.customer);
    for (const k of ['decision', 'effects', 'evidence', 'appeal', 'policy', 'stats']) assert.equal(keys.includes(k), false, `${s.id}: ${k}`);
    const html = R.customerPhone(b.customer, b.time || 0);
    for (const w of ['ASSESSMENT', 'SUSPENDED', 'P04', 'P06', 'unexplained']) assert.equal(html.includes(w), false, `${s.id} customer html: ${w}`);
  }
});

test('Every beat of every scene renders without throwing', () => {
  for (const s of S.SCENES) for (const b of s.beats) {
    if (b.rider) assert.ok(R.riderPhone(b.rider, b.time || 0).length > 100);
    if (b.riderL) assert.ok(R.riderPhone(b.riderL, b.time).length > 100);
    if (b.map) assert.ok(R.mapHtml(b.map, b.time, null).includes('id="rider"'));
    if (b.engine) assert.ok(R.engine(b.engine).includes('class="engine"'));
    if (b.overview) assert.ok(R.overview(b.overview).includes('ov-rtpl'));
    if (b.hand) assert.ok(R.handPhone(b.hand).includes('id="hp-screen"'));
    if (b.compare) assert.ok(R.compare(b.compare).includes('casecard'));
    if (b.review) assert.ok(R.review(b.review, {}).includes('fx-card'));
    if (b.audit) assert.ok(R.audit(b.audit).includes('audit-json'));
  }
});

test('Sandbox uses the same core and reacts to inputs', () => {
  const base = S.sandbox(S.SANDBOX_DEFAULT);
  assert.equal(base.check.deadline, 34);
  assert.equal(S.sandbox({...S.SANDBOX_DEFAULT, conditionSpeed: 10}).check.deadline, 46);
  assert.equal(S.sandbox({...S.SANDBOX_DEFAULT, fresh: false}).check.status, 'HOLD');
  assert.equal(S.sandbox({...S.SANDBOX_DEFAULT, riderCause: true}).decision.eligible, true);
  assert.equal(S.sandbox({...S.SANDBOX_DEFAULT, riderCause: true, safeRoute: true}).decision.policy, 'P05');
});

test('Map paths stay on the synthetic grid', () => {
  for (const name of Object.keys(G.PATHS)) {
    assert.ok(G.pathLength(name) > 0, name);
    const end = G.pointAt(name, 1), last = G.PATHS[name][G.PATHS[name].length - 1];
    assert.deepEqual(end.map(Math.round), last);
  }
});
