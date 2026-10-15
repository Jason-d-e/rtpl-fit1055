/* DOM renderer for the deterministic Guided Demo. No policy logic lives here. */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./scenario.js') : root.RTPLGuidedScenario
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RTPLGuidedView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Scenario) {
  'use strict';

  if (!Scenario) throw Error('RTPLGuidedScenario must load before RTPLGuidedView.');

  const COPY = Object.freeze([
    {
      title: 'A customer places synthetic order A101',
      summary: 'One deterministic order now feeds the Rider App, Customer App, local route and Control Centre from a shared state.',
      map: 'Order created. No live GPS, routing API, customer account or personal data is used.'
    },
    {
      title: 'A synthetic AI proposes 12:24',
      summary: 'This modelled baseline is visible to the Control Centre only. It is not yet safe to publish to the rider or customer.',
      map: 'The route remains at the restaurant while RTPL validates the inputs.'
    },
    {
      title: 'RTPL raises the deadline to 12:34',
      summary: 'P02 calculates a 34-minute floor: 12 travel + 4 signals + 10 wait + 6 access + 2 handover.',
      map: 'The protected 12:34 deadline is now shared consistently with the rider and customer.'
    },
    {
      title: 'The rider accepts the protected offer',
      summary: 'Acceptance uses the RTPL deadline—not the shorter AI proposal—and the accepted deadline can never move earlier.',
      map: 'The rider is assigned at the restaurant with the 12:34 protected deadline.'
    },
    {
      title: 'A verified road closure adds 10 minutes',
      summary: 'P03 credits the reliable 12:34–12:44 road-closure interval once. The shared deadline moves later to 12:44 and is recorded as covered.',
      map: 'The verified closure is covered once; the rider is not asked to recover the lost time.'
    },
    {
      title: 'P05 protects a verified safe detour',
      summary: 'The local route visibly avoids the closure. Playback speed changes the presentation only; it never asks the rider to move faster.',
      map: 'The rider is 78% along a synthetic four-kilometre safe detour. This diagram is not navigation advice.'
    },
    {
      title: 'Delivery completes at 12:49 and is assessed',
      summary: 'Five residual minutes remain after the covered road closure. Reliable causal evidence makes assessment eligible; no penalty is automatically applied.',
      map: 'Delivery is complete. The route, delay coverage and causal period remain separated in the policy record.'
    },
    {
      title: 'The rider appeals; all four effects pause',
      summary: 'P06 immediately suspends service score, customer rating, bonus and future allocation while the dispute is pending.',
      map: 'Delivery status stays complete. The workplace appeal is deliberately hidden from the Customer App.'
    },
    {
      title: 'An authorised reviewer reverses the decision',
      summary: 'At 13:00, human review finds the adverse inference insufficiently fair. Every effect becomes protected.',
      map: 'The delivery remains complete and the rider is protected after authorised human review.'
    },
    {
      title: 'A privacy-minimised audit is ready',
      summary: 'P07 retains configuration, deadline arithmetic, rule outcome and effect status—without identity, raw GPS, messages or evidence text.',
      map: 'The deterministic lifecycle is complete and can be restarted in one action.'
    }
  ]);

  const RIDER_MESSAGES = Object.freeze([
    'The original AI estimate is withheld until RTPL finishes its safety check.',
    'The 12:24 AI proposal is still withheld; it has not passed RTPL.',
    'RTPL added the full safety budget and published 12:34.',
    'You accepted 12:34. Later checks may extend this time but cannot shorten it.',
    'A verified road closure was credited once. Your deadline is now 12:44.',
    'P05 protects this verified safe detour. Faster playback never asks you to ride faster.',
    'Five residual minutes are assessment eligible. No effect is automatically applied.',
    'Your appeal is pending. All four possible effects are suspended.',
    'Authorised review reversed the decision. All four effects are protected.',
    'Case closed with protected effects and a minimised audit record.'
  ]);

  const ETHICAL_COPY = Object.freeze([
    'Unvalidated automation must not set a worker-facing deadline.',
    'Transparency separates a model proposal from a validated operational decision.',
    'A realistic deadline may increase customer waiting, but safety takes priority over speed pressure.',
    'A worker can rely on an accepted deadline because the system will not silently shorten it.',
    'External delay is credited once: fair to the rider without double-counting system cost.',
    'A safe route is preferable even when a riskier shortcut looks faster.',
    'Reliable evidence can justify review, but eligibility is not an automatic punishment.',
    'Suspension protects procedural fairness while creating a manageable human-review cost.',
    'Human authority and reasons constrain automation; reversal restores every linked effect.',
    'Data minimisation supports accountability without retaining unnecessary personal evidence.'
  ]);

  const RULE_BY_STEP = Object.freeze(['P01', 'P01', 'P02', 'P02', 'P03', 'P05', 'P04', 'P06', 'P06', 'P07']);
  const RULE_LABELS = Object.freeze({
    P01: 'FRESHNESS GATE',
    P02: 'DEADLINE FLOOR',
    P03: 'VERIFIED DELAY CREDIT',
    P04: 'CAUSAL EVIDENCE',
    P05: 'SAFE ALTERNATIVE',
    P06: 'APPEAL SAFEGUARD',
    P07: 'MINIMISED AUDIT'
  });

  function requireElement(doc, id) {
    const node = doc.getElementById(id);
    if (!node) throw Error('Guided Demo is missing required element #' + id + '.');
    return node;
  }

  function setText(node, value) {
    if (node) node.textContent = value === null || value === undefined ? '—' : String(value);
  }

  function minuteValue(value) {
    if (!Number.isFinite(value)) return '—';
    return (Math.round(value * 10) / 10) + ' min';
  }

  function effectSummary(effects) {
    const values = Object.values(effects || {});
    if (!values.length) return 'None active';
    const unique = [...new Set(values)];
    return unique.length === 1 ? unique[0] : unique.join(' / ');
  }

  function createView(doc) {
    if (!doc || typeof doc.getElementById !== 'function') throw Error('A document is required.');

    const elements = {
      status: requireElement(doc, 'app-status'),
      title: requireElement(doc, 'step-title'),
      summary: requireElement(doc, 'step-summary'),
      clock: requireElement(doc, 'sim-time'),
      previous: requireElement(doc, 'btn-prev'),
      play: requireElement(doc, 'btn-play'),
      next: requireElement(doc, 'btn-next'),
      reset: requireElement(doc, 'btn-reset'),
      speeds: requireElement(doc, 'speed-controls'),
      timeline: requireElement(doc, 'timeline'),
      rider: requireElement(doc, 'rider-screen'),
      customer: requireElement(doc, 'customer-screen'),
      control: requireElement(doc, 'control-screen'),
      mapStatus: requireElement(doc, 'map-status'),
      route: requireElement(doc, 'route-path'),
      routeShadow: requireElement(doc, 'route-shadow'),
      detour: requireElement(doc, 'detour-path'),
      detourShadow: requireElement(doc, 'detour-shadow'),
      marker: requireElement(doc, 'rider-marker'),
      delayZone: requireElement(doc, 'delay-zone'),
      ruleTrace: requireElement(doc, 'rule-trace'),
      ethics: requireElement(doc, 'ethics-panel'),
      audit: requireElement(doc, 'audit-panel'),
      exportAudit: requireElement(doc, 'btn-export-audit'),
      riderAction: requireElement(doc, 'rider-action'),
      reviewWorkflow: requireElement(doc, 'review-workflow'),
      reviewAction: requireElement(doc, 'review-action'),
      sandboxResult: requireElement(doc, 'sandbox-result'),
      live: requireElement(doc, 'live-region')
    };

    const bindings = Object.create(null);
    for (const node of doc.querySelectorAll('[data-bind]')) bindings[node.dataset.bind] = node;
    let lastAnnouncedStep = -1;

    function bind(name, value) { setText(bindings[name], value); }

    function renderTimeline(model) {
      for (const item of model.timeline) {
        const row = elements.timeline.querySelector('[data-step="' + item.index + '"]');
        if (!row) continue;
        row.classList.toggle('is-current', item.state === 'CURRENT');
        row.classList.toggle('is-complete', item.state === 'COMPLETED');
        const button = row.querySelector('button');
        const label = button && button.querySelector('strong');
        const clock = button && button.querySelector('small');
        if (button) {
          if (item.state === 'CURRENT') button.setAttribute('aria-current', 'step');
          else button.removeAttribute('aria-current');
          button.setAttribute('aria-label', 'Go to step ' + (item.index + 1) + ': ' + item.title + ', ' + item.clock);
        }
        setText(label, item.title);
        setText(clock, item.clock);
      }
    }

    function renderPlayback(model, playback) {
      elements.previous.disabled = !model.progress.canPrevious;
      elements.next.disabled = !model.progress.canNext;
      elements.play.disabled = !model.progress.canNext;
      elements.play.setAttribute('aria-pressed', String(playback.playing));
      const icon = elements.play.querySelector('.play-icon');
      const label = elements.play.querySelector('span:last-child');
      setText(icon, playback.playing ? 'Ⅱ' : '▶');
      setText(label, playback.playing ? 'Pause' : (model.progress.canNext ? 'Play' : 'Complete'));
      for (const button of elements.speeds.querySelectorAll('[data-speed]')) {
        const active = Number(button.dataset.speed) === playback.speed;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      setText(
        elements.status,
        (playback.playing ? 'Playing at ' + playback.speed + '×' : 'Paused') +
          ' · Step ' + (model.stepIndex + 1) + ' of ' + model.stepCount
      );
    }

    function renderMap(model, playback) {
      const progress = model.rider.routeProgress;
      const useDetour = model.route.detourActive;
      const activeRoute = useDetour ? elements.detour : elements.route;
      let x = 112;
      let y = 350;
      try {
        const length = activeRoute.getTotalLength();
        const point = activeRoute.getPointAtLength(length * progress);
        x = point.x;
        y = point.y;
      } catch (_) {
        x = 112 + (666 - 112) * progress;
        y = 350 + (100 - 350) * progress;
      }
      elements.marker.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')');
      elements.marker.dataset.progress = String(progress);
      elements.marker.style.transitionDuration = Math.max(0.18, 0.75 / playback.speed) + 's';
      elements.route.classList.toggle('is-blocked', useDetour);
      elements.routeShadow.classList.toggle('is-blocked', useDetour);
      elements.detour.classList.toggle('is-active', useDetour);
      elements.detourShadow.classList.toggle('is-active', useDetour);
      activeRoute.style.strokeDasharray = '100';
      activeRoute.style.strokeDashoffset = String(Math.max(0, 100 - progress * 100));
      elements.delayZone.classList.toggle('is-active', model.delay.visible);
      elements.delayZone.setAttribute('aria-hidden', String(!model.delay.visible));
      bind('map-status-title', model.step.title + ' · ' + model.clock.label);
      bind('map-status-detail', COPY[model.stepIndex].map);
      const description = doc.getElementById('map-description');
      setText(description, COPY[model.stepIndex].map + ' Route progress: ' + Math.round(progress * 100) + ' percent.');
    }

    function renderRider(model) {
      bind('rider-status', model.rider.status);
      bind('rider-deadline', model.stepIndex >= Scenario.STEP_INDEX.RTPL_CHECKED ? model.order.deadlineLabel : '—');
      bind(
        'rider-countdown',
        model.stepIndex < Scenario.STEP_INDEX.RTPL_CHECKED
          ? 'RTPL check pending'
          : model.order.extensionMinutes > 0
            ? '+' + model.order.extensionMinutes + ' min verified extension'
            : 'Protected by RTPL · never shortened'
      );
      bind('rider-route', model.route.detourActive ? '4 km · verified safe detour' : '4 km · deterministic route');
      bind('rider-message', RIDER_MESSAGES[model.stepIndex]);
      const notice = bindings['rider-message'];
      if (notice) {
        notice.classList.toggle('is-warning', model.stepIndex === 6 || model.stepIndex === 7);
        notice.classList.toggle('is-protected', model.stepIndex >= 8 || model.stepIndex === 4);
      }
      const impact = bindings['rider-impact'];
      if (impact) {
        const icon = impact.querySelector('span:first-child');
        const text = impact.querySelector('span:last-child');
        const summary = model.stepIndex === 6
          ? 'Assessment eligible · no automatic effect'
          : model.stepIndex === 7
            ? 'All four effects suspended'
            : model.stepIndex >= 8
              ? 'All four effects protected'
              : 'No rider effect is active';
        setText(icon, model.stepIndex === 7 ? 'Ⅱ' : '✓');
        setText(text || impact, summary);
      }
      const actions = {
        2: 'Accept protected offer',
        3: 'Begin delivery',
        4: 'Use protected detour',
        5: 'Complete delivery',
        6: 'Appeal assessment'
      };
      const actionLabel = actions[model.stepIndex];
      elements.riderAction.hidden = !actionLabel;
      elements.riderAction.disabled = !actionLabel;
      setText(elements.riderAction, actionLabel || 'Continue');
      elements.rider.dataset.status = model.rider.status;
    }

    function renderCustomer(customer, stepIndex) {
      // This renderer intentionally receives only the customer-safe projection.
      bind('customer-status', customer.status);
      bind('customer-deadline', customer.deadlineLabel || 'Checking…');
      bind('customer-rider', stepIndex >= Scenario.STEP_INDEX.RIDER_ACCEPTED ? 'Rider assigned' : 'Assigning…');
      let detail = 'We will show an arrival time after RTPL validates the safety inputs.';
      let change = 'The original AI proposal is not published here.';
      if (customer.deadlineLabel === '12:34') {
        detail = 'Your rider has a safety-checked arrival time.';
        change = 'The same protected deadline is shared with the rider.';
      } else if (customer.deadlineLabel === '12:44') {
        detail = customer.status.startsWith('Delivered')
          ? 'Your delivery was completed at 12:49.'
          : 'A verified operational delay updated your arrival time.';
        change = customer.status.startsWith('Delivered')
          ? 'Delivery complete · workplace records remain private.'
          : 'The updated time is shared consistently with the rider.';
      }
      bind('customer-detail', detail);
      bind('customer-change', change);
      elements.customer.dataset.status = customer.status;
    }

    function renderBudget(model) {
      const parts = model.rtpl.budgetParts;
      bind('budget-total', parts ? parts.total + ' min' : '— min');
      bind('budget-travel', parts ? minuteValue(parts.travel) : '—');
      bind('budget-signals', parts ? minuteValue(parts.signals) : '—');
      bind('budget-wait', parts ? minuteValue(parts.wait) : '—');
      bind('budget-access', parts ? minuteValue(parts.access) : '—');
      bind('budget-handover', parts ? minuteValue(parts.handover) : '—');
      bind('budget-distance', model.rtpl.inputs ? model.rtpl.inputs.distance + ' km' : '—');
      bind(
        'budget-speeds',
        model.rtpl.inputs
          ? model.rtpl.inputs.legalSpeed + ' / ' + model.rtpl.inputs.conditionSpeed + ' km/h'
          : '—'
      );
      bind('budget-assumption', model.rtpl.inputs ? model.rtpl.inputs.assumption : '—');
    }

    function renderControl(model) {
      bind('ai-deadline', model.ai.visible ? model.ai.proposedDeadlineLabel : 'Not proposed');
      bind(
        'ai-explanation',
        model.ai.visible
          ? 'A demonstration-only estimate: 24 minutes after 12:00. It is not a dispatch prediction and is not safe to publish by itself.'
          : 'The synthetic estimator has not produced a proposal yet.'
      );
      bind('rtpl-deadline', model.rtpl.visible ? model.rtpl.effectiveDeadlineLabel : 'Pending');
      bind(
        'rtpl-outcome-label',
        model.rtpl.status === 'VERIFIED_EXTENSION_APPLIED'
          ? 'verified extension applied'
          : model.rtpl.visible ? 'safety floor passed' : 'waiting for inputs'
      );
      bind(
        'rtpl-explanation',
        model.rtpl.status === 'VERIFIED_EXTENSION_APPLIED'
          ? 'P03 credited the verified ten-minute road-closure interval once; the 12:34 deadline became 12:44.'
          : model.rtpl.visible
            ? 'P02 used the safer speed and the full service budget. max(12:24, 12:34) = 12:34.'
            : 'RTPL will execute the shared rule code before either app receives a deadline.'
      );
      const activeRule = RULE_BY_STEP[model.stepIndex];
      bind('rtpl-rule-label', activeRule + ' · ' + RULE_LABELS[activeRule]);
      renderBudget(model);
      elements.control.dataset.policy = activeRule;
    }

    function renderRules(model) {
      const activeRule = RULE_BY_STEP[model.stepIndex];
      const applied = new Set();
      if (model.stepIndex >= 2) applied.add('P01');
      if (model.stepIndex >= 3) applied.add('P02');
      if (model.stepIndex >= 5) applied.add('P03');
      if (model.stepIndex >= 7) applied.add('P04');
      if (model.stepIndex >= 6) applied.add('P05');
      if (model.stepIndex >= 9) applied.add('P06');
      for (const row of elements.ruleTrace.querySelectorAll('[data-rule]')) {
        const code = row.dataset.rule;
        row.classList.toggle('is-active', code === activeRule);
        row.classList.toggle('is-complete', applied.has(code));
        const state = row.querySelector('i');
        setText(state, code === activeRule ? 'ACTIVE' : applied.has(code) ? 'DONE' : code === 'P05' ? 'AVAILABLE' : 'QUEUED');
      }
      const pseudo = elements.ruleTrace.querySelector('pre code');
      const snippets = {
        P01: 'IF inputs are missing or stale:\n    HOLD the deadline\n    publish no partial or guessed result',
        P02: 'safe_time = travel + signals + wait + access + handover\nprotected = MAX(AI_deadline, now + safe_time)\naccepted deadlines NEVER move earlier',
        P03: 'verified = UNION(reliable outside-delay intervals)\ncredit = verified MINUS already_covered\ncredit cannot exceed lateness',
        P04: 'IF residual cause is incomplete or unreliable:\n    PROTECT rider automatically\nELSE mark assessment eligible and offer appeal',
        P05: 'IF route is verified safe AND legal:\n    PROTECT use of the alternative route\nNever reward an unsafe shortcut',
        P06: 'ON appeal: SUSPEND all linked effects\nOnly an authorised human may UPHOLD or REVERSE\nRecord a meaningful reason',
        P07: 'audit = configuration + deadline arithmetic + outcome\nEXCLUDE identity + raw GPS + messages + evidence text'
      };
      setText(pseudo, snippets[activeRule]);
    }

    function renderEthics(model) {
      bind('ethical-tradeoff', ETHICAL_COPY[model.stepIndex]);
      elements.ethics.dataset.step = model.step.id;
    }

    function renderAudit(model) {
      const audit = model.audit;
      elements.exportAudit.disabled = !audit;
      elements.exportAudit.setAttribute('aria-disabled', String(!audit));
      elements.exportAudit.title = audit ? 'Download the minimised synthetic JSON record' : 'Available at Step 10';
      bind('audit-order', audit ? audit.case : model.order.id);
      bind('audit-stage', audit ? 'Audit ready' : 'Available at Step 10');
      bind('audit-rule', audit ? audit.policy : RULE_BY_STEP[model.stepIndex]);
      bind('audit-outcome', audit ? (audit.protected ? 'Protected' : 'Assessment eligible') : 'Not exported');
      bind('audit-effects', audit ? effectSummary(audit.effects) : effectSummary(model.effects));
      elements.audit.dataset.ready = String(Boolean(audit));

      const reviewVisible = model.stepIndex >= Scenario.STEP_INDEX.APPEAL_PENDING;
      const reviewPending = model.stepIndex === Scenario.STEP_INDEX.APPEAL_PENDING;
      elements.reviewWorkflow.hidden = !reviewVisible;
      elements.reviewAction.hidden = !reviewPending;
      elements.reviewAction.disabled = !reviewPending;
      if (reviewPending) {
        bind('review-status', 'Pending · four effects suspended');
        bind('review-detail', 'Authority is verified. Examine the synthetic cause record, then record a reasoned decision.');
      } else if (reviewVisible) {
        bind('review-status', 'REVERSE · four effects protected');
        bind('review-detail', model.review ? model.review.reason : 'Authorised review completed with a recorded reason.');
      }
    }

    function render(model, playback) {
      if (!model || !playback) throw Error('Model and playback state are required.');
      const copy = COPY[model.stepIndex];
      setText(elements.title, copy.title);
      setText(elements.summary, copy.summary);
      elements.clock.replaceChildren();
      const time = doc.createElement('time');
      time.dateTime = model.clock.label;
      time.textContent = model.clock.label;
      elements.clock.appendChild(time);
      for (const phoneTime of doc.querySelectorAll('.phone-top span:first-child')) setText(phoneTime, model.clock.label);
      renderTimeline(model);
      renderPlayback(model, playback);
      renderMap(model, playback);
      renderRider(model);
      renderCustomer(model.customer, model.stepIndex);
      renderControl(model);
      renderRules(model);
      renderEthics(model);
      renderAudit(model);
      doc.body.dataset.step = String(model.stepIndex);
      doc.body.dataset.stepId = model.step.id;
      if (lastAnnouncedStep !== model.stepIndex) {
        setText(elements.live, 'Step ' + (model.stepIndex + 1) + ' of ' + model.stepCount + '. ' + copy.title + '. ' + copy.summary);
        lastAnnouncedStep = model.stepIndex;
      }
    }

    function renderSandbox(result) {
      const strong = elements.sandboxResult.querySelector('strong');
      const detail = elements.sandboxResult.querySelector('p');
      elements.sandboxResult.classList.remove('is-error', 'is-success');
      if (result.error) {
        elements.sandboxResult.classList.add('is-error');
        setText(strong, 'Input needs attention');
        setText(detail, result.error);
        return;
      }
      elements.sandboxResult.classList.add('is-success');
      if (result.status === 'HOLD') {
        setText(strong, 'P01 · HOLD — publish no deadline');
        setText(detail, result.initial.reason);
        return;
      }
      const decision = result.review || result.appeal || result.assessment;
      const policy = decision ? decision.policy : result.initial.policy;
      const deadline = Scenario.formatClock(result.effectiveDeadline);
      const outcome = !decision
        ? 'Deadline ready'
        : decision.eligible ? 'Assessment eligible' : 'Rider protected';
      const arithmetic = decision
        ? ' Late ' + decision.late + ' · credit ' + decision.credit + ' · residual ' + decision.residual + ' min.'
        : '';
      setText(strong, policy + ' · ' + outcome + ' · ' + deadline);
      setText(detail, (decision ? decision.reason : result.initial.reason) + arithmetic);
    }

    return Object.freeze({render, renderSandbox, elements});
  }

  return {COPY, RULE_BY_STEP, RULE_LABELS, createView};
});
