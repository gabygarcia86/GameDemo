import * as THREE from 'three';
import { LAUNCH } from './config.js';

const _projected = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _plane = new THREE.Plane();
const _hit = new THREE.Vector3();
const _sphere = new THREE.Sphere();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Drag-to-aim, release-to-toss input built on Pointer Events, so mouse, touch and pen all
 * share one code path.
 *
 * Mapping from screen drag to launch velocity:
 *  - Power: drag length / (fullPowerDragFraction * viewport height), clamped to 0..1, mapped
 *    linearly to LAUNCH.minSpeed..maxSpeed. Releasing below cancelDragFraction cancels.
 *  - Direction: the drag direction on screen is projected onto the horizontal plane through
 *    the latke (via a camera ray), so the throw heads where the drag points *in the 3D
 *    scene*, correcting for perspective. The resulting yaw is clamped to +/- maxYawDegrees.
 *  - Elevation is fixed (LAUNCH.elevationDegrees); drag length alone sets distance/height.
 */
export class AimController {
  constructor(canvas, camera, { canStartAim, getLatkePosition, onAimStart, onAimChange, onThrow, onCancel, onHover }) {
    this.canvas = canvas;
    this.camera = camera;
    this.canStartAim = canStartAim;
    this.getLatkePosition = getLatkePosition;
    this.onAimStart = onAimStart;
    this.onAimChange = onAimChange;
    this.onThrow = onThrow;
    this.onCancel = onCancel;
    this.onHover = onHover;

    this.raycaster = new THREE.Raycaster();
    this.activePointerId = null;
    this.startX = 0;
    this.startY = 0;
    this.latkeScreen = new THREE.Vector2();
    this.aim = {
      power: 0,
      speed: 0,
      yaw: 0,
      valid: false,
      velocity: new THREE.Vector3(),
    };

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerCancel = this._onPointerCancel.bind(this);
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerCancel);
    canvas.addEventListener('lostpointercapture', this._onPointerCancel);
    // Stop long-press menus and double-tap zoom on the game canvas only.
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  get isAiming() {
    return this.activePointerId !== null;
  }

  _localPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
  }

  // Projects a world point to canvas pixel coordinates.
  _toScreen(world, width, height, out) {
    _projected.copy(world).project(this.camera);
    out.set((_projected.x + 1) * 0.5 * width, (1 - _projected.y) * 0.5 * height);
    return out;
  }

  _setRayFromPixel(x, y, width, height) {
    _ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    this.raycaster.setFromCamera(_ndc, this.camera);
  }

  // Grab test: generous 3D hit sphere around the latke OR a screen-space radius.
  _isOverLatke(point) {
    const latkePosition = this.getLatkePosition();
    if (!latkePosition) return false;
    this._toScreen(latkePosition, point.width, point.height, this.latkeScreen);
    const screenDistance = Math.hypot(point.x - this.latkeScreen.x, point.y - this.latkeScreen.y);
    if (screenDistance <= LAUNCH.grabRadiusPx) return true;
    this._setRayFromPixel(point.x, point.y, point.width, point.height);
    _sphere.set(latkePosition, 0.6);
    return this.raycaster.ray.intersectsSphere(_sphere);
  }

  _onPointerDown(event) {
    if (this.activePointerId !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!this.canStartAim()) return;
    const point = this._localPoint(event);
    if (!this._isOverLatke(point)) return;

    event.preventDefault();
    this.activePointerId = event.pointerId;
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail on synthetic events; aiming still works without it.
    }
    this.startX = point.x;
    this.startY = point.y;
    this._updateAim(point);
    this.onAimStart(this.aim);
  }

  _onPointerMove(event) {
    const point = this._localPoint(event);
    if (event.pointerId !== this.activePointerId) {
      if (this.activePointerId === null && event.pointerType === 'mouse') {
        this.onHover(this.canStartAim() && this._isOverLatke(point));
      }
      return;
    }
    event.preventDefault();
    this._updateAim(point);
    this.onAimChange(this.aim);
  }

  _onPointerUp(event) {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    const point = this._localPoint(event);
    this._updateAim(point);
    this._release(event.pointerId);
    if (this.aim.valid) this.onThrow(this.aim);
    else this.onCancel();
  }

  _onPointerCancel(event) {
    if (event.pointerId !== this.activePointerId) return;
    this._release(event.pointerId);
    this.onCancel();
  }

  _release(pointerId) {
    this.activePointerId = null;
    try {
      if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    } catch {
      // Ignore: the pointer may already be gone.
    }
  }

  /** Cancels any in-progress aim (e.g. on pause or when the round ends). */
  cancel() {
    if (this.activePointerId === null) return;
    this._release(this.activePointerId);
    this.onCancel();
  }

  _updateAim(point) {
    const aim = this.aim;
    const dragX = point.x - this.startX;
    const dragY = point.y - this.startY;
    const dragLength = Math.hypot(dragX, dragY);
    const fullPowerPixels = Math.max(120, point.height * LAUNCH.fullPowerDragFraction);
    const cancelPixels = point.height * LAUNCH.cancelDragFraction;
    const latkePosition = this.getLatkePosition();

    let yaw = 0;
    let forward = true;
    if (dragLength > 2 && latkePosition) {
      // Perspective-correct heading: step a short distance along the drag direction on
      // screen, cast a ray through that pixel, and intersect the horizontal plane at the
      // latke's height. The world-space vector from the latke to that hit point is the
      // ground-track direction the player is pointing at.
      this._toScreen(latkePosition, point.width, point.height, this.latkeScreen);
      const stepPixels = 60;
      const sampleX = this.latkeScreen.x + (dragX / dragLength) * stepPixels;
      const sampleY = this.latkeScreen.y + (dragY / dragLength) * stepPixels;
      this._setRayFromPixel(sampleX, sampleY, point.width, point.height);
      _plane.set(_up, -latkePosition.y);
      const hit = this.raycaster.ray.intersectPlane(_plane, _hit);
      if (hit) {
        const dx = hit.x - latkePosition.x;
        const dz = hit.z - latkePosition.z;
        forward = dz < 0; // -Z is "into the scene", toward the pot
        yaw = Math.atan2(dx, -dz);
      } else {
        // Pointing above the horizon: treat as straight ahead along the screen's x drift.
        yaw = Math.atan2(dragX, -dragY);
        forward = dragY < 0;
      }
    }

    const maxYaw = THREE.MathUtils.degToRad(LAUNCH.maxYawDegrees);
    yaw = THREE.MathUtils.clamp(yaw, -maxYaw, maxYaw);
    const power = THREE.MathUtils.clamp(dragLength / fullPowerPixels, 0, 1);

    aim.valid = forward && dragLength >= cancelPixels;
    aim.power = aim.valid ? power : 0;
    aim.yaw = yaw;
    aim.speed = LAUNCH.minSpeed + (LAUNCH.maxSpeed - LAUNCH.minSpeed) * aim.power;
    const elevation = THREE.MathUtils.degToRad(LAUNCH.elevationDegrees);
    const horizontalSpeed = Math.cos(elevation) * aim.speed;
    aim.velocity.set(
      Math.sin(yaw) * horizontalSpeed,
      Math.sin(elevation) * aim.speed,
      -Math.cos(yaw) * horizontalSpeed,
    );
  }
}
