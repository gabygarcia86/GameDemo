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
  await page.waitForFunction(() => document.querySelectorAll('#image-grid .state-ok').length === 3 || document.querySelectorAll('#image-grid .state-error').length > 0, null, { timeout: 30000 });
  const thumbs = await page.$$eval('#image-grid img', (els) => els.map((e) => ({ ok: e.complete && e.naturalWidth > 0, w: e.naturalWidth, h: e.naturalHeight })));
  check('builder: 3 thumbnails render', thumbs.length === 3 && thumbs.every((t) => t.ok), JSON.stringify(thumbs));
  const dimsText = await page.$$eval('#image-grid [data-role=dims]', (els) => els.map((e) => e.textContent));
  check('builder: dimensions shown for each image', dimsText.every((t) => /1152 .* 2048 px/.test(t)), dimsText.join(' | '));
  const btnEnabled = await page.$eval('#build-btn', (b) => !b.disabled);
  check('builder: Build button enabled once compiler and images are ready', btnEnabled);
  const premature = await page.$eval('#results', (r) => r.hidden);
  check('builder: no results/success shown before building', premature);

  await page.click('#build-btn');
  // Real progress: sample the progress bar while compiling.
  const samples = new Set();
  const start = Date.now();
  while (Date.now() - start < 240000) {
    const v = await page.$eval('#progress', (p) => Number(p.getAttribute('aria-valuenow')));
    samples.add(v);
    if (!(await page.$eval('#results', (r) => r.hidden))) break;
    const errShown = await page.$eval('#build-status', (s) => !s.hidden && s.classList.contains('status-error'));
    if (errShown) break;
    await page.waitForTimeout(500);
  }
  const resultsVisible = !(await page.$eval('#results', (r) => r.hidden));
  check('builder: build completes and shows results', resultsVisible, `progress values seen: ${[...samples].sort((a, b) => a - b).join(',')}`);
  check('builder: progress advanced through intermediate values', samples.size >= 3);

  if (resultsVisible) {
    const rows = await page.$$eval('#results-body tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent)));
    check('builder: results table lists 3 targets', rows.length === 3, JSON.stringify(rows));
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
    check('builder: manifest lists 3 targets with indexes 0..2 and correct files',
      man.targets.length === 3 && man.targets.every((t, i) => t.index === i && t.file === `image${i + 1}.jpg`),
      man.targets.map((t) => `${t.index}:${t.file}:${t.width}x${t.height}:${t.quality.rating}`).join(' '));
    check('builder: manifest byte count matches downloaded file', man.mindFileBytes === sz, `${man.mindFileBytes} vs ${sz}`);
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
  await page.waitForFunction(() => document.querySelectorAll('#image-grid .state-ok').length === 3, null, { timeout: 30000 });
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
  await page.waitForFunction(() => document.querySelectorAll('#image-grid .state-error').length === 1 && document.querySelectorAll('#image-grid .state-ok').length === 2, null, { timeout: 20000 });
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
