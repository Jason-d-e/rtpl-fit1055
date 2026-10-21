'use strict';

// The phone page lets anyone tap through A101 freely. Every outcome must still come
// from rtpl-core.js and agree with the presentation's numbers.

const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../app/phone-model.js');

function run(steps, opts) {
  let s = P.start(opts);
  for (const [type, args] of steps) {
    const r = P.act(s, type, args);
    assert.equal(r.error, undefined, `${type} should be allowed`);
    s = r.state;
  }
  return s;
}

test('The offer is checked: AI 12:24 becomes 12:34', () => {
  const s = P.start();
  assert.equal(s.phase, 'offer');
  assert.equal(P.clock(s.deadline), '12:34');
  assert.equal(s.log[0].rule, 'P02');
});

test('Out-of-date route data holds dispatch', () => {
  const s = P.start({fresh: false});
  assert.equal(s.phase, 'held');
  assert.equal(s.deadline, null);
  assert.equal(s.log[0].rule, 'P01');
});

test('An on-time trip is protected', () => {
  const s = run([['accept'], ['pickUp'], ['deliver']]);
  assert.equal(P.clock(s.completed), '12:34');
  assert.equal(s.decision.protected, true);
  assert.equal(s.decision.late, 0);
});

test('Kitchen delay moves the deadline; a personal stop is 5 / 0 / 5', () => {
  const s = run([['accept'], ['kitchenLate', {minutes: 10}], ['pickUp'], ['stop', {minutes: 5}], ['deliver']]);
  assert.equal(P.clock(s.deadline), '12:44');
  assert.equal(P.clock(s.completed), '12:49');
  assert.deepEqual([s.decision.late, s.decision.credit, s.decision.residual], [5, 0, 5]);
  assert.equal(s.decision.eligible, true);
});

test('Traffic with no record stays protected', () => {
  const s = run([['accept'], ['pickUp'], ['jam', {minutes: 10}], ['deliver']]);
  assert.equal(s.decision.protected, true);
});

test('Road closure moves later; a shortcut never moves it earlier', () => {
  const closed = run([['accept'], ['pickUp'], ['roadClosed']]);
  assert.equal(P.clock(closed.deadline), '12:44');
  const short = run([['accept'], ['pickUp'], ['roadClosed'], ['shortcut']]);
  assert.equal(P.clock(short.deadline), '12:44');
  assert.equal(P.clock(P.arrival(short)), '12:33');
});

test('A safe detour and lost GPS are both protected', () => {
  assert.equal(run([['accept'], ['pickUp'], ['detour'], ['deliver']]).decision.policy, 'P05');
  assert.equal(run([['accept'], ['pickUp'], ['stop', {minutes: 10}], ['gpsLost'], ['deliver']]).decision.protected, true);
});

test('Appeal suspends; review needs authority, then REVERSE protects', () => {
  const late = run([['accept'], ['pickUp'], ['stop', {minutes: 10}], ['deliver'], ['appeal', {message: 'Bridge was icy.'}]]);
  assert.equal(late.decision.appeal.status, 'PENDING');
  const refused = P.act(late, 'review', {authorised: false, outcome: 'REVERSE', reason: 'Checked'});
  assert.match(refused.error, /authority/i);
  const done = P.act(late, 'review', {authorised: true, outcome: 'REVERSE', reason: 'Checked the route log.'}).state;
  assert.equal(done.decision.protected, true);
  assert.equal(done.record.policy, 'P06');
  assert.equal(done.record.appeal, 'REVERSE');
});

test('Taps out of order are refused without changing the trip', () => {
  const s = P.start();
  const r = P.act(s, 'deliver');
  assert.ok(r.error);
  assert.equal(r.state, s);
});
