// Downtown characters: a parking officer writing tickets, a mime stuck in an
// invisible box, a hot-dog vendor with a cart, and a swarm of pigeons. The
// three people share one cartoon body. Everything faces +Z (toward the player).

import { THREE, toon, addOutlines, bakeRig } from '../gfx.js';

const INK = '#140c2b';
const cap = (r, len, seg = 8) => new THREE.CapsuleGeometry(r, len, 4, seg);
const sph = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);
const SKINS = ['#f7c9a4', '#e8a97f', '#c68a5f', '#8f5b3a'];

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
const plain = (m) => {
  m.userData.noOutline = true;
  return m;
};

// Per-character outfits.
const LOOKS = {
  parkingOfficer: () => ({
    skin: pick(SKINS), shirt: '#2a3f7a', pants: '#1e2a4a', shoe: '#14162b', hat: 'cap', hatColor: '#1e2a4a',
    vest: '#d8ff3a', hands: null, poof: ['#d8ff3a', '#2a3f7a', '#ffffff', '#ffe066', '#14162b'],
  }),
  mime: () => ({
    skin: '#f6f4ff', shirt: '#ffffff', stripes: INK, pants: INK, shoe: INK, hat: 'beret', hatColor: INK,
    hands: '#ffffff', mimeFace: true, poof: ['#ffffff', INK, '#ff2e55', '#e9ecf2', '#ffe066'],
  }),
  astronaut: () => ({
    skin: pick(SKINS), shirt: '#e9ecf2', pants: '#e9ecf2', shoe: '#9aa0ae', hat: 'helmet', hatColor: '#e9ecf2',
    hands: '#c9ccd6', backpack: true, poof: ['#e9ecf2', '#ffcc33', '#3d7bff', '#ff2e55', '#ffffff'],
  }),
  hotdog: () => ({
    skin: pick(SKINS), shirt: '#ffffff', pants: '#3a3a44', shoe: '#14162b', hat: 'paper', hatColor: '#ff2e55',
    apron: '#ff2e55', mustache: true, hands: null, poof: ['#ff2e55', '#ffcc1a', '#c8893f', '#ffffff', '#e9ecf2'],
  }),
};

export class TownRig {
  constructor({ kind, outline = true } = {}) {
    this.kind = kind;
    this.root = new THREE.Group();
    this.t = Math.random() * 10;
    if (kind === 'pigeons') this.buildPigeons();
    else this.buildPerson(LOOKS[kind]());
    bakeRig(this.root);
    if (outline) addOutlines(this.root, 0.02);
  }

  buildPerson(L) {
    const M = {
      skin: toon(L.skin), shirt: toon(L.shirt), pants: toon(L.pants), shoe: toon(L.shoe), hat: toon(L.hatColor),
      ink: toon(INK), white: toon('#ffffff'), red: toon('#e8304a'),
      hands: toon(L.hands || L.skin),
    };
    this.poofColors = L.poof;
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.root.scale.setScalar(0.9);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.8;
    this.body.add(this.hips);
    mesh(cap(0.22, 0.1), M.pants, this.hips, [0, 0, 0], [0, 0, Math.PI / 2], [1, 1.2, 0.85]);
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.13, -0.02, 0);
      this.hips.add(thigh);
      mesh(cap(0.1, 0.52), M.pants, thigh, [0, -0.38, 0]);
      mesh(new THREE.BoxGeometry(0.17, 0.11, 0.3), M.shoe, thigh, [0, -0.76, 0.05]);
      this.legs.push({ thigh, side: s });
    }

    this.torso = new THREE.Group();
    this.torso.position.y = 0.05;
    this.hips.add(this.torso);
    mesh(cap(0.25, 0.3), M.shirt, this.torso, [0, 0.33, 0], [0, 0, 0], [1.08, 1, 0.85]);
    if (L.stripes) {
      for (let i = 0; i < 4; i++) {
        plain(mesh(new THREE.TorusGeometry(0.255, 0.025, 4, 22), toon(L.stripes), this.torso, [0, 0.16 + i * 0.12, 0], [Math.PI / 2, 0, 0], [1.08, 0.85, 1]));
      }
      plain(mesh(new THREE.TorusGeometry(0.12, 0.035, 5, 14), M.red, this.torso, [0, 0.62, 0.05], [Math.PI / 2 - 0.3, 0, 0]));
    }
    if (L.vest) {
      const V = toon(L.vest);
      mesh(cap(0.26, 0.22), V, this.torso, [0, 0.34, 0.01], [0, 0, 0], [1.1, 1, 0.88]);
      for (const y of [0.24, 0.4]) plain(mesh(new THREE.TorusGeometry(0.265, 0.018, 4, 22), toon('#e9ecf2'), this.torso, [0, y, 0.01], [Math.PI / 2, 0, 0], [1.1, 0.88, 1]));
      mesh(new THREE.BoxGeometry(0.1, 0.08, 0.03), toon('#ffcc33'), this.torso, [-0.12, 0.5, 0.22]);
    }
    if (L.backpack) {
      // Life-support pack, chest controls and a mission patch.
      mesh(new THREE.BoxGeometry(0.44, 0.5, 0.2), toon('#c9ccd6'), this.torso, [0, 0.36, -0.27]);
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), toon('#9aa0ae'), this.torso, [0.16, 0.38, -0.39]);
      mesh(new THREE.BoxGeometry(0.2, 0.12, 0.06), toon('#6b7280'), this.torso, [0, 0.2, 0.22]);
      for (const [x, c] of [[-0.05, '#ff2e55'], [0.05, '#3dff6a']]) plain(mesh(sph(0.018, 6, 4), new THREE.MeshBasicMaterial({ color: c }), this.torso, [x, 0.21, 0.26]));
      mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), toon('#3d7bff'), this.torso, [-0.14, 0.5, 0.2], [Math.PI / 2, 0, 0]);
    }
    if (L.apron) {
      mesh(new THREE.BoxGeometry(0.42, 0.55, 0.04), toon(L.apron), this.torso, [0, 0.12, 0.21]);
      mesh(new THREE.BoxGeometry(0.2, 0.12, 0.05), M.white, this.torso, [0, 0.05, 0.23]);
    }

    this.head = new THREE.Group();
    this.head.position.y = 0.68;
    this.torso.add(this.head);
    const R = 0.27;
    mesh(sph(R, 18, 14), M.skin, this.head, [0, R, 0]);
    const faceZ = R * 0.9;
    for (const s of [-1, 1]) {
      plain(mesh(sph(0.055, 10, 8), M.white, this.head, [s * 0.1, R * 1.1, faceZ], [0, 0, 0], [1, 0.85, 0.5]));
      plain(mesh(sph(0.026, 8, 6), M.ink, this.head, [s * 0.1, R * 1.08, faceZ + 0.03], [0, 0, 0], [1, 1, 0.5]));
      plain(mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), M.ink, this.head, [s * 0.1, R * 1.32, faceZ - 0.02], [0, 0, s * 0.35]));
      if (L.mimeFace) {
        // Painted teardrops and black lips.
        plain(mesh(new THREE.ConeGeometry(0.02, 0.09, 6), M.ink, this.head, [s * 0.1, R * 0.86, faceZ + 0.01], [Math.PI, 0, 0]));
      }
    }
    mesh(sph(0.035, 8, 6), M.skin, this.head, [0, R * 0.98, faceZ + 0.04]);
    if (L.mustache) {
      for (const s of [-1, 1]) plain(mesh(cap(0.03, 0.08, 6), toon('#3a2414'), this.head, [s * 0.06, R * 0.8, faceZ + 0.03], [0, 0, s * 1.2]));
    }
    this.mouth = mesh(sph(0.06, 10, 8), L.mimeFace ? M.red : M.ink, this.head, [0, R * 0.62, faceZ + 0.01], [0, 0, 0], [1.2, 0.6, 0.4]);
    this.mouth.userData.noOutline = true;
    this.mouth.userData.keep = true;
    const H = M.hat;
    if (L.hat === 'cap') {
      mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.16, 16), H, this.head, [0, R * 1.75, 0]);
      mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.03, 16), H, this.head, [0, R * 2.05, 0.02], [0.1, 0, 0]);
      mesh(new THREE.BoxGeometry(0.3, 0.03, 0.16), toon('#14162b'), this.head, [0, R * 1.5, 0.27]);
      mesh(new THREE.BoxGeometry(0.1, 0.07, 0.02), toon('#ffcc33'), this.head, [0, R * 1.78, 0.25]);
    } else if (L.hat === 'beret') {
      mesh(new THREE.CylinderGeometry(0.27, 0.22, 0.08, 16), H, this.head, [0.04, R * 1.9, -0.02], [0, 0, -0.25]);
      mesh(sph(0.03, 6, 4), H, this.head, [0.08, R * 2.08, -0.02]);
    } else if (L.hat === 'helmet') {
      // Bubble helmet with a gold sun visor over the face.
      mesh(sph(R * 1.32, 18, 14), H, this.head, [0, R * 1.05, -0.02]);
      plain(mesh(new THREE.SphereGeometry(R * 1.34, 18, 10, Math.PI / 2 - 0.85, 1.7, 0.75, 1.2), toon('#ffcc33'), this.head, [0, R * 1.05, -0.02]));
      plain(mesh(new THREE.BoxGeometry(0.08, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: '#ffffff' }), this.head, [-0.12, R * 1.45, R * 1.18], [0, 0, 0.6]));
      mesh(new THREE.TorusGeometry(0.24, 0.05, 6, 18), toon('#9aa0ae'), this.head, [0, R * 0.05, 0], [Math.PI / 2, 0, 0]);
    } else if (L.hat === 'paper') {
      mesh(new THREE.BoxGeometry(0.42, 0.14, 0.24), M.white, this.head, [0, R * 1.8, -0.02]);
      mesh(new THREE.BoxGeometry(0.43, 0.04, 0.25), H, this.head, [0, R * 1.68, -0.02]);
    }

    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.3, 0.55, 0);
      this.torso.add(shoulder);
      mesh(cap(0.08, 0.2), M.shirt, shoulder, [0, -0.15, 0]);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      mesh(cap(0.07, 0.18), L.stripes || L.backpack ? M.shirt : M.skin, elbow, [0, -0.13, 0]);
      mesh(sph(0.08, 10, 8), M.hands, elbow, [0, -0.28, 0]);
      this.arms.push({ shoulder, elbow, side: s });
    }
    // Props in hand.
    if (this.kind === 'parkingOfficer') {
      const pad = mesh(new THREE.BoxGeometry(0.2, 0.26, 0.03), M.white, this.arms[0].elbow, [0, -0.32, 0.08]);
      pad.userData.keep = true;
      mesh(new THREE.BoxGeometry(0.2, 0.05, 0.035), toon('#ff8c1a'), pad, [0, 0.11, 0]);
      mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5), M.ink, this.arms[1].elbow, [0, -0.32, 0.06], [0.6, 0, 0]);
    }
    if (this.kind === 'hotdog') {
      mesh(cap(0.03, 0.16, 6), toon('#c8503a'), this.arms[1].elbow, [0, -0.36, 0.05], [0, 0, Math.PI / 2]);
      mesh(cap(0.04, 0.12, 6), toon('#e8b46a'), this.arms[1].elbow, [0, -0.39, 0.05], [0, 0, Math.PI / 2]);
      this.buildCart();
    }
  }

  // Hot-dog cart in front of the vendor, umbrella and all.
  buildCart() {
    this.cart = new THREE.Group();
    this.cart.position.set(0, 0, 0.75);
    this.root.add(this.cart);
    const steel = toon('#c9ccd6');
    mesh(new THREE.BoxGeometry(1.3, 0.62, 0.62), steel, this.cart, [0, 0.62, 0]);
    mesh(new THREE.BoxGeometry(1.32, 0.12, 0.64), toon('#ffcc1a'), this.cart, [0, 0.98, 0]);
    mesh(new THREE.BoxGeometry(1.0, 0.24, 0.04), toon('#ff2e55'), this.cart, [0, 0.66, 0.32]);
    mesh(cap(0.05, 0.4, 6), toon('#c8503a'), this.cart, [0, 0.66, 0.36], [0, 0, Math.PI / 2]);
    for (const x of [-0.5, 0.5]) mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12), toon('#1a1a22'), this.cart, [x, 0.16, 0.3], [0, 0, Math.PI / 2]);
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), steel, this.cart, [-0.5, 1.7, -0.1]);
    for (let i = 0; i < 8; i++) {
      mesh(new THREE.ConeGeometry(0.85, 0.35, 2, 1, false, (i / 8) * Math.PI * 2, Math.PI / 4), toon(i % 2 ? '#ffffff' : '#ff2e55'),
        this.cart, [-0.5, 2.5, -0.1]);
    }
    for (const [x, c] of [[0.3, '#ffcc1a'], [0.45, '#ff2e55']]) mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8), toon(c), this.cart, [x, 1.14, 0.1]);
  }

  // Seven pigeons milling about on the road.
  buildPigeons() {
    this.poofColors = ['#9aa0ae', '#e9ecf2', '#5a6070', '#7dffb0', '#b48cff'];
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.birds = [];
    const grey = toon('#9aa0ae');
    const dark = toon('#5a6070');
    const neck = toon('#4fb88a');
    const neck2 = toon('#9a6ad8');
    const orange = toon('#ff8c1a');
    const ink = toon(INK);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const r = i === 0 ? 0 : 0.5 + (i % 2) * 0.22;
      const bird = new THREE.Group();
      bird.position.set(Math.cos(a) * r, 0, Math.sin(a) * r * 0.8);
      bird.rotation.y = (i * 2.3) % (Math.PI * 2);
      this.body.add(bird);
      const torso = new THREE.Group();
      torso.position.y = 0.2;
      bird.add(torso);
      mesh(sph(0.16, 12, 9), grey, torso, [0, 0, 0], [0, 0, 0], [0.9, 0.85, 1.25]);
      mesh(new THREE.BoxGeometry(0.16, 0.03, 0.2), dark, torso, [0, 0.02, -0.25], [0.3, 0, 0]);
      for (const s of [-1, 1]) plain(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4), orange, torso, [s * 0.05, -0.17, 0]));
      const head = new THREE.Group();
      head.position.set(0, 0.12, 0.14);
      torso.add(head);
      mesh(sph(0.1, 10, 8), i % 2 ? neck : neck2, head, [0, -0.02, 0], [0, 0, 0], [0.95, 0.8, 0.9]);
      mesh(sph(0.085, 10, 8), dark, head, [0, 0.07, 0.02]);
      plain(mesh(new THREE.ConeGeometry(0.025, 0.08, 6), orange, head, [0, 0.06, 0.12], [Math.PI / 2, 0, 0]));
      for (const s of [-1, 1]) plain(mesh(sph(0.018, 6, 4), ink, head, [s * 0.06, 0.1, 0.06]));
      const wings = [];
      for (const s of [-1, 1]) {
        const w = new THREE.Group();
        w.position.set(s * 0.12, 0.04, 0);
        torso.add(w);
        mesh(new THREE.BoxGeometry(0.3, 0.025, 0.22), dark, w, [s * 0.13, 0, -0.02]);
        wings.push({ w, side: s });
      }
      this.birds.push({ bird, torso, head, wings, phase: i * 1.7 });
    }
  }

  // People: 'walk', 'push' (cart), anything else = their act (ticket writing,
  // invisible box, shouting about hot dogs). Pigeons: 'peck', 'fly', 'flutter'.
  animate(dt, mode, speedMul = 1) {
    this.t += dt * speedMul;
    if (this.birds) return this.animatePigeons(mode);
    const t = this.t;
    const [L, R] = this.arms;
    this.body.position.y = 0;
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    if (mode === 'walk' || mode === 'push') {
      const sw = Math.sin(t * 7.5);
      this.legs[0].thigh.rotation.x = sw * 0.5;
      this.legs[1].thigh.rotation.x = -sw * 0.5;
      this.body.position.y = Math.abs(Math.cos(t * 7.5)) * 0.04;
      if (mode === 'push') {
        for (const { shoulder, elbow } of this.arms) {
          shoulder.rotation.set(-1.3, 0, 0);
          elbow.rotation.set(-0.3, 0, 0);
        }
        this.torso.rotation.x = 0.2;
      } else {
        L.shoulder.rotation.set(-sw * 0.5, 0, -0.15);
        R.shoulder.rotation.set(sw * 0.5, 0, 0.15);
        L.elbow.rotation.set(-0.4, 0, 0);
        R.elbow.rotation.set(-0.4, 0, 0);
      }
      this.mouth.scale.set(1.2, 0.5, 0.4);
      return;
    }
    this.legs[0].thigh.rotation.x = 0;
    this.legs[1].thigh.rotation.x = 0;
    if (this.kind === 'parkingOfficer') {
      // Ticket pad up, scribbling, glancing up at you.
      L.shoulder.rotation.set(-1.1, 0.4, -0.1);
      L.elbow.rotation.set(-1.1, 0, 0);
      R.shoulder.rotation.set(-1.0 + Math.sin(t * 18) * 0.05, -0.3, 0.2);
      R.elbow.rotation.set(-1.0 + Math.sin(t * 22) * 0.12, 0, 0);
      this.head.rotation.set(0.25 - Math.max(0, Math.sin(t * 1.4)) * 0.4, 0, 0);
      this.mouth.scale.set(1.2, 0.3 + Math.max(0, Math.sin(t * 1.4)) * 0.5, 0.4);
    } else if (this.kind === 'astronaut') {
      // Bouncing in low gravity, waving hello.
      this.body.position.y = Math.abs(Math.sin(t * 2.4)) * 0.22;
      this.legs[0].thigh.rotation.x = -0.25;
      this.legs[1].thigh.rotation.x = 0.15;
      L.shoulder.rotation.set(-0.3, 0, -0.6);
      L.elbow.rotation.set(-0.4, 0, 0);
      R.shoulder.rotation.set(-2.6, 0, 0.3 + Math.sin(t * 5) * 0.3);
      R.elbow.rotation.set(-0.3, 0, 0);
      this.mouth.scale.set(1.2, 0.5, 0.4);
    } else if (this.kind === 'mime') {
      // Palms flat on an invisible wall, feeling along it.
      const slide = Math.sin(t * 2.2);
      L.shoulder.rotation.set(-1.45 + Math.max(0, slide) * 0.5, 0, -0.25 + slide * 0.15);
      R.shoulder.rotation.set(-1.45 + Math.max(0, -slide) * 0.5, 0, 0.25 + slide * 0.15);
      L.elbow.rotation.set(-0.5, 0, 0);
      R.elbow.rotation.set(-0.5, 0, 0);
      this.torso.rotation.set(0.05, slide * 0.15, 0);
      this.head.rotation.set(0, slide * 0.3, 0);
      this.mouth.scale.set(1.2, 0.4 + Math.abs(Math.sin(t * 1.1)) * 0.5, 0.4);
    } else {
      // Hot-dog vendor waving a dog over the cart and hollering.
      const wave = Math.sin(t * 6);
      L.shoulder.rotation.set(-1.2, 0, -0.1);
      L.elbow.rotation.set(-0.3, 0, 0);
      R.shoulder.rotation.set(-2.5 + wave * 0.3, 0, 0.3);
      R.elbow.rotation.set(-0.5 + wave * 0.3, 0, 0);
      this.head.rotation.set(-0.1, Math.sin(t * 2) * 0.2, 0);
      this.mouth.scale.set(1.2, 0.6 + Math.abs(Math.sin(t * 8)) * 0.7, 0.4);
    }
  }

  animatePigeons(mode) {
    const t = this.t;
    const fly = mode === 'fly' || mode === 'flutter';
    for (const b of this.birds) {
      const ph = t + b.phase;
      if (fly) {
        const flap = Math.sin(ph * 26) * 0.9;
        for (const { w, side } of b.wings) w.rotation.z = side * flap;
        b.torso.position.y = 0.2 + (mode === 'fly' ? 0.4 + Math.sin(ph * 3) * 0.25 : 0.5 + Math.abs(Math.sin(ph * 5)) * 0.9);
        b.torso.rotation.x = -0.3;
        b.head.rotation.x = -0.2;
      } else {
        for (const { w, side } of b.wings) w.rotation.z = side * 0.05;
        b.torso.position.y = 0.2;
        b.torso.rotation.x = 0;
        // Peck, peck, look around.
        const peck = Math.max(0, Math.sin(ph * 4));
        b.head.rotation.x = peck * 0.9;
        b.head.position.y = 0.12 - peck * 0.08;
        b.bird.rotation.y += Math.sin(ph * 0.7) * 0.01;
      }
    }
  }
}
