// Pumpkin Smash! game logic: UI, state machine, input, errors.
// This file deliberately has no static imports except config.js. The heavy libraries are loaded with a
// dynamic import() inside try/catch, so a library that fails to download is reported to the player
// as a "dependency" problem instead of leaving a blank page.

import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const els = {
  stage: $('stage'), video: $('cam'), hud: $('hud'), banner: $('banner'), toast: $('toast'), debug: $('debug'),
  score: $('score-text'), scoreChip: $('chip-score'), camChip: $('chip-camera'), trackChip: $('chip-tracking'),
  btnExit: $('btn-exit'), btnSound: $('btn-sound'),
  screens: { start: $('screen-start'), loading: $('screen-loading'), error: $('screen-error'), end: $('screen-end') },
  loadingText: $('loading-text'),
  errorTitle: $('error-title'), errorText: $('error-text'), errorDetail: $('error-detail'), errorLink: $('error-link'),
  endScore: $('end-score'), endTime: $('end-time'),
};

const QUERY = new URLSearchParams(location.search);
const DEBUG = QUERY.has('debug');
// Test-only override, honoured only together with ?debug=1: e.g. ?debug=1&maxTrack=2
if (DEBUG && Number(QUERY.get('maxTrack')) > 0) CONFIG.maxTrack = Number(QUERY.get('maxTrack'));

// ---------------------------------------------------------------- state
const S = {
  state: 'start',        // start | loading | scanning | playing | smashing | between | ended | error
  score: 0,
  engineModule: null,
  engine: null,
  starting: false,
  suspended: false,
  recovering: false,
  visible: new Set(),    // target indexes currently tracked
  active: -1,            // target index hosting the current pumpkin
  lastHost: -1,          // target index that hosted the previous pumpkin
  lostRecently: false,
  lostIndex: -1,
  hintUntil: 0,
  respawnTimer: 0,
  lostTimer: 0,
  toastTimer: 0,
  runId: 0,              // bumped whenever the session is torn down; stale async callbacks check it
  startedAt: 0,
  retryAction: null,
};

const coded = (code, message, cause) => { const e = new Error(message); e.code = code; if (cause) e.cause = cause; return e; };

// ---------------------------------------------------------------- UI helpers
function showScreen(name) {
  for (const [k, el] of Object.entries(els.screens)) el.hidden = k !== name;
  const first = name && els.screens[name] && els.screens[name].querySelector('button, a[href]');
  if (first) first.focus({ preventScroll: true });
}

function setLoading(text) { els.loadingText.textContent = text; }

function setBanner(text, kind) {
  if (!text) { els.banner.hidden = true; return; }
  els.banner.textContent = text;
  els.banner.dataset.kind = kind || 'info';
  els.banner.hidden = false;
}

function setChip(el, state, text) { el.dataset.state = state; el.textContent = text; }
function setCamChip(state) {
  const label = { off: 'Camera: off', starting: 'Camera: starting…', on: 'Camera: on', paused: 'Camera: paused', error: 'Camera: problem' }[state];
  setChip(els.camChip, state, label);
}
function setTrackChip(state, i) {
  const text = {
    idle: 'Tracking: idle',
    searching: 'Searching for a reference image…',
    tracking: `Tracking: image ${i + 1}`,
    lost: `Lost image ${i + 1}`,
  }[state];
  setChip(els.trackChip, state, text);
}

function updateScore() {
  const txt = `${S.score} / ${CONFIG.smashesToWin}`;
  els.score.textContent = txt;
  els.scoreChip.setAttribute('aria-label', `Score ${S.score} of ${CONFIG.smashesToWin}`);
}

function targetCount() {
  return (S.engine && S.engine.targets && S.engine.targets.manifest.targets.length) || 3;
}

function refreshBanner() {
  if (S.suspended) { setBanner('Resuming camera…', 'warn'); return; }
  const now = performance.now();
  switch (S.state) {
    case 'scanning':
      if (S.visible.size === 0) {
        if (S.lostRecently) setBanner('Lost the image. Move the camera back to it, or find another reference photo.', 'lost');
        else setBanner(`Slowly point your camera at one of the ${targetCount()} reference photos.`, 'info');
      } else setBanner(null);
      break;
    case 'playing':
      if (now < S.hintUntil) setBanner('Tap the pumpkin to smash it!', 'info');
      else setBanner(null);
      break;
    default:
      setBanner(null);
  }
}

function showToast(text) {
  clearTimeout(S.toastTimer);
  els.toast.textContent = text;
  els.toast.classList.remove('show');
  void els.toast.offsetWidth; // restart the CSS animation
  els.toast.classList.add('show');
  S.toastTimer = setTimeout(() => els.toast.classList.remove('show'), 900);
}

// ---------------------------------------------------------------- sound (synthesised, no files)
const audio = { ctx: null, on: CONFIG.soundDefaultOn };
try {
  const saved = localStorage.getItem('pumpkin-smash-sound');
  if (saved !== null) audio.on = saved === '1';
} catch (_) { /* storage may be blocked; default is fine */ }

function applySoundButton() {
  els.btnSound.setAttribute('aria-pressed', String(audio.on));
  els.btnSound.setAttribute('aria-label', audio.on ? 'Sound on' : 'Sound off');
  els.btnSound.textContent = audio.on ? '\u{1F50A}' : '\u{1F507}';
}

function unlockAudio() {
  try {
    if (!audio.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audio.ctx = new AC();
    }
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  } catch (err) {
    console.warn('[pumpkin] audio unavailable (game continues without sound)', err);
  }
}

// iOS only reports the motion sensors after the player allows it, and only asks from inside a tap. The bats and ghosts
// use the sensors to stay put in the room as the phone turns; without them they stay in one fixed arrangement.
function requestMotionPermission() {
  const DOE = window.DeviceOrientationEvent;
  if (!DOE || typeof DOE.requestPermission !== 'function') return; // Android / desktop: no permission step
  DOE.requestPermission().catch((err) => console.warn('[pumpkin] motion sensors unavailable (creatures stay fixed)', err));
}

function playSmash() {
  if (!audio.on || !audio.ctx) return;
  try {
    const ctx = audio.ctx;
    const t0 = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.22);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const ng = ctx.createGain();
    ng.gain.value = 0.55;
    noise.connect(lp).connect(ng).connect(ctx.destination);
    noise.start(t0);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.7, t0);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
    osc.connect(og).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.25);
  } catch (err) {
    console.warn('[pumpkin] could not play sound', err);
  }
}

// ---------------------------------------------------------------- errors
const ERRORS = {
  DEPENDENCY: {
    title: 'The game files did not load',
    text: 'The tracking or graphics library could not be downloaded. Check your connection and try again.',
    reload: true,
  },
  CAMERA_DENIED: {
    title: 'Camera access is blocked',
    text: 'Pumpkin Smash! needs your camera to find the reference photos. Allow camera access for this site in your browser or site settings, then tap Try Again.',
  },
  CAMERA_UNAVAILABLE: {
    title: 'No usable camera',
    text: null, // uses the specific message from the engine (HTTPS needed / unsupported browser / no camera)
  },
  CAMERA_INIT: {
    title: 'The camera would not start',
    text: 'Another app or browser tab may be using the camera. Close it and tap Try Again.',
  },
  TARGETS_MISSING: {
    title: 'Image database not found',
    text: 'targets.mind or target-manifest.json is missing from the site. They are produced by the Target Builder and belong next to index.html.',
    link: { href: 'target-builder.html', label: 'Open the Target Builder' },
  },
  TARGETS_INVALID: {
    title: 'Image database is not usable',
    text: null,
    link: { href: 'target-builder.html', label: 'Open the Target Builder to rebuild it' },
  },
  TRACKER_INIT: {
    title: 'Image tracking could not start',
    text: 'The tracker failed to start on this device. It needs WebGL and Web Workers. Try another browser (recent Chrome on Android or Safari on iOS) and tap Try Again.',
  },
  GRAPHICS: {
    title: 'Graphics problem',
    text: 'This device or browser could not provide WebGL, which is needed to draw the pumpkin. Try another browser and tap Try Again.',
  },
  UNKNOWN: {
    title: 'Something went wrong',
    text: 'An unexpected error stopped the game. Tap Try Again. If it keeps happening, reload the page.',
  },
};

async function failSession(err) {
  const code = err && ERRORS[err.code] ? err.code : 'UNKNOWN';
  console.error(`[pumpkin] ${code}:`, err && err.message, err && err.cause ? err.cause : err);
  S.runId++;
  clearTimeout(S.respawnTimer);
  S.state = 'error';
  S.suspended = false;
  S.visible.clear();
  S.active = -1;
  if (S.engine) { try { S.engine.shutdown(); } catch (e) { console.warn('[pumpkin] shutdown after error', e); } S.engine = null; }

  const def = ERRORS[code];
  els.errorTitle.textContent = def.title;
  els.errorText.textContent = def.text || (err && err.message) || ERRORS.UNKNOWN.text;
  els.errorDetail.textContent = `Code: ${code}${err && err.message && def.text ? ` · ${err.message}` : ''}`;
  if (def.link) {
    els.errorLink.textContent = '';
    const a = document.createElement('a');
    a.href = def.link.href;
    a.textContent = def.link.label;
    els.errorLink.appendChild(a);
    els.errorLink.hidden = false;
  } else {
    els.errorLink.hidden = true;
  }
  S.retryAction = def.reload ? () => location.reload() : beginSession;

  els.hud.hidden = true;
  setBanner(null);
  setCamChip(code.startsWith('CAMERA') ? 'error' : 'off');
  setTrackChip('idle');
  showScreen('error');
}

// ---------------------------------------------------------------- engine events
const events = {
  onTargetFound(i) {
    S.visible.add(i);
    S.lostRecently = false;
    clearTimeout(S.lostTimer);
    setTrackChip('tracking', i);
    if (S.state === 'scanning') trySpawn();
    refreshBanner();
  },
  onTargetLost(i) {
    S.visible.delete(i);
    if (S.state === 'ended' || S.state === 'start' || S.state === 'error') return;
    if (S.visible.size === 0) {
      S.lostRecently = true;
      S.lostIndex = i;
      setTrackChip('lost', i);
      clearTimeout(S.lostTimer);
      S.lostTimer = setTimeout(() => { if (S.visible.size === 0) setTrackChip('searching'); }, 1500);
    }
    if (S.active === i && S.state === 'playing') {
      // The image genuinely left view: remove the pumpkin until a target is tracked again.
      S.engine.hidePumpkin();
      S.active = -1;
      S.state = 'scanning';
      if (S.visible.size) trySpawn();
    }
    refreshBanner();
  },
  onCameraEnded() { recoverCamera(); },
  onFatal(err) { failSession(err); },
  onFrame() {
    if (S.engine) S.engine.setAmbientMode(ambientMode());
    if (DEBUG) updateDebug();
  },
};

// Bats circle overhead while the player is searching for a photo; only the ghosts stay out while a pumpkin is up.
function ambientMode() {
  if (S.suspended) return 'off';
  if (S.state === 'scanning') return 'scanning';
  if (S.state === 'playing' || S.state === 'smashing' || S.state === 'between') return 'playing';
  return 'off';
}

// Deterministic choice when several targets are visible: the first visible index after the previous host
// (cyclic order). With nothing hosted yet that is simply the lowest visible index.
function pickTarget() {
  const n = S.engine.anchors.length;
  let best = -1;
  let bestRank = Infinity;
  for (const i of S.visible) {
    const rank = (((i - S.lastHost - 1) % n) + n) % n;
    if (rank < bestRank) { bestRank = rank; best = i; }
  }
  return best;
}

function trySpawn() {
  if (S.state !== 'scanning' || !S.engine || S.visible.size === 0) return;
  const idx = pickTarget();
  if (idx < 0 || !S.engine.placePumpkin(idx)) return;
  S.active = idx;
  S.state = 'playing';
  S.hintUntil = performance.now() + (S.score === 0 ? 4500 : 1800);
  refreshBanner();
  setTimeout(refreshBanner, S.hintUntil - performance.now() + 20);
}

// ---------------------------------------------------------------- input
let pointer = null;
els.stage.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary) return;
  pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
});
els.stage.addEventListener('pointercancel', () => { pointer = null; });
els.stage.addEventListener('pointerup', (e) => {
  if (!pointer || e.pointerId !== pointer.id) return;
  const p = pointer;
  pointer = null;
  const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
  if (moved > CONFIG.tapMaxMovePx || performance.now() - p.t > CONFIG.tapMaxDurationMs) return; // a drag, not a tap
  handleTap(e.clientX, e.clientY);
});

function handleTap(x, y) {
  if (S.state !== 'playing' || S.suspended || !S.engine) return;
  if (S.engine.isMovingFast()) {
    setBanner('Hold the camera steady, then tap the pumpkin.', 'warn');
    setTimeout(refreshBanner, 1200);
    return;
  }
  if (!S.engine.hitTest(x, y)) return; // empty space: nothing happens

  // From here on this smash is committed. The state change is synchronous, so one tap can never score twice.
  S.state = 'smashing';
  S.score += 1;
  updateScore();
  playSmash();
  showToast(S.score >= CONFIG.smashesToWin ? 'LAST ONE! \u{1F383}' : `SMASH! ${S.score}/${CONFIG.smashesToWin}`);
  S.lastHost = S.active;
  S.active = -1;
  refreshBanner();

  const run = S.runId;
  S.engine.smash().then(() => {
    if (run !== S.runId || S.state !== 'smashing') return;
    S.engine.hidePumpkin();
    if (S.score >= CONFIG.smashesToWin) { finish(); return; }
    S.state = 'between';
    S.respawnTimer = setTimeout(() => {
      if (run !== S.runId || S.state !== 'between') return;
      S.state = 'scanning';
      trySpawn();
      refreshBanner();
    }, CONFIG.respawnDelayMs);
  });
}

// ---------------------------------------------------------------- session flow
function enterGame() {
  S.score = 0;
  S.lastHost = -1;
  S.active = -1;
  S.lostRecently = false;
  S.startedAt = performance.now();
  S.state = 'scanning';
  updateScore();
  els.hud.hidden = false;
  showScreen(null);
  setCamChip('on');
  setTrackChip('searching');

  // The tracker may have reported targets while we were still loading.
  S.visible.clear();
  S.engine.anchors.forEach((a, i) => { if (a.tracked) S.visible.add(i); });
  if (S.visible.size) setTrackChip('tracking', [...S.visible][0]);
  trySpawn();
  refreshBanner();
}

async function beginSession() {
  if (S.starting) return; // prevents duplicate camera/tracker initialisation from double taps
  S.starting = true;
  const run = ++S.runId;
  S.state = 'loading';
  S.suspended = false;
  els.hud.hidden = true;
  setBanner(null);
  setCamChip('off');
  setTrackChip('idle');
  showScreen('loading');
  unlockAudio(); // we are inside a user gesture here
  requestMotionPermission();

  try {
    setLoading('Loading the game engine…');
    if (!S.engineModule) {
      try {
        S.engineModule = await import('./engine.js');
      } catch (err) {
        throw coded('DEPENDENCY', 'engine.js or one of its libraries failed to load', err);
      }
    }
    if (run !== S.runId) return;
    if (!S.engine) S.engine = new S.engineModule.Engine({ stage: els.stage, video: els.video, config: CONFIG, events });

    setLoading('Checking the image database…');
    await S.engine.loadTargets();
    if (run !== S.runId) return;

    setLoading('Starting the camera… allow access if your browser asks.');
    setCamChip('starting');
    await S.engine.startCamera();
    if (run !== S.runId) return;

    setLoading('Warming up the image tracker…');
    await S.engine.startTracker();
    if (run !== S.runId) return;

    enterGame();
  } catch (err) {
    if (run === S.runId) await failSession(err);
  } finally {
    S.starting = false;
  }
}

function finish() {
  S.state = 'ended';
  clearTimeout(S.respawnTimer);
  const secs = Math.round((performance.now() - S.startedAt) / 1000);
  els.endScore.textContent = `${S.score} / ${CONFIG.smashesToWin}`;
  els.endTime.textContent = `You smashed ${S.score} pumpkins in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}.`;
  if (S.engine) S.engine.stopTracker(); // idle the tracker while the summary shows
  S.visible.clear();
  els.hud.hidden = true;
  setBanner(null);
  setTrackChip('idle');
  showScreen('end');
}

async function playAgain() {
  if (S.starting) return;
  if (!S.engine) { beginSession(); return; }
  S.starting = true;
  const run = ++S.runId;
  S.state = 'loading';
  showScreen('loading');
  setLoading('Restarting…');
  try {
    await S.engine.startCamera();   // no-op when the camera is still live
    await S.engine.startTracker();
    if (run !== S.runId) return;
    enterGame();
  } catch (err) {
    if (run === S.runId) await failSession(err);
  } finally {
    S.starting = false;
  }
}

function goHome() {
  S.runId++;
  clearTimeout(S.respawnTimer);
  clearTimeout(S.lostTimer);
  S.state = 'start';
  S.suspended = false;
  S.visible.clear();
  S.active = -1;
  if (S.engine) { S.engine.shutdown(); S.engine = null; } // stops camera tracks, tracker and render loop
  els.hud.hidden = true;
  setBanner(null);
  setCamChip('off');
  setTrackChip('idle');
  showScreen('start');
}

async function recoverCamera() {
  if (S.recovering || !S.engine || ['start', 'error', 'ended', 'loading'].includes(S.state)) return;
  S.recovering = true;
  const run = S.runId;
  setCamChip('starting');
  setBanner('The camera stopped. Restarting it…', 'warn');
  try {
    S.engine.stopTracker();
    await S.engine.startCamera();
    await S.engine.startTracker();
    if (run !== S.runId) return;
    setCamChip('on');
    refreshBanner();
  } catch (err) {
    if (run === S.runId) await failSession(err);
  } finally {
    S.recovering = false;
  }
}

// ---------------------------------------------------------------- page lifecycle
document.addEventListener('visibilitychange', async () => {
  const live = S.engine && ['scanning', 'playing', 'smashing', 'between', 'ended'].includes(S.state);
  if (!live) return;
  if (document.hidden) {
    // Release the camera while the page is in the background.
    S.suspended = true;
    S.engine.stopTracker();
    S.engine.stopCamera();
    setCamChip('paused');
  } else if (S.suspended) {
    const run = S.runId;
    setCamChip('starting');
    refreshBanner();
    try {
      await S.engine.startCamera();
      if (S.state !== 'ended') await S.engine.startTracker();
      if (run !== S.runId) return;
      S.suspended = false;
      setCamChip('on');
      refreshBanner();
    } catch (err) {
      if (run === S.runId) await failSession(err);
    }
  }
});

window.addEventListener('pagehide', () => { if (S.engine) S.engine.shutdown(); });

let resizeRaf = 0;
function onResize() {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => { if (S.engine) S.engine.resize(); });
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => { onResize(); setTimeout(onResize, 350); }); // iOS reports the new size late
if (window.ResizeObserver) new ResizeObserver(onResize).observe(els.stage);

// ---------------------------------------------------------------- buttons
$('btn-start').addEventListener('click', beginSession);
$('btn-retry').addEventListener('click', () => { if (S.retryAction) S.retryAction(); });
$('btn-error-home').addEventListener('click', goHome);
$('btn-again').addEventListener('click', playAgain);
$('btn-end-home').addEventListener('click', goHome);
els.btnExit.addEventListener('click', goHome);
els.btnSound.addEventListener('click', () => {
  audio.on = !audio.on;
  try { localStorage.setItem('pumpkin-smash-sound', audio.on ? '1' : '0'); } catch (_) { /* optional */ }
  applySoundButton();
  unlockAudio();
});

// ---------------------------------------------------------------- debug (?debug=1 only)
let lastDebug = 0;
function snapshot() {
  return {
    state: S.state, score: S.score, active: S.active, lastHost: S.lastHost,
    visible: [...S.visible], suspended: S.suspended,
    engine: S.engine ? S.engine.debugInfo() : null,
  };
}
function updateDebug() {
  const now = performance.now();
  if (now - lastDebug < 250) return;
  lastDebug = now;
  els.debug.textContent = JSON.stringify(snapshot(), null, 1);
}
if (DEBUG) {
  els.debug.hidden = false;
  window.__pumpkinDebug = { snapshot };
}

// ---------------------------------------------------------------- init
$('goal-text').textContent = String(CONFIG.smashesToWin);
applySoundButton();
updateScore();
setCamChip('off');
setTrackChip('idle');
showScreen('start');
window.__psBoot.ready = true;
