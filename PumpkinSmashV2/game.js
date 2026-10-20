import * as THREE from 'three';

// Three.js removed DeviceOrientationControls from its official addons in r134.
// This small local replacement keeps the camera-overlay fallback self-contained.
class DeviceOrientationControls {
  constructor(object) {
    this.object = object;
    this.enabled = false;
    this.deviceOrientation = null;
    this.screenOrientation = 0;
    this._zee = new THREE.Vector3(0, 0, 1);
    this._euler = new THREE.Euler();
    this._q0 = new THREE.Quaternion();
    this._q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
    this._onDeviceOrientation = (event) => { this.deviceOrientation = event; };
    this._onScreenOrientation = () => {
      const angle = window.screen?.orientation?.angle;
      this.screenOrientation = Number.isFinite(angle) ? angle : (Number(window.orientation) || 0);
    };
  }
  connect() {
    if (!('DeviceOrientationEvent' in window)) return false;
    this._onScreenOrientation();
    window.addEventListener('orientationchange', this._onScreenOrientation, false);
    window.addEventListener('deviceorientation', this._onDeviceOrientation, false);
    this.enabled = true;
    return true;
  }
  disconnect() {
    window.removeEventListener('orientationchange', this._onScreenOrientation, false);
    window.removeEventListener('deviceorientation', this._onDeviceOrientation, false);
    this.enabled = false;
  }
  update() {
    if (!this.enabled || !this.deviceOrientation) return;
    const event = this.deviceOrientation;
    const alpha = Number.isFinite(event.alpha) ? THREE.MathUtils.degToRad(event.alpha) : 0;
    const beta = Number.isFinite(event.beta) ? THREE.MathUtils.degToRad(event.beta) : 0;
    const gamma = Number.isFinite(event.gamma) ? THREE.MathUtils.degToRad(event.gamma) : 0;
    const orient = THREE.MathUtils.degToRad(this.screenOrientation || 0);
    this._euler.set(beta, alpha, -gamma, 'YXZ');
    this.object.quaternion.setFromEuler(this._euler);
    this.object.quaternion.multiply(this._q1);
    this.object.quaternion.multiply(this._q0.setFromAxisAngle(this._zee, -orient));
  }
  dispose() { this.disconnect(); }
}

const $ = (id) => document.getElementById(id);
const game = $('game');
const video = $('camera');
const sceneRoot = $('scene-root');
const startScreen = $('start-screen');
const hud = $('hud');
const permissionScreen = $('permission-screen');
const winScreen = $('win-screen');
const scoreText = $('score');
const progressFill = $('progress-fill');
const remainingText = $('remaining');
const hintText = $('hint-text');
const toast = $('toast');

let stream = null;
let cameraMode = false;
let spatialAR = false;
let gameMode = 'demo'; // 'demo', 'camera' (camera-overlay fallback), or 'xr' (tracked WebXR AR)
let xrSession = null;
let orientationControls = null;
let worldLayoutReady = false;
let gameStarted = false;
let audioEnabled = false;
let audioContext = null;
let smashed = 0;
let toastTimeout = 0;
let lastTime = 0;
let elapsed = 0;
let actorCounter = 0;
const interactivePumpkins = [];
const animatedActors = [];
const particles = [];
const clock = new THREE.Clock();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 12);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute('aria-label', 'Tap the glowing pumpkins to smash them');
sceneRoot.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd9e3ff, 0x382014, 2.05));
const keyLight = new THREE.DirectionalLight(0xffd2a3, 2.0);
keyLight.position.set(-3, 5, 8);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x9a75ff, 9, 24);
rimLight.position.set(2, 3, 1);
scene.add(rimLight);

const mat = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const orange = mat(0xff7c19, 0.5, { emissive: 0x5b1b00, emissiveIntensity: 0.22 });
const pumpkinDark = mat(0x431c13, 0.9, { emissive: 0x170500, emissiveIntensity: 0.25 });
const stemMaterial = mat(0x5c9a3f, 0.75);
const green = mat(0x7eb84b, 0.8);
const greenShade = mat(0x3c7b38, 0.8);
const bone = mat(0xffefce, 0.68);
const boneShade = mat(0xc9bca1, 0.85);
const black = mat(0x1b1520, 0.7);
const white = mat(0xffffff, 0.45, { emissive: 0x34313b, emissiveIntensity: 0.2 });
const batMat = mat(0x22172d, 0.6, { emissive: 0x10091b, emissiveIntensity: 0.3 });
const ghostMat = new THREE.MeshStandardMaterial({ color: 0xd5f2ff, transparent: true, opacity: 0.8, roughness: 0.25, emissive: 0x5687b0, emissiveIntensity: 0.34, side: THREE.DoubleSide, depthWrite: false });
const moonMat = new THREE.MeshStandardMaterial({ color: 0xfff0bd, emissive: 0xffc75a, emissiveIntensity: 1.35, roughness: 0.8 });

const sphereGeo = new THREE.SphereGeometry(1, 20, 16);
function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
function group(parent = scene) {
  const g = new THREE.Group();
  parent.add(g);
  return g;
}
function cylinderBetween(parent, a, b, radius, material, radius2 = radius, segments = 9) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const geometry = new THREE.CylinderGeometry(radius2, radius, direction.length(), segments);
  const cylinder = mesh(geometry, material, parent);
  cylinder.position.copy(a).add(b).multiplyScalar(0.5);
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return cylinder;
}
function screenPosition(object, x, y, z = 0) {
  const distance = camera.position.z - z;
  const h = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const w = h * camera.aspect;
  object.position.set((x - 0.5) * w, (0.5 - y) * h, z);
}
function attachLayout(object, x, y, z = 0) {
  object.userData.layout = { x, y, z };
  screenPosition(object, x, y, z);
}
function relayout(object, x, y) {
  if (object.userData.layout) {
    object.userData.layout.x = x;
    object.userData.layout.y = y;
    screenPosition(object, x, y, object.userData.layout.z);
  }
}

// A round, ribbed pumpkin with its own carved face and an easy-to-tap 3D hit target.
function makePumpkin(index) {
  const root = group();
  root.userData.isPumpkin = true;
  root.userData.index = index;
  const body = mesh(sphereGeo, orange, root, 0, 0, 0);
  body.scale.set(0.63, 0.53, 0.48);
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const lobe = mesh(sphereGeo, orange, root, Math.cos(angle) * 0.18, Math.sin(angle) * 0.015, Math.sin(angle) * 0.105);
    lobe.scale.set(0.24, 0.47, 0.4);
    lobe.rotation.y = -angle * 0.3;
  }
  const stem = mesh(new THREE.CylinderGeometry(0.075, 0.11, 0.26, 9), stemMaterial, root, 0.02, 0.56, 0);
  stem.rotation.z = -0.17;
  const leaf = mesh(new THREE.SphereGeometry(0.14, 12, 8), stemMaterial, root, 0.16, 0.61, 0.02);
  leaf.scale.set(1.35, 0.35, 0.56);
  leaf.rotation.z = 0.35;
  // Triangle eyes and a jagged-but-friendly smile sit toward the camera.
  const eyeShape = new THREE.Shape();
  eyeShape.moveTo(-0.10, -0.075); eyeShape.lineTo(0.10, -0.075); eyeShape.lineTo(0, 0.105); eyeShape.closePath();
  const eyeGeo = new THREE.ShapeGeometry(eyeShape);
  mesh(eyeGeo, pumpkinDark, root, -0.22, 0.075, 0.44);
  mesh(eyeGeo, pumpkinDark, root, 0.22, 0.075, 0.44);
  const mouthShape = new THREE.Shape();
  mouthShape.moveTo(-0.27, 0.035); mouthShape.lineTo(-0.17, -0.12); mouthShape.lineTo(-0.08, -0.075); mouthShape.lineTo(0, -0.16); mouthShape.lineTo(0.09, -0.075); mouthShape.lineTo(0.18, -0.12); mouthShape.lineTo(0.27, 0.035); mouthShape.quadraticCurveTo(0, -0.02, -0.27, 0.035); mouthShape.closePath();
  mesh(new THREE.ShapeGeometry(mouthShape), pumpkinDark, root, 0, -0.17, 0.445);
  // No target ring, marker, or outline: players must spot the pumpkin itself.
  root.scale.setScalar(0.34);
  root.traverse((child) => { if (child.isMesh) child.userData.pumpkinRoot = root; });
  attachLayout(root, 0.5, 0.5, 0.15 + (index % 2) * 0.08);
  interactivePumpkins.push(root);
  return root;
}
for (let i = 0; i < 5; i++) makePumpkin(i);

// Full moon and small craters, placed behind the foreground characters.
const moon = group();
mesh(sphereGeo, moonMat, moon, 0, 0, 0).scale.setScalar(0.86);
const moonGlow = mesh(new THREE.SphereGeometry(1.05, 22, 16), new THREE.MeshBasicMaterial({ color: 0xffc96d, transparent: true, opacity: 0.11, depthWrite: false }), moon, 0, 0, -0.06);
moonGlow.scale.set(1.2, 1.2, 0.7);
const craterMat = mat(0xd8bd86, 0.95, { emissive: 0x37210b, emissiveIntensity: 0.15 });
for (const [x, y, s] of [[-.28,.2,.12],[.25,.31,.08],[.33,-.17,.11],[-.15,-.34,.07]]) {
  const crater = mesh(sphereGeo, craterMat, moon, x, y, 0.78);
  crater.scale.set(s, s * 0.7, 0.025);
}
attachLayout(moon, 0.80, 0.17, -3.8);
moon.scale.setScalar(1.1);

// A handful of distant star specks for the animated scene, visible in demo mode too.
const stars = [];
for (let i = 0; i < 36; i++) {
  const star = mesh(new THREE.SphereGeometry(0.022 + Math.random() * 0.025, 6, 5), new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? 0xffd38e : 0xd9d6ef, transparent: true, opacity: 0.6 + Math.random() * 0.35 }), scene);
  const x = 0.03 + Math.random() * 0.94;
  const y = 0.04 + Math.random() * 0.58;
  attachLayout(star, x, y, -4.7);
  stars.push({ object: star, phase: Math.random() * Math.PI * 2 });
}

function makeBat() {
  const root = group();
  const body = mesh(sphereGeo, batMat, root, 0, 0, 0);
  body.scale.set(0.13, 0.2, 0.12);
  const head = mesh(sphereGeo, batMat, root, 0, 0.16, 0.02);
  head.scale.set(0.13, 0.12, 0.12);
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.07, 0.18, 5), batMat, root, side * 0.075, 0.29, 0);
    ear.rotation.z = side * -0.22;
  }
  const wingGeo = new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(0,0.06); s.lineTo(-0.23,0.22); s.lineTo(-0.49,0.29); s.lineTo(-0.40,0.08); s.lineTo(-0.59,-0.08); s.lineTo(-0.25,-0.12); s.lineTo(-0.08,-0.04); s.closePath(); return s; })());
  const left = mesh(wingGeo, batMat, root, -0.05, 0.02, 0);
  const right = mesh(wingGeo, batMat, root, 0.05, 0.02, 0);
  right.scale.x = -1;
  attachLayout(root, -0.1, 0.16 + Math.random() * 0.14, -1.4);
  root.scale.setScalar(0.72 + Math.random() * 0.34);
  animatedActors.push({ type: 'bat', root, left, right, speed: 0.10 + Math.random() * 0.07, phase: Math.random() * 6, baseY: root.userData.layout.y, screenBaseY: root.userData.layout.y, screenScale: root.scale.x, direction: 1, startX: -0.1 - Math.random() * 0.7 });
}
for (let i = 0; i < 4; i++) makeBat();

function makeGhost() {
  const root = group();
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-0.40, -0.43);
  bodyShape.bezierCurveTo(-0.48, -0.03, -0.43, 0.34, -0.18, 0.48);
  bodyShape.bezierCurveTo(0.02, 0.59, 0.32, 0.47, 0.40, 0.20);
  bodyShape.bezierCurveTo(0.48, -0.04, 0.40, -0.29, 0.38, -0.43);
  bodyShape.lineTo(0.22, -0.32); bodyShape.lineTo(0.06, -0.44); bodyShape.lineTo(-0.10, -0.32); bodyShape.lineTo(-0.25, -0.44); bodyShape.closePath();
  const body = mesh(new THREE.ShapeGeometry(bodyShape, 14), ghostMat, root, 0, 0, 0);
  for (const x of [-0.14, 0.14]) {
    const eye = mesh(sphereGeo, mat(0x243047, 0.7), root, x, 0.12, 0.025);
    eye.scale.set(0.047, 0.067, 0.026);
  }
  const mouth = mesh(sphereGeo, mat(0x243047, 0.8), root, 0, -0.04, 0.028);
  mouth.scale.set(0.055, 0.07, 0.025);
  attachLayout(root, 1.15, 0.36 + Math.random() * 0.19, -1.1);
  root.scale.setScalar(0.78 + Math.random() * 0.27);
  animatedActors.push({ type: 'ghost', root, speed: 0.065 + Math.random() * 0.045, phase: Math.random() * 6, baseY: root.userData.layout.y, screenBaseY: root.userData.layout.y, screenScale: root.scale.x, direction: -1, startX: 1.15 + Math.random() * 0.7 });
}
for (let i = 0; i < 3; i++) makeGhost();

function makeSkeleton() {
  const root = group();
  // Ribs and spine
  cylinderBetween(root, new THREE.Vector3(0, -0.16, 0), new THREE.Vector3(0, 0.28, 0), 0.035, bone);
  for (let i = 0; i < 4; i++) {
    const rib = mesh(new THREE.TorusGeometry(0.22 - i * 0.012, 0.027, 7, 16), bone, root, 0, 0.17 - i * 0.11, 0.01);
    rib.scale.y = 0.60;
  }
  const pelvis = mesh(new THREE.TorusGeometry(0.17, 0.035, 7, 14), bone, root, 0, -0.22, 0);
  pelvis.scale.y = 0.52;
  const skull = mesh(sphereGeo, bone, root, 0, 0.49, 0);
  skull.scale.set(0.22, 0.23, 0.18);
  const jaw = mesh(sphereGeo, boneShade, root, 0, 0.36, 0.015);
  jaw.scale.set(0.15, 0.09, 0.15);
  for (const x of [-0.08, 0.08]) {
    const eye = mesh(sphereGeo, black, root, x, 0.51, 0.16);
    eye.scale.set(0.046, 0.058, 0.025);
  }
  mesh(new THREE.BoxGeometry(0.025, 0.075, 0.015), white, root, 0, 0.34, 0.145);
  // Limb pivots let the arms and legs swing while dancing.
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = group(root); pivot.position.set(side * 0.22, 0.22, 0);
    cylinderBetween(pivot, new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.06, -0.29, 0), 0.043, bone);
    mesh(sphereGeo, bone, pivot, side * 0.06, -0.30, 0).scale.setScalar(0.065);
    cylinderBetween(pivot, new THREE.Vector3(side * 0.06, -0.29, 0), new THREE.Vector3(side * 0.20, -0.47, 0), 0.034, boneShade);
    arms.push({ pivot, side });
  }
  for (const side of [-1, 1]) {
    const hip = new THREE.Vector3(side * 0.10, -0.23, 0);
    const knee = new THREE.Vector3(side * 0.14, -0.48, 0);
    const foot = new THREE.Vector3(side * 0.17, -0.67, 0.03);
    cylinderBetween(root, hip, knee, 0.055, bone);
    mesh(sphereGeo, boneShade, root, knee.x, knee.y, knee.z).scale.setScalar(0.06);
    cylinderBetween(root, knee, foot, 0.04, bone);
    mesh(new THREE.BoxGeometry(0.15, 0.07, 0.11), boneShade, root, foot.x + side * 0.035, foot.y - 0.025, foot.z);
  }
  attachLayout(root, 0.18, 0.65, -0.85);
  root.scale.setScalar(0.74);
  animatedActors.push({ type: 'skeleton', root, arms, phase: Math.random() * Math.PI * 2, baseY: 0.65, baseX: 0.18 });
  return root;
}
makeSkeleton();
makeSkeleton().userData.layout.x = 0.83;

function makeZombie() {
  const root = group();
  const torso = mesh(new THREE.BoxGeometry(0.43, 0.55, 0.30), mat(0x4b814c, 0.9), root, 0, 0.02, 0);
  torso.rotation.z = -0.08;
  const head = mesh(sphereGeo, green, root, -0.025, 0.43, 0.015);
  head.scale.set(0.28, 0.29, 0.25);
  const hair = mesh(sphereGeo, mat(0x413b32), root, -0.04, 0.62, 0);
  hair.scale.set(0.28, 0.12, 0.24);
  for (const x of [-0.11, 0.09]) {
    const eyeWhite = mesh(sphereGeo, white, root, x, 0.46, 0.23); eyeWhite.scale.set(0.06, 0.052, 0.025);
    const pupil = mesh(sphereGeo, mat(0x1c1422), root, x + 0.015, 0.45, 0.255); pupil.scale.set(0.022, 0.031, 0.012);
  }
  const mouth = mesh(new THREE.BoxGeometry(0.13, 0.05, 0.025), mat(0x34201c), root, -0.01, 0.33, 0.24);
  const teeth = mesh(new THREE.BoxGeometry(0.09, 0.018, 0.013), bone, root, -0.01, 0.336, 0.26);
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = group(root); pivot.position.set(side * 0.22, 0.22, 0);
    cylinderBetween(pivot, new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.10, -0.23, 0.03), 0.075, green);
    mesh(sphereGeo, green, pivot, side * 0.10, -0.23, 0.03).scale.set(0.09, 0.10, 0.085);
    for (let f = 0; f < 3; f++) cylinderBetween(pivot, new THREE.Vector3(side * 0.10, -0.23, 0.03), new THREE.Vector3(side * (0.18 + f * 0.035), -0.28, 0.04), 0.018, greenShade, 0.01, 6);
    arms.push({ pivot, side });
  }
  for (const side of [-1, 1]) {
    cylinderBetween(root, new THREE.Vector3(side * 0.12, -0.25, 0), new THREE.Vector3(side * 0.15, -0.49, 0), 0.075, greenShade);
    mesh(new THREE.BoxGeometry(0.18, 0.08, 0.16), mat(0x302b2a), root, side * 0.16, -0.53, 0.04);
  }
  // A smoky soil ring below each zombie sells the pop-up-from-the-ground moment.
  const soil = mesh(new THREE.TorusGeometry(0.42, 0.055, 7, 22), new THREE.MeshBasicMaterial({ color: 0x9bca65, transparent: true, opacity: 0.38, depthWrite: false }), root, 0, -0.54, -0.04);
  soil.scale.y = 0.27;
  attachLayout(root, 0.32, 0.83, -0.25);
  root.scale.setScalar(0.66);
  animatedActors.push({ type: 'zombie', root, arms, phase: Math.random() * Math.PI * 2, baseY: 0.80, baseX: 0.32 });
  return root;
}
makeZombie();
makeZombie().userData.layout.x = 0.71;

function setMode(mode) {
  gameMode = mode;
  cameraMode = mode === 'camera' || mode === 'xr';
  spatialAR = mode === 'xr';
  game.classList.toggle('camera-active', mode === 'camera');
  game.classList.toggle('demo-active', mode === 'demo');
  game.classList.toggle('spatial-ar', mode === 'xr');
  document.body.classList.toggle('spatial-ar', mode === 'xr');
  document.documentElement.classList.toggle('spatial-ar', mode === 'xr');
}

async function requestOrientationPermission() {
  try {
    const OrientationEvent = window.DeviceOrientationEvent;
    if (OrientationEvent && typeof OrientationEvent.requestPermission === 'function') {
      return (await OrientationEvent.requestPermission()) === 'granted';
    }
    return !!OrientationEvent;
  } catch (_) {
    return false;
  }
}

function enableOrientationControls() {
  try {
    orientationControls?.disconnect();
    orientationControls = new DeviceOrientationControls(camera);
    orientationControls.connect();
    orientationControls.enabled = true;
    return true;
  } catch (error) {
    console.warn('Device orientation controls are unavailable:', error);
    orientationControls = null;
    return false;
  }
}

async function startCamera() {
  $('start-note').textContent = 'Starting AR…';

  // On browsers that need a separate motion-sensor permission, request it directly
  // inside this tap. True WebXR AR does not depend on these fallback controls.
  const needsMotionPermission = typeof window.DeviceOrientationEvent?.requestPermission === 'function';
  const orientationPermissionPromise = needsMotionPermission && !navigator.xr?.requestSession
    ? requestOrientationPermission()
    : Promise.resolve(!!window.DeviceOrientationEvent && !needsMotionPermission);

  if (navigator.xr?.requestSession) {
    let session = null;
    try {
      // WebXR's immersive AR mode supplies camera passthrough and positional tracking.
      // Requiring a floor reference space and DOM overlay ensures both grounded props
      // and the game's touch controls work in this mode.
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['local-floor', 'dom-overlay'],
        optionalFeatures: ['hit-test'],
        domOverlay: { root: document.body }
      });
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      video.srcObject = null;
      orientationControls?.disconnect();
      orientationControls = null;
      await renderer.xr.setSession(session);
      xrSession = session;
      session.addEventListener('end', handleXRSessionEnd, { once: true });
      session.addEventListener('select', handleXRSelect);
      setMode('xr');
      configureExplorationScene(true);
      beginGame();
      toastMessage('Look around and explore to find the pumpkins!');
      return;
    } catch (error) {
      console.info('Tracked WebXR AR is unavailable here; trying camera-overlay fallback.', error);
      if (session) {
        try { await session.end(); } catch (_) { /* session may already have ended */ }
      }
    }
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    showPermissionError('This browser cannot start a camera AR view here. Try a current mobile browser over HTTPS, or play demo mode. True walk-around AR also requires WebXR support.');
    return;
  }

  try {
    stream?.getTracks().forEach(track => track.stop());
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    video.srcObject = stream;
    await video.play();
    const motionAllowed = await orientationPermissionPromise;
    orientationControls?.disconnect();
    orientationControls = motionAllowed ? (enableOrientationControls(), orientationControls) : null;
    setMode('camera');
    configureExplorationScene(false);
    beginGame();
    if (motionAllowed) {
      toastMessage('Turn around to search for pumpkins.');
    } else {
      toastMessage('Camera mode: turn your phone to search.');
      hintText.textContent = 'Look around for the 5 pumpkins. Walk-around position tracking needs WebXR.';
    }
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    let message = 'Camera access did not start. Check this website’s camera permission and make sure another app is not using the camera.';
    if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') message = 'Camera permission was blocked. Allow camera access for this website in your browser settings, then try again. You can still play demo mode.';
    if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') message = 'No camera was found on this device. You can still try the game in demo mode.';
    showPermissionError(message);
  }
}

function handleXRSessionEnd() {
  xrSession = null;
  spatialAR = false;
  setMode('demo');
  configureDemoScene();
  if (gameStarted) toastMessage('AR session ended. Demo mode is ready.');
}
function showPermissionError(message) {
  $('permission-message').textContent = message;
  startScreen.classList.add('hidden');
  permissionScreen.classList.remove('hidden');
  $('start-note').textContent = 'Camera permission is needed for the AR view.';
}
function beginGame() {
  gameStarted = true;
  smashed = 0;
  elapsed = 0;
  interactivePumpkins.forEach((p, i) => {
    p.visible = true;
    p.userData.smashed = false;
    p.userData.smashedAt = null;
    p.scale.setScalar(gameMode === 'demo' ? 0.84 + (i % 3) * 0.04 : 0.34);
    p.rotation.x = 0;
    p.rotation.z = 0;
    // Keep each pumpkin facing the player in exploration modes.
    if (gameMode === 'demo') p.rotation.y = 0;
  });
  startScreen.classList.add('hidden');
  permissionScreen.classList.add('hidden');
  winScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  updateHud();
  if (gameMode === 'demo') {
    toastMessage('DEMO MODE: Find five pumpkins!');
    layoutDemoScene();
  } else {
    if (!worldLayoutReady) configureExplorationScene(spatialAR);
    hintText.textContent = spatialAR
      ? 'Explore your space. The pumpkins are scattered all around you.'
      : 'Turn around to search. Spatial walk-around tracking requires WebXR.';
    toastMessage(spatialAR ? 'Look around and explore!' : 'Turn your phone to find the pumpkins.');
  }
}

function startDemo() {
  if (xrSession) {
    const oldSession = xrSession;
    xrSession = null;
    oldSession.end().catch(() => {});
  }
  orientationControls?.disconnect();
  orientationControls = null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  setMode('demo');
  configureDemoScene();
  beginGame();
}

function backToTitle() {
  if (xrSession) {
    const oldSession = xrSession;
    xrSession = null;
    oldSession.end().catch(() => {});
  }
  orientationControls?.disconnect();
  orientationControls = null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  setMode('demo');
  configureDemoScene();
  gameStarted = false;
  winScreen.classList.add('hidden');
  hud.classList.add('hidden');
  permissionScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
}

function configureDemoScene() {
  worldLayoutReady = false;
  camera.position.set(0, 0, 12);
  camera.up.set(0, 1, 0);
  camera.quaternion.identity();
  camera.rotation.set(0, 0, 0);
  camera.lookAt(0, 0, 0);
  camera.fov = 45;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  interactivePumpkins.forEach((p, i) => {
    p.scale.setScalar(0.84 + (i % 3) * 0.04);
    p.rotation.set(0, 0, 0);
  });
  moon.scale.setScalar(1.1);
  layoutDemoScene();
}

function configureExplorationScene(tracked) {
  worldLayoutReady = true;
  camera.position.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  camera.quaternion.identity();
  camera.rotation.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.fov = 70;
  camera.rotation.order = 'YXZ';
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  // Spread five real-sized pumpkins around a 360-degree search area. Some start
  // beside or behind the player, rather than being arranged in front of the screen.
  const pumpkinSpots = [
    { angle: 10, radius: 4.3 },
    { angle: 95, radius: 4.7 },
    { angle: 175, radius: 3.5 },
    { angle: 245, radius: 4.8 },
    { angle: 310, radius: 3.8 }
  ];
  interactivePumpkins.forEach((p, i) => {
    const angle = THREE.MathUtils.degToRad(pumpkinSpots[i].angle);
    const radius = pumpkinSpots[i].radius;
    const x = Math.sin(angle) * radius;
    const z = -Math.cos(angle) * radius;
    const y = tracked ? 0.19 : -0.72; // floor-relative in WebXR; eye-relative in sensor fallback
    p.position.set(x, y, z);
    p.userData.worldBase = { x, y, z };
    p.rotation.set(0, Math.atan2(-x, -z), 0);
    p.scale.setScalar(0.34);
  });

  // The moon and stars live far away and above the starting position, like a skybox
  // made from ordinary transparent 3D objects, not UI stickers fixed to the screen.
  moon.position.set(0, tracked ? 7.5 : 5.0, -32);
  moon.scale.setScalar(3.0);
  stars.forEach((star, i) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 28 + Math.random() * 7;
    star.object.position.set(Math.sin(angle) * radius, (tracked ? 3.0 : 1.5) + Math.random() * 8.0, -Math.cos(angle) * radius);
  });

  const actorSpots = {
    bat: { radius: 4.4, height: tracked ? 2.4 : 1.7, scale: 0.34, startAngle: 8, step: 87 },
    ghost: { radius: 4.7, height: tracked ? 1.9 : 1.2, scale: 0.40, startAngle: 58, step: 117 },
    skeleton: { radius: 3.6, height: tracked ? 0.49 : -0.23, scale: 0.67, startAngle: 116, step: 164 },
    zombie: { radius: 4.0, height: tracked ? 0.37 : -0.57, scale: 0.66, startAngle: 72, step: 175 }
  };
  const indices = { bat: 0, ghost: 0, skeleton: 0, zombie: 0 };
  animatedActors.forEach(actor => {
    const spec = actorSpots[actor.type];
    const index = indices[actor.type]++;
    const angle = THREE.MathUtils.degToRad((spec.startAngle + index * spec.step) % 360);
    const radius = spec.radius + (index % 2) * 0.8;
    actor.baseAngle = angle;
    actor.baseRadius = radius;
    actor.baseX = Math.sin(angle) * radius;
    actor.baseZ = -Math.cos(angle) * radius;
    actor.baseY = spec.height + ((index % 2) * 0.18);
    actor.root.position.set(actor.baseX, actor.baseY, actor.baseZ);
    actor.root.userData.worldBase = { x: actor.baseX, y: actor.baseY, z: actor.baseZ };
    actor.root.rotation.set(0, Math.atan2(-actor.baseX, -actor.baseZ), 0);
    actor.root.scale.setScalar(spec.scale);
    // Avoid placing the screen-layout coordinates back over the real-world positions.
    actor.root.userData.layout = null;
  });
  moon.userData.layout = null;
  interactivePumpkins.forEach(p => { p.userData.layout = null; });
}

function layoutDemoScene() {
  const landscape = window.innerWidth / window.innerHeight > 1.15;
  const positions = landscape
    ? [[0.17,0.44],[0.34,0.66],[0.51,0.43],[0.69,0.64],[0.86,0.43]]
    : [[0.24,0.34],[0.76,0.40],[0.50,0.53],[0.21,0.69],[0.79,0.71]];
  interactivePumpkins.forEach((p, i) => {
    const wobble = Math.sin(elapsed * 1.6 + i * 1.7) * 0.009;
    const [x,y] = positions[i];
    attachLayout(p, x, y + wobble, 0.15 + (i % 2) * 0.08);
  });
  const wide = window.innerWidth / window.innerHeight > 1.15;
  attachLayout(moon, wide ? 0.82 : 0.76, wide ? 0.25 : 0.18, -3.8);
  stars.forEach(star => {
    const l = star.object.userData.layout;
    if (l) screenPosition(star.object, l.x, l.y, l.z);
  });
  animatedActors.forEach((actor, i) => {
    actor.root.rotation.x = 0;
    actor.root.rotation.y = 0;
    if (actor.type === 'bat' || actor.type === 'ghost') actor.root.scale.setScalar(actor.screenScale ?? 0.9);
    if (actor.type === 'skeleton') {
      const skeletonIndex = animatedActors.filter(a => a.type === 'skeleton').indexOf(actor);
      const x = skeletonIndex === 0 ? 0.13 : 0.87;
      actor.baseX = x;
      actor.baseY = wide ? 0.71 : 0.63;
      attachLayout(actor.root, x, actor.baseY, -0.85);
      actor.root.scale.setScalar(wide ? 0.77 : 0.70);
    } else if (actor.type === 'zombie') {
      const zombieIndex = animatedActors.filter(a => a.type === 'zombie').indexOf(actor);
      const x = wide ? (zombieIndex === 0 ? 0.28 : 0.70) : (zombieIndex === 0 ? 0.31 : 0.69);
      actor.baseX = x;
      actor.baseY = wide ? 0.83 : 0.82;
      attachLayout(actor.root, x, actor.baseY, -0.25);
      actor.root.scale.setScalar(wide ? 0.64 : 0.58);
    }
  });
  // Return the animated flying props to their screen-space starting lanes.
  animatedActors.forEach(actor => {
    if (actor.type === 'bat' || actor.type === 'ghost') {
      actor.root.userData.layout ||= {};
      const l = actor.root.userData.layout;
      const z = actor.type === 'bat' ? -1.4 : -1.1;
      if (actor.type === 'bat') attachLayout(actor.root, -0.1, actor.screenBaseY ?? 0.2, z);
      else attachLayout(actor.root, 1.15, actor.screenBaseY ?? 0.4, z);
      actor.root.userData.layout.z = z;
    }
  });
}
function updateHud() {
  scoreText.innerHTML = `${smashed} <i>/ 5</i>`;
  progressFill.style.width = `${smashed / 5 * 100}%`;
  remainingText.textContent = `${5 - smashed} LEFT`;
  if (smashed === 5) hintText.textContent = 'Pumpkin patrol: complete!';
  else if (gameMode === 'xr') hintText.textContent = `Explore and walk around safely — ${5 - smashed} pumpkin${5 - smashed === 1 ? '' : 's'} left.`;
  else if (gameMode === 'camera') hintText.textContent = `Turn to search for the remaining ${5 - smashed} pumpkin${5 - smashed === 1 ? '' : 's'}.`;
  else if (smashed >= 3) hintText.textContent = `Keep going — ${5 - smashed} pumpkin${5 - smashed === 1 ? '' : 's'} left!`;
  else hintText.textContent = 'Find all 5 pumpkins and tap to smash!';
}
function toastMessage(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove('show'), 1800);
}
function makeSound(kind) {
  if (!audioEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain); gain.connect(audioContext.destination);
    if (kind === 'smash') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(390, now); osc.frequency.exponentialRampToValueAtTime(95, now + 0.15);
      gain.gain.setValueAtTime(0.20, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now); osc.stop(now + 0.19);
    } else {
      osc.type = 'sine'; osc.frequency.setValueAtTime(523, now); osc.frequency.setValueAtTime(659, now + 0.12); osc.frequency.setValueAtTime(784, now + 0.24);
      gain.gain.setValueAtTime(0.14, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.50);
      osc.start(now); osc.stop(now + 0.52);
    }
  } catch (_) { /* The game remains playable if Web Audio is unavailable. */ }
}
function burstAt(position) {
  const particleMaterial = [0xff8b21, 0xffbe4d, 0x9dbf55, 0xffe2a0].map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true }));
  for (let i = 0; i < 18; i++) {
    const size = 0.045 + Math.random() * 0.055;
    const p = mesh(new THREE.TetrahedronGeometry(size), particleMaterial[i % particleMaterial.length].clone(), scene, position.x, position.y, position.z + 0.1);
    p.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    particles.push({ object: p, vx: (Math.random() - 0.5) * 4.5, vy: Math.random() * 3.5 + 0.6, vz: (Math.random() - 0.5) * 1.3, life: 0.7 + Math.random() * 0.45, age: 0 });
  }
}
function smashPumpkin(root) {
  if (!gameStarted || root.userData.smashed) return;
  root.userData.smashed = true;
  root.userData.smashedAt = elapsed;
  root.userData.startScale = root.scale.x;
  smashed++;
  burstAt(root.position);
  makeSound('smash');
  updateHud();
  toastMessage(['SPLAT!','PUMPKIN SMASH!','SQUASHED!','NICE HIT!','SMASH-TASTIC!'][Math.floor(Math.random() * 5)]);
  if (smashed === 5) {
    makeSound('win');
    window.setTimeout(() => {
      if (gameStarted && smashed === 5) winScreen.classList.remove('hidden');
    }, 650);
  }
}
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = null;

function hitPumpkinWithRay(ray) {
  raycaster.ray.copy(ray);
  raycaster.near = 0;
  raycaster.far = 25;
  const hits = raycaster.intersectObjects(interactivePumpkins.filter(p => p.visible && !p.userData.smashed), true);
  if (!hits.length) return false;
  let target = hits[0].object;
  while (target && !target.userData.isPumpkin) target = target.parent;
  if (target) {
    smashPumpkin(target);
    return true;
  }
  return false;
}

function handleXRSelect(event) {
  if (!spatialAR || !gameStarted) return;
  const frame = event.frame;
  const referenceSpace = renderer.xr.getReferenceSpace();
  if (!frame || !referenceSpace || !event.inputSource?.targetRaySpace) return;
  const pose = frame.getPose(event.inputSource.targetRaySpace, referenceSpace);
  if (!pose) return;
  const p = pose.transform.position;
  const q = pose.transform.orientation;
  const origin = new THREE.Vector3(p.x, p.y, p.z);
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w)).normalize();
  hitPumpkinWithRay(new THREE.Ray(origin, direction));
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (spatialAR) return; // World-tracked AR uses the WebXR select ray instead.
  pointerDown = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, id: event.pointerId };
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (gameMode !== 'camera' || orientationControls || !pointerDown || pointerDown.id !== event.pointerId) return;
  const dx = event.clientX - pointerDown.lastX;
  const dy = event.clientY - pointerDown.lastY;
  camera.rotation.order = 'YXZ';
  camera.rotation.y -= dx * 0.004;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.004, -1.15, 1.15);
  pointerDown.lastX = event.clientX;
  pointerDown.lastY = event.clientY;
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (spatialAR || !gameStarted || !pointerDown || pointerDown.id !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  pointerDown = null;
  if (distance > 18) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const ray = raycaster.ray.clone();
  hitPumpkinWithRay(ray);
});
renderer.domElement.addEventListener('pointercancel', () => { pointerDown = null; });

function animate() {
  const dt = Math.min(clock.getDelta(), 0.04);
  elapsed += dt;
  const t = elapsed;

  if (gameMode === 'camera' && orientationControls) orientationControls.update();

  interactivePumpkins.forEach((p, i) => {
    if (!p.visible) return;
    if (p.userData.smashed) {
      const age = t - p.userData.smashedAt;
      p.rotation.z += dt * 8;
      p.scale.setScalar(Math.max(0, p.userData.startScale * (1 - age / 0.24)));
      if (age > 0.25) p.visible = false;
      return;
    }
    if (gameMode === 'demo') {
      p.rotation.z = Math.sin(t * 1.2 + i * 2.3) * 0.035;
      const l = p.userData.layout;
      if (l) screenPosition(p, l.x, l.y + Math.sin(t * 1.5 + i) * 0.006, l.z);
    } else {
      const base = p.userData.worldBase;
      if (base) p.position.y = base.y + Math.sin(t * 1.5 + i) * 0.012;
      p.rotation.z = Math.sin(t * 1.1 + i * 2.3) * 0.018;
    }
  });

  animatedActors.forEach(actor => {
    const { root, phase = 0 } = actor;
    const l = root.userData.layout;
    if (gameMode === 'demo') {
      if (actor.type === 'bat') {
        actor.left.rotation.z = Math.sin(t * 13 + phase) * 0.62;
        actor.right.rotation.z = -Math.sin(t * 13 + phase) * 0.62;
        let x = ((actor.startX + t * actor.speed) % 1.45);
        if (x > 1.24) x -= 1.45;
        const y = (actor.screenBaseY ?? 0.2) + Math.sin(t * 2.5 + phase) * 0.035;
        screenPosition(root, x, y, l?.z ?? -1.4);
        root.rotation.z = Math.sin(t * 1.8 + phase) * 0.04;
      } else if (actor.type === 'ghost') {
        let x = actor.startX - t * actor.speed;
        x = ((x + 1.35) % 1.6 + 1.6) % 1.6 - 0.25;
        const y = (actor.screenBaseY ?? 0.4) + Math.sin(t * 1.9 + phase) * 0.035;
        screenPosition(root, x, y, l?.z ?? -1.1);
        root.rotation.z = Math.sin(t * 1.3 + phase) * 0.08;
      } else if (actor.type === 'skeleton') {
        screenPosition(root, actor.baseX + Math.sin(t * 1.1 + phase) * 0.008, actor.baseY + Math.abs(Math.sin(t * 5 + phase)) * -0.035, l?.z ?? -0.85);
        root.rotation.z = Math.sin(t * 5 + phase) * 0.11;
        actor.arms.forEach((arm, i) => { arm.pivot.rotation.z = Math.sin(t * 6 + phase + i * Math.PI) * 0.9 + arm.side * -0.1; });
      } else if (actor.type === 'zombie') {
        const emerge = (Math.sin(t * 1.35 + phase) + 1) * 0.5;
        screenPosition(root, actor.baseX + Math.sin(t * 1.2 + phase) * 0.008, actor.baseY + (1 - emerge) * 0.12, l?.z ?? -0.25);
        root.scale.y = (window.innerWidth / window.innerHeight > 1.15 ? 0.64 : 0.58) * (0.64 + emerge * 0.36);
        root.rotation.z = Math.sin(t * 2.5 + phase) * 0.04;
        actor.arms.forEach((arm, i) => { arm.pivot.rotation.z = Math.sin(t * 2.3 + phase + i) * 0.18 + arm.side * -0.2; });
      }
    } else {
      // These props live in world coordinates. In WebXR the headset/camera pose is
      // tracked by the browser, so the props stay put while the player moves around.
      if (actor.type === 'bat') {
        actor.left.rotation.z = Math.sin(t * 13 + phase) * 0.62;
        actor.right.rotation.z = -Math.sin(t * 13 + phase) * 0.62;
        const angle = actor.baseAngle + Math.sin(t * 0.55 + phase) * 0.20;
        root.position.set(Math.sin(angle) * actor.baseRadius, actor.baseY + Math.sin(t * 2.5 + phase) * 0.20, -Math.cos(angle) * actor.baseRadius);
        root.rotation.y = Math.atan2(-root.position.x, -root.position.z);
        root.rotation.z = Math.sin(t * 1.8 + phase) * 0.04;
      } else if (actor.type === 'ghost') {
        const angle = actor.baseAngle + t * actor.speed * 0.12;
        root.position.set(Math.sin(angle) * actor.baseRadius, actor.baseY + Math.sin(t * 1.9 + phase) * 0.18, -Math.cos(angle) * actor.baseRadius);
        root.rotation.y = Math.atan2(-root.position.x, -root.position.z);
        root.rotation.z = Math.sin(t * 1.3 + phase) * 0.08;
      } else if (actor.type === 'skeleton') {
        root.position.set(actor.baseX + Math.sin(t * 1.1 + phase) * 0.04, actor.baseY + Math.abs(Math.sin(t * 5 + phase)) * 0.035, actor.baseZ);
        root.rotation.z = Math.sin(t * 5 + phase) * 0.11;
        actor.arms.forEach((arm, i) => { arm.pivot.rotation.z = Math.sin(t * 6 + phase + i * Math.PI) * 0.9 + arm.side * -0.1; });
      } else if (actor.type === 'zombie') {
        const emerge = (Math.sin(t * 1.35 + phase) + 1) * 0.5;
        root.position.set(actor.baseX + Math.sin(t * 1.2 + phase) * 0.035, actor.baseY - (1 - emerge) * (spatialAR ? 0.75 : 0.24), actor.baseZ);
        root.scale.y = 0.66 * (0.64 + emerge * 0.36);
        root.rotation.z = Math.sin(t * 2.5 + phase) * 0.04;
        actor.arms.forEach((arm, i) => { arm.pivot.rotation.z = Math.sin(t * 2.3 + phase + i) * 0.18 + arm.side * -0.2; });
      }
    }
  });

  stars.forEach(star => { star.object.material.opacity = 0.32 + (Math.sin(t * 2.1 + star.phase) + 1) * 0.28; });
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    p.object.position.x += p.vx * dt;
    p.object.position.y += p.vy * dt;
    p.object.position.z += p.vz * dt;
    p.vy -= 7.8 * dt;
    p.object.rotation.x += dt * 6;
    p.object.rotation.y += dt * 7;
    p.object.material.opacity = Math.max(0, 1 - p.age / p.life);
    if (p.age >= p.life) { scene.remove(p.object); p.object.geometry.dispose(); p.object.material.dispose(); particles.splice(i, 1); }
  }
  moon.rotation.z = Math.sin(t * 0.16) * 0.012;
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (gameMode === 'demo') layoutDemoScene();
}
window.addEventListener('resize', resize, { passive: true });
window.addEventListener('orientationchange', () => window.setTimeout(resize, 120), { passive: true });

$('camera-start').addEventListener('click', startCamera);
$('demo-start').addEventListener('click', startDemo);
$('permission-retry').addEventListener('click', startCamera);
$('permission-demo').addEventListener('click', startDemo);
$('camera-switch').addEventListener('click', async () => {
  if (gameMode === 'xr') {
    const oldSession = xrSession;
    xrSession = null;
    if (oldSession) {
      try { await oldSession.end(); } catch (_) { /* already ended */ }
    }
    setMode('demo');
    configureDemoScene();
    toastMessage('Demo background enabled');
  } else if (gameMode === 'camera') {
    orientationControls?.disconnect();
    orientationControls = null;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    setMode('demo');
    configureDemoScene();
    toastMessage('Demo background enabled');
  } else {
    await startCamera();
  }
});
$('reset-button').addEventListener('click', () => { beginGame(); toastMessage('Fresh pumpkins. Fresh start!'); });
$('sound-toggle').addEventListener('click', async () => {
  audioEnabled = !audioEnabled;
  $('sound-toggle').classList.toggle('muted', !audioEnabled);
  $('sound-toggle').textContent = audioEnabled ? '♫' : '♪';
  $('sound-toggle').setAttribute('aria-label', audioEnabled ? 'Mute sound' : 'Enable sound');
  if (audioEnabled) { makeSound('smash'); toastMessage('Sound effects on'); } else toastMessage('Sound effects off');
});
$('play-again').addEventListener('click', () => beginGame());
$('back-to-title').addEventListener('click', backToTitle);
window.addEventListener('pagehide', () => {
  stream?.getTracks().forEach(track => track.stop());
  orientationControls?.disconnect();
  if (xrSession) xrSession.end().catch(() => {});
});

// Initial placement is calculated only after the first viewport dimensions are known.
setMode('demo');
configureDemoScene();
