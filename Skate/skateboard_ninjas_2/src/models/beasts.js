// The environment beasts: a big roaring bear for the forest and a shaggy yeti
// for the snowy mountains. One rig, two looks. Both stand on their hind legs,
// claws out, mouth wide open. Faces +Z (toward the oncoming player).

import { THREE, toon, addOutlines, bakeRig } from '../gfx.js';

const INK = '#140c2b';
const cap = (r, len, seg = 8) => new THREE.CapsuleGeometry(r, len, 4, seg);
const sph = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);

// fur, darker fur, belly / face, paws, claws
const BEAR_COATS = [
  ['#7a4a26', '#5c3519', '#c08a55', '#4a2a14', '#f2e6c8'], // brown bear
  ['#9a6a3a', '#7a5028', '#d8b07c', '#5a3a1e', '#f2e6c8'], // grizzly
  ['#2e2622', '#1e1916', '#b08a62', '#1a1512', '#e8dcc0'], // black bear
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

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const plain = (m) => {
  m.userData.noOutline = true;
  return m;
};

export class BeastRig {
  constructor({ kind = 'bear', outline = true } = {}) {
    this.kind = kind;
    this.root = new THREE.Group();
    const coat = pick(kind === 'yeti' ? YETI_COATS : BEAR_COATS);
    this.mats = {
      fur: toon(coat[0]),
      fur2: toon(coat[1]),
      face: toon(coat[2]),
      paw: toon(coat[3]),
      claw: toon(coat[4]),
      ink: toon(INK),
      white: toon('#ffffff'),
      mouth: toon('#5a1020'),
      tongue: toon('#e8506a'),
      eye: toon(kind === 'yeti' ? '#ffe066' : '#ffffff'),
    };
    this.poofColors = [coat[0], coat[1], coat[2], '#ffffff', '#ffe066'];
    this.build();
    bakeRig(this.root);
    if (outline) addOutlines(this.root, 0.025);
    this.t = Math.random() * 10;
  }

  build() {
    const M = this.mats;
    const yeti = this.kind === 'yeti';
    this.body = new THREE.Group();
    this.root.add(this.body);

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
      mesh(sph(0.19), yeti ? M.face : M.paw, thigh, [0, -0.66, 0.1], [0, 0, 0], [1, 0.55, 1.4]);
      for (let i = -1; i <= 1; i++) {
        plain(mesh(new THREE.ConeGeometry(0.035, 0.1, 5), M.claw, thigh, [i * 0.07, -0.68, 0.36], [Math.PI / 2, 0, 0]));
      }
      this.legs.push({ thigh, side: s });
    }

    // Big barrel chest and belly.
    this.torso = new THREE.Group();
    this.torso.position.y = 0.1;
    this.hips.add(this.torso);
    mesh(sph(0.52, 18, 14), M.fur, this.torso, [0, 0.48, 0], [0, 0, 0], [1.1, 1.05, 0.9]);
    plain(mesh(sph(0.4, 16, 12), yeti ? M.fur2 : M.face, this.torso, [0, 0.4, 0.27], [0, 0, 0], [0.95, 1, 0.6]));
    if (yeti) {
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
    if (yeti) {
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
      const ey = R * (yeti ? 1.0 : 1.05);
      const ez = faceZ - (yeti ? -0.04 : 0.05);
      plain(mesh(sph(0.05, 10, 8), M.eye, this.head, [ex, ey, ez], [0, 0, 0], [1, 0.8, 0.5]));
      plain(mesh(sph(0.025, 8, 6), M.ink, this.head, [ex - s * 0.01, ey - 0.005, ez + 0.03], [0, 0, 0], [1, 1, 0.5]));
      plain(mesh(new THREE.BoxGeometry(0.15, 0.045, 0.05), M.ink, this.head, [ex, ey + 0.07, ez - 0.01], [0, 0, s * 0.45]));
    }

    // Wide roaring mouth with fangs.
    const my = R * (yeti ? 0.5 : 0.36);
    const mz = yeti ? faceZ + 0.1 : 0.42;
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
      mesh(cap(0.15, 0.34), M.fur, shoulder, [0, -0.24, 0]);
      const elbow = new THREE.Group();
      elbow.position.y = -0.48;
      shoulder.add(elbow);
      mesh(cap(0.14, 0.3), M.fur, elbow, [0, -0.2, 0]);
      mesh(sph(0.17, 12, 10), yeti ? M.face : M.paw, elbow, [0, -0.44, 0.02], [0, 0, 0], [1, 1, 0.85]);
      for (let i = -1; i <= 1; i++) {
        plain(mesh(new THREE.ConeGeometry(0.035, 0.14, 5), M.claw, elbow, [i * 0.08, -0.6, 0.08], [Math.PI - 0.4, 0, 0]));
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
      this.head.rotation.set(run ? -0.3 : 0, Math.sin(t * 2.5) * 0.15, 0);
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
