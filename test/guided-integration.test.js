'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../rtpl-core.js');
const Scenario = require('../guided/scenario.js');
const Store = require('../guided/store.js');
const Adapter = require('../guided/adapter.js');
const App = require('../guided/app.js');

const root = path.join(__dirname, '..');

function walkKeys(value, prefix = '', output = []) {
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? prefix + '.' + key : key;
    output.push(next.toLowerCase());
    walkKeys(child, next, output);
  }
  return output;
}

test('all connected projections use one protected deadline while AI remains separate', () => {
  for (let step = 0; step < Scenario.STEP_COUNT; step += 1) {
    const model = Adapter.buildSimulationModel(Core, step);
    assert.equal(model.ai.proposedDeadlineMinute, 24);
    if (step < Scenario.STEP_INDEX.RTPL_CHECKED) {
      assert.equal(model.customer.deadlineMinute, null);
      assert.equal(model.order.protectedDeadlineMinute, null);
    } else {
      assert.equal(model.customer.deadlineMinute, model.order.protectedDeadlineMinute);
      assert.equal(model.rtpl.effectiveDeadlineMinute, model.order.protectedDeadlineMinute);
    }
  }
});

test('customer projection contains no workplace evidence, appeal, review, effect or audit data', () => {
  const forbidden = ['rider', 'evidence', 'appeal', 'review', 'effect', 'audit', 'gps', 'identity', 'reason'];
  const forbiddenValues = forbidden.filter(word => word !== 'rider');
  for (let step = 0; step < Scenario.STEP_COUNT; step += 1) {
    const customer = Adapter.buildSimulationModel(Core, step).customer;
    const keys = walkKeys(customer);
    const serialised = JSON.stringify(customer).toLowerCase();
    for (const word of forbidden) {
      assert.equal(keys.some(key => key.includes(word)), false, word + ' key leaked at step ' + step);
    }
    for (const word of forbiddenValues) {
      assert.equal(serialised.includes(word), false, word + ' value leaked at step ' + step);
    }
  }
});

test('the same controller action sequence produces the same final snapshot', () => {
  const actions = [
    {type: Store.ACTIONS.NEXT},
    {type: Store.ACTIONS.SET_SPEED, speed: 4},
    {type: Store.ACTIONS.GOTO, stepIndex: 6},
    {type: Store.ACTIONS.PREV},
    {type: Store.ACTIONS.PLAY},
    {type: Store.ACTIONS.PAUSE},
    {type: Store.ACTIONS.NEXT}
  ];
  function run() {
    return actions.reduce(Store.reduceState, Store.initialState());
  }
  assert.deepEqual(run(), run());
  assert.deepEqual(Adapter.buildSimulationModel(Core, run().stepIndex), Adapter.buildSimulationModel(Core, 6));
});

test('reset and destroy cancel pending playback timers', () => {
  let nextTimer = 0;
  const scheduled = new Set();
  const store = Store.createStore({
    setTimer() { nextTimer += 1; scheduled.add(nextTimer); return nextTimer; },
    clearTimer(timer) { scheduled.delete(timer); }
  });
  store.play();
  assert.equal(scheduled.size, 1);
  store.reset();
  assert.equal(scheduled.size, 0);
  store.play();
  assert.equal(scheduled.size, 1);
  store.destroy();
  assert.equal(scheduled.size, 0);
});

test('sandbox exercises P05 safe-route protection and P04 protection by default', () => {
  const base = {
    completedMinute: 40,
    riderEvidence: {start: 34, end: 40, verified: true, reliable: true, source: 'Synthetic evidence'}
  };
  const safe = Adapter.runSandbox(Core, {...base, safeRoute: true});
  assert.equal(safe.assessment.policy, 'P05');
  assert.equal(safe.assessment.protected, true);
  const incomplete = Adapter.runSandbox(Core, {completedMinute: 40, causalComplete: false});
  assert.equal(incomplete.assessment.policy, 'P04');
  assert.equal(incomplete.assessment.branch, 'CAUSE_RECORD_INCOMPLETE');
  assert.equal(incomplete.assessment.protected, true);
});

test('form adapter preserves the 34-minute default floor without copying policy logic', () => {
  const values = {
    now: '0', proposed: '24', distance: '4', conditionSpeed: '20', legalSpeed: '20',
    serviceMinutes: '22', externalDelay: '10', alreadyCovered: '0', lateMinutes: '5',
    causeEvidence: 'rider', safeRoute: false, fresh: true
  };
  const form = {
    elements: {
      namedItem(name) {
        if (name === 'causeEvidence') return {value: values[name]};
        if (name === 'safeRoute' || name === 'fresh') return {checked: values[name]};
        return {value: values[name]};
      }
    }
  };
  const inputs = App.sandboxInputsFromForm(form);
  const result = Adapter.runSandbox(Core, inputs);
  assert.equal(result.initial.deadline, 34);
  assert.equal(result.effectiveDeadline, 44);
  assert.equal(result.assessment.residual, 5);
  assert.equal(result.assessment.eligible, true);
});

test('guided page keeps required IDs, classic script order and local-only assets', () => {
  const html = fs.readFileSync(path.join(root, 'guided-demo.html'), 'utf8');
  const ids = [
    'app-status', 'step-title', 'step-summary', 'sim-time', 'btn-prev', 'btn-play',
    'btn-next', 'btn-reset', 'speed-controls', 'timeline', 'rider-screen',
    'customer-screen', 'control-screen', 'map-status', 'rule-trace', 'ethics-panel',
    'audit-panel', 'sandbox-form', 'sandbox-result', 'btn-export-audit', 'live-region',
    'route-path', 'detour-path', 'rider-marker', 'rider-action', 'review-workflow',
    'review-action', 'restaurant-pin', 'customer-pin', 'delay-zone'
  ];
  for (const id of ids) {
    assert.equal((html.match(new RegExp('id=["\\\']' + id + '["\\\']', 'g')) || []).length, 1, id);
  }
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(scripts, [
    './rtpl-core.js', './guided/scenario.js', './guided/store.js',
    './guided/adapter.js', './guided/view.js', './guided/app.js'
  ]);
  assert.equal(/(?:src|href)="https?:\/\//i.test(html), false);
  assert.match(html, /Synthetic Noodle Kitchen/);
  assert.match(html, /data-bind="budget-access"/);
  assert.match(html, /data-bind="budget-handover"/);
  assert.match(html, /1\.3 Be Honest and Trustworthy/);
  assert.match(html, /3\.4 Policies and Processes/);
});

test('guided runtime exposes deterministic deep links and uses no network or persistence API', () => {
  assert.equal(App.parseStepHash('#step-0'), 0);
  assert.equal(App.parseStepHash('#step-9'), 9);
  assert.equal(App.parseStepHash('#step-999'), 9);
  assert.equal(App.parseStepHash('#sandbox-form'), 0);
  const runtime = ['guided/app.js', 'guided/view.js', 'guided/adapter.js']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8'))
    .join('\n');
  assert.equal(/\bfetch\s*\(/.test(runtime), false);
  assert.equal(/\bXMLHttpRequest\b/.test(runtime), false);
  assert.equal(/\blocalStorage\b|\bsessionStorage\b/.test(runtime), false);
});
