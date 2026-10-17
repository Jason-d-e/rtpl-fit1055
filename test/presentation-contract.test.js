'use strict';

// The live site is a presentation contract: each main scene matches one slide,
// keeps its presenter and shows the same numbers as the slides and speaker notes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const S = require('../app/scenes.js');

test('The page loads the single rules core before every interface script', () => {
  const order = ['./rtpl-core.js', './app/geo.js', './app/scenes.js', './app/render.js', './app/sound.js', './app/main.js'];
  const at = order.map(src => html.indexOf(`<script src="${src}"></script>`));
  assert.ok(at.every(i => i > 0), 'all scripts present');
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'scripts load in dependency order');
  const sound = fs.readFileSync(path.join(root, 'app/sound.js'), 'utf8');
  for (const api of ['fetch(', 'XMLHttpRequest', 'localStorage', 'new Audio(']) assert.equal(sound.includes(api), false, `sound.js must not use ${api}`);
  for (const f of ['app/geo.js', 'app/scenes.js', 'app/render.js', 'app/sound.js', 'app/main.js']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.equal(src.includes('function budget('), false, `${f} must not re-implement the rules`);
  }
});

test('Main scenes follow slide 2 and slides 5 to 11 with the scripted presenters', () => {
  const main = S.SCENES.filter(s => s.group === 'main').map(s => [s.id, s.slide, s.presenter, s.title]);
  assert.deepEqual(main, [
    ['slide-2', 2, 'Liyuan Liang', 'One lunch order, one tight deadline'],
    ['slide-5', 5, 'Yanyu Zhu', 'Where RTPL sits'],
    ['slide-6', 6, 'Yanyu Zhu', 'Check 1: can a rider make it in time?'],
    ['slide-7', 7, 'Yanyu Zhu', 'The road changes, the promise holds'],
    ['slide-8', 8, 'Yixuan Hu', 'A delay can only be excused once'],
    ['slide-9', 9, 'Yixuan Hu', 'Late is not the same as at fault'],
    ['slide-10', 10, 'Shengbao Lu', 'Appeal: pause first, then a person decides'],
    ['slide-11', 11, 'Shengbao Lu', 'A record for oversight, and nothing more']
  ]);
});

test('Question-time extras keep cases 05, 06, 07 and the Sandbox', () => {
  const extra = S.SCENES.filter(s => s.group === 'extra').map(s => s.id);
  assert.deepEqual(extra, ['qa-07', 'qa-06', 'qa-05', 'sandbox']);
});

test('The fixed presentation inputs remain unchanged', () => {
  assert.deepEqual({...S.BASE}, {distance: 4, legalSpeed: 20, conditionSpeed: 20, signals: 4, wait: 10, access: 6, handover: 2, fresh: true});
  assert.equal(S.AI_PROPOSED, 24);
  assert.equal(S.B102_ACCEPTED, 42);
  assert.equal(S.ROUTE_NOW, 20);
});

test('The demo outcomes remain aligned with the presentation script', () => {
  const results = S.SCENES.flatMap(s => s.beats.map(b => b.result).filter(Boolean));
  for (const text of [
    'The AI suggests 12:24',
    '34 min needed, 24 given: 10 min short',
    'The AI’s 12:24 goes in. A checked 12:34 comes out.',
    '24 min was 10 short. Everyone gets 12:34.',
    'A101 moves to 12:44, B102 to 12:50',
    'Neither time moves earlier',
    '5 min late, 0 new credit, 5 still unexplained. Rider protected.',
    '10 min late, cause not established. Rider protected.',
    'Assessment can proceed. Nothing is applied yet.',
    'All four effects SUSPENDED.',
    'All four effects PROTECTED. Appeal REVERSE.',
    'A minimised record: no identity, GPS, raw evidence or free-text reason.',
    '10 unique minutes excused, not 13. Nothing left unexplained.',
    'Rider protected: a verified safe, legal detour.',
    'Dispatch held for review. No unchecked deadline published.'
  ]) assert.ok(results.includes(text), `missing outcome: ${text}`);
});

test('The teaching and synthetic-data boundaries stay visible', () => {
  assert.ok(html.includes('Demonstration only: no real deliveries, model inference, platform connection or measured rider outcomes.'));
  assert.ok(html.includes('Reviewer authority and evidence reliability are simulated.'));
  assert.equal(S.BOUNDARY, 'Demonstration only: no real deliveries, model inference, platform connection or measured rider outcomes.');
});

test('Old Case Lab links still resolve to a scene', () => {
  const main = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8');
  for (const k of ['01', '02', '03', '04', '05', '06', '07']) assert.ok(main.includes(`'${k}':`), `alias #${k}`);
});
