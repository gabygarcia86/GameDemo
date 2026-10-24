// Ambient Halloween creatures, built from Three.js primitives only (no model files), like pumpkin.js.
//   Bats   swarm across the view while the player is scanning for a photo, and fly off once a pumpkin appears.
//   Ghosts fade in at random spots, drift and bob for a few seconds, then fade out. While a pumpkin is up they keep
//          to the sides of the screen so they never cover it.
// The tracker only knows where the photos are, not the room, so the creatures live in CAMERA space: the scene camera
// sits at the origin looking down -z, and every position is picked inside its view frustum. Sizes and speeds are
// expressed as fractions of the view height at the creature's depth, so they look the same on any camera.

import * as THREE from './vendor/three/three.module.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ---------------------------------------------------------------- view helpers
function tanHalfFov(cam) {
  return Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
}

// Point at normalised screen coords (ndcX, ndcY in -1..1 = edge to edge) and the given depth in front of the camera.
function pointInView(out, cam, ndcX, ndcY, depth) {
  const hh = depth * tanHalfFov(cam);
  return out.set(ndcX * hh * cam.aspect, ndcY * hh, -depth);
}

function ndcOf(p, cam) {
  const hh = Math.max(1e-6, -p.z * tanHalfFov(cam));
  return { x: p.x / (hh * cam.aspect), y: p.y / hh };
}

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
    // A faint purple glow keeps them readable against dark night-time photos.
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
    vel: new THREE.Vector3(),
    goal: new THREE.Vector3(),
    active: false,
    leaving: false,
    delay: rand(0, 2.5),
    phase: rand(0, TAU),
    flapHz: rand(5.5, 8),
    speed: rand(0.55, 0.9), // view half-heights per second
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
    wait: rand(0.3, 3),
    life: 0,
    fade: 0,
    seed: rand(0, TAU),
    home: new THREE.Vector3(),
    drift: new THREE.Vector3(),
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

// ---------------------------------------------------------------- the flock
export function createCreatures(config) {
  const cfg = config.creatures || {};
  const enabled = cfg.enabled !== false;
  const near = cfg.nearDepth || 1200;
  const far = cfg.farDepth || 6000;
  const root = new THREE.Group();
  root.name = 'creatures';

  const batParts = buildBatParts();
  const ghostParts = buildGhostParts();
  const bats = [];
  const ghosts = [];
  const batCount = enabled ? (cfg.bats ?? 9) : 0;
  const ghostCount = enabled ? (cfg.ghosts ?? 4) : 0;
  for (let i = 0; i < batCount; i++) { const b = createBat(batParts); bats.push(b); root.add(b.obj); }
  for (let i = 0; i < ghostCount; i++) { const g = createGhost(ghostParts); ghosts.push(g); root.add(g.obj); }

  let mode = 'off'; // off | scanning | playing
  const tmp = new THREE.Vector3();

  // ---- bats
  function pickBatGoal(b, cam) {
    pointInView(b.goal, cam, rand(-0.85, 0.85), rand(-0.65, 0.8), rand(near, far));
  }

  function enterBat(b, cam) {
    const depth = rand(near, far);
    const side = Math.random() < 0.5 ? -1 : 1;
    pointInView(b.obj.position, cam, side * 1.35, rand(-0.5, 0.9), depth);
    // Wingspan 10-16% of the view height at mid depth, so nearer bats look bigger.
    const span = rand(0.1, 0.16) * 2 * ((near + far) / 2) * tanHalfFov(cam);
    b.obj.scale.setScalar(span / 1.1);
    pickBatGoal(b, cam);
    b.vel.set(0, 0, 0);
    b.active = true;
    b.leaving = false;
    b.obj.visible = true;
  }

  function updateBat(b, dt, cam) {
    if (!b.active) {
      if (mode !== 'scanning') return;
      b.delay -= dt;
      if (b.delay > 0) return;
      enterBat(b, cam);
    }
    const p = b.obj.position;
    if (mode !== 'scanning' && !b.leaving) {
      // Scatter: head for whichever side is closer, and up, out of view.
      b.leaving = true;
      const n = ndcOf(p, cam);
      pointInView(b.goal, cam, (n.x < 0 ? -1 : 1) * 2.2, rand(0.6, 1.6), Math.max(near, -p.z));
    } else if (mode === 'scanning' && b.leaving) {
      b.leaving = false;
      pickBatGoal(b, cam);
    }

    const unit = Math.max(near * 0.5, -p.z) * tanHalfFov(cam); // half the view height at this depth
    tmp.subVectors(b.goal, p);
    if (!b.leaving && tmp.length() < 0.3 * unit) { pickBatGoal(b, cam); tmp.subVectors(b.goal, p); }
    tmp.normalize().multiplyScalar(b.speed * unit * (b.leaving ? 1.6 : 1));
    b.vel.lerp(tmp, 1 - Math.exp(-dt * 2.2)); // smooth, swooping turns
    p.addScaledVector(b.vel, dt);
    if (b.vel.lengthSq() > 1e-6) b.obj.lookAt(tmp.copy(p).add(b.vel));

    b.phase += dt * b.flapHz * TAU;
    const s = Math.sin(b.phase);
    for (const w of b.wings) w.pivot.rotation.z = w.side * (0.2 + 0.8 * s);
    b.model.position.y = -0.03 * s;

    if (b.leaving) {
      const n = ndcOf(p, cam);
      if (Math.abs(n.x) > 1.5 || n.y > 1.5) {
        b.active = false;
        b.obj.visible = false;
        b.delay = rand(0.2, 2.5);
      }
    }
  }

  // ---- ghosts
  function spawnGhost(g, cam) {
    const depth = rand(near * 1.2, far * 0.85);
    const side = Math.random() < 0.5 ? -1 : 1;
    // While a pumpkin is up, only the outer parts of the screen.
    const nx = mode === 'playing' ? side * rand(0.55, 0.85) : rand(-0.8, 0.8);
    pointInView(g.home, cam, nx, rand(-0.5, 0.55), depth);
    const unit = depth * tanHalfFov(cam);
    g.drift.set(rand(0.03, 0.12) * (mode === 'playing' ? Math.sign(nx) : side), rand(-0.03, 0.06), 0).multiplyScalar(unit);
    g.obj.scale.setScalar(rand(0.1, 0.15) * 2 * unit); // 10-15% of the view height
    g.obj.position.copy(g.home);
    g.stage = 'in';
    g.fade = 0;
    g.life = rand(4, 8);
    g.obj.visible = true;
  }

  function updateGhost(g, dt, cam) {
    g.time += dt;
    if (g.stage === 'wait') {
      if (mode === 'off') return;
      g.wait -= dt;
      if (g.wait > 0) return;
      spawnGhost(g, cam);
    }

    g.home.addScaledVector(g.drift, dt);
    const unit = -g.home.z * tanHalfFov(cam);
    g.obj.position.copy(g.home);
    g.obj.position.y += Math.sin(g.time * 1.6 + g.seed) * 0.06 * unit;
    g.obj.lookAt(0, 0, 0); // face the viewer
    g.obj.rotateZ(Math.sin(g.time * 1.1 + g.seed) * 0.12);
    for (const a of g.arms) a.arm.rotation.z = a.side * (-1.15 + 0.25 * Math.sin(g.time * 2.2 + g.seed + a.side));
    waveHem(g);

    if (g.stage === 'in') {
      g.fade = Math.min(1, g.fade + dt / 0.9);
      if (g.fade >= 1) g.stage = 'float';
    } else if (g.stage === 'float') {
      g.life -= dt;
      const n = ndcOf(g.home, cam);
      const blocking = mode === 'playing' && Math.abs(n.x) < 0.45;
      if (g.life <= 0 || mode === 'off' || blocking || Math.abs(n.x) > 1.1 || Math.abs(n.y) > 1.1) g.stage = 'out';
    } else if (g.stage === 'out') {
      g.fade = Math.max(0, g.fade - dt / 0.8);
      if (g.fade <= 0) {
        g.stage = 'wait';
        g.wait = rand(1, 4);
        g.obj.visible = false;
      }
    }
    const k = clamp01(g.fade);
    g.bodyMat.opacity = 0.6 * k;
    g.faceMat.opacity = 0.9 * k;
  }

  function update(dt, cam) {
    if (!enabled || dt <= 0) return;
    for (const b of bats) updateBat(b, dt, cam);
    for (const g of ghosts) updateGhost(g, dt, cam);
  }

  function setMode(m) { mode = m; }

  function info() {
    return {
      mode,
      bats: bats.filter((b) => b.obj.visible).length,
      ghosts: ghosts.filter((g) => g.obj.visible).length,
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
