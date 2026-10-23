import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';

const GAME_GOAL = 5;
const PUMPKIN_DIAMETER = 0.34;
const SMASH_DURATION = 620;
const $ = (id) => document.getElementById(id);

const ui = {
  container: $('ar-container'),
  startScreen: $('start-screen'),
  setupStatus: $('setup-status'),
  startError: $('start-error'),
  start: $('start-button'),
  hud: $('hud'),
  hint: $('hint'),
  score: $('score'),
  progress: $('progress-bar'),
  remaining: $('remaining'),
  endScreen: $('end-screen'),
  finalScore: $('final-score')
};

let manifest;
let mindar;
let scene;
let camera;
let renderer;
let records = [];
let activeRecord = null;
let score = 0;
let running = false;
let starting = false;
let smashing = false;
let smashStartedAt = 0;
let pointerStart = null;
let pointerId = null;
let lastFrame = 0;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const particles = [];

function setHint(message) {
  ui.hint.textContent = message;
}

function updateScore() {
  ui.score.textContent = `${score} / ${GAME_GOAL}`;
  ui.progress.style.width = `${(score / GAME_GOAL) * 100}%`;
  ui.remaining.textContent = `${GAME_GOAL - score} ${GAME_GOAL - score === 1 ? 'PUMPKIN' : 'PUMPKINS'} LEFT`;
}

function showError(message) {
  ui.startError.textContent = message;
  ui.startError.hidden = false;
}

function classifyStartError(error) {
  const name = error?.name || '';
  if (error?.message?.includes('targets.mind')) {
    return 'The image target database is missing. Build targets.mind in target-builder.html, then reload the game.';
  }
  if (!window.isSecureContext) {
    return 'Camera access requires HTTPS. Open the published GitHub Pages site, or use localhost while developing.';
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'This browser does not support camera access. Try a recent version of Chrome on Android or Safari on iOS.';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Camera permission was denied. Allow camera access for this site in your browser settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The camera could not start. Close other apps using it and try again.';
  }
  if (name === 'AbortError' || name === 'OverconstrainedError') {
    return 'The rear-facing camera could not initialize with this device. Close other camera apps and retry.';
  }
  return `The image tracker or target database could not initialize (${error?.message || 'unknown error'}). Rebuild the database in target-builder.html and reload the page.`;
}

async function checkSetup() {
  try {
    const response = await fetch('./target-manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`target-manifest.json returned HTTP ${response.status}`);
    const data = await response.json();
    const imageResponse = await fetch('./images/manifest.json', { cache: 'no-store' });
    if (!imageResponse.ok) throw new Error(`images/manifest.json returned HTTP ${imageResponse.status}`);
    const imageData = await imageResponse.json();
    if (
      !Array.isArray(imageData.images) ||
      imageData.images.length < GAME_GOAL ||
      imageData.images.some((filename) => typeof filename !== 'string') ||
      new Set(imageData.images.map((filename) => filename.toLowerCase())).size !== imageData.images.length
    ) {
      throw new Error(`images/manifest.json must contain at least ${GAME_GOAL} unique image filenames.`);
    }
    if (
      data.version !== 1 ||
      !Array.isArray(data.targets) ||
      data.targets.length < GAME_GOAL ||
      data.targets.length !== imageData.images.length ||
      data.targetCount !== data.targets.length ||
      data.targets.some((target, index) => !target || target.index !== index || target.filename !== imageData.images[index])
    ) {
      throw new Error('The target database does not match the ordered image list in images/manifest.json. Rebuild it in target-builder.html.');
    }
    manifest = data;
    const targetResponse = await fetch('./targets.mind', { method: 'HEAD', cache: 'no-store' });
    if (!targetResponse.ok || targetResponse.headers.get('content-length') === '0') {
      ui.setupStatus.textContent = 'The photos are configured, but targets.mind is missing or empty. Use the image database builder below.';
      return;
    }
    ui.setupStatus.textContent = `${data.targets.length} image targets are ready. Smash any ${GAME_GOAL} unique pumpkins to win.`;
    ui.start.disabled = false;
  } catch (error) {
    console.error('Could not validate the image target setup:', error);
    ui.setupStatus.textContent = 'The image target manifest is missing or invalid. Open the builder to rebuild it from images/manifest.json.';
  }
}

function createPolygon(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function createPumpkin() {
  const group = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xf47b18, roughness: 0.78 });
  const orangeLight = new THREE.MeshStandardMaterial({ color: 0xffa02b, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x321620, roughness: 1 });
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x49743a, roughness: 0.9 });

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 16), orange);
  core.scale.set(0.82, 0.91, 0.68);
  group.add(core);
  for (let index = -3; index <= 3; index += 1) {
    const lobe = new THREE.Mesh(
      new THREE.SphereGeometry(0.064, 14, 12),
      index % 2 === 0 ? orangeLight : orange
    );
    const normalized = index / 3.5;
    lobe.position.set(index * 0.035, 0, 0.07 * Math.sqrt(1 - normalized * normalized));
    lobe.scale.set(0.75, 1.85, 0.67);
    group.add(lobe);
  }

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.028, 0.075, 8), stemMaterial);
  stem.position.set(0, 0.15, 0);
  stem.rotation.z = -0.14;
  group.add(stem);

  const eyeGeometry = createPolygon([[0, 0.024], [-0.025, -0.018], [0.025, -0.018]]);
  for (const x of [-0.052, 0.052]) {
    const eye = new THREE.Mesh(eyeGeometry, dark);
    eye.position.set(x, 0.028, 0.115);
    group.add(eye);
  }
  const mouthGeometry = createPolygon([
    [-0.066, -0.035], [-0.042, -0.058], [-0.02, -0.043], [0, -0.064],
    [0.02, -0.043], [0.042, -0.058], [0.066, -0.035], [0.05, -0.086],
    [0, -0.102], [-0.05, -0.086]
  ]);
  const mouth = new THREE.Mesh(mouthGeometry, dark);
  mouth.position.z = 0.117;
  group.add(mouth);

  const hitArea = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 12, 10),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false })
  );
  hitArea.position.z = 0.015;
  group.add(hitArea);
  group.userData.hitArea = hitArea;
  group.userData.baseScale = new THREE.Vector3();
  return group;
}

function createTargetRecord(target, index) {
  const anchor = mindar.addAnchor(index);
  const record = {
    target,
    index,
    anchor,
    pumpkin: null,
    targetFoundNow: false,
    smashed: false
  };
  anchor.onTargetFound = () => onTargetFound(record);
  anchor.onTargetLost = () => onTargetLost(record);
  return record;
}

function spawnPumpkin(record) {
  if (activeRecord || score >= GAME_GOAL || !record.targetFoundNow) return;
  const pumpkin = createPumpkin();
  const imageShortSide = Math.min(1, record.target.aspectRatio || 1);
  const scale = imageShortSide * 0.25 / PUMPKIN_DIAMETER;
  pumpkin.position.set(0, 0, 0.015 * scale);
  pumpkin.scale.setScalar(scale);
  pumpkin.userData.baseScale.setScalar(scale);
  record.anchor.group.add(pumpkin);
  record.pumpkin = pumpkin;
  activeRecord = record;
  setHint(`Found ${record.target.filename}. Tap its pumpkin to score; this photo can only be smashed once.`);
}

function spawnOnFirstVisibleTarget() {
  if (activeRecord || smashing || score >= GAME_GOAL) return;
  const next = records.find((record) => record.targetFoundNow && !record.smashed);
  if (next) spawnPumpkin(next);
  else setHint('Scan for a different reference photo. Each photo can only be smashed once.');
}

function onTargetFound(record) {
  record.targetFoundNow = true;
  if (activeRecord === record && record.pumpkin && !record.smashed) {
    record.pumpkin.visible = true;
    setHint(`Tracking ${record.target.filename}. Tap the pumpkin to smash it.`);
    return;
  }
  spawnOnFirstVisibleTarget();
}

function disposePumpkin(record) {
  if (!record.pumpkin) return;
  record.anchor.group.remove(record.pumpkin);
  record.pumpkin.traverse((object) => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  });
  record.pumpkin = null;
}

function onTargetLost(record) {
  record.targetFoundNow = false;
  if (activeRecord === record && !smashing) {
    disposePumpkin(record);
    activeRecord = null;
  }
  if (!smashing && score < GAME_GOAL) {
    setHint('Pumpkin Lost!');
  }
}

function addSmashParticles(record) {
  const colors = [0xff7a1a, 0xffca51, 0x70a851, 0xf4e1c4];
  const origin = record.pumpkin.position;
  for (let index = 0; index < 14; index += 1) {
    const material = new THREE.MeshBasicMaterial({ color: colors[index % colors.length] });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), material);
    mesh.position.copy(origin);
    record.anchor.group.add(mesh);
    particles.push({
      mesh,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.8, Math.random() * 0.35),
      age: 0
    });
  }
}

function smashPumpkin() {
  if (!running || smashing || !activeRecord?.pumpkin || !activeRecord.targetFoundNow) return;
  smashing = true;
  smashStartedAt = performance.now();
  addSmashParticles(activeRecord);
  score += 1;
  updateScore();
  if (score === GAME_GOAL) {
    ui.finalScore.textContent = `${score} pumpkins smashed.`;
  }
  setHint(score >= GAME_GOAL ? 'All five unique pumpkins smashed!' : 'SMASH! Find a different reference photo!');
}

async function finishSmash() {
  const record = activeRecord;
  if (record) {
    record.smashed = true;
    disposePumpkin(record);
  }
  for (const particle of particles) {
    particle.mesh.parent?.remove(particle.mesh);
    particle.mesh.geometry.dispose();
    particle.mesh.material.dispose();
  }
  particles.length = 0;
  activeRecord = null;
  smashing = false;
  if (score >= GAME_GOAL) {
    ui.hud.classList.add('hidden');
    try {
      await stopRuntime();
    } catch (error) {
      console.error('Could not fully stop the camera and image scanner after the round:', error);
    }
    ui.endScreen.classList.remove('hidden');
    return;
  }
  spawnOnFirstVisibleTarget();
}

function updateFrame(time) {
  if (!running || !scene || !camera || !renderer) return;
  const delta = Math.min(0.05, Math.max(0, (time - lastFrame) / 1000));
  lastFrame = time;

  if (activeRecord?.pumpkin && !smashing) {
    activeRecord.pumpkin.position.y = Math.sin(time * 0.003) * 0.012;
    activeRecord.pumpkin.rotation.z = Math.sin(time * 0.0015) * 0.04;
  }
  if (smashing && activeRecord?.pumpkin) {
    const progress = Math.min(1, (time - smashStartedAt) / SMASH_DURATION);
    const squash = progress < 0.3 ? 1 - progress * 1.25 : Math.max(0, (1 - progress) / 0.625);
    const scale = activeRecord.pumpkin.userData.baseScale;
    activeRecord.pumpkin.scale.set(scale.x * Math.max(0.01, squash), scale.y * Math.max(0.01, squash * 0.7), scale.z);
    if (progress >= 1) void finishSmash();
  }
  for (const particle of particles) {
    particle.age += delta;
    particle.mesh.position.addScaledVector(particle.velocity, delta);
    particle.velocity.y -= delta * 0.9;
    particle.mesh.scale.setScalar(Math.max(0, 1 - particle.age * 1.6));
  }
  renderer.render(scene, camera);
}

function onPointerDown(event) {
  if (!running || event.button !== 0 || !event.isPrimary) return;
  pointerStart = { x: event.clientX, y: event.clientY };
  pointerId = event.pointerId;
  renderer?.domElement.setPointerCapture(event.pointerId);
}

function onPointerUp(event) {
  if (!pointerStart || event.pointerId !== pointerId || !renderer || !camera || !scene) return;
  const start = pointerStart;
  pointerStart = null;
  pointerId = null;
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 20) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  scene.updateMatrixWorld(true);
  raycaster.setFromCamera(pointer, camera);
  if (!activeRecord?.targetFoundNow || !activeRecord.pumpkin || smashing) return;
  const hit = raycaster.intersectObject(activeRecord.pumpkin.userData.hitArea, false)[0];
  if (hit) smashPumpkin();
}

function onPointerCancel(event) {
  if (event.pointerId !== pointerId) return;
  pointerStart = null;
  pointerId = null;
}

async function stopRuntime() {
  running = false;
  renderer?.setAnimationLoop(null);
  if (renderer?.domElement) {
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
  }
  if (mindar) {
    const current = mindar;
    mindar = null;
    current.ui?.hideScanning();
    current.ui?.hideLoading();
    try {
      await current.stop();
    } finally {
      const video = ui.container.querySelector('video');
      video?.srcObject?.getTracks().forEach((track) => track.stop());
      current.renderer?.dispose();
      ui.container.replaceChildren();
    }
  }
  scene = null;
  camera = null;
  renderer = null;
  records = [];
  activeRecord = null;
  smashing = false;
  pointerStart = null;
  pointerId = null;
  particles.length = 0;
}

async function startGame() {
  if (starting || running || !manifest) return;
  starting = true;
  ui.start.disabled = true;
  ui.start.textContent = 'STARTING CAMERA…';
  ui.startError.hidden = true;
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access requires a supported browser on HTTPS or localhost.');
    }
    const targetResponse = await fetch('./targets.mind', { method: 'HEAD', cache: 'no-store' });
    if (!targetResponse.ok) throw new Error('The target database targets.mind is missing. Build it using target-builder.html.');

    mindar = new MindARThree({
      container: ui.container,
      imageTargetSrc: './targets.mind',
      shouldFaceUser: false,
      maxTrack: 1,
      filterMinCF: 0.0001,
      filterBeta: 1000,
      warmupTolerance: 4,
      missTolerance: 6
    });
    ({ scene, camera, renderer } = mindar);
    mindar.cssRenderer.domElement.style.pointerEvents = 'none';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x130d1b, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x432b3f, 1.6));
    const keyLight = new THREE.DirectionalLight(0xffd7a5, 1.7);
    keyLight.position.set(-1, 1.8, 2);
    scene.add(keyLight);

    records = manifest.targets.map((target, index) => createTargetRecord(target, index));
    await mindar.start();
    running = true;
    score = 0;
    updateScore();
    ui.startScreen.classList.add('hidden');
    ui.endScreen.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    setHint('Find any five unique photos. Each pumpkin can only be smashed once.');
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerCancel);
    renderer.setAnimationLoop(updateFrame);
  } catch (error) {
    console.error('Pumpkin Smash! failed to initialize camera or image tracking:', error);
    showError(classifyStartError(error));
    ui.setupStatus.textContent = error?.message?.includes('targets.mind')
      ? 'The image database is missing. Build it with the image database builder.'
      : 'Camera / tracker startup failed. Review the message below and retry.';
    try {
      await stopRuntime();
    } catch (cleanupError) {
      console.error('Could not fully clean up the failed camera / tracker startup:', cleanupError);
    }
  } finally {
    starting = false;
    ui.start.textContent = 'START GAME';
    ui.start.disabled = !manifest;
  }
}

function resetRound() {
  score = 0;
  updateScore();
  ui.endScreen.classList.add('hidden');
  ui.startScreen.classList.remove('hidden');
  ui.startError.hidden = true;
  void startGame();
}

ui.start.addEventListener('click', startGame);
ui.exitButton = $('exit-button');
async function returnToStart() {
  try {
    await stopRuntime();
  } catch (error) {
    console.error('Could not fully stop the camera / tracker:', error);
    showError('The camera may still be active. Reload the page if the camera indicator remains on.');
  }
  ui.hud.classList.add('hidden');
  ui.endScreen.classList.add('hidden');
  ui.startScreen.classList.remove('hidden');
}
ui.exitButton.addEventListener('click', returnToStart);
$('again-button').addEventListener('click', resetRound);
$('title-button').addEventListener('click', returnToStart);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden' || !running) return;
  stopRuntime().then(() => {
    ui.hud.classList.add('hidden');
    ui.startScreen.classList.remove('hidden');
    showError('The camera was stopped when you left the page. Press Start Game to reconnect.');
  }).catch((error) => console.error('Could not stop the camera after leaving the page:', error));
});

window.addEventListener('pagehide', () => {
  ui.container.querySelector('video')?.srcObject?.getTracks().forEach((track) => track.stop());
});

checkSetup();
