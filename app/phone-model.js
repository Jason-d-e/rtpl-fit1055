/* One delivery, played freely on a phone. Every decision comes from rtpl-core.js;
   this file only keeps the trip's clock and turns taps into core calls. Synthetic data. */
(function (root, factory) {
  const api = factory(root.RTPLCore || (typeof require === 'function' ? require('../rtpl-core.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RTPLPhone = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  // The same made-up order as the presentation: 4 km, AI proposes 24 min, the checked floor is 34.
  const ORDER = Object.freeze({id: 'A101', restaurant: 'Noodle Kitchen', drop: 'Maple Court, Block 3', km: 4, items: '2 × Beef noodle soup · 1 × Iced lemon tea'});
  const AI = 24;
  const BASE = Object.freeze({distance: 4, legalSpeed: 20, conditionSpeed: 20, signals: 4, wait: 10, access: 6, handover: 2});
  // Remaining trip after the closure (detour) and on the shortcut: 24 and 13 minutes, as on slide 7.
  const DETOUR_LEFT = Object.freeze({distance: 4, legalSpeed: 20, conditionSpeed: 20, signals: 4, wait: 0, access: 6, handover: 2, fresh: true});
  const SHORTCUT_LEFT = Object.freeze({distance: 1, legalSpeed: 20, conditionSpeed: 20, signals: 2, wait: 0, access: 6, handover: 2, fresh: true});
  const PICKUP_AT = 14;      // 12:14: at the kitchen 12:04, 10 min food wait
  const CLOSURE_AFTER = 6;   // the road closes 6 min after pickup (12:20 on time)
  const SAFE_DETOUR = 6;     // extra minutes for a verified legal safe detour

  const clock = m => { const h = 12 + Math.floor(m / 60), mm = m % 60; return h + ':' + String(mm).padStart(2, '0'); };

  function start(opts = {}) {
    const fresh = opts.fresh !== false;
    const s = {fresh, phase: 'offer', now: 0, deadline: null, floor: null, kitchen: 0, closureAt: null, shortcut: false,
      stop: 0, jam: 0, detour: false, incomplete: false, events: [], covered: [], decision: null, record: null,
      reason: 'Checked by RTPL', log: [], seen: {rider: false, customer: false, review: true}};
    const check = C.initial({...BASE, fresh}, AI, 0);
    if (check.status === 'HOLD') {
      s.phase = 'held';
      note(s, 'P01', 'Route and safety data are out of date. Dispatch is held; no time is sent to anyone.', 'hold');
      return s;
    }
    s.deadline = check.deadline; s.floor = check.floor;
    note(s, 'P02', `AI proposed ${clock(AI)} (${AI} min). Legal minimum is ${check.floor} min, so the rider and customer get ${clock(check.deadline)}.`, 'ok');
    return s;
  }

  function note(s, rule, text, tone) { s.log.unshift({at: clock(s.now), rule, text, tone: tone || 'info'}); }
  const copy = s => JSON.parse(JSON.stringify(s));

  // Where the rider would arrive if nothing else happened, before personal stops, traffic and detours.
  function baseArrival(s) {
    return s.closureAt === null ? 34 + s.kitchen : s.closureAt + C.budget(s.shortcut ? SHORTCUT_LEFT : DETOUR_LEFT);
  }
  function arrival(s) { return baseArrival(s) + s.stop + s.jam + (s.detour ? SAFE_DETOUR : 0); }

  function recheck(s, now, left, why) {
    const r = C.recheckBundle([{id: ORDER.id, deadline: s.deadline}], now, {[ORDER.id]: left});
    const next = r.orders[0].deadline;
    if (next > s.deadline) { note(s, 'P02', `${why} Deadline moves later: ${clock(s.deadline)} → ${clock(next)}.`, 'ok'); s.reason = why; }
    else note(s, 'P02', `${why} A new estimate would be ${clock(now + C.budget(left))}, but an accepted time never moves earlier: ${clock(s.deadline)} kept.`, 'ok');
    s.deadline = next;
    s.seen.customer = false;
  }

  const ACTIONS = {
    accept(s) {
      if (s.phase !== 'offer') throw Error('No order to accept.');
      s.phase = 'restaurant'; s.now = 4;
      note(s, 'P02', `Rider accepted ${clock(s.deadline)}. From now on this time can only move later.`, 'ok');
    },
    kitchenLate(s, {minutes}) {
      if (s.phase !== 'restaurant' || s.kitchen) throw Error('Only once, while waiting at the restaurant.');
      s.kitchen = minutes; s.now += minutes;
      const at = s.deadline;
      // The kitchen log verifies the delay; the extension covers it, so it is never credited twice.
      s.events.push({id: 'K1', start: at, end: at + minutes, verified: true, reliable: true, source: 'Restaurant kitchen log', label: 'Kitchen delay'});
      s.covered.push([at, at + minutes]);
      recheck(s, 0, {...BASE, wait: BASE.wait + minutes, fresh: true}, `Kitchen delay of ${minutes} min, verified by the restaurant log.`);
    },
    pickUp(s) {
      if (s.phase !== 'restaurant') throw Error('Not at the restaurant.');
      s.phase = 'riding'; s.now = PICKUP_AT + s.kitchen;
      note(s, '—', `Food picked up at ${clock(s.now)}.`);
    },
    roadClosed(s) {
      if (s.phase !== 'riding' || s.closureAt !== null) throw Error('Only once, while riding.');
      s.closureAt = PICKUP_AT + s.kitchen + CLOSURE_AFTER; s.now = s.closureAt;
      recheck(s, s.closureAt, DETOUR_LEFT, 'Harbour Road closed; the detour is longer.');
    },
    shortcut(s) {
      if (s.phase !== 'riding' || s.closureAt === null || s.shortcut) throw Error('Only after the road closure.');
      s.shortcut = true;
      recheck(s, s.closureAt, SHORTCUT_LEFT, 'A faster shortcut opened.');
    },
    stop(s, {minutes}) {
      if (s.phase !== 'riding') throw Error('Only while riding.');
      s.stop += minutes;
      note(s, '—', `Rider paused for ${minutes} min (personal stop). The app logs the pause as reliable evidence.`);
    },
    jam(s, {minutes}) {
      if (s.phase !== 'riding') throw Error('Only while riding.');
      s.jam += minutes;
      note(s, '—', `Stuck in traffic for ${minutes} min. No outside record exists for it.`);
    },
    detour(s) {
      if (s.phase !== 'riding' || s.detour) throw Error('Only once, while riding.');
      s.detour = true;
      note(s, '—', `Rider took a legal, safer detour (+${SAFE_DETOUR} min). The route log verifies it.`);
    },
    gpsLost(s) {
      if (s.phase !== 'riding') throw Error('Only while riding.');
      s.incomplete = true;
      note(s, '—', 'Part of the trip record was lost, so the cause record is incomplete.');
    },
    deliver(s) {
      if (s.phase !== 'riding') throw Error('Pick up the food first.');
      const completed = arrival(s), base = baseArrival(s);
      s.phase = 'delivered'; s.now = completed;
      const riderEvidence = s.stop ? {start: base, end: base + s.stop, verified: true, reliable: true, source: 'Rider app pause log'} : null;
      s.decision = C.assess({deadline: s.deadline, completed, events: s.events, covered: s.covered, riderEvidence,
        // The safe detour is the explanation only when it is the sole extra time on the trip.
        safeRoute: s.detour && !s.stop && !s.jam, causalComplete: !s.incomplete});
      s.completed = completed;
      const d = s.decision;
      note(s, d.policy, `Delivered ${clock(completed)} against ${clock(s.deadline)}: late ${d.late}, new credit ${d.credit}, unexplained ${d.residual}. ${d.reason}`, d.protected ? 'ok' : 'warn');
      s.record = C.audit({id: ORDER.id, deadline: s.deadline}, d);
      s.seen.customer = false;
    },
    appeal(s, {message}) {
      if (!s.decision || !s.decision.eligible || s.decision.appeal.status !== 'NONE') throw Error('Nothing to appeal.');
      s.decision = C.appeal(s.decision, s.completed + 3, s.completed);
      s.appealMessage = (message || '').trim();
      s.now = s.completed + 3;
      note(s, 'P06', 'Rider requested human review. All four disputed effects are suspended until an authorised person decides.', 'pause');
      s.record = C.audit({id: ORDER.id, deadline: s.deadline}, s.decision);
      s.seen.review = false;
    },
    review(s, {authorised, outcome, reason}) {
      if (!s.decision || s.decision.appeal.status !== 'PENDING') throw Error('No pending appeal.');
      s.decision = C.review(s.decision, {authorised, outcome, reason, at: s.completed + 25});
      s.now = s.completed + 25;
      note(s, 'P06', `Reviewer decided ${outcome}: “${reason.trim()}”. Effects are now ${s.decision.protected ? 'PROTECTED' : 'ASSESSMENT ELIGIBLE'}.`, s.decision.protected ? 'ok' : 'warn');
      s.record = C.audit({id: ORDER.id, deadline: s.deadline}, s.decision);
      s.seen.rider = false;
    }
  };

  // Apply a tap. Returns a new state; core refusals come back as {error}.
  function act(state, type, args = {}) {
    const s = copy(state);
    try { ACTIONS[type](s, args); return {state: s}; }
    catch (e) { return {state, error: e.message}; }
  }

  return {ORDER, AI, BASE, clock, start, act, arrival, baseArrival, EFFECTS: C.EFFECTS, SAFE_DETOUR};
});
