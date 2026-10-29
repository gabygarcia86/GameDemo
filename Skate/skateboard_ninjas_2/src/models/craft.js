// Flying enemies: a Mars UFO (with a little green pilot in the dome) and a
// moon space fighter. Both face +Z (toward the oncoming player).

import { THREE, toon, addOutlines, bakeRig } from '../gfx.js';
import { buildUfo } from './beasts.js';

const INK = '#140c2b';

function mesh(geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  m.castShadow = true;
  parent.add(m);
  return m;
}
const plain = (m) => {
  m.userData.noOutline = true;
  return m;
};
const glow = (color, opts = {}) => new THREE.MeshBasicMaterial({ color, ...opts });

export class CraftRig {
  constructor({ kind = 'ufo', outline = true } = {}) {
    this.kind = kind;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // banks and pitches inside the root
    this.root.add(this.body);
    this.t = Math.random() * 10;
    if (kind === 'ship') this.buildShip(outline);
    else if (kind === 'tieFighter') this.buildTie(outline);
    else this.buildUfo(outline);
  }

  // The trench's twin-wing fighter: a ball cockpit slung between two tall
  // hexagonal wing panels.
  buildTie(outline) {
    const hull = toon('#9aa0ae');
    const dark = toon('#2a2d38');
    const frame = toon('#6b7280');
    const s = new THREE.Group();
    s.position.y = 1.15;
    this.body.add(s);
    mesh(new THREE.SphereGeometry(0.45, 16, 12), hull, s);
    // Round cockpit window with struts, facing the player.
    plain(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 8), dark, s, [0, 0, 0.42], [Math.PI / 2, 0, 0]));
    for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(0.52, 0.035, 0.04), frame, s, [0, 0, 0.46], [0, 0, (i * Math.PI) / 4]);
    mesh(new THREE.TorusGeometry(0.27, 0.04, 6, 8), frame, s, [0, 0, 0.45]);
    for (const sd of [-1, 1]) {
      // Chin cannons.
      mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), dark, s, [sd * 0.12, -0.3, 0.38], [Math.PI / 2, 0, 0]);
      // Pylon out to the wing.
      mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.6, 8), hull, s, [sd * 0.62, 0, 0], [0, 0, Math.PI / 2]);
      const wing = new THREE.Group();
      wing.position.x = sd * 0.95;
      wing.scale.set(1, 1.2, 0.85);
      s.add(wing);
      // Hex panel standing in the YZ plane, corners at top and bottom.
      const panel = new THREE.CylinderGeometry(1, 1, 0.06, 6).rotateY(Math.PI / 2).rotateZ(Math.PI / 2);
      mesh(panel, dark, wing);
      const rim = new THREE.TorusGeometry(0.98, 0.05, 4, 6).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
      mesh(rim, frame, wing);
      for (let k = 0; k < 3; k++) mesh(new THREE.BoxGeometry(0.08, 1.95, 0.06), frame, wing, [sd * 0.02, 0, 0], [(k * Math.PI) / 3, 0, 0]);
      mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), hull, wing, [0, 0, 0], [0, 0, Math.PI / 2]);
    }
    bakeRig(this.body);
    if (outline) addOutlines(this.body, 0.025);
    // Twin engine glow out the back.
    for (const sd of [-1, 1]) {
      plain(mesh(new THREE.SphereGeometry(0.08, 8, 6), glow('#ff4a3a'), s, [sd * 0.13, 0.05, -0.43]));
    }
    this.poofColors = ['#9aa0ae', '#2a2d38', '#3dff5a', '#ffffff', '#6b7280'];
  }

  buildUfo(outline) {
    const { group, beam } = buildUfo(outline);
    group.scale.setScalar(0.62);
    group.position.y = 0.55;
    this.body.add(group);
    this.saucer = group;
    this.beam = beam;
    // The pilot, peering out of the glass dome.
    const pilot = new THREE.Group();
    pilot.position.y = 0.25;
    group.add(pilot);
    const skin = toon('#7be35a');
    mesh(new THREE.SphereGeometry(0.32, 14, 10), skin, pilot, [0, 0.12, 0.05], [0, 0, 0], [1, 1.1, 0.95]);
    for (const s of [-1, 1]) {
      plain(mesh(new THREE.SphereGeometry(0.1, 10, 8), toon('#0a0a14'), pilot, [s * 0.13, 0.14, 0.3], [0, s * 0.35, s * 0.5], [1.5, 0.78, 0.5]));
      mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.25, 5), skin, pilot, [s * 0.12, 0.48, 0], [0, 0, -s * 0.35]);
      plain(mesh(new THREE.SphereGeometry(0.045, 8, 6), glow('#ff3df0'), pilot, [s * 0.17, 0.6, 0]));
    }
    if (outline) addOutlines(pilot, 0.025);
    this.poofColors = ['#c9ccd6', '#9ff3ff', '#7be35a', '#ff3df0', '#ffe066'];
  }

  buildShip(outline) {
    const white = toon('#e9ecf2');
    const red = toon('#ff2e55');
    const grey = toon('#6b7280');
    const s = new THREE.Group();
    s.position.y = 0.55;
    this.body.add(s);
    // Fuselage along Z, nose toward +Z.
    mesh(new THREE.CapsuleGeometry(0.32, 1.4, 6, 12), white, s, [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 0.85]);
    mesh(new THREE.ConeGeometry(0.28, 0.55, 12), red, s, [0, 0, 1.15], [Math.PI / 2, 0, 0]);
    for (const z of [-0.3, 0.1]) plain(mesh(new THREE.TorusGeometry(0.32, 0.035, 5, 18), red, s, [0, 0, z], [0, 0, 0], [1, 0.85, 1]));
    // Cockpit glass.
    plain(mesh(new THREE.SphereGeometry(0.24, 14, 10), glow('#9ff3ff', { transparent: true, opacity: 0.85 }), s, [0, 0.2, 0.45], [0, 0, 0], [0.9, 0.7, 1.5]));
    // Swept wings with red tips, tail fin.
    for (const sd of [-1, 1]) {
      mesh(new THREE.BoxGeometry(1.0, 0.07, 0.6), white, s, [sd * 0.75, -0.05, -0.25], [0, sd * -0.35, sd * -0.08]);
      mesh(new THREE.BoxGeometry(0.12, 0.3, 0.5), red, s, [sd * 1.22, 0.05, -0.45], [0, sd * -0.35, 0]);
      plain(mesh(new THREE.SphereGeometry(0.05, 8, 6), glow(sd > 0 ? '#3dff6a' : '#ff2e2e'), s, [sd * 1.28, 0.22, -0.45]));
      mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.5, 12), grey, s, [sd * 0.38, -0.12, -0.75], [Math.PI / 2, 0, 0]);
    }
    mesh(new THREE.BoxGeometry(0.07, 0.55, 0.55), red, s, [0, 0.38, -0.7], [-0.35, 0, 0]);
    bakeRig(this.body);
    if (outline) addOutlines(this.body, 0.025);
    // Engine flames (glowing, flicker in animate).
    this.flames = [];
    for (const sd of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.7, 10), glow('#ffb020', { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      f.geometry.translate(0, 0.35, 0); // wide end at the nozzle
      f.rotation.x = -Math.PI / 2; // tip pointing out the back (-Z)
      f.position.set(sd * 0.38, -0.12, -1.0);
      f.userData.noOutline = true;
      s.add(f);
      this.flames.push(f);
    }
    this.poofColors = ['#e9ecf2', '#ff2e55', '#ffb020', '#9ff3ff', '#ffe066'];
  }

  // bank: roll (radians); dive 0..1 pitches the nose down while swooping;
  // beamTo: height of the ground below the saucer (UFO beam), or 0 for none.
  animate(dt, { bank = 0, dive = 0, beamTo = 0 } = {}) {
    this.t += dt;
    const t = this.t;
    this.body.rotation.set(dive * 0.5, 0, bank);
    this.body.position.y = Math.sin(t * 2.5) * 0.08;
    if (this.saucer) {
      this.saucer.rotation.y = t * 2.2;
      this.beam.visible = beamTo > 0.2;
      this.beam.scale.y = beamTo / 0.62;
      this.beam.material.opacity = 0.2 + Math.sin(t * 12) * 0.06;
    }
    if (this.flames) {
      for (const [i, f] of this.flames.entries()) {
        const k = 0.8 + Math.sin(t * 40 + i * 2) * 0.15 + Math.random() * 0.15;
        f.scale.set(1, k * (1 + dive * 0.8), 1);
      }
    }
  }
}
