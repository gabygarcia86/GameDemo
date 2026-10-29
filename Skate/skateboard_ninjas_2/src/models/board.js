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

const WHITE = new THREE.Color('#ffffff');
// Additive glowing material (each piece gets its own so colours can animate).
const additive = (opacity) => new THREE.MeshBasicMaterial({
  color: '#ffffff', transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});

export class Board {
  constructor(type = 'longboard', outline = true) {
    this.root = new THREE.Group();
    this.tilt = new THREE.Group(); // carving and trick rotations go here
    this.root.add(this.tilt);
    // Light cast on the road (glow + pulse rings). The Player puts this on its
    // un-leaning group and tilts it to the road's slope so it never clips.
    this.ground = new THREE.Group();
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
    this.ground.clear();
    this.groundGlow = null;
    this.rings = [];
    this.thrusters = [];
    this.runners = [];
    this.halo = null;
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
        // Thruster jet: an additive cone of light pointing at the road.
        const jet = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1, 18, 1, true), additive(0.6));
        jet.geometry.translate(0, -0.5, 0);
        jet.position.set(0, this.deckTop - 0.17, z);
        this.tilt.add(jet);
        this.thrusters.push(jet);
      }
      // Soft neon halo around the edge, and two running lights chasing round it.
      this.halo = new THREE.Mesh(deckGeo(LEN * 1.18, WID * 1.42, 0.05, 0.62), additive(0.35));
      this.halo.position.y = this.deckTop - 0.045;
      this.tilt.add(this.halo);
      for (let i = 0; i < 2; i++) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        const flare = new THREE.Sprite(new THREE.SpriteMaterial({
          map: dotTexture(), color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        flare.scale.set(0.3, 0.3, 1);
        dot.add(flare);
        this.tilt.add(dot);
        this.runners.push({ dot, flare, phase: i * Math.PI });
      }
      // Pulse rings rippling out across the road.
      for (let i = 0; i < 2; i++) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.5, 40), additive(0));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.06;
        ring.renderOrder = 2; // after the player's blob shadow, so it isn't darkened
        this.ground.add(ring);
        this.rings.push({ mesh: ring, phase: i * 0.5 });
      }
      for (const o of [this.halo, ...this.thrusters, ...this.runners.map((r) => r.dot)]) {
        o.userData.noOutline = true;
        o.userData.light = true; // glowing light, so no shadow
      }
      // Soft light on the ground under the board.
      const glowMat = new THREE.MeshBasicMaterial({
        map: dotTexture(), color: '#3de1ff', transparent: true, opacity: 0.55,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.groundGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.1), glowMat);
      this.groundGlow.rotation.x = -Math.PI / 2;
      this.groundGlow.position.y = 0.05;
      this.groundGlow.renderOrder = 2;
      this.ground.add(this.groundGlow);
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
    for (const o of this.tilt.children) o.castShadow = !o.userData.light;
    if (this.outline) addOutlines(this.tilt, 0.012);
  }

  setLook(look) {
    if (look.board !== this.type) this.build(look.board);
    for (const k of ['deck', 'wheels', 'under', 'trim']) if (look[k] !== 'rainbow') this.mats[k].color.set(look[k]);
    if (look.wheels !== 'rainbow') this.mats.glowPad.color.set(look.wheels);
    if (look.trim !== 'rainbow') this.mats.glowTrim.color.set(look.trim);
    if (this.neon) this.neon.visible = !!look.neon;
    if (this.halo) this.halo.visible = !!look.neon;
    for (const r of this.runners || []) r.dot.visible = !!look.neon;
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
      const t = this.time;
      const sp = Math.min(1, speed / 40);
      const pad = this.mats.glowPad.color;
      const trim = this.mats.glowTrim.color;
      const pulse = 0.85 + Math.sin(t * 18) * 0.15;
      for (const g of this.glows) g.scale.set(pulse, 1, pulse);
      // Thrusters flicker and stretch out with speed.
      this.thrusters.forEach((j, i) => {
        const flick = 0.8 + Math.sin(t * 37 + i * 2) * 0.12 + Math.random() * 0.12;
        j.scale.set(0.9 + sp * 0.4, (0.16 + sp * 0.14) * flick + bob, 0.9 + sp * 0.4);
        j.material.color.copy(pad);
        j.material.opacity = 0.55 + flick * 0.3;
      });
      // Neon halo breathes; running lights chase round the rim, faster at speed.
      if (this.halo) {
        this.halo.material.color.copy(trim);
        this.halo.material.opacity = 0.28 + (Math.sin(t * 3) * 0.5 + 0.5) * 0.25 + sp * 0.1;
      }
      const a = (WID * 1.22) / 2 + 0.005;
      const b = (LEN * 1.1) / 2 + 0.005;
      for (const r of this.runners) {
        const u = t * (2.2 + sp * 4) + r.phase;
        const c = Math.cos(u), s = Math.sin(u);
        r.dot.position.set(a * Math.sign(c) * Math.abs(c) ** 0.35, this.deckTop - 0.05, b * Math.sign(s) * Math.abs(s) ** 0.35);
        r.flare.material.color.copy(trim).lerp(WHITE, 0.4);
        r.flare.material.opacity = 0.8 + Math.sin(t * 20 + r.phase) * 0.2;
      }
      // Ground glow and rings fade out as you lift off the road.
      const near = airborne ? 0.25 : 1;
      if (this.groundGlow) {
        this.groundGlow.visible = true;
        this.groundGlow.material.opacity = (0.7 + Math.sin(t * 9) * 0.12) * near;
      }
      for (const r of this.rings) {
        const k = (t * 1.3 + r.phase) % 1;
        r.mesh.scale.setScalar(0.6 + k * 1.6);
        r.mesh.material.color.copy(pad);
        // Fade fast so a spreading ring never turns into a dull haze.
        r.mesh.material.opacity = (1 - k) ** 2.5 * 0.9 * near;
      }
    }
  }
}
