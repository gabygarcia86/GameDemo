// Which way the phone is facing, from its motion sensors (the `deviceorientation` event), as the camera's rotation in a
// room-fixed frame: +y points straight up (gravity) and -z is the direction the phone faced when the sensor first reported.
// Rotation only: browsers report no position, so this knows where you are looking, not where you are standing.
// iOS only sends these events after DeviceOrientationEvent.requestPermission() was granted from a tap (see game.js).

import * as THREE from './vendor/three/three.module.js';

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const LOOK_OUT_BACK = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // the camera looks out of the back, not the top

function screenAngle() {
  const so = screen.orientation;
  const deg = so && typeof so.angle === 'number' ? so.angle : (window.orientation || 0);
  return THREE.MathUtils.degToRad(deg);
}

export function createOrientation() {
  let reading = null;  // latest { a, b, g } (alpha/beta/gamma, degrees)
  let headingFix = null;
  let primed = false;
  const D = THREE.MathUtils.degToRad;
  const euler = new THREE.Euler();
  const raw = new THREE.Quaternion();
  const screenQ = new THREE.Quaternion();
  const out = new THREE.Quaternion();
  const fwd = new THREE.Vector3();

  const onEvent = (e) => {
    if (e.alpha == null && e.beta == null && e.gamma == null) return; // desktops can fire empty events
    reading = { a: e.alpha || 0, b: e.beta || 0, g: e.gamma || 0 };
  };
  window.addEventListener('deviceorientation', onEvent);

  // The camera's rotation in the room frame, lightly smoothed; null when there is no sensor data (desktop, or denied).
  function update(dt) {
    if (!reading) return null;
    euler.set(D(reading.b), D(reading.a), -D(reading.g), 'YXZ');
    raw.setFromEuler(euler).multiply(LOOK_OUT_BACK).multiply(screenQ.setFromAxisAngle(Z, -screenAngle()));
    if (!headingFix) {
      // Turn the frame so the first heading is -z: creatures placed "in front" start out in front of the player.
      fwd.set(0, 0, -1).applyQuaternion(raw);
      headingFix = new THREE.Quaternion().setFromAxisAngle(Y, -Math.atan2(-fwd.x, -fwd.z));
    }
    raw.premultiply(headingFix);
    if (!primed) { out.copy(raw); primed = true; } else out.slerp(raw, 1 - Math.exp(-dt * 20)); // hides sensor noise
    return out;
  }

  function dispose() { window.removeEventListener('deviceorientation', onEvent); }

  return { update, dispose, get active() { return !!reading; } };
}
