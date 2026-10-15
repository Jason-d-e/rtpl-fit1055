'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {spawn} = require('node:child_process');
const net = require('node:net');

const projectRoot = path.resolve(__dirname, '..');
const pageUrl = process.env.RTPL_PAGE_URL || pathToFileURL(path.join(projectRoot, 'guided-demo.html')).href;
const workDir = path.join(projectRoot, '.work');

function progress(message) {
  console.log('[browser-smoke] ' + message);
}

function browserPath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw Error('Chrome or Edge was not found. Set CHROME_PATH to run the browser smoke test.');
  return found;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', function () {
      const port = server.address().port;
      server.close(function () { resolve(port); });
    });
  });
}

async function launchBrowser() {
  const executable = browserPath();
  fs.mkdirSync(workDir, {recursive: true});
  const profile = path.join(workDir, 'browser-smoke-profile-' + process.pid + '-' + Date.now());
  const port = await reservePort();
  const child = spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    'about:blank'
  ], {stdio: ['ignore', 'pipe', 'pipe']});

  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  let spawnError = null;
  child.once('error', error => { spawnError = error; });
  const endpoint = 'http://127.0.0.1:' + port + '/json/version';
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (spawnError) throw spawnError;
    try {
      const response = await fetch(endpoint, {signal: AbortSignal.timeout(250)});
      if (response.ok) {
        const version = await response.json();
        if (version.webSocketDebuggerUrl) {
          return {child, profile, webSocketUrl: version.webSocketDebuggerUrl, debugBase: 'http://127.0.0.1:' + port};
        }
      }
    } catch (_) {
      // Browser startup is still in progress.
    }
    await delay(100);
  }
  if (child.exitCode === null) child.kill();
  throw Error('Timed out waiting for the DevTools endpoint.\n' + output);
}

function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const debug = process.env.RTPL_BROWSER_DEBUG === '1';
  let nextId = 1;
  socket.addEventListener('message', async event => {
    try {
      const raw = event.data instanceof Blob
        ? await event.data.text()
        : event.data instanceof ArrayBuffer
          ? Buffer.from(event.data).toString('utf8')
          : String(event.data);
      const message = JSON.parse(raw);
      if (debug) console.log('[cdp receive]', message.id || message.method);
      if (!message.id || !pending.has(message.id)) return;
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timeout);
      if (message.error) item.reject(Error(message.error.message));
      else item.resolve(message.result || {});
    } catch (error) {
      for (const item of pending.values()) {
        clearTimeout(item.timeout);
        item.reject(error);
      }
      pending.clear();
    }
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Timed out connecting to browser DevTools.')), 10000);
    socket.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId++;
          const payload = {id, method, params};
          if (sessionId) payload.sessionId = sessionId;
          return new Promise((resolveCommand, rejectCommand) => {
            const timeout = setTimeout(() => {
              pending.delete(id);
              rejectCommand(Error('DevTools command timed out: ' + method));
            }, 10000);
            pending.set(id, {resolve: resolveCommand, reject: rejectCommand, timeout});
            if (debug) console.log('[cdp send]', id, method);
            socket.send(JSON.stringify(payload));
          });
        },
        close() { socket.close(); }
      });
    }, {once: true});
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(Error('Could not connect to browser DevTools.'));
    }, {once: true});
    socket.addEventListener('close', () => {
      if (debug) console.log('[cdp close]');
      for (const item of pending.values()) {
        clearTimeout(item.timeout);
        item.reject(Error('Browser DevTools connection closed.'));
      }
      pending.clear();
    });
  });
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  }, sessionId);
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text || 'Browser evaluation failed.');
  return result.result.value;
}

async function waitForReady(cdp, sessionId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const ready = await evaluate(cdp, sessionId, "document.documentElement.dataset.guidedReady === 'true'");
    if (ready) return;
    await delay(100);
  }
  throw Error('Guided Demo did not become ready.');
}

async function capture(cdp, sessionId, name) {
  fs.mkdirSync(workDir, {recursive: true});
  const result = await cdp.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
  fs.writeFileSync(path.join(workDir, name), Buffer.from(result.data, 'base64'));
}

async function run() {
  // Chromium may detach its DevTools process on Windows. Keep Node alive while
  // the first WebSocket connection is being established.
  const keepAlive = setInterval(function () {}, 1000);
  let browser;
  let cdp;
  try {
    progress('launching local headless browser');
    browser = await launchBrowser();
    progress('connecting to DevTools');
    // The first about:blank target can be replaced during Chromium startup.
    await delay(600);
    const pages = await fetch(browser.debugBase + '/json').then(response => response.json());
    const page = pages.find(item => item.type === 'page');
    if (!page) throw Error('No page target was exposed by the headless browser.');
    if (process.env.RTPL_BROWSER_DEBUG === '1') console.log('[cdp page]', page.url, page.webSocketDebuggerUrl);
    cdp = await connect(page.webSocketDebuggerUrl);
    const sessionId = undefined;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: "window.__rtplErrors=[];addEventListener('error',e=>__rtplErrors.push(e.message));addEventListener('unhandledrejection',e=>__rtplErrors.push(String(e.reason)));"
    }, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1366, height: 768, deviceScaleFactor: 1, mobile: false
    }, sessionId);
    await cdp.send('Page.navigate', {url: 'about:blank'}, sessionId);
    await delay(120);
    const targetUrl = new URL(pageUrl);
    targetUrl.searchParams.set('qa', String(Date.now()));
    targetUrl.hash = 'step-0';
    await cdp.send('Page.navigate', {url: targetUrl.href}, sessionId);
    await waitForReady(cdp, sessionId);
    progress('page ready at 1366x768');

    const initial = await evaluate(cdp, sessionId, `(() => ({
      step: RTPLGuidedApp.getState().stepIndex,
      model: RTPLGuidedApp.getModel(),
      errors: __rtplErrors,
      external: performance.getEntriesByType('resource').map(x => x.name).filter(name => {
        const resource = new URL(name, location.href);
        return location.protocol === 'file:' ? resource.protocol !== 'file:' : resource.origin !== location.origin;
      })
    }))()`);
    assert.equal(initial.step, 0);
    assert.equal(initial.model.order.id, 'A101');
    assert.equal(initial.model.customer.deadlineLabel, null);
    assert.deepEqual(initial.errors, []);
    assert.deepEqual(initial.external, []);

    const clickAndKeyboard = await evaluate(cdp, sessionId, `(() => {
      document.querySelector('#btn-next').click();
      document.body.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true}));
      const model = RTPLGuidedApp.getModel();
      return {step:RTPLGuidedApp.getState().stepIndex, rider:model.order.protectedDeadlineMinute,
        customer:model.customer.deadlineMinute, control:model.rtpl.effectiveDeadlineMinute};
    })()`);
    assert.deepEqual(clickAndKeyboard, {step: 2, rider: 34, customer: 34, control: 34});
    const accepted = await evaluate(cdp, sessionId, `(() => {
      const action=document.querySelector('#rider-action');
      const label=action.textContent.trim();
      action.click();
      return {label, step:RTPLGuidedApp.getState().stepIndex};
    })()`);
    assert.deepEqual(accepted, {label: 'Accept protected offer', step: 3});

    const delayed = await evaluate(cdp, sessionId, `(() => {
      RTPLGuidedApp.goTo(4);
      const model = RTPLGuidedApp.getModel();
      return {deadline:model.order.deadlineMinute, extension:model.order.extensionMinutes,
        customer:model.customer.deadlineMinute, delayVisible:model.delay.visible,
        zone:document.querySelector('#delay-zone').classList.contains('is-active'),
        detour:document.querySelector('#detour-path').classList.contains('is-active'),
        originalBlocked:document.querySelector('#route-path').classList.contains('is-blocked')};
    })()`);
    assert.deepEqual(delayed, {
      deadline: 44, extension: 10, customer: 44, delayVisible: true,
      zone: true, detour: true, originalBlocked: true
    });

    const safeRoute = await evaluate(cdp, sessionId, `(() => {
      RTPLGuidedApp.goTo(5);
      const route=RTPLGuidedApp.getModel().route;
      RTPLGuidedApp.setSpeed(4);
      RTPLGuidedApp.play();
      return {policy:route.safeAlternativePolicy, protected:route.safeAlternativeProtected};
    })()`);
    assert.deepEqual(safeRoute, {policy: 'P05', protected: true});
    await delay(550);
    const playback = await evaluate(cdp, sessionId, `(() => {
      RTPLGuidedApp.pause();
      return RTPLGuidedApp.getState();
    })()`);
    assert.equal(playback.stepIndex, 6);
    assert.equal(playback.playing, false);
    assert.equal(playback.speed, 4);

    await evaluate(cdp, sessionId, 'RTPLGuidedApp.play(); setTimeout(() => RTPLGuidedApp.reset(), 80);');
    await delay(650);
    const reset = await evaluate(cdp, sessionId, 'RTPLGuidedApp.getState()');
    assert.equal(reset.stepIndex, 0);
    assert.equal(reset.playing, false);
    assert.equal(reset.speed, 1);

    const appealed = await evaluate(cdp, sessionId, `(() => {
      RTPLGuidedApp.goTo(6);
      document.querySelector('#rider-action').click();
      const model=RTPLGuidedApp.getModel();
      return {step:model.step.id, effects:Object.values(model.effects)};
    })()`);
    assert.equal(appealed.step, 'APPEAL_PENDING');
    assert.ok(appealed.effects.every(value => value === 'SUSPENDED'));

    const reviewed = await evaluate(cdp, sessionId, `(() => {
      const action=document.querySelector('#review-action');
      const label=action.textContent.trim();
      action.click();
      const model=RTPLGuidedApp.getModel();
      return {label, step:model.step.id, outcome:model.review.outcome,
        effects:Object.values(model.effects)};
    })()`);
    assert.equal(reviewed.label, 'Complete authorised review');
    assert.equal(reviewed.step, 'HUMAN_REVIEWED');
    assert.equal(reviewed.outcome, 'REVERSE');
    assert.ok(reviewed.effects.every(value => value === 'PROTECTED'));

    const final = await evaluate(cdp, sessionId, `(() => {
      RTPLGuidedApp.goTo(9);
      const model=RTPLGuidedApp.getModel();
      return {step:model.step.id, deadline:model.order.deadlineLabel, appeal:model.audit.appeal,
        protected:model.audit.protected, effects:Object.values(model.audit.effects),
        exportDisabled:document.querySelector('#btn-export-audit').disabled,
        customerText:document.querySelector('#customer-screen').innerText};
    })()`);
    assert.equal(final.step, 'AUDIT_READY');
    assert.equal(final.deadline, '12:44');
    assert.equal(final.appeal, 'REVERSE');
    assert.equal(final.protected, true);
    assert.ok(final.effects.every(value => value === 'PROTECTED'));
    assert.equal(final.exportDisabled, false);
    assert.equal(/PENDING|REVERSE|service score|bonus|future allocation|review found/i.test(final.customerText), false);
    await delay(800);
    await capture(cdp, sessionId, 'browser-smoke-desktop.png');
    await evaluate(cdp, sessionId, "scrollTo(0, document.querySelector('#control-screen').offsetTop - 12)");
    await delay(180);
    await capture(cdp, sessionId, 'browser-smoke-control.png');
    await evaluate(cdp, sessionId, 'scrollTo(0, 0)');
    progress('lifecycle, privacy, playback and reset checks passed');

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844
    }, sessionId);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{name: 'prefers-reduced-motion', value: 'reduce'}]
    }, sessionId);
    await delay(200);
    const mobile = await evaluate(cdp, sessionId, `(() => ({
      innerWidth,
      clientWidth:document.documentElement.clientWidth,
      scrollWidth:document.documentElement.scrollWidth,
      offenders:[...document.querySelectorAll('body *')].filter(el => {
        const r=el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1;
      }).slice(0,8).map(el => el.id || el.className || el.tagName),
      stickyHeader:getComputedStyle(document.querySelector('.site-header')).position,
      currentTimelineVisible:(() => { const r=document.querySelector('.timeline li.is-current').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })(),
      touchTargets:[...document.querySelectorAll('#btn-prev,#btn-play,#btn-next,#btn-reset,.speed-controls button,.timeline button,.header-nav a')]
        .filter(el => !el.hidden).map(el => Math.round(el.getBoundingClientRect().height)),
      markerTransition:getComputedStyle(document.querySelector('#rider-marker')).transitionDuration,
      errors:__rtplErrors
    }))()`);
    assert.equal(mobile.innerWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.scrollWidth, 390);
    assert.deepEqual(mobile.offenders, []);
    assert.equal(mobile.stickyHeader, 'sticky');
    assert.equal(mobile.currentTimelineVisible, true);
    assert.ok(mobile.touchTargets.every(height => height >= 44));
    assert.deepEqual(mobile.errors, []);
    await capture(cdp, sessionId, 'browser-smoke-mobile.png');
    progress('390px and reduced-motion checks passed');

    const sandbox = await evaluate(cdp, sessionId, `(() => {
      const form=document.querySelector('#sandbox-form');
      form.elements.causeEvidence.value='missing';
      form.elements.safeRoute.checked=false;
      form.requestSubmit();
      return document.querySelector('#sandbox-result').innerText;
    })()`);
    assert.match(sandbox, /P04/i);
    assert.match(sandbox, /protected/i);

    console.log(JSON.stringify({
      initial: {step: initial.step, order: initial.model.order.id},
      sync: clickAndKeyboard,
      accepted,
      delay: delayed,
      safeRoute,
      playback: {step: playback.stepIndex, speed: playback.speed},
      appealed: {step: appealed.step, effects: appealed.effects[0]},
      reviewed: {step: reviewed.step, outcome: reviewed.outcome, effects: reviewed.effects[0]},
      final: {step: final.step, appeal: final.appeal, protected: final.protected},
      mobile,
      sandbox: sandbox.replace(/\s+/g, ' ').trim()
    }, null, 2));
    console.log('BROWSER_SMOKE_OK');
  } finally {
    clearInterval(keepAlive);
    if (cdp) cdp.close();
    if (browser) {
      if (browser.child.exitCode === null) browser.child.kill();
      await delay(150);
      const resolvedProfile = path.resolve(browser.profile);
      if (path.dirname(resolvedProfile) === path.resolve(workDir) && path.basename(resolvedProfile).startsWith('browser-smoke-profile-')) {
        fs.rmSync(resolvedProfile, {recursive: true, force: true});
      }
    }
  }
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
