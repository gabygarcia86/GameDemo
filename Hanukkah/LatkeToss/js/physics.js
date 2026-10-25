import * as THREE from 'three';
import { PHYSICS, POT, LATKE, DREIDEL } from './config.js';

export const LatkeState = Object.freeze({
  INACTIVE: 'inactive',
  AIMING: 'aiming',
  AIRBORNE: 'airborne',
  SUCCESS: 'success',
  MISS: 'miss',
});

export const CollisionResult = Object.freeze({
  NONE: 0,
  SUCCESS: 1,
  RIM: 2,
  WALL: 3,
  TABLE: 4,
  OUT_OF_BOUNDS: 5,
  // Passed through the opening while scoring is disabled (e.g. after the buzzer).
  ENTERED: 6,
});

const TABLE_BOUNDS = { minX: -8, maxX: 8, minZ: -10.5, maxZ: 5 };
const _axis = new THREE.Vector3();
const _deltaRotation = new THREE.Quaternion();
const _localPrevious = new THREE.Vector3();
const _localCurrent = new THREE.Vector3();

/**
 * Physics state for one thrown latke. Positions are world space; the render loop
 * interpolates between previousPosition and position for smooth motion at any frame rate.
 */
export class LatkeBody {
  constructor() {
    this.position = new THREE.Vector3();
    this.previousPosition = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.acceleration = new THREE.Vector3(0, -PHYSICS.gravity, 0);
    // World-space angular velocity (radians / s).
    this.angularVelocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.previousQuaternion = new THREE.Quaternion();
    this.state = LatkeState.INACTIVE;
    this.flightTime = 0;
    this.touchedPot = false;
    this.touchedTable = false;
    this.restingTime = 0;
  }

  reset(position, quaternion) {
    this.position.copy(position);
    this.previousPosition.copy(position);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.quaternion.copy(quaternion);
    this.previousQuaternion.copy(quaternion);
    this.acceleration.set(0, -PHYSICS.gravity, 0);
    this.flightTime = 0;
    this.touchedPot = false;
    this.touchedTable = false;
    this.restingTime = 0;
  }
}

/**
 * Semi-implicit Euler step: velocity is updated from gravity first, then position from
 * the new velocity. simulateTrajectory() uses exactly the same update, so the aiming
 * preview matches the real throw.
 */
export function integrateLinear(position, velocity, acceleration, dt) {
  velocity.addScaledVector(acceleration, dt);
  position.addScaledVector(velocity, dt);
}

// Rotates a quaternion by a world-space angular velocity over dt.
export function integrateAngular(quaternion, angularVelocity, dt) {
  const speed = angularVelocity.length();
  if (speed < 1e-6) return;
  _axis.copy(angularVelocity).divideScalar(speed);
  _deltaRotation.setFromAxisAngle(_axis, speed * dt);
  quaternion.premultiply(_deltaRotation).normalize();
}

export function stepBody(body, dt) {
  body.previousPosition.copy(body.position);
  body.previousQuaternion.copy(body.quaternion);
  integrateLinear(body.position, body.velocity, body.acceleration, dt);
  integrateAngular(body.quaternion, body.angularVelocity, dt);
  body.flightTime += dt;
}

const _simPosition = new THREE.Vector3();
const _simVelocity = new THREE.Vector3();
const _simGravity = new THREE.Vector3();

/**
 * Predicts the throw arc with the same fixed timestep and integrator as the real physics.
 * Writes up to maxPoints samples (one every sampleInterval seconds) into outPoints and
 * returns how many were written. Stops when the arc reaches the table or maxTime.
 */
export function simulateTrajectory(start, velocity, outPoints, maxPoints, sampleInterval, maxTime) {
  const dt = PHYSICS.fixedTimestep;
  _simPosition.copy(start);
  _simVelocity.copy(velocity);
  _simGravity.set(0, -PHYSICS.gravity, 0);
  let written = 0;
  let nextSample = sampleInterval;
  for (let time = 0; time < maxTime && written < maxPoints; time += dt) {
    integrateLinear(_simPosition, _simVelocity, _simGravity, dt);
    if (time + dt >= nextSample) {
      outPoints[written].copy(_simPosition);
      written++;
      nextSample += sampleInterval;
    }
    if (_simPosition.y < 0 && _simVelocity.y < 0) break;
  }
  return written;
}

/**
 * Collision against the pot, in the pot's local frame.
 *
 * The latke's motion this step is converted into pot-local coordinates using the pot's
 * position at the start of the step (potPrevious) and at the end (potCurrent). Using the
 * relative motion means a moving pot can "catch" a latke and fast throws can't skip the
 * opening between steps: we look for the segment crossing the opening plane rather than
 * testing a single point.
 *
 * Returns a CollisionResult; on SUCCESS, outLocalHit receives the pot-local crossing point.
 */
export function collideWithPot(body, potPrevious, potCurrent, allowScoring, outLocalHit) {
  // Pot-local position = world position - pot base position (the pot never rotates).
  _localPrevious.copy(body.previousPosition).sub(potPrevious);
  _localCurrent.copy(body.position).sub(potCurrent);

  const rimY = POT.rimHeight;
  const latkeRadius = LATKE.radius;
  // Usable opening: the latke may overhang the inner rim edge by part of its radius.
  const scoringRadius = POT.openingRadius - latkeRadius * (1 - POT.latkeOverhangAllowance);
  const rimOuterRadius = POT.outerRadius + latkeRadius * 0.45;

  // 1) Did the latke's center cross the opening plane moving downward (relative to the pot)?
  if (_localPrevious.y > rimY && _localCurrent.y <= rimY) {
    const t = (_localPrevious.y - rimY) / (_localPrevious.y - _localCurrent.y);
    const hitX = _localPrevious.x + (_localCurrent.x - _localPrevious.x) * t;
    const hitZ = _localPrevious.z + (_localCurrent.z - _localPrevious.z) * t;
    const radial = Math.hypot(hitX, hitZ);

    if (radial <= scoringRadius) {
      outLocalHit.set(hitX, rimY, hitZ);
      // Scoring disabled (resolved latke or round over): it still drops in, but quietly.
      return allowScoring ? CollisionResult.SUCCESS : CollisionResult.ENTERED;
    }
    if (radial <= rimOuterRadius) {
      // Clipped the rim: knock it back up and outward so it can't sneak in sideways.
      const nx = radial > 1e-5 ? hitX / radial : 1;
      const nz = radial > 1e-5 ? hitZ / radial : 0;
      body.position.set(
        potCurrent.x + nx * (rimOuterRadius + 0.02),
        potCurrent.y + rimY + 0.02,
        potCurrent.z + nz * (rimOuterRadius + 0.02),
      );
      const outwardSpeed = Math.max(1.2, body.velocity.x * nx + body.velocity.z * nz);
      body.velocity.x = nx * outwardSpeed * 0.8 + body.velocity.x * 0.2;
      body.velocity.z = nz * outwardSpeed * 0.8 + body.velocity.z * 0.2;
      body.velocity.y = Math.abs(body.velocity.y) * PHYSICS.potRestitution;
      body.angularVelocity.multiplyScalar(0.6);
      body.touchedPot = true;
      return CollisionResult.RIM;
    }
    return CollisionResult.NONE;
  }

  // 2) Outer wall: below the rim, the pot is a solid cylinder from the outside.
  if (_localCurrent.y < rimY && _localCurrent.y > -LATKE.thickness) {
    const radial = Math.hypot(_localCurrent.x, _localCurrent.z);
    const previousRadial = Math.hypot(_localPrevious.x, _localPrevious.z);
    const wallRadius = POT.outerRadius + latkeRadius * 0.4;
    const wasOutside = previousRadial >= POT.openingRadius || _localPrevious.y < 0;
    if (radial < wallRadius && wasOutside) {
      const nx = radial > 1e-5 ? _localCurrent.x / radial : 1;
      const nz = radial > 1e-5 ? _localCurrent.z / radial : 0;
      if (_localPrevious.y < 0 && _localCurrent.y >= 0 && radial < POT.outerRadius) {
        // Pot came down on top of the latke (Hard mode): push the latke under it.
        body.position.y = potCurrent.y - LATKE.thickness;
        body.velocity.y = Math.min(body.velocity.y, -1);
      } else {
        body.position.x = potCurrent.x + nx * wallRadius;
        body.position.z = potCurrent.z + nz * wallRadius;
        const radialVelocity = body.velocity.x * nx + body.velocity.z * nz;
        if (radialVelocity < 0) {
          body.velocity.x -= (1 + PHYSICS.potRestitution) * radialVelocity * nx;
          body.velocity.z -= (1 + PHYSICS.potRestitution) * radialVelocity * nz;
        }
      }
      body.angularVelocity.multiplyScalar(0.7);
      body.touchedPot = true;
      return CollisionResult.WALL;
    }
  }
  return CollisionResult.NONE;
}

/**
 * Latke vs. dreidel, treating the dreidel as an upright cylinder (hitRadius, hitHeight in
 * its userData). On contact the latke is pushed out and bounced off. Returns true on hit.
 */
export function collideWithDreidel(body, dreidel) {
  const p = body.position;
  const data = dreidel.userData;
  if (p.y > data.hitHeight + LATKE.thickness || p.y < -LATKE.thickness) return false;
  const dx = p.x - dreidel.position.x;
  const dz = p.z - dreidel.position.z;
  const reach = data.hitRadius + LATKE.radius * 0.6;
  const distance = Math.hypot(dx, dz);
  if (distance >= reach) return false;

  const nx = distance > 1e-5 ? dx / distance : 0;
  const nz = distance > 1e-5 ? dz / distance : 1;
  p.x = dreidel.position.x + nx * reach;
  p.z = dreidel.position.z + nz * reach;
  const radialVelocity = body.velocity.x * nx + body.velocity.z * nz;
  if (radialVelocity < 0) {
    body.velocity.x -= (1 + DREIDEL.restitution) * radialVelocity * nx;
    body.velocity.z -= (1 + DREIDEL.restitution) * radialVelocity * nz;
  }
  body.velocity.x *= 0.8;
  body.velocity.z *= 0.8;
  body.angularVelocity.multiplyScalar(0.7);
  return true;
}

/**
 * Table-top contact. Returns TABLE on the first contact of a bounce, OUT_OF_BOUNDS when the
 * latke has left the play area, otherwise NONE. Bounces are heavily damped so misses settle
 * quickly instead of bouncing around the scene.
 */
export function collideWithTable(body, dt) {
  const p = body.position;
  const b = PHYSICS.bounds;
  if (p.y < b.minY || p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) {
    return CollisionResult.OUT_OF_BOUNDS;
  }
  const overTable = p.x > TABLE_BOUNDS.minX && p.x < TABLE_BOUNDS.maxX
    && p.z > TABLE_BOUNDS.minZ && p.z < TABLE_BOUNDS.maxZ;
  const restHeight = LATKE.thickness * 0.5;
  if (!overTable || p.y > restHeight || body.previousPosition.y < -0.2) return CollisionResult.NONE;

  p.y = restHeight;
  const impactSpeed = -body.velocity.y;
  if (impactSpeed > 0.6) {
    body.velocity.y = impactSpeed * PHYSICS.tableRestitution;
  } else {
    body.velocity.y = 0;
  }
  body.velocity.x *= PHYSICS.tableFriction;
  body.velocity.z *= PHYSICS.tableFriction;
  body.angularVelocity.multiplyScalar(0.45);
  if (body.velocity.lengthSq() < 0.05) {
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.restingTime += dt;
  }
  const firstContact = !body.touchedTable;
  body.touchedTable = true;
  return firstContact ? CollisionResult.TABLE : CollisionResult.NONE;
}
