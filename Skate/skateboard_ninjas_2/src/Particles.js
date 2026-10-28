// Particles live in lane space (x, y, dist) like everything else and are
// projected through the track bend each frame. Two pools: soft dots (smoke,
// sparks, confetti, snow spray) and little shuriken-shaped stars.
// Also: floating comic words ("POW!", "POOF!") as sprites.

import { THREE, dotTexture, starTexture, burstTexture, POINT_SCALE } from './gfx.js';
import { easeOutBack } from './utils.js';

const _v = new THREE.Vector3();
const _c = new THREE.Color();

class Pool {
  constructor(scene, max, texture, blending) {
    this.max = max;
    this.n = 0;
    // x, y, d, vx, vy, vd, life, maxLife, size, grow, gravity, drag
    this.f = new Float32Array(max * 12);
    this.col = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.cAttr = new Float32Array(max * 3);
    this.sAttr = new Float32Array(max);
    this.aAttr = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.cAttr, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.sAttr, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.aAttr, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, scale: POINT_SCALE },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float scale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * scale / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
          vColor = aColor;
          vAlpha = aAlpha;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          if (t.a * vAlpha < 0.02) discard;
          gl_FragColor = vec4(vColor, t.a * vAlpha);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  spawn(x, y, d, vx, vy, vd, life, size, color, gravity = 0, drag = 0, grow = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const f = this.f;
    const k = i * 12;
    f[k] = x; f[k + 1] = y; f[k + 2] = d;
    f[k + 3] = vx; f[k + 4] = vy; f[k + 5] = vd;
    f[k + 6] = life; f[k + 7] = life; f[k + 8] = size; f[k + 9] = grow;
    f[k + 10] = gravity; f[k + 11] = drag;
    _c.set(color);
    this.col[i * 3] = _c.r; this.col[i * 3 + 1] = _c.g; this.col[i * 3 + 2] = _c.b;
  }

  update(dt, track) {
    const f = this.f;
    let i = 0;
    while (i < this.n) {
      const k = i * 12;
      f[k + 6] -= dt;
      if (f[k + 6] <= 0) {
        // Swap-remove with the last live particle.
        const last = --this.n;
        if (i !== last) {
          f.copyWithin(k, last * 12, last * 12 + 12);
          this.col.copyWithin(i * 3, last * 3, last * 3 + 3);
        }
        continue;
      }
      const drag = Math.exp(-f[k + 11] * dt);
      f[k + 3] *= drag; f[k + 4] *= drag; f[k + 5] *= drag;
      f[k + 4] -= f[k + 10] * dt;
      f[k] += f[k + 3] * dt; f[k + 1] += f[k + 4] * dt; f[k + 2] += f[k + 5] * dt;
      f[k + 8] += f[k + 9] * dt;
      track.toWorld(f[k], f[k + 1], f[k + 2], _v);
      this.pos[i * 3] = _v.x; this.pos[i * 3 + 1] = _v.y; this.pos[i * 3 + 2] = _v.z;
      this.cAttr[i * 3] = this.col[i * 3]; this.cAttr[i * 3 + 1] = this.col[i * 3 + 1]; this.cAttr[i * 3 + 2] = this.col[i * 3 + 2];
      const t = f[k + 6] / f[k + 7];
      this.sAttr[i] = Math.max(0, f[k + 8]);
      this.aAttr[i] = Math.min(1, t * 2.2);
      i++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) g.attributes[name].needsUpdate = true;
  }

  clear() {
    this.n = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);
const CONFETTI = ['#ff2e55', '#ffe066', '#3de1ff', '#4dff9a', '#ff8c1a', '#b84dff', '#ffffff'];

export class Particles {
  constructor(scene) {
    this.scale = 1;
    this.dots = new Pool(scene, 1400, dotTexture(), THREE.NormalBlending);
    this.glows = new Pool(scene, 700, dotTexture(), THREE.AdditiveBlending);
    this.stars = new Pool(scene, 300, starTexture(), THREE.NormalBlending);
    this.words = [];
    this.scene = scene;
  }

  setQuality(q) {
    this.scale = q === 'low' ? 0.5 : q === 'medium' ? 0.75 : 1;
  }

  n(count) {
    return Math.max(1, Math.round(count * this.scale));
  }

  // The big cartoon "pop" when an enemy is defeated: smoke, confetti, stars.
  poof(x, y, d, speed, colors = CONFETTI) {
    for (let i = 0; i < this.n(18); i++) {
      this.dots.spawn(x + rnd(-0.4, 0.4), y + rnd(0.3, 1.6), d + rnd(-0.3, 0.3), rnd(-2.5, 2.5), rnd(0.5, 3), speed * 0.7 + rnd(-2, 2), rnd(0.5, 0.9), rnd(0.7, 1.3), '#f4f0ff', -0.5, 2.5, 1.4);
    }
    for (let i = 0; i < this.n(36); i++) {
      this.dots.spawn(x, y + 1, d, rnd(-6, 6), rnd(2, 9), speed * 0.6 + rnd(-5, 5), rnd(0.7, 1.3), rnd(0.12, 0.22), colors[i % colors.length], 14, 1.2);
    }
    for (let i = 0; i < this.n(12); i++) {
      this.stars.spawn(x, y + 1.2, d, rnd(-5, 5), rnd(3, 8), speed * 0.6 + rnd(-3, 3), rnd(0.6, 1.0), rnd(0.25, 0.4), i % 2 ? '#ffe066' : '#ffffff', 10, 1);
    }
  }

  // Shield break / big impact.
  shatter(x, y, d, speed, color = '#3de1ff') {
    for (let i = 0; i < this.n(40); i++) {
      this.glows.spawn(x, y + 1, d, rnd(-7, 7), rnd(-1, 7), speed + rnd(-4, 4), rnd(0.4, 0.8), rnd(0.15, 0.3), color, 8, 2);
    }
  }

  // Grinding sparks.
  sparks(x, y, d, speed) {
    for (let i = 0; i < this.n(3); i++) {
      this.glows.spawn(x + rnd(-0.1, 0.1), y, d - 0.3, rnd(-2, 2), rnd(1, 4), speed - rnd(4, 9), rnd(0.2, 0.4), rnd(0.06, 0.12), i % 2 ? '#ffd23f' : '#ff8c1a', 14, 1);
    }
  }

  // Dust or snow kicked up on landing.
  landing(x, d, speed, color) {
    for (let i = 0; i < this.n(14); i++) {
      this.dots.spawn(x + rnd(-0.5, 0.5), 0.1, d, rnd(-3, 3), rnd(0.5, 2), speed * 0.8, rnd(0.3, 0.6), rnd(0.2, 0.4), color, 2, 3, 0.8);
    }
  }

  // Hoverboard exhaust and longboard dust.
  trail(x, y, d, speed, color, glow = false) {
    const pool = glow ? this.glows : this.dots;
    pool.spawn(x + rnd(-0.12, 0.12), y, d - 0.1, rnd(-0.3, 0.3), rnd(-0.1, 0.4), speed - rnd(2, 6), rnd(0.25, 0.45), rnd(0.12, 0.22), color, 0, 2, glow ? -0.2 : 0.4);
  }

  coin(x, y, d, speed) {
    for (let i = 0; i < this.n(5); i++) {
      this.glows.spawn(x, y, d, rnd(-2, 2), rnd(0, 3), speed + rnd(-1, 1), rnd(0.2, 0.35), rnd(0.12, 0.2), '#ffe066', 4, 2);
    }
  }

  confetti(x, y, d, speed, count = 40) {
    for (let i = 0; i < this.n(count); i++) {
      this.dots.spawn(x + rnd(-1.5, 1.5), y + rnd(0, 2), d + rnd(1, 4), rnd(-4, 4), rnd(3, 8), speed + rnd(-2, 2), rnd(0.8, 1.5), rnd(0.1, 0.18), CONFETTI[i % CONFETTI.length], 9, 1);
    }
  }

  splash(x, y, d, speed, color) {
    for (let i = 0; i < this.n(16); i++) {
      this.dots.spawn(x, y, d, rnd(-3, 3), rnd(1, 4), speed * 0.5 + rnd(-3, 3), rnd(0.3, 0.6), rnd(0.12, 0.25), color, 12, 1);
    }
  }

  // Floating comic word at a spot in lane space.
  word(text, x, y, d, fill, ink) {
    const mat = new THREE.SpriteMaterial({ map: burstTexture(text, fill, ink), depthTest: false, transparent: true, fog: false });
    const s = new THREE.Sprite(mat);
    s.renderOrder = 20;
    this.scene.add(s);
    this.words.push({ s, x, y, d, t: 0, life: 0.85, rot: (Math.random() - 0.5) * 0.5 });
  }

  update(dt, track, speed) {
    this.dots.update(dt, track);
    this.glows.update(dt, track);
    this.stars.update(dt, track);
    for (let i = this.words.length - 1; i >= 0; i--) {
      const w = this.words[i];
      w.t += dt;
      w.d += speed * 0.75 * dt;
      w.y += dt * 1.2;
      const k = w.t / w.life;
      const sc = 1.6 * (k < 0.25 ? easeOutBack(k / 0.25) : 1);
      w.s.scale.set(sc, sc, 1);
      w.s.material.rotation = w.rot;
      w.s.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      track.toWorld(w.x, w.y, w.d, w.s.position);
      if (w.t >= w.life) {
        this.scene.remove(w.s);
        w.s.material.dispose();
        this.words.splice(i, 1);
      }
    }
  }

  clear() {
    this.dots.clear();
    this.glows.clear();
    this.stars.clear();
    for (const w of this.words) {
      this.scene.remove(w.s);
      w.s.material.dispose();
    }
    this.words = [];
  }
}
