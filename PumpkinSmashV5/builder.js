// Target Builder: compiles images/*.jpg into targets.mind + target-manifest.json.
// Uses only the locally stored compiler (vendor/mindar). No CDN, no import map.

const MANIFEST_URL = 'images/manifest.json';
const COMPILER_URL = './vendor/mindar/mindar-image.prod.js';
const LIB_INFO = { name: 'mind-ar', version: '1.2.5', three: '0.186.1' };

// Rating thresholds. Chosen before looking at results; heuristic only.
const RATING = {
  gridCols: 6,
  minPointsPerCell: 3,
  good: { total: 300, coverage: 0.5 },
  fair: { total: 150, coverage: 0.25 },
};

const $ = (id) => document.getElementById(id);

const state = {
  Compiler: null,
  manifest: null,
  items: [],        // { entry, url, ok, error, img, width, height, objectUrl }
  building: false,
  downloadUrls: [],
};

function setStatus(el, kind, text) {
  el.className = `status status-${kind}`;
  el.textContent = text;
  el.hidden = false;
}

function setProgress(pct, label) {
  const p = Math.max(0, Math.min(100, pct));
  $('progress').setAttribute('aria-valuenow', String(Math.round(p)));
  $('progress-bar').style.width = `${p}%`;
  if (label) $('progress-label').textContent = label;
}

// ---------- 1. Compiler ----------
async function loadCompiler() {
  try {
    const mod = await import(COMPILER_URL);
    if (!mod || typeof mod.Compiler !== 'function') {
      throw new Error('Module loaded but does not export Compiler.');
    }
    state.Compiler = mod.Compiler;
    setStatus($('compiler-status'), 'ok', `Compiler ready (MindAR ${LIB_INFO.version}, loaded from ${COMPILER_URL}).`);
  } catch (err) {
    console.error('[builder] Compiler failed to load', err);
    setStatus(
      $('compiler-status'), 'error',
      `The image compiler did not load from ${COMPILER_URL}. ` +
      'Make sure the vendor/mindar folder was uploaded with the site and that you opened this page over http(s), not by double-clicking the file. ' +
      `Technical detail: ${err && err.message ? err.message : err}`
    );
  }
}

// ---------- 2. Images ----------
function loadImageElement(objectUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The file downloaded but could not be decoded as an image.'));
    img.src = objectUrl;
  });
}

function renderCard(item) {
  const li = document.createElement('li');
  li.className = 'image-card';
  li.id = `card-${item.entry.index}`;

  const frame = document.createElement('div');
  frame.className = 'thumb-frame';
  li.appendChild(frame);

  const name = document.createElement('p');
  name.className = 'fname';
  name.textContent = item.entry.file;
  li.appendChild(name);

  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.dataset.role = 'dims';
  meta.textContent = `Target index ${item.entry.index}`;
  li.appendChild(meta);

  if (item.entry.label) {
    const label = document.createElement('p');
    label.className = 'label';
    label.textContent = item.entry.label;
    li.appendChild(label);
  }

  const st = document.createElement('p');
  st.className = 'state state-pending';
  st.dataset.role = 'state';
  st.textContent = 'Loading...';
  li.appendChild(st);

  $('image-grid').appendChild(li);
  item.card = li;
  item.frame = frame;
  item.stateEl = st;
  item.metaEl = meta;
}

function markCard(item, ok, text) {
  item.stateEl.textContent = text;
  item.stateEl.className = `state ${ok ? 'state-ok' : 'state-error'}`;
}

async function loadImages() {
  let manifest;
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    manifest = await res.json();
    if (!manifest || !Array.isArray(manifest.targets) || manifest.targets.length === 0) {
      throw new Error('manifest.json has no "targets" list.');
    }
  } catch (err) {
    console.error('[builder] manifest load failed', err);
    setStatus($('images-status'), 'error',
      `Could not read ${MANIFEST_URL}: ${err.message}. Check that the images folder was uploaded and the filename is exactly "manifest.json".`);
    return;
  }

  state.manifest = manifest;
  // Target index = position in the list (not the "index" field), so the file order is the single source of truth.
  state.items = manifest.targets.map((entry, i) => ({ entry: { ...entry, index: i }, ok: false }));
  state.items.forEach(renderCard);

  await Promise.all(state.items.map(async (item) => {
    const url = `images/${item.entry.file}`;
    item.url = url;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} (is the filename spelled and capitalised exactly like this?)`);
      const blob = await res.blob();
      if (blob.size === 0) throw new Error('The file is empty (0 bytes).');
      item.bytes = blob.size;
      item.objectUrl = URL.createObjectURL(blob);
      const img = await loadImageElement(item.objectUrl);
      item.img = img;
      item.width = img.naturalWidth;
      item.height = img.naturalHeight;
      if (!item.width || !item.height) throw new Error('Image has zero width or height.');

      const thumb = new Image();
      thumb.alt = `Preview of ${item.entry.file}`;
      thumb.src = item.objectUrl;
      item.frame.appendChild(thumb);

      item.metaEl.textContent = `Target index ${item.entry.index} · ${item.width} × ${item.height} px · ${(item.bytes / 1024).toFixed(0)} KB`;
      item.ok = true;
      markCard(item, true, 'Loaded');
    } catch (err) {
      console.error(`[builder] ${url} failed`, err);
      item.ok = false;
      item.error = err.message;
      markCard(item, false, `Failed: ${err.message}`);
    }
  }));

  const failed = state.items.filter((i) => !i.ok);
  if (failed.length) {
    setStatus($('images-status'), 'error',
      `${failed.length} of ${state.items.length} image(s) failed to load. Fix the file(s) marked in red and reload this page.`);
  } else {
    setStatus($('images-status'), 'ok', `All ${state.items.length} images loaded.`);
  }
}

// ---------- 3. Build ----------
function updateBuildEnabled() {
  const ready = !!state.Compiler && state.items.length > 0 && state.items.every((i) => i.ok) && !state.building;
  $('build-btn').disabled = !ready;
}

// Rough quality measure from the compiled feature points at the largest scale.
function assessTarget(compiled, width, height) {
  const keyframes = compiled.matchingData;
  if (!Array.isArray(keyframes) || keyframes.length === 0) {
    return { total: 0, coverage: 0, rating: 'poor', notes: ['No feature data was produced for this image.'] };
  }
  const top = keyframes.reduce((a, b) => (b.width > a.width ? b : a));
  const pts = top.maximaPoints.concat(top.minimaPoints);
  const cols = RATING.gridCols;
  const rows = Math.max(3, Math.min(12, Math.round(cols * top.height / top.width)));
  const cells = new Array(cols * rows).fill(0);
  for (const p of pts) {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(p.x / top.width * cols)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(p.y / top.height * rows)));
    cells[cy * cols + cx] += 1;
  }
  const covered = cells.filter((n) => n >= RATING.minPointsPerCell).length;
  const coverage = covered / cells.length;
  const total = pts.length;

  let rating = 'poor';
  if (total >= RATING.good.total && coverage >= RATING.good.coverage) rating = 'good';
  else if (total >= RATING.fair.total && coverage >= RATING.fair.coverage) rating = 'fair';

  const notes = [];
  if (coverage < RATING.good.coverage) {
    notes.push('Features are clustered in part of the image. Tracking is steadiest while that busy region stays in view.');
  }
  if (total < RATING.good.total) {
    notes.push('Relatively few distinctive features. Expect slower detection and more tracking loss.');
  }
  return { total, maxima: top.maximaPoints.length, minima: top.minimaPoints.length, coverage, rating, notes };
}

async function sha256Hex(bytes) {
  if (!(window.crypto && crypto.subtle)) return null;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fail(message, err) {
  if (err) console.error('[builder]', message, err);
  setStatus($('build-status'), 'error', message);
  setProgress(0, 'Build failed');
  state.building = false;
  updateBuildEnabled();
}

async function build() {
  if (state.building) return;
  state.building = true;
  $('build-btn').disabled = true;
  $('results').hidden = true;
  state.downloadUrls.forEach((u) => URL.revokeObjectURL(u));
  state.downloadUrls = [];

  // Validate before starting.
  if (!state.Compiler) return fail('The compiler is not loaded, so nothing can be built. See step 1.');
  const bad = state.items.filter((i) => !i.ok);
  if (bad.length || state.items.length === 0) {
    return fail(`Cannot build: ${bad.length || 'no'} image(s) did not load. See step 2.`);
  }

  setStatus($('build-status'), 'info', 'Compiling... keep this tab open.');
  setProgress(0, 'Starting...');

  let compiler, buffer;
  try {
    compiler = new state.Compiler();
    const t0 = performance.now();
    await compiler.compileImageTargets(state.items.map((i) => i.img), (pct) => {
      setProgress(pct, `Compiling... ${Math.round(pct)}%`);
    });
    buffer = compiler.exportData();
    state.elapsedMs = performance.now() - t0;
  } catch (err) {
    return fail(`Compiling failed: ${err && err.message ? err.message : err}. Details are in the browser console.`, err);
  }

  // Verify the result is real before reporting anything.
  if (!buffer || buffer.length === 0) {
    return fail('The compiler returned an empty result, so no database was created.');
  }
  let decoded;
  try {
    const check = new state.Compiler();
    decoded = check.importData(buffer);
  } catch (err) {
    return fail(`The compiled data could not be read back: ${err.message}`, err);
  }
  if (!Array.isArray(decoded) || decoded.length !== state.items.length) {
    return fail(`Verification failed: expected ${state.items.length} targets but the database contains ${Array.isArray(decoded) ? decoded.length : 0}.`);
  }
  for (let i = 0; i < decoded.length; i++) {
    const d = decoded[i].targetImage;
    if (d.width !== state.items[i].width || d.height !== state.items[i].height) {
      return fail(`Verification failed: target ${i} is ${d.width}×${d.height} in the database but ${state.items[i].width}×${state.items[i].height} on disk.`);
    }
    if (!decoded[i].matchingData || !decoded[i].trackingData) {
      return fail(`Verification failed: target ${i} is missing its matching or tracking data.`);
    }
  }

  // Build the manifest.
  const targets = state.items.map((item, i) => {
    const q = assessTarget(compiler.data[i], item.width, item.height);
    return {
      index: i,
      file: item.entry.file,
      label: item.entry.label || '',
      width: item.width,
      height: item.height,
      aspectRatio: Number((item.width / item.height).toFixed(5)),
      shorterSide: Math.min(item.width, item.height),
      // In the compiler's pixel space the target spans (0,0)-(width,height). The physical center is:
      center: { x: item.width / 2, y: item.height / 2 },
      features: { total: q.total, maxima: q.maxima, minima: q.minima, gridCoverage: Number(q.coverage.toFixed(3)) },
      quality: { rating: q.rating, heuristic: true, notes: q.notes },
    };
  });

  const mindBytes = new Uint8Array(buffer);
  const manifestObj = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    library: LIB_INFO,
    mindFile: 'targets.mind',
    mindFileBytes: mindBytes.length,
    mindFileSha256: await sha256Hex(mindBytes),
    coordinateNote: 'Anchor group origin = image center. 1 anchor unit = target width. +x right, +y up, +z out of the image toward the viewer.',
    targets,
  };

  const mindBlob = new Blob([mindBytes], { type: 'application/octet-stream' });
  const manifestBlob = new Blob([JSON.stringify(manifestObj, null, 2) + '\n'], { type: 'application/json' });
  const mindUrl = URL.createObjectURL(mindBlob);
  const manUrl = URL.createObjectURL(manifestBlob);
  state.downloadUrls.push(mindUrl, manUrl);
  $('dl-mind').href = mindUrl;
  $('dl-manifest').href = manUrl;

  // Results table
  const body = $('results-body');
  body.textContent = '';
  for (const t of targets) {
    const tr = document.createElement('tr');
    const cells = [
      String(t.index),
      t.file,
      `${t.width} × ${t.height}`,
      String(t.features.total),
      `${Math.round(t.features.gridCoverage * 100)}%`,
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    const tdR = document.createElement('td');
    const span = document.createElement('span');
    span.className = `rating rating-${t.quality.rating}`;
    span.textContent = t.quality.rating.charAt(0).toUpperCase() + t.quality.rating.slice(1);
    tdR.appendChild(span);
    tr.appendChild(tdR);
    body.appendChild(tr);
  }

  const notes = $('quality-notes');
  notes.textContent = '';
  for (const t of targets) {
    for (const n of t.quality.notes) {
      const li = document.createElement('li');
      li.textContent = `${t.file}: ${n}`;
      notes.appendChild(li);
    }
  }

  $('file-facts').textContent =
    `targets.mind is ${(mindBytes.length / 1024).toFixed(0)} KB and contains ${decoded.length} targets (verified by reading it back). ` +
    `Compile time ${(state.elapsedMs / 1000).toFixed(1)} s.`;

  $('results').hidden = false;
  setProgress(100, 'Done');
  setStatus($('build-status'), 'ok',
    'Database built and verified. Download both files below and put them in the project root (see "Where the files go").');
  state.building = false;
  updateBuildEnabled();
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- boot ----------
$('build-btn').addEventListener('click', build);
await Promise.all([loadCompiler(), loadImages()]);
updateBuildEnabled();
