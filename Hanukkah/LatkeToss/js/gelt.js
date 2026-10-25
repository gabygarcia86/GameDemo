import * as THREE from 'three';
import { GELT, PHYSICS, POT } from './config.js';

const STEP = 1 / 120;
const PLATE = { x: 0, z: 3.2, radius: 0.6, height: 0.06 };
const TABLE = { minX: -8, maxX: 8, minZ: -10.5, maxZ: 5 };
const MENORAH = { x: -4.6, z: -7.6, radius: 1 };

let shared = null;

// Shared geometry and gold-foil materials, with a star of David embossed on both faces.
function sharedGelt() {
  if (shared) return shared;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size * 0.4, size * 0.35, 4, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#fff1b0');
  gradient.addColorStop(0.55, '#f2c14e');
  gradient.addColorStop(1, '#b07a18');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(120,75,10,0.75)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 5;
  for (let t = 0; t < 2; t++) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = -Math.PI / 2 + t * Math.PI + (i * Math.PI * 2) / 3;
      const x = size / 2 + Math.cos(angle) * 30;
      const y = size / 2 + Math.sin(angle) * 30;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  const faceMap = new THREE.CanvasTexture(canvas);
  faceMap.colorSpace = THREE.SRGBColorSpace;
  const side = new THREE.MeshStandardMaterial({ color: 0xe0a93a, roughness: 0.3, metalness: 0.9 });
  const face = new THREE.MeshStandardMaterial({ map: faceMap, roughness: 0.28, metalness: 0.85 });
  shared = {
    geometry: new THREE.CylinderGeometry(GELT.radius, GELT.radius, GELT.thickness, 28),
    materials: [side, face, face], // CylinderGeometry groups: side, top cap, bottom cap
  };
  return shared;
}

export function createGeltMesh() {
  const { geometry, materials } = sharedGelt();
  const coin = new THREE.Mesh(geometry, materials);
  coin.castShadow = true;
  coin.receiveShadow = true;
  return coin;
}

const _axis = new THREE.Vector3();
const _spin = new THREE.Quaternion();
const _normal = new THREE.Vector3();
const _flat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

class Coin {
  constructor(mesh) {
    this.mesh = mesh;
    this.position = mesh.position;
    this.previous = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.potLocal = new THREE.Vector3();
    this.state = 'idle'; // idle | waiting | falling | resting | inPot
    this.delay = 0;
    this.timer = 0;
    this.fade = 0;
    this.touched = false;
    this.spawnOrder = 0;
  }
}

/**
 * Pooled shower of gelt coins that rain from above the view, bounce on the table and pot,
 * settle flat, linger, then shrink away. Purely cosmetic: coins never affect the latkes.
 */
export class GeltShower {
  constructor(scene, audio, obstacles) {
    this.audio = audio;
    this.obstacles = obstacles;
    this.coins = [];
    this.spawnCounter = 0;
    this.lastClink = 0;
    this.time = 0;
    for (let i = 0; i < GELT.poolSize; i++) {
      const mesh = createGeltMesh();
      mesh.visible = false;
      scene.add(mesh);
      this.coins.push(new Coin(mesh));
    }
  }

  _takeCoin() {
    let pick = this.coins.find((coin) => coin.state === 'idle');
    if (!pick) {
      // Pool full: recycle the oldest coin.
      for (const coin of this.coins) if (!pick || coin.spawnOrder < pick.spawnOrder) pick = coin;
    }
    return pick;
  }

  // Random landing spot spread over the visible part of the table.
  _randomSpot(out) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const z = -8.5 + Math.random() * 12.3;
      const halfWidth = THREE.MathUtils.lerp(7, 4.2, (z + 8.5) / 12.3);
      const x = (Math.random() * 2 - 1) * halfWidth;
      if (Math.hypot(x - MENORAH.x, z - MENORAH.z) > MENORAH.radius) return out.set(x, 0, z);
    }
    return out.set(0, 0, 0);
  }

  /** Drops a shower of coins from above. */
  rain(count = GELT.coinsPerHit) {
    for (let i = 0; i < count; i++) {
      const coin = this._takeCoin();
      coin.spawnOrder = ++this.spawnCounter;
      this._randomSpot(coin.position);
      coin.position.y = GELT.spawnHeight + Math.random() * 1.5;
      coin.previous.copy(coin.position);
      coin.velocity.set((Math.random() - 0.5) * 0.6, -Math.random() * 1.5, (Math.random() - 0.5) * 0.6);
      coin.angularVelocity.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 18);
      _axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      coin.mesh.quaternion.setFromAxisAngle(_axis, Math.random() * Math.PI * 2);
      coin.mesh.scale.setScalar(1);
      coin.mesh.visible = false;
      coin.delay = Math.random() * GELT.spreadSeconds;
      coin.timer = 0;
      coin.fade = 0;
      coin.touched = false;
      coin.state = 'waiting';
    }
  }

  _floorAt(x, z) {
    if (Math.hypot(x - PLATE.x, z - PLATE.z) < PLATE.radius) return PLATE.height;
    if (x > TABLE.minX && x < TABLE.maxX && z > TABLE.minZ && z < TABLE.maxZ) return 0;
    return -Infinity;
  }

  _clink(strength) {
    if (this.time - this.lastClink < 0.06 || strength < 1.5) return;
    this.lastClink = this.time;
    this.audio.play('coin');
  }

  _flatten(quaternion, amount) {
    _normal.set(0, 1, 0).applyQuaternion(quaternion);
    if (_normal.y < 0) _normal.negate();
    _flat.setFromUnitVectors(_normal, _up).multiply(quaternion);
    quaternion.slerp(_flat, Math.min(1, amount));
  }

  _step(coin, h, potPosition) {
    const p = coin.position;
    coin.previous.copy(p);
    coin.velocity.y -= PHYSICS.gravity * h;
    p.addScaledVector(coin.velocity, h);
    const spin = coin.angularVelocity.length();
    if (spin > 1e-4) {
      _spin.setFromAxisAngle(_axis.copy(coin.angularVelocity).divideScalar(spin), spin * h);
      coin.mesh.quaternion.premultiply(_spin);
    }

    // Pot: drop into the oil through the opening, bounce off the rim, slide off the walls.
    const lx = p.x - potPosition.x;
    const lz = p.z - potPosition.z;
    const ly = p.y - potPosition.y;
    const previousLy = coin.previous.y - potPosition.y;
    const radial = Math.hypot(lx, lz);
    const outer = POT.outerRadius + GELT.radius;
    if (radial < outer && ly <= POT.rimHeight && ly > -GELT.thickness) {
      if (previousLy > POT.rimHeight && radial < POT.openingRadius - GELT.radius * 0.5) {
        coin.state = 'inPot';
        coin.potLocal.set(lx, POT.rimHeight, lz);
        coin.timer = 0;
        return;
      }
      const nx = radial > 1e-5 ? lx / radial : 1;
      const nz = radial > 1e-5 ? lz / radial : 0;
      if (previousLy > POT.rimHeight) {
        p.y = potPosition.y + POT.rimHeight;
        coin.velocity.y = Math.abs(coin.velocity.y) * GELT.restitution;
        coin.velocity.x += nx * 1.2;
        coin.velocity.z += nz * 1.2;
      } else {
        p.x = potPosition.x + nx * outer;
        p.z = potPosition.z + nz * outer;
        const radialVelocity = coin.velocity.x * nx + coin.velocity.z * nz;
        if (radialVelocity < 0) {
          coin.velocity.x -= 1.3 * radialVelocity * nx;
          coin.velocity.z -= 1.3 * radialVelocity * nz;
        }
      }
      this._clink(Math.abs(coin.velocity.y) + 2);
    }

    // Dreidels: push coins out of their footprint.
    for (const dreidel of this.obstacles) {
      const dx = p.x - dreidel.position.x;
      const dz = p.z - dreidel.position.z;
      const reach = dreidel.userData.hitRadius + GELT.radius;
      const distance = Math.hypot(dx, dz);
      if (distance < reach && p.y < dreidel.userData.hitHeight) {
        const nx = distance > 1e-5 ? dx / distance : 1;
        const nz = distance > 1e-5 ? dz / distance : 0;
        p.x = dreidel.position.x + nx * reach;
        p.z = dreidel.position.z + nz * reach;
        coin.velocity.x = nx * 1.5;
        coin.velocity.z = nz * 1.5;
      }
    }

    const floor = this._floorAt(p.x, p.z);
    const rest = floor + GELT.thickness * 0.5;
    if (p.y <= rest && coin.previous.y >= rest - 0.2) {
      p.y = rest;
      const impact = -coin.velocity.y;
      coin.velocity.y = impact > 0.8 ? impact * GELT.restitution : 0;
      coin.velocity.x *= 0.7;
      coin.velocity.z *= 0.7;
      coin.angularVelocity.multiplyScalar(0.55);
      coin.touched = true;
      this._clink(impact);
      if (coin.velocity.lengthSq() < 0.04) {
        coin.velocity.set(0, 0, 0);
        coin.angularVelocity.set(0, 0, 0);
        coin.state = 'resting';
        coin.timer = 0;
      }
    }
    if (coin.touched) this._flatten(coin.mesh.quaternion, 8 * h);
    if (p.y < -4) this._retire(coin);
  }

  _retire(coin) {
    coin.state = 'idle';
    coin.mesh.visible = false;
  }

  /** Advances the shower. potPosition is the pot base in world space. Skip while paused. */
  update(dt, potPosition) {
    this.time += dt;
    const steps = Math.min(8, Math.ceil(dt / STEP));
    const h = steps > 0 ? dt / steps : 0;
    for (const coin of this.coins) {
      switch (coin.state) {
        case 'waiting':
          coin.delay -= dt;
          if (coin.delay <= 0) {
            coin.state = 'falling';
            coin.mesh.visible = true;
          }
          break;
        case 'falling':
          for (let i = 0; i < steps && coin.state === 'falling'; i++) this._step(coin, h, potPosition);
          break;
        case 'resting': {
          // A sliding pot shoves resting coins out of its way.
          const dx = coin.position.x - potPosition.x;
          const dz = coin.position.z - potPosition.z;
          const radial = Math.hypot(dx, dz);
          const below = coin.position.y - potPosition.y;
          if (radial < POT.outerRadius + GELT.radius && below > -GELT.thickness && below < POT.rimHeight) {
            const nx = radial > 1e-5 ? dx / radial : 1;
            const nz = radial > 1e-5 ? dz / radial : 0;
            coin.velocity.set(nx * 2, 1.2, nz * 2);
            coin.state = 'falling';
            break;
          }
          coin.timer += dt;
          this._flatten(coin.mesh.quaternion, 8 * dt);
          if (coin.timer > GELT.lingerSeconds) {
            coin.fade += dt / 0.4;
            coin.mesh.scale.setScalar(Math.max(0.001, 1 - coin.fade));
            if (coin.fade >= 1) this._retire(coin);
          }
          break;
        }
        case 'inPot':
          // Fall to the oil and sink, following the pot as it moves.
          coin.timer += dt;
          coin.potLocal.y = Math.max(POT.oilHeight - 0.12, POT.rimHeight - coin.timer * 2.2);
          coin.position.set(
            potPosition.x + coin.potLocal.x,
            potPosition.y + coin.potLocal.y,
            potPosition.z + coin.potLocal.z,
          );
          if (coin.timer > 0.6) this._retire(coin);
          break;
        default:
          break;
      }
    }
  }

  clear() {
    for (const coin of this.coins) this._retire(coin);
  }
}
