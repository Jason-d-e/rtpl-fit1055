'use strict';
// Real-browser check of the live demo. Needs Playwright (npm i -D playwright) and a Chromium.
// Usage: node scripts/browser-check.js [url]   (defaults to the local index.html)
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const url = process.argv[2] || 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({viewport: {width: 1366, height: 768}, acceptDownloads: true});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const caption = () => page.textContent('#caption');
  const hash = () => page.evaluate(() => location.hash);

  await page.goto(url + '#slide-5');
  assert.equal(await hash(), '#slide-5');
  // Keyboard: → walks beats, then slides.
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  assert.equal(await hash(), '#slide-6');
  assert.match(await page.textContent('.publish'), /Nothing sent/);
  await page.keyboard.press('ArrowRight');
  assert.match(await page.textContent('.publish'), /12:34/);
  // Tapping Accept on the rider phone advances the story.
  await page.click('[data-role="rider"] [data-act="next"]');
  assert.equal(await hash(), '#slide-6/3');
  assert.match(await page.textContent('.publish'), /Accepted/);

  // Slide 7: both orders move later, then are kept.
  await page.keyboard.press('7'); await page.keyboard.press('ArrowRight');
  assert.match(await page.textContent('.otable'), /12:44[\s\S]*12:50/);
  await page.keyboard.press('ArrowRight');
  assert.match(await page.textContent('.otable'), /kept[\s\S]*12:33/);
  assert.match(await page.textContent('[data-role="customer"]'), /12:44/);

  // Slide 10: appeal from the rider phone, refused without authority, overdue stays suspended, then reversal.
  await page.keyboard.press('0');
  await page.click('[data-role="rider"] [data-act="appeal"]');
  assert.equal((await page.$$eval('.fx-state', els => els.map(e => e.textContent))).join(), 'SUSPENDED,SUSPENDED,SUSPENDED,SUSPENDED');
  assert.doesNotMatch(await page.textContent('[data-role="customer"]'), /SUSPENDED|appeal filed/i);
  await page.uncheck('#rv-auth'); await page.click('[data-act="decide"]');
  assert.match(await page.textContent('.desk'), /Reviewer authority is required/);
  await page.click('[data-act="overdue"]');
  assert.match(await page.textContent('.desk'), /stay SUSPENDED/);
  await page.check('#rv-auth'); await page.click('[data-act="decide"]');
  assert.equal((await page.$$eval('.fx-state', els => els.map(e => e.textContent))).join(), 'PROTECTED,PROTECTED,PROTECTED,PROTECTED');
  assert.match(await page.textContent('.desk'), /after the review target/);

  // Slide 11: the downloaded audit file contains only minimised keys.
  await page.keyboard.press('1');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="download"]')]);
  assert.equal(dl.suggestedFilename(), 'RTPL-synthetic-audit.json');
  const file = JSON.parse(require('node:fs').readFileSync(await dl.path(), 'utf8'));
  assert.deepEqual(Object.keys(file), ['case', 'configuration', 'protectedDeadline', 'policy', 'late', 'credit', 'residual', 'protected', 'appeal', 'effects']);

  // Old Case Lab hash and the Sandbox.
  await page.goto(url + '#07'); await page.waitForTimeout(100);
  assert.equal(await hash(), '#qa-07');
  await page.goto(url + '#sandbox'); await page.waitForTimeout(100);
  await page.fill('#sb-conditionSpeed', '10');
  assert.match(await page.textContent('.publish'), /12:46/);

  // Phone width: no horizontal scroll.
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(url + '#slide-8/3'); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  assert.deepEqual(errors, []);
  console.log('Browser check passed:', url);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
