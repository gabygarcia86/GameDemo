// Camera modes:
//   run      - chase cam behind and above, follows lanes with a little lag,
//              rolls into lane changes, widens its FOV with speed
//   showroom - orbit around the ninja for the menu and customize screens
//   intro    - swoops from the showroom view to the chase cam (countdown)
//   crash    - stops and looks at the wipeout

import { THREE } from './gfx.js';
import { CONFIG } from './config.js';
import { damp, lerp, clamp, smoothstep } from './utils.js';

const C = CONFIG.camera;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _look = new THREE.Vector3();

export class CameraRig {
  constructor(camera, track) {
    this.camera = camera;
    this.track = track;
    this.x = 0;
    this.y = C.height;
    this.roll = 0;
    this.shakeAmt = 0;
    this.fov = C.fovMin;
    this.orbit = 2.35;       // showroom angle around the player
    this.orbitTarget = 2.35;
    this.zoom = 1;
    this.viewShift = 0;     // shifts the picture sideways so panels don't cover the ninja
    this.viewShiftY = 0;
    this.introT = 0;
    this.crashT = 0;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
  }

  shake(amount) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  // 0 on landscape screens, up to 1 on tall phone screens. Tall screens see
  // less to the sides, so the chase cam pulls back, rises and widens.
  get tall() {
    return clamp((1 - this.camera.aspect) / 0.55, 0, 1);
  }

  // Desired run-camera pose (position + look target) into _a/_b.
  runPose(player, dist) {
    const t = this.tall;
    this.track.toWorld(this.x, this.y + C.height * 0.4 * t, dist - C.back * (1 + 0.55 * t), _a);
    this.track.toWorld(this.x * 0.75, 0.9 + player.y * 0.35, dist + C.lookAhead, _b);
  }

  showroomPose(player, dist) {
    const R = 4.4 * this.zoom * (1 + 0.55 * this.tall);
    this.track.toWorld(player.x, 0, dist, _look);
    _a.set(_look.x + Math.sin(this.orbit) * R, _look.y + 1.55 * this.zoom + 0.2, _look.z + Math.cos(this.orbit) * R);
    _b.set(_look.x, _look.y + 0.95, _look.z);
  }

  update(dt, { player, dist, speed, mode, shake = true }) {
    const cam = this.camera;
    const speedFrac = clamp((speed - CONFIG.speed.start) / (CONFIG.speed.max - CONFIG.speed.start), 0, 1);

    // Run-camera smoothing (also tracked in other modes so switching is seamless).
    this.x = damp(this.x, player.x * 0.82, 7, dt);
    this.y = damp(this.y, C.height + player.y * 0.45, 5, dt);
    this.roll = damp(this.roll, clamp(-player.vx * 0.012, -0.08, 0.08), 6, dt);

    let fovTarget = lerp(C.fovMin, C.fovMax, speedFrac) + 8 * this.tall;
    if (mode === 'run') {
      this.runPose(player, dist);
      this.pos.copy(_a);
      this.target.copy(_b);
      if (player.airborne && player.fromRamp) fovTarget += 4;
    } else if (mode === 'showroom') {
      this.orbit = damp(this.orbit, this.orbitTarget, 4, dt);
      this.showroomPose(player, dist);
      this.pos.lerp(_a, 1 - Math.exp(-5 * dt));
      this.target.lerp(_b, 1 - Math.exp(-6 * dt));
      fovTarget = 50;
    } else if (mode === 'intro') {
      this.introT += dt;
      const k = smoothstep(0, 2.6, this.introT);
      this.orbit = lerp(this.orbit, Math.PI * 0.08, 1 - Math.exp(-1.2 * dt));
      this.showroomPose(player, dist);
      const sx = _a.x, sy = _a.y, sz = _a.z, lx = _b.x, ly = _b.y, lz = _b.z;
      this.runPose(player, dist);
      this.pos.set(lerp(sx, _a.x, k), lerp(sy, _a.y, k), lerp(sz, _a.z, k));
      this.target.set(lerp(lx, _b.x, k), lerp(ly, _b.y, k), lerp(lz, _b.z, k));
      fovTarget = lerp(50, C.fovMin, k);
    } else if (mode === 'crash') {
      this.crashT += dt;
      this.runPose(player, dist);
      const k = smoothstep(0, 1.2, this.crashT);
      this.pos.lerp(_a.setY(_a.y + k * 1.5), 1 - Math.exp(-3 * dt));
      this.track.toWorld(player.x, 0.8, dist + 2.5, _b);
      this.target.lerp(_b, 1 - Math.exp(-4 * dt));
      fovTarget = C.fovMin - 4 * k;
    }

    this.fov = damp(this.fov, fovTarget, 3, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    cam.position.copy(this.pos);
    if (shake && this.shakeAmt > 0.001) {
      const s = this.shakeAmt;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    this.shakeAmt *= Math.exp(-dt * 9);
    cam.lookAt(this.target);
    if (mode === 'run') cam.rotateZ(this.roll);
  }

  // Shift the rendered picture (in fractions of the view) without moving the camera.
  applyViewShift(width, height) {
    const cam = this.camera;
    if (Math.abs(this.viewShift) < 0.001 && Math.abs(this.viewShiftY) < 0.001) {
      if (cam.view && cam.view.enabled) {
        cam.clearViewOffset();
      }
      return;
    }
    cam.setViewOffset(width, height, -this.viewShift * width, -this.viewShiftY * height, width, height);
  }

  resetRun(player) {
    this.x = player.x * 0.82;
    this.y = C.height;
    this.introT = 0;
    this.crashT = 0;
  }
}
