// Longboard and hoverboard. Both are built along -Z (nose forward) with the top
// of the deck at `deckTop`. Colours are per-instance materials so the
// customize screen can recolour them live.

import { THREE, toon, addOutlines, dotTexture } from '../gfx.js';

const LEN = 1.2;   // deck length
const WID = 0.32;  // deck width

// Pintail outline: narrow nose and tail, wide middle.
function deckShape(len, wid, round = 0.5) {
  const s = new THREE.Shape();
  const hl = len / 2;
  const hw = wid / 2;
  s.moveTo(0, -hl);
  s.bezierCurveTo(hw * 1.1, -hl, hw, -hl * round, hw, 0);
  s.bezierCurveTo(hw, hl * round, hw * 1.1, hl, 0, hl);
  s.bezierCurveTo(-hw * 1.1, hl, -hw, hl * round, -hw, 0);
  s.bezierCurveTo(-hw, -hl * round, -hw * 1.1, -hl, 0, -hl);
  return s;
}

// Extrude in shape-space, then lay it flat: shape y -> world z, top at y=0.
function deckGeo(len, wid, thick, round) {
  const g = new THREE.ExtrudeGeometry(deckShape(len, wid, round), {
    depth: thick,
    bevelEnabled: true,
    bevelThickness: thick * 0.3,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 10,
  });
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

export class Board {
  constructor(type = 'longboard', outline = true) {
    this.root = new THREE.Group();
    this.tilt = new THREE.Group(); // carving and trick rotations go here
    this.root.add(this.tilt);
    this.mats = {
      deck: toon('#25252f', { unique: true }),
      wheels: toon('#ffe066', { unique: true }),
      under: toon('#00c2d1', { unique: true }),
      trim: toon('#ff2e7e', { unique: true }),
      metal: toon('#9aa3b5'),
      glowPad: new THREE.MeshBasicMaterial({ color: '#3de1ff' }),
      glowTrim: new THREE.MeshBasicMaterial({ color: '#ff2e7e' }),
    };
    this.outline = outline;
    this.wheels = [];
    this.time = 0;
    this.build(type);
  }

  build(type) {
    this.type = type;
    this.tilt.clear();
    if (this.groundGlow) this.root.remove(this.groundGlow);
    this.groundGlow = null;
    this.wheels = [];
    this.glows = [];
    const M = this.mats;
    if (type === 'hoverboard') {
      this.deckTop = 0.4;
      const deck = new THREE.Mesh(deckGeo(LEN * 1.06, WID * 1.15, 0.06, 0.62), M.deck);
      deck.position.y = this.deckTop;
      const under = new THREE.Mesh(deckGeo(LEN * 0.98, WID * 1.02, 0.05, 0.62), M.under);
      under.position.y = this.deckTop - 0.07;
      this.tilt.add(deck, under);
      // Neon edge (a thin glowing outline just under the deck lip).
      this.neon = new THREE.Mesh(deckGeo(LEN * 1.1, WID * 1.22, 0.015, 0.62), M.glowTrim);
      this.neon.position.y = this.deckTop - 0.055;
      this.tilt.add(this.neon);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, LEN * 0.8), M.trim);
      stripe.position.y = this.deckTop + 0.012;
      this.tilt.add(stripe);
      for (const z of [-0.34, 0.34]) {
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.06, 18), M.under);
        pad.position.set(0, this.deckTop - 0.12, z);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 18), M.glowPad);
        disc.position.set(0, this.deckTop - 0.16, z);
        this.tilt.add(pad, disc);
        this.glows.push(disc);
      }
      // Soft light on the ground under the board.
      const glowMat = new THREE.MeshBasicMaterial({
        map: dotTexture(), color: '#3de1ff', transparent: true, opacity: 0.55,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.groundGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.7), glowMat);
      this.groundGlow.rotation.x = -Math.PI / 2;
      this.groundGlow.position.y = 0.03;
      this.root.add(this.groundGlow);
    } else {
      this.deckTop = 0.19;
      const deck = new THREE.Mesh(deckGeo(LEN, WID, 0.03, 0.5), M.deck);
      deck.position.y = this.deckTop;
      const under = new THREE.Mesh(deckGeo(LEN * 0.97, WID * 0.94, 0.012, 0.5), M.under);
      under.position.y = this.deckTop - 0.035;
      this.tilt.add(deck, under);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, LEN * 0.85), M.trim);
      stripe.position.y = this.deckTop + 0.012;
      this.tilt.add(stripe);
      for (const z of [-0.4, 0.4]) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.14), M.metal);
        plate.position.set(0, this.deckTop - 0.06, z);
        const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6), M.metal);
        axle.rotation.z = Math.PI / 2;
        axle.position.set(0, 0.06, z);
        const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), M.trim);
        hanger.position.set(0, 0.08, z);
        this.tilt.add(plate, axle, hanger);
        for (const x of [-0.15, 0.15]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.055, 14), M.wheels);
          w.rotation.z = Math.PI / 2;
          w.position.set(x, 0.06, z);
          this.tilt.add(w);
          this.wheels.push(w);
        }
      }
      this.neon = null;
    }
    for (const o of this.tilt.children) o.castShadow = true;
    if (this.outline) addOutlines(this.tilt, 0.012);
  }

  setLook(look) {
    if (look.board !== this.type) this.build(look.board);
    for (const k of ['deck', 'wheels', 'under', 'trim']) if (look[k] !== 'rainbow') this.mats[k].color.set(look[k]);
    if (look.wheels !== 'rainbow') this.mats.glowPad.color.set(look.wheels);
    if (look.trim !== 'rainbow') this.mats.glowTrim.color.set(look.trim);
    if (this.neon) this.neon.visible = !!look.neon;
    if (this.groundGlow) {
      this.groundGlow.material.color.set(look.neon && look.trim !== 'rainbow' ? look.trim : look.wheels === 'rainbow' ? '#3de1ff' : look.wheels);
    }
  }

  // speed in m/s; grounded affects the hover bob and ground glow.
  update(dt, speed, airborne = false) {
    this.time += dt;
    for (const w of this.wheels) w.rotation.x -= (speed / 0.06) * dt;
    if (this.type === 'hoverboard') {
      const bob = Math.sin(this.time * 5) * 0.03;
      this.tilt.position.y = bob;
      const pulse = 0.85 + Math.sin(this.time * 18) * 0.15;
      for (const g of this.glows) g.scale.set(pulse, 1, pulse);
      if (this.groundGlow) {
        this.groundGlow.visible = !airborne;
        this.groundGlow.material.opacity = 0.45 + Math.sin(this.time * 9) * 0.1;
      }
    }
  }
}
