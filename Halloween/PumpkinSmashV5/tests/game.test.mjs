// Automated browser checks for the game (headless Chromium, software WebGL, fake webcam playing known clips).
//
//   node tests/game.test.mjs --base=http://127.0.0.1:8123/pumpkin-smash --clips=<dir from make-test-videos.py>
//        [--shots=<dir>] [--only=track,smash,lost,errors,blank,moving]
//
// These are real browser runs of the real game, but the "camera" is a looping video of a flat picture of the photos, so
// they prove tracking logic and placement against known geometry, NOT performance or behaviour on a physical phone.
import fs from 'fs';
import path from 'path';
import { chromium, LAUNCH_ARGS } from './_pw.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const BASE = arg('base', 'http://127.0.0.1:8123/pumpkin-smash');
const CLIPS = arg('clips', '');
const SHOTS = arg('shots', '/tmp');
const ONLY = arg('only', 'track,smash,lost,errors,blank,moving').split(',');
const TRACK_TOL_PX = Number(arg('tol', '30')); // allowed distance between tracked centre and true centre (1280x720 view)
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (n) => path.join(CLIPS, `${n}.mjpeg`);
const truth = (n) => JSON.parse(fs.readFileSync(path.join(CLIPS, `${n}.json`), 'utf8'));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Wraps getUserMedia so tests can count camera requests and inspect every track that was ever opened.
const SPY = () => {
  window.__gum = { calls: 0, streams: [] };
  const md = navigator.mediaDevices;
  if (!md) return;
  const orig = md.getUserMedia.bind(md);
  md.getUserMedia = async (c) => { window.__gum.calls++; const s = await orig(c); window.__gum.streams.push(s); return s; };
};

async function launch(clipName, { viewport = { width: 1280, height: 720 }, init = null, routes = null } = {}) {
  const args = [...LAUNCH_ARGS, '--use-fake-ui-for-media-stream'];
  if (clipName) args.push('--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${clip(clipName)}`);
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext({ viewport, permissions: ['camera'] });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.addInitScript(SPY);
  if (init) await page.addInitScript(init);
  if (routes) await routes(page);
  await page.goto(`${BASE}/index.html?debug=1`);
  await page.waitForFunction(() => window.__psBoot && window.__psBoot.ready, null, { timeout: 20000 });
  return { browser, ctx, page, logs };
}

const snap = (page) => page.evaluate(() => window.__pumpkinDebug.snapshot());
async function waitFor(page, fn, timeout = 90000, arg0) {
  try { await page.waitForFunction(fn, arg0, { timeout, polling: 100 }); return true; } catch (_) { return false; }
}
const waitPlaying = (page, timeout) => waitFor(page, () => window.__pumpkinDebug.snapshot().state === 'playing', timeout);

async function startGame(page) { await page.click('#btn-start'); }

// ------------------------------------------------------------------ 1. placement against ground truth
async function trackingCase(clipName, expectIndex, label) {
  const { browser, page, logs } = await launch(clipName);
  try {
    await startGame(page);
    const ok = await waitPlaying(page, 120000);
    check(`${label}: a pumpkin appears`, ok);
    if (!ok) { console.log(logs.slice(-8).join('\n')); return; }
    await sleep(1200); // let the One-Euro filter settle
    const s = await snap(page);
    const e = s.engine;
    check(`${label}: pumpkin hosted on the correct target (image ${expectIndex + 1})`, s.active === expectIndex, `active=${s.active}`);
    const t = truth(clipName).centre;
    const c = e.imageCenterScreen[s.active];
    const pm = e.pumpkin.screen;
    const dCentre = dist(c, { x: t[0], y: t[1] });
    const dPump = pm ? dist(pm, { x: t[0], y: t[1] }) : Infinity;
    check(`${label}: tracked image centre is within ${TRACK_TOL_PX}px of the true centre`, dCentre <= TRACK_TOL_PX, `${dCentre.toFixed(1)}px (tracked ${c.x.toFixed(0)},${c.y.toFixed(0)} vs true ${t[0].toFixed(0)},${t[1].toFixed(0)})`);
    check(`${label}: pumpkin sits over the image centre (within ${TRACK_TOL_PX * 1.5}px)`, dPump <= TRACK_TOL_PX * 1.5, `${dPump.toFixed(1)}px`);
    const corner = dist(pm, { x: 0, y: 0 }) < 120 || dist(pm, { x: 0, y: 720 }) < 120;
    check(`${label}: pumpkin is not parked at a screen corner`, !corner, `screen ${pm.x.toFixed(0)},${pm.y.toFixed(0)}`);
    await page.screenshot({ path: path.join(SHOTS, `track-${clipName}.png`) });
    const errs = logs.filter((l) => /^(error|pageerror)/.test(l) && !/swiftshader|GPU stall|WebGL/i.test(l));
    check(`${label}: no console errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally { await browser.close(); }
}

// ------------------------------------------------------------------ 2. taps, scoring, five smashes, restart, camera cleanup
async function smashCase() {
  const { browser, page, logs } = await launch('img3-straight');
  try {
    await startGame(page);
    check('smash: game reaches playing', await waitPlaying(page, 120000));
    await sleep(900);

    let s = await snap(page);
    check('smash: exactly one camera request after Start', (await page.evaluate(() => window.__gum.calls)) === 1);
    check('smash: exactly one WebGL canvas in the stage', (await page.$$eval('#stage canvas', (c) => c.length)) === 1);

    // tap empty space -> nothing
    await page.mouse.click(1230, 690);
    await sleep(300);
    s = await snap(page);
    check('smash: tapping empty space does not score', s.score === 0 && s.state === 'playing', `score=${s.score} state=${s.state}`);

    // tap just outside the pumpkin (well beyond the hit area) -> nothing
    const pm0 = s.engine.pumpkin.screen;
    await page.mouse.click(pm0.x + pm0.radiusPx * 3 + 60, pm0.y);
    await sleep(300);
    s = await snap(page);
    check('smash: tapping beside the pumpkin does not score', s.score === 0, `score=${s.score}`);

    // double tap on the pumpkin -> exactly one point
    const pm = s.engine.pumpkin.screen;
    await page.mouse.click(pm.x, pm.y);
    await page.mouse.click(pm.x, pm.y);
    await sleep(150);
    s = await snap(page);
    check('smash: double tap scores exactly once', s.score === 1, `score=${s.score} state=${s.state}`);
    check('smash: state is smashing/between right after a hit', ['smashing', 'between', 'scanning', 'playing'].includes(s.state));

    // wait until the next pumpkin has spawned
    check('smash: next pumpkin spawns after the animation', await waitPlaying(page, 20000));
    await sleep(500);

    // smashes 2..5
    for (let n = 2; n <= 5; n++) {
      s = await snap(page);
      const p = s.engine.pumpkin.screen;
      if (!p) { check(`smash: pumpkin on screen for smash ${n}`, false); break; }
      await page.mouse.click(p.x, p.y);
      if (n < 5) { await waitFor(page, (k) => { const q = window.__pumpkinDebug.snapshot(); return q.score === k && q.state === 'playing'; }, 20000, n); await sleep(500); }
    }
    const ended = await waitFor(page, () => !document.getElementById('screen-end').hidden, 20000);
    s = await snap(page);
    check('smash: game ends after five smashes with the summary screen', ended && s.score === 5, `score=${s.score} state=${s.state}`);
    check('smash: summary shows 5 / 5', (await page.textContent('#end-score')).trim() === '5 / 5');
    await page.screenshot({ path: path.join(SHOTS, 'end-screen.png') });

    // Play Again: no second camera, no second canvas, score reset
    await page.click('#btn-again');
    check('smash: Play Again reaches playing again', await waitPlaying(page, 60000));
    s = await snap(page);
    check('smash: Play Again resets the score to 0', s.score === 0, `score=${s.score}`);
    check('smash: Play Again did not open a second camera', (await page.evaluate(() => window.__gum.calls)) === 1);
    check('smash: Play Again did not add a second canvas', (await page.$$eval('#stage canvas', (c) => c.length)) === 1);

    // Exit stops the camera
    await page.click('#btn-exit');
    await sleep(500);
    const live = await page.evaluate(() => window.__gum.streams.flatMap((st) => st.getTracks()).filter((t) => t.readyState === 'live').length);
    check('smash: Exit stops every camera track', live === 0, `live tracks=${live}`);
    check('smash: Exit returns to the start screen', !(await page.$eval('#screen-start', (e) => e.hidden)));

    // Start again after Exit: one more camera request, still one canvas
    await startGame(page);
    check('smash: Start after Exit works', await waitPlaying(page, 90000));
    check('smash: Start after Exit opened exactly one new camera', (await page.evaluate(() => window.__gum.calls)) === 2);
    check('smash: still a single WebGL canvas after Exit and Start', (await page.$$eval('#stage canvas', (c) => c.length)) === 1);
    const errs = logs.filter((l) => /^(error|pageerror)/.test(l) && !/swiftshader|GPU stall|WebGL/i.test(l));
    check('smash: no console errors during the whole session', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally { await browser.close(); }
}

// ------------------------------------------------------------------ 3. target lost and re-found
async function lostCase() {
  const { browser, page } = await launch('img3-lose');
  try {
    await startGame(page);
    check('lost: pumpkin appears while the image is in view', await waitPlaying(page, 120000));
    const gone = await waitFor(page, () => { const q = window.__pumpkinDebug.snapshot(); return q.state === 'scanning' && q.engine.pumpkin.visible === false; }, 30000);
    check('lost: pumpkin is removed when the image leaves view', gone);
    const s = await snap(page);
    const banner = await page.$eval('#banner', (b) => (b.hidden ? '' : b.textContent));
    check('lost: player is told to find an image again', /image|photo/i.test(banner), banner);
    check('lost: tracking chip no longer claims tracking', !/Tracking: image/.test(await page.textContent('#chip-tracking')), await page.textContent('#chip-tracking'));
    check('lost: pumpkin returns when the image reappears', await waitPlaying(page, 40000));
    void s;
  } finally { await browser.close(); }
}

// ------------------------------------------------------------------ 4. blank scene
async function blankCase() {
  const { browser, page } = await launch('blank');
  try {
    await startGame(page);
    check('blank: game reaches scanning', await waitFor(page, () => window.__pumpkinDebug.snapshot().state === 'scanning', 120000));
    await sleep(8000);
    const s = await snap(page);
    check('blank: no pumpkin is shown when no image is detected', s.engine.pumpkin.visible === false && s.state === 'scanning', `state=${s.state} visible=${s.engine.pumpkin.visible}`);
    const banner = await page.$eval('#banner', (b) => (b.hidden ? '' : b.textContent));
    check('blank: banner asks the player to find a reference photo', /point your camera/i.test(banner), banner);
    check('blank: tracking chip says searching, not tracking', /Searching/.test(await page.textContent('#chip-tracking')), await page.textContent('#chip-tracking'));
    check('blank: camera chip reports camera on', /Camera: on/.test(await page.textContent('#chip-camera')));
    await page.screenshot({ path: path.join(SHOTS, 'blank-scene.png') });
  } finally { await browser.close(); }
}

// ------------------------------------------------------------------ 5. moving image: pumpkin follows the true path
async function movingCase() {
  const { browser, page } = await launch('img3-moving');
  try {
    await startGame(page);
    check('moving: pumpkin appears', await waitPlaying(page, 120000));
    const path_ = truth('img3-moving').path.map(([x, y]) => ({ x, y }));
    const samples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      const s = await snap(page);
      const c = s.engine.imageCenterScreen[s.active >= 0 ? s.active : 2];
      if (c && s.engine.anchors[2].visible) samples.push({ x: c.x, y: c.y, t: Date.now() - t0 });
      await sleep(120);
    }
    // distance from each tracked sample to the nearest point on the true path (dense polyline)
    const dense = [];
    for (let i = 0; i < path_.length - 1; i++) for (let k = 0; k < 10; k++) dense.push({ x: path_[i].x + (path_[i + 1].x - path_[i].x) * k / 10, y: path_[i].y + (path_[i + 1].y - path_[i].y) * k / 10 });
    const off = samples.map((p) => Math.min(...dense.map((d) => dist(p, d))));
    const worst = Math.max(...off);
    const mean = off.reduce((a, b) => a + b, 0) / Math.max(1, off.length);
    const xs = samples.map((p) => p.x);
    const span = Math.max(...xs) - Math.min(...xs);
    check('moving: got tracking samples during the sweep', samples.length >= 20, `${samples.length} samples`);
    check('moving: tracked centre moved with the image', span > 150, `x span ${span.toFixed(0)}px (true sweep ${Math.max(...path_.map((p) => p.x)) - Math.min(...path_.map((p) => p.x))}px)`);
    check(`moving: tracked centre stays on the true path (mean < ${TRACK_TOL_PX}px, worst < ${TRACK_TOL_PX * 3}px)`, mean < TRACK_TOL_PX && worst < TRACK_TOL_PX * 3, `mean ${mean.toFixed(1)}px worst ${worst.toFixed(1)}px`);
  } finally { await browser.close(); }
}

// ------------------------------------------------------------------ 6. distinct error screens
async function errorCase(label, expectedCode, expectedTitle, opts, { needsRetry = true } = {}) {
  const { browser, page } = await launch('img3-straight', opts);
  try {
    await startGame(page);
    const shown = await waitFor(page, () => !document.getElementById('screen-error').hidden, 30000);
    check(`errors: ${label} shows the error screen`, shown);
    if (!shown) return;
    const title = await page.textContent('#error-title');
    const detail = await page.textContent('#error-detail');
    check(`errors: ${label} -> "${expectedTitle}" (${expectedCode})`, title.includes(expectedTitle) && detail.includes(expectedCode), `${title} | ${detail}`);
    if (needsRetry) check(`errors: ${label} offers Try Again`, await page.$eval('#btn-retry', (b) => b.offsetParent !== null));
    check(`errors: ${label} offers Back to Start`, await page.$eval('#btn-error-home', (b) => b.offsetParent !== null));
    await page.screenshot({ path: path.join(SHOTS, `error-${expectedCode}.png`) });
  } finally { await browser.close(); }
}

async function errorCases() {
  const rejectGUM = (name) => `(${((n) => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('test', n); }; }).toString()})(${JSON.stringify(name)})`;
  const initFor = (name) => new Function(rejectGUM(name));
  await errorCase('camera permission denied', 'CAMERA_DENIED', 'Camera access is blocked', { init: initFor('NotAllowedError') });
  await errorCase('no camera present', 'CAMERA_UNAVAILABLE', 'No usable camera', { init: initFor('NotFoundError') });
  await errorCase('camera busy / fails to start', 'CAMERA_INIT', 'would not start', { init: initFor('NotReadableError') });
  await errorCase('image database missing', 'TARGETS_MISSING', 'Image database not found', { routes: (p) => p.route('**/targets.mind', (r) => r.abort('failed')) });
  await errorCase('image database corrupt', 'TARGETS_INVALID', 'not usable', { routes: (p) => p.route('**/targets.mind', (r) => r.fulfill({ status: 200, body: Buffer.from('this is not a mind file') })) });
  await errorCase('library fails to download', 'DEPENDENCY', 'game files did not load', { routes: (p) => p.route('**/vendor/three/three.module.js', (r) => r.abort('failed')) });
}

// ------------------------------------------------------------------ run
const run = { track: async () => {
  await trackingCase('img1-straight', 0, 'image1 straight');
  await trackingCase('img2-straight', 1, 'image2 straight');
  await trackingCase('img3-straight', 2, 'image3 straight');
  await trackingCase('img3-rotated', 2, 'image3 rotated 28deg, off-centre');
  await trackingCase('img1-perspective', 0, 'image1 tilted perspective');
}, smash: smashCase, lost: lostCase, blank: blankCase, moving: movingCase, errors: errorCases };

for (const k of ONLY) {
  if (!run[k]) { console.log(`unknown section ${k}`); continue; }
  console.log(`\n== ${k}`);
  try { await run[k](); } catch (e) { check(`${k}: section ran to completion`, false, e && e.message); }
}
const failed = results.filter((r) => !r.pass);
console.log(`\nSUMMARY ${results.length - failed.length}/${results.length} passed`);
fs.writeFileSync(path.join(SHOTS, 'game-test-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
