/* Guided Demo orchestration: one store, one RTPL core, three rendered views. */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('../rtpl-core.js') : root.RTPLCore,
    typeof module === 'object' && module.exports ? require('./scenario.js') : root.RTPLGuidedScenario,
    typeof module === 'object' && module.exports ? require('./store.js') : root.RTPLGuidedStore,
    typeof module === 'object' && module.exports ? require('./adapter.js') : root.RTPLGuidedAdapter,
    typeof module === 'object' && module.exports ? require('./view.js') : root.RTPLGuidedView
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.RTPLGuidedApp = api;
    if (root.document) api.bootstrap(root.document);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core, Scenario, Store, Adapter, View) {
  'use strict';

  if (!Core || !Scenario || !Store || !Adapter || !View) {
    throw Error('RTPL core, scenario, store, adapter and view must load before the Guided Demo app.');
  }

  let activeController = null;

  function parseStepHash(hash) {
    const match = String(hash || '').match(/^#step-(\d+)$/);
    return match ? Scenario.clampStep(Number(match[1])) : 0;
  }

  function numericField(form, name) {
    const field = form.elements.namedItem(name);
    const value = field ? Number(field.value) : NaN;
    if (!Number.isFinite(value) || value < 0) throw Error(name + ' must be a non-negative number.');
    return value;
  }

  function checkedField(form, name) {
    const field = form.elements.namedItem(name);
    return Boolean(field && field.checked);
  }

  function sandboxInputsFromForm(form) {
    const now = numericField(form, 'now');
    const proposedDuration = numericField(form, 'proposed');
    const distance = numericField(form, 'distance');
    const conditionSpeed = numericField(form, 'conditionSpeed');
    const legalSpeed = numericField(form, 'legalSpeed');
    const serviceMinutes = numericField(form, 'serviceMinutes');
    const externalDelay = numericField(form, 'externalDelay');
    const alreadyCovered = numericField(form, 'alreadyCovered');
    const lateMinutes = numericField(form, 'lateMinutes');
    const fresh = checkedField(form, 'fresh');
    const safeRoute = checkedField(form, 'safeRoute');
    const causeField = form.elements.namedItem('causeEvidence');
    const causeEvidence = causeField ? causeField.value : 'missing';

    if (conditionSpeed <= 0 || legalSpeed <= 0) throw Error('Both speeds must be greater than zero.');

    // Preserve the guided scenario's 4:10:6:2 non-travel ratio while allowing one compact input.
    const routeInput = {
      distance,
      conditionSpeed,
      legalSpeed,
      signals: serviceMinutes * 4 / 22,
      wait: serviceMinutes * 10 / 22,
      access: serviceMinutes * 6 / 22,
      handover: serviceMinutes * 2 / 22,
      fresh
    };
    const proposedDeadline = now + proposedDuration;
    const initial = Core.initial(routeInput, proposedDeadline, now);
    if (initial.status !== 'READY') return {routeInput, now, proposedDeadline};

    const delayStart = initial.deadline;
    const delayEnd = delayStart + externalDelay;
    const coveredEnd = delayStart + Math.min(alreadyCovered, externalDelay);
    const extensionEvents = externalDelay > 0 ? [{
      id: 'SANDBOX-OUTSIDE-DELAY',
      kind: 'SYNTHETIC_OUTSIDE_DELAY',
      start: delayStart,
      end: delayEnd,
      verified: true,
      reliable: true,
      source: 'Synthetic sandbox event'
    }] : [];
    const coveredIntervals = coveredEnd > delayStart ? [[delayStart, coveredEnd]] : [];
    const expectedDeadline = delayStart + Math.max(externalDelay, alreadyCovered);
    const completedMinute = expectedDeadline + lateMinutes;
    const events = [...extensionEvents];
    let riderEvidence = null;
    let causalComplete = true;

    if (lateMinutes > 0 && causeEvidence === 'outside') {
      events.push({
        id: 'SANDBOX-RESIDUAL-OUTSIDE',
        kind: 'SYNTHETIC_OUTSIDE_DELAY',
        start: expectedDeadline,
        end: completedMinute,
        verified: true,
        reliable: true,
        source: 'Synthetic sandbox residual event'
      });
    } else if (lateMinutes > 0 && causeEvidence === 'rider') {
      riderEvidence = {
        start: expectedDeadline,
        end: completedMinute,
        verified: true,
        reliable: true,
        source: 'Synthetic sandbox rider-cause record'
      };
    } else if (causeEvidence === 'missing') {
      causalComplete = false;
    }

    return {
      orderId: 'SANDBOX',
      routeInput,
      now,
      proposedDeadline,
      effectiveDeadline: delayStart + Math.min(alreadyCovered, externalDelay),
      extensionEvents,
      extensionEnd: delayEnd,
      coveredIntervals,
      completedMinute,
      events,
      riderEvidence,
      safeRoute,
      causalComplete
    };
  }

  function downloadAudit(doc, audit) {
    if (!audit) throw Error('The minimised audit is available at Step 10.');
    const payload = JSON.stringify(audit, null, 2);
    const blob = new Blob([payload], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = 'RTPL-A101-synthetic-audit.json';
    link.hidden = true;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function bootstrap(doc, options) {
    if (activeController) return activeController;
    const config = options || {};
    const view = View.createView(doc);
    const initialStep = config.initialStep === undefined
      ? parseStepHash(doc.defaultView && doc.defaultView.location.hash)
      : Scenario.clampStep(config.initialStep);
    const store = Store.createStore({
      initialStep,
      stepDurationMs: config.stepDurationMs === undefined ? 1800 : config.stepDurationMs
    });
    const listeners = [];
    let currentModel = Adapter.buildSimulationModel(Core, initialStep);
    let destroyed = false;

    function listen(node, type, callback) {
      node.addEventListener(type, callback);
      listeners.push(function () { node.removeEventListener(type, callback); });
    }

    function syncHash(stepIndex) {
      const win = doc.defaultView;
      if (!win || !win.history || !win.location) return;
      try {
        win.history.replaceState(null, '', '#step-' + stepIndex);
      } catch (_) {
        // file:// and locked-down presentation browsers may reject history updates.
      }
    }

    function render(state, action) {
      currentModel = Adapter.buildSimulationModel(Core, state.stepIndex);
      view.render(currentModel, state);
      doc.documentElement.dataset.guidedReady = 'true';
      doc.documentElement.dataset.guidedStep = String(state.stepIndex);
      if (!action || action.type !== 'INIT') syncHash(state.stepIndex);
    }

    const unsubscribe = store.subscribe(render, true);

    listen(view.elements.previous, 'click', function () { store.previous(); });
    listen(view.elements.next, 'click', function () { store.next(); });
    listen(view.elements.play, 'click', function () {
      if (store.getState().playing) store.pause();
      else store.play();
    });
    listen(view.elements.reset, 'click', function () { store.reset(); });
    listen(view.elements.riderAction, 'click', function () { store.next(); });
    listen(view.elements.reviewAction, 'click', function () { store.next(); });
    listen(view.elements.speeds, 'click', function (event) {
      const button = event.target.closest('[data-speed]');
      if (button) store.setSpeed(Number(button.dataset.speed));
    });
    listen(view.elements.timeline, 'click', function (event) {
      const row = event.target.closest('[data-step]');
      if (row) store.goTo(Number(row.dataset.step));
    });

    const sandboxForm = doc.getElementById('sandbox-form');
    listen(sandboxForm, 'submit', function (event) {
      event.preventDefault();
      if (typeof sandboxForm.reportValidity === 'function' && !sandboxForm.reportValidity()) return;
      try {
        const inputs = sandboxInputsFromForm(sandboxForm);
        view.renderSandbox(Adapter.runSandbox(Core, inputs));
      } catch (error) {
        view.renderSandbox({error: error.message});
      }
    });

    listen(view.elements.exportAudit, 'click', function () {
      try {
        downloadAudit(doc, currentModel.audit);
        view.elements.live.textContent = 'Privacy-minimised synthetic audit downloaded.';
      } catch (error) {
        view.elements.live.textContent = error.message;
      }
    });

    listen(doc, 'keydown', function (event) {
      const tag = event.target && event.target.tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY', 'A'].includes(tag)) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        store.next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        store.previous();
      } else if (event.key === 'Home') {
        event.preventDefault();
        store.goTo(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        store.goTo(Scenario.STEP_COUNT - 1);
      }
    });

    const win = doc.defaultView;
    if (win) {
      listen(win, 'hashchange', function () {
        if (/^#step-\d+$/.test(win.location.hash)) store.goTo(parseStepHash(win.location.hash));
      });
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      while (listeners.length) listeners.pop()();
      store.destroy();
      activeController = null;
      doc.documentElement.dataset.guidedReady = 'false';
    }

    const controller = Object.freeze({
      getState: store.getState,
      getModel: function () { return currentModel; },
      next: store.next,
      previous: store.previous,
      goTo: store.goTo,
      play: store.play,
      pause: store.pause,
      reset: store.reset,
      setSpeed: store.setSpeed,
      runSandbox: function (values) { return Adapter.runSandbox(Core, values); },
      destroy
    });
    activeController = controller;
    return controller;
  }

  function requireController() {
    if (!activeController) throw Error('The Guided Demo app has not been initialised.');
    return activeController;
  }

  return Object.freeze({
    parseStepHash,
    sandboxInputsFromForm,
    downloadAudit,
    bootstrap,
    getState: function () { return requireController().getState(); },
    getModel: function () { return requireController().getModel(); },
    next: function () { return requireController().next(); },
    previous: function () { return requireController().previous(); },
    goTo: function (index) { return requireController().goTo(index); },
    play: function () { return requireController().play(); },
    pause: function () { return requireController().pause(); },
    reset: function () { return requireController().reset(); },
    setSpeed: function (speed) { return requireController().setSpeed(speed); },
    runSandbox: function (values) { return requireController().runSandbox(values); },
    destroy: function () { return requireController().destroy(); }
  });
});
