// Ambient Halloween creatures, built from Three.js primitives only (no model files), like pumpkin.js.
//   Bats   circle overhead (8-35 degrees above the horizon) while the player is scanning for a photo, and fly up and
//          away once a pumpkin appears.
//   Ghosts float at about eye level all around the player, drifting slowly, fading in and out. While a pumpkin is up,
//          a ghost that ends up in the middle of the view fades away so it never covers the pumpkin.
// They live in a ROOM frame centred on the player: +y up, -z the way the phone first faced (see orientation.js). The
// phone's motion sensors rotate that frame against the camera, so the creatures stay put in the room as the phone turns.
// Without sensors (desktop, or permission denied) the camera is treated as held level and facing -z.
// Units are the tracker's (a photo filling most of the view is roughly 3000 away); creatures are placed 2500-7000 away.

import * as THREE from './vendor/three/three.module.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ---------------------------------------------------------------- bat
// Local space: +z is forward (the direction of flight), +y up, wings along x. Wingspan is about 1.1 units.
function buildWingGeometry() {
  // Right wing drawn flat in XY with the shoulder at the origin; +y here is the trailing (rear) edge.
  const s = new THREE.Shape();
  s.moveTo(0, -0.03);
  s.quadraticCurveTo(0.2, -0.12, 0.36, -0.07); // leading edge (the arm)
  s.lineTo(0.52, 0.02);                        // wing tip
  let px = 0.52;
  let py = 0.02;
  for (const [x, y] of [[0.38, 0.15], [0.23, 0.2], [0.09, 0.15], [0, 0.07]]) {
    s.quadraticCurveTo((px + x) / 2, Math.min(py, y) - 0.04, x, y); // scalloped membrane between the finger bones
    px = x;
    py = y;
  }
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateX(-Math.PI / 2); // lie flat: the trailing edge now points to -z (backward)
  return g;
}

function buildBatParts() {
  return {
    bodyGeo: new THREE.SphereGeometry(0.08, 12, 8),
    headGeo: new THREE.SphereGeometry(0.058, 10, 8),
    earGeo: new THREE.ConeGeometry(0.022, 0.07, 4),
    eyeGeo: new THREE.SphereGeometry(0.012, 6, 4),
    wingGeo: buildWingGeometry(),
    // A faint purple glow keeps them readable against a dark sky or night-time photos.
    furMat: new THREE.MeshStandardMaterial({ color: '#241829', emissive: '#2a0f3a', roughness: 0.85 }),
    wingMat: new THREE.MeshStandardMaterial({ color: '#33223f', emissive: '#2a1040', roughness: 0.7, side: THREE.DoubleSide }),
    eyeMat: new THREE.MeshBasicMaterial({ color: '#ff6a1f' }),
  };
}

function createBat(parts) {
  const obj = new THREE.Group();
  obj.name = 'bat';
  const model = new THREE.Group(); // bobs with the wingbeat
  obj.add(model);

  const body = new THREE.Mesh(parts.bodyGeo, parts.furMat);
  body.scale.set(0.8, 0.75, 1.4);
  model.add(body);
  const head = new THREE.Mesh(parts.headGeo, parts.furMat);
  head.position.set(0, 0.025, 0.13);
  model.add(head);

  const wings = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(parts.earGeo, parts.furMat);
    ear.position.set(0.028 * side, 0.085, 0.12);
    ear.rotation.z = -0.35 * side;
    model.add(ear);
    const eye = new THREE.Mesh(parts.eyeGeo, parts.eyeMat);
    eye.position.set(0.024 * side, 0.04, 0.178);
    model.add(eye);

    const pivot = new THREE.Group(); // the shoulder joint
    pivot.position.set(0.045 * side, 0.01, 0.02);
    const wing = new THREE.Mesh(parts.wingGeo, parts.wingMat);
    wing.scale.x = side; // mirrored for the left wing (the material is double-sided)
    pivot.add(wing);
    model.add(pivot);
    wings.push({ pivot, side });
  }

  obj.visible = false;
  return {
    obj, model, wings,
    stage: 'away',          // away | arriving | circling | leaving
    delay: rand(0, 3),
    centre: new THREE.Vector3(), // middle of the circle it flies around
    radius: 1000,
    angle: 0,
    turnRate: 0.7,          // radians per second around the circle (sign = direction)
    lift: 0,                // extra height while arriving from / leaving to the sky
    circleTime: 0,          // seconds left before it flies off and returns near wherever the player now faces
    relocating: false,
    prev: new THREE.Vector3(),
    phase: rand(0, TAU),
    flapHz: rand(5.5, 8),
    seed: rand(0, TAU),
    time: 0,
  };
}

// ---------------------------------------------------------------- ghost
// Local space: +z faces the viewer, +y up. About 1 unit tall, origin at the middle of the body.
function buildGhostGeometry() {
  const profile = [
    [0.001, 0.5], [0.1, 0.485], [0.19, 0.44], [0.26, 0.37], [0.3, 0.27], [0.32, 0.15], [0.33, 0.02],
    [0.34, -0.08], [0.35, -0.18], [0.362, -0.26], [0.375, -0.34], [0.39, -0.42],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(profile, 36);
}

function buildGhostParts() {
  return {
    eyeGeo: new THREE.SphereGeometry(0.045, 10, 8),
    armGeo: new THREE.CapsuleGeometry(0.05, 0.13, 4, 8),
    bodyMat: new THREE.MeshStandardMaterial({
      color: '#f1f6ff', emissive: '#9cbcff', emissiveIntensity: 0.35, roughness: 0.45,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }),
    faceMat: new THREE.MeshBasicMaterial({ color: '#170d22', transparent: true, depthWrite: false }),
  };
}

function createGhost(parts) {
  const obj = new THREE.Group();
  obj.name = 'ghost';
  // Each ghost fades on its own, so it gets its own material copies; the hem waves, so its own geometry too.
  const bodyMat = parts.bodyMat.clone();
  const faceMat = parts.faceMat.clone();
  const geo = buildGhostGeometry();
  const base = Float32Array.from(geo.attributes.position.array);

  obj.add(new THREE.Mesh(geo, bodyMat));
  const face = [
    { x: -0.1, y: 0.28, z: 0.272, s: [1, 1.35, 0.35] },  // eyes
    { x: 0.1, y: 0.28, z: 0.272, s: [1, 1.35, 0.35] },
    { x: 0, y: 0.12, z: 0.318, s: [0.9, 1.25, 0.35] },   // "oooh" mouth
  ];
  for (const f of face) {
    const m = new THREE.Mesh(parts.eyeGeo, faceMat);
    m.position.set(f.x, f.y, f.z);
    m.scale.set(...f.s);
    m.renderOrder = 1; // drawn after the see-through body
    obj.add(m);
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(parts.armGeo, bodyMat);
    arm.position.set(0.34 * side, 0.03, 0.02);
    obj.add(arm);
    arms.push({ arm, side });
  }

  obj.visible = false;
  return {
    obj, geo, base, bodyMat, faceMat, arms,
    stage: 'wait',          // wait | in | float | out
    wait: rand(0.5, 4),
    life: 0,
    fade: 0,
    seed: rand(0, TAU),
    azimuth: 0,             // direction around the player (radians, 0 = -z)
    distance: 5000,
    height: 0,
    orbit: 0,               // slow drift around the player (radians per second)
    time: 0,
  };
}

// Wavy hem: the lower part of the sheet ripples around the body.
function waveHem(g) {
  const pos = g.geo.attributes.position;
  const a = pos.array;
  const b = g.base;
  for (let i = 0; i < a.length; i += 3) {
    const y = b[i + 1];
    if (y > 0.05) continue;
    const w = Math.pow((0.05 - y) / 0.47, 2);
    const ang = Math.atan2(b[i + 2], b[i]);
    const r = 1 + 0.05 * w * Math.sin(3 * ang - g.time * 3 + g.seed);
    a[i] = b[i] * r;
    a[i + 1] = y + 0.045 * w * Math.sin(7 * ang + g.time * 4 + g.seed);
    a[i + 2] = b[i + 2] * r;
  }
  pos.needsUpdate = true;
}

// Point at the given azimuth (0 = -z, positive = turning left), horizontal distance and height.
function roomPoint(out, azimuth, distance, height) {
  return out.set(-Math.sin(azimuth) * distance, height, -Math.cos(azimuth) * distance);
}

// ---------------------------------------------------------------- the flock
export function createCreatures(config) {
  const cfg = config.creatures || {};
  const enabled = cfg.enabled !== false;
  // `root` turns the room frame into camera space each frame (the inverse of the phone's rotation).
  const root = new THREE.Group();
  root.name = 'creatures';

  const batParts = buildBatParts();
  const ghostParts = buildGhostParts();
  const bats = [];
  const ghosts = [];
  const batCount = enabled ? (cfg.bats ?? 5) : 0;
  const ghostCount = enabled ? (cfg.ghosts ?? 3) : 0;
  for (let i = 0; i < batCount; i++) { const b = createBat(batParts); bats.push(b); root.add(b.obj); }
  for (let i = 0; i < ghostCount; i++) { const g = createGhost(ghostParts); ghosts.push(g); root.add(g.obj); }

  let mode = 'off'; // off | scanning | playing
  let heading = 0;  // azimuth the camera currently faces
  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();

  // Turn obj so its +z faces `target` (both in the room frame), staying upright.
  function face(obj, target) {
    m4.lookAt(target, obj.position, UP);
    obj.quaternion.setFromRotationMatrix(m4);
  }

  // ---- bats
  function startCircle(b) {
    // Mostly ahead of the player, so a few circle at the top of the view and more show when they look up.
    const az = heading + (Math.random() < 0.7 ? rand(-0.6, 0.6) : rand(-Math.PI, Math.PI));
    const dist = rand(2200, 4000);
    const elevation = THREE.MathUtils.degToRad(rand(8, 35));
    roomPoint(b.centre, az, dist, dist * Math.tan(elevation));
    b.radius = rand(800, 1600); // wide circles, so they sweep in and out of view
    b.turnRate = rand(0.45, 0.85) * (Math.random() < 0.5 ? -1 : 1);
    b.angle = rand(0, TAU);
    b.circleTime = rand(12, 20);
    b.obj.scale.setScalar(rand(280, 400) / 1.1); // wingspan in room units
  }

  function updateBat(b, dt) {
    b.time += dt;
    if (b.stage === 'away') {
      if (mode !== 'scanning') return;
      b.delay -= dt;
      if (b.delay > 0) return;
      startCircle(b);
      b.lift = rand(2500, 4000); // swoop down out of the sky
      b.stage = 'arriving';
      b.obj.visible = true;
    }
    if (mode !== 'scanning' && b.stage !== 'leaving') { b.stage = 'leaving'; b.relocating = false; }
    else if (mode === 'scanning' && b.stage === 'leaving' && !b.relocating) b.stage = 'arriving';

    if (b.stage === 'arriving') {
      b.lift *= Math.exp(-dt * 1.2);
      if (b.lift < 5) { b.lift = 0; b.stage = 'circling'; }
    } else if (b.stage === 'circling') {
      b.circleTime -= dt;
      if (b.circleTime <= 0) { b.stage = 'leaving'; b.relocating = true; }
    } else if (b.stage === 'leaving') {
      b.lift += dt * (800 + b.lift * 1.5); // climbs faster and faster
      if (b.lift > 9000) {
        b.stage = 'away';
        b.obj.visible = false;
        b.delay = b.relocating ? rand(0.2, 1) : rand(0.3, 2.5);
        b.relocating = false;
        return;
      }
    }

    b.angle += b.turnRate * dt;
    const p = b.obj.position;
    b.prev.copy(p);
    p.set(
      b.centre.x + Math.cos(b.angle) * b.radius,
      b.centre.y + b.lift + Math.sin(b.time * 1.3 + b.seed) * 120,
      b.centre.z + Math.sin(b.angle) * b.radius
    );
    tmp.subVectors(p, b.prev);
    if (tmp.lengthSq() > 1e-6) face(b.obj, look.copy(p).add(tmp));

    b.phase += dt * b.flapHz * TAU;
    const s = Math.sin(b.phase);
    for (const w of b.wings) w.pivot.rotation.z = w.side * (0.2 + 0.8 * s);
    b.model.position.y = -0.03 * s;
  }

  // ---- ghosts
  function spawnGhost(g) {
    // Anywhere around the player except straight ahead, so a ghost never pops up in their face.
    const side = Math.random() < 0.5 ? -1 : 1;
    g.azimuth = heading + side * rand(0.15, Math.PI);
    g.distance = rand(4000, 6500);
    g.height = g.distance * rand(-0.06, 0.12);
    g.orbit = rand(0.02, 0.06) * (Math.random() < 0.5 ? -1 : 1);
    g.obj.scale.setScalar(g.distance * rand(0.09, 0.13)); // about 5-7 degrees tall
    g.stage = 'in';
    g.fade = 0;
    g.life = rand(7, 12);
    g.obj.visible = true;
  }

  // True when the ghost sits near the middle of the camera's view (where the pumpkin is).
  function inCentreOfView(g, viewQuatInv) {
    tmp.copy(g.obj.position).applyQuaternion(viewQuatInv);
    return tmp.z < 0 && Math.hypot(tmp.x, tmp.y) < -tmp.z * 0.4; // within ~22 degrees of straight ahead
  }

  function updateGhost(g, dt, viewQuatInv) {
    g.time += dt;
    if (g.stage === 'wait') {
      if (mode === 'off') return;
      g.wait -= dt;
      if (g.wait > 0) return;
      spawnGhost(g);
    }

    g.azimuth += g.orbit * dt;
    roomPoint(g.obj.position, g.azimuth, g.distance, g.height + Math.sin(g.time * 1.4 + g.seed) * g.distance * 0.012);
    face(g.obj, ORIGIN); // always turned toward the player
    g.obj.rotateZ(Math.sin(g.time * 1.1 + g.seed) * 0.12);
    for (const a of g.arms) a.arm.rotation.z = a.side * (-1.15 + 0.25 * Math.sin(g.time * 2.2 + g.seed + a.side));
    waveHem(g);

    if (g.stage === 'in') {
      g.fade = Math.min(1, g.fade + dt / 1.2);
      if (g.fade >= 1) g.stage = 'float';
    } else if (g.stage === 'float') {
      g.life -= dt;
      const blocking = mode === 'playing' && inCentreOfView(g, viewQuatInv);
      if (g.life <= 0 || mode === 'off' || blocking) g.stage = 'out';
    } else if (g.stage === 'out') {
      g.fade = Math.max(0, g.fade - dt / 1);
      if (g.fade <= 0) {
        g.stage = 'wait';
        g.wait = rand(2, 6);
        g.obj.visible = false;
      }
    }
    const k = clamp01(g.fade);
    g.bodyMat.opacity = 0.6 * k;
    g.faceMat.opacity = 0.9 * k;
  }

  // viewQuat: the camera's rotation in the room frame (from orientation.js), or null for "level, facing -z".
  function update(dt, viewQuat) {
    if (!enabled || dt <= 0) return;
    if (viewQuat) {
      root.quaternion.copy(viewQuat).invert();
      tmp.set(0, 0, -1).applyQuaternion(viewQuat);
      heading = Math.atan2(-tmp.x, -tmp.z);
    } else {
      root.quaternion.identity();
      heading = 0;
    }
    for (const b of bats) updateBat(b, dt);
    for (const g of ghosts) updateGhost(g, dt, root.quaternion);
  }

  function setMode(m) { mode = m; }

  // Debug / tests: how many are out, and how many of those are inside the camera's view right now.
  function info(cam) {
    const onScreen = (list) => list.filter((c) => {
      if (!c.obj.visible) return false;
      tmp.copy(c.obj.position).applyQuaternion(root.quaternion);
      if (tmp.z >= 0) return false;
      tmp.applyMatrix4(cam.projectionMatrix);
      return Math.abs(tmp.x) <= 1 && Math.abs(tmp.y) <= 1;
    }).length;
    return {
      mode,
      bats: bats.filter((b) => b.obj.visible).length,
      ghosts: ghosts.filter((g) => g.obj.visible).length,
      batsInView: onScreen(bats),
      ghostsInView: onScreen(ghosts),
    };
  }

  function dispose() {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    for (const m of [batParts.furMat, batParts.wingMat, batParts.eyeMat, ghostParts.bodyMat, ghostParts.faceMat]) m.dispose();
    root.removeFromParent();
  }

  return { root, update, setMode, info, dispose };
}
