import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';

const $ = (id) => document.getElementById(id);
const ui = {
  container: $('ar-container'), startScreen: $('start-screen'), hud: $('hud'), win: $('win-screen'),
  note: $('target-config-note'), start: $('camera-start'), score: $('score'),
  remaining: $('remaining'), progress: $('progress-fill'), hint: $('hint-text'), toast: $('toast'),
  reset: $('reset-button'), cameraSwitch: $('camera-switch'), sound: $('sound-toggle'),
  playAgain: $('play-again'), backTitle: $('back-to-title')
};

const GOAL_CAP = 5;
let manifest = null;
let mindar = null;
let scene = null;
let camera = null;
let renderer = null;
let isRunning = false;
let soundOn = false;
let score = 0;
let spawnedCount = 0;
let goal = GOAL_CAP;
let records = [];
let activeParticles = [];
let toastTimer = null;
let audioContext = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const orange = 0xff7a20;

function setHint(message) { ui.hint.textContent = message; }
function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2600);
}
function playSound(frequency = 220, duration = 0.12, wave = 'sine') {
  if (!soundOn) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = wave;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(); osc.stop(audioContext.currentTime + duration);
  } catch (error) { console.debug('Sound not available', error); }
}

async function fileExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  } catch { return false; }
}

async function loadConfiguration() {
  try {
    const response = await fetch('./target-manifest.json?v=image-reference-v1', { cache: 'no-store' });
    if (!response.ok) throw new Error('target-manifest.json was not found');
    const data = await response.json();
    if (!Array.isArray(data.targets)) throw new Error('target-manifest.json has no targets array');
    manifest = data;
    const hasMindFile = await fileExists('./targets.mind');
    if (!data.targets.length || !hasMindFile) {
      ui.note.textContent = 'Reference images are not configured yet. Add images to images/, then use “Build / update reference images” to create targets.mind and target-manifest.json.';
      ui.start.disabled = true;
      return;
    }
    goal = Math.min(GOAL_CAP, data.targets.length);
    ui.note.textContent = `${data.targets.length} reference image(s) ready. You need to find ${goal} distinct images. A pumpkin appears attached to each image as the camera tracks it.`;
    ui.start.disabled = false;
  } catch (error) {
    console.warn(error);
    ui.note.textContent = 'Reference image database is missing or invalid. Use “Build / update reference images” to create it.';
    ui.start.disabled = true;
  }
}

function addShapeMesh(shape, material, z = 0.14) {
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.position.z = z;
  return mesh;
}
function polygon(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y));
  shape.closePath();
  return shape;
}

function createPumpkin() {
  const group = new THREE.Group();
  const orangeMaterial = new THREE.MeshStandardMaterial({ color: orange, roughness: 0.82, metalness: 0.0 });
  const orangeLight = new THREE.MeshStandardMaterial({ color: 0xff9a3d, roughness: 0.78 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x24101a, roughness: 1 });
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x4b8d39, roughness: 0.85 });

  const center = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 16), orangeMaterial);
  center.scale.set(1, 0.83, 0.87);
  center.castShadow = true;
  group.add(center);
  for (let i = -2; i <= 2; i++) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.084, 16, 12), i % 2 ? orangeMaterial : orangeLight);
    lobe.scale.set(0.82, 1.22, 1.04);
    lobe.position.set(i * 0.048, -0.004, 0.036 + (2 - Math.abs(i)) * 0.007);
    group.add(lobe);
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.032, 0.09, 8), stemMaterial);
  stem.position.set(0.008, 0.135, -0.005);
  stem.rotation.z = -0.18;
  group.add(stem);
  const leafShape = polygon([[0,0],[0.08,0.025],[0.13,0.065],[0.06,0.055],[-0.005,0.025]]);
  const leaf = addShapeMesh(leafShape, stemMaterial, 0.02);
  leaf.position.set(0.012, 0.155, 0.005);
  group.add(leaf);

  const eyeLeft = addShapeMesh(polygon([[-0.094,0.035],[-0.047,0.082],[-0.039,0.014]]), darkMaterial, 0.142);
  const eyeRight = addShapeMesh(polygon([[0.094,0.035],[0.047,0.082],[0.039,0.014]]), darkMaterial, 0.142);
  group.add(eyeLeft, eyeRight);
  const mouth = addShapeMesh(polygon([[-0.085,-0.038],[-0.05,-0.065],[-0.027,-0.047],[0,-0.073],[0.027,-0.047],[0.051,-0.065],[0.085,-0.037],[0.07,-0.09],[0,-0.115],[-0.07,-0.09]]), darkMaterial, 0.143);
  group.add(mouth);

  // A generous invisible hit volume makes the 3D pumpkin easy to tap on a phone.
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 14, 10),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
  );
  hit.position.z = 0.025;
  group.add(hit);
  group.userData.hitMesh = hit;
  group.userData.animateBaseY = 0;
  return group;
}

function createBat(scale = 1) {
  const g = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x241932, roughness: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.032 * scale, 10, 8), material);
  body.scale.set(1.3, 0.8, 0.6); g.add(body);
  const wingShapeL = polygon([[-0.02,0],[-0.11,0.06],[-0.09,0.015],[-0.14,-0.025],[-0.045,-0.018]]);
  const wingShapeR = polygon([[0.02,0],[0.11,0.06],[0.09,0.015],[0.14,-0.025],[0.045,-0.018]]);
  const wl = addShapeMesh(wingShapeL, material, 0); const wr = addShapeMesh(wingShapeR, material, 0);
  g.add(wl, wr); g.userData.wings = [wl, wr];
  g.userData.phase = Math.random() * Math.PI * 2;
  return g;
}
function createGhost() {
  const g = new THREE.Group();
  const ghostMat = new THREE.MeshStandardMaterial({ color: 0xf2ecff, roughness: 0.35, transparent: true, opacity: 0.88 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), ghostMat);
  body.scale.set(0.76, 1.15, 0.6); g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 5), ghostMat);
  tail.position.y = -0.07; tail.rotation.z = Math.PI; g.add(tail);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x282033 });
  [-0.023, 0.023].forEach(x => { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), eyeMat); eye.position.set(x, 0.012, 0.046); g.add(eye); });
  g.userData.phase = Math.random() * 6.28;
  return g;
}
function createSkeletonMini() {
  const g = new THREE.Group();
  const bone = new THREE.MeshStandardMaterial({ color: 0xe9dfc9, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x251a2a });
  const sphere = (r, pos, scale = [1,1,1], mat=bone) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat); m.position.set(...pos); m.scale.set(...scale); g.add(m); return m; };
  sphere(0.052,[0,0.18,0],[0.8,1,0.7]);
  sphere(0.014,[-0.02,0.19,0.038],[1,1,0.6],dark); sphere(0.014,[0.02,0.19,0.038],[1,1,0.6],dark);
  const segment = (a,b,r=0.012) => { const d = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)); const m = new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),6),bone); m.position.copy(new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); g.add(m); };
  segment([0,0.12,0],[0,0.04,0]);
  for (const s of [-1,1]) {
    sphere(0.026,[s*0.026,0.095,0],[1.1,1,0.65]);
    segment([s*0.025,0.08,0],[s*0.09,0.035,0]);
    segment([s*0.09,0.035,0],[s*0.11,0.075,0]);
    segment([s*0.012,0.025,0],[s*0.036,-0.055,0]);
    segment([s*0.036,-0.055,0],[s*0.04,-0.095,0]);
  }
  for (let i=0;i<3;i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.04-i*0.004,0.006,4,12,Math.PI),bone);
    rib.position.set(0,0.085-i*0.025,0); rib.rotation.x=Math.PI/2; g.add(rib);
  }
  g.userData.phase = Math.random()*Math.PI*2;
  return g;
}
function createZombieMini() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x709c5a, roughness: 1 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x484f3e, roughness: 1 });
  const eye = new THREE.MeshBasicMaterial({ color: 0xffd76c });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.035,0.08,3,7),shirt); torso.position.y=0.05; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.043,10,8),skin); head.position.y=0.13; g.add(head);
  for(const x of [-0.016,0.016]) { const e=new THREE.Mesh(new THREE.SphereGeometry(0.007,6,5),eye); e.position.set(x,0.135,0.038); g.add(e); }
  for (const s of [-1,1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.01,0.09,6),skin); arm.position.set(s*0.045,0.07,0); arm.rotation.z=s*-0.7; g.add(arm);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.012,0.07,6),skin); leg.position.set(s*0.018,-0.035,0); g.add(leg);
  }
  g.userData.phase=Math.random()*Math.PI*2;
  return g;
}

function buildTargetDecoration(record) {
  const anchorGroup = record.anchor.group;
  const h = Math.max(0.35, Math.min(1.8, record.meta.aspectRatio || 0.75));
  const group = new THREE.Group();
  const pumpkin = createPumpkin();
  pumpkin.position.set(0, -h * 0.30, 0.16);
  pumpkin.scale.setScalar(Math.min(1, Math.max(0.62, h * 0.9)));
  pumpkin.userData.animateBaseY = pumpkin.position.y;
  group.add(pumpkin);
  record.pumpkin = pumpkin;
  record.pumpkinGroup = group;
  record.active = true;
  record.smashed = false;
  anchorGroup.add(group);

  // Decorative elements share the image's tracked 3D pose; no large AI model is needed.
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 18, 14), new THREE.MeshBasicMaterial({ color: 0xffe6a1 }));
  moon.position.set(0.27, h * 0.36, 0.04); group.add(moon);
  const moonGlow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffbd61, transparent: true, opacity: 0.13 }));
  moonGlow.position.copy(moon.position); group.add(moonGlow);
  const bat1 = createBat(0.85); bat1.position.set(-0.28, h*0.34, 0.06); group.add(bat1);
  const bat2 = createBat(0.63); bat2.position.set(0.10, h*0.44, 0.02); group.add(bat2);
  const ghost = createGhost(); ghost.position.set(-0.29, -h*0.04, 0.11); group.add(ghost);
  const zombie = createZombieMini(); zombie.position.set(0.25, -h*0.14, 0.09); zombie.scale.setScalar(0.78); group.add(zombie);
  const skeleton = createSkeletonMini(); skeleton.position.set(-0.19, -h*0.18, 0.09); skeleton.scale.setScalar(0.62); group.add(skeleton);
  record.animationObjects = { pumpkin, bat1, bat2, ghost, zombie, skeleton };
  record.decorationGroup = group;
  return group;
}

function updateHud() {
  const smashed = Math.min(score, goal);
  ui.score.innerHTML = `${smashed} <i>/ ${goal}</i>`;
  ui.remaining.textContent = `${Math.max(0, goal - smashed)} LEFT`;
  ui.progress.style.width = `${goal ? (smashed / goal) * 100 : 0}%`;
}
function startWin() {
  if (score < goal) return;
  ui.win.classList.remove('hidden');
  playSound(620, 0.22, 'triangle');
  setTimeout(() => playSound(790, 0.28, 'triangle'), 100);
}
function showFoundMessage(record) {
  setHint(`Found “${record.meta.filename}”! A pumpkin has appeared near the bottom of that image. Tap the pumpkin to smash it.`);
  showToast('Reference image recognized — pumpkin spawned!');
  playSound(440, 0.1, 'triangle');
}

function targetFound(record) {
  record.targetFoundNow = true;
  if (record.foundOnce) {
    if (record.pumpkin && !record.smashed) setHint(`Tracking “${record.meta.filename}”. Tap the pumpkin while this image is visible.`);
    return;
  }
  record.foundOnce = true;
  if (spawnedCount >= goal) {
    setHint('You have already found all the pumpkins for this round. Smash the ones you see!');
    return;
  }
  spawnedCount++;
  buildTargetDecoration(record);
  showFoundMessage(record);
}
function targetLost(record) {
  record.targetFoundNow = false;
  if (record.pumpkin && !record.smashed) {
    setHint(`Keep “${record.meta.filename}” in view to see its tracked pumpkin. The pumpkin is anchored to this reference image, not free-standing world mapping.`);
  }
}

function createSmashBurst(record) {
  if (!record.pumpkin) return;
  const base = record.pumpkin.position.clone();
  for (let i=0;i<13;i++) {
    const material = new THREE.MeshBasicMaterial({ color: [0xff8b2c,0xffbb4c,0x6aa74a,0xf4d8aa][i%4], transparent:true });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.015 + Math.random()*0.014, 7, 6), material);
    dot.position.copy(base);
    record.anchor.group.add(dot);
    activeParticles.push({ mesh:dot, velocity:new THREE.Vector3((Math.random()-.5)*0.65,Math.random()*0.65,Math.random()*0.35), life:0.7+Math.random()*0.3, age:0 });
  }
}

function smashRecord(record) {
  if (!record || !record.pumpkin || record.smashed || !record.targetFoundNow) return;
  record.smashed = true;
  record.active = false;
  record.pumpkin.visible = false;
  createSmashBurst(record);
  score++;
  updateHud();
  playSound(115, 0.15, 'sawtooth');
  setHint(`SMASH! ${Math.max(0,goal-score)} pumpkin(s) left. Scan for another reference image.`);
  showToast('PUMPKIN SMASHED! 🎃');
  if (score >= goal) startWin();
}

function onCanvasTap(event) {
  if (!isRunning || !renderer || !camera || ui.win.classList.contains('hidden') === false) return;
  if (event.button !== undefined && event.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  scene?.updateMatrixWorld(true);
  raycaster.setFromCamera(pointer, camera);
  const hitTargets = records.filter(r => r.targetFoundNow && r.pumpkin && !r.smashed).map(r => r.pumpkin.userData.hitMesh);
  if (!hitTargets.length) return;
  const intersections = raycaster.intersectObjects(hitTargets, false);
  if (intersections.length) {
    const hitObject = intersections[0].object;
    const record = records.find(r => r.pumpkin?.userData.hitMesh === hitObject);
    smashRecord(record);
  }
}

async function startImageAR() {
  if (!manifest || !manifest.targets?.length) {
    showToast('Build a reference image database first.');
    return;
  }
  if (!(await fileExists('./targets.mind'))) {
    ui.note.textContent = 'targets.mind is missing. Open Reference Image Builder, create the database, and upload it beside index.html.';
    return;
  }
  ui.start.disabled = true;
  ui.start.textContent = 'STARTING CAMERA…';
  try {
    mindar = new MindARThree({
      container: ui.container,
      imageTargetSrc: './targets.mind',
      maxTrack: 1,
      filterMinCF: 0.0001,
      filterBeta: 1000,
      warmupTolerance: 4,
      missTolerance: 6
    });
    ({ scene, camera, renderer } = mindar);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    // MindAR also creates a transparent CSS3D canvas; keep it from intercepting taps.
    if (mindar.cssRenderer?.domElement) mindar.cssRenderer.domElement.style.pointerEvents = 'none';
    renderer.setClearColor(0x100d18, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x4b334d, 2.0));
    const key = new THREE.DirectionalLight(0xffdfb0, 2.0);
    key.position.set(-1, 1.8, 2); scene.add(key);

    records = manifest.targets.map((meta, index) => {
      const anchor = mindar.addAnchor(index);
      const record = { meta, index, anchor, pumpkin: null, pumpkinGroup: null, foundOnce: false, targetFoundNow: false, smashed: false, active: false, animationObjects: null };
      anchor.onTargetFound = () => targetFound(record);
      anchor.onTargetLost = () => targetLost(record);
      return record;
    });

    await mindar.start();
    isRunning = true;
    ui.startScreen.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    ui.win.classList.add('hidden');
    ui.start.textContent = '◉ START IMAGE AR';
    ui.cameraSwitch.innerHTML = '↻ <span>CAMERA</span>';
    ui.start.disabled = false;
    ui.container.style.zIndex = '1';
    renderer.domElement.style.cursor = 'pointer';
    renderer.domElement.addEventListener('pointerdown', onCanvasTap, { passive:true });
    setHint(`Ready. Scan a reference image. ${goal} pumpkin(s) are hidden across your image targets.`);
    updateHud();
    renderer.setAnimationLoop((time) => {
      const t = (time || 0) * 0.001;
      for (const record of records) {
        const a = record.animationObjects;
        if (!a || record.smashed) continue;
        a.pumpkin.position.y = a.pumpkin.userData.animateBaseY + Math.sin(t*2.5 + record.index) * 0.008;
        for (const bat of [a.bat1, a.bat2]) {
          const phase = bat.userData.phase;
          bat.userData.wings[0].rotation.z = Math.sin(t*12 + phase) * 0.42;
          bat.userData.wings[1].rotation.z = -Math.sin(t*12 + phase) * 0.42;
          bat.position.y += Math.sin(t*2 + phase) * 0.0005;
        }
        a.ghost.position.y = -Math.max(0.35, Math.min(1.8, record.meta.aspectRatio || 0.75))*0.04 + Math.sin(t*1.6+a.ghost.userData.phase)*0.025;
        a.skeleton.rotation.z = Math.sin(t*3+a.skeleton.userData.phase)*0.10;
        a.zombie.rotation.z = Math.sin(t*1.8+a.zombie.userData.phase)*0.03;
      }
      for (let i=activeParticles.length-1;i>=0;i--) {
        const p = activeParticles[i]; p.age += 0.016;
        p.mesh.position.addScaledVector(p.velocity, 0.016); p.velocity.y -= 0.5*0.016;
        p.mesh.material.opacity = Math.max(0,1-p.age/p.life);
        p.mesh.scale.multiplyScalar(0.992);
        if (p.age >= p.life) { p.mesh.parent?.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); activeParticles.splice(i,1); }
      }
      renderer.render(scene, camera);
    });
  } catch (error) {
    console.error('Image AR failed to start:', error);
    ui.start.disabled = false;
    ui.start.textContent = '◉ START IMAGE AR';
    const message = error?.message || String(error);
    ui.note.textContent = `Camera / image AR could not start: ${message}. Try a current mobile browser, allow camera access, and check that WebGL works.`;
    showToast('Could not start camera. Check camera permission and reload.');
    if (mindar) { try { mindar.stop(); } catch {} }
    try { renderer?.dispose(); } catch {}
    ui.container.replaceChildren();
    mindar = null; scene = null; camera = null; renderer = null; isRunning = false;
  }
}

function resetRound() {
  score = 0; spawnedCount = 0; activeParticles.forEach(p => { p.mesh.parent?.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }); activeParticles = [];
  for (const record of records) {
    if (record.decorationGroup) record.anchor.group.remove(record.decorationGroup);
    record.pumpkin = null; record.pumpkinGroup = null; record.animationObjects = null;
    record.foundOnce = false; record.smashed = false; record.active = false;
  }
  updateHud();
  ui.win.classList.add('hidden');
  setHint('Reset complete. Point at reference images to discover pumpkins again.');
  // Re-trigger already visible target anchors by assigning pumpkins immediately if still in view.
  for (const record of records.filter(r => r.targetFoundNow).slice(0, goal)) {
    record.foundOnce = true; spawnedCount++; buildTargetDecoration(record);
  }
}

async function stopAR() {
  if (renderer) {
    renderer.setAnimationLoop(null);
    renderer.domElement.removeEventListener('pointerdown', onCanvasTap);
  }
  if (mindar) { try { await mindar.stop(); } catch (error) { console.debug(error); } }
  try { renderer?.dispose(); } catch {}
  mindar = null; scene = null; camera = null; renderer = null; records = []; isRunning = false;
  ui.cameraSwitch.innerHTML = '↻ <span>CAMERA</span>'; 
  ui.container.replaceChildren();
  ui.hud.classList.add('hidden'); ui.win.classList.add('hidden'); ui.startScreen.classList.remove('hidden');
  await loadConfiguration();
}

ui.start.addEventListener('click', startImageAR);
ui.reset.addEventListener('click', resetRound);
ui.cameraSwitch.addEventListener('click', stopAR);
ui.sound.addEventListener('click', () => { soundOn = !soundOn; ui.sound.classList.toggle('muted', !soundOn); ui.sound.textContent = soundOn ? '♫' : '♬'; if (soundOn) playSound(520,0.08,'triangle'); });
ui.playAgain.addEventListener('click', resetRound);
ui.backTitle.addEventListener('click', stopAR);

loadConfiguration();
