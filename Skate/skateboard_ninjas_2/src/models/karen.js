// Angry Karen: an over-the-top cartoon with an asymmetric haircut, sunglasses
// on her head, a furious open mouth, one finger pointing at you, and enormous
// shopping bags. Faces +Z (toward the oncoming player).

import { THREE, toon, addOutlines, bakeRig } from '../gfx.js';

const INK = '#140c2b';
const cap = (r, len, seg = 8) => new THREE.CapsuleGeometry(r, len, 4, seg);
const sph = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);

const BLOUSES = ['#ff8fb8', '#7fd6c2', '#b48cff', '#ffd36b', '#ff9e6b', '#9ec9ff'];
const PANTS = ['#d8c49a', '#ffffff', '#6b7a9a', '#c9a0c9'];
const HAIR = [['#f2d36b', '#b8863a'], ['#e8b84a', '#7a4f22'], ['#f7e6a8', '#c99b4a'], ['#c9743a', '#6b3a1a']];
const SKINS = ['#f7c9a4', '#e8a97f', '#c68a5f', '#8f5b3a'];
const BAGS = [['#ff5ea8', '#ffffff'], ['#3d7bff', '#ffe066'], ['#e8d6b0', '#8b5a2b'], ['#2bb673', '#ffffff'], ['#ff8c1a', '#14162b']];

function mesh(geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class KarenRig {
  constructor({ outline = true } = {}) {
    this.root = new THREE.Group();
    const hair = pick(HAIR);
    const bag1 = pick(BAGS);
    const bag2 = pick(BAGS);
    this.mats = {
      blouse: toon(pick(BLOUSES)),
      pants: toon(pick(PANTS)),
      skin: toon(pick(SKINS)),
      hair: toon(hair[0]),
      hair2: toon(hair[1]),
      ink: toon(INK),
      white: toon('#ffffff'),
      red: toon('#e8304a'),
      cheek: toon('#ff8f9e'),
      gold: toon('#ffcc33'),
      shades: toon('#1a1a2e'),
      bag1: toon(bag1[0]),
      bag1b: toon(bag1[1]),
      bag2: toon(bag2[0]),
      bag2b: toon(bag2[1]),
    };
    this.build();
    bakeRig(this.root);
    if (outline) addOutlines(this.root, 0.02);
    this.t = Math.random() * 10;
  }

  build() {
    const M = this.mats;
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.78;
    this.body.add(this.hips);
    mesh(cap(0.25, 0.1), M.pants, this.hips, [0, 0, 0], [0, 0, Math.PI / 2], [1, 1.25, 0.85]);

    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.14, -0.02, 0);
      this.hips.add(thigh);
      mesh(cap(0.12, 0.5), M.pants, thigh, [0, -0.36, 0]);
      mesh(new THREE.BoxGeometry(0.2, 0.12, 0.34), M.white, thigh, [0, -0.74, 0.06]);
      this.legs.push({ thigh, side: s });
    }

    this.torso = new THREE.Group();
    this.torso.position.y = 0.05;
    this.hips.add(this.torso);
    mesh(cap(0.29, 0.32), M.blouse, this.torso, [0, 0.33, 0], [0, 0, 0], [1.08, 1, 0.85]);
    // Pearl necklace
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.15 + (i / 8) * 0.7);
      const p = mesh(sph(0.03, 6, 4), M.white, this.torso, [Math.cos(a) * 0.2, 0.62 - Math.sin(a) * 0.08, 0.17 + Math.sin(a) * 0.06]);
      p.userData.noOutline = true;
    }

    // Head
    this.head = new THREE.Group();
    this.head.position.y = 0.72;
    this.torso.add(this.head);
    const R = 0.3;
    mesh(sph(R, 18, 14), M.skin, this.head, [0, R, 0]);
    // The Haircut: a helmet of hair, spiky stacked back, long angled front.
    mesh(new THREE.SphereGeometry(R * 1.08, 18, 10, 0, Math.PI * 2, 0, 1.35), M.hair, this.head, [0, R + 0.03, -0.03], [-0.25, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const a = -0.9 + i * 0.36;
      const spike = mesh(new THREE.ConeGeometry(0.1, 0.28, 6), i % 2 ? M.hair2 : M.hair, this.head,
        [Math.sin(a) * 0.22, R * 1.7 + Math.cos(a * 2) * 0.03, -0.18 - Math.cos(a) * 0.05], [-1.1, 0, a * 0.6]);
      spike.userData.noOutline = i % 2 === 1;
    }
    // Asymmetric: one side swoops long past the chin.
    mesh(sph(0.16, 10, 8), M.hair, this.head, [-0.27, R * 0.85, 0.08], [0, 0, 0.35], [0.7, 1.7, 1.2]);
    mesh(sph(0.13, 10, 8), M.hair2, this.head, [0.27, R * 1.15, 0.04], [0, 0, -0.3], [0.7, 1.1, 1.1]);
    // Sunglasses parked on top.
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 12), M.shades, this.head, [s * 0.1, R * 1.92, 0.14], [1.15, 0, 0]);
    mesh(new THREE.BoxGeometry(0.06, 0.015, 0.015), M.gold, this.head, [0, R * 1.94, 0.16]).userData.noOutline = true;

    // Face
    const faceZ = R * 0.9;
    for (const s of [-1, 1]) {
      const e = mesh(sph(0.06, 10, 8), M.white, this.head, [s * 0.11, R * 1.12, faceZ], [0, 0, 0], [1, 0.8, 0.5]);
      e.userData.noOutline = true;
      const p = mesh(sph(0.028, 8, 6), M.ink, this.head, [s * 0.1, R * 1.1, faceZ + 0.03], [0, 0, 0], [1, 1, 0.5]);
      p.userData.noOutline = true;
      const brow = mesh(new THREE.BoxGeometry(0.14, 0.035, 0.04), M.ink, this.head, [s * 0.11, R * 1.3, faceZ - 0.02], [0, 0, s * 0.5]);
      brow.userData.noOutline = true;
      const ch = mesh(sph(0.05, 8, 6), M.cheek, this.head, [s * 0.18, R * 0.88, faceZ - 0.05], [0, 0, 0], [1, 0.6, 0.3]);
      ch.userData.noOutline = true;
      mesh(sph(0.03, 6, 4), M.gold, this.head, [s * 0.3, R * 0.85, 0.02]).userData.noOutline = true;
    }
    // Big shouting mouth with teeth and tongue.
    this.mouth = mesh(sph(0.1, 12, 8), M.ink, this.head, [0, R * 0.68, faceZ + 0.02], [0, 0, 0], [1.25, 0.8, 0.4]);
    this.mouth.userData.noOutline = true;
    this.mouth.userData.keep = true; // animated while she shouts
    mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), M.white, this.head, [0, R * 0.79, faceZ + 0.055]).userData.noOutline = true;
    mesh(sph(0.05, 8, 6), M.red, this.head, [0, R * 0.6, faceZ + 0.06], [0, 0, 0], [1.2, 0.5, 0.4]).userData.noOutline = true;
    mesh(sph(0.04, 8, 6), M.skin, this.head, [0, R * 0.98, faceZ + 0.05]).userData.noOutline = true;

    // Pointing arm (right) and bag arm (left).
    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.33, 0.55, 0);
      this.torso.add(shoulder);
      mesh(cap(0.09, 0.2), M.blouse, shoulder, [0, -0.16, 0]);
      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      shoulder.add(elbow);
      mesh(cap(0.075, 0.18), M.skin, elbow, [0, -0.14, 0]);
      mesh(sph(0.085, 10, 8), M.skin, elbow, [0, -0.3, 0]);
      this.arms.push({ shoulder, elbow, side: s });
    }
    // Finger on the right hand.
    const finger = mesh(cap(0.025, 0.12, 6), M.skin, this.arms[1].elbow, [0, -0.42, 0.02]);
    finger.userData.noOutline = false;
    // Shopping bags on the left.
    this.bags = new THREE.Group();
    this.bags.position.set(0, -0.34, 0);
    this.arms[0].elbow.add(this.bags);
    const bag = (mat, trim, x, z, h, rotY) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      this.bags.add(g);
      mesh(new THREE.BoxGeometry(0.42, h, 0.2), mat, g, [0, -0.12 - h / 2, 0]);
      mesh(new THREE.BoxGeometry(0.43, 0.08, 0.21), trim, g, [0, -0.2, 0]).userData.noOutline = true;
      mesh(new THREE.TorusGeometry(0.1, 0.015, 4, 12, Math.PI), trim, g, [0, -0.12, 0]).userData.noOutline = true;
      mesh(new THREE.BoxGeometry(0.16, 0.16, 0.01), trim, g, [0, -0.15 - h / 2, 0.105]).userData.noOutline = true;
    };
    bag(M.bag1, M.bag1b, -0.12, 0.05, 0.5, 0.2);
    bag(M.bag2, M.bag2b, 0.12, -0.06, 0.42, -0.25);
  }

  // mode: 'angry' (finger wag + stomp), 'walk', 'run', 'push' (cart)
  animate(dt, mode, speedMul = 1) {
    this.t += dt * speedMul;
    const t = this.t;
    const [L, R] = this.arms;
    this.body.position.y = 0;
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.bags.rotation.set(0, 0, 0);
    this.mouth.scale.set(1.25, 0.55 + Math.abs(Math.sin(t * 9)) * 0.5, 0.4);
    if (mode === 'walk' || mode === 'run' || mode === 'push') {
      const f = mode === 'run' ? 13 : 7.5;
      const amp = mode === 'run' ? 0.9 : 0.5;
      const sw = Math.sin(t * f);
      this.legs[0].thigh.rotation.x = sw * amp;
      this.legs[1].thigh.rotation.x = -sw * amp;
      this.body.position.y = Math.abs(Math.cos(t * f)) * (mode === 'run' ? 0.1 : 0.05);
      this.torso.rotation.x = mode === 'run' ? 0.35 : 0.1;
      if (mode === 'push') {
        L.shoulder.rotation.set(-1.2, 0, -0.2);
        R.shoulder.rotation.set(-1.2, 0, 0.2);
        L.elbow.rotation.set(-0.3, 0, 0);
        R.elbow.rotation.set(-0.3, 0, 0);
      } else {
        L.shoulder.rotation.set(-sw * amp * 0.8, 0, -0.25);
        R.shoulder.rotation.set(mode === 'run' ? -2.4 : sw * amp * 0.8, 0, mode === 'run' ? 0.3 + Math.sin(t * 20) * 0.3 : 0.25);
        L.elbow.rotation.set(-0.5, 0, 0);
        R.elbow.rotation.set(mode === 'run' ? -0.2 : -0.6, 0, 0);
        this.bags.rotation.x = sw * 0.6;
      }
      this.head.rotation.y = Math.sin(t * 3) * 0.15;
    } else {
      // Angry: stomp, wag the finger, shake the head, bags bounce.
      const stomp = Math.max(0, Math.sin(t * 7));
      this.legs[0].thigh.rotation.x = -stomp * 0.5;
      this.legs[1].thigh.rotation.x = 0;
      this.body.position.y = stomp * 0.04;
      this.torso.rotation.x = 0.12;
      L.shoulder.rotation.set(-0.1, 0, -0.35 - stomp * 0.15);
      L.elbow.rotation.set(-0.4, 0, 0);
      R.shoulder.rotation.set(-1.35, 0, 0.15);
      R.elbow.rotation.set(-0.5, 0, Math.sin(t * 16) * 0.45);
      this.head.rotation.set(0.05, Math.sin(t * 11) * 0.18, Math.sin(t * 5) * 0.08);
      this.bags.rotation.x = stomp * 0.3;
    }
  }
}
