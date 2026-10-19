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
  const order = ['./rtpl-core.js', './app/geo.js', './app/scenes.js', './app/render.js', './app/music.js', './app/main.js'];
  const at = order.map(src => html.indexOf(`<script src="${src}"></script>`));
  assert.ok(at.every(i => i > 0), 'all scripts present');
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'scripts load in dependency order');
  const music = fs.readFileSync(path.join(root, 'app/music.js'), 'utf8');
  for (const api of ['fetch(', 'XMLHttpRequest', 'localStorage', 'http://']) assert.equal(music.includes(api), false, `music.js must not use ${api}`);
  assert.match(music, /SRC = '\.\/assets\/music\/higher-up\.mp3'/, 'the track is a local file');
  for (const f of ['app/geo.js', 'app/scenes.js', 'app/render.js', 'app/music.js', 'app/main.js']) {
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

test('Every website slide names the same presenter as the PPT, and all 15 PPT slides have an owner', () => {
  assert.equal(Object.keys(S.PPT_OWNER).length, S.PPT_TOTAL);
  for (const s of S.SCENES.filter(x => x.group === 'main')) assert.equal(S.PPT_OWNER[s.slide], s.presenter, `slide ${s.slide}`);
});

test('The public site carries no link to the slides (it is saved only on the presenting computer)', () => {
  const files = ['index.html', 'README.md', 'docs/ARCHITECTURE.md', 'app/geo.js', 'app/scenes.js', 'app/render.js', 'app/music.js', 'app/main.js'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.doesNotMatch(src, /canva\.com\/design\/DA[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+/, `${f} must not contain a Canva design link`);
  }
});

test('Animations do not depend on the OS reduce-motion setting (still version only with ?calm)', () => {
  const main = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'assets/app.css'), 'utf8');
  assert.ok(!main.includes("matchMedia('(prefers-reduced-motion"));
  assert.ok(!css.includes('@media (prefers-reduced-motion'));
  assert.ok(main.includes("has('calm')"));
});

test('The talk plays every PPT page in order, each website scene right after its page', () => {
  const order = S.SHOW_DEFAULT;
  const pages = order.filter(x => x[0] === 'p').map(x => +x.slice(1));
  assert.deepEqual(pages, Array.from({length: S.PPT_TOTAL}, (_, k) => k + 1));
  for (const s of S.SCENES.filter(x => x.group === 'main')) assert.equal(order[order.indexOf('p' + s.slide) + 1], 'w:' + s.id, s.id);
  assert.equal(order[0], 'p1', 'opens on the cover');
  for (let n = 1; n <= S.PPT_TOTAL; n++) {
    const f = String(n).padStart(2, '0') + '.webp';
    assert.ok(fs.existsSync(path.join(root, 'assets/slides', f)), 'slide ' + f);
    assert.ok(fs.existsSync(path.join(root, 'assets/slides/thumb', f)), 'thumbnail ' + f);
  }
});

test('The music is the credited CC BY track, and no synthesised sound is left', () => {
  assert.ok(fs.existsSync(path.join(root, 'assets/music/higher-up.mp3')));
  assert.ok(html.includes('silvermansound.com'), 'credit in the footer');
  assert.equal(fs.existsSync(path.join(root, 'app/sound.js')), false);
});
