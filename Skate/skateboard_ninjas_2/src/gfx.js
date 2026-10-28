// Three.js helpers: the shared toon look, a geometry merger that bakes many
// coloured primitives into one or two draw calls, outlines, and canvas-drawn
// textures for text and comic effects.

import * as THREE from '../vendor/three.module.min.js';

// ------------------------------------------------------------------ toon look

let gradient = null;
export function toonGradient() {
  if (!gradient) {
    const data = new Uint8Array([70, 150, 215, 255]);
    gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

// One toon material per colour (cached) for meshes that need their own colour,
// like the ninja's customizable parts.
const toonCache = new Map();
export function toon(color, opts = {}) {
  const key = `${color}|${opts.emissive || ''}|${opts.transparent ? opts.opacity : ''}`;
  if (!opts.unique && toonCache.has(key)) return toonCache.get(key);
  const mat = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
  if (!opts.unique) toonCache.set(key, mat);
  return mat;
}

// Shared materials for merged prefabs: colour comes from vertex colours.
export const MATS = {
  lit: null,
  glow: null,
};
export function initSharedMaterials() {
  MATS.lit = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  MATS.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  MATS.litDouble = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide });
}

// ------------------------------------------------------------ merged prefabs

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Collects primitives with a colour and a transform, then merges them into a
// "lit" geometry (toon shaded) and an optional "glow" geometry (unlit, reads
// as emissive, which is what makes night-time obstacles pop).
export class GeoBuilder {
  constructor() {
    this.parts = { lit: [], glow: [] };
  }

  add(geometry, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], glow = false } = {}) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    _p.set(pos[0], pos[1], pos[2]);
    _s.set(scale[0], scale[1] ?? scale[0], scale[2] ?? scale[0]);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    if (!g.attributes.normal) g.computeVertexNormals();
    _c.set(color);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = _c.r;
      colors[i * 3 + 1] = _c.g;
      colors[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts[glow ? 'glow' : 'lit'].push(g);
    return this;
  }

  // Same as add(), but with a ready-made matrix and a THREE.Color.
  addWithMatrix(geometry, color, matrix) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.lit.push(g);
  }

  static merge(list) {
    if (!list.length) return null;
    let total = 0;
    for (const g of list) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    let o = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
  }

  build() {
    return { lit: GeoBuilder.merge(this.parts.lit), glow: GeoBuilder.merge(this.parts.glow) };
  }
}

// A mesh (or a group of lit + glow meshes) from a built prefab.
export function prefabMesh(built, { cast = true, receive = false, double = false } = {}) {
  const group = new THREE.Group();
  if (built.lit) {
    const m = new THREE.Mesh(built.lit, double ? MATS.litDouble : MATS.lit);
    m.castShadow = cast;
    m.receiveShadow = receive;
    group.add(m);
  }
  if (built.glow) {
    const m = new THREE.Mesh(built.glow, MATS.glow);
    group.add(m);
  }
  return group;
}

// Bake a character rig for speed: in every joint, merge the plain toon meshes
// into one vertex-coloured mesh (one for outlined parts, one for the rest).
// The joints themselves stay, so the rig still animates. Only for rigs whose
// colours never change; meshes marked userData.keep are left alone.
export function bakeRig(root) {
  const joints = [];
  root.traverse((o) => {
    if (!o.isMesh) joints.push(o);
  });
  for (const joint of joints) {
    const meshes = joint.children.filter((c) => c.isMesh && c.material.isMeshToonMaterial && !c.userData.keep && c.children.length === 0);
    if (meshes.length < 2) continue;
    for (const plain of [false, true]) {
      const list = meshes.filter((m) => !!m.userData.noOutline === plain);
      if (!list.length) continue;
      const b = new GeoBuilder();
      for (const m of list) {
        m.updateMatrix();
        b.addWithMatrix(m.geometry, m.material.color, m.matrix);
        joint.remove(m);
      }
      const mesh = new THREE.Mesh(GeoBuilder.merge(b.parts.lit), MATS.lit);
      mesh.castShadow = true;
      mesh.userData.noOutline = plain;
      joint.add(mesh);
    }
  }
}

// --------------------------------------------------------------- outlines

// Inverted-hull outline: the mesh drawn again, pushed out along its normals,
// back faces only, in a dark ink colour. Cheap and very cartoon.
const outlineMats = new Map();
export function outlineMaterial(thickness = 0.025, color = 0x120a24) {
  const key = `${thickness}|${color}`;
  if (outlineMats.has(key)) return outlineMats.get(key);
  const mat = new THREE.ShaderMaterial({
    uniforms: { thickness: { value: thickness }, color: { value: new THREE.Color(color) } },
    vertexShader: `
      uniform float thickness;
      void main() {
        vec3 p = position + normal * thickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 color;
      void main() { gl_FragColor = vec4(color, 1.0); }`,
    side: THREE.BackSide,
  });
  outlineMats.set(key, mat);
  return mat;
}

// Adds an outline child to every mesh under root (skips ones marked noOutline).
export function addOutlines(root, thickness = 0.025) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.noOutline && !o.userData.isOutline) meshes.push(o);
  });
  for (const m of meshes) {
    const out = new THREE.Mesh(m.geometry, outlineMaterial(thickness));
    out.userData.isOutline = true;
    out.castShadow = false;
    m.add(out);
  }
}

export function setOutlinesVisible(root, visible) {
  root.traverse((o) => {
    if (o.userData.isOutline) o.visible = visible;
  });
}

// ------------------------------------------------------------- textures

export function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const FONT = '"Arial Black", "Segoe UI Black", Impact, system-ui, sans-serif';

// Comic burst: a spiky star with a word in it ("POW!", "POOF!").
const burstCache = new Map();
export function burstTexture(word, fill = '#ffe066', ink = '#ff2e55') {
  const key = `${word}|${fill}|${ink}`;
  if (burstCache.has(key)) return burstCache.get(key);
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    const spikes = 12;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? 118 : 78 + (i % 4) * 6;
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = '#140c2b';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.fill();
    ctx.stroke();
    ctx.rotate(-0.12);
    // Shrink long words until they fit inside the burst.
    let size = 62;
    ctx.font = `900 ${size}px ${FONT}`;
    while (size > 26 && ctx.measureText(word).width > 176) {
      size -= 2;
      ctx.font = `900 ${size}px ${FONT}`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#140c2b';
    ctx.strokeText(word, 0, 4);
    ctx.fillStyle = ink;
    ctx.fillText(word, 0, 4);
  });
  burstCache.set(key, tex);
  return tex;
}

// Speech bubble with a tail, for Karens and evil ninjas.
const bubbleCache = new Map();
export function bubbleTexture(text, { fill = '#ffffff', ink = '#140c2b' } = {}) {
  const key = `${text}|${fill}`;
  if (bubbleCache.has(key)) return { tex: bubbleCache.get(key), aspect: bubbleCache.get(key).userData.aspect };
  const fontSize = 40;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `900 ${fontSize}px ${FONT}`;
  const tw = Math.ceil(measure.measureText(text).width);
  const w = Math.min(1024, tw + 70);
  const h = 128;
  const tex = canvasTexture(w, h, (ctx) => {
    const r = 34;
    const bh = 92;
    ctx.beginPath();
    ctx.moveTo(r + 6, 6);
    ctx.arcTo(w - 6, 6, w - 6, bh, r);
    ctx.arcTo(w - 6, bh, 6, bh, r);
    ctx.lineTo(w / 2 + 16, bh);
    ctx.lineTo(w / 2 - 4, h - 6);
    ctx.lineTo(w / 2 - 14, bh);
    ctx.arcTo(6, bh, 6, 6, r);
    ctx.arcTo(6, 6, w - 6, 6, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 8;
    ctx.fill();
    ctx.stroke();
    ctx.font = `900 ${fontSize}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.fillText(text, w / 2, bh / 2 + 4);
  });
  tex.userData.aspect = w / h;
  bubbleCache.set(key, tex);
  return { tex, aspect: w / h };
}

// Soft round dot for particles and glows.
let dotTex = null;
export function dotTexture() {
  if (!dotTex) {
    dotTex = canvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    dotTex.colorSpace = THREE.NoColorSpace;
  }
  return dotTex;
}

// Shuriken-shaped sprite for "star" particles.
let starTex = null;
export function starTexture() {
  if (!starTex) {
    starTex = canvasTexture(64, 64, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 30 : 12;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
    });
    starTex.colorSpace = THREE.NoColorSpace;
  }
  return starTex;
}

// Point sprites size themselves as size * POINT_SCALE / depth. The game sets it
// on resize so particles look the same at any resolution or pixel ratio.
export const POINT_SCALE = { value: 600 };

export { THREE };
