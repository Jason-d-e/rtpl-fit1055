'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const RTPL = require('../rtpl-core.js');

const BASE = Object.freeze({
  distance: 4,
  legalSpeed: 20,
  conditionSpeed: 20,
  signals: 4,
  wait: 10,
  access: 6,
  handover: 2,
  fresh: true
});

const base = overrides => ({...BASE, ...overrides});
const outsideEvent = (overrides = {}) => ({
  id: 'E',
  start: 34,
  end: 44,
  verified: true,
  reliable: true,
  source: 'Synthetic record',
  ...overrides
});
const riderEvidence = (overrides = {}) => ({
  start: 34,
  end: 44,
  verified: true,
  reliable: true,
  source: 'Synthetic causal evidence',
  ...overrides
});
const supportedDecision = () => RTPL.assess({
  deadline: 34,
  completed: 44,
  riderEvidence: riderEvidence()
});
const protectedDecision = () => RTPL.assess({deadline: 34, completed: 44});
const pendingAppeal = decision => RTPL.appeal(decision, 49, 44);

function assertEffects(decision, expected) {
  assert.equal(Object.keys(decision.effects).length, 4);
  assert.deepEqual(Object.keys(decision.effects), RTPL.EFFECTS);
  assert.ok(Object.values(decision.effects).every(value => value === expected));
}

test('T01 Condition-adjusted floor includes route and service allowances', () => {
  assert.equal(RTPL.budget(BASE), 34);
});

test('T02 AI deadline below the floor extends', () => {
  assert.equal(RTPL.initial(BASE, 24).deadline, 34);
});

test('T03 Later AI deadline retained', () => {
  assert.equal(RTPL.initial(BASE, 45).deadline, 45);
});

test('T04 Route cannot assume speed above legal cap', () => {
  assert.equal(RTPL.budget(base({conditionSpeed: 40})), 34);
});

test('T05 Adverse conditions lower speed and increase floor', () => {
  assert.equal(RTPL.budget(base({conditionSpeed: 10})), 46);
});

test('T06 Stale inputs hold dispatch', () => {
  const result = RTPL.initial(base({fresh: false}), 24);
  assert.equal(result.status, 'HOLD');
  assert.equal(result.policy, 'P01');
  assert.equal(result.deadline, null);
});

test('T07 Negative time rejected', () => {
  assert.throws(() => RTPL.initial(BASE, -1), /A non-negative finite number is required\./);
});

test('T08 Non-finite data rejected', () => {
  assert.throws(() => RTPL.budget(base({distance: Number.NaN})), /A non-negative finite number is required\./);
});

test('T09 Zero speed rejected', () => {
  assert.throws(() => RTPL.budget(base({legalSpeed: 0})), /Speed must be positive\./);
});

test('T10 Accepted deadlines never shorten', () => {
  const result = RTPL.recheckBundle([{id: 'A', deadline: 50}], 0, {A: BASE});
  assert.equal(result.orders[0].deadline, 50);
  assert.equal(result.orders[0].previous, 50);
});

test('T11 All affected orders rechecked', () => {
  const result = RTPL.recheckBundle(
    [{id: 'A', deadline: 34}, {id: 'B', deadline: 42}],
    20,
    {A: BASE, B: BASE}
  );
  assert.deepEqual(result.orders.map(order => order.deadline), [54, 54]);
});

test('T12 Incomplete bundle update is atomic', () => {
  const original = [{id: 'A', deadline: 34}, {id: 'B', deadline: 42}];
  const result = RTPL.recheckBundle(original, 20, {A: BASE});
  assert.equal(result.status, 'HOLD');
  assert.deepEqual(result.orders, original);
});

test('T13 On-time completion protected', () => {
  const result = RTPL.assess({deadline: 34, completed: 34});
  assert.equal(result.protected, true);
  assert.equal(result.branch, 'ON_TIME');
  assertEffects(result, 'PROTECTED');
});

test('T14 Late completion alone cannot establish fault', () => {
  const result = protectedDecision();
  assert.equal(result.protected, true);
  assert.equal(result.branch, 'RIDER_CAUSE_NOT_ESTABLISHED');
});

test('T15 Reliable causal evidence permits assessment', () => {
  const result = supportedDecision();
  assert.equal(result.eligible, true);
  assert.equal(result.branch, 'RIDER_CAUSE_SUPPORTED');
  assertEffects(result, 'ASSESSMENT ELIGIBLE');
});

test('T16 Partial causal evidence cannot establish whole residual responsibility', () => {
  const result = RTPL.assess({
    deadline: 34,
    completed: 44,
    riderEvidence: riderEvidence({end: 39})
  });
  assert.equal(result.protected, true);
  assert.equal(result.branch, 'RIDER_CAUSE_NOT_ESTABLISHED');
});

test('T17 Incomplete causal record overrides adverse inference', () => {
  const result = RTPL.assess({
    deadline: 34,
    completed: 44,
    riderEvidence: riderEvidence(),
    causalComplete: false
  });
  assert.equal(result.protected, true);
  assert.equal(result.branch, 'CAUSE_RECORD_INCOMPLETE');
});

test('T18 Verified safe alternative protected', () => {
  const result = RTPL.assess({
    deadline: 34,
    completed: 44,
    riderEvidence: riderEvidence(),
    safeRoute: true
  });
  assert.equal(result.protected, true);
  assert.equal(result.policy, 'P05');
  assert.equal(result.branch, 'SAFE_ALTERNATIVE');
});

test('T19 Unverified outside delay receives no numerical credit', () => {
  const result = RTPL.assess({
    deadline: 34,
    completed: 44,
    events: [outsideEvent({verified: false})]
  });
  assert.equal(result.credit, 0);
});

test('T20 Verified outside delay credited', () => {
  const result = RTPL.assess({deadline: 34, completed: 44, events: [outsideEvent()]});
  assert.equal(result.credit, 10);
  assert.equal(result.residual, 0);
});

test('T21 Overlapping intervals counted once', () => {
  const result = RTPL.assess({
    deadline: 34,
    completed: 44,
    events: [
      outsideEvent({id: 'E1', end: 41}),
      outsideEvent({id: 'E2', start: 38})
    ]
  });
  assert.equal(result.credit, 10);
});

test('T22 Duplicate event replay counted once', () => {
  const event = outsideEvent({end: 39});
  const result = RTPL.assess({deadline: 34, completed: 44, events: [event, {...event}]});
  assert.equal(result.credit, 5);
  assert.equal(result.verifiedEventCount, 1);
});

test('T23 Existing extension cannot receive a second credit', () => {
  const result = RTPL.assess({
    deadline: 44,
    completed: 49,
    events: [outsideEvent()],
    covered: [[34, 44]]
  });
  assert.equal(result.credit, 0);
  assert.equal(result.residual, 5);
  assert.equal(result.protected, true);
});

test('T24 Only uncovered part earns new credit', () => {
  const result = RTPL.assess({
    deadline: 34,
    completed: 44,
    events: [outsideEvent()],
    covered: [[34, 39]]
  });
  assert.equal(result.credit, 5);
});

test('T25 Full credit with causal evidence does not create negative interval', () => {
  const result = RTPL.assess({
    deadline: 34,
    completed: 44,
    events: [outsideEvent()],
    riderEvidence: riderEvidence()
  });
  assert.equal(result.residual, 0);
  assert.equal(result.protected, true);
  assert.equal(result.branch, 'COVERED_BY_OUTSIDE_DELAY');
});

test('T26 Appeal suspends all four separate effects', () => {
  const result = pendingAppeal(supportedDecision());
  assert.equal(result.appeal.status, 'PENDING');
  assert.equal(result.appeal.reviewDue, 1489);
  assertEffects(result, 'SUSPENDED');
});

test('T27 Appeal preserves automatic protection', () => {
  const result = pendingAppeal(protectedDecision());
  assert.equal(result.protected, true);
  assertEffects(result, 'PROTECTED');
});

test('T28 Expired filing window requests exceptional review', () => {
  assert.throws(
    () => RTPL.appeal(protectedDecision(), 2925, 44),
    /Demo filing period expired\. Request exceptional review\./
  );
});

test('T29 Unauthorised review rejected', () => {
  assert.throws(
    () => RTPL.review(pendingAppeal(protectedDecision()), {
      authorised: false,
      outcome: 'REVERSE',
      reason: 'Adequate written reason',
      at: 50
    }),
    /Reviewer authority is required\./
  );
});

test('T30 Empty review reason rejected', () => {
  assert.throws(
    () => RTPL.review(pendingAppeal(protectedDecision()), {
      authorised: true,
      outcome: 'REVERSE',
      reason: '',
      at: 50
    }),
    /Record a meaningful reason of at least 12 characters\./
  );
});

test('T31 Reversal restores protection', () => {
  const result = RTPL.review(pendingAppeal(supportedDecision()), {
    authorised: true,
    outcome: 'REVERSE',
    reason: 'Evidence did not establish reliable responsibility.',
    at: 50
  });
  assert.equal(result.protected, true);
  assert.equal(result.appeal.status, 'REVERSE');
  assertEffects(result, 'PROTECTED');
});

test('T32 Cannot uphold unsupported adverse effects', () => {
  assert.throws(
    () => RTPL.review(pendingAppeal(protectedDecision()), {
      authorised: true,
      outcome: 'UPHOLD',
      reason: 'Reason cannot replace missing evidence.',
      at: 50
    }),
    /Cannot uphold an adverse effect without reliable initial causal evidence\./
  );
});

test('T33 Overdue reasoned decision remains visible', () => {
  const reason = 'Record found inconsistent during review.';
  const result = RTPL.review(pendingAppeal(protectedDecision()), {
    authorised: true,
    outcome: 'REVERSE',
    reason,
    at: 1500
  });
  assert.equal(result.appeal.overdue, true);
  assert.equal(result.appeal.reason, reason);
});

test('T34 Audit omits raw evidence identity and review free text', () => {
  const result = RTPL.audit({id: 'A101', deadline: 34}, supportedDecision());
  assert.deepEqual(Object.keys(result), [
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
  const serialized = JSON.stringify(result).toLowerCase();
  for (const forbidden of ['identity', 'name', 'gps', 'evidence', 'source', 'reason']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('T35 Budget breakdown reproduces the 34 minute floor', () => {
  const result = RTPL.budgetParts(BASE);
  assert.deepEqual(
    [result.travel, result.signals, result.wait, result.access, result.handover, result.total],
    [12, 4, 10, 6, 2, 34]
  );
});

test('T36 Branch explains an already compensated delay as unestablished rider cause', () => {
  const result = RTPL.assess({
    deadline: 44,
    completed: 49,
    events: [outsideEvent()],
    covered: [[34, 44]]
  });
  assert.equal(result.branch, 'RIDER_CAUSE_NOT_ESTABLISHED');
  assert.equal(result.policy, 'P04');
});

test('T37 Branch explains an incomplete cause record', () => {
  const result = RTPL.assess({deadline: 34, completed: 44, causalComplete: false});
  assert.equal(result.branch, 'CAUSE_RECORD_INCOMPLETE');
});

test('T38 Branch explains reliable rider cause and keeps eligibility', () => {
  const result = supportedDecision();
  assert.equal(result.branch, 'RIDER_CAUSE_SUPPORTED');
  assert.equal(result.eligible, true);
});

test('T39 Branch explains the safe alternative', () => {
  const result = RTPL.assess({
    deadline: 34,
    completed: 44,
    riderEvidence: riderEvidence(),
    safeRoute: true
  });
  assert.equal(result.branch, 'SAFE_ALTERNATIVE');
});

test('T40 Branch explains lateness fully covered by merged outside delays', () => {
  const result = RTPL.assess({
    deadline: 34,
    completed: 44,
    events: [
      outsideEvent({id: 'E1', end: 41}),
      outsideEvent({id: 'E2', start: 38})
    ]
  });
  assert.equal(result.branch, 'COVERED_BY_OUTSIDE_DELAY');
  assert.equal(result.residual, 0);
});

test('T41 Branch explains an on-time delivery', () => {
  const result = RTPL.assess({deadline: 34, completed: 30});
  assert.equal(result.branch, 'ON_TIME');
});

test('T42 Overlap merge is tested without the lateness cap', () => {
  const intervals = [[34, 41], [38, 44]];
  const result = RTPL.assess({
    deadline: 34,
    completed: 54,
    events: [
      outsideEvent({id: 'E1', end: 41}),
      outsideEvent({id: 'E2', start: 38})
    ]
  });
  assert.equal(result.late, 20);
  assert.equal(result.credit, 10);
  assert.equal(result.residual, 10);
  assert.equal(RTPL.length(intervals), 10);
});
