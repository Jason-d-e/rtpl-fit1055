/* Adapter that derives every Guided Demo frame from the unchanged RTPL core. */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./scenario.js') : root.RTPLGuidedScenario
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RTPLGuidedAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Scenario) {
  'use strict';

  if (!Scenario) throw Error('RTPLGuidedScenario must load before RTPLGuidedAdapter.');

  const REQUIRED_CORE_METHODS = Object.freeze([
    'budgetParts', 'initial', 'union', 'assess', 'appeal', 'review', 'audit'
  ]);

  function assertCore(core) {
    if (!core || REQUIRED_CORE_METHODS.some(name => typeof core[name] !== 'function')) {
      throw Error('A compatible RTPL core is required.');
    }
    if (!Array.isArray(core.EFFECTS) || core.EFFECTS.length !== 4) {
      throw Error('The RTPL core must expose its four separate effects.');
    }
    return core;
  }

  function effects(core, value) {
    return Object.fromEntries(core.EFFECTS.map(name => [name, value]));
  }

  function copyIntervals(intervals) {
    return intervals.map(interval => [...interval]);
  }

  function deriveScenario(core) {
    assertCore(core);
    const source = Scenario.SCENARIO;
    const routeInput = {...source.routeInput};
    const outsideDelay = {...source.outsideDelay};
    const riderEvidence = {...source.riderEvidence};

    const budgetParts = core.budgetParts(routeInput);
    const initial = core.initial(
      routeInput,
      source.ai.proposedDeadlineMinute,
      0
    );
    if (initial.status !== 'READY') throw Error('The fixed Guided Demo route unexpectedly failed its safety check.');

    // The core validates and credits the verified 12:34-12:44 road-closure interval.
    // That credited interval becomes both the extension and the covered record.
    const extensionAssessment = core.assess({
      deadline: initial.deadline,
      completed: outsideDelay.end,
      events: [outsideDelay]
    });
    const coveredIntervals = copyIntervals(extensionAssessment.creditIntervals);
    const effectiveDeadline = initial.deadline + extensionAssessment.credit;

    // The same interval is supplied as already covered, so it cannot be credited twice.
    const assessment = core.assess({
      deadline: effectiveDeadline,
      completed: source.completedMinute,
      events: [outsideDelay],
      covered: coveredIntervals,
      riderEvidence
    });
    // P05 is a separate route-choice safeguard: the verified safe detour is
    // protected even though later, unrelated residual evidence can be assessed.
    const safeRouteDecision = core.assess({
      deadline: effectiveDeadline,
      completed: source.completedMinute,
      events: [outsideDelay],
      covered: coveredIntervals,
      safeRoute: true
    });
    const pendingAppeal = core.appeal(
      assessment,
      source.appealMinute,
      source.completedMinute
    );
    const reviewed = core.review(pendingAppeal, {...source.review});
    const audit = core.audit({id: source.id, deadline: effectiveDeadline}, reviewed);

    return Scenario.deepFreeze({
      budgetParts,
      initial,
      extensionAssessment,
      coveredIntervals,
      effectiveDeadline,
      assessment,
      safeRouteDecision,
      pendingAppeal,
      reviewed,
      audit
    });
  }

  const ORDER_STATUS = Object.freeze([
    'ORDER_PLACED',
    'AI_BASELINE_PROPOSED',
    'RTPL_DEADLINE_PROTECTED',
    'RIDER_ACCEPTED',
    'VERIFIED_DELAY_COVERED',
    'EN_ROUTE',
    'DELIVERED_ASSESSED',
    'APPEAL_PENDING',
    'HUMAN_REVIEWED',
    'AUDIT_READY'
  ]);

  const RIDER_STATUS = Object.freeze([
    'Waiting for assignment',
    'Waiting for protected deadline',
    'Offer ready',
    'Order accepted',
    'Road closure verified',
    'On the way',
    'Delivered; assessment eligible',
    'Appeal pending; effects suspended',
    'Review reversed; rider protected',
    'Case closed; rider protected'
  ]);

  const CUSTOMER_STATUS = Object.freeze([
    'Order placed',
    'Restaurant is confirming the order',
    'Protected deadline confirmed',
    'Rider accepted the order',
    'Route disruption verified; deadline updated',
    'Rider is on the way',
    'Delivered at 12:49',
    'Delivered at 12:49',
    'Delivered at 12:49',
    'Delivered at 12:49'
  ]);

  function deadlineForStep(stepIndex, derivation) {
    if (stepIndex === 0) return {minute: null, source: 'NOT_SET'};
    if (stepIndex === 1) {
      return {minute: Scenario.SCENARIO.ai.proposedDeadlineMinute, source: 'SYNTHETIC_AI_BASELINE'};
    }
    if (stepIndex < Scenario.STEP_INDEX.ROAD_CLOSURE) {
      return {minute: derivation.initial.deadline, source: 'RTPL_FLOOR'};
    }
    return {minute: derivation.effectiveDeadline, source: 'VERIFIED_EXTENSION'};
  }

  function buildSimulationModel(core, requestedStepIndex) {
    assertCore(core);
    const stepIndex = Scenario.clampStep(requestedStepIndex);
    const source = Scenario.SCENARIO;
    const derived = deriveScenario(core);
    const deadline = deadlineForStep(stepIndex, derived);
    const assessed = stepIndex >= Scenario.STEP_INDEX.DELIVERED_ASSESSED;
    const appealed = stepIndex >= Scenario.STEP_INDEX.APPEAL_PENDING;
    const reviewed = stepIndex >= Scenario.STEP_INDEX.HUMAN_REVIEWED;
    const auditReady = stepIndex >= Scenario.STEP_INDEX.AUDIT_READY;
    const activeDecision = reviewed
      ? derived.reviewed
      : appealed
        ? derived.pendingAppeal
        : assessed
          ? derived.assessment
          : null;
    const currentEffects = activeDecision
      ? {...activeDecision.effects}
      : effects(core, 'NOT ASSESSED');

    const timeline = Scenario.STEPS.map(item => ({
      ...item,
      state: item.index < stepIndex ? 'COMPLETED' : item.index === stepIndex ? 'CURRENT' : 'UPCOMING'
    }));
    const step = {...Scenario.STEPS[stepIndex]};

    const model = {
      schemaVersion: 'GUIDED-MODEL-1.0',
      scenario: {
        id: source.id,
        version: source.version,
        synthetic: true,
        notice: 'Teaching simulation only; no real delivery, platform or model connection.'
      },
      stepIndex,
      stepCount: Scenario.STEP_COUNT,
      step,
      clock: {minute: step.atMinute, label: step.clock},
      progress: {
        completedSteps: stepIndex,
        ratio: stepIndex / (Scenario.STEP_COUNT - 1),
        canPrevious: stepIndex > 0,
        canNext: stepIndex < Scenario.STEP_COUNT - 1
      },
      order: {
        id: source.id,
        status: ORDER_STATUS[stepIndex],
        placedAt: source.startClock,
        deadlineMinute: deadline.minute,
        deadlineLabel: deadline.minute === null ? null : Scenario.formatClock(deadline.minute),
        deadlineSource: deadline.source,
        protectedDeadlineMinute: stepIndex >= Scenario.STEP_INDEX.RTPL_CHECKED ? deadline.minute : null,
        extensionMinutes: stepIndex >= Scenario.STEP_INDEX.ROAD_CLOSURE
          ? derived.extensionAssessment.credit
          : 0,
        completedMinute: assessed ? source.completedMinute : null,
        completedAt: assessed ? Scenario.formatClock(source.completedMinute) : null
      },
      route: {
        distance: source.routeInput.distance,
        legalSpeed: source.routeInput.legalSpeed,
        conditionSpeed: source.routeInput.conditionSpeed,
        safeSpeed: derived.budgetParts.speed,
        closureVisible: stepIndex >= Scenario.STEP_INDEX.ROAD_CLOSURE,
        detourActive: stepIndex >= Scenario.STEP_INDEX.ROAD_CLOSURE,
        safeAlternativeProtected: stepIndex >= Scenario.STEP_INDEX.EN_ROUTE
          ? derived.safeRouteDecision.protected
          : null,
        safeAlternativePolicy: stepIndex >= Scenario.STEP_INDEX.EN_ROUTE
          ? derived.safeRouteDecision.policy
          : null
      },
      ai: {
        visible: stepIndex >= Scenario.STEP_INDEX.AI_PROPOSED,
        synthetic: true,
        label: source.ai.label,
        proposedDurationMinutes: source.ai.proposedDurationMinutes,
        proposedDeadlineMinute: source.ai.proposedDeadlineMinute,
        proposedDeadlineLabel: Scenario.formatClock(source.ai.proposedDeadlineMinute)
      },
      rtpl: {
        visible: stepIndex >= Scenario.STEP_INDEX.RTPL_CHECKED,
        status: stepIndex < Scenario.STEP_INDEX.RTPL_CHECKED
          ? 'NOT_RUN'
          : stepIndex < Scenario.STEP_INDEX.ROAD_CLOSURE
            ? 'INITIAL_CHECK_COMPLETE'
            : 'VERIFIED_EXTENSION_APPLIED',
        policy: stepIndex >= Scenario.STEP_INDEX.RTPL_CHECKED ? derived.initial.policy : null,
        floorMinutes: derived.budgetParts.total,
        floorDeadlineMinute: derived.initial.floor,
        floorDeadlineLabel: Scenario.formatClock(derived.initial.floor),
        effectiveDeadlineMinute: stepIndex >= Scenario.STEP_INDEX.RTPL_CHECKED ? deadline.minute : null,
        effectiveDeadlineLabel: stepIndex >= Scenario.STEP_INDEX.RTPL_CHECKED
          ? Scenario.formatClock(deadline.minute)
          : null,
        budgetParts: stepIndex >= Scenario.STEP_INDEX.RTPL_CHECKED ? {...derived.budgetParts} : null,
        inputs: stepIndex >= Scenario.STEP_INDEX.RTPL_CHECKED ? {
          distance: source.routeInput.distance,
          legalSpeed: source.routeInput.legalSpeed,
          conditionSpeed: source.routeInput.conditionSpeed,
          assumption: stepIndex >= Scenario.STEP_INDEX.ROAD_CLOSURE
            ? 'Verified synthetic closure; local detour shown'
            : 'Synthetic dry-road baseline'
        } : null,
        extension: stepIndex >= Scenario.STEP_INDEX.ROAD_CLOSURE ? {
          minutes: derived.extensionAssessment.credit,
          branch: derived.extensionAssessment.branch,
          coveredIntervals: copyIntervals(derived.coveredIntervals)
        } : null
      },
      delay: {
        visible: stepIndex >= Scenario.STEP_INDEX.ROAD_CLOSURE,
        status: stepIndex >= Scenario.STEP_INDEX.ROAD_CLOSURE ? 'VERIFIED_AND_COVERED' : 'NOT_RECORDED',
        event: stepIndex >= Scenario.STEP_INDEX.ROAD_CLOSURE ? {...source.outsideDelay} : null,
        coveredIntervals: stepIndex >= Scenario.STEP_INDEX.ROAD_CLOSURE
          ? copyIntervals(derived.coveredIntervals)
          : []
      },
      rider: {
        status: RIDER_STATUS[stepIndex],
        routeProgress: source.routeProgressByStep[stepIndex],
        evidenceVisible: assessed,
        protected: activeDecision ? activeDecision.protected : null
      },
      customer: {
        status: CUSTOMER_STATUS[stepIndex],
        // The unvalidated AI proposal is visible only in the Control Centre.
        // Customer-facing time is withheld until the RTPL check is complete.
        deadlineMinute: stepIndex >= Scenario.STEP_INDEX.RTPL_CHECKED ? deadline.minute : null,
        deadlineLabel: stepIndex >= Scenario.STEP_INDEX.RTPL_CHECKED
          ? Scenario.formatClock(deadline.minute)
          : null
      },
      assessment: assessed ? {
        eligible: derived.assessment.eligible,
        protected: derived.assessment.protected,
        policy: derived.assessment.policy,
        branch: derived.assessment.branch,
        late: derived.assessment.late,
        credit: derived.assessment.credit,
        residual: derived.assessment.residual,
        verifiedEventCount: derived.assessment.verifiedEventCount
      } : null,
      appeal: !assessed ? {
        visible: false,
        status: 'NOT_AVAILABLE'
      } : {
        visible: true,
        status: activeDecision.appeal.status,
        submittedMinute: appealed ? derived.pendingAppeal.appeal.submitted : null,
        submittedAt: appealed ? Scenario.formatClock(derived.pendingAppeal.appeal.submitted) : null,
        reviewDueMinute: appealed ? derived.pendingAppeal.appeal.reviewDue : null
      },
      review: reviewed ? {
        authorised: source.review.authorised,
        outcome: derived.reviewed.appeal.status,
        reviewedMinute: derived.reviewed.appeal.reviewed,
        reviewedAt: Scenario.formatClock(derived.reviewed.appeal.reviewed),
        overdue: derived.reviewed.appeal.overdue,
        reason: derived.reviewed.appeal.reason
      } : null,
      effects: currentEffects,
      audit: auditReady ? {...derived.audit, effects: {...derived.audit.effects}} : null,
      timeline
    };

    return Scenario.deepFreeze(model);
  }

  function runSandbox(core, inputs) {
    assertCore(core);
    const values = inputs || {};
    const routeInput = {
      ...Scenario.SCENARIO.routeInput,
      ...(values.routeInput || values.route || {})
    };
    const now = values.now === undefined ? 0 : values.now;
    const proposedDeadline = values.proposedDeadline === undefined
      ? Scenario.SCENARIO.ai.proposedDeadlineMinute
      : values.proposedDeadline;
    const initial = core.initial(routeInput, proposedDeadline, now);
    const budgetParts = routeInput.fresh ? core.budgetParts(routeInput) : null;

    if (initial.status !== 'READY') {
      return Scenario.deepFreeze({
        status: 'HOLD',
        initial,
        budgetParts,
        effectiveDeadline: null,
        coveredIntervals: [],
        extensionAssessment: null,
        assessment: null,
        appeal: null,
        review: null,
        audit: null
      });
    }

    const extensionEvents = (values.extensionEvents || []).map(event => ({...event}));
    const existingCovered = copyIntervals(values.coveredIntervals || values.covered || []);
    let extensionAssessment = null;
    let effectiveDeadline = values.effectiveDeadline === undefined
      ? initial.deadline
      : values.effectiveDeadline;
    let coveredIntervals = copyIntervals(existingCovered);

    if (extensionEvents.length > 0) {
      const extensionEnd = values.extensionEnd === undefined
        ? Math.max(...extensionEvents.map(event => event.end))
        : values.extensionEnd;
      extensionAssessment = core.assess({
        deadline: effectiveDeadline,
        completed: extensionEnd,
        events: extensionEvents,
        covered: existingCovered
      });
      effectiveDeadline += extensionAssessment.credit;
      coveredIntervals = core.union([...existingCovered, ...extensionAssessment.creditIntervals]);
    }

    const completedMinute = values.completedMinute === undefined ? values.completed : values.completedMinute;
    const assessmentEvents = (values.events || extensionEvents).map(event => ({...event}));
    let assessment = null;
    let appealed = null;
    let reviewed = null;
    let audit = null;

    if (completedMinute !== undefined) {
      assessment = core.assess({
        deadline: effectiveDeadline,
        completed: completedMinute,
        events: assessmentEvents,
        covered: coveredIntervals,
        riderEvidence: values.riderEvidence || null,
        safeRoute: values.safeRoute === true,
        causalComplete: values.causalComplete !== false
      });
    }
    if (assessment && values.appealMinute !== undefined) {
      appealed = core.appeal(assessment, values.appealMinute, completedMinute);
    }
    if (appealed && values.review) reviewed = core.review(appealed, {...values.review});

    const finalDecision = reviewed || appealed || assessment;
    if (finalDecision && values.includeAudit !== false) {
      audit = core.audit({id: values.orderId || 'SANDBOX', deadline: effectiveDeadline}, finalDecision);
    }

    return Scenario.deepFreeze({
      status: 'READY',
      initial,
      budgetParts,
      effectiveDeadline,
      coveredIntervals: copyIntervals(coveredIntervals),
      extensionAssessment,
      assessment,
      appeal: appealed,
      review: reviewed,
      audit
    });
  }

  return {
    REQUIRED_CORE_METHODS,
    deriveScenario,
    buildSimulationModel,
    runSandbox
  };
});
