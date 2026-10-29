// Obstacles, course pieces and roadside scenery, all built from primitives and
// merged per prefab (see GeoBuilder) so each one is one or two draw calls.
//
// Conventions: origin at the road surface in the middle of the object, +Z
// faces the player (they come from +Z and ride toward -Z), sizes in metres.
//
// To swap in your own models later, replace a builder with one that loads a
// glTF and keep the collision sizes in OBSTACLE_INFO the same.

import { THREE, GeoBuilder } from '../gfx.js';
import { CONFIG } from '../config.js';
import { hash2 } from '../utils.js';

const LANE = CONFIG.lanes.width;
const INK = '#140c2b';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const tor = (r, t, rs = 6, ts = 14, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);

// Low-poly rock: an icosahedron with every corner pushed in or out a little.
// The displacement is hashed from the vertex position so shared corners move
// together and the faces stay closed.
export function rockGeo(r, seed = 1, detail = 0) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.75 + 0.45 * hash2(Math.round(x * 97) + seed * 13, Math.round(y * 89) * 7 + Math.round(z * 83));
    p.setXYZ(i, x * k, y * k * 0.85, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// Width of something that fills `span` lanes.
const spanWidth = (span, inset = 0.4) => span * LANE - inset;

// ------------------------------------------------------------- obstacles

// cat: block (change lanes), low (jump), high (slide). top/bottom are the
// collision heights; halfD is half the depth along the road.
export const OBSTACLE_INFO = {
  barrier: { cat: 'block', top: 2.3, halfD: 0.3 },
  crates: { cat: 'block', top: 2.4, halfD: 0.5 },
  boulder: { cat: 'block', top: 2.3, halfD: 0.8 },
  boulderSnow: { cat: 'block', top: 2.3, halfD: 0.8 },
  cactusBig: { cat: 'block', top: 2.7, halfD: 0.35, halfW: 0.7 },
  hayStack: { cat: 'block', top: 2.4, halfD: 0.5 },
  vending: { cat: 'block', top: 2.2, halfD: 0.45 },
  snowman: { cat: 'block', top: 2.4, halfD: 0.7, halfW: 0.8 },
  surfStand: { cat: 'block', top: 2.4, halfD: 0.4 },
  stump: { cat: 'block', top: 2.3, halfD: 0.6, halfW: 0.75 },

  cones: { cat: 'low', top: 0.75, halfD: 0.3 },
  crate: { cat: 'low', top: 0.95, halfD: 0.48 },
  lowBar: { cat: 'low', top: 0.85, halfD: 0.15 },
  rocks: { cat: 'low', top: 0.7, halfD: 0.5 },
  cart: { cat: 'low', top: 1.0, halfD: 0.5 },
  hay: { cat: 'low', top: 0.95, halfD: 0.48 },
  log: { cat: 'low', top: 0.72, halfD: 0.38 },
  roots: { cat: 'low', top: 0.55, halfD: 0.45 },
  snowdrift: { cat: 'low', top: 0.8, halfD: 0.6 },
  sandcastle: { cat: 'low', top: 0.9, halfD: 0.5 },
  cooler: { cat: 'low', top: 0.7, halfD: 0.3 },
  tumbleweed: { cat: 'low', top: 0.95, halfD: 0.45, halfW: 0.5, moving: true },
  beachBall: { cat: 'low', top: 0.95, halfD: 0.45, halfW: 0.5, moving: true, poppable: true },

  sign: { cat: 'high', bottom: 1.2, top: 2.6, halfD: 0.15 },
  pipeBar: { cat: 'high', bottom: 1.2, top: 1.8, halfD: 0.3 },
  banner: { cat: 'high', bottom: 1.25, top: 2.4, halfD: 0.1 },
  branch: { cat: 'high', bottom: 1.2, top: 2.0, halfD: 0.35 },
  surfRack: { cat: 'high', bottom: 1.25, top: 1.9, halfD: 0.4 },
  snowArch: { cat: 'high', bottom: 1.2, top: 2.1, halfD: 0.4 },
  neonSign: { cat: 'high', bottom: 1.25, top: 2.6, halfD: 0.12 },
  satellite: { cat: 'high', bottom: 1.2, top: 2.2, halfD: 0.45 },
  taxi: { cat: 'block', top: 1.6, halfD: 1.9, halfW: 0.95 },
  dumpster: { cat: 'block', top: 1.7, halfD: 0.8 },
  trashBags: { cat: 'low', top: 0.8, halfD: 0.45 },
  scaffold: { cat: 'high', bottom: 1.25, top: 2.6, halfD: 0.5 },
  rover: { cat: 'low', top: 0.95, halfD: 0.5, halfW: 0.6, moving: true },
  // Falls from the sky and leaves a burning crater (World.moveObstacle).
  fireball: { cat: 'block', top: 2.2, halfD: 0.8, halfW: 0.85, moving: true },
};

// Spans each obstacle can be built at (lanes wide).
export const OBSTACLE_SPANS = {
  barrier: [1, 2], lowBar: [1, 2, 3], log: [1, 3], snowdrift: [1, 3], roots: [1, 3],
  sign: [1, 3], pipeBar: [1, 3], banner: [1, 3], branch: [1, 3], surfRack: [1, 3],
  snowArch: [1, 3], neonSign: [1, 3], satellite: [1, 3], scaffold: [1, 3], rocks: [1], crates: [1], hay: [1],
};
export const spansFor = (type) => OBSTACLE_SPANS[type] || [1];

function crateInto(b, x, y, z, s = 0.9, wood = '#c8893f', frame = '#7d4f22') {
  b.add(box(s, s, s), wood, { pos: [x, y + s / 2, z] });
  const t = s * 0.12;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const w = dx ? t : s + 0.02;
    const h = dy ? t : s + 0.02;
    b.add(box(w, h, s + 0.02), frame, { pos: [x + dx * (s / 2 - t / 2), y + s / 2 + dy * (s / 2 - t / 2), z] });
  }
  b.add(box(s * 1.25, t, 0.03), frame, { pos: [x, y + s / 2, z + s / 2 + 0.01], rot: [0, 0, Math.PI / 4] });
}

function stripedBar(b, w, h, y, z, c1, c2, seg = 0.42, glow = false) {
  const n = Math.max(2, Math.round(w / seg));
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    b.add(box(sw, h, 0.1), i % 2 ? c2 : c1, { pos: [-w / 2 + sw * (i + 0.5), y, z], glow: glow && i % 2 === 0 });
  }
}

function surfboardInto(b, color, stripe, pos, rot, len = 2.1) {
  b.add(sph(0.5, 10, 8), color, { pos, rot, scale: [0.55, len / 1, 0.09] });
  b.add(box(0.06, len * 0.85, 0.12), stripe, { pos, rot });
}

// Glowing orange cracks over a rock of radius r centred at height y.
const sd6 = (i) => -0.75 + (i % 6) * 0.3; // taxi checker squares

// A downtown building front, facing +Z, width w along X, h tall. Windows are a
// grid, hashed lit (warm glow) or dark so every building looks different.
function buildingInto(b, w, h, d, wall, trim, seed, shop = null) {
  b.add(box(w, h, d), wall, { pos: [0, h / 2, 0] });
  b.add(box(w + 0.3, 0.4, d + 0.3), trim, { pos: [0, h + 0.2, 0] });
  const floor0 = shop ? 4 : 1.2;
  const cols = Math.max(2, Math.floor(w / 1.8));
  for (let y = floor0; y < h - 1.2; y += 2.4) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + (c + 0.5) * (w / cols);
      const lit = hash2(c + seed * 13, Math.round(y * 10) + seed) < 0.55;
      b.add(box(1.1, 1.4, 0.08), lit ? (hash2(c, y + seed) < 0.3 ? '#bfe8ff' : '#ffd98a') : '#232842', { pos: [x, y + 0.7, d / 2 + 0.03], glow: lit });
    }
  }
  if (shop) {
    b.add(box(w - 0.6, 2.4, 0.08), '#9ff3ff', { pos: [0, 1.4, d / 2 + 0.03], glow: true });
    b.add(box(w - 0.2, 0.25, 1.4), shop.awning, { pos: [0, 3.0, d / 2 + 0.7], rot: [0.25, 0, 0] });
    b.add(box(Math.min(5, w - 1), 0.7, 0.12), shop.sign, { pos: [0, 3.6, d / 2 + 0.1], glow: true });
  }
}

function lavaCracksInto(b, r, y, zScale = 1) {
  for (let i = 0; i < 7; i++) {
    const a = hash2(i, 31) * Math.PI * 2;
    const t = (hash2(i, 32) - 0.5) * 1.2;
    b.add(box(0.07, 0.5 + hash2(i, 33) * 0.5, 0.07), i % 2 ? '#ff6a1a' : '#ffb020', {
      pos: [Math.cos(a) * r * 0.92, y + t * r * 0.7, Math.sin(a) * r * 0.92 * zScale],
      rot: [hash2(i, 34) * 2, -a, hash2(i, 35) - 0.5],
      glow: true,
    });
  }
}

// A small six-wheeled rover facing +X.
function roverInto(b, s = 1) {
  b.add(box(1.1 * s, 0.32 * s, 0.75 * s), '#e9ecf2', { pos: [0, 0.55 * s, 0] });
  b.add(box(1.25 * s, 0.05 * s, 0.95 * s), '#2a4fa8', { pos: [0, 0.74 * s, 0] });
  for (let i = 0; i < 4; i++) b.add(box(0.02 * s, 0.06 * s, 0.95 * s), '#9fd3ff', { pos: [(-0.45 + i * 0.3) * s, 0.75 * s, 0] });
  b.add(box(0.36 * s, 0.22 * s, 0.4 * s), '#e8b84a', { pos: [-0.2 * s, 0.38 * s, 0] });
  for (const x of [-0.42, 0, 0.42]) {
    for (const z of [-0.45, 0.45]) {
      b.add(cyl(0.17 * s, 0.17 * s, 0.14 * s, 10), '#3a3a44', { pos: [x * s, 0.17 * s, z * s], rot: [Math.PI / 2, 0, 0] });
      b.add(cyl(0.07 * s, 0.07 * s, 0.15 * s, 8), '#c9ccd6', { pos: [x * s, 0.17 * s, z * s], rot: [Math.PI / 2, 0, 0] });
    }
  }
  b.add(cyl(0.03 * s, 0.03 * s, 0.6 * s, 5), '#c9ccd6', { pos: [0.4 * s, 1.05 * s, 0] });
  b.add(box(0.2 * s, 0.14 * s, 0.26 * s), '#e9ecf2', { pos: [0.42 * s, 1.38 * s, 0] });
  for (const z of [-0.06, 0.06]) b.add(sph(0.035 * s, 6, 4), '#3de1ff', { pos: [0.53 * s, 1.39 * s, z * s], glow: true });
}

const OBSTACLE_BUILDERS = {
  barrier(span, env) {
    const b = new GeoBuilder();
    const w = spanWidth(span);
    const night = env.id === 'night';
    for (const s of [-1, 1]) {
      b.add(box(0.14, 2.25, 0.14), '#e9e9ef', { pos: [s * (w / 2 - 0.07), 1.12, 0] });
      b.add(box(0.5, 0.1, 0.5), '#3a3a44', { pos: [s * (w / 2 - 0.07), 0.05, 0] });
    }
    b.add(box(w - 0.1, 1.95, 0.05), '#3d2b2b', { pos: [0, 1.15, -0.06] });
    for (const y of [0.55, 1.15, 1.75]) stripedBar(b, w, 0.36, y, 0.02, '#ff7a1a', '#ffffff', 0.42, night);
    for (const s of [-1, 1]) {
      b.add(cyl(0.12, 0.12, 0.1, 10), '#ffcc33', { pos: [s * (w / 2 - 0.07), 2.32, 0], glow: true });
    }
    return b;
  },

  crates(span, env) {
    const b = new GeoBuilder();
    crateInto(b, -0.46, 0, 0, 0.9);
    crateInto(b, 0.46, 0, 0.05, 0.9);
    crateInto(b, -0.2, 0.9, 0, 0.9, '#d39a4f');
    crateInto(b, 0.45, 0.9, -0.1, 0.65, '#b97d39');
    crateInto(b, -0.1, 1.8, 0.05, 0.6, '#c8893f');
    if (env.id === 'night') b.add(box(0.5, 0.14, 0.02), '#ffe066', { pos: [-0.46, 0.45, 0.47], glow: true });
    return b;
  },

  boulder(span, env, snowy = false) {
    const b = new GeoBuilder();
    const rock = env.rock || (env.id === 'sunset' ? '#a0523a' : env.id === 'beach' ? '#b39b7a' : '#80828c');
    b.add(rockGeo(1.15, 3), rock, { pos: [0, 1.05, 0], scale: [1, 1.05, 0.85] });
    b.add(rockGeo(0.5, 7), rock, { pos: [0.8, 0.3, 0.3] });
    b.add(rockGeo(0.4, 9), rock, { pos: [-0.85, 0.25, 0.25] });
    if (snowy) b.add(sph(0.95, 10, 6), '#ffffff', { pos: [0, 1.85, 0], scale: [1, 0.35, 0.85] });
    else if (env.id === 'forest') b.add(sph(0.5, 8, 5), '#4f9e3c', { pos: [-0.3, 1.9, 0.2], scale: [1.2, 0.35, 1] });
    else if (env.id === 'volcano') lavaCracksInto(b, 1.0, 1.05, 0.8);
    return b;
  },

  boulderSnow(span, env) {
    return OBSTACLE_BUILDERS.boulder(span, env, true);
  },

  cactusBig() {
    const b = new GeoBuilder();
    const g = '#3f9a4a';
    const dark = '#2c7a3a';
    b.add(cyl(0.3, 0.34, 2.6, 10), g, { pos: [0, 1.3, 0] });
    b.add(sph(0.3, 10, 6), g, { pos: [0, 2.6, 0] });
    for (const s of [-1, 1]) {
      const h = s > 0 ? 1.1 : 1.4;
      b.add(cyl(0.18, 0.18, 0.55, 8), g, { pos: [s * 0.4, h, 0], rot: [0, 0, Math.PI / 2] });
      b.add(cyl(0.18, 0.18, 0.8, 8), g, { pos: [s * 0.68, h + 0.38, 0] });
      b.add(sph(0.18, 8, 5), g, { pos: [s * 0.68, h + 0.78, 0] });
    }
    for (let i = 0; i < 6; i++) b.add(box(0.03, 2.4, 0.03), dark, { pos: [Math.cos(i) * 0.3, 1.3, Math.sin(i) * 0.3] });
    b.add(sph(0.12, 8, 5), '#ff5ea8', { pos: [0.05, 2.88, 0.05] });
    b.add(cyl(0.6, 0.7, 0.12, 10), '#c9733f', { pos: [0, 0.06, 0] });
    return b;
  },

  hayStack() {
    const b = new GeoBuilder();
    const hay = '#e8c35a';
    const twine = '#a8782e';
    const bale = (x, y, z, r = 0) => {
      b.add(box(1.5, 0.78, 0.85), hay, { pos: [x, y + 0.39, z], rot: [0, r, 0] });
      for (const dx of [-0.4, 0.4]) b.add(box(0.06, 0.8, 0.87), twine, { pos: [x + dx, y + 0.39, z], rot: [0, r, 0] });
    };
    bale(0, 0, 0);
    bale(0.1, 0.78, 0, 0.1);
    bale(-0.1, 1.56, 0, -0.08);
    return b;
  },

  vending() {
    const b = new GeoBuilder();
    b.add(box(1.25, 2.15, 0.85), '#e0344a', { pos: [0, 1.075, 0] });
    b.add(box(0.75, 1.3, 0.04), '#9ff3ff', { pos: [-0.18, 1.3, 0.43], glow: true });
    for (let i = 0; i < 4; i++) b.add(box(0.6, 0.04, 0.05), '#ff3d7f', { pos: [-0.18, 0.85 + i * 0.3, 0.45], glow: true });
    b.add(box(0.25, 0.5, 0.05), '#ffe066', { pos: [0.42, 1.4, 0.43], glow: true });
    b.add(box(0.7, 0.18, 0.05), '#1a1033', { pos: [-0.18, 0.35, 0.43] });
    b.add(box(1.0, 0.22, 0.05), '#ffffff', { pos: [0, 1.95, 0.43], glow: true });
    return b;
  },

  snowman() {
    const b = new GeoBuilder();
    const snow = '#f6fbff';
    b.add(sph(0.78, 14, 10), snow, { pos: [0, 0.7, 0] });
    b.add(sph(0.56, 14, 10), snow, { pos: [0, 1.6, 0] });
    b.add(sph(0.4, 14, 10), snow, { pos: [0, 2.2, 0] });
    b.add(cone(0.07, 0.4, 8), '#ff8c1a', { pos: [0, 2.2, 0.55], rot: [Math.PI / 2, 0, 0] });
    for (const s of [-1, 1]) b.add(sph(0.05, 6, 4), INK, { pos: [s * 0.13, 2.32, 0.34] });
    for (let i = 0; i < 3; i++) b.add(sph(0.06, 6, 4), INK, { pos: [0, 1.45 + i * 0.18, 0.53] });
    b.add(tor(0.38, 0.09, 6, 14), '#ff2e55', { pos: [0, 1.95, 0], rot: [Math.PI / 2, 0, 0] });
    b.add(box(0.16, 0.5, 0.06), '#ff2e55', { pos: [0.22, 1.7, 0.4], rot: [0, 0, 0.2] });
    b.add(cyl(0.28, 0.28, 0.4, 12), INK, { pos: [0, 2.68, 0], rot: [0, 0, 0.12] });
    b.add(cyl(0.42, 0.42, 0.05, 12), INK, { pos: [0, 2.48, 0], rot: [0, 0, 0.12] });
    for (const s of [-1, 1]) b.add(cyl(0.03, 0.03, 0.9, 5), '#6b4423', { pos: [s * 0.85, 1.75, 0], rot: [0, 0, s * 1.0] });
    return b;
  },

  surfStand() {
    const b = new GeoBuilder();
    b.add(sph(0.9, 10, 6), '#efd79a', { pos: [0, 0, 0], scale: [1.1, 0.35, 0.7] });
    const cols = [['#ff5e7a', '#ffffff'], ['#3de1ff', '#ffe066'], ['#ffe066', '#ff2e55']];
    cols.forEach(([c, s], i) => surfboardInto(b, c, s, [(i - 1) * 0.55, 1.2, 0], [0.05 * (i - 1), 0, 0.1 * (i - 1)], 2.3));
    return b;
  },

  stump() {
    const b = new GeoBuilder();
    const bark = '#6b4423';
    b.add(cyl(0.58, 0.72, 2.0, 10), bark, { pos: [0, 1.0, 0] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add(cone(0.22, 0.6 + (i % 3) * 0.25, 5), bark, { pos: [Math.cos(a) * 0.4, 2.2 + (i % 3) * 0.1, Math.sin(a) * 0.4] });
      b.add(box(0.25, 0.25, 0.9), bark, { pos: [Math.cos(a) * 0.75, 0.12, Math.sin(a) * 0.75], rot: [0, -a, 0.3] });
    }
    b.add(cyl(0.48, 0.48, 0.05, 10), '#c9a06a', { pos: [0, 2.0, 0] });
    b.add(sph(0.35, 8, 5), '#4f9e3c', { pos: [0.4, 1.2, 0.45], scale: [1, 0.6, 0.5] });
    return b;
  },

  cones(span, env) {
    const b = new GeoBuilder();
    const night = env.id === 'night';
    for (const x of [-0.62, 0, 0.62]) {
      b.add(box(0.48, 0.06, 0.48), '#2a2a33', { pos: [x, 0.03, 0] });
      b.add(cone(0.22, 0.72, 10), '#ff7a1a', { pos: [x, 0.42, 0] });
      b.add(cyl(0.14, 0.17, 0.12, 10), '#ffffff', { pos: [x, 0.42, 0], glow: night });
    }
    return b;
  },

  crate() {
    const b = new GeoBuilder();
    crateInto(b, 0, 0, 0, 0.95);
    return b;
  },

  lowBar(span, env) {
    const b = new GeoBuilder();
    const w = spanWidth(span, 0.5);
    for (const s of [-1, 1]) {
      b.add(box(0.1, 0.85, 0.1), '#e9e9ef', { pos: [s * w / 2, 0.42, 0] });
      b.add(box(0.1, 0.06, 0.6), '#e9e9ef', { pos: [s * w / 2, 0.03, 0] });
    }
    stripedBar(b, w, 0.26, 0.68, 0, '#ff2e55', '#ffffff', 0.4, env.id === 'night');
    return b;
  },

  rocks(span, env) {
    const b = new GeoBuilder();
    const rock = env.rock || (env.id === 'sunset' ? '#a8603f' : env.id === 'snow' ? '#9fb0c6' : '#8a8c95');
    b.add(rockGeo(0.5, 2), rock, { pos: [-0.45, 0.35, 0] });
    b.add(rockGeo(0.42, 5), rock, { pos: [0.4, 0.3, 0.1] });
    b.add(rockGeo(0.3, 8), rock, { pos: [0.05, 0.2, 0.35] });
    if (env.id === 'snow') b.add(sph(0.4, 8, 5), '#ffffff', { pos: [-0.45, 0.65, 0], scale: [1, 0.3, 1] });
    return b;
  },

  cart() {
    const b = new GeoBuilder();
    const metal = '#c9d2de';
    const w = 0.9, d = 1.0, h = 0.55, y0 = 0.4;
    b.add(box(w, 0.04, d), metal, { pos: [0, y0, 0] });
    for (let i = 0; i <= 5; i++) {
      const z = -d / 2 + (d / 5) * i;
      for (const s of [-1, 1]) b.add(box(0.03, h, 0.03), metal, { pos: [s * w / 2, y0 + h / 2, z] });
    }
    for (let i = 0; i <= 4; i++) {
      const x = -w / 2 + (w / 4) * i;
      for (const s of [-1, 1]) b.add(box(0.03, h, 0.03), metal, { pos: [x, y0 + h / 2, s * d / 2] });
    }
    for (const y of [y0 + h * 0.5, y0 + h]) {
      for (const s of [-1, 1]) {
        b.add(box(w, 0.04, 0.04), metal, { pos: [0, y, s * d / 2] });
        b.add(box(0.04, 0.04, d), metal, { pos: [s * w / 2, y, 0] });
      }
    }
    b.add(box(w + 0.1, 0.07, 0.07), '#ff2e55', { pos: [0, y0 + h + 0.1, d / 2 + 0.15] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.add(box(0.03, 0.38, 0.03), metal, { pos: [sx * (w / 2 - 0.08), 0.2, sz * (d / 2 - 0.1)] });
      b.add(cyl(0.07, 0.07, 0.05, 8), '#2a2a33', { pos: [sx * (w / 2 - 0.08), 0.07, sz * (d / 2 - 0.1)], rot: [0, 0, Math.PI / 2] });
    }
    // A forgotten bag of groceries.
    b.add(box(0.4, 0.4, 0.3), '#e8d6b0', { pos: [-0.15, y0 + 0.22, 0.1] });
    b.add(sph(0.1, 6, 4), '#3fbf4a', { pos: [-0.2, y0 + 0.47, 0.1] });
    return b;
  },

  hay() {
    const b = new GeoBuilder();
    b.add(cyl(0.48, 0.48, 1.6, 16), '#e8c35a', { pos: [0, 0.48, 0], rot: [0, 0, Math.PI / 2] });
    for (const s of [-1, 1]) {
      b.add(cyl(0.36, 0.36, 0.02, 14), '#c9a040', { pos: [s * 0.81, 0.48, 0], rot: [0, 0, Math.PI / 2] });
      b.add(tor(0.48, 0.03, 4, 18), '#a8782e', { pos: [s * 0.35, 0.48, 0], rot: [0, Math.PI / 2, 0] });
    }
    return b;
  },

  log(span) {
    const b = new GeoBuilder();
    const w = spanWidth(span, 0.2);
    b.add(cyl(0.36, 0.36, w, 12), '#7a4a26', { pos: [0, 0.36, 0], rot: [0, 0, Math.PI / 2] });
    for (const s of [-1, 1]) {
      b.add(cyl(0.3, 0.3, 0.03, 12), '#d8a96a', { pos: [s * (w / 2 + 0.01), 0.36, 0], rot: [0, 0, Math.PI / 2] });
      b.add(cyl(0.15, 0.15, 0.035, 10), '#b8844a', { pos: [s * (w / 2 + 0.02), 0.36, 0], rot: [0, 0, Math.PI / 2] });
    }
    for (let i = 0; i < span * 2; i++) {
      b.add(sph(0.22, 7, 5), '#4f9e3c', { pos: [-w / 2 + (i + 0.5) * (w / (span * 2)), 0.66, (i % 2) * 0.15], scale: [1.4, 0.4, 1] });
    }
    return b;
  },

  roots(span) {
    const b = new GeoBuilder();
    const w = spanWidth(span, 0.3);
    const n = span * 3;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * (w / n);
      b.add(tor(0.32, 0.09, 5, 10, Math.PI), '#6b4423', { pos: [x, 0, (i % 2) * 0.25 - 0.1], rot: [0, 0.5 + i * 0.7, 0] });
    }
    b.add(box(w, 0.12, 0.5), '#4a3220', { pos: [0, 0.06, 0] });
    return b;
  },

  snowdrift(span) {
    const b = new GeoBuilder();
    const w = spanWidth(span, 0.2);
    const n = span * 2;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * (w / n);
      b.add(sph(0.75, 12, 7), i % 2 ? '#f6fbff' : '#e6f0fb', { pos: [x, 0, (i % 2) * 0.2], scale: [(w / n) * 0.8, 0.8, 0.9] });
    }
    return b;
  },

  sandcastle() {
    const b = new GeoBuilder();
    const sand = '#e8c983';
    b.add(box(1.4, 0.4, 0.9), sand, { pos: [0, 0.2, 0] });
    for (const [x, z] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) {
      b.add(cyl(0.18, 0.2, 0.62, 8), sand, { pos: [x, 0.31, z] });
      b.add(cone(0.22, 0.25, 8), '#d6b46d', { pos: [x, 0.74, z] });
    }
    b.add(box(0.5, 0.55, 0.5), sand, { pos: [0, 0.6, 0] });
    b.add(cyl(0.015, 0.015, 0.5, 4), '#ffffff', { pos: [0, 1.1, 0] });
    b.add(box(0.25, 0.14, 0.02), '#ff2e55', { pos: [0.12, 1.28, 0] });
    b.add(box(0.2, 0.25, 0.04), '#8b5a2b', { pos: [0, 0.32, 0.46] });
    return b;
  },

  cooler() {
    const b = new GeoBuilder();
    b.add(box(1.0, 0.5, 0.6), '#2a7fff', { pos: [0, 0.25, 0] });
    b.add(box(1.04, 0.14, 0.64), '#ffffff', { pos: [0, 0.57, 0] });
    b.add(box(0.5, 0.05, 0.05), '#1a1033', { pos: [0, 0.68, 0] });
    b.add(box(1.6, 0.02, 0.9), '#ff5e7a', { pos: [0.1, 0.01, 0.2], rot: [0, 0.2, 0] });
    for (let i = 0; i < 4; i++) b.add(box(0.2, 0.021, 0.9), '#ffffff', { pos: [-0.5 + i * 0.4, 0.012, 0.2 + i * 0.08], rot: [0, 0.2, 0] });
    return b;
  },

  tumbleweed() {
    const b = new GeoBuilder();
    for (let i = 0; i < 9; i++) {
      b.add(tor(0.42 - (i % 3) * 0.06, 0.025, 3, 14), i % 2 ? '#b8894f' : '#9c7240', { pos: [0, 0, 0], rot: [i * 0.7, i * 1.3, i * 0.4] });
    }
    b.add(sph(0.22, 6, 4), '#8a6538', { pos: [0, 0, 0] });
    return b;
  },

  beachBall() {
    const b = new GeoBuilder();
    const cols = ['#ff2e55', '#ffffff', '#ffe066', '#ffffff', '#2a7fff', '#ffffff'];
    cols.forEach((c, i) => {
      const g = new THREE.SphereGeometry(0.45, 4, 10, (i / 6) * Math.PI * 2, Math.PI / 3);
      b.add(g, c);
    });
    b.add(sph(0.08, 6, 4), '#ffffff', { pos: [0, 0.44, 0] });
    return b;
  },

  sign(span, env) {
    const b = new GeoBuilder();
    const w = spanWidth(span, 0.3);
    const night = env.id === 'night';
    for (const s of [-1, 1]) {
      b.add(box(0.12, 2.65, 0.12), '#e9e9ef', { pos: [s * w / 2, 1.32, 0] });
      b.add(box(0.5, 0.08, 0.5), '#3a3a44', { pos: [s * w / 2, 0.04, 0] });
    }
    b.add(box(w, 1.15, 0.08), '#ff8c1a', { pos: [0, 1.85, 0] });
    b.add(box(w - 0.2, 0.95, 0.09), '#ffb703', { pos: [0, 1.85, 0] });
    // Downward chevrons: duck!
    const n = Math.max(1, Math.round(span * 1.5));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * (w / n);
      b.add(box(0.48, 0.14, 0.1), INK, { pos: [x - 0.15, 1.92, 0.01], rot: [0, 0, -0.7] });
      b.add(box(0.48, 0.14, 0.1), INK, { pos: [x + 0.15, 1.92, 0.01], rot: [0, 0, 0.7] });
    }
    stripedBar(b, w, 0.14, 1.28, 0.02, INK, '#ffe066', 0.3, night);
    if (night) for (const s of [-1, 1]) b.add(sph(0.1, 8, 6), '#ffcc33', { pos: [s * w / 2, 2.72, 0], glow: true });
    return b;
  },

  pipeBar(span, env) {
    const b = new GeoBuilder();
    const w = spanWidth(span, 0.2);
    b.add(cyl(0.26, 0.26, w + 0.6, 14), '#7c8594', { pos: [0, 1.5, 0], rot: [0, 0, Math.PI / 2] });
    for (let i = 0; i < span * 2; i++) {
      b.add(cyl(0.29, 0.29, 0.1, 14), '#5a6170', { pos: [-w / 2 + (i + 0.5) * (w / (span * 2)), 1.5, 0], rot: [0, 0, Math.PI / 2] });
    }
    for (const s of [-1, 1]) {
      const x = s * (w / 2 + 0.15);
      b.add(box(0.12, 1.55, 0.12), '#ffcc33', { pos: [x, 0.75, 0.3], rot: [0.25, 0, 0] });
      b.add(box(0.12, 1.55, 0.12), '#ffcc33', { pos: [x, 0.75, -0.3], rot: [-0.25, 0, 0] });
      for (let k = 0; k < 3; k++) b.add(box(0.13, 0.12, 0.13), INK, { pos: [x, 0.3 + k * 0.45, 0.3 - (0.3 + k * 0.45) * 0.25 + 0.06], rot: [0.25, 0, 0] });
    }
    if (env.id === 'night') b.add(box(w, 0.06, 0.06), '#ffcc33', { pos: [0, 1.24, 0.12], glow: true });
    return b;
  },

  banner(span) {
    const b = new GeoBuilder();
    const w = spanWidth(span, 0.3);
    for (const s of [-1, 1]) b.add(cyl(0.07, 0.07, 2.6, 8), '#e9e9ef', { pos: [s * w / 2, 1.3, 0] });
    b.add(box(w, 0.75, 0.05), '#3d7bff', { pos: [0, 1.95, 0] });
    b.add(box(w - 0.2, 0.55, 0.06), '#ffffff', { pos: [0, 1.95, 0] });
    const n = Math.round(w / 0.4);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * (w / n);
      b.add(cone(0.14, 0.3, 3), ['#ff2e55', '#ffe066', '#2bb673', '#3d7bff'][i % 4], { pos: [x, 1.42, 0], rot: [Math.PI, 0, 0] });
      if (i % 2 === 0) b.add(sph(0.11, 8, 6), ['#ff2e7e', '#ffb703', '#7b2ff7'][i % 3], { pos: [x, 1.95, 0.04], scale: [1, 1, 0.4] });
    }
    return b;
  },

  branch(span) {
    const b = new GeoBuilder();
    const w = spanWidth(span, 0);
    const bark = '#6b4423';
    b.add(cyl(0.3, 0.36, w + 1.2, 10), bark, { pos: [0, 1.55, 0], rot: [0, 0, Math.PI / 2 + 0.03] });
    for (const s of [-1, 1]) {
      b.add(rockGeo(0.65, s + 4), '#80828c', { pos: [s * (w / 2 + 0.3), 0.55, 0] });
      b.add(box(0.3, 1.1, 0.3), bark, { pos: [s * (w / 2 + 0.35), 0.9, 0.1] });
    }
    for (let i = 0; i < span * 3; i++) {
      const x = -w / 2 + (i + 0.5) * (w / (span * 3));
      b.add(sph(0.38, 8, 6), i % 2 ? '#4f9e3c' : '#3f8a35', { pos: [x, 1.95 + (i % 2) * 0.12, (i % 3 - 1) * 0.2], scale: [1.3, 0.8, 1] });
      if (i % 2 === 0) b.add(cyl(0.05, 0.08, 0.6, 5), bark, { pos: [x + 0.1, 1.95, 0.1], rot: [0.4, 0, 0.6] });
    }
    return b;
  },

  surfRack(span) {
    const b = new GeoBuilder();
    const w = spanWidth(span, 0.2);
    for (const s of [-1, 1]) {
      b.add(box(0.1, 1.9, 0.1), '#8b5a2b', { pos: [s * w / 2, 0.95, 0.3], rot: [0.15, 0, 0] });
      b.add(box(0.1, 1.9, 0.1), '#8b5a2b', { pos: [s * w / 2, 0.95, -0.3], rot: [-0.15, 0, 0] });
    }
    const cols = ['#ff5e7a', '#3de1ff', '#ffe066', '#2bb673'];
    const boards = span === 1 ? 1 : 3;
    for (let i = 0; i < boards; i++) {
      surfboardInto(b, cols[i % 4], '#ffffff', [-w / 2 + (i + 0.5) * (w / boards), 1.5 + (i % 2) * 0.12, 0], [0, 0, Math.PI / 2], Math.min(w / boards + 0.3, 2.6));
    }
    b.add(cyl(0.04, 0.04, w, 6), '#8b5a2b', { pos: [0, 1.38, 0], rot: [0, 0, Math.PI / 2] });
    return b;
  },

  snowArch(span) {
    const b = new GeoBuilder();
    const w = spanWidth(span, 0);
    b.add(cyl(0.3, 0.3, w + 1, 10), '#6b4423', { pos: [0, 1.55, 0], rot: [0, 0, Math.PI / 2] });
    b.add(sph(0.5, 10, 6), '#ffffff', { pos: [0, 1.82, 0], scale: [(w + 1) / 1, 0.4, 0.8] });
    for (const s of [-1, 1]) b.add(sph(0.9, 10, 7), '#f6fbff', { pos: [s * (w / 2 + 0.45), 0.6, 0], scale: [0.8, 1.2, 0.9] });
    const n = Math.round(w / 0.35);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * (w / n);
      b.add(cone(0.06, 0.3 - (i % 3) * 0.05, 5), '#bfe8ff', { pos: [x, 1.32, 0.05], rot: [Math.PI, 0, 0], glow: true });
    }
    return b;
  },

  neonSign(span) {
    const b = new GeoBuilder();
    const w = spanWidth(span, 0.3);
    for (const s of [-1, 1]) b.add(box(0.12, 2.7, 0.12), '#3a3d55', { pos: [s * w / 2, 1.35, 0] });
    b.add(box(w, 1.25, 0.12), '#141530', { pos: [0, 1.95, 0] });
    b.add(box(w - 0.12, 0.06, 0.13), '#ff3d7f', { pos: [0, 2.52, 0], glow: true });
    b.add(box(w - 0.12, 0.06, 0.13), '#ff3d7f', { pos: [0, 1.38, 0], glow: true });
    const n = Math.max(1, Math.round(span * 1.5));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * (w / n);
      b.add(box(0.5, 0.09, 0.13), '#3de1ff', { pos: [x - 0.16, 1.98, 0.01], rot: [0, 0, -0.7], glow: true });
      b.add(box(0.5, 0.09, 0.13), '#3de1ff', { pos: [x + 0.16, 1.98, 0.01], rot: [0, 0, 0.7], glow: true });
    }
    return b;
  },

  // A crashed satellite propped up on rubble across the lanes: slide under.
  satellite(span, env) {
    const b = new GeoBuilder();
    const w = spanWidth(span, 0.3);
    for (const sd of [-1, 1]) {
      b.add(rockGeo(0.5, 3 + sd), env.rock || '#8a8c95', { pos: [sd * w / 2, 0.45, 0], scale: [0.9, 1.7, 0.9] });
      b.add(box(0.12, 1.3, 0.12), '#c9ccd6', { pos: [sd * (w / 2 - 0.05), 0.65, 0.2], rot: [0, 0, sd * 0.1] });
    }
    b.add(box(w, 0.06, 0.85), '#1f3a8a', { pos: [0, 1.5, 0] });
    const n = Math.max(3, Math.round(w / 0.45));
    for (let i = 0; i <= n; i++) b.add(box(0.03, 0.07, 0.87), '#9fd3ff', { pos: [-w / 2 + (i * w) / n, 1.5, 0] });
    b.add(box(w, 0.07, 0.03), '#9fd3ff', { pos: [0, 1.5, 0] });
    b.add(box(0.95, 0.75, 0.8), '#e8b84a', { pos: [0, 1.75, 0] });
    for (let i = 0; i < 4; i++) b.add(box(0.96, 0.03, 0.81), '#b8863a', { pos: [0, 1.48 + i * 0.18, 0] });
    b.add(cyl(0.38, 0.08, 0.18, 14), '#e9ecf2', { pos: [0.1, 2.25, 0], rot: [0.5, 0, 0.3] });
    b.add(cyl(0.02, 0.02, 0.5, 4), '#c9ccd6', { pos: [-0.3, 2.3, 0] });
    b.add(sph(0.06, 6, 4), '#ff2e55', { pos: [-0.3, 2.56, 0], glow: true });
    return b;
  },

  rover() {
    const b = new GeoBuilder();
    roverInto(b, 1);
    return b;
  },

  // The burning crater a fireball leaves behind. The ball and the warning ring
  // are separate pieces (piecePrefab) so they can move on their own.
  fireball() {
    const b = new GeoBuilder();
    b.add(cyl(1.15, 1.25, 0.06, 14), '#140c0c', { pos: [0, 0.03, 0] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add(rockGeo(0.28, i + 3), '#2a2024', { pos: [Math.cos(a) * 1.05, 0.12, Math.sin(a) * 1.05] });
      b.add(box(0.06, 0.02, 0.9), '#ff6a1a', { pos: [Math.cos(a) * 0.55, 0.065, Math.sin(a) * 0.55], rot: [0, -a + Math.PI / 2, 0], glow: true });
    }
    b.add(rockGeo(0.5, 7), '#2e2226', { pos: [0, 0.35, 0] });
    lavaCracksInto(b, 0.5, 0.35);
    const flames = [[0, 0, 1.9, 0.5, '#ff6a1a'], [0.45, 0.2, 1.3, 0.35, '#ff8a1a'], [-0.4, 0.25, 1.5, 0.38, '#ff4a1a'],
      [0.1, -0.45, 1.2, 0.3, '#ffb020'], [-0.2, -0.1, 1.0, 0.28, '#ffd23f'], [0.25, 0.4, 0.9, 0.25, '#ffd23f']];
    for (const [x, z, h, r, c] of flames) b.add(cone(r, h, 7), c, { pos: [x, 0.3 + h / 2, z], glow: true });
    return b;
  },

  // --- downtown
  taxi() {
    const b = new GeoBuilder();
    b.add(box(1.75, 0.7, 3.8), '#ffcc1a', { pos: [0, 0.6, 0] });
    b.add(box(1.55, 0.6, 2.0), '#ffcc1a', { pos: [0, 1.25, -0.15] });
    b.add(box(1.5, 0.5, 0.05), '#9fd3ff', { pos: [0, 1.25, 0.86], rot: [-0.35, 0, 0] });
    b.add(box(1.5, 0.5, 0.05), '#9fd3ff', { pos: [0, 1.25, -1.16], rot: [0.35, 0, 0] });
    for (const sd of [-1, 1]) b.add(box(0.05, 0.42, 1.7), '#9fd3ff', { pos: [sd * 0.78, 1.27, -0.15] });
    for (let i = 0; i < 6; i++) b.add(box(0.2, 0.2, 0.06), i % 2 ? '#14162b' : '#ffffff', { pos: [sd6(i), 0.62, 1.91] });
    b.add(box(0.55, 0.22, 0.3), '#ffffff', { pos: [0, 1.66, -0.15] });
    b.add(box(0.5, 0.12, 0.31), '#ff2e55', { pos: [0, 1.68, -0.15], glow: true });
    for (const sd of [-1, 1]) {
      b.add(box(0.3, 0.16, 0.05), '#fff6c0', { pos: [sd * 0.6, 0.72, 1.91], glow: true });
      b.add(box(0.3, 0.14, 0.05), '#ff2e2e', { pos: [sd * 0.6, 0.72, -1.91], glow: true });
      for (const z of [-1.2, 1.2]) b.add(cyl(0.34, 0.34, 0.26, 12), '#1a1a22', { pos: [sd * 0.82, 0.34, z], rot: [0, 0, Math.PI / 2] });
    }
    b.add(box(1.8, 0.12, 0.2), '#2a2a33', { pos: [0, 0.3, 1.9] });
    return b;
  },

  dumpster() {
    const b = new GeoBuilder();
    b.add(box(1.9, 1.3, 1.3), '#2f7a4a', { pos: [0, 0.75, 0] });
    b.add(box(2.0, 0.1, 1.4), '#245e39', { pos: [0, 1.45, 0], rot: [-0.12, 0, 0] });
    b.add(box(1.92, 0.08, 0.06), '#245e39', { pos: [0, 1.2, 0.66] });
    for (const x of [-0.75, 0.75]) b.add(cyl(0.1, 0.1, 0.1, 8), '#1a1a22', { pos: [x, 0.08, 0.5], rot: [0, 0, Math.PI / 2] });
    b.add(box(0.6, 0.35, 0.02), '#ffffff', { pos: [0, 0.8, 0.66] });
    b.add(sph(0.3, 8, 6), '#1c1c24', { pos: [0.4, 1.55, 0.2], scale: [1, 0.6, 1] });
    return b;
  },

  trashBags() {
    const b = new GeoBuilder();
    const cols = ['#1c1c24', '#2a2a36', '#1c1c24', '#3a3a4a'];
    for (let i = 0; i < 4; i++) {
      b.add(sph(0.38, 9, 7), cols[i], { pos: [-0.55 + i * 0.37, 0.32, (i % 2) * 0.15 - 0.05], scale: [1, 0.95, 0.9] });
      b.add(cone(0.08, 0.2, 6), cols[i], { pos: [-0.55 + i * 0.37, 0.72, (i % 2) * 0.15 - 0.05] });
    }
    b.add(box(0.25, 0.3, 0.2), '#d8c49a', { pos: [0.75, 0.15, 0.3], rot: [0, 0.4, 0] });
    return b;
  },

  // Construction scaffolding over the street: slide under the boards.
  scaffold(span) {
    const b = new GeoBuilder();
    const w = spanWidth(span, 0.3);
    for (const sd of [-1, 1]) {
      for (const z of [-0.4, 0.4]) b.add(cyl(0.05, 0.05, 2.7, 6), '#c9ccd6', { pos: [sd * w / 2, 1.35, z] });
      b.add(box(0.06, 0.06, 0.85), '#c9ccd6', { pos: [sd * w / 2, 0.6, 0], rot: [0.9, 0, 0] });
      b.add(box(0.5, 0.08, 1.0), '#3a3a44', { pos: [sd * w / 2, 0.04, 0] });
    }
    b.add(box(w, 0.1, 1.0), '#c8893f', { pos: [0, 1.32, 0] });
    for (let i = 0; i < Math.max(3, Math.round(w / 0.5)); i++) b.add(box(0.03, 0.105, 1.0), '#9c6a2e', { pos: [-w / 2 + (i + 0.5) * (w / Math.max(3, Math.round(w / 0.5))), 1.32, 0] });
    b.add(box(w, 0.06, 0.06), '#c9ccd6', { pos: [0, 2.6, 0.4] });
    b.add(box(w, 0.06, 0.06), '#c9ccd6', { pos: [0, 2.6, -0.4] });
    stripedBar(b, w, 0.3, 1.55, 0.5, '#ff7a1a', '#ffffff', 0.42);
    b.add(box(0.9, 0.5, 0.04), '#ffcc1a', { pos: [0, 2.05, 0.52] });
    b.add(box(0.5, 0.06, 0.05), INK, { pos: [-0.1, 2.12, 0.54], rot: [0, 0, 0.6] });
    b.add(box(0.5, 0.06, 0.05), INK, { pos: [0.1, 2.12, 0.54], rot: [0, 0, -0.6] });
    return b;
  },
};

// ---------------------------------------------------------- course pieces

// Wedge ramp. Starts at the near edge (+Z, height 0) and rises to the far
// edge (-Z, height RAMP.height).
export const RAMP = { length: 5, height: 1.3, halfW: 0.95 };
function rampBuilder(env) {
  const b = new GeoBuilder();
  const L = RAMP.length, H = RAMP.height, W = RAMP.halfW * 2;
  const g = new THREE.BufferGeometry();
  const x0 = -W / 2, x1 = W / 2, zn = L / 2, zf = -L / 2;
  // Triangular prism: slope, back face, two sides, bottom.
  const v = [
    // slope
    x0, 0, zn, x1, 0, zn, x1, H, zf, x0, 0, zn, x1, H, zf, x0, H, zf,
    // back
    x0, 0, zf, x0, H, zf, x1, H, zf, x0, 0, zf, x1, H, zf, x1, 0, zf,
    // left
    x0, 0, zn, x0, H, zf, x0, 0, zf,
    // right
    x1, 0, zn, x1, 0, zf, x1, H, zf,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  const night = env.id === 'night';
  const deck = env.id === 'snow' ? '#9fd3ff' : env.id === 'forest' ? '#b8844a' : '#3d7bff';
  b.add(g, deck);
  const slopeLen = Math.hypot(L, H);
  const ang = Math.atan2(H, L);
  // Chevrons on the slope.
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.7) / 4.6;
    const y = H * t + 0.03, z = zn - L * t;
    b.add(box(0.75, 0.04, 0.14), '#ffe066', { pos: [-0.3, y, z], rot: [ang, 0.6, 0], glow: night });
    b.add(box(0.75, 0.04, 0.14), '#ffe066', { pos: [0.3, y, z], rot: [ang, -0.6, 0], glow: night });
  }
  b.add(box(W + 0.04, 0.08, 0.12), '#ff2e55', { pos: [0, H, zf + 0.05], glow: night });
  for (const s of [-1, 1]) b.add(box(0.06, 0.06, slopeLen), '#ffffff', { pos: [s * (W / 2), H / 2 + 0.02, 0], rot: [ang, 0, 0] });
  return b;
}

// Rails are built from short segments so they bend with the road.
export const RAIL = { segment: 3, top: 0.82 };
function railSegBuilder(env) {
  const b = new GeoBuilder();
  const metal = env.id === 'forest' ? '#8b5a2b' : env.id === 'snow' ? '#bfe8ff' : '#d8dee8';
  b.add(cyl(0.07, 0.07, RAIL.segment + 0.02, 8), metal, { pos: [0, RAIL.top - 0.07, 0], rot: [Math.PI / 2, 0, 0] });
  b.add(cyl(0.05, 0.05, RAIL.top - 0.07, 6), '#5a6170', { pos: [0, (RAIL.top - 0.07) / 2, 0] });
  b.add(box(0.35, 0.05, 0.35), '#3a3a44', { pos: [0, 0.025, 0] });
  if (env.id === 'night') b.add(box(0.03, 0.03, RAIL.segment), '#3de1ff', { pos: [0, RAIL.top - 0.15, 0.06], glow: true });
  return b;
}

// A hole across the road. length along the road, span in lanes.
export const GAP = { length: 4.2 };
function gapBuilder(span, env) {
  const b = new GeoBuilder();
  const w = span === 3 ? CONFIG.road.halfWidth * 2 + 0.3 : spanWidth(span, 0.1);
  const L = GAP.length;
  b.add(box(w, 0.02, L), '#07040e', { pos: [0, 0.012, 0] });
  b.add(box(w * 0.8, 0.021, L * 0.6), '#020105', { pos: [0, 0.013, 0] });
  const asphalt = env.road.base;
  const n = Math.round(w / 0.5);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    for (const s of [-1, 1]) {
      const jag = 0.15 + hash2(i, s + 9) * 0.35;
      b.add(box(w / n + 0.02, 0.05, jag), asphalt, { pos: [x, 0.02, s * (L / 2 - jag / 2)], rot: [0, (hash2(i, s) - 0.5) * 0.4, 0] });
    }
    if (i % 2 === 0) b.add(rockGeo(0.14, i), '#3a3240', { pos: [x, 0.06, L / 2 + 0.08] });
  }
  // Hazard stripes on the near lip so it reads from far away.
  stripedBar(b, w, 0.03, 0.03, L / 2 + 0.25, '#ffcc33', INK, 0.5, env.id === 'night');
  return b;
}

export const ICE = { length: 7 };
function iceBuilder(span) {
  const b = new GeoBuilder();
  const w = span * LANE + 0.2;
  b.add(box(w, 0.02, ICE.length), '#bfe8ff', { pos: [0, 0.012, 0], glow: true });
  for (let i = 0; i < 14; i++) {
    b.add(box(0.5 + hash2(i, 2) * 0.8, 0.022, 0.06), '#ffffff', {
      pos: [(hash2(i, 3) - 0.5) * w * 0.9, 0.014, (hash2(i, 4) - 0.5) * ICE.length * 0.9],
      rot: [0, hash2(i, 5) * 3, 0],
      glow: true,
    });
  }
  return b;
}

// A falling fireball: molten core, burning shell, flame trail pointing up.
function fireballBallBuilder() {
  const b = new GeoBuilder();
  b.add(sph(0.85, 12, 9), '#ff4a1a', { glow: true });
  b.add(sph(0.62, 12, 9), '#ffd23f', { pos: [0, -0.15, 0.25], glow: true });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.add(rockGeo(0.32, i + 1), '#2a2024', { pos: [Math.cos(a) * 0.62, -0.25 + (i % 2) * 0.3, Math.sin(a) * 0.62] });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const h = 1.6 + (i % 3) * 0.7;
    b.add(cone(0.32, h, 7), i % 2 ? '#ff8a1a' : '#ffb020', { pos: [Math.cos(a) * 0.35, 0.5 + h / 2, Math.sin(a) * 0.35], glow: true });
  }
  b.add(cone(0.5, 3.4, 8), '#ff5a1a', { pos: [0, 2.2, 0], glow: true });
  return b;
}

// Glowing target ring on the road where a fireball is about to land.
function fireMarkerBuilder() {
  const b = new GeoBuilder();
  b.add(tor(1.05, 0.08, 4, 28), '#ff3d1a', { pos: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0], glow: true });
  b.add(tor(0.6, 0.05, 4, 20), '#ffb020', { pos: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0], glow: true });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.add(box(0.5, 0.02, 0.1), '#ff3d1a', { pos: [Math.cos(a) * 0.35, 0.045, Math.sin(a) * 0.35], rot: [0, -a, 0], glow: true });
  }
  return b;
}

function chestBuilder() {
  const b = new GeoBuilder();
  b.add(box(1.0, 0.55, 0.65), '#8b3a2b', { pos: [0, 0.28, 0] });
  b.add(cyl(0.33, 0.33, 1.0, 12, 1, false), '#9c4433', { pos: [0, 0.55, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.98] });
  for (const x of [-0.42, 0, 0.42]) b.add(box(0.08, 0.92, 0.68), '#ffcc33', { pos: [x, 0.45, 0] });
  b.add(box(0.16, 0.2, 0.05), '#ffcc33', { pos: [0, 0.52, 0.35] });
  for (let i = 0; i < 6; i++) b.add(cyl(0.12, 0.12, 0.04, 10), '#ffe066', { pos: [(i - 2.5) * 0.15, 0.92 + (i % 2) * 0.06, 0], rot: [Math.PI / 2, 0, i], glow: true });
  return b;
}

// ------------------------------------------------------ coins & power-ups

export function coinGeometry() {
  const b = new GeoBuilder();
  b.add(cyl(0.36, 0.36, 0.08, 20), '#ffc21a', { rot: [Math.PI / 2, 0, 0] });
  b.add(cyl(0.27, 0.27, 0.1, 20), '#ffe066', { rot: [Math.PI / 2, 0, 0] });
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.08 : 0.19;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const sg = new THREE.ExtrudeGeometry(star, { depth: 0.12, bevelEnabled: false });
  sg.translate(0, 0, -0.06);
  b.add(sg, '#fff6c0', { glow: true });
  return b.build();
}

export function powerupBuilder(kind) {
  const b = new GeoBuilder();
  if (kind === 'magnet') {
    b.add(tor(0.32, 0.12, 8, 16, Math.PI), '#ff2e55', { pos: [0, 0.05, 0], rot: [0, 0, Math.PI] });
    for (const s of [-1, 1]) {
      b.add(cyl(0.12, 0.12, 0.3, 10), '#ff2e55', { pos: [s * 0.32, 0.2, 0] });
      b.add(cyl(0.125, 0.125, 0.14, 10), '#e9e9ef', { pos: [s * 0.32, 0.4, 0], glow: true });
    }
  } else if (kind === 'shield') {
    b.add(sph(0.4, 14, 10), '#3de1ff', { scale: [1, 1, 0.45] });
    b.add(sph(0.3, 12, 8), '#e9f8ff', { pos: [0, 0, 0.08], scale: [1, 1, 0.3], glow: true });
    b.add(box(0.08, 0.35, 0.06), '#3d7bff', { pos: [0, 0, 0.2] });
    b.add(box(0.3, 0.08, 0.06), '#3d7bff', { pos: [0, 0.05, 0.2] });
  } else {
    for (let i = 0; i < 4; i++) {
      b.add(box(0.12, 0.62, 0.05), '#e9e9ef', { rot: [0, 0, (i * Math.PI) / 4], glow: i % 2 === 0 });
    }
    b.add(cyl(0.12, 0.12, 0.08, 12), '#ffcc33', { rot: [Math.PI / 2, 0, 0] });
  }
  return b.build();
}

// --------------------------------------------------------------- scenery

// Roadside props for the instanced scenery layers. h = rough height (used
// to spread them out), r = footprint radius.
export const SCENERY_INFO = {
  cactus: { r: 0.6 }, shrubDry: { r: 0.4 }, rockSmall: { r: 0.5 }, rockBig: { r: 2.4 }, pole: { r: 0.3 },
  mesa: { r: 10 }, treeRound: { r: 1.8 }, bush: { r: 0.8 }, flowers: { r: 0.6 }, fence: { r: 1.6 },
  barn: { r: 4 }, windmill: { r: 5 }, lamp: { r: 0.3 }, house: { r: 3.5 }, tower: { r: 4 },
  pineSnow: { r: 1.6 }, snowMound: { r: 1.2 }, rockSnow: { r: 1.2 }, cabin: { r: 3 }, palm: { r: 1.5 },
  umbrellaProp: { r: 1.2 }, shell: { r: 0.3 }, hutProp: { r: 2.5 }, pineTall: { r: 1.8 }, oak: { r: 2.6 },
  fern: { r: 0.7 }, mushroom: { r: 0.4 }, moonFlag: { r: 0.5 }, moonDish: { r: 1.4 }, lander: { r: 3 },
  marsSpire: { r: 1.5 }, bldgTall: { r: 6 }, bldgMid: { r: 6 }, bldgShop: { r: 6 }, hydrant: { r: 0.3 }, trashCan: { r: 0.4 },
  cityTree: { r: 1.2 }, parkingMeter: { r: 0.2 }, newsBox: { r: 0.4 }, roverProp: { r: 1 }, habitat: { r: 4.5 }, lavaRock: { r: 1.4 }, deadTree: { r: 1.2 }, lavaVent: { r: 1.2 },
};

function pineInto(b, h, green, cap) {
  b.add(cyl(0.18, 0.26, h * 0.3, 7), '#6b4423', { pos: [0, h * 0.15, 0] });
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = (1 - t * 0.7) * h * 0.24;
    const y = h * (0.25 + t * 0.62);
    b.add(cone(r, h * 0.32, 8), green, { pos: [0, y, 0], rot: [0, i * 0.4, 0] });
    if (cap) b.add(cone(r * 0.75, h * 0.12, 8), cap, { pos: [0, y + h * 0.1, 0], rot: [0, i * 0.4, 0] });
  }
}

const SCENERY_BUILDERS = {
  cactus(env) {
    const b = new GeoBuilder();
    const g = '#4aa556';
    b.add(cyl(0.2, 0.24, 1.9, 8), g, { pos: [0, 0.95, 0] });
    b.add(sph(0.2, 8, 5), g, { pos: [0, 1.9, 0] });
    b.add(cyl(0.12, 0.12, 0.6, 7), g, { pos: [0.33, 1.25, 0] });
    b.add(cyl(0.12, 0.12, 0.3, 7), g, { pos: [0.18, 0.95, 0], rot: [0, 0, Math.PI / 2] });
    b.add(cyl(0.11, 0.11, 0.45, 7), g, { pos: [-0.3, 1.45, 0] });
    b.add(cyl(0.11, 0.11, 0.25, 7), g, { pos: [-0.17, 1.22, 0], rot: [0, 0, Math.PI / 2] });
    return b;
  },
  shrubDry() {
    const b = new GeoBuilder();
    for (let i = 0; i < 4; i++) b.add(sph(0.32, 6, 4), i % 2 ? '#a8873f' : '#8f7a3a', { pos: [(i - 1.5) * 0.25, 0.22, (i % 2) * 0.2], scale: [1, 0.7, 1] });
    return b;
  },
  rockSmall(env) {
    const b = new GeoBuilder();
    const c = env.rock || (env.id === 'sunset' ? '#b0633f' : env.id === 'snow' ? '#9fb0c6' : '#8a8c95');
    b.add(rockGeo(0.45, 4), c, { pos: [0, 0.2, 0] });
    b.add(rockGeo(0.28, 6), c, { pos: [0.45, 0.1, 0.2] });
    return b;
  },
  rockBig(env) {
    const b = new GeoBuilder();
    const c = env.rock || (env.id === 'sunset' ? '#b0583c' : env.id === 'beach' ? '#9c8a74' : '#7c7f8a');
    b.add(rockGeo(2.2, 11, 1), c, { pos: [0, 1.2, 0], scale: [1, 0.9, 0.9] });
    b.add(rockGeo(1.1, 12), c, { pos: [1.9, 0.5, 0.6] });
    return b;
  },
  pole() {
    const b = new GeoBuilder();
    b.add(cyl(0.1, 0.13, 6.5, 6), '#6b4a30', { pos: [0, 3.25, 0] });
    b.add(box(1.6, 0.12, 0.12), '#6b4a30', { pos: [0, 6.0, 0] });
    for (const x of [-0.6, 0, 0.6]) b.add(cyl(0.05, 0.05, 0.14, 6), '#cfe8ff', { pos: [x, 6.12, 0] });
    return b;
  },
  mesa(env) {
    const b = new GeoBuilder();
    const bands = ['#c25a3a', '#d9784a', '#a8463a', '#e08a52'];
    for (let i = 0; i < 4; i++) {
      const r = 9 - i * 0.8;
      b.add(cyl(r, r + 0.8, 4.5, 9), bands[i], { pos: [0, 2.25 + i * 4.5, 0], rot: [0, i * 0.3, 0] });
    }
    b.add(cyl(6.8, 6.8, 0.6, 9), '#9c4a36', { pos: [0, 18.3, 0] });
    return b;
  },
  treeRound(env) {
    const b = new GeoBuilder();
    const night = env.id === 'night';
    const leaf = night ? '#1f5a4a' : '#4fbf4a';
    const leaf2 = night ? '#18493e' : '#3fa53f';
    b.add(cyl(0.22, 0.3, 2.4, 7), night ? '#3a2a30' : '#7a4a26', { pos: [0, 1.2, 0] });
    b.add(sph(1.4, 10, 8), leaf, { pos: [0, 3.2, 0] });
    b.add(sph(1.0, 9, 7), leaf2, { pos: [0.8, 2.7, 0.4] });
    b.add(sph(0.9, 9, 7), leaf2, { pos: [-0.7, 2.9, -0.3] });
    b.add(sph(0.8, 9, 7), leaf, { pos: [0.1, 4.2, 0.1] });
    return b;
  },
  bush(env) {
    const b = new GeoBuilder();
    const c = env.id === 'night' ? '#1f4a40' : '#3fa53f';
    const c2 = env.id === 'night' ? '#255448' : '#5cbf45';
    b.add(sph(0.7, 9, 6), c, { pos: [0, 0.45, 0], scale: [1.2, 0.8, 1] });
    b.add(sph(0.5, 8, 6), c2, { pos: [0.6, 0.35, 0.2] });
    b.add(sph(0.45, 8, 6), c2, { pos: [-0.55, 0.3, -0.1] });
    return b;
  },
  flowers() {
    const b = new GeoBuilder();
    const cols = ['#ff5ea8', '#ffe066', '#ffffff', '#ff8c1a', '#7b2ff7'];
    for (let i = 0; i < 9; i++) {
      const x = (hash2(i, 1) - 0.5) * 1.4, z = (hash2(i, 2) - 0.5) * 1.4;
      b.add(cyl(0.02, 0.02, 0.35, 4), '#2bb673', { pos: [x, 0.17, z] });
      b.add(sph(0.09, 6, 4), cols[i % cols.length], { pos: [x, 0.38, z] });
    }
    return b;
  },
  fence() {
    const b = new GeoBuilder();
    const w = '#f4e3c8';
    for (const x of [-1.5, 0, 1.5]) b.add(box(0.14, 1.1, 0.14), w, { pos: [x, 0.55, 0] });
    for (const y of [0.45, 0.9]) b.add(box(3.1, 0.12, 0.06), w, { pos: [0, y, 0] });
    return b;
  },
  barn() {
    const b = new GeoBuilder();
    b.add(box(6, 4, 5), '#c8363a', { pos: [0, 2, 0] });
    b.add(box(6.4, 0.3, 5.4), '#ffffff', { pos: [0, 4.05, 0] });
    const roof = new THREE.CylinderGeometry(3.4, 3.4, 5.6, 4, 1, false, 0, Math.PI * 2);
    b.add(roof, '#7a2a2a', { pos: [0, 4.6, 0], rot: [Math.PI / 2, 0, Math.PI / 4], scale: [1, 1, 0.45] });
    b.add(box(2.2, 2.8, 0.1), '#ffffff', { pos: [0, 1.4, 2.52] });
    b.add(box(1.9, 2.5, 0.12), '#8a2a2e', { pos: [0, 1.35, 2.53] });
    return b;
  },
  windmill() {
    const b = new GeoBuilder();
    b.add(cyl(0.3, 0.6, 12, 6), '#e9e9ef', { pos: [0, 6, 0] });
    b.add(box(0.6, 0.6, 0.8), '#e9e9ef', { pos: [0, 12, 0.2] });
    for (let i = 0; i < 3; i++) b.add(box(0.35, 5, 0.08), '#ffffff', { pos: [0, 12, 0.65], rot: [0, 0, (i * Math.PI * 2) / 3] });
    return b;
  },
  lamp() {
    const b = new GeoBuilder();
    b.add(cyl(0.08, 0.12, 5.2, 7), '#3a3d55', { pos: [0, 2.6, 0] });
    b.add(box(1.3, 0.1, 0.12), '#3a3d55', { pos: [-0.6, 5.2, 0] });
    b.add(box(0.55, 0.16, 0.32), '#3a3d55', { pos: [-1.2, 5.12, 0] });
    b.add(box(0.45, 0.06, 0.26), '#fff2b0', { pos: [-1.2, 5.02, 0], glow: true });
    return b;
  },
  house(env) {
    const b = new GeoBuilder();
    const wall = ['#5a4a7a', '#4a5a7a', '#6a4a5a'][Math.floor(hash2(3, 4) * 3)];
    b.add(box(5, 3.4, 4.5), wall, { pos: [0, 1.7, 0] });
    const roof = new THREE.CylinderGeometry(3.2, 3.2, 5.2, 3, 1);
    b.add(roof, '#2a2240', { pos: [0, 4.1, 0], rot: [0, 0, Math.PI / 2], scale: [0.55, 1, 1] });
    for (const x of [-1.4, 1.4]) b.add(box(1, 1, 0.1), '#ffd36b', { pos: [x, 2.1, 2.27], glow: true });
    b.add(box(0.9, 1.7, 0.1), '#3a2a20', { pos: [0, 0.85, 2.27] });
    b.add(box(0.12, 0.12, 0.12), '#ffd36b', { pos: [0.6, 1.9, 2.3], glow: true });
    return b;
  },
  tower() {
    const b = new GeoBuilder();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.add(cyl(0.08, 0.08, 22, 4), '#5a5f7a', { pos: [Math.cos(a) * 0.7, 11, Math.sin(a) * 0.7], rot: [Math.sin(a) * 0.05, 0, -Math.cos(a) * 0.05] });
    }
    for (let k = 0; k < 7; k++) b.add(box(1.4 - k * 0.12, 0.08, 1.4 - k * 0.12), '#5a5f7a', { pos: [0, 2 + k * 3, 0] });
    b.add(sph(0.35, 8, 6), '#ff2e55', { pos: [0, 22.4, 0], glow: true });
    return b;
  },
  pineSnow() {
    const b = new GeoBuilder();
    pineInto(b, 6.5, '#2f6e4a', '#ffffff');
    return b;
  },
  snowMound() {
    const b = new GeoBuilder();
    b.add(sph(1.2, 10, 6), '#f6fbff', { pos: [0, 0, 0], scale: [1.4, 0.55, 1] });
    b.add(sph(0.7, 8, 6), '#e6f0fb', { pos: [1.0, 0, 0.4], scale: [1, 0.6, 1] });
    return b;
  },
  rockSnow() {
    const b = new GeoBuilder();
    b.add(rockGeo(1.1, 21), '#8a96aa', { pos: [0, 0.6, 0] });
    b.add(sph(0.85, 9, 6), '#ffffff', { pos: [0, 1.2, 0], scale: [1.1, 0.35, 1] });
    return b;
  },
  cabin() {
    const b = new GeoBuilder();
    for (let i = 0; i < 6; i++) b.add(cyl(0.25, 0.25, 5.2, 6), i % 2 ? '#7a4a26' : '#8b5a2b', { pos: [0, 0.25 + i * 0.48, 0], rot: [0, 0, Math.PI / 2] });
    const roof = new THREE.CylinderGeometry(3.1, 3.1, 4.8, 3, 1);
    b.add(roof, '#ffffff', { pos: [0, 3.9, 0], rot: [Math.PI / 2, 0, Math.PI / 2], scale: [1, 1, 0.5] });
    b.add(box(1, 0.9, 0.1), '#ffd36b', { pos: [1.2, 1.5, 2.0], glow: true });
    b.add(box(0.5, 1.6, 0.5), '#6b6f80', { pos: [-1.5, 4.4, 0] });
    b.add(box(4.6, 3, 3.8), '#7a4a26', { pos: [0, 1.5, 0] });
    return b;
  },
  palm() {
    const b = new GeoBuilder();
    const trunk = '#a8794a';
    let x = 0, y = 0;
    for (let i = 0; i < 7; i++) {
      const lean = 0.08 + i * 0.03;
      b.add(cyl(0.2 - i * 0.012, 0.24 - i * 0.012, 0.9, 7), i % 2 ? trunk : '#8f653c', { pos: [x, y + 0.45, 0], rot: [0, 0, -lean] });
      x += Math.sin(lean) * 0.9;
      y += Math.cos(lean) * 0.85;
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.add(box(0.5, 0.06, 2.4), i % 2 ? '#2bb673' : '#3fcf5a', {
        pos: [x + Math.cos(a) * 1.0, y - 0.25, Math.sin(a) * 1.0],
        rot: [0, -a + Math.PI / 2, 0.0],
        scale: [1, 1, 1],
      });
    }
    // Fronds droop: a second ring lower and further out.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      b.add(box(0.4, 0.05, 1.3), '#2bb673', { pos: [x + Math.cos(a) * 2.0, y - 0.75, Math.sin(a) * 2.0], rot: [0, -a + Math.PI / 2, 0] });
    }
    for (let i = 0; i < 3; i++) b.add(sph(0.17, 7, 5), '#6b4423', { pos: [x + (i - 1) * 0.22, y - 0.2, 0.15] });
    return b;
  },
  umbrellaProp() {
    const b = new GeoBuilder();
    b.add(cyl(0.04, 0.04, 2.4, 5), '#ffffff', { pos: [0, 1.2, 0], rot: [0, 0, 0.1] });
    const cols = ['#ff2e55', '#ffffff', '#ffe066', '#ffffff', '#3de1ff', '#ffffff', '#ff8c1a', '#ffffff'];
    cols.forEach((c, i) => {
      const g = new THREE.ConeGeometry(1.4, 0.55, 2, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4);
      b.add(g, c, { pos: [0.12, 2.45, 0], rot: [0, 0, 0.1] });
    });
    b.add(box(1.8, 0.03, 0.9), '#ff5ea8', { pos: [0.6, 0.02, 0.9] });
    return b;
  },
  shell() {
    const b = new GeoBuilder();
    for (let i = 0; i < 5; i++) b.add(cone(0.07, 0.32, 4), '#ff8c6a', { pos: [Math.cos((i / 5) * 6.28) * 0.14, 0.04, Math.sin((i / 5) * 6.28) * 0.14], rot: [Math.PI / 2, 0, -(i / 5) * 6.28 + Math.PI / 2] });
    return b;
  },
  hutProp() {
    const b = new GeoBuilder();
    for (let i = 0; i < 6; i++) b.add(box(0.6, 2.6, 3), i % 2 ? '#ffffff' : '#3de1ff', { pos: [-1.5 + i * 0.6, 1.3, 0] });
    const roof = new THREE.CylinderGeometry(2.3, 2.3, 3.4, 4, 1);
    b.add(roof, '#ff5e7a', { pos: [0, 3.1, 0], rot: [Math.PI / 2, 0, Math.PI / 4], scale: [1, 1, 0.35] });
    b.add(box(1.2, 0.8, 0.1), '#ffe066', { pos: [0, 1.6, 1.52] });
    return b;
  },
  pineTall() {
    const b = new GeoBuilder();
    pineInto(b, 10, '#2f7a3a', null);
    return b;
  },
  oak() {
    const b = new GeoBuilder();
    b.add(cyl(0.4, 0.6, 3.5, 8), '#6b4423', { pos: [0, 1.75, 0] });
    b.add(sph(2.4, 10, 8), '#3f8a35', { pos: [0, 4.6, 0] });
    b.add(sph(1.6, 9, 7), '#4f9e3c', { pos: [1.5, 4.0, 0.6] });
    b.add(sph(1.5, 9, 7), '#2f6e2c', { pos: [-1.4, 4.2, -0.5] });
    b.add(sph(1.3, 9, 7), '#4f9e3c', { pos: [0.2, 6.2, 0.2] });
    return b;
  },
  fern() {
    const b = new GeoBuilder();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.add(box(0.18, 0.04, 1.0), i % 2 ? '#3fa53f' : '#2f8a35', { pos: [Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4], rot: [0, -a + Math.PI / 2, 0], scale: [1, 1, 1] });
    }
    return b;
  },
  mushroom() {
    const b = new GeoBuilder();
    b.add(cyl(0.08, 0.1, 0.35, 6), '#fff4e0', { pos: [0, 0.17, 0] });
    b.add(sph(0.24, 10, 6, 0), '#ff2e55', { pos: [0, 0.38, 0], scale: [1, 0.6, 1] });
    for (let i = 0; i < 4; i++) b.add(sph(0.04, 5, 3), '#ffffff', { pos: [Math.cos(i * 1.6) * 0.14, 0.48, Math.sin(i * 1.6) * 0.14] });
    b.add(cyl(0.05, 0.07, 0.22, 6), '#fff4e0', { pos: [0.3, 0.11, 0.1] });
    b.add(sph(0.14, 8, 5), '#ff8c1a', { pos: [0.3, 0.24, 0.1], scale: [1, 0.6, 1] });
    return b;
  },

  // --- the moon
  moonFlag() {
    const b = new GeoBuilder();
    b.add(cyl(0.035, 0.035, 2.4, 6), '#e9ecf2', { pos: [0, 1.2, 0] });
    b.add(cyl(0.02, 0.02, 1.0, 4), '#e9ecf2', { pos: [0.5, 2.35, 0], rot: [0, 0, Math.PI / 2] });
    b.add(box(1.0, 0.62, 0.02), '#ffffff', { pos: [0.5, 2.03, 0] });
    b.add(box(0.98, 0.12, 0.025), '#3d7bff', { pos: [0.5, 1.82, 0] });
    b.add(cyl(0.12, 0.12, 0.03, 5), '#ffcc33', { pos: [0.5, 2.1, 0.01], rot: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 5; i++) b.add(box(0.12, 0.02, 0.28), '#6e707c', { pos: [(hash2(i, 61) - 0.3) * 1.4, 0.01, (hash2(i, 62) - 0.5) * 1.2], rot: [0, hash2(i, 63) * 3, 0] });
    return b;
  },
  moonDish() {
    const b = new GeoBuilder();
    b.add(cyl(0.12, 0.2, 1.6, 8), '#c9ccd6', { pos: [0, 0.8, 0] });
    b.add(box(0.6, 0.12, 0.6), '#8a8c95', { pos: [0, 0.06, 0] });
    b.add(new THREE.SphereGeometry(1.0, 14, 6, 0, Math.PI * 2, 0, 1.1), '#e9ecf2', { pos: [0, 2.2, 0], rot: [Math.PI - 0.6, 0, 0] });
    b.add(cyl(0.03, 0.03, 0.9, 4), '#c9ccd6', { pos: [0, 2.0, 0.3], rot: [0.6, 0, 0] });
    b.add(sph(0.08, 6, 4), '#ff2e55', { pos: [0, 2.4, 0.6], glow: true });
    return b;
  },
  lander() {
    const b = new GeoBuilder();
    b.add(box(2.2, 1.2, 2.2), '#e8b84a', { pos: [0, 1.4, 0], rot: [0, Math.PI / 4, 0] });
    for (let i = 0; i < 4; i++) b.add(box(2.25, 0.04, 0.05), '#b8863a', { pos: [0, 1.0 + i * 0.27, 0], rot: [0, Math.PI / 4 + (i % 2) * Math.PI / 2, 0] });
    b.add(new THREE.CylinderGeometry(1.1, 1.3, 1.4, 8), '#d8dce4', { pos: [0, 2.7, 0] });
    b.add(box(0.5, 0.5, 0.06), '#1a1c2a', { pos: [0, 2.8, 1.12] });
    b.add(cone(0.5, 0.6, 8), '#6e707c', { pos: [0, 0.65, 0], rot: [Math.PI, 0, 0] });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.add(cyl(0.06, 0.06, 2.0, 5), '#c9ccd6', { pos: [Math.cos(a) * 1.5, 0.8, Math.sin(a) * 1.5], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] });
      b.add(cyl(0.28, 0.32, 0.08, 10), '#c9ccd6', { pos: [Math.cos(a) * 1.95, 0.04, Math.sin(a) * 1.95] });
    }
    b.add(cyl(0.03, 0.03, 1.0, 4), '#c9ccd6', { pos: [0.5, 3.8, 0] });
    b.add(new THREE.SphereGeometry(0.4, 10, 5, 0, Math.PI * 2, 0, 1.2), '#e9ecf2', { pos: [0.5, 4.3, 0], rot: [Math.PI, 0, 0] });
    return b;
  },

  // --- mars
  marsSpire(env) {
    const b = new GeoBuilder();
    const c = env.rock || '#a8482a';
    b.add(cyl(0.5, 1.1, 3.2, 7), c, { pos: [0, 1.6, 0] });
    b.add(cyl(0.9, 0.55, 0.9, 7), '#c4572f', { pos: [0.1, 3.6, 0], rot: [0, 0.4, 0.1] });
    b.add(rockGeo(0.6, 4), '#8a3a22', { pos: [0.9, 0.3, 0.4] });
    b.add(rockGeo(0.4, 6), c, { pos: [-0.8, 0.2, -0.3] });
    return b;
  },
  roverProp() {
    const b = new GeoBuilder();
    roverInto(b, 1.2);
    return b;
  },
  habitat() {
    const b = new GeoBuilder();
    b.add(new THREE.SphereGeometry(3.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#e9ecf2', {});
    b.add(cyl(3.5, 3.6, 0.4, 18), '#8a8c95', { pos: [0, 0.2, 0] });
    for (let i = 0; i < 3; i++) b.add(tor(3.4, 0.06, 4, 24, Math.PI), '#b8bcc8', { rot: [0, (i / 3) * Math.PI, 0] });
    b.add(box(1.4, 1.6, 1.8), '#d8dce4', { pos: [0, 0.8, 3.4] });
    b.add(box(0.7, 1.0, 0.06), '#3de1ff', { pos: [0, 0.75, 4.31], glow: true });
    b.add(cyl(1.2, 1.2, 2.2, 12), '#d8dce4', { pos: [4.6, 1.1, -1] });
    b.add(new THREE.SphereGeometry(1.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#e9ecf2', { pos: [4.6, 2.2, -1] });
    b.add(cyl(0.05, 0.05, 2.6, 4), '#c9ccd6', { pos: [-2, 4.2, 0] });
    b.add(sph(0.1, 6, 4), '#ff2e55', { pos: [-2, 5.5, 0], glow: true });
    for (let i = 0; i < 3; i++) b.add(box(1.6, 0.05, 1.0), '#2a4fa8', { pos: [-5.2, 0.9, -1.5 + i * 1.2], rot: [0.5, 0, 0] });
    return b;
  },

  // --- volcano
  lavaRock(env) {
    const b = new GeoBuilder();
    const c = env.rock || '#3a3034';
    b.add(rockGeo(1.2, 21, 1), c, { pos: [0, 0.8, 0], scale: [1, 0.8, 1] });
    b.add(rockGeo(0.6, 22), c, { pos: [1.1, 0.3, 0.3] });
    lavaCracksInto(b, 1.15, 0.8);
    return b;
  },
  deadTree() {
    const b = new GeoBuilder();
    const wood = '#1e1416';
    b.add(cyl(0.14, 0.26, 3.2, 6), wood, { pos: [0, 1.6, 0], rot: [0, 0, 0.08] });
    b.add(cyl(0.06, 0.1, 1.5, 5), wood, { pos: [0.45, 2.6, 0], rot: [0, 0, -0.8] });
    b.add(cyl(0.05, 0.09, 1.2, 5), wood, { pos: [-0.4, 2.2, 0.1], rot: [0.2, 0, 0.9] });
    b.add(cyl(0.04, 0.07, 0.9, 5), wood, { pos: [0.1, 3.4, -0.2], rot: [-0.5, 0, 0.3] });
    b.add(box(0.05, 0.6, 0.05), '#ff6a1a', { pos: [0.05, 0.6, 0.2], glow: true });
    return b;
  },
  lavaVent() {
    const b = new GeoBuilder();
    b.add(cyl(0.45, 1.2, 1.1, 8), '#2a2024', { pos: [0, 0.55, 0] });
    b.add(cyl(0.42, 0.42, 0.06, 8), '#ffb020', { pos: [0, 1.1, 0], glow: true });
    b.add(sph(0.35, 8, 5), '#ff6a1a', { pos: [0.6, 0.05, 0.5], scale: [2.2, 0.2, 1.4], glow: true });
    for (let i = 0; i < 3; i++) b.add(sph(0.35 + i * 0.12, 8, 6), '#5a4a4c', { pos: [0.1 * i, 1.6 + i * 0.7, -0.1 * i], scale: [1, 0.8, 1] });
    return b;
  },

  // --- downtown (buildings line the street; see Track's street wall)
  bldgTall() {
    const b = new GeoBuilder();
    buildingInto(b, 12, 38, 10, '#4a5578', '#2e3550', 1);
    b.add(box(3, 3, 3), '#3a4260', { pos: [2, 39.9, -1] });
    b.add(cyl(0.08, 0.08, 6, 4), '#c9ccd6', { pos: [-3, 41, 0] });
    b.add(sph(0.25, 6, 4), '#ff2e55', { pos: [-3, 44, 0], glow: true });
    return b;
  },
  bldgMid() {
    const b = new GeoBuilder();
    buildingInto(b, 12, 21, 10, '#8a4a3a', '#5a2e24', 2, { awning: '#2f7a4a', sign: '#ff5ea8' });
    b.add(cyl(1.3, 1.3, 2.4, 10), '#7a5a3a', { pos: [-2.5, 22.6, -1] });
    b.add(cone(1.5, 1, 10), '#5a4026', { pos: [-2.5, 24.3, -1] });
    for (const x of [-3.5, -1.5]) b.add(cyl(0.08, 0.08, 1.4, 4), '#3a3a44', { pos: [x, 21.6, -1] });
    return b;
  },
  bldgShop() {
    const b = new GeoBuilder();
    buildingInto(b, 12, 11, 10, '#c9b48a', '#8a7a5a', 3, { awning: '#ff2e55', sign: '#3de1ff' });
    b.add(box(1.2, 0.8, 1.2), '#8a8c95', { pos: [3, 11.8, 0] });
    return b;
  },
  hydrant() {
    const b = new GeoBuilder();
    b.add(cyl(0.16, 0.18, 0.6, 10), '#e0302a', { pos: [0, 0.3, 0] });
    b.add(sph(0.17, 10, 6), '#e0302a', { pos: [0, 0.62, 0] });
    for (const sd of [-1, 1]) b.add(cyl(0.07, 0.07, 0.14, 8), '#e0302a', { pos: [sd * 0.2, 0.42, 0], rot: [0, 0, Math.PI / 2] });
    b.add(cyl(0.22, 0.22, 0.06, 10), '#a82420', { pos: [0, 0.03, 0] });
    return b;
  },
  trashCan() {
    const b = new GeoBuilder();
    b.add(cyl(0.3, 0.26, 0.9, 12), '#2f5a3a', { pos: [0, 0.45, 0] });
    b.add(cyl(0.34, 0.34, 0.08, 12), '#24462e', { pos: [0, 0.92, 0] });
    for (let i = 0; i < 6; i++) b.add(box(0.03, 0.8, 0.03), '#24462e', { pos: [Math.cos(i) * 0.3, 0.45, Math.sin(i) * 0.3] });
    return b;
  },
  cityTree() {
    const b = new GeoBuilder();
    b.add(box(1.3, 0.35, 1.3), '#8a8c95', { pos: [0, 0.17, 0] });
    b.add(box(1.1, 0.05, 1.1), '#4a3220', { pos: [0, 0.36, 0] });
    b.add(cyl(0.1, 0.14, 2.6, 6), '#5a3a22', { pos: [0, 1.6, 0] });
    b.add(sph(1.1, 9, 7), '#3f9a4a', { pos: [0, 3.3, 0] });
    b.add(sph(0.75, 8, 6), '#4fb85a', { pos: [0.5, 3.0, 0.3] });
    return b;
  },
  parkingMeter() {
    const b = new GeoBuilder();
    b.add(cyl(0.04, 0.05, 1.1, 6), '#5a5d6a', { pos: [0, 0.55, 0] });
    b.add(box(0.2, 0.32, 0.16), '#9aa3b5', { pos: [0, 1.25, 0] });
    b.add(box(0.12, 0.08, 0.02), '#7dffb0', { pos: [0, 1.3, 0.09], glow: true });
    return b;
  },
  newsBox() {
    const b = new GeoBuilder();
    b.add(box(0.5, 0.9, 0.45), '#2a4fa8', { pos: [0, 0.55, 0] });
    b.add(box(0.4, 0.3, 0.02), '#e9ecf2', { pos: [0, 0.75, 0.23] });
    for (const sd of [-1, 1]) b.add(box(0.04, 0.12, 0.4), '#1a1a22', { pos: [sd * 0.2, 0.06, 0] });
    return b;
  },
};

// ------------------------------------------------------------------ cache

const cache = new Map();

export function obstaclePrefab(type, span, env) {
  const key = `o|${type}|${span}|${env.id}`;
  if (!cache.has(key)) cache.set(key, OBSTACLE_BUILDERS[type](span, env).build());
  return cache.get(key);
}

export function sceneryPrefab(type, env) {
  const key = `s|${type}|${env.id}`;
  if (!cache.has(key)) cache.set(key, SCENERY_BUILDERS[type](env).build());
  return cache.get(key);
}

export function piecePrefab(kind, span, env) {
  const key = `p|${kind}|${span}|${env.id}`;
  if (!cache.has(key)) {
    const b = kind === 'ramp' ? rampBuilder(env)
      : kind === 'rail' ? railSegBuilder(env)
      : kind === 'gap' ? gapBuilder(span, env)
      : kind === 'ice' ? iceBuilder(span)
      : kind === 'fireballBall' ? fireballBallBuilder()
      : kind === 'fireMarker' ? fireMarkerBuilder()
      : chestBuilder();
    cache.set(key, b.build());
  }
  return cache.get(key);
}

export function hasObstacle(type) {
  return !!OBSTACLE_BUILDERS[type];
}
