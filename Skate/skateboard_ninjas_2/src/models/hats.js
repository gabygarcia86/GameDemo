// Hats for the player's ninja (the list and prices live in cosmetics.js).
// Each hat is built from primitives and merged (GeoBuilder), around an origin
// at HAT_BASE on the head joint: the crown of the head, just above the
// headband. +Z is the front of the face. The head is a ball of radius 0.34
// whose top sits 0.146 above the origin, 0.28 wide at the origin.
//
// A builder returns { b, rot?, spin?, spinAt?, double?, glass?, hideTails? }:
//   rot      tilts the whole hat about the origin
//   spin     a second GeoBuilder that spins (the propeller), at spinAt
//   double   render both sides (open shapes like the samurai neck guard)
//   glass    a see-through bubble { r, pos } (space helmet)
//   hideTails  hides the headband tails, which would poke through

import { THREE, GeoBuilder, prefabMesh, addOutlines, MATS } from '../gfx.js';
import { HATS } from '../cosmetics.js';
import { NinjaRig } from './ninja.js';

export const HAT_BASE = 0.5;
const HEAD_C = -0.194; // centre of the head ball, relative to the hat origin
const HEAD_R = 0.34;

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 18) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
const dome = (r, ws = 20, hs = 10) => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2);
const cone = (r, h, seg = 18) => new THREE.ConeGeometry(r, h, seg);
const tor = (r, t, rs = 8, ts = 28, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
const FLAT = [Math.PI / 2, 0, 0]; // lay a torus flat around the head

function star(size, depth = 0.02) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? size * 0.42 : size;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}

const BUILDERS = {
  beanie() {
    const b = new GeoBuilder();
    b.add(dome(0.31), '#ff2e55', { pos: [0, 0, 0] });
    for (let i = 0; i < 10; i++) b.add(box(0.03, 0.28, 0.02), '#d81e44', { pos: [Math.sin((i / 10) * Math.PI * 2) * 0.27, 0.1, Math.cos((i / 10) * Math.PI * 2) * 0.27], rot: [0, (i / 10) * Math.PI * 2, 0] });
    b.add(tor(0.3, 0.06), '#ffe066', { pos: [0, 0.02, 0], rot: FLAT });
    b.add(sph(0.1), '#ffffff', { pos: [0, 0.36, 0] });
    return { b };
  },

  party() {
    const b = new GeoBuilder();
    b.add(cone(0.24, 0.55), '#ff3df0', { pos: [0, 0.3, 0] });
    // Polka dots spiralling up the cone.
    for (let i = 0; i < 9; i++) {
      const y = 0.08 + i * 0.05;
      const r = 0.24 * (1 - (y + 0.025) / 0.55) + 0.01;
      const a = i * 1.9;
      b.add(sph(0.032, 8, 6), ['#ffe066', '#3de1ff', '#7dffb0'][i % 3], { pos: [Math.sin(a) * r, y, Math.cos(a) * r] });
    }
    b.add(sph(0.07, 10, 8), '#ffe066', { pos: [0, 0.58, 0] });
    for (let i = 0; i < 5; i++) b.add(box(0.025, 0.12, 0.025), ['#3de1ff', '#ffe066', '#ff2e55'][i % 3], { pos: [Math.sin(i * 1.26) * 0.06, 0.64, Math.cos(i * 1.26) * 0.06], rot: [Math.cos(i * 1.26) * 0.6, 0, -Math.sin(i * 1.26) * 0.6] });
    return { b, rot: [0.1, 0, -0.22] };
  },

  fez() {
    const b = new GeoBuilder();
    b.add(cyl(0.19, 0.27, 0.3), '#c8102e', { pos: [0, 0.12, 0] });
    b.add(cyl(0.02, 0.02, 0.05, 8), '#1a1a24', { pos: [0, 0.29, 0] });
    b.add(box(0.15, 0.02, 0.02), '#1a1a24', { pos: [0.08, 0.31, 0] });
    b.add(box(0.025, 0.2, 0.025), '#1a1a24', { pos: [0.17, 0.21, 0], rot: [0, 0, 0.15] });
    b.add(cone(0.04, 0.09, 8), '#1a1a24', { pos: [0.185, 0.08, 0], rot: [Math.PI, 0, 0] });
    return { b, rot: [0, 0, -0.12] };
  },

  chef() {
    const b = new GeoBuilder();
    b.add(cyl(0.29, 0.29, 0.22), '#f4f4f8', { pos: [0, 0.08, 0] });
    for (const [x, y, z, r] of [[0.15, 0.3, 0, 0.19], [-0.15, 0.3, 0, 0.19], [0, 0.3, 0.15, 0.19], [0, 0.3, -0.15, 0.19], [0, 0.42, 0, 0.21]]) {
      b.add(sph(r), y > 0.4 ? '#ffffff' : '#eceef4', { pos: [x, y, z] });
    }
    b.add(box(0.5, 0.02, 0.02), '#d8dce8', { pos: [0, 0.12, 0.29] });
    return { b };
  },

  propeller() {
    const b = new GeoBuilder();
    // Four-colour cap with a peak at the front.
    ['#ff2e55', '#ffe066', '#3d7bff', '#2bb673'].forEach((c, i) => {
      b.add(new THREE.SphereGeometry(0.3, 8, 10, (i * Math.PI) / 2, Math.PI / 2, 0, Math.PI / 2), c, { pos: [0, -0.02, 0] });
    });
    b.add(cyl(0.21, 0.21, 0.025, 18), '#3d7bff', { pos: [0, -0.01, 0.26], scale: [1, 1, 0.75] });
    b.add(cyl(0.025, 0.025, 0.12, 8), '#e9ecf2', { pos: [0, 0.32, 0] });
    const spin = new GeoBuilder();
    spin.add(sph(0.045, 10, 8), '#ff2e55', {});
    spin.add(box(0.6, 0.015, 0.09), '#ffe066', { rot: [0.3, 0, 0] });
    spin.add(box(0.09, 0.015, 0.6), '#ff2e55', { rot: [0, 0, 0.3] });
    return { b, spin, spinAt: [0, 0.39, 0] };
  },

  bunny() {
    const b = new GeoBuilder();
    for (const s of [-1, 1]) {
      const bend = s > 0; // the right ear flops over at the tip
      b.add(new THREE.CapsuleGeometry(0.07, 0.3, 4, 10), '#f4f0f4', { pos: [s * 0.13, 0.24, -0.03], rot: [0, 0, -s * 0.18], scale: [1, 1, 0.55] });
      b.add(new THREE.CapsuleGeometry(0.04, 0.24, 4, 8), '#ff9ad8', { pos: [s * 0.13, 0.24, 0.005], rot: [0, 0, -s * 0.18], scale: [1, 1, 0.4] });
      if (bend) b.add(new THREE.CapsuleGeometry(0.065, 0.16, 4, 10), '#f4f0f4', { pos: [0.24, 0.47, 0.03], rot: [0.9, 0, -1.2], scale: [1, 1, 0.55] });
      else b.add(new THREE.CapsuleGeometry(0.065, 0.14, 4, 10), '#f4f0f4', { pos: [-0.2, 0.5, -0.03], rot: [0, 0, 0.18], scale: [1, 1, 0.55] });
    }
    return { b };
  },

  cone() {
    const b = new GeoBuilder();
    const H = 0.72, R0 = 0.28;
    const rAt = (y) => R0 * (1 - y / H);
    b.add(box(0.62, 0.05, 0.62), '#2a2a33', { pos: [0, 0.0, 0] });
    b.add(cone(R0, H), '#ff7a1a', { pos: [0, H / 2, 0] });
    for (const y of [0.2, 0.4]) b.add(cyl(rAt(y + 0.05) + 0.006, rAt(y - 0.05) + 0.006, 0.1), '#ffffff', { pos: [0, y, 0] });
    return { b, rot: [0, 0, 0.12] };
  },

  graduation() {
    const b = new GeoBuilder();
    b.add(cyl(0.29, 0.29, 0.14), '#1a1a24', { pos: [0, 0.05, 0] });
    b.add(box(0.72, 0.04, 0.72), '#1a1a24', { pos: [0, 0.14, 0], rot: [0, Math.PI / 4, 0] });
    b.add(sph(0.035, 8, 6), '#ffcc33', { pos: [0, 0.17, 0] });
    b.add(box(0.47, 0.015, 0.015), '#ffcc33', { pos: [0.235, 0.165, 0] });
    b.add(box(0.025, 0.22, 0.025), '#ffcc33', { pos: [0.47, 0.05, 0] });
    b.add(cone(0.045, 0.1, 8), '#ffcc33', { pos: [0.47, -0.08, 0], rot: [Math.PI, 0, 0] });
    return { b, rot: [-0.08, 0.4, 0] };
  },

  cowboy() {
    const b = new GeoBuilder();
    b.add(cyl(0.58, 0.58, 0.03, 28), '#8b5a2b', { pos: [0, 0.0, 0], scale: [1, 1, 0.85] });
    for (const s of [-1, 1]) b.add(box(0.1, 0.03, 0.74), '#8b5a2b', { pos: [s * 0.55, 0.06, 0], rot: [0, 0, -s * 0.75] });
    b.add(cyl(0.23, 0.28, 0.3), '#9a6a3a', { pos: [0, 0.15, 0] });
    b.add(box(0.06, 0.06, 0.4), '#7a4a26', { pos: [0, 0.29, 0] });
    b.add(cyl(0.285, 0.285, 0.06), '#3a2414', { pos: [0, 0.04, 0] });
    b.add(star(0.06), '#ffcc33', { pos: [0, 0.05, 0.29] });
    return { b, rot: [-0.08, 0, 0] };
  },

  topHat() {
    const b = new GeoBuilder();
    b.add(cyl(0.44, 0.44, 0.03, 28), '#1c1a24', { pos: [0, 0.015, 0] });
    b.add(tor(0.43, 0.025, 6, 32), '#1c1a24', { pos: [0, 0.035, 0], rot: FLAT });
    b.add(cyl(0.27, 0.25, 0.5), '#1c1a24', { pos: [0, 0.27, 0] });
    b.add(cyl(0.262, 0.262, 0.08), '#c8102e', { pos: [0, 0.08, 0] });
    b.add(box(0.07, 0.11, 0.02), '#ffffff', { pos: [0.18, 0.12, 0.2], rot: [0, 0.7, 0.15] });
    return { b, rot: [0, 0, -0.1] };
  },

  santa() {
    const b = new GeoBuilder();
    b.add(cyl(0.18, 0.29, 0.25), '#d81e2a', { pos: [0, 0.12, 0] });
    b.add(cone(0.18, 0.38), '#d81e2a', { pos: [0, 0.3, -0.12], rot: [-1.0, 0, 0] });
    b.add(tor(0.3, 0.075, 8, 26), '#ffffff', { pos: [0, 0.02, 0], rot: FLAT });
    b.add(sph(0.085), '#ffffff', { pos: [0, 0.38, -0.31] });
    return { b };
  },

  pirate() {
    const b = new GeoBuilder();
    b.add(cyl(0.31, 0.31, 0.14), '#1a1420', { pos: [0, 0.05, 0] });
    b.add(dome(0.27), '#1a1420', { pos: [0, 0.1, 0] });
    // Three turned-up flaps, front one facing the player.
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      b.add(box(0.6, 0.24, 0.05).rotateX(-0.4), '#1a1420', { pos: [Math.sin(a) * 0.29, 0.17, Math.cos(a) * 0.29], rot: [0, a, 0] });
      b.add(box(0.6, 0.03, 0.06).rotateX(-0.4), '#ffcc33', { pos: [Math.sin(a) * 0.34, 0.29, Math.cos(a) * 0.34], rot: [0, a, 0] });
    }
    b.add(sph(0.07, 12, 10), '#ffffff', { pos: [0, 0.2, 0.33], scale: [1, 0.95, 0.6] });
    for (const s of [-1, 1]) {
      b.add(sph(0.016, 6, 4), '#1a1420', { pos: [s * 0.025, 0.21, 0.37] });
      b.add(box(0.2, 0.03, 0.02), '#ffffff', { pos: [0, 0.13, 0.35], rot: [0, 0, s * 0.6] });
    }
    return { b, rot: [-0.1, 0, 0] };
  },

  sombrero() {
    const b = new GeoBuilder();
    b.add(cyl(0.85, 0.85, 0.03, 32), '#e8c35a', { pos: [0, 0.0, 0] });
    b.add(tor(0.84, 0.05, 6, 36), '#d8a83a', { pos: [0, 0.04, 0], rot: FLAT });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      b.add(box(0.12, 0.035, 0.12), i % 2 ? '#2bb673' : '#ff2e55', { pos: [Math.sin(a) * 0.62, 0.02, Math.cos(a) * 0.62], rot: [0, a + Math.PI / 4, 0] });
    }
    b.add(cyl(0.13, 0.28, 0.36), '#e8c35a', { pos: [0, 0.18, 0] });
    b.add(sph(0.13, 12, 8), '#e8c35a', { pos: [0, 0.36, 0], scale: [1, 0.5, 1] });
    b.add(tor(0.27, 0.03, 6, 26), '#ff2e55', { pos: [0, 0.04, 0], rot: FLAT });
    b.add(tor(0.22, 0.025, 6, 26), '#2bb673', { pos: [0, 0.14, 0], rot: FLAT });
    return { b, rot: [-0.06, 0, 0.05] };
  },

  viking() {
    const b = new GeoBuilder();
    const metal = '#9aa0ae', bronze = '#c8893f', horn = '#f2e6c8';
    b.add(dome(0.33), metal, { pos: [0, -0.05, 0] });
    b.add(cyl(0.335, 0.335, 0.08, 24), bronze, { pos: [0, -0.02, 0] });
    b.add(tor(0.33, 0.03, 6, 20, Math.PI), bronze, { pos: [0, -0.05, 0], rot: [0, Math.PI / 2, 0] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add(sph(0.022, 6, 4), '#e8c87a', { pos: [Math.sin(a) * 0.34, -0.02, Math.cos(a) * 0.34] });
    }
    // Curved horns: a thick base segment bent upward into the tip.
    for (const s of [-1, 1]) {
      b.add(cyl(0.06, 0.09, 0.26, 12), horn, { pos: [s * 0.41, 0.12, 0], rot: [0, 0, -s * 1.0] });
      b.add(cone(0.06, 0.26, 12), horn, { pos: [s * 0.56, 0.31, 0], rot: [0, 0, -s * 0.3] });
    }
    return { b };
  },

  wizard() {
    const b = new GeoBuilder();
    const purple = '#5a2fa8';
    b.add(cyl(0.5, 0.5, 0.03, 30), purple, { pos: [0, 0.0, 0] });
    b.add(cyl(0.14, 0.3, 0.45), purple, { pos: [0, 0.225, 0] });
    b.add(cone(0.14, 0.4), purple, { pos: [0, 0.615, -0.113], rot: [-0.6, 0, 0] });
    b.add(cyl(0.29, 0.3, 0.06), '#ffcc33', { pos: [0, 0.05, 0] });
    // Stars and dots on the cone, facing outward.
    for (const [a, y, s] of [[0.2, 0.18, 0.06], [2.3, 0.26, 0.05], [4.2, 0.14, 0.055], [1.2, 0.34, 0.04], [5.4, 0.3, 0.045]]) {
      const r = 0.3 - (0.16 * y) / 0.45 + 0.012;
      b.add(star(s), '#ffe066', { pos: [Math.sin(a) * r, y, Math.cos(a) * r], rot: [0, a, 0], glow: true });
    }
    return { b, rot: [0, 0, 0.08] };
  },

  unicorn() {
    const b = new GeoBuilder();
    // Spiral horn on the forehead, pointing up and forward.
    const base = [0, HEAD_C + HEAD_R * Math.cos(0.6), HEAD_R * Math.sin(0.6)];
    const tilt = 0.6;
    const axis = [0, Math.cos(tilt), Math.sin(tilt)];
    const L = 0.42;
    b.add(cone(0.085, L, 16), '#ffe066', { pos: [base[0], base[1] + axis[1] * L / 2, base[2] + axis[2] * L / 2], rot: [tilt, 0, 0] });
    for (let i = 0; i < 4; i++) {
      const t = 0.06 + i * 0.08;
      const r = 0.085 * (1 - t / L) + 0.006;
      b.add(tor(r, 0.012, 5, 16), i % 2 ? '#ff9ad8' : '#ffffff', { pos: [0, base[1] + axis[1] * t, base[2] + axis[2] * t], rot: [Math.PI / 2 + tilt, 0, 0] });
    }
    // Little ears and a pastel mane down the back.
    for (const s of [-1, 1]) b.add(cone(0.06, 0.16, 8), '#f4f0f4', { pos: [s * 0.2, 0.06, -0.06], rot: [0, 0, -s * 0.4] });
    ['#ff9ad8', '#b48cff', '#7de8ff', '#7dffb0', '#ffe066'].forEach((c, i) => {
      const phi = 0.15 + i * 0.38;
      b.add(sph(0.1, 10, 8), c, { pos: [0, HEAD_C + (HEAD_R + 0.02) * Math.cos(phi), -(HEAD_R + 0.02) * Math.sin(phi)] });
    });
    return { b, hideTails: true };
  },

  samurai() {
    const b = new GeoBuilder();
    const lacquer = '#2a2a36', gold = '#ffcc33';
    b.add(dome(0.34), lacquer, { pos: [0, -0.06, 0] });
    for (let i = 0; i < 6; i++) b.add(tor(0.345, 0.012, 4, 16, Math.PI), '#4a4a5a', { pos: [0, -0.06, 0], rot: [0, (i / 6) * Math.PI, 0] });
    // Flared neck guard round the sides and back.
    for (let k = 0; k < 3; k++) {
      b.add(new THREE.CylinderGeometry(0.35 + k * 0.04, 0.4 + k * 0.04, 0.09, 22, 1, true, Math.PI * 0.35, Math.PI * 1.3), k % 2 ? '#c8102e' : lacquer, { pos: [0, -0.1 - k * 0.08, 0] });
    }
    b.add(cyl(0.36, 0.36, 0.03, 24), lacquer, { pos: [0, -0.06, 0.02] });
    // Golden crest.
    for (const s of [-1, 1]) b.add(box(0.045, 0.42, 0.03), gold, { pos: [s * 0.1, 0.2, 0.31], rot: [0.25, 0, -s * 0.38] });
    b.add(cyl(0.07, 0.07, 0.03, 16), gold, { pos: [0, 0.03, 0.34], rot: [Math.PI / 2 - 0.25, 0, 0] });
    return { b, double: true };
  },

  halo() {
    const b = new GeoBuilder();
    b.add(tor(0.25, 0.04, 8, 32), '#fff0a0', { pos: [0, 0.3, 0], rot: [Math.PI / 2 - 0.3, 0, 0], glow: true });
    return { b };
  },

  spaceHelmet() {
    const b = new GeoBuilder();
    const white = '#e9ecf2';
    b.add(tor(0.3, 0.075, 8, 26), white, { pos: [0, HEAD_C - 0.29, 0], rot: FLAT });
    b.add(cyl(0.34, 0.34, 0.06, 26), '#9aa0ae', { pos: [0, HEAD_C - 0.24, 0] });
    for (const s of [-1, 1]) {
      b.add(cyl(0.1, 0.1, 0.08, 16), white, { pos: [s * 0.47, HEAD_C, 0], rot: [0, 0, Math.PI / 2] });
      b.add(cyl(0.05, 0.05, 0.085, 12), '#3de1ff', { pos: [s * 0.475, HEAD_C, 0], rot: [0, 0, Math.PI / 2], glow: true });
    }
    b.add(cyl(0.015, 0.015, 0.3, 6), '#c9ccd6', { pos: [0.22, 0.3, -0.05], rot: [0, 0, -0.35] });
    b.add(sph(0.04, 8, 6), '#ff2e55', { pos: [0.27, 0.44, -0.05], glow: true });
    // A glint on the glass.
    b.add(sph(0.08, 10, 8), '#ffffff', { pos: [-0.2, HEAD_C + 0.3, 0.32], scale: [1, 0.45, 0.2], rot: [0, -0.5, 0.6], glow: true });
    return { b, glass: { r: 0.48, pos: [0, HEAD_C, 0] }, hideTails: true };
  },

  crown() {
    const b = new GeoBuilder();
    const gold = '#ffcc33';
    b.add(dome(0.24), '#c8102e', { pos: [0, 0.07, 0] });
    b.add(cyl(0.3, 0.29, 0.14, 24), gold, { pos: [0, 0.05, 0] });
    b.add(tor(0.3, 0.035, 6, 26), '#fff4f0', { pos: [0, -0.02, 0], rot: FLAT });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add(cone(0.075, 0.2, 8), gold, { pos: [Math.sin(a) * 0.27, 0.22, Math.cos(a) * 0.27] });
      b.add(sph(0.035, 8, 6), '#fff6c0', { pos: [Math.sin(a) * 0.27, 0.33, Math.cos(a) * 0.27], glow: true });
      b.add(sph(0.045, 10, 8), ['#ff2e55', '#3d7bff', '#2bb673'][i % 3], { pos: [Math.sin(a + 0.52) * 0.3, 0.06, Math.cos(a + 0.52) * 0.3], scale: [1, 1, 0.5], rot: [0, a + 0.52, 0], glow: true });
    }
    return { b };
  },
};

const cache = new Map();
let glassMat = null;

// A new hat group for the head joint, or null for no hat.
export function hatMesh(id, outline = true) {
  const builder = BUILDERS[id];
  if (!builder) return null;
  let H = cache.get(id);
  if (!H) {
    const r = builder();
    H = { ...r, main: r.b.build(), spin: r.spin ? r.spin.build() : null };
    cache.set(id, H);
  }
  const group = new THREE.Group();
  group.position.y = HAT_BASE;
  if (H.rot) group.rotation.set(...H.rot);
  group.add(prefabMesh(H.main, { double: !!H.double }));
  if (H.spin) {
    const s = prefabMesh(H.spin);
    s.position.set(...H.spinAt);
    group.add(s);
    group.userData.spin = s;
  }
  group.traverse((o) => {
    if (o.isMesh && o.material === MATS.glow) o.userData.noOutline = true;
  });
  if (outline) addOutlines(group, 0.02);
  if (H.glass) {
    glassMat ??= new THREE.MeshBasicMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.22, depthWrite: false });
    const g = new THREE.Mesh(new THREE.SphereGeometry(H.glass.r, 24, 16), glassMat);
    g.position.set(...H.glass.pos);
    g.userData.noOutline = true;
    group.add(g);
  }
  group.userData.hideTails = !!H.hideTails;
  return group;
}

// Thumbnails for the customize screen: every hat on a ninja's head, rendered
// once with a small throwaway renderer, as data URLs.
const thumbs = new Map();
export function hatThumb(id) {
  if (!thumbs.size) renderThumbs();
  return thumbs.get(id) || '';
}

function renderThumbs() {
  const S = 128;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(S, S, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#6b5a8a', 1.7));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(1.5, 3, 2.5);
  scene.add(sun);
  const rig = new NinjaRig({ outline: true });
  rig.setColors({ suit: '#2f3a7a', mask: '#14162b', band: '#ff2e55', accent: '#ffb703' });
  rig.neutral();
  scene.add(rig.root);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const box3 = new THREE.Box3();
  const centre = new THREE.Vector3();
  const size = new THREE.Vector3();
  const view = new THREE.Vector3(0.55, 0.6, 1).normalize();
  for (const h of HATS) {
    if (h.id === 'none') continue;
    rig.setHat(h.id);
    rig.root.updateMatrixWorld(true);
    // Frame the head and hat (the headband tails don't count).
    box3.makeEmpty();
    for (const c of rig.head.children) if (!rig.tails.some((t) => t.pivot === c)) box3.expandByObject(c);
    box3.getCenter(centre);
    box3.getSize(size);
    const fit = Math.max(size.x, size.y, size.z) * 0.62 / Math.tan((camera.fov * Math.PI) / 360);
    camera.position.copy(centre).addScaledVector(view, fit);
    camera.lookAt(centre);
    renderer.render(scene, camera);
    thumbs.set(h.id, renderer.domElement.toDataURL());
  }
  renderer.dispose();
  renderer.forceContextLoss();
}
