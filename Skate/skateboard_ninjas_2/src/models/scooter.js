// Scooter rider: a downtown commuter in a hoodie and helmet on an electric
// kick-scooter, phone in hand. Faces +Z (toward the oncoming player).

import { THREE, toon, addOutlines, bakeRig } from '../gfx.js';

const INK = '#140c2b';
const cap = (r, len, seg = 8) => new THREE.CapsuleGeometry(r, len, 4, seg);
const sph = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);

const HOODIES = ['#ff5e3a', '#3d7bff', '#2bb673', '#b48cff', '#ffcc1a', '#ff3d7f'];
const PANTS = ['#2a2f45', '#5a6a8a', '#3a3a44', '#6b4a30'];
const HELMETS = ['#ffffff', '#ff2e55', '#14162b', '#3de1ff', '#7dffb0'];
const SCOOTERS = [['#14162b', '#3de1ff'], ['#e9ecf2', '#ff2e55'], ['#2bb673', '#ffffff'], ['#ff8c1a', '#14162b']];
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

export class ScooterRig {
  constructor({ outline = true } = {}) {
    this.root = new THREE.Group();
    const [frame, accent] = pick(SCOOTERS);
    const hoodie = pick(HOODIES);
    this.mats = {
      frame: toon(frame),
      accent: toon(accent),
      rubber: toon('#1a1a22'),
      metal: toon('#c9ccd6'),
      hoodie: toon(hoodie),
      pants: toon(pick(PANTS)),
      helmet: toon(pick(HELMETS)),
      skin: toon(pick(SKINS)),
      ink: toon(INK),
      shoe: toon('#e9ecf2'),
      glow: new THREE.MeshBasicMaterial({ color: accent }),
      screen: new THREE.MeshBasicMaterial({ color: '#9ff3ff' }),
    };
    this.poofColors = [hoodie, accent, frame, '#ffffff', '#ffe066'];
    this.build();
    bakeRig(this.root);
    if (outline) addOutlines(this.root, 0.02);
    this.t = Math.random() * 10;
    this.lean = 0;
  }

  build() {
    const M = this.mats;
    // The scooter: deck along Z, stem up from the front.
    this.scooter = new THREE.Group();
    this.root.add(this.scooter);
    mesh(new THREE.BoxGeometry(0.2, 0.06, 0.95), M.frame, this.scooter, [0, 0.16, 0]);
    plain(mesh(new THREE.BoxGeometry(0.21, 0.015, 0.8), M.glow, this.scooter, [0, 0.125, 0]));
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), M.metal, this.scooter, [0, 0.68, 0.5], [0.15, 0, 0]);
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), M.metal, this.scooter, [0, 1.17, 0.57], [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), M.rubber, this.scooter, [s * 0.3, 1.17, 0.57], [0, 0, Math.PI / 2]);
    plain(mesh(new THREE.BoxGeometry(0.1, 0.05, 0.04), M.glow, this.scooter, [0, 1.05, 0.63]));
    this.wheels = [];
    for (const z of [-0.45, 0.5]) {
      const w = new THREE.Group();
      w.position.set(0, 0.1, z);
      this.scooter.add(w);
      mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 14), M.rubber, w, [0, 0, 0], [0, 0, Math.PI / 2]);
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.075, 10), M.accent, w, [0, 0, 0], [0, 0, Math.PI / 2]);
      this.wheels.push(w);
    }

    // The rider.
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.hips = new THREE.Group();
    this.hips.position.set(0, 0.98, 0);
    this.body.add(this.hips);
    mesh(cap(0.17, 0.12), M.pants, this.hips, [0, 0, 0], [0, 0, Math.PI / 2], [1, 1.1, 0.9]);
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.1, -0.04, 0);
      this.hips.add(thigh);
      mesh(cap(0.08, 0.62), M.pants, thigh, [0, -0.38, 0]);
      mesh(new THREE.BoxGeometry(0.13, 0.08, 0.24), M.shoe, thigh, [0, -0.78, 0.05]);
      this.legs.push({ thigh, side: s });
    }
    this.torso = new THREE.Group();
    this.torso.position.y = 0.05;
    this.hips.add(this.torso);
    mesh(cap(0.2, 0.3), M.hoodie, this.torso, [0, 0.3, 0], [0, 0, 0], [1.1, 1, 0.85]);
    mesh(new THREE.TorusGeometry(0.13, 0.05, 6, 14), M.hoodie, this.torso, [0, 0.58, -0.06], [Math.PI / 2 - 0.4, 0, 0]);
    mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), M.accent, this.torso, [0, 0.22, 0.17]);

    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    this.torso.add(this.head);
    mesh(sph(0.17), M.skin, this.head, [0, 0.17, 0]);
    mesh(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.helmet, this.head, [0, 0.2, -0.01], [-0.15, 0, 0]);
    plain(mesh(new THREE.BoxGeometry(0.26, 0.06, 0.06), M.ink, this.head, [0, 0.19, 0.15]));
    plain(mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), M.ink, this.head, [0, 0.08, 0.16], [0, 0, 0.3]));
    this.mouth = mesh(sph(0.03, 8, 6), M.ink, this.head, [0, 0.08, 0.16], [0, 0, 0], [1.4, 0.7, 0.5]);
    this.mouth.userData.noOutline = true;
    this.mouth.userData.keep = true;

    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.24, 0.5, 0);
      this.torso.add(shoulder);
      mesh(cap(0.065, 0.24), M.hoodie, shoulder, [0, -0.16, 0]);
      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      shoulder.add(elbow);
      mesh(cap(0.055, 0.22), M.hoodie, elbow, [0, -0.13, 0]);
      mesh(sph(0.06, 8, 6), M.skin, elbow, [0, -0.29, 0]);
      this.arms.push({ shoulder, elbow, side: s });
    }
    // Phone in the right hand, screen glowing.
    const phone = mesh(new THREE.BoxGeometry(0.08, 0.15, 0.02), M.ink, this.arms[1].elbow, [0, -0.33, 0.05]);
    phone.userData.keep = true;
    plain(mesh(new THREE.BoxGeometry(0.065, 0.12, 0.005), M.screen, phone, [0, 0, 0.012]));
  }

  // mode: 'ride' (both hands on the bars, crouched) or anything else: stopped,
  // one foot down, shaking the phone at you.
  animate(dt, mode, speedMul = 1) {
    this.t += dt * speedMul;
    const t = this.t;
    const [L, R] = this.arms;
    const ride = mode === 'ride';
    for (const w of this.wheels) w.rotation.x += (ride ? 30 : 0) * dt;
    this.root.rotation.z = this.lean;
    this.scooter.rotation.z = 0;
    if (ride) {
      this.hips.position.set(0, 0.95 + Math.sin(t * 9) * 0.01, -0.05);
      this.legs[0].thigh.rotation.set(0.12, 0, 0);
      this.legs[1].thigh.rotation.set(-0.12, 0, 0);
      this.torso.rotation.set(0.35, 0, 0);
      this.head.rotation.set(-0.3, Math.sin(t * 2) * 0.1, 0);
      for (const { shoulder, elbow, side } of this.arms) {
        shoulder.rotation.set(-1.0, 0, side * 0.12);
        elbow.rotation.set(-0.45, 0, 0);
      }
      this.mouth.scale.set(1.4, 0.7, 0.5);
    } else {
      // One foot down on the road, waving the phone and yelling.
      const shake = Math.sin(t * 14);
      this.hips.position.set(-0.05, 0.92, 0);
      this.legs[0].thigh.rotation.set(0, 0, -0.32);
      this.legs[1].thigh.rotation.set(0, 0, 0);
      this.torso.rotation.set(0.1, 0, 0.08);
      this.head.rotation.set(0, Math.sin(t * 5) * 0.15, 0);
      L.shoulder.rotation.set(-0.95, 0, -0.12);
      L.elbow.rotation.set(-0.45, 0, 0);
      R.shoulder.rotation.set(-2.2 + shake * 0.15, 0, 0.35);
      R.elbow.rotation.set(-0.6 + shake * 0.2, 0, 0);
      this.mouth.scale.set(1.4, 0.7 + Math.abs(Math.sin(t * 9)) * 0.9, 0.5);
    }
  }
}
