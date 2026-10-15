/* Deterministic, synthetic Guided Demo scenario for the RTPL teaching prototype. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RTPLGuidedScenario = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const START_CLOCK_MINUTES = 12 * 60;
  const ALLOWED_SPEEDS = Object.freeze([1, 2, 4]);

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }

  function formatClock(relativeMinute) {
    if (!Number.isFinite(relativeMinute) || relativeMinute < 0) {
      throw Error('A non-negative finite simulation minute is required.');
    }
    const total = START_CLOCK_MINUTES + Math.floor(relativeMinute);
    const hours = Math.floor(total / 60) % 24;
    const minutes = total % 60;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
  }

  const STEP_IDS = Object.freeze([
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

  const rawSteps = [
    ['ORDER_PLACED', 0, 'Order placed', '订单已创建', 'customer'],
    ['AI_PROPOSED', 0, 'AI proposal', 'AI 给出模拟时限', 'ai'],
    ['RTPL_CHECKED', 0, 'RTPL check', 'RTPL 安全检查', 'rtpl'],
    ['RIDER_ACCEPTED', 2, 'Rider accepted', '骑手接单', 'rider'],
    ['ROAD_CLOSURE', 44, 'Closure verified', '道路封闭已核验', 'rtpl'],
    ['EN_ROUTE', 44, 'En route', '订单配送中', 'rider'],
    ['DELIVERED_ASSESSED', 49, 'Delivered', '送达并完成原因判断', 'rtpl'],
    ['APPEAL_PENDING', 50, 'Appeal pending', '申诉处理中', 'rider'],
    ['HUMAN_REVIEWED', 60, 'Human review', '人工复核完成', 'reviewer'],
    ['AUDIT_READY', 60, 'Audit ready', '最小化审计记录就绪', 'oversight']
  ];

  const STEPS = deepFreeze(rawSteps.map((row, index) => ({
    index,
    id: row[0],
    atMinute: row[1],
    clock: formatClock(row[1]),
    title: row[2],
    titleZh: row[3],
    actor: row[4]
  })));

  const STEP_INDEX = deepFreeze(Object.fromEntries(STEP_IDS.map((id, index) => [id, index])));

  const SCENARIO = deepFreeze({
    id: 'A101',
    version: 'GUIDED-A101-1.0',
    synthetic: true,
    startClock: '12:00',
    restaurant: 'Synthetic Noodle Kitchen',
    destination: 'Synthetic Customer Zone',
    ai: {
      proposedDurationMinutes: 24,
      proposedDeadlineMinute: 24,
      label: 'Synthetic/modelled baseline'
    },
    routeInput: {
      distance: 4,
      legalSpeed: 20,
      conditionSpeed: 20,
      signals: 4,
      wait: 10,
      access: 6,
      handover: 2,
      fresh: true
    },
    outsideDelay: {
      id: 'A101-CLOSURE-34-44',
      kind: 'ROAD_CLOSURE',
      start: 34,
      end: 44,
      verified: true,
      reliable: true,
      source: 'Synthetic road-status record'
    },
    riderEvidence: {
      start: 44,
      end: 49,
      verified: true,
      reliable: true,
      source: 'Synthetic rider-cause record'
    },
    completedMinute: 49,
    appealMinute: 50,
    review: {
      at: 60,
      authorised: true,
      outcome: 'REVERSE',
      reason: 'Review found the adverse rider inference insufficiently fair.'
    },
    routeProgressByStep: [0, 0, 0, 0.05, 0.58, 0.78, 1, 1, 1, 1]
  });

  function clampStep(stepIndex) {
    const numeric = Number(stepIndex);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(STEPS.length - 1, Math.trunc(numeric)));
  }

  return {
    START_CLOCK_MINUTES,
    ALLOWED_SPEEDS,
    STEP_IDS,
    STEP_INDEX,
    STEPS,
    STEP_COUNT: STEPS.length,
    SCENARIO,
    formatClock,
    clampStep,
    deepFreeze
  };
});
