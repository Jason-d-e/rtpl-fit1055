'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function occurrences(source, value) {
  return source.split(value).length - 1;
}

test('The browser loads one external core before the interface layer', () => {
  const coreTag = '<script src="./rtpl-core.js"></script>';
  const interfaceStart = 'const C = window.RTPLCore;';
  assert.equal(occurrences(html, coreTag), 1);
  assert.equal(occurrences(html, 'function budget(i)'), 0);
  assert.ok(html.indexOf(coreTag) < html.indexOf(interfaceStart));
});

test('Cases 01 to 07 retain their presentation identifiers and titles', () => {
  const cases = [
    ['01', 'Tight AI deadline'],
    ['02', 'Delay already compensated'],
    ['03', 'Late, cause not established'],
    ['04', 'Late, rider cause supported'],
    ['05', 'Safe legal detour'],
    ['06', 'Overlapping outside delays'],
    ['07', 'Out-of-date route data']
  ];
  for (const [number, title] of cases) {
    assert.ok(html.includes(`num:'${number}', title:'${title}'`), `missing case ${number}`);
  }
});

test('The fixed presentation inputs remain unchanged', () => {
  assert.ok(html.includes(
    'const BASE = {distance:4, legalSpeed:20, conditionSpeed:20, signals:4, wait:10, access:6, handover:2, fresh:true};'
  ));
  assert.ok(html.includes('const B102_ACCEPTED = 42;'));
  assert.ok(html.includes('const ROUTE_NOW = 20;'));
});

test('The main demo outcomes remain aligned with the presentation script', () => {
  const expected = [
    '24 min becomes a 34 min budget: 12:34 for everyone',
    'A101 moves to 12:44, B102 to 12:50',
    '5 min late, 0 new credit, 5 still unexplained. Rider protected.',
    '10 min late, cause not established. Rider protected.',
    'Assessment can proceed. Nothing is applied yet.',
    'All four effects SUSPENDED.',
    'All four effects PROTECTED. Appeal REVERSE.',
    '10 unique minutes excused, not 13. Nothing left unexplained.',
    'Dispatch held for review. No unchecked deadline published.'
  ];
  for (const text of expected) assert.ok(html.includes(text), `missing outcome: ${text}`);
});

test('The teaching and synthetic-data boundaries stay visible', () => {
  assert.ok(html.includes('Demonstration only: no real deliveries, model inference, platform connection or measured rider outcomes.'));
  assert.ok(html.includes('Reviewer authority and evidence reliability are simulated.'));
});
