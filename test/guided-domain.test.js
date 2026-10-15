'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../rtpl-core.js');
const Scenario = require('../guided/scenario.js');
const Adapter = require('../guided/adapter.js');
const Store = require('../guided/store.js');

function valuesOf(object) {
  return Object.values(object);
}

test('Guided lifecycle has ten stable, repeatable steps', () => {
  assert.deepEqual(Scenario.STEP_IDS, [
    'ORDER_PLACED',
    'AI_PROPOSED',
    'RTPL_CHECKED',
    'RIDER_ACCEPTED',
    'ROAD_CLOSURE',
    'EN_ROUTE',
    'DELIVERED_ASSESSED',
    'APPEAL_PENDING',
    'HUMAN_REVIEWED',
    'AUDIT_READY'
  ]);
  assert.equal(Scenario.STEP_COUNT, 10);
  assert.equal(Scenario.STEPS[0].clock, '12:00');
  assert.equal(Scenario.STEPS[6].clock, '12:49');
  assert.equal(Scenario.STEPS[7].clock, '12:50');
  assert.equal(Scenario.STEPS[9].clock, '13:00');
  assert.ok(Object.isFrozen(Scenario.SCENARIO));
});

test('Every step exposes the expected current deadline', () => {
  const deadlines = Array.from({length: Scenario.STEP_COUNT}, (_, index) =>
    Adapter.buildSimulationModel(Core, index).order.deadlineMinute
  );
  assert.deepEqual(deadlines, [null, 24, 34, 34, 44, 44, 44, 44, 44, 44]);

  const labels = Array.from({length: Scenario.STEP_COUNT}, (_, index) =>
    Adapter.buildSimulationModel(Core, index).order.deadlineLabel
  );
  assert.deepEqual(labels, [null, '12:24', '12:34', '12:34', '12:44', '12:44', '12:44', '12:44', '12:44', '12:44']);
});

test('The A101 decisions are derived through the unchanged core', () => {
  const derived = Adapter.deriveScenario(Core);
  assert.equal(derived.budgetParts.total, 34);
  assert.equal(derived.initial.floor, 34);
  assert.equal(derived.initial.deadline, 34);

  assert.equal(derived.extensionAssessment.credit, 10);
  assert.deepEqual(derived.coveredIntervals, [[34, 44]]);
  assert.equal(derived.effectiveDeadline, 44);

  assert.equal(derived.assessment.late, 5);
  assert.equal(derived.assessment.credit, 0);
  assert.equal(derived.assessment.residual, 5);
  assert.equal(derived.assessment.branch, 'RIDER_CAUSE_SUPPORTED');
  assert.equal(derived.assessment.eligible, true);
  assert.equal(derived.safeRouteDecision.policy, 'P05');
  assert.equal(derived.safeRouteDecision.protected, true);

  assert.equal(derived.pendingAppeal.appeal.status, 'PENDING');
  assert.ok(valuesOf(derived.pendingAppeal.effects).every(value => value === 'SUSPENDED'));
  assert.equal(derived.reviewed.appeal.status, 'REVERSE');
  assert.equal(derived.reviewed.protected, true);
  assert.ok(valuesOf(derived.reviewed.effects).every(value => value === 'PROTECTED'));
});

test('Effects, appeal and review are revealed only at the correct steps', () => {
  for (let index = 0; index <= 5; index += 1) {
    const model = Adapter.buildSimulationModel(Core, index);
    assert.ok(valuesOf(model.effects).every(value => value === 'NOT ASSESSED'));
    assert.equal(model.appeal.visible, false);
  }

  const assessed = Adapter.buildSimulationModel(Core, 6);
  assert.ok(valuesOf(assessed.effects).every(value => value === 'ASSESSMENT ELIGIBLE'));
  assert.equal(assessed.appeal.status, 'NONE');

  const pending = Adapter.buildSimulationModel(Core, 7);
  assert.ok(valuesOf(pending.effects).every(value => value === 'SUSPENDED'));
  assert.equal(pending.appeal.status, 'PENDING');
  assert.equal(pending.appeal.submittedMinute, 50);

  for (const index of [8, 9]) {
    const reviewed = Adapter.buildSimulationModel(Core, index);
    assert.ok(valuesOf(reviewed.effects).every(value => value === 'PROTECTED'));
    assert.equal(reviewed.appeal.status, 'REVERSE');
    assert.equal(reviewed.review.authorised, true);
    assert.equal(reviewed.review.reviewedMinute, 60);
  }
});

test('Audit is available only at the final step and remains minimised', () => {
  assert.equal(Adapter.buildSimulationModel(Core, 8).audit, null);
  const audit = Adapter.buildSimulationModel(Core, 9).audit;
  assert.deepEqual(Object.keys(audit), [
    'case',
    'configuration',
    'protectedDeadline',
    'policy',
    'late',
    'credit',
    'residual',
    'protected',
    'appeal',
    'effects'
  ]);
  assert.equal(audit.case, 'A101');
  assert.equal(audit.protectedDeadline, 44);
  assert.equal(audit.appeal, 'REVERSE');
  const serialised = JSON.stringify(audit).toLowerCase();
  for (const forbidden of ['identity', 'name', 'gps', 'evidence', 'source', 'reason']) {
    assert.equal(serialised.includes(forbidden), false);
  }
});

test('Models are clamped, deterministic, immutable and timeline-derived', () => {
  const first = Adapter.buildSimulationModel(Core, -99);
  const again = Adapter.buildSimulationModel(Core, 0);
  const last = Adapter.buildSimulationModel(Core, 999);
  assert.deepEqual(first, again);
  assert.equal(last.step.id, 'AUDIT_READY');
  assert.equal(first.timeline[0].state, 'CURRENT');
  assert.equal(last.timeline[0].state, 'COMPLETED');
  assert.equal(last.timeline[9].state, 'CURRENT');
  assert.ok(Object.isFrozen(last));
  assert.ok(Object.isFrozen(last.effects));
});

test('Adapter calls the core for each critical decision', () => {
  const calls = Object.create(null);
  const wrapped = {...Core};
  for (const name of ['budgetParts', 'initial', 'assess', 'appeal', 'review', 'audit']) {
    wrapped[name] = (...args) => {
      calls[name] = (calls[name] || 0) + 1;
      return Core[name](...args);
    };
  }
  Adapter.buildSimulationModel(wrapped, 9);
  assert.equal(calls.budgetParts, 1);
  assert.equal(calls.initial, 1);
  assert.equal(calls.assess, 3);
  assert.equal(calls.appeal, 1);
  assert.equal(calls.review, 1);
  assert.equal(calls.audit, 1);
});

test('Store NEXT, PREV and GOTO remain stable at boundaries', () => {
  const store = Store.createStore();
  assert.equal(store.getState().stepIndex, 0);
  store.previous();
  assert.equal(store.getState().stepIndex, 0);
  store.goTo(500);
  assert.equal(store.getState().stepIndex, 9);
  store.next();
  assert.equal(store.getState().stepIndex, 9);
  store.goTo(-500);
  assert.equal(store.getState().stepIndex, 0);
  store.next();
  assert.equal(store.getState().stepIndex, 1);
  store.destroy();
});

test('Store supports only 1x, 2x and 4x, and RESET restores defaults', () => {
  const store = Store.createStore({initialStep: 4, initialSpeed: 2});
  assert.equal(store.getState().speed, 2);
  store.setSpeed(4);
  assert.equal(store.getState().speed, 4);
  assert.throws(() => store.setSpeed(3), /Playback speed must be one of/);
  store.play();
  assert.equal(store.getState().playing, true);
  store.pause();
  assert.equal(store.getState().playing, false);
  store.reset();
  assert.deepEqual(
    {stepIndex: store.getState().stepIndex, speed: store.getState().speed, playing: store.getState().playing},
    {stepIndex: 0, speed: 1, playing: false}
  );
  store.destroy();
});

test('PLAY uses speed-adjusted timers and automatically pauses at the end', () => {
  let nextId = 1;
  const timers = new Map();
  const delays = [];
  const store = Store.createStore({
    initialStep: 7,
    stepDurationMs: 2000,
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, function fireTimer() {
        timers.delete(id);
        callback();
      });
      delays.push(delay);
      return id;
    },
    clearTimer(id) { timers.delete(id); }
  });

  store.setSpeed(4);
  store.play();
  assert.equal(delays.at(-1), 500);
  const firstTimer = [...timers.values()][0];
  firstTimer();
  assert.equal(store.getState().stepIndex, 8);
  assert.equal(store.getState().playing, true);
  const secondTimer = [...timers.values()][0];
  secondTimer();
  assert.equal(store.getState().stepIndex, 9);
  assert.equal(store.getState().playing, false);
  assert.equal(timers.size, 0);
  store.destroy();
});

test('Sandbox reproduces the full extension, assessment, appeal and review flow', () => {
  const scenario = Scenario.SCENARIO;
  const result = Adapter.runSandbox(Core, {
    orderId: 'A101',
    routeInput: scenario.routeInput,
    proposedDeadline: 24,
    extensionEvents: [scenario.outsideDelay],
    completedMinute: 49,
    riderEvidence: scenario.riderEvidence,
    appealMinute: 50,
    review: scenario.review
  });

  assert.equal(result.status, 'READY');
  assert.equal(result.initial.deadline, 34);
  assert.equal(result.effectiveDeadline, 44);
  assert.deepEqual(result.coveredIntervals, [[34, 44]]);
  assert.equal(result.assessment.credit, 0);
  assert.equal(result.assessment.residual, 5);
  assert.equal(result.assessment.eligible, true);
  assert.equal(result.appeal.appeal.status, 'PENDING');
  assert.equal(result.review.appeal.status, 'REVERSE');
  assert.equal(result.audit.protected, true);
});

test('Sandbox holds stale inputs and rejects numerical credit for unverified delay', () => {
  const stale = Adapter.runSandbox(Core, {routeInput: {fresh: false}});
  assert.equal(stale.status, 'HOLD');
  assert.equal(stale.initial.policy, 'P01');
  assert.equal(stale.assessment, null);

  const unverified = Adapter.runSandbox(Core, {
    extensionEvents: [{
      ...Scenario.SCENARIO.outsideDelay,
      verified: false
    }],
    completedMinute: 49
  });
  assert.equal(unverified.effectiveDeadline, 34);
  assert.equal(unverified.extensionAssessment.credit, 0);
  assert.equal(unverified.assessment.protected, true);
});
