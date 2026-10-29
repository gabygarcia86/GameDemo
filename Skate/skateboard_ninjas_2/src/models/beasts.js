// The environment beasts: a big roaring bear for the forest, a shaggy yeti for
// the snowy mountains, a moon rock alien with glowing crystals and a little
// green alien from Mars (who arrives by UFO). One rig, four looks. Faces +Z
// (toward the oncoming player).

import { THREE, toon, addOutlines, bakeRig } from '../gfx.js';
import { rockGeo } from './props.js';

const INK = '#140c2b';
const cap = (r, len, seg = 8) => new THREE.CapsuleGeometry(r, len, 4, seg);
const sph = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);

// fur, darker fur, belly / face, paws, claws
const BEAR_COATS = [
  ['#7a4a26', '#5c3519', '#c08a55', '#4a2a14', '#f2e6c8'], // brown bear
  ['#9a6a3a', '#7a5028', '#d8b07c', '#5a3a1e', '#f2e6c8'], // grizzly
  ['#2e2622', '#1e1916', '#b08a62', '#1a1512', '#e8dcc0'], // black bear
];
// Bigfoot: shaggy brown fur, leathery face and hands.
const BIGFOOT_COATS = [
  ['#5a3a22', '#3e2614', '#a88462', '#6b4a32', '#d8c49a'],
  ['#6b4428', '#4a2c18', '#b8946e', '#7a5638', '#d8c49a'],
  ['#4a3424', '#2e2016', '#9a7a5a', '#5a4030', '#c9b48a'],
];
const YETI_COATS = [
  ['#f2f6ff', '#d2dff2', '#6f9ad6', '#5a86c8', '#efe2c4'], // classic blue face
  ['#f6f4ff', '#dcd6f2', '#9a86d8', '#7f6cc4', '#efe2c4'], // purple face
  ['#eef8fb', '#cfe6ee', '#5fb0c0', '#4a96a8', '#f2ead0'], // glacier teal
];

function mesh(geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// rock, dark rock, crystal glow, second crystal
const MOON_ROCKS = [
  ['#8c8e9a', '#62646e', '#5ff0ff', '#b48cff'],
  ['#9a948a', '#6e675e', '#7dffb0', '#5ff0ff'],
  ['#7e8296', '#565a6e', '#ff7ae0', '#5ff0ff'],
];
// skin, darker skin, suit, suit trim
const ALIENS = [
  ['#7be35a', '#4fb83a', '#c4ccdc', '#7b2ff7'],
  ['#5fd06a', '#3a9a4a', '#9fa8ff', '#ff3df0'],
  ['#a4e84a', '#74b82a', '#e0e4ee', '#ff8c1a'],
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const plain = (m) => {
  m.userData.noOutline = true;
  return m;
};
// Unlit glowing material; bakeRig leaves these meshes alone.
const glow = (color) => new THREE.MeshBasicMaterial({ color });

export class BeastRig {
  constructor({ kind = 'bear', outline = true } = {}) {
    this.kind = kind;
    this.root = new THREE.Group();
    if (kind === 'rockAlien' || kind === 'lavaMonster') this.buildRockAlien();
    else if (kind === 'alien') this.buildAlien();
    else this.buildFurry();
    bakeRig(this.root);
    if (outline) addOutlines(this.root, 0.025);
    this.t = Math.random() * 10;
  }

  // Every look builds the same joints (body, hips, legs, torso, head, mouth,
  // arms) so animate() drives them all.
  buildFurry() {
    const bigfoot = this.kind === 'bigfoot';
    const coat = pick(this.kind === 'yeti' ? YETI_COATS : bigfoot ? BIGFOOT_COATS : BEAR_COATS);
    const M = this.mats = {
      fur: toon(coat[0]),
      fur2: toon(coat[1]),
      face: toon(coat[2]),
      paw: toon(coat[3]),
      claw: toon(coat[4]),
      ink: toon(INK),
      white: toon('#ffffff'),
      mouth: toon('#5a1020'),
      tongue: toon('#e8506a'),
      eye: toon(this.kind === 'yeti' ? '#ffe066' : '#ffffff'),
    };
    this.poofColors = [coat[0], coat[1], coat[2], '#ffffff', '#ffe066'];
    const yeti = this.kind === 'yeti';
    const shaggy = yeti || bigfoot;
    this.glance = 0; // extra head turn (Bigfoot looks at the camera mid-stride)
    this.body = new THREE.Group();
    this.root.add(this.body);
    if (bigfoot) this.root.scale.setScalar(1.15);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.82;
    this.body.add(this.hips);
    mesh(sph(0.42), M.fur, this.hips, [0, 0, 0], [0, 0, 0], [1.1, 0.8, 0.95]);

    // Short, thick hind legs with big flat feet.
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.24, -0.05, 0);
      this.hips.add(thigh);
      mesh(cap(0.17, 0.36), M.fur, thigh, [0, -0.32, 0]);
      if (bigfoot) {
        // The famous enormous feet, with stubby toes.
        mesh(sph(0.19), M.paw, thigh, [0, -0.66, 0.2], [0, 0, 0], [1.25, 0.5, 2.3]);
        for (let i = 0; i < 5; i++) plain(mesh(sph(0.045, 8, 6), M.face, thigh, [(i - 2) * 0.07, -0.66, 0.63 - Math.abs(i - 2) * 0.03]));
      } else {
        mesh(sph(0.19), yeti ? M.face : M.paw, thigh, [0, -0.66, 0.1], [0, 0, 0], [1, 0.55, 1.4]);
        for (let i = -1; i <= 1; i++) {
          plain(mesh(new THREE.ConeGeometry(0.035, 0.1, 5), M.claw, thigh, [i * 0.07, -0.68, 0.36], [Math.PI / 2, 0, 0]));
        }
      }
      this.legs.push({ thigh, side: s });
    }

    // Big barrel chest and belly.
    this.torso = new THREE.Group();
    this.torso.position.y = 0.1;
    this.hips.add(this.torso);
    mesh(sph(0.52, 18, 14), M.fur, this.torso, [0, 0.48, 0], [0, 0, 0], [1.1, 1.05, 0.9]);
    plain(mesh(sph(0.4, 16, 12), shaggy ? M.fur2 : M.face, this.torso, [0, 0.4, 0.27], [0, 0, 0], [0.95, 1, 0.6]));
    if (shaggy) {
      // Shaggy tufts on the shoulders and back.
      for (let i = 0; i < 9; i++) {
        const a = -1.6 + i * 0.4;
        const tuft = mesh(new THREE.ConeGeometry(0.11, 0.3, 6), i % 2 ? M.fur2 : M.fur, this.torso,
          [Math.sin(a) * 0.5, 0.82 + Math.cos(a) * 0.08, -Math.cos(a) * 0.3], [-0.5 - Math.cos(a) * 0.4, 0, -a * 0.7]);
        tuft.userData.noOutline = i % 2 === 1;
      }
    }

    // Head
    this.head = new THREE.Group();
    this.head.position.y = 0.98;
    this.torso.add(this.head);
    const R = 0.33;
    mesh(sph(R, 18, 14), M.fur, this.head, [0, R * 0.75, 0.05]);
    const faceZ = 0.05 + R * 0.88;
    if (bigfoot) {
      // Flat leathery face under a heavy furry brow, pointed crest on top.
      mesh(sph(0.24, 16, 12), M.face, this.head, [0, R * 0.68, 0.26], [0, 0, 0], [1, 1.1, 0.55]);
      mesh(new THREE.BoxGeometry(0.46, 0.1, 0.16), M.fur2, this.head, [0, R * 1.18, 0.3], [0.2, 0, 0]);
      mesh(sph(0.05, 8, 6), M.paw, this.head, [0, R * 0.82, 0.4], [0, 0, 0], [1.3, 0.8, 0.8]);
      mesh(new THREE.ConeGeometry(0.2, 0.35, 8), M.fur, this.head, [0, R * 1.75, -0.02], [-0.25, 0, 0]);
      for (const s of [-1, 1]) {
        plain(mesh(new THREE.ConeGeometry(0.07, 0.22, 5), M.fur2, this.head, [s * 0.3, R * 0.9, 0.1], [0, 0, s * 1.9]));
      }
    } else if (yeti) {
      // Blue face, curly horns and a messy fringe.
      mesh(sph(0.25, 16, 12), M.face, this.head, [0, R * 0.72, 0.27], [0, 0, 0], [1, 1.05, 0.6]);
      for (const s of [-1, 1]) {
        mesh(new THREE.ConeGeometry(0.07, 0.34, 8), M.claw, this.head, [s * 0.3, R * 1.3, 0.02], [0.2, 0, -s * 0.9]);
        for (let i = 0; i < 3; i++) {
          plain(mesh(new THREE.ConeGeometry(0.07, 0.2, 5), i % 2 ? M.fur2 : M.fur, this.head,
            [s * (0.05 + i * 0.08), R * 1.5, 0.2], [0.9, 0, s * (0.2 + i * 0.25)]));
        }
      }
    } else {
      // Round ears and a long muzzle with a shiny nose.
      for (const s of [-1, 1]) {
        mesh(sph(0.11, 10, 8), M.fur, this.head, [s * 0.25, R * 1.45, 0], [0, 0, 0], [1, 1, 0.6]);
        plain(mesh(sph(0.065, 8, 6), M.face, this.head, [s * 0.25, R * 1.45, 0.05], [0, 0, 0], [1, 1, 0.4]));
      }
      mesh(sph(0.17, 12, 10), M.face, this.head, [0, R * 0.55, 0.3], [0, 0, 0], [1.1, 0.8, 1]);
      mesh(sph(0.07, 10, 8), M.ink, this.head, [0, R * 0.78, 0.46], [0, 0, 0], [1.3, 0.9, 1]);
      plain(mesh(sph(0.02, 6, 4), M.white, this.head, [0.02, R * 0.84, 0.51]));
    }

    // Small furious eyes under heavy brows.
    for (const s of [-1, 1]) {
      const ex = s * 0.12;
      const ey = R * (shaggy ? 1.0 : 1.05);
      const ez = faceZ - (shaggy ? -0.04 : 0.05);
      plain(mesh(sph(0.05, 10, 8), M.eye, this.head, [ex, ey, ez], [0, 0, 0], [1, 0.8, 0.5]));
      plain(mesh(sph(0.025, 8, 6), M.ink, this.head, [ex - s * 0.01, ey - 0.005, ez + 0.03], [0, 0, 0], [1, 1, 0.5]));
      plain(mesh(new THREE.BoxGeometry(0.15, 0.045, 0.05), M.ink, this.head, [ex, ey + 0.07, ez - 0.01], [0, 0, s * 0.45]));
    }

    // Wide roaring mouth with fangs.
    const my = R * (shaggy ? 0.5 : 0.36);
    const mz = shaggy ? faceZ + 0.1 : 0.42;
    this.mouth = mesh(sph(0.12, 12, 8), M.mouth, this.head, [0, my, mz], [0, 0, 0], [1.3, 0.8, 0.45]);
    this.mouth.userData.noOutline = true;
    this.mouth.userData.keep = true; // opens and shuts while it roars
    plain(mesh(sph(0.05, 8, 6), M.tongue, this.head, [0, my - 0.05, mz + 0.03], [0, 0, 0], [1.3, 0.5, 0.4]));
    for (const s of [-1, 1]) {
      plain(mesh(new THREE.ConeGeometry(0.025, 0.08, 5), M.white, this.head, [s * 0.07, my + 0.06, mz + 0.04], [Math.PI, 0, 0]));
      plain(mesh(new THREE.ConeGeometry(0.02, 0.06, 5), M.white, this.head, [s * 0.06, my - 0.07, mz + 0.04]));
    }

    // Arms with huge clawed paws.
    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.55, 0.75, 0);
      this.torso.add(shoulder);
      // Bigfoot's arms hang long, ape-style.
      const long = bigfoot ? 1.2 : 1;
      mesh(cap(0.15, 0.34 * long), M.fur, shoulder, [0, -0.24 * long, 0]);
      const elbow = new THREE.Group();
      elbow.position.y = -0.48 * long;
      shoulder.add(elbow);
      mesh(cap(0.14, 0.3 * long), M.fur, elbow, [0, -0.2 * long, 0]);
      mesh(sph(0.17, 12, 10), shaggy ? M.face : M.paw, elbow, [0, -0.44 * long, 0.02], [0, 0, 0], [1, 1, 0.85]);
      for (let i = -1; i <= 1; i++) {
        plain(mesh(new THREE.ConeGeometry(0.035, 0.14, 5), M.claw, elbow, [i * 0.08, -0.6, 0.08], [Math.PI - 0.4, 0, 0]));
      }
      this.arms.push({ shoulder, elbow, side: s });
    }
  }

  // A hulking stack of moon rocks with glowing crystals for eyes and a heart.
  // The lava monster is the same hulk in black basalt, oozing magma.
  buildRockAlien() {
    const lava = this.kind === 'lavaMonster';
    const [rock, dark, glowA, glowB] = lava ? ['#3a2a26', '#1e1416', '#ff6a1a', '#ffd23f'] : pick(MOON_ROCKS);
    const R = toon(rock);
    const D = toon(dark);
    const G = glow(glowA);
    const G2 = glow(glowB);
    this.poofColors = [rock, dark, glowA, glowB, '#ffffff'];
    this.body = new THREE.Group();
    this.root.add(this.body);
    if (lava) this.root.scale.setScalar(1.12);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.85;
    this.body.add(this.hips);
    mesh(rockGeo(0.42, 2), D, this.hips, [0, 0, 0], [0, 0, 0], [1.2, 0.8, 1]);

    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.27, -0.05, 0);
      this.hips.add(thigh);
      mesh(rockGeo(0.24, 3 + s), R, thigh, [0, -0.25, 0]);
      mesh(rockGeo(0.25, 5 + s), D, thigh, [0, -0.52, 0.02]);
      mesh(rockGeo(0.27, 7 + s), R, thigh, [0, -0.74, 0.1], [0, 0, 0], [1.2, 0.5, 1.5]);
      this.legs.push({ thigh, side: s });
    }

    this.torso = new THREE.Group();
    this.torso.position.y = 0.1;
    this.hips.add(this.torso);
    mesh(rockGeo(0.62, 9, 1), R, this.torso, [0, 0.55, 0], [0, 0, 0], [1.15, 1.05, 0.85]);
    // Craters pocking the chest.
    for (const [x, y, r] of [[-0.3, 0.75, 0.1], [0.32, 0.4, 0.08], [-0.15, 0.25, 0.07], [0.25, 0.85, 0.06]]) {
      plain(mesh(sph(r, 8, 6), D, this.torso, [x, y, 0.5], [0, 0, 0], [1, 1, 0.3]));
    }
    for (let i = 0; i < 3; i++) {
      plain(mesh(new THREE.ConeGeometry(0.08, 0.35, 5), G, this.torso, [(i - 1) * 0.12, 0.58 + (i % 2) * 0.1, 0.5], [0.4, 0, (i - 1) * 0.4]));
    }
    // Crystal growths along the shoulders and back.
    for (let i = 0; i < 6; i++) {
      const a = -1.2 + i * 0.48;
      plain(mesh(new THREE.ConeGeometry(0.1, 0.5 + (i % 2) * 0.2, 5), i % 2 ? G2 : G, this.torso,
        [Math.sin(a) * 0.5, 0.95 + Math.cos(a) * 0.1, -0.3], [-0.6, 0, -a * 0.8]));
    }

    this.head = new THREE.Group();
    this.head.position.y = 1.15;
    this.torso.add(this.head);
    mesh(rockGeo(0.32, 13), R, this.head, [0, 0.25, 0], [0, 0, 0], [1.1, 0.95, 1]);
    mesh(rockGeo(0.16, 14), D, this.head, [0, 0.38, 0.2], [0, 0, 0], [2.2, 0.6, 1]);
    for (const s of [-1, 1]) plain(mesh(sph(0.065, 10, 8), G, this.head, [s * 0.12, 0.27, 0.27], [0, 0, 0], [1.2, 0.7, 0.6]));
    this.mouth = mesh(sph(0.1, 10, 8), G, this.head, [0, 0.1, 0.26], [0, 0, 0], [1.4, 0.6, 0.4]);
    this.mouth.userData.noOutline = true;
    this.mouth.userData.keep = true;
    for (let i = 0; i < 3; i++) {
      plain(mesh(new THREE.ConeGeometry(0.06, 0.3, 5), G2, this.head, [(i - 1) * 0.13, 0.55, -0.05], [-0.3, 0, (1 - i) * 0.4]));
    }

    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.66, 0.85, 0);
      this.torso.add(shoulder);
      mesh(rockGeo(0.24, 15 + s), R, shoulder, [0, -0.18, 0]);
      const elbow = new THREE.Group();
      elbow.position.y = -0.45;
      shoulder.add(elbow);
      mesh(rockGeo(0.21, 17 + s), D, elbow, [0, -0.12, 0]);
      mesh(rockGeo(0.3, 19 + s), R, elbow, [0, -0.42, 0.03]);
      for (let i = -1; i <= 1; i++) plain(mesh(new THREE.ConeGeometry(0.04, 0.16, 4), G, elbow, [i * 0.1, -0.5, 0.26], [Math.PI / 2, 0, 0]));
      if (lava) plain(mesh(new THREE.SphereGeometry(0.06, 8, 6), G, elbow, [0.05, -0.68, 0.05], [0, 0, 0], [1, 1.8, 1]));
      this.arms.push({ shoulder, elbow, side: s });
    }
    if (lava) {
      // Glowing magma cracks over the chest and dripping from the jaw.
      for (let i = 0; i < 9; i++) {
        const a = -1.3 + i * 0.33;
        plain(mesh(new THREE.BoxGeometry(0.05, 0.3 + (i % 3) * 0.12, 0.03), i % 2 ? G : G2, this.torso,
          [Math.sin(a) * 0.55, 0.35 + (i % 4) * 0.12, Math.cos(a) * 0.46], [0, a, (i % 3 - 1) * 0.5]));
      }
      for (const x of [-0.1, 0.08]) plain(mesh(new THREE.SphereGeometry(0.04, 8, 6), G2, this.head, [x, -0.02, 0.27], [0, 0, 0], [1, 2, 1]));
      for (const s of [-1, 1]) plain(mesh(new THREE.ConeGeometry(0.1, 0.35, 5), G, this.head, [s * 0.22, 0.45, -0.05], [0, 0, -s * 0.5]));
    }
  }

  // Big-headed little green alien in a space suit, ray gun in hand.
  buildAlien() {
    const [skin, skin2, suit, trim] = pick(ALIENS);
    const S = toon(skin);
    const S2 = toon(skin2);
    const U = toon(suit);
    const T = toon(trim);
    const ink = toon('#0a0a14');
    const white = toon('#ffffff');
    this.poofColors = [skin, suit, trim, '#ffffff', '#7dffb0'];
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.78;
    this.body.add(this.hips);
    mesh(sph(0.24), U, this.hips, [0, 0, 0], [0, 0, 0], [1.2, 0.8, 1]);
    mesh(new THREE.TorusGeometry(0.27, 0.04, 6, 18), T, this.hips, [0, 0.08, 0], [Math.PI / 2, 0, 0]);

    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.13, -0.05, 0);
      this.hips.add(thigh);
      mesh(cap(0.08, 0.5), U, thigh, [0, -0.33, 0]);
      mesh(sph(0.12), T, thigh, [0, -0.68, 0.06], [0, 0, 0], [1, 0.6, 1.5]);
      this.legs.push({ thigh, side: s });
    }

    this.torso = new THREE.Group();
    this.torso.position.y = 0.08;
    this.hips.add(this.torso);
    mesh(cap(0.22, 0.3), U, this.torso, [0, 0.35, 0], [0, 0, 0], [1.1, 1, 0.85]);
    plain(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 12), glow(trim), this.torso, [0, 0.45, 0.2], [Math.PI / 2, 0, 0]));
    mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 14), T, this.torso, [0, 0.66, 0], [Math.PI / 2, 0, 0]);
    mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.18, 8), S, this.torso, [0, 0.74, 0]);

    // The famous big head and huge black eyes.
    this.head = new THREE.Group();
    this.head.position.y = 0.78;
    this.torso.add(this.head);
    mesh(sph(0.4, 18, 14), S, this.head, [0, 0.42, 0], [0, 0, 0], [1.05, 1.1, 0.95]);
    mesh(sph(0.22, 14, 10), S, this.head, [0, 0.14, 0.06], [0, 0, 0], [1, 1.1, 1]);
    for (const s of [-1, 1]) {
      plain(mesh(sph(0.13, 14, 10), ink, this.head, [s * 0.17, 0.4, 0.3], [0, s * 0.35, s * 0.5], [1.5, 0.78, 0.5]));
      plain(mesh(sph(0.03, 6, 4), white, this.head, [s * 0.17 + 0.04, 0.45, 0.37]));
      plain(mesh(new THREE.BoxGeometry(0.14, 0.03, 0.04), S2, this.head, [s * 0.17, 0.55, 0.33], [0, 0, s * 0.4]));
      mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.35, 5), S2, this.head, [s * 0.15, 0.88, 0], [0, 0, -s * 0.35]);
      plain(mesh(sph(0.06, 8, 6), glow(trim), this.head, [s * 0.21, 1.04, 0]));
    }
    this.mouth = mesh(sph(0.06, 10, 8), ink, this.head, [0, 0.12, 0.26], [0, 0, 0], [1.3, 0.6, 0.4]);
    this.mouth.userData.noOutline = true;
    this.mouth.userData.keep = true;

    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.3, 0.55, 0);
      this.torso.add(shoulder);
      mesh(cap(0.07, 0.22), U, shoulder, [0, -0.16, 0]);
      const elbow = new THREE.Group();
      elbow.position.y = -0.36;
      shoulder.add(elbow);
      mesh(cap(0.055, 0.24), S, elbow, [0, -0.16, 0]);
      mesh(sph(0.07, 8, 6), S, elbow, [0, -0.34, 0]);
      for (let i = -1; i <= 1; i++) mesh(new THREE.ConeGeometry(0.025, 0.16, 5), S2, elbow, [i * 0.04, -0.44, 0.02], [Math.PI, 0, 0]);
      if (s > 0) {
        mesh(new THREE.BoxGeometry(0.08, 0.12, 0.3), T, elbow, [0, -0.38, 0.12]);
        mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.2, 8), U, elbow, [0, -0.36, 0.32], [Math.PI / 2, 0, 0]);
        plain(mesh(sph(0.045, 6, 4), glow('#7dffb0'), elbow, [0, -0.36, 0.43]));
      }
      this.arms.push({ shoulder, elbow, side: s });
    }
  }

  // mode: 'roar' (default: claws up, mouth wide), 'walk', 'run' (charge), 'leap'
  animate(dt, mode, speedMul = 1) {
    this.t += dt * speedMul;
    const t = this.t;
    this.body.position.y = 0;
    this.body.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    for (const l of this.legs) l.thigh.rotation.set(0, 0, 0);
    if (mode === 'walk' || mode === 'run') {
      // Heavy lumbering gait, rolling side to side.
      const run = mode === 'run';
      const f = run ? 10 : 5.5;
      const amp = run ? 0.8 : 0.45;
      const sw = Math.sin(t * f);
      this.legs[0].thigh.rotation.x = sw * amp;
      this.legs[1].thigh.rotation.x = -sw * amp;
      this.body.position.y = Math.abs(Math.cos(t * f)) * (run ? 0.12 : 0.06);
      this.body.rotation.z = sw * 0.08;
      this.torso.rotation.x = run ? 0.4 : 0.15;
      for (const { shoulder, elbow, side } of this.arms) {
        if (run) shoulder.rotation.set(-1.5 + side * sw * 0.5, 0, side * 0.25);
        else shoulder.rotation.set(-side * sw * amp, 0, side * 0.3);
        elbow.rotation.set(run ? -0.5 : -0.3, 0, 0);
      }
      this.head.rotation.set(run ? -0.3 : 0, Math.sin(t * 2.5) * 0.15 + (this.glance || 0), 0);
      this.mouth.scale.set(1.3, run ? 0.9 + Math.abs(sw) * 0.3 : 0.5, 0.45);
    } else if (mode === 'leap') {
      // Knees tucked, arms flung up.
      this.legs[0].thigh.rotation.x = -1.1;
      this.legs[1].thigh.rotation.x = -0.8;
      for (const { shoulder, elbow, side } of this.arms) {
        shoulder.rotation.set(-0.3, 0, side * 2.7);
        elbow.rotation.set(-0.4, 0, 0);
      }
      this.head.rotation.x = -0.25;
      this.mouth.scale.set(1.3, 1.3, 0.45);
    } else if (this.kind === 'yeti' && Math.sin(t * 1.3) > 0.2) {
      // Yeti chest pounding between roars.
      const stomp = Math.max(0, Math.sin(t * 6));
      this.legs[0].thigh.rotation.x = -stomp * 0.35;
      this.body.position.y = stomp * 0.05;
      for (const { shoulder, elbow, side } of this.arms) {
        const beat = Math.sin(t * 14 + (side > 0 ? Math.PI : 0));
        shoulder.rotation.set(-1.1 - beat * 0.35, 0, -side * 0.35);
        elbow.rotation.set(-1.5, 0, 0);
      }
      this.torso.rotation.x = -0.1;
      this.head.rotation.set(-0.2, Math.sin(t * 3) * 0.1, 0);
      this.mouth.scale.set(1.3, 0.7 + Math.abs(Math.sin(t * 7)) * 0.4, 0.45);
    } else {
      // Rear up and roar, claws swiping.
      const swell = (Math.sin(t * 2.2) + 1) / 2;
      const swipe = Math.sin(t * 8) * 0.2;
      this.torso.rotation.x = -0.15 * swell;
      this.body.position.y = swell * 0.04;
      for (const { shoulder, elbow, side } of this.arms) {
        shoulder.rotation.set(-0.6 - swell * 0.3 + side * swipe, 0, side * (1.7 + swell * 0.7));
        elbow.rotation.set(-0.7 + swipe, 0, 0);
      }
      this.head.rotation.set(-0.15 - swell * 0.2, Math.sin(t * 9) * 0.12 * swell, Math.sin(t * 4) * 0.06);
      this.mouth.scale.set(1.3, 0.8 + swell * 0.6 + Math.abs(Math.sin(t * 18)) * 0.1, 0.45);
    }
  }
}

// The flying saucer a Mars alien beams down from. The beam is a cone of light
// whose top sits under the saucer; scale.y sets how far down it reaches.
export function buildUfo(outline = true) {
  const group = new THREE.Group();
  mesh(sph(1.7, 24, 10), toon('#c9ccd6'), group, [0, 0, 0], [0, 0, 0], [1, 0.22, 1]);
  mesh(sph(1.2, 20, 8), toon('#8a8fa0'), group, [0, -0.12, 0], [0, 0, 0], [1, 0.25, 1]);
  plain(mesh(new THREE.SphereGeometry(0.75, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#9ff3ff', transparent: true, opacity: 0.75 }), group, [0, 0.2, 0]));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    plain(mesh(sph(0.09, 8, 6), glow(i % 2 ? '#ffe066' : '#ff3df0'), group, [Math.cos(a) * 1.55, 0.02, Math.sin(a) * 1.55]));
  }
  plain(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 18), glow('#9fffb0'), group, [0, -0.32, 0]));
  bakeRig(group);
  if (outline) addOutlines(group, 0.03);
  const geo = new THREE.CylinderGeometry(0.55, 1.5, 1, 20, 1, true);
  geo.translate(0, -0.5, 0);
  const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: '#9fffb0', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  beam.position.y = -0.3;
  group.add(beam);
  return { group, beam };
}
