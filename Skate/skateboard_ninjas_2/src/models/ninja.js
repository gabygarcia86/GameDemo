// The ninja: a jointed rig made of primitives with exaggerated proportions
// (big head, small body). Used for the player and, with an evil palette and
// glowing eyes, for the rival ninjas. Facing +Z in its own space; the player
// turns it sideways to stand on the board.

import { THREE, toon, toonGradient, addOutlines, bakeRig } from '../gfx.js';
import { patternTexture, stickerTexture } from './decals.js';

const INK = '#140c2b';
const SKIN = '#f2c29a';

const cap = (r, len, seg = 8) => new THREE.CapsuleGeometry(r, len, 4, seg);
const sph = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);

const LEG = 0.36; // thigh and shin length
const ARM = 0.3;

function mesh(geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  m.scale.set(scale[0], scale[1], scale[2]);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export const EVIL_PALETTES = [
  { suit: '#1b1b24', mask: '#2a0a12', band: '#ff1a3a', accent: '#ff1a3a', eyes: '#ff2a2a' },
  { suit: '#2b1047', mask: '#14062a', band: '#b84dff', accent: '#ff3df0', eyes: '#ff3df0' },
  { suit: '#0f2a1e', mask: '#06140e', band: '#8cff3d', accent: '#ffe066', eyes: '#c6ff3d' },
];

export class NinjaRig {
  constructor({ evil = false, palette = null, outline = true } = {}) {
    this.evil = evil;
    this.root = new THREE.Group();
    this.mats = {
      suit: toon('#2f3a7a', { unique: true }),
      mask: toon('#14162b', { unique: true }),
      band: toon('#ff2e55', { unique: true }),
      accent: toon('#ffb703', { unique: true }),
      skin: toon(SKIN),
      white: toon('#ffffff'),
      ink: toon(INK),
      shoe: toon('#1a1a2e'),
    };
    if (evil) {
      const eyeColor = palette?.eyes || '#ff2a2a';
      this.mats.eye = new THREE.MeshBasicMaterial({ color: eyeColor });
    }
    this.build();
    if (palette) this.setColors(palette);
    // Rival ninjas never change colour, so bake them down to fewer draw calls.
    if (evil) bakeRig(this.root);
    if (outline) addOutlines(this.root, 0.022);
    this.tailTime = Math.random() * 10;
  }

  build() {
    const M = this.mats;
    // Body sits on the "body" group so the whole rig can be offset (e.g. the
    // board's deck height) without touching the pose.
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.66;
    this.body.add(this.hips);
    mesh(cap(0.2, 0.08), M.suit, this.hips, [0, 0, 0], [0, 0, Math.PI / 2], [1, 1.35, 0.8]);

    this.torso = new THREE.Group();
    this.torso.position.y = 0.04;
    this.hips.add(this.torso);
    mesh(cap(0.24, 0.3), M.suit, this.torso, [0, 0.33, 0], [0, 0, 0], [1.05, 1, 0.82]);
    mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.1, 16), M.accent, this.torso, [0, 0.1, 0], [0, 0, 0], [1.04, 1, 0.84]);
    mesh(new THREE.BoxGeometry(0.12, 0.1, 0.06), M.accent, this.torso, [0.08, 0.08, 0.2], [0, 0, 0.5]);
    // Chest wrap: a diagonal accent strip.
    mesh(new THREE.BoxGeometry(0.07, 0.62, 0.05), M.accent, this.torso, [0, 0.38, 0.19], [0, 0, 0.6]).userData.noOutline = true;
    // Sticker slots on the chest and back (the player's ninja only).
    this.stickers = {};
    if (!this.evil) {
      for (const [key, y, z, rotY, size] of [['stickerFront', 0.44, 0.232, 0, 0.31], ['stickerBack', 0.42, -0.232, Math.PI, 0.38]]) {
        const mat = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), transparent: true, alphaTest: 0.35 });
        const m = mesh(new THREE.PlaneGeometry(size, size), mat, this.torso, [0, y, z], [0, rotY, 0]);
        m.castShadow = false;
        m.userData.noOutline = true;
        m.visible = false;
        this.stickers[key] = m;
      }
    }

    // Head
    this.head = new THREE.Group();
    this.head.position.y = 0.66;
    this.torso.add(this.head);
    const R = 0.34;
    mesh(sph(R, 18, 14), M.mask, this.head, [0, R * 0.9, 0]);
    // Eye slit band of skin across the face.
    const band = new THREE.SphereGeometry(R * 1.015, 20, 6, Math.PI / 2 - 0.95, 1.9, 1.22, 0.42);
    const slit = mesh(band, M.skin, this.head, [0, R * 0.9, 0]);
    slit.userData.noOutline = true;
    const eyeY = R * 0.9 + R * Math.cos(1.43);
    for (const s of [-1, 1]) {
      const ex = s * 0.13;
      const ez = Math.sqrt(R * R - ex * ex - (eyeY - R * 0.9) ** 2) * 1.0;
      if (this.evil) {
        const e = mesh(sph(0.055, 10, 8), M.eye, this.head, [ex, eyeY, ez + 0.005], [0, 0, 0], [1.4, 0.55, 0.4]);
        e.rotation.z = s * -0.35;
        e.userData.noOutline = true;
      } else {
        const e = mesh(sph(0.065, 10, 8), M.white, this.head, [ex, eyeY, ez], [0, 0, 0], [1, 1.15, 0.45]);
        e.userData.noOutline = true;
        const p = mesh(sph(0.034, 8, 6), M.ink, this.head, [ex * 0.95, eyeY - 0.005, ez + 0.03], [0, 0, 0], [1, 1.2, 0.5]);
        p.userData.noOutline = true;
      }
      const brow = mesh(new THREE.BoxGeometry(0.13, 0.03, 0.04), M.ink, this.head, [ex, eyeY + 0.085, ez - 0.015], [0, 0, s * (this.evil ? 0.45 : 0.22)]);
      brow.userData.noOutline = true;
    }
    // Headband ring + knot + two tails that flap in the wind.
    const ring = mesh(new THREE.TorusGeometry(R * 1.0, 0.045, 8, 26), M.band, this.head, [0, R * 0.9 + 0.17, 0], [Math.PI / 2 - 0.08, 0, 0], [1, 1, 1]);
    ring.scale.set(1.02, 1.02, 1);
    mesh(sph(0.07, 10, 8), M.band, this.head, [0, R * 0.9 + 0.15, -R * 0.98]);
    this.tails = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.04, R * 0.9 + 0.14, -R * 1.0);
      this.head.add(pivot);
      const t = mesh(new THREE.BoxGeometry(0.075, 0.025, 0.42), M.band, pivot, [0, 0, -0.21]);
      t.userData.noOutline = true;
      this.tails.push({ pivot, side: s });
    }

    // Arms (shoulder -> elbow -> glove)
    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.27, 0.5, 0);
      this.torso.add(shoulder);
      mesh(cap(0.085, ARM * 0.6), M.suit, shoulder, [0, -ARM * 0.5, 0]);
      const elbow = new THREE.Group();
      elbow.position.y = -ARM;
      shoulder.add(elbow);
      mesh(cap(0.078, ARM * 0.55), M.suit, elbow, [0, -ARM * 0.45, 0]);
      mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 10), M.accent, elbow, [0, -ARM * 0.78, 0]).userData.noOutline = true;
      mesh(sph(0.1, 12, 8), M.accent, elbow, [0, -ARM * 0.98, 0]);
      this.arms.push({ shoulder, elbow, side: s });
    }

    // Legs (hip -> knee -> foot)
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.13, 0, 0);
      this.hips.add(thigh);
      mesh(cap(0.1, LEG * 0.55), M.suit, thigh, [0, -LEG * 0.5, 0]);
      const knee = new THREE.Group();
      knee.position.y = -LEG;
      thigh.add(knee);
      mesh(cap(0.09, LEG * 0.55), M.suit, knee, [0, -LEG * 0.48, 0]);
      mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.06, 10), M.accent, knee, [0, -LEG * 0.82, 0]).userData.noOutline = true;
      // The sole sits on the IK foot point (plus a hair for the deck's top
      // surface), so a foot placed on the deck stands on it instead of in it.
      const foot = mesh(new THREE.BoxGeometry(0.17, 0.1, 0.3), M.shoe, knee, [0, -LEG + 0.07, 0.05]);
      foot.userData.keep = true; // rotated by setLeg
      this.legs.push({ thigh, knee, foot, side: s });
    }
  }

  setColors(c) {
    for (const k of ['suit', 'mask', 'band', 'accent']) {
      if (c[k] && c[k] !== 'rainbow') this.mats[k].color.set(c[k]);
    }
    if (c.eyes && this.mats.eye) this.mats.eye.color.set(c.eyes);
    this.setDecals(c);
  }

  // Suit pattern (a texture painted in the suit colours) and stickers.
  setDecals(look) {
    const suit = this.mats.suit;
    const pattern = look.pattern && look.pattern !== 'none' ? patternTexture(look.pattern, look.suit, look.accent) : null;
    if (suit.map !== pattern) {
      suit.map = pattern;
      suit.needsUpdate = true;
    }
    // The texture carries the colour; rainbow suits still tint it every frame.
    if (pattern && look.suit !== 'rainbow') suit.color.set('#ffffff');
    for (const [key, m] of Object.entries(this.stickers)) {
      const id = look[key];
      m.visible = !!id && id !== 'none';
      if (m.visible && m.material.map !== stickerTexture(id)) {
        m.material.map = stickerTexture(id);
        m.material.needsUpdate = true;
      }
    }
  }

  // Simple two-bone IK: put the foot `drop` below the hip and `dx` to the side.
  setLeg(i, drop, dx = 0, dz = 0) {
    const leg = this.legs[i];
    const d = Math.min(LEG * 1.98, Math.hypot(drop, dx, dz));
    const bend = Math.acos(Math.min(1, d / (LEG * 2)));
    leg.thigh.rotation.set(-bend - Math.atan2(dz, drop), 0, Math.atan2(dx, drop));
    leg.knee.rotation.set(bend * 2, 0, 0);
    leg.foot.rotation.set(-bend + Math.atan2(dz, drop) * 0.5, 0, 0);
  }

  // Arm: raise = sideways lift (0 down, PI/2 straight out), swing = forward.
  setArm(i, raise, swing = 0, bend = 0.3, twist = 0) {
    const arm = this.arms[i];
    arm.shoulder.rotation.set(-swing, twist, arm.side * raise);
    arm.elbow.rotation.set(-bend, 0, 0);
  }

  // Headband tails flap faster at speed.
  updateTails(dt, speed) {
    this.tailTime += dt * (6 + speed * 0.5);
    for (const t of this.tails) {
      const f = this.tailTime + t.side;
      t.pivot.rotation.set(0.25 + Math.sin(f) * 0.25, t.side * 0.25 + Math.sin(f * 1.3) * 0.15, Math.sin(f * 0.7) * 0.2);
    }
  }

  // Reset to a neutral standing pose.
  neutral() {
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.hips.position.y = 0.66;
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.setLeg(0, 0.66, -0.02);
    this.setLeg(1, 0.66, 0.02);
    this.setArm(0, 0.25, 0, 0.2);
    this.setArm(1, 0.25, 0, 0.2);
  }
}
