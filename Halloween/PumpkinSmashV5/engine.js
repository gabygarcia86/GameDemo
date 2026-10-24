// Engine: camera + MindAR image tracking + Three.js scene.
//
// Dependencies are loaded by relative path, with no import map and no CDN:
//   vendor/three/three.module.js   (Three.js r186)
//   vendor/mindar/mindar-image.prod.js  (MindAR 1.2.5 core: Controller + Compiler; it has no Three.js dependency)
// MindAR's own Three.js wrapper is deliberately NOT used: it imports `sRGBEncoding`, which no longer exists in Three.js r186.
//
// Errors thrown from here carry a `.code` so the UI can tell failure types apart:
//   TARGETS_MISSING, TARGETS_INVALID, CAMERA_DENIED, CAMERA_UNAVAILABLE, CAMERA_INIT, TRACKER_INIT, GRAPHICS

import * as THREE from './vendor/three/three.module.js';
import { Controller, Compiler } from './vendor/mindar/mindar-image.prod.js';
import { createPumpkin } from './pumpkin.js';
import { createCreatures } from './creatures.js';

const DEG = Math.PI / 180;

const fail = (code, message, cause) => {
  const e = new Error(message);
  e.code = code;
  if (cause) e.cause = cause;
  return e;
};

async function sha256Hex(buffer) {
  if (!(window.crypto && crypto.subtle)) return null;
  const d = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class Engine {
  constructor({ stage, video, config, events }) {
    this.stage = stage;
    this.video = video;
    this.config = config;
    this.events = events || {};

    this.targets = null;        // { buffer, manifest }
    this.stream = null;
    this.controller = null;
    this._cameraPromise = null;
    this._trackerPromise = null;
    this.anchors = [];
    this.activeIndex = -1;
    this.disposed = false;

    // Three.js
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera();
    this.renderer = null;
    this.clock = new THREE.Clock();
    this.pumpkin = null;
    this.creatures = null;

    // Reusable scratch objects (nothing is allocated per frame)
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._ndc = new THREE.Vector2();
    this._raycaster = new THREE.Raycaster();
    this._screen = { x: 0, y: 0, radiusPx: 0, visible: false };
    this._lastScreen = { x: 0, y: 0, valid: false };
    this.motionPxPerSec = 0;
    this.fps = 0;

    this._initScene();
  }

  // ------------------------------------------------------------------ scene
  _initScene() {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      throw fail('GRAPHICS', 'WebGL is not available, so the pumpkin cannot be drawn.', err);
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    const cv = renderer.domElement;
    cv.className = 'ar-canvas';
    cv.style.position = 'absolute';
    cv.style.left = '0';
    cv.style.top = '0';
    cv.style.zIndex = '1';
    this.stage.appendChild(cv);

    cv.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.error('[pumpkin] WebGL context lost');
      if (this.events.onFatal) this.events.onFatal(fail('GRAPHICS', 'The graphics context was lost.'));
    });

    // Lights live in camera space (a "head lamp"), which keeps the pumpkin readable at any viewing angle.
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    this.scene.add(new THREE.HemisphereLight(0xfff0dd, 0x553322, 0.9));
    const key = new THREE.DirectionalLight(0xfff2dd, 2.4);
    key.position.set(0.3, 0.7, 1);
    this.scene.add(key);

    this.pumpkin = createPumpkin(this.config);
    this.pumpkin.root.visible = false;

    this.creatures = createCreatures(this.config);
    this.scene.add(this.creatures.root);

    this.renderer.setAnimationLoop(() => this._tick());
  }

  _tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.1;
    this._smoothAnchors(dt);
    this.pumpkin.update(dt);
    this.creatures.update(dt, this.camera);

    // Pumpkin screen motion (used to ignore taps while the camera is sweeping)
    if (this.activeIndex >= 0 && this.pumpkin.root.visible && this.anchors[this.activeIndex] && this.anchors[this.activeIndex].group.visible) {
      this.camera.updateMatrixWorld();
      const s = this.pumpkinScreen();
      if (s && this._lastScreen.valid && dt > 0) {
        const d = Math.hypot(s.x - this._lastScreen.x, s.y - this._lastScreen.y) / dt;
        this.motionPxPerSec += (d - this.motionPxPerSec) * 0.3;
      }
      if (s) { this._lastScreen.x = s.x; this._lastScreen.y = s.y; this._lastScreen.valid = true; }
    } else {
      this._lastScreen.valid = false;
      this.motionPxPerSec = 0;
    }

    this.renderer.render(this.scene, this.camera);
    if (this.events.onFrame) this.events.onFrame(dt);
  }

  // ------------------------------------------------------------------ targets
  async loadTargets() {
    if (this.targets) return this.targets;
    const { urls } = this.config;

    let manifest;
    try {
      const res = await fetch(urls.manifest, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = await res.json();
    } catch (err) {
      const missing = !(err instanceof SyntaxError);
      throw fail(missing ? 'TARGETS_MISSING' : 'TARGETS_INVALID',
        missing ? `${urls.manifest} could not be loaded (${err.message}).` : `${urls.manifest} is not valid JSON.`, err);
    }
    if (!manifest || !Array.isArray(manifest.targets) || manifest.targets.length === 0) {
      throw fail('TARGETS_INVALID', `${urls.manifest} has no targets.`);
    }

    let buffer;
    try {
      const res = await fetch(urls.mind, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buffer = await res.arrayBuffer();
    } catch (err) {
      throw fail('TARGETS_MISSING', `${urls.mind} could not be loaded (${err.message}).`, err);
    }
    if (buffer.byteLength === 0) throw fail('TARGETS_INVALID', `${urls.mind} is empty.`);

    let list;
    try {
      list = new Compiler().importData(buffer);
    } catch (err) {
      throw fail('TARGETS_INVALID', `${urls.mind} could not be decoded.`, err);
    }
    if (!Array.isArray(list) || list.length === 0) {
      throw fail('TARGETS_INVALID', `${urls.mind} is unreadable or was built by an incompatible compiler version. Rebuild it with the Target Builder.`);
    }
    if (list.length !== manifest.targets.length) {
      throw fail('TARGETS_INVALID', `${urls.mind} holds ${list.length} targets but ${urls.manifest} lists ${manifest.targets.length}. They are out of sync. Rebuild both together.`);
    }
    for (let i = 0; i < list.length; i++) {
      const d = list[i].targetImage;
      const m = manifest.targets[i];
      if (d.width !== m.width || d.height !== m.height) {
        throw fail('TARGETS_INVALID', `Target ${i} is ${d.width}x${d.height} in ${urls.mind} but ${m.width}x${m.height} in ${urls.manifest}. Rebuild both together.`);
      }
    }
    if (manifest.mindFileSha256) {
      const hex = await sha256Hex(buffer);
      if (hex && hex !== manifest.mindFileSha256) {
        throw fail('TARGETS_INVALID', `${urls.mind} does not match ${urls.manifest} (checksum differs). One of the two files is out of date or cached. Rebuild and upload both.`);
      }
    }

    this.targets = { buffer, manifest };
    return this.targets;
  }

  // ------------------------------------------------------------------ camera
  startCamera() {
    if (this._cameraPromise) return this._cameraPromise;
    if (this.cameraLive()) return Promise.resolve();
    this._cameraPromise = this._startCamera().finally(() => { this._cameraPromise = null; });
    return this._cameraPromise;
  }

  cameraLive() {
    const t = this.stream && this.stream.getVideoTracks()[0];
    return !!t && t.readyState === 'live' && this.video.videoWidth > 0;
  }

  async _startCamera() {
    this.stopCamera();
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) {
      throw fail('CAMERA_UNAVAILABLE', window.isSecureContext
        ? 'This browser does not support camera access.'
        : 'Camera access needs a secure (HTTPS) page.');
    }
    const cam = this.config.camera;
    let stream;
    try {
      stream = await md.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: cam.facingMode }, width: { ideal: cam.idealWidth }, height: { ideal: cam.idealHeight } },
      });
    } catch (err) {
      console.error('[pumpkin] getUserMedia failed', err);
      const n = err && err.name;
      if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') {
        throw fail('CAMERA_DENIED', 'Camera permission was denied.', err);
      }
      if (n === 'NotFoundError' || n === 'DevicesNotFoundError') {
        throw fail('CAMERA_UNAVAILABLE', 'No camera was found on this device.', err);
      }
      throw fail('CAMERA_INIT', `The camera could not be started (${n || 'unknown error'}).`, err);
    }

    this.stream = stream;
    const video = this.video;
    try {
      video.muted = true;
      video.setAttribute('playsinline', '');
      video.srcObject = stream;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(fail('CAMERA_INIT', 'The camera did not deliver video in time.')), cam.startTimeoutMs);
        video.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
        video.onerror = () => { clearTimeout(timer); reject(fail('CAMERA_INIT', 'The video element reported an error.')); };
      });
      await video.play();
      if (!video.videoWidth || !video.videoHeight) throw fail('CAMERA_INIT', 'The camera reported an empty video size.');
    } catch (err) {
      console.error('[pumpkin] camera init failed', err);
      this.stopCamera();
      throw err.code ? err : fail('CAMERA_INIT', 'The camera started but video could not be played.', err);
    }

    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => {
      if (this.stream === stream && this.events.onCameraEnded) this.events.onCameraEnded();
    });
    this._layout();
  }

  stopCamera() {
    if (this.stream) {
      const s = this.stream;
      this.stream = null; // clear first so the 'ended' listener ignores our own stop
      s.getTracks().forEach((t) => t.stop());
    }
    this.video.pause();
    this.video.srcObject = null;
    this.video.removeAttribute('width');   // hides the idle <video> again (see styles.css)
    this.video.removeAttribute('height');
  }

  // ------------------------------------------------------------------ tracker
  startTracker() {
    if (this._trackerPromise) return this._trackerPromise;
    if (this.controller) return Promise.resolve();
    this._trackerPromise = this._startTracker().finally(() => { this._trackerPromise = null; });
    return this._trackerPromise;
  }

  async _startTracker() {
    if (!this.targets) throw fail('TARGETS_MISSING', 'Targets were not loaded.');
    if (!this.cameraLive()) throw fail('CAMERA_INIT', 'The camera is not running.');
    const video = this.video;
    const c = this.config;

    let controller;
    try {
      controller = new Controller({
        inputWidth: video.videoWidth,
        inputHeight: video.videoHeight,
        maxTrack: c.maxTrack,
        filterMinCF: c.filterMinCF,
        filterBeta: c.filterBeta,
        warmupTolerance: c.warmupTolerance,
        missTolerance: c.missTolerance,
        onUpdate: (data) => { if (controller === this.controller) this._onUpdate(data); },
      });
      const { dimensions } = controller.addImageTargetsFromBuffer(this.targets.buffer);
      this._buildAnchors(dimensions);
      this.controller = controller;
      this._layout();
      controller.dummyRun(video);
      controller.processVideo(video);
    } catch (err) {
      console.error('[pumpkin] tracker init failed', err);
      if (controller) { try { controller.dispose(); } catch (_) { /* ignore */ } }
      this.controller = null;
      throw fail('TRACKER_INIT', 'The image tracker could not start on this device.', err);
    }
  }

  stopTracker() {
    const ctl = this.controller;
    this.controller = null; // clear first: late callbacks from the old controller are ignored
    if (ctl) { try { ctl.dispose(); } catch (err) { console.warn('[pumpkin] controller dispose', err); } }
    // Anything that was being tracked is now unknown.
    for (let i = 0; i < this.anchors.length; i++) {
      const a = this.anchors[i];
      a.group.visible = false;
      if (a.tracked) { a.tracked = false; if (this.events.onTargetLost) this.events.onTargetLost(i); }
    }
  }

  _buildAnchors(dimensions) {
    // Rebuild cleanly so restarts never stack up anchors.
    for (const a of this.anchors) a.group.removeFromParent();
    this.anchors = [];
    for (let i = 0; i < dimensions.length; i++) {
      const [w, h] = dimensions[i];
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      group.visible = false;
      this.scene.add(group);

      // The raw pose from MindAR places the origin at the image's bottom-left corner, +x right, +y up,
      // with one unit = one compiled pixel. This post-transform moves the origin to the image CENTER
      // and rescales so that 1 unit = the image width:  local (0,0,0) == center of the photograph.
      // (Identical to MindAR's own wrapper: x = w/2, y = w/2 + (h-w)/2 = h/2, scale = w.)
      const post = new THREE.Matrix4().compose(
        new THREE.Vector3(w / 2, h / 2, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(w, w, w)
      );
      this.anchors.push({
        group, post, tracked: false, width: w, height: h,
        // Smoothed pose (what is drawn) and the latest pose from the tracker (what it eases toward).
        pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scl: new THREE.Vector3(1, 1, 1),
        tPos: new THREE.Vector3(), tQuat: new THREE.Quaternion(), tScl: new THREE.Vector3(1, 1, 1),
      });
    }
    this.activeIndex = -1;
  }

  _onUpdate(data) {
    if (data.type !== 'updateMatrix') return;
    const i = data.targetIndex;
    const a = this.anchors[i];
    if (!a) return;

    if (data.worldMatrix === null) {
      a.group.visible = false;
      if (a.tracked) {
        a.tracked = false;
        if (this.events.onTargetLost) this.events.onTargetLost(i);
      }
      return;
    }

    // Pose from the tracker, every update, no screen-space placement anywhere. It becomes the target that
    // _smoothAnchors eases toward each frame; a newly found image snaps straight to it.
    this._m.fromArray(data.worldMatrix).multiply(a.post);
    this._m.decompose(a.tPos, a.tQuat, a.tScl);
    if (!a.tracked || !this.config.smoothing) {
      a.pos.copy(a.tPos);
      a.quat.copy(a.tQuat);
      a.scl.copy(a.tScl);
      a.group.matrix.compose(a.pos, a.quat, a.scl);
      a.group.matrixWorldNeedsUpdate = true;
    }
    a.group.visible = true;
    if (!a.tracked) {
      a.tracked = true;
      if (this.events.onTargetFound) this.events.onTargetFound(i);
    }
  }

  // Adaptive smoothing of every visible anchor (see CONFIG.smoothing). Jitter-sized differences between the drawn
  // pose and the tracker's latest pose are eased out slowly; real motion is followed quickly.
  _smoothAnchors(dt) {
    const sm = this.config.smoothing;
    if (!sm || dt <= 0) return;
    for (const a of this.anchors) {
      if (!a.group.visible) continue;
      const posErr = a.pos.distanceTo(a.tPos) / Math.max(1e-6, a.tPos.length());
      const angErr = a.quat.angleTo(a.tQuat);
      const motion = Math.max(posErr / sm.posNoise, angErr / (sm.angleNoiseDeg * DEG)); // 1 = at the noise level
      const k = Math.min(1, Math.max(0, (motion - 1) / 2));
      const rate = sm.stillRate + (sm.moveRate - sm.stillRate) * k;
      const alpha = 1 - Math.exp(-rate * dt);
      a.pos.lerp(a.tPos, alpha);
      a.quat.slerp(a.tQuat, alpha);
      a.scl.lerp(a.tScl, alpha);
      a.group.matrix.compose(a.pos, a.quat, a.scl);
      a.group.matrixWorldNeedsUpdate = true;
    }
  }

  // Which ambient creatures are out: 'scanning' (bats + ghosts), 'playing' (ghosts at the sides) or 'off'.
  setAmbientMode(mode) {
    this.creatures.setMode(mode);
  }

  // ------------------------------------------------------------------ pumpkin
  placePumpkin(index) {
    const a = this.anchors[index];
    if (!a) return false;
    const t = this.targets.manifest.targets[index];
    const shorter = Math.min(t.width, t.height);
    // Diameter in image-width units = fraction of the shorter side.
    const s = this.config.pumpkinScale * shorter / t.width;
    const p = this.pumpkin;
    p.reset();
    p.root.scale.setScalar(s);
    // Sit just in front of the image plane (center of the image = local x,y of 0).
    p.root.position.set(0, 0, 0.5 * s + this.config.surfaceGap);
    a.group.add(p.root);
    p.root.visible = true;
    this.activeIndex = index;
    this._lastScreen.valid = false;
    return true;
  }

  hidePumpkin() {
    this.pumpkin.root.visible = false;
    this.activeIndex = -1;
  }

  smash() {
    return new Promise((resolve) => {
      if (!this.pumpkin.startSmash(resolve)) resolve();
    });
  }

  // Screen position (CSS px, relative to the viewport) and approximate radius of the active pumpkin.
  pumpkinScreen() {
    const p = this.pumpkin;
    if (!p.root.visible || this.activeIndex < 0) return null;
    const anchor = this.anchors[this.activeIndex];
    if (!anchor || !anchor.group.visible) return null;
    p.root.updateWorldMatrix(true, false);
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._v.setFromMatrixPosition(p.root.matrixWorld);
    const worldRadius = 0.5 * p.root.matrixWorld.getMaxScaleOnAxis();
    this._v2.copy(this._v).addScaledVector(this._camUp(), worldRadius);
    this._v.project(this.camera);
    this._v2.project(this.camera);
    if (this._v.z > 1 || this._v.z < -1) return null;
    const s = this._screen;
    s.x = rect.left + (this._v.x * 0.5 + 0.5) * rect.width;
    s.y = rect.top + (-this._v.y * 0.5 + 0.5) * rect.height;
    s.radiusPx = Math.abs((this._v2.y - this._v.y) * 0.5 * rect.height);
    s.visible = s.x >= rect.left && s.x <= rect.right && s.y >= rect.top && s.y <= rect.bottom;
    return s;
  }

  _camUp() {
    return this._v3 || (this._v3 = new THREE.Vector3(0, 1, 0));
  }

  // True when a tap at (clientX, clientY) lands on the visible pumpkin.
  hitTest(clientX, clientY) {
    const p = this.pumpkin;
    const anchor = this.anchors[this.activeIndex];
    if (!p.root.visible || !anchor || !anchor.group.visible || p.busy) return false;
    this.camera.updateMatrixWorld();
    p.root.updateWorldMatrix(true, true);

    const rect = this.renderer.domElement.getBoundingClientRect();
    this._ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this._raycaster.setFromCamera(this._ndc, this.camera);
    if (this._raycaster.intersectObject(p.hitProxy, false).length > 0) return true;

    // Forgiving minimum on small screens / far-away pumpkins.
    const s = this.pumpkinScreen();
    if (!s) return false;
    const r = s.radiusPx * this.config.hitProxyScale;
    if (r >= this.config.minHitRadiusPx) return false; // big enough: the 3D ray test above is authoritative
    return Math.hypot(clientX - s.x, clientY - s.y) <= this.config.minHitRadiusPx;
  }

  isMovingFast() {
    return this.motionPxPerSec > this.config.maxTapMotionPxPerSec;
  }

  // ------------------------------------------------------------------ layout
  // Ported from MindAR's Three.js wrapper (cover-fit the video, match the projection to the controller's camera).
  _layout() {
    const { renderer, camera, stage, video, controller } = this;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const cw = stage.clientWidth;
    const ch = stage.clientHeight;
    if (!cw || !ch) return;

    video.setAttribute('width', video.videoWidth);
    video.setAttribute('height', video.videoHeight);

    const videoRatio = video.videoWidth / video.videoHeight;
    const containerRatio = cw / ch;
    let vw;
    let vh;
    if (videoRatio > containerRatio) { vh = ch; vw = vh * videoRatio; } else { vw = cw; vh = vw / videoRatio; }

    video.style.position = 'absolute';
    video.style.zIndex = '0';
    video.style.top = `${-(vh - ch) / 2}px`;
    video.style.left = `${-(vw - cw) / 2}px`;
    video.style.width = `${vw}px`;
    video.style.height = `${vh}px`;

    if (controller) {
      const proj = controller.getProjectionMatrix();
      // When the phone rotates, the video's width/height swap relative to what the controller was created with.
      const inputRatio = controller.inputWidth / controller.inputHeight;
      const inputAdjust = inputRatio > containerRatio ? video.width / controller.inputWidth : video.height / controller.inputHeight;
      let videoDisplayHeight;
      if (inputRatio > containerRatio) {
        videoDisplayHeight = ch * inputAdjust;
      } else {
        videoDisplayHeight = (cw / controller.inputWidth) * controller.inputHeight * inputAdjust;
      }
      const fovAdjust = ch / videoDisplayHeight;

      camera.fov = (2 * Math.atan((1 / proj[5]) * fovAdjust) * 180) / Math.PI;
      camera.near = proj[14] / (proj[10] - 1.0);
      camera.far = proj[14] / (proj[10] + 1.0);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    }

    renderer.setSize(cw, ch);
  }

  resize() { this._layout(); }

  // ------------------------------------------------------------------ debug / teardown
  // Screen position of an anchor's local origin = the centre of the tracked photograph (debug / tests only).
  anchorCenterScreen(index) {
    const a = this.anchors[index];
    if (!a || !a.group.visible) return null;
    this.camera.updateMatrixWorld();
    a.group.updateWorldMatrix(true, false);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3().setFromMatrixPosition(a.group.matrixWorld).project(this.camera);
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
  }

  debugInfo() {
    const s = this.pumpkinScreen();
    const centers = this.anchors.map((a, i) => this.anchorCenterScreen(i));
    return {
      imageCenterScreen: centers,
      cameraLive: this.cameraLive(),
      video: { w: this.video.videoWidth, h: this.video.videoHeight },
      controllerRunning: !!this.controller,
      anchors: this.anchors.map((a, i) => ({ index: i, tracked: a.tracked, visible: a.group.visible })),
      activeIndex: this.activeIndex,
      pumpkin: { visible: this.pumpkin.root.visible, busy: this.pumpkin.busy, screen: s ? { x: s.x, y: s.y, radiusPx: s.radiusPx, onScreen: s.visible } : null },
      creatures: this.creatures.info(),
      anchorDistance: this.activeIndex >= 0 ? Math.round(this.anchors[this.activeIndex].tPos.length()) : null,
      motionPxPerSec: Math.round(this.motionPxPerSec),
      fps: Math.round(this.fps),
      canvas: { w: this.renderer.domElement.clientWidth, h: this.renderer.domElement.clientHeight },
    };
  }

  shutdown() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopTracker();
    this.stopCamera();
    this.renderer.setAnimationLoop(null);
    this.pumpkin.dispose();
    this.creatures.dispose();
    for (const a of this.anchors) a.group.removeFromParent();
    this.anchors = [];
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
