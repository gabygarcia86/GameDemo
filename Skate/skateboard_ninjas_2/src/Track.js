// The visible world: road, terrain, water, sky, mountains, clouds, scenery,
// lighting and weather. It also owns the "bend": gameplay runs in straight
// lane space, and toWorld() maps (x, y, dist) to a world position on a
// winding, rolling, downhill road. The bend is quadratic in distance from the
// player, so the road right under the player is always straight and the
// curves only show up ahead (the classic endless-runner bend trick).

import { THREE, toonGradient, MATS, canvasTexture, dotTexture, POINT_SCALE } from './gfx.js';
import { CONFIG } from './config.js';
import { sceneryPrefab, SCENERY_INFO } from './models/props.js';
import { clamp, lerp, damp, fbm2, noise2, hash2, smoothstep, makeRng } from './utils.js';

const EDGE = CONFIG.road.halfWidth + 0.45; // where terrain starts
const ROW = CONFIG.road.rowLen;
const AHEAD = CONFIG.road.ahead;
const BEHIND = CONFIG.road.behind;
const ROWS = Math.ceil((AHEAD + BEHIND) / ROW) + 1;
// Terrain column offsets from the road edge (dense near, sparse far).
const COLS = [0, 1.2, 3, 6, 10, 16, 24, 34, 48, 66, 92, 130, 190];
const TILE = 8; // road texture repeat length

const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.origin = 0;      // player distance; everything is placed relative to it
    this.kx = 0;          // sideways bend
    this.ky = 0;          // hills
    this.tx = 0;
    this.ty = 0;
    this.bendTimer = 2;
    this.heading = 0;     // accumulated turning, spins the far background
    this.time = 0;
    this.rng = makeRng(12345);
    this.env = null;
    this.quality = 'high';
    this.rowCache = new Map();

    this.root = new THREE.Group();
    scene.add(this.root);
    this.buildRoad();
    this.buildTerrain();
    this.buildSky();
    this.buildLights();
    this.scenery = []; // { type, layer, mesh(es) }
    this.sceneryGroup = new THREE.Group();
    this.root.add(this.sceneryGroup);
  }

  // ------------------------------------------------------------ bending

  setBendInstant(kx = 0, ky = 0) {
    this.kx = this.tx = kx;
    this.ky = this.ty = ky;
  }

  toWorld(x, y, dist, out = _v) {
    const d = dist - this.origin;
    const dd = d * Math.abs(d) * (d < 0 ? 0.3 : 1); // gentler behind the player
    out.set(x + this.kx * dd, y - CONFIG.curve.slope * d + this.ky * dd, -d);
    return out;
  }

  // Heading of the road at a distance (radians, for yaw).
  yawAt(dist) {
    const d = Math.max(0, dist - this.origin);
    return -Math.atan(2 * this.kx * d);
  }

  pitchAt(dist) {
    const d = Math.max(0, dist - this.origin);
    return Math.atan(-CONFIG.curve.slope + 2 * this.ky * d);
  }

  // Put an Object3D at lane-space coordinates, turned to follow the road.
  // flat objects (ramps, gaps) also pitch with the slope.
  place(obj, x, y, dist, flat = false, extraYaw = 0) {
    this.toWorld(x, y, dist, obj.position);
    obj.rotation.set(flat ? this.pitchAt(dist) : 0, this.yawAt(dist) + extraYaw, 0, 'YXZ');
  }

  // Matrix version for instanced meshes.
  matrixAt(x, y, dist, yaw, scale, out, flat = false) {
    this.toWorld(x, y, dist, _v);
    _e.set(flat ? this.pitchAt(dist) : 0, this.yawAt(dist) + yaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    _s.set(scale, scale, scale);
    return out.compose(_v, _q, _s);
  }

  updateBend(dt, speed, live) {
    this.bendTimer -= dt;
    if (this.bendTimer <= 0 && live) {
      const [lo, hi] = CONFIG.curve.changeEvery;
      this.bendTimer = this.rng.range(lo, hi);
      const amount = this.env?.id === 'forest' || this.env?.id === 'snow' ? 1.15 : 0.85;
      // Sometimes go straight for a while.
      this.tx = this.rng.chance(0.2) ? 0 : this.rng.range(-1, 1) * CONFIG.curve.maxBend * amount;
      this.ty = this.rng.range(-1, 1) * CONFIG.curve.maxHill;
    }
    this.kx = damp(this.kx, this.tx, 0.35, dt);
    this.ky = damp(this.ky, this.ty, 0.35, dt);
    this.heading += 2 * this.kx * speed * dt;
  }

  // --------------------------------------------------------------- road

  buildRoad() {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(ROWS * 2 * 3);
    const uv = new Float32Array(ROWS * 2 * 2);
    const idx = [];
    for (let r = 0; r < ROWS - 1; r++) {
      const a = r * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const normals = new Float32Array(ROWS * 2 * 3);
    for (let i = 0; i < ROWS * 2; i++) normals[i * 3 + 1] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    this.roadMat = new THREE.MeshToonMaterial({ gradientMap: toonGradient() });
    this.road = new THREE.Mesh(g, this.roadMat);
    this.road.receiveShadow = true;
    this.road.frustumCulled = false;
    this.root.add(this.road);
  }

  makeRoadTextures(env) {
    const R = env.road;
    const W = 256, H = 512;
    const half = EDGE;              // texture spans -EDGE..EDGE
    const px = (x) => ((x + half) / (half * 2)) * W;
    const mPerPx = TILE / H;
    const lanes = CONFIG.lanes.width;
    const drawLines = (ctx, lineColor, edgeColor) => {
      // Dashed lane dividers.
      ctx.fillStyle = lineColor;
      for (const x of [-lanes / 2, lanes / 2]) {
        ctx.fillRect(px(x) - 3, 0, 6, 3 / mPerPx);
      }
      // Solid edge lines.
      ctx.fillStyle = edgeColor;
      for (const x of [-(CONFIG.road.halfWidth - 0.25), CONFIG.road.halfWidth - 0.25]) ctx.fillRect(px(x) - 4, 0, 8, H);
    };
    const rng = makeRng(env.id.length * 999);
    const map = canvasTexture(W, H, (ctx) => {
      ctx.fillStyle = R.base;
      ctx.fillRect(0, 0, W, H);
      // Asphalt speckle
      for (let i = 0; i < 2600; i++) {
        ctx.fillStyle = rng() < 0.5 ? R.speck : 'rgba(0,0,0,0.12)';
        ctx.fillRect(rng() * W, rng() * H, 2, 2);
      }
      if (R.snowy) {
        // Packed snow with tyre tracks.
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        for (let i = 0; i < 40; i++) ctx.fillRect(rng() * W, rng() * H, 10 + rng() * 40, 4 + rng() * 20);
        ctx.fillStyle = 'rgba(120,150,190,0.25)';
        for (const x of [-2.9, -1.7, -0.6, 0.6, 1.7, 2.9]) ctx.fillRect(px(x) - 5, 0, 10, H);
      }
      if (env.id === 'forest') {
        for (let i = 0; i < 60; i++) {
          ctx.fillStyle = ['#c96a2a', '#e0a040', '#8b5a2b'][i % 3];
          ctx.beginPath();
          ctx.ellipse(rng() * W, rng() * H, 3, 6, rng() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Cracks and tar snakes
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        let x = rng() * W, y = rng() * H;
        ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) ctx.lineTo((x += (rng() - 0.5) * 30), (y += rng() * 25));
        ctx.stroke();
      }
      drawLines(ctx, R.line, R.edge);
      // Curbs: alternating stripes on the outer strip.
      const stripe = H / TILE;
      for (let i = 0; i < TILE; i++) {
        ctx.fillStyle = R.curb[i % 2];
        ctx.fillRect(0, i * stripe, px(-CONFIG.road.halfWidth), stripe);
        ctx.fillRect(px(CONFIG.road.halfWidth), i * stripe, W - px(CONFIG.road.halfWidth), stripe);
      }
    });
    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.RepeatWrapping;
    let emissive = null;
    if (R.glow) {
      emissive = canvasTexture(W, H, (ctx) => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        drawLines(ctx, R.line, R.edge);
      });
      emissive.wrapT = THREE.RepeatWrapping;
    }
    return { map, emissive };
  }

  updateRoad() {
    const g = this.road.geometry;
    const pos = g.attributes.position.array;
    const uv = g.attributes.uv.array;
    const base = Math.floor((this.origin - BEHIND) / ROW) * ROW;
    for (let r = 0; r < ROWS; r++) {
      const D = base + r * ROW;
      for (let s = 0; s < 2; s++) {
        const x = s === 0 ? -EDGE : EDGE;
        this.toWorld(x, 0, D, _v);
        const i = r * 2 + s;
        pos[i * 3] = _v.x;
        pos[i * 3 + 1] = _v.y;
        pos[i * 3 + 2] = _v.z;
        uv[i * 2] = s;
        uv[i * 2 + 1] = D / TILE;
      }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
    g.computeBoundingSphere();
  }

  // ------------------------------------------------------------ terrain

  buildTerrain() {
    this.cols = [...COLS.map((u) => -(EDGE + u)).reverse(), ...COLS.map((u) => EDGE + u)];
    const C = this.cols.length;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROWS * C * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ROWS * C * 3), 3));
    const idx = [];
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < C - 1; c++) {
        if (this.cols[c] < 0 && this.cols[c + 1] > 0) continue; // no terrain under the road
        const a = r * C + c, b = a + 1, d = a + C, e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    g.setIndex(idx);
    // Flat-shaded Lambert: faceted low-poly hills, normals come from the faces.
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.terrain = new THREE.Mesh(g, this.terrainMat);
    this.terrain.receiveShadow = true;
    this.terrain.frustumCulled = false;
    this.root.add(this.terrain);

    // Water strip for the beach (one side only).
    const wg = new THREE.BufferGeometry();
    const WC = 3;
    wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROWS * WC * 3), 3));
    const widx = [];
    for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < WC - 1; c++) {
      const a = r * WC + c;
      widx.push(a, a + WC, a + 1, a + 1, a + WC, a + WC + 1);
    }
    wg.setIndex(widx);
    this.waterMat = new THREE.MeshToonMaterial({ color: '#1fb5e0', gradientMap: toonGradient(), transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    this.water = new THREE.Mesh(wg, this.waterMat);
    this.water.frustumCulled = false;
    this.water.visible = false;
    this.root.add(this.water);
  }

  // Exact terrain function. u = metres past the road edge.
  heightFn(x, D) {
    const T = this.env.terrain;
    const u = Math.max(0, Math.abs(x) - EDGE);
    const side = x < 0 ? -1 : 1;
    const near = smoothstep(0.8, 3.5, u);
    const bumps = (noise2(x * 0.35, D * 0.35) - 0.5) * 0.5 * near;
    const n = fbm2(x * 0.018 + side * 50, D * 0.011, 3);
    let y;
    switch (T.profile) {
      case 'mountain':
        y = smoothstep(1.5, 50, u) * T.hill * (0.45 + n * 1.3) + u * 0.1 + bumps;
        break;
      case 'canyon': {
        const raw = smoothstep(1, 40, u) * T.hill * (0.5 + n * 1.1) + u * 0.04;
        const step = 2.6;
        const k = Math.floor(raw / step);
        y = k * step + smoothstep(0.65, 1, raw / step - k) * step + bumps * 0.5;
        break;
      }
      case 'beach':
        if (side === this.env.water?.side) {
          y = -smoothstep(1.5, 16, u) * 3.4 + (noise2(x * 0.1, D * 0.05) - 0.5) * 0.4 * near;
        } else {
          y = smoothstep(2, 35, u) * T.hill * (0.4 + n) + bumps;
        }
        break;
      default:
        y = smoothstep(1.5, 32, u) * T.hill * (0.35 + n * 1.0) + u * 0.03 + bumps;
    }
    return u < 0.6 ? -0.06 : y - 0.06;
  }

  // Height on the mesh as drawn (linear between columns), for placing props.
  heightAt(x, D) {
    const cols = this.cols;
    if (x <= cols[0]) return this.heightFn(cols[0], D);
    if (x >= cols[cols.length - 1]) return this.heightFn(cols[cols.length - 1], D);
    for (let c = 0; c < cols.length - 1; c++) {
      if (x >= cols[c] && x <= cols[c + 1]) {
        const t = (x - cols[c]) / (cols[c + 1] - cols[c]);
        return lerp(this.heightFn(cols[c], D), this.heightFn(cols[c + 1], D), t);
      }
    }
    return 0;
  }

  colorFor(x, y, D, out) {
    const T = this.env.terrain;
    const u = Math.abs(x) - EDGE;
    if (u < 1.0) return out.set(T.shoulder);
    const n = noise2(x * 0.15, D * 0.15);
    const t = clamp(y / Math.max(1, T.hill), 0, 1);
    out.set(T.low).lerp(_c2.set(T.mid), n);
    out.lerp(_c2.set(T.high), smoothstep(0.35, 1, t) * 0.8);
    if (T.profile === 'canyon') {
      const band = Math.floor(y / 2.6) % 2;
      if (band) out.lerp(_c2.set(T.high), 0.45);
    }
    if (T.snowLine && y > T.snowLine * (0.8 + n * 0.4)) out.set('#ffffff');
    if (T.profile === 'beach') {
      const side = x < 0 ? -1 : 1;
      if (side === this.env.water?.side) out.set(T.low).lerp(_c2.set('#e0c07a'), smoothstep(-0.5, -2.5, y));
      else if (u < 6) out.set(T.low).lerp(_c2.set(T.mid), n);
    }
    return out;
  }

  rowData(D) {
    let row = this.rowCache.get(D);
    if (row) return row;
    const C = this.cols.length;
    row = { h: new Float32Array(C), c: new Float32Array(C * 3) };
    for (let c = 0; c < C; c++) {
      const x = this.cols[c];
      const y = this.heightFn(x, D);
      row.h[c] = y;
      this.colorFor(x, y, D, _c);
      row.c[c * 3] = _c.r;
      row.c[c * 3 + 1] = _c.g;
      row.c[c * 3 + 2] = _c.b;
    }
    this.rowCache.set(D, row);
    return row;
  }

  updateTerrain() {
    const g = this.terrain.geometry;
    const pos = g.attributes.position.array;
    const col = g.attributes.color.array;
    const C = this.cols.length;
    const base = Math.floor((this.origin - BEHIND) / ROW) * ROW;
    for (let r = 0; r < ROWS; r++) {
      const D = base + r * ROW;
      const row = this.rowData(D);
      for (let c = 0; c < C; c++) {
        this.toWorld(this.cols[c], row.h[c], D, _v);
        const i = (r * C + c) * 3;
        pos[i] = _v.x;
        pos[i + 1] = _v.y;
        pos[i + 2] = _v.z;
        col[i] = row.c[c * 3];
        col[i + 1] = row.c[c * 3 + 1];
        col[i + 2] = row.c[c * 3 + 2];
      }
    }
    // Forget rows that scrolled behind us.
    for (const key of this.rowCache.keys()) if (key < base) this.rowCache.delete(key);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;

    if (this.water.visible) {
      const W = this.env.water;
      const wp = this.water.geometry.attributes.position.array;
      const xs = [W.side * (EDGE + 6), W.side * (EDGE + 60), W.side * 700];
      for (let r = 0; r < ROWS; r++) {
        const D = base + r * ROW;
        for (let c = 0; c < 3; c++) {
          const wave = c === 0 ? Math.sin(this.time * 1.6 + D * 0.15) * 0.08 : 0;
          this.toWorld(xs[c], W.level + wave, D, _v);
          const i = (r * 3 + c) * 3;
          wp[i] = _v.x;
          wp[i + 1] = _v.y;
          wp[i + 2] = _v.z;
        }
      }
      this.water.geometry.attributes.position.needsUpdate = true;
      this.water.geometry.computeVertexNormals();
    }
  }

  // ---------------------------------------------------------------- sky

  buildSky() {
    const uniforms = {
      top: { value: new THREE.Color() },
      mid: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      bottom: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() },
      glowColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 0.3, -1) },
      sunSize: { value: 0.05 },
      moon: { value: 0 },
    };
    this.skyMat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top, mid, horizon, bottom, sunColor, glowColor, sunDir;
        uniform float sunSize, moon;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col;
          if (h > 0.0) {
            col = mix(horizon, mid, smoothstep(0.0, 0.2, h));
            col = mix(col, top, smoothstep(0.2, 0.85, h));
          } else {
            col = mix(horizon, bottom, smoothstep(0.0, -0.2, h));
          }
          vec3 sd3 = normalize(sunDir);
          float sd = dot(d, sd3);
          float g = pow(max(sd, 0.0), 10.0) * 0.35 + pow(max(sd, 0.0), 80.0) * 0.6;
          col += glowColor * g;
          float disc = smoothstep(cos(sunSize), cos(sunSize * 0.82), sd);
          vec3 dc = sunColor;
          if (moon > 0.5) {
            float c1 = smoothstep(0.9995, 0.99985, dot(d, normalize(sd3 + vec3(0.018, 0.012, 0.0))));
            float c2 = smoothstep(0.9997, 0.9999, dot(d, normalize(sd3 + vec3(-0.015, -0.02, 0.01))));
            dc = mix(sunColor, sunColor * 0.78, max(c1, c2));
          }
          col = mix(col, dc, disc);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this.backdrop = new THREE.Group(); // mountains, clouds, stars: follow camera, spin with heading
    this.scene.add(this.backdrop);
  }

  buildMountains(env) {
    const M = env.mountains;
    const fog = new THREE.Color(env.fog.color);
    const make = (radius, height, color, seed, snow) => {
      const N = 120;
      const pos = [];
      const col = [];
      const base = new THREE.Color(color);
      const snowC = new THREE.Color('#ffffff');
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        // Sample noise around a circle so the ring joins up without a seam.
        const n = fbm2(Math.cos(a) * 2.3 + seed, Math.sin(a) * 2.3 + seed, 4);
        const h = (20 + Math.pow(n, 1.6) * height * 2.2) * M.scale;
        const x = Math.sin(a) * radius, z = -Math.cos(a) * radius;
        pos.push(x, -60, z, x, h, z);
        col.push(fog.r, fog.g, fog.b);
        const top = snow && h > height * 0.75 * M.scale ? snowC : base;
        col.push(top.r, top.g, top.b);
      }
      const idx = [];
      for (let i = 0; i < N; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      return m;
    };
    this.backdrop.add(make(1150, 150, M.far, 3.1, M.snow));
    this.backdrop.add(make(820, 85, M.near, 7.7, M.snow));
  }

  buildClouds(env) {
    const tex = canvasTexture(256, 128, (ctx, w, h) => {
      for (let i = 0; i < 9; i++) {
        const x = 40 + (i / 8) * 176, y = 70 + Math.sin(i * 1.7) * 14;
        const r = 26 + Math.sin(i * 2.3 + 1) * 10 + (i > 2 && i < 6 ? 14 : 0);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const rng = makeRng(env.id.length * 77);
    for (let i = 0; i < env.clouds.count; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: env.clouds.color, fog: false, depthWrite: false, transparent: true, opacity: 0.9 });
      const s = new THREE.Sprite(mat);
      const a = rng() * Math.PI * 2;
      const r = 700 + rng() * 300;
      s.position.set(Math.sin(a) * r, 110 + rng() * 170, -Math.cos(a) * r);
      const sc = 160 + rng() * 180;
      s.scale.set(sc, sc * 0.45, 1);
      s.renderOrder = -5;
      this.backdrop.add(s);
    }
  }

  buildStars() {
    const N = 700;
    const pos = new Float32Array(N * 3);
    const rng = makeRng(99);
    for (let i = 0; i < N; i++) {
      const a = rng() * Math.PI * 2;
      const y = 0.08 + rng() * 0.92;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.sin(a) * r * 1300, y * 1300, -Math.cos(a) * r * 1300], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false, depthWrite: false });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = -8;
    this.backdrop.add(pts);
  }

  // ------------------------------------------------------------- lights

  buildLights() {
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.shadow.camera.left = -22;
    this.sun.shadow.camera.right = 22;
    this.sun.shadow.camera.top = 30;
    this.sun.shadow.camera.bottom = -14;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 140;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0, 1, 0);
  }

  setShadows(enabled, size) {
    this.sun.castShadow = enabled;
    if (enabled && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
  }

  // ------------------------------------------------------------ scenery

  clearScenery() {
    for (const s of this.scenery) {
      for (const m of s.meshes) {
        this.sceneryGroup.remove(m);
        m.dispose?.();
      }
    }
    this.scenery = [];
  }

  addInstanced(type, built, max, opts = {}) {
    const meshes = [];
    if (built.lit) {
      const m = new THREE.InstancedMesh(built.lit, opts.material || MATS.lit, max);
      m.castShadow = !!opts.cast;
      m.receiveShadow = false;
      meshes.push(m);
    }
    if (built.glow) meshes.push(new THREE.InstancedMesh(built.glow, MATS.glow, max));
    for (const m of meshes) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.sceneryGroup.add(m);
    }
    const layer = { type, meshes, n: 0, max };
    this.scenery.push(layer);
    return layer;
  }

  buildScenery(env) {
    this.clearScenery();
    this.layers = {};
    const dense = this.quality === 'low' ? 0.6 : this.quality === 'medium' ? 0.85 : 1;
    const types = new Set([...env.scenery.near, ...env.scenery.far]);
    if (env.lamps) types.add('lamp');
    for (const t of types) {
      const big = SCENERY_INFO[t].r > 3;
      this.layers[t] = this.addInstanced(t, sceneryPrefab(t, env), 140, { cast: !big && this.quality === 'high' });
    }
    // Plans for the deterministic slot layout.
    const forest = env.id === 'forest';
    this.slotPlans = [
      { layer: 'near', spacing: (forest ? 3.2 : 5.5) / dense, from: 1.4, to: 11, skip: forest ? 0.1 : 0.3, list: env.scenery.near },
      // Mid layer: near props plus the smaller far ones (no barns or mesas by the road).
      { layer: 'mid', spacing: (forest ? 5 : 9) / dense, from: 11, to: 30, skip: 0.25, list: env.scenery.near.concat(env.scenery.far.filter((t) => SCENERY_INFO[t].r < 3.4)) },
      { layer: 'far', spacing: 16 / dense, from: 30, to: 85, skip: 0.3, list: env.scenery.far },
    ];
    // Night lamps + light pools on the road.
    this.poolLayer = null;
    if (env.lamps) {
      const mat = new THREE.MeshBasicMaterial({
        map: dotTexture(), color: '#ffd98a', transparent: true, opacity: 0.4,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const g = new THREE.PlaneGeometry(5, 5);
      g.rotateX(-Math.PI / 2);
      this.poolLayer = this.addInstanced('pool', { lit: g, glow: null }, 40, { material: mat });
    }
    // Forest sunbeams: tall additive planes.
    this.beams = null;
    if (env.sunbeams) {
      const tex = canvasTexture(64, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(255,250,210,0.9)');
        g.addColorStop(1, 'rgba(255,250,210,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        const s = ctx.createLinearGradient(0, 0, w, 0);
        s.addColorStop(0, 'rgba(0,0,0,1)');
        s.addColorStop(0.5, 'rgba(0,0,0,0)');
        s.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = s;
        ctx.fillRect(0, 0, w, h);
      });
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.22, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      });
      const g = new THREE.PlaneGeometry(3.5, 26);
      g.translate(0, 13, 0);
      g.rotateZ(0.35);
      this.beams = this.addInstanced('beam', { lit: g, glow: null }, 24, { material: mat });
    }
  }

  updateScenery() {
    const env = this.env;
    for (const l of this.scenery) l.n = 0;
    const start = this.origin - BEHIND;
    const end = this.origin + AHEAD;
    const push = (layer, x, y, D, yaw, scale, flat = false) => {
      if (layer.n >= layer.max) return;
      this.matrixAt(x, y, D, yaw, scale, _m, flat);
      for (const m of layer.meshes) m.setMatrixAt(layer.n, _m);
      layer.n++;
    };
    const seed = env.id.length * 131;
    for (let p = 0; p < this.slotPlans.length; p++) {
      const plan = this.slotPlans[p];
      const first = Math.floor(start / plan.spacing);
      const last = Math.ceil(end / plan.spacing);
      for (let i = first; i <= last; i++) {
        for (const side of [-1, 1]) {
          const h = hash2(i * 2 + (side > 0 ? 1 : 0), seed + p * 17);
          if (h < plan.skip) continue;
          const type = plan.list[Math.floor(hash2(i, seed + p * 29 + side * 3) * plan.list.length)];
          const info = SCENERY_INFO[type];
          if (!this.layers[type]) continue;
          // Big things stay away from the road.
          const from = Math.max(plan.from, info.r + 0.6);
          if (from >= plan.to) continue;
          const u = lerp(from, plan.to, hash2(i, seed + p * 41 + side * 7));
          const x = side * (EDGE + u);
          // Keep the beach's sea side clear except for close props.
          if (env.water && side === env.water.side && u > 5) continue;
          const D = i * plan.spacing + (hash2(i, seed + 5) - 0.5) * plan.spacing * 0.6;
          if (D < start || D > end) continue;
          let yaw = hash2(i, seed + 99) * Math.PI * 2;
          if (type === 'fence') yaw = Math.PI / 2;
          if (type === 'house' || type === 'cabin' || type === 'barn' || type === 'hutProp') yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          const scale = type === 'mesa' ? 0.8 + h * 0.8 : 0.8 + hash2(i, seed + 7) * 0.5;
          push(this.layers[type], x, this.heightAt(x, D) - 0.05, D, yaw, scale);
        }
      }
    }
    if (env.lamps) {
      const sp = 26;
      for (let i = Math.floor(start / sp); i <= Math.ceil(end / sp); i++) {
        const side = i % 2 ? 1 : -1;
        const D = i * sp;
        const x = side * (CONFIG.road.halfWidth + 0.9);
        push(this.layers.lamp, x, 0, D, side > 0 ? 0 : Math.PI, 1);
        if (this.poolLayer) push(this.poolLayer, side * (CONFIG.road.halfWidth - 0.6), 0.03, D, 0, 1, true);
      }
    }
    if (this.beams) {
      const sp = 22;
      for (let i = Math.floor(start / sp); i <= Math.ceil(end / sp); i++) {
        if (hash2(i, 555) < 0.35) continue;
        const side = hash2(i, 556) < 0.5 ? -1 : 1;
        const x = side * (2 + hash2(i, 557) * 9);
        push(this.beams, x, 0, i * sp, 0.3 * side + Math.PI / 2 * 0.2, 1);
      }
    }
    for (const l of this.scenery) {
      for (const m of l.meshes) {
        m.count = l.n;
        m.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // ------------------------------------------------------------ weather

  buildWeather(env) {
    if (this.weather) {
      this.scene.remove(this.weather);
      this.weather.geometry.dispose();
    }
    const W = env.weather;
    const scale = this.quality === 'low' ? 0.5 : this.quality === 'medium' ? 0.75 : 1;
    const N = Math.round(W.count * scale);
    const rel = new Float32Array(N * 3); // x, y, d relative to the player
    const vel = new Float32Array(N * 3);
    const phase = new Float32Array(N);
    const rng = makeRng(4242);
    const snow = W.type === 'snow';
    for (let i = 0; i < N; i++) {
      rel[i * 3] = rng.range(-26, 26);
      rel[i * 3 + 1] = rng.range(snow ? 0 : 0.3, snow ? 16 : 6);
      rel[i * 3 + 2] = rng.range(-6, 110);
      vel[i * 3] = rng.range(-0.4, 0.4);
      vel[i * 3 + 1] = snow ? -rng.range(1.5, 3.2) : rng.range(-0.2, 0.25);
      vel[i * 3 + 2] = rng.range(-0.3, 0.3);
      phase[i] = rng() * 10;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const size = { snow: 0.22, fireflies: 0.3, dust: 0.12, pollen: 0.12, sparkle: 0.18, motes: 0.13 }[W.type] || 0.15;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: dotTexture() },
        color: { value: new THREE.Color(W.color) },
        size: { value: size },
        time: { value: 0 },
        twinkle: { value: W.type === 'fireflies' || W.type === 'sparkle' ? 1 : 0 },
        scale: POINT_SCALE,
      },
      vertexShader: `
        attribute float aPhase;
        uniform float size, time, twinkle, scale;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (scale / -mv.z);
          gl_Position = projectionMatrix * mv;
          vA = mix(0.85, 0.2 + 0.8 * pow(0.5 + 0.5 * sin(time * 3.0 + aPhase * 5.0), 3.0), twinkle);
        }`,
      fragmentShader: `
        uniform sampler2D map;
        uniform vec3 color;
        varying float vA;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(color, t.a * vA);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: W.type === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.weather = new THREE.Points(g, mat);
    this.weather.frustumCulled = false;
    this.weatherData = { rel, vel, N, type: W.type };
    this.scene.add(this.weather);
  }

  updateWeather(dt, speed) {
    if (!this.weather) return;
    const { rel, vel, N, type } = this.weatherData;
    const pos = this.weather.geometry.attributes.position.array;
    const snow = type === 'snow';
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      rel[k] += vel[k] * dt + (snow ? Math.sin(this.time + i) * 0.3 * dt : 0);
      rel[k + 1] += vel[k + 1] * dt;
      rel[k + 2] -= speed * dt * (snow ? 1 : 0.98) - vel[k + 2] * dt;
      if (rel[k + 2] < -8 || rel[k + 1] < -0.5 || rel[k + 1] > 18) {
        rel[k + 2] = 90 + Math.random() * 25;
        rel[k + 1] = snow ? 6 + Math.random() * 10 : 0.3 + Math.random() * 5;
        rel[k] = (Math.random() - 0.5) * 52;
      }
      const D = this.origin + rel[k + 2];
      this.toWorld(rel[k], rel[k + 1] + (snow ? 0 : Math.max(0, this.heightAt(rel[k], D))), D, _v);
      pos[k] = _v.x;
      pos[k + 1] = _v.y;
      pos[k + 2] = _v.z;
    }
    this.weather.geometry.attributes.position.needsUpdate = true;
    this.weather.material.uniforms.time.value = this.time;
  }

  // ---------------------------------------------------------- environment

  setEnvironment(env, quality) {
    this.env = env;
    this.quality = quality;
    this.rowCache.clear();
    const { map, emissive } = this.makeRoadTextures(env);
    this.roadMat.map?.dispose();
    this.roadMat.emissiveMap?.dispose();
    this.roadMat.map = map;
    this.roadMat.emissiveMap = emissive;
    this.roadMat.emissive.set(emissive ? '#ffffff' : '#000000');
    this.roadMat.needsUpdate = true;

    this.water.visible = !!env.water;
    if (env.water) this.waterMat.color.set(env.water.color);

    const U = this.skyMat.uniforms;
    U.top.value.set(env.sky.top);
    U.mid.value.set(env.sky.mid);
    U.horizon.value.set(env.sky.horizon);
    U.bottom.value.set(env.sky.bottom);
    U.sunColor.value.set(env.sun.color);
    U.glowColor.value.set(env.sun.glow);
    U.sunSize.value = env.sun.size;
    U.moon.value = env.sun.moon ? 1 : 0;
    this.baseSunDir = new THREE.Vector3(...env.sun.dir).normalize();

    const far = quality === 'low' ? env.fog.far * 0.85 : env.fog.far;
    this.scene.fog = new THREE.Fog(env.fog.color, env.fog.near, far);
    this.scene.background = new THREE.Color(env.fog.color);

    this.hemi.color.set(env.hemi.sky);
    this.hemi.groundColor.set(env.hemi.ground);
    this.hemi.intensity = env.hemi.intensity;
    this.sun.color.set(env.light.color);
    this.sun.intensity = env.light.intensity;
    this.sunDir.set(...env.light.dir).normalize();

    // Rebuild the backdrop.
    for (const c of [...this.backdrop.children]) {
      this.backdrop.remove(c);
      c.geometry?.dispose();
    }
    this.buildMountains(env);
    this.buildClouds(env);
    if (env.stars) this.buildStars();
    this.buildScenery(env);
    this.buildWeather(env);
    this.heading = 0;
  }

  // Start of a frame: advance time and the bend, before anything is placed.
  advance(dt, speed, live = true) {
    this.time += dt;
    this.updateBend(dt, speed, live);
  }

  // After the simulation: rebuild the road and scenery around the player.
  update(dt, playerDist, speed, camera) {
    this.origin = playerDist;
    this.updateRoad();
    this.updateTerrain();
    this.updateScenery();
    this.updateWeather(dt, speed);

    this.sky.position.copy(camera.position);
    this.backdrop.position.set(camera.position.x, 0, camera.position.z);
    this.backdrop.rotation.y = this.heading;
    const sd = this.skyMat.uniforms.sunDir.value.copy(this.baseSunDir).applyAxisAngle(_v.set(0, 1, 0), this.heading);
    void sd;
    // Directional light rides along with the player so shadows stay sharp.
    const p = this.toWorld(0, 0, playerDist + 6, _v);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.sunDir, 60);
  }
}
