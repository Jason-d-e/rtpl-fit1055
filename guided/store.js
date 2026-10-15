/* Small deterministic controller for Guided Demo navigation and playback. */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./scenario.js') : root.RTPLGuidedScenario
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RTPLGuidedStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Scenario) {
  'use strict';

  if (!Scenario) throw Error('RTPLGuidedScenario must load before RTPLGuidedStore.');

  const ACTIONS = Object.freeze({
    NEXT: 'NEXT',
    PREV: 'PREV',
    GOTO: 'GOTO',
    PLAY: 'PLAY',
    PAUSE: 'PAUSE',
    SET_SPEED: 'SET_SPEED',
    RESET: 'RESET'
  });

  function validStepCount(value) {
    if (!Number.isInteger(value) || value < 1) throw Error('stepCount must be a positive integer.');
    return value;
  }

  function validSpeed(value) {
    const speed = Number(value);
    if (!Scenario.ALLOWED_SPEEDS.includes(speed)) {
      throw Error('Playback speed must be one of: ' + Scenario.ALLOWED_SPEEDS.join(', ') + '.');
    }
    return speed;
  }

  function clamp(index, stepCount) {
    const numeric = Number(index);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(stepCount - 1, Math.trunc(numeric)));
  }

  function initialState(options) {
    const values = options || {};
    const stepCount = validStepCount(values.stepCount === undefined ? Scenario.STEP_COUNT : values.stepCount);
    const stepIndex = clamp(values.initialStep === undefined ? 0 : values.initialStep, stepCount);
    const speed = validSpeed(values.initialSpeed === undefined ? 1 : values.initialSpeed);
    const playing = values.autoPlay === true && stepIndex < stepCount - 1;
    return Object.freeze({stepIndex, stepCount, playing, speed, revision: 0});
  }

  function reduceState(state, action) {
    if (!action || typeof action.type !== 'string') throw Error('An action type is required.');
    let stepIndex = state.stepIndex;
    let playing = state.playing;
    let speed = state.speed;

    switch (action.type) {
      case ACTIONS.NEXT:
        stepIndex = Math.min(state.stepCount - 1, state.stepIndex + 1);
        if (stepIndex === state.stepCount - 1) playing = false;
        break;
      case ACTIONS.PREV:
        stepIndex = Math.max(0, state.stepIndex - 1);
        break;
      case ACTIONS.GOTO:
        stepIndex = clamp(
          action.stepIndex === undefined ? action.index : action.stepIndex,
          state.stepCount
        );
        if (stepIndex === state.stepCount - 1) playing = false;
        break;
      case ACTIONS.PLAY:
        playing = state.stepIndex < state.stepCount - 1;
        break;
      case ACTIONS.PAUSE:
        playing = false;
        break;
      case ACTIONS.SET_SPEED:
        speed = validSpeed(action.speed);
        break;
      case ACTIONS.RESET:
        stepIndex = 0;
        playing = false;
        speed = 1;
        break;
      default:
        throw Error('Unknown Guided Demo action: ' + action.type);
    }

    if (stepIndex === state.stepIndex && playing === state.playing && speed === state.speed) return state;
    return Object.freeze({
      stepIndex,
      stepCount: state.stepCount,
      playing,
      speed,
      revision: state.revision + 1
    });
  }

  function createStore(options) {
    const values = options || {};
    const stepDurationMs = values.stepDurationMs === undefined ? 1800 : Number(values.stepDurationMs);
    if (!Number.isFinite(stepDurationMs) || stepDurationMs <= 0) {
      throw Error('stepDurationMs must be a positive finite number.');
    }

    const scheduleTimer = values.setTimer || function (callback, delay) { return setTimeout(callback, delay); };
    const cancelTimer = values.clearTimer || function (timer) { clearTimeout(timer); };
    let state = initialState(values);
    let timer = null;
    let destroyed = false;
    const listeners = new Set();

    function clearScheduledStep() {
      if (timer !== null) {
        cancelTimer(timer);
        timer = null;
      }
    }

    function scheduleNextStep() {
      clearScheduledStep();
      if (destroyed || !state.playing || state.stepIndex >= state.stepCount - 1) return;
      timer = scheduleTimer(function () {
        timer = null;
        dispatch({type: ACTIONS.NEXT, source: 'playback'});
      }, stepDurationMs / state.speed);
    }

    function notify(action) {
      for (const listener of [...listeners]) listener(state, action);
    }

    function dispatch(action) {
      if (destroyed) throw Error('The Guided Demo store has been destroyed.');
      const next = reduceState(state, action);
      if (next === state) return state;
      state = next;
      notify(action);
      scheduleNextStep();
      return state;
    }

    function subscribe(listener, emitCurrent) {
      if (typeof listener !== 'function') throw Error('A listener function is required.');
      if (destroyed) throw Error('The Guided Demo store has been destroyed.');
      listeners.add(listener);
      if (emitCurrent === true) listener(state, {type: 'INIT'});
      return function unsubscribe() { listeners.delete(listener); };
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearScheduledStep();
      listeners.clear();
    }

    scheduleNextStep();

    return Object.freeze({
      getState: function () { return state; },
      dispatch,
      subscribe,
      destroy,
      next: function () { return dispatch({type: ACTIONS.NEXT}); },
      previous: function () { return dispatch({type: ACTIONS.PREV}); },
      goTo: function (stepIndex) { return dispatch({type: ACTIONS.GOTO, stepIndex}); },
      play: function () { return dispatch({type: ACTIONS.PLAY}); },
      pause: function () { return dispatch({type: ACTIONS.PAUSE}); },
      setSpeed: function (speed) { return dispatch({type: ACTIONS.SET_SPEED, speed}); },
      reset: function () { return dispatch({type: ACTIONS.RESET}); }
    });
  }

  return {
    ACTIONS,
    initialState,
    reduceState,
    createStore,
    createGuidedStore: createStore
  };
});
