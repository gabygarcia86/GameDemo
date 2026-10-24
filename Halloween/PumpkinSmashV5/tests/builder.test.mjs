// Automated checks for target-builder.html. Usage:
//   node tests/builder.test.mjs --base=http://127.0.0.1:8123/pumpkin-smash --out=<dir for built files> --shots=<dir>
import fs from 'fs';
import path from 'path';
import { chromium, LAUNCH_ARGS } from './_pw.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const BASE = arg('base', 'http://127.0.0.1:8123/pumpkin-smash');
const OUT = arg('out', '');
const SHOTS = arg('shots', '/tmp');
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`); };

// The expected images come from the served manifest, so the checks follow whatever photo set is in images/.
const EXPECTED = (await (await fetch(`${BASE}/images/manifest.json`)).json()).targets;
const COMMITTED = await (await fetch(`${BASE}/target-manifest.json`)).json();
const N = EXPECTED.length;
const BUILD_TIMEOUT_MS = Math.max(240000, N * 90000); // compiling is roughly linear in the number of photos
console.log(`manifest lists ${N} images`);

const browser = await chromium.launch({ args: LAUNCH_ARGS });

async function open(viewport, setup) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  if (setup) await setup(page);
  await page.goto(`${BASE}/target-builder.html`);
  return { ctx, page, logs };
}

// ---- 1. Happy path (desktop) ----
{
  const { ctx, page } = await open({ width: 1100, height: 800 });
  await page.waitForFunction((n) => document.querySelectorAll('#image-grid .state-ok').length === n || document.querySelectorAll('#image-grid .state-error').length > 0, N, { timeout: 30000 + N * 2000 });
  const thumbs = await page.$$eval('#image-grid img', (els) => els.map((e) => ({ ok: e.complete && e.naturalWidth > 0, w: e.naturalWidth, h: e.naturalHeight, src: e.getAttribute('src') })));
  const broken = thumbs.filter((t) => !t.ok).map((t) => t.src);
  check(`builder: all ${N} thumbnails render`, thumbs.length === N && broken.length === 0, `${thumbs.length} shown, broken: ${broken.join(', ') || 'none'}`);
  const cardFiles = await page.$$eval('#image-grid .fname', (els) => els.map((e) => e.textContent.trim()));
  const wrongOrder = EXPECTED.filter((e, i) => cardFiles[i] !== e.file).map((e) => e.file);
  check('builder: thumbnails are in manifest order', wrongOrder.length === 0, wrongOrder.join(', '));
  const dimsText = await page.$$eval('#image-grid [data-role=dims]', (els) => els.map((e) => e.textContent));
  const badDims = dimsText.filter((t, i) => !thumbs[i] || !t.includes(`${thumbs[i].w} × ${thumbs[i].h} px`));
  check('builder: dimensions shown for each image', dimsText.length === N && badDims.length === 0, badDims.join(' | '));
  const btnEnabled = await page.$eval('#build-btn', (b) => !b.disabled);
  check('builder: Build button enabled once compiler and images are ready', btnEnabled);
  const premature = await page.$eval('#results', (r) => r.hidden);
  check('builder: no results/success shown before building', premature);

  await page.click('#build-btn');
  // Real progress: sample the progress bar while compiling.
  const samples = new Set();
  const start = Date.now();
  while (Date.now() - start < BUILD_TIMEOUT_MS) {
    const v = await page.$eval('#progress', (p) => Number(p.getAttribute('aria-valuenow')));
    samples.add(v);
    if (!(await page.$eval('#results', (r) => r.hidden))) break;
    const errShown = await page.$eval('#build-status', (s) => !s.hidden && s.classList.contains('status-error'));
    if (errShown) break;
    await page.waitForTimeout(500);
  }
  const resultsVisible = !(await page.$eval('#results', (r) => r.hidden));
  check('builder: build completes and shows results', resultsVisible, `${((Date.now() - start) / 1000).toFixed(0)} s, progress values seen: ${[...samples].sort((a, b) => a - b).join(',')}`);
  check('builder: progress advanced through intermediate values', samples.size >= 3);

  if (resultsVisible) {
    const rows = await page.$$eval('#results-body tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent)));
    check(`builder: results table lists ${N} targets`, rows.length === N, `${rows.length} rows`);
    const okMsg = await page.$eval('#build-status', (s) => s.className + ' :: ' + s.textContent);
    check('builder: success message shown only after verification', /status-ok/.test(okMsg), okMsg);

    const [dl1] = await Promise.all([page.waitForEvent('download'), page.click('#dl-mind')]);
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#dl-manifest')]);
    const dir = OUT || fs.mkdtempSync('/tmp/builder-out-');
    fs.mkdirSync(dir, { recursive: true });
    await dl1.saveAs(path.join(dir, 'targets.mind'));
    await dl2.saveAs(path.join(dir, 'target-manifest.json'));
    const sz = fs.statSync(path.join(dir, 'targets.mind')).size;
    check('builder: downloaded targets.mind is non-empty', sz > 100000, `${sz} bytes`);
    const man = JSON.parse(fs.readFileSync(path.join(dir, 'target-manifest.json'), 'utf8'));
    const mismatched = EXPECTED.filter((e, i) => !man.targets[i] || man.targets[i].index !== i || man.targets[i].file !== e.file || man.targets[i].label !== e.label);
    check(`builder: manifest lists ${N} targets with indexes 0..${N - 1}, files and labels as in images/manifest.json`,
      man.targets.length === N && mismatched.length === 0,
      `${man.targets.length} targets, mismatched: ${mismatched.map((e) => e.file).join(', ') || 'none'}`);
    check('builder: manifest byte count matches downloaded file', man.mindFileBytes === sz, `${man.mindFileBytes} vs ${sz}`);
    // The compiled bytes vary slightly between machines/GPUs, so compare what the game checks: count, order, files, sizes.
    const key = (t) => `${t.index}:${t.file}:${t.width}x${t.height}`;
    const stale = man.targets.filter((t, i) => !COMMITTED.targets[i] || key(t) !== key(COMMITTED.targets[i])).map((t) => t.file);
    check('builder: committed target-manifest.json lists the same targets as a fresh build',
      COMMITTED.targets.length === man.targets.length && stale.length === 0,
      `committed ${COMMITTED.targets.length}, fresh ${man.targets.length}, differing: ${stale.join(', ') || 'none'}`);
    const weak = man.targets.filter((t) => t.quality.rating !== 'good').map((t) => `${t.file}:${t.quality.rating}(${t.features.total})`);
    console.log(`builder ratings below "good": ${weak.join(' ') || 'none'}`);
    console.log('MANIFEST_SUMMARY', JSON.stringify(man.targets.map((t) => ({ file: t.file, features: t.features, quality: t.quality }))));
  }

  // vertical scroll on desktop
  const sc = await page.evaluate(async () => {
    const before = window.scrollY; window.scrollTo(0, 1e6); await new Promise((r) => setTimeout(r, 100));
    return { scrollable: document.documentElement.scrollHeight > window.innerHeight, moved: window.scrollY > before, overflowY: getComputedStyle(document.body).overflowY };
  });
  check('builder: page scrolls vertically (desktop)', sc.scrollable && sc.moved && sc.overflowY !== 'hidden', JSON.stringify(sc));
  await page.screenshot({ path: path.join(SHOTS, 'builder-desktop.png'), fullPage: true });
  await ctx.close();
}

// ---- 2. Mobile viewport scroll ----
{
  const { ctx, page } = await open({ width: 390, height: 780 });
  await page.waitForFunction((n) => document.querySelectorAll('#image-grid .state-ok').length === n, N, { timeout: 30000 + N * 2000 });
  const sc = await page.evaluate(async () => {
    window.scrollTo(0, 1e6); await new Promise((r) => setTimeout(r, 100));
    return { scrollable: document.documentElement.scrollHeight > window.innerHeight, moved: window.scrollY > 0, hScroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  check('builder: page scrolls vertically (390px mobile viewport), no horizontal overflow', sc.scrollable && sc.moved && !sc.hScroll, JSON.stringify(sc));
  await page.screenshot({ path: path.join(SHOTS, 'builder-mobile.png'), fullPage: false });
  await ctx.close();
}

// ---- 3. Failure: compiler cannot be fetched ----
{
  const { ctx, page } = await open({ width: 1000, height: 800 }, async (p) => {
    await p.route('**/vendor/mindar/mindar-image.prod.js', (r) => r.abort('failed'));
  });
  await page.waitForFunction(() => /did not load/.test(document.getElementById('compiler-status').textContent), null, { timeout: 20000 });
  const st = await page.$eval('#compiler-status', (s) => s.className);
  check('builder: blocked compiler shows a clear error', /status-error/.test(st));
  await page.waitForTimeout(500);
  check('builder: Build stays disabled when compiler failed', await page.$eval('#build-btn', (b) => b.disabled));
  check('builder: no false success when compiler failed', await page.$eval('#results', (r) => r.hidden));
  await ctx.close();
}

// ---- 4. Failure: one image missing ----
{
  const { ctx, page } = await open({ width: 1000, height: 800 }, async (p) => {
    await p.route('**/images/image2.jpg', (r) => r.fulfill({ status: 404, body: 'nope' }));
  });
  await page.waitForFunction((n) => document.querySelectorAll('#image-grid .state-error').length === 1 && document.querySelectorAll('#image-grid .state-ok').length === n - 1, N, { timeout: 20000 + N * 2000 });
  const msg = await page.$eval('#card-1 [data-role=state]', (s) => s.textContent);
  check('builder: missing image flagged on its own card', /Failed: HTTP 404/.test(msg), msg);
  check('builder: Build disabled when an image failed to load', await page.$eval('#build-btn', (b) => b.disabled));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\nSUMMARY ${results.length - failed.length}/${results.length} passed`);
fs.writeFileSync(path.join(SHOTS, 'builder-test-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
