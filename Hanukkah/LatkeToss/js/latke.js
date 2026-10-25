import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { LATKE } from './config.js';

const SRGB = THREE.SRGBColorSpace;

// Small seeded PRNG so each latke variant is reproducible within a session.
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cheap smooth 2D value noise built from a few random sine waves. Continuous everywhere,
// which matters because the sphere we deform has duplicated seam vertices.
function createSurfaceNoise(random) {
  const waves = [];
  for (let i = 0; i < 6; i++) {
    const angle = random() * Math.PI * 2;
    const frequency = 14 + random() * 26;
    waves.push({
      dx: Math.cos(angle) * frequency,
      dz: Math.sin(angle) * frequency,
      phase: random() * Math.PI * 2,
      weight: 1 / (1 + i * 0.6),
    });
  }
  const total = waves.reduce((sum, wave) => sum + wave.weight, 0);
  return (x, z) => {
    let value = 0;
    for (const wave of waves) value += Math.sin(x * wave.dx + z * wave.dz + wave.phase) * wave.weight;
    return value / total;
  };
}

/**
 * Builds the main latke body: a sphere squashed into a thick pancake, with an irregular
 * outline, a lumpy top, a flatter bottom, and ragged "crispy" edges.
 */
function createLatkeBodyGeometry(random) {
  const radius = LATKE.radius;
  const halfThickness = LATKE.thickness / 2;
  const geometry = new THREE.SphereGeometry(1, 72, 18);
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');

  // Outline: integer harmonics keep the shape continuous around the full circle.
  const lowHarmonics = [];
  for (let k = 2; k <= 5; k++) {
    lowHarmonics.push({ k, amplitude: (0.05 + random() * 0.05) / (k - 0.8), phase: random() * Math.PI * 2 });
  }
  const jagHarmonics = [];
  for (const k of [9, 12, 15, 18, 22]) {
    jagHarmonics.push({ k, amplitude: 0.01 + random() * 0.014, phase: random() * Math.PI * 2 });
  }
  const outline = (theta) => {
    let value = 1;
    for (const h of lowHarmonics) value += h.amplitude * Math.sin(h.k * theta + h.phase);
    return value;
  };
  const jag = (theta, v) => {
    let value = 0;
    for (const h of jagHarmonics) value += h.amplitude * Math.sin(h.k * theta + h.phase + v * 3);
    return value;
  };
  const surfaceNoise = createSurfaceNoise(random);
  const fineNoise = createSurfaceNoise(random);

  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const horizontal = Math.hypot(vertex.x, vertex.z);
    const theta = Math.atan2(vertex.z, vertex.x);
    const v = vertex.y; // -1 (bottom pole) .. 1 (top pole)
    // Push vertices outward (rho^0.42) so the faces flatten and only the rim stays rounded.
    const flattened = Math.pow(horizontal, 0.42);
    const edgeness = 1 - Math.abs(v); // 1 at the rim, 0 at the poles
    let planarRadius = radius * outline(theta) * flattened;
    planarRadius *= 1 + jag(theta, v) * Math.pow(edgeness, 2) * 1.3;

    const x = Math.cos(theta) * planarRadius;
    const z = Math.sin(theta) * planarRadius;
    // Top is domed and lumpy; bottom is flatter (it sat in the pan).
    const isTop = v > 0;
    let y = v * halfThickness * (isTop ? 1.15 : 0.8);
    const bumps = surfaceNoise(x, z) * 0.6 + fineNoise(x * 1.7, z * 1.7) * 0.4;
    y += (isTop ? 0.022 : 0.008) * bumps * (1 - edgeness * 0.6) * Math.sign(v || 1);
    position.setXYZ(i, x, y, z);
  }

  const merged = mergeVertices(geometry, 1e-4);
  geometry.dispose();
  merged.computeVertexNormals();

  // Vertex colors: golden centers, darker crisp edges, browned high points, random speckles.
  const hueShift = (random() - 0.5) * 0.025;
  const doneness = random();
  const center = new THREE.Color().setHSL(0.105 + hueShift, 0.82, 0.47 - doneness * 0.06, SRGB);
  const edge = new THREE.Color().setHSL(0.075 + hueShift, 0.85, 0.24 + random() * 0.05, SRGB);
  const crisp = new THREE.Color().setHSL(0.07, 0.75, 0.15, SRGB);
  const pale = new THREE.Color().setHSL(0.12, 0.75, 0.62, SRGB);
  const color = new THREE.Color();
  const mergedPosition = merged.attributes.position;
  const colors = new Float32Array(mergedPosition.count * 3);
  for (let i = 0; i < mergedPosition.count; i++) {
    const x = mergedPosition.getX(i);
    const y = mergedPosition.getY(i);
    const z = mergedPosition.getZ(i);
    const radial = Math.min(1, Math.hypot(x, z) / radius);
    color.copy(center).lerp(edge, Math.pow(radial, 3.2));
    const bump = surfaceNoise(x, z);
    if (bump > 0.25) color.lerp(crisp, (bump - 0.25) * 0.7);
    if (bump < -0.45) color.lerp(pale, (-0.45 - bump) * 0.9);
    const speckle = fineNoise(x * 4.3, z * 4.3);
    if (speckle > 0.55) color.lerp(crisp, 0.45);
    if (y < 0) color.multiplyScalar(0.82); // bottom fried a little darker
    color.toArray(colors, i * 3);
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Top-down planar UVs for the shared fried-surface texture, randomly rotated per variant.
  const uvRotation = random() * Math.PI * 2;
  const cos = Math.cos(uvRotation);
  const sin = Math.sin(uvRotation);
  const uvs = new Float32Array(mergedPosition.count * 2);
  for (let i = 0; i < mergedPosition.count; i++) {
    const u = mergedPosition.getX(i) / (radius * 2.4);
    const w = mergedPosition.getZ(i) / (radius * 2.4);
    uvs[i * 2] = 0.5 + u * cos - w * sin;
    uvs[i * 2 + 1] = 0.5 + u * sin + w * cos;
  }
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return merged;
}

let surfaceTextures = null;

/**
 * Shared procedural "grated potato" textures: hundreds of short strokes drawn on a canvas.
 * Used as a bump map for crispy relief and as a subtle color map that modulates the
 * vertex colors. Built once and shared by every latke.
 */
function getSurfaceTextures() {
  if (surfaceTextures) return surfaceTextures;
  const size = 512;
  const bumpCanvas = document.createElement('canvas');
  const colorCanvas = document.createElement('canvas');
  bumpCanvas.width = colorCanvas.width = size;
  bumpCanvas.height = colorCanvas.height = size;
  const bump = bumpCanvas.getContext('2d');
  const color = colorCanvas.getContext('2d');
  bump.fillStyle = '#6a6a6a';
  bump.fillRect(0, 0, size, size);
  color.fillStyle = '#f2f2f2';
  color.fillRect(0, 0, size, size);
  bump.lineCap = color.lineCap = 'round';
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const angle = Math.random() * Math.PI;
    const length = 10 + Math.random() * 34;
    const bend = (Math.random() - 0.5) * 14;
    const width = 2 + Math.random() * 4;
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    const shade = Math.floor(120 + Math.random() * 135);
    bump.strokeStyle = `rgb(${shade},${shade},${shade})`;
    bump.lineWidth = width;
    bump.beginPath();
    bump.moveTo(x - dx / 2, y - dy / 2);
    bump.quadraticCurveTo(x + bend, y - bend, x + dx / 2, y + dy / 2);
    bump.stroke();
    // Strand highlights and browned tips in the color map.
    const tone = Math.random() < 0.6 ? 255 : Math.floor(150 + Math.random() * 60);
    color.strokeStyle = `rgba(${tone},${Math.floor(tone * 0.93)},${Math.floor(tone * 0.8)},0.55)`;
    color.lineWidth = width;
    color.beginPath();
    color.moveTo(x - dx / 2, y - dy / 2);
    color.quadraticCurveTo(x + bend, y - bend, x + dx / 2, y + dy / 2);
    color.stroke();
  }
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 3;
    bump.fillStyle = 'rgba(20,20,20,0.6)';
    bump.beginPath();
    bump.arc(x, y, r, 0, Math.PI * 2);
    bump.fill();
    color.fillStyle = 'rgba(120,70,30,0.45)';
    color.beginPath();
    color.arc(x, y, r, 0, Math.PI * 2);
    color.fill();
  }
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [bumpMap, colorMap]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  surfaceTextures = { bumpMap, colorMap };
  return surfaceTextures;
}

/**
 * Builds a single merged geometry of thin shredded-potato strands: some poking out of the
 * edge, some lying across the top.
 */
function createStrandGeometry(random, bodyGeometry) {
  const radius = LATKE.radius;
  const halfThickness = LATKE.thickness / 2;
  const pieces = [];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3(1, 1, 1);
  const offset = new THREE.Vector3();
  const color = new THREE.Color();

  const addStrand = (length, width, height, x, y, z, yaw, pitch, roll, lightness) => {
    const box = new THREE.BoxGeometry(length, height, width);
    euler.set(pitch, yaw, roll, 'YXZ');
    quaternion.setFromEuler(euler);
    offset.set(x, y, z);
    matrix.compose(offset, quaternion, scale);
    box.applyMatrix4(matrix);
    color.setHSL(0.09 + random() * 0.02, 0.72, lightness, SRGB);
    const count = box.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
    box.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    pieces.push(box.toNonIndexed());
    box.dispose();
  };

  // Estimate the outline radius in a direction from the body's own vertices.
  const bodyPosition = bodyGeometry.attributes.position;
  const edgeRadiusAt = (theta) => {
    let best = radius;
    let bestDelta = Infinity;
    for (let i = 0; i < bodyPosition.count; i += 3) {
      const x = bodyPosition.getX(i);
      const z = bodyPosition.getZ(i);
      if (Math.abs(bodyPosition.getY(i)) > halfThickness * 0.4) continue;
      let delta = Math.abs(Math.atan2(z, x) - theta);
      delta = Math.min(delta, Math.PI * 2 - delta);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = Math.hypot(x, z);
      }
    }
    return best;
  };

  const edgeCount = 9 + Math.floor(random() * 4);
  for (let i = 0; i < edgeCount; i++) {
    const theta = (i / edgeCount) * Math.PI * 2 + random() * 0.4;
    const edgeRadius = edgeRadiusAt(theta) * (0.93 + random() * 0.06);
    const length = 0.09 + random() * 0.08;
    // Mostly tangential with a random outward tilt, so strands look like crispy shreds.
    const yaw = -theta + Math.PI / 2 + (random() - 0.5) * 1.4;
    addStrand(
      length, 0.011 + random() * 0.007, 0.009 + random() * 0.005,
      Math.cos(theta) * edgeRadius, (random() - 0.5) * halfThickness * 0.9, Math.sin(theta) * edgeRadius,
      yaw, (random() - 0.5) * 0.5, (random() - 0.5) * 0.4,
      0.3 + random() * 0.16,
    );
  }

  const topCount = 7 + Math.floor(random() * 4);
  for (let i = 0; i < topCount; i++) {
    const theta = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * radius * 0.7;
    addStrand(
      0.08 + random() * 0.09, 0.016 + random() * 0.008, 0.01,
      Math.cos(theta) * r, halfThickness * 1.08 - (r / radius) * 0.012, Math.sin(theta) * r,
      random() * Math.PI, (random() - 0.5) * 0.12, (random() - 0.5) * 0.12,
      0.34 + random() * 0.18,
    );
  }

  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  merged.computeVertexNormals();
  return merged;
}

/**
 * Creates one latke: a Group whose children are the fried body and its potato strands.
 * The group's local Y axis is the pancake's normal (flat side up).
 * Each latke owns its material so it can darken independently while frying.
 */
export function createLatke(seed = Math.floor(Math.random() * 1e9)) {
  const random = createRandom(seed);
  const bodyGeometry = createLatkeBodyGeometry(random);
  const strandGeometry = createStrandGeometry(random, bodyGeometry);

  const { bumpMap, colorMap } = getSurfaceTextures();
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    map: colorMap,
    bumpMap,
    bumpScale: 2.2,
    roughness: 0.72,
    metalness: 0,
    // A thin clearcoat reads as a glistening layer of frying oil.
    clearcoat: 0.35,
    clearcoatRoughness: 0.55,
  });

  const group = new THREE.Group();
  group.name = 'latke';
  const body = new THREE.Mesh(bodyGeometry, material);
  body.castShadow = true;
  body.receiveShadow = true;
  const strands = new THREE.Mesh(strandGeometry, material);
  strands.castShadow = true;
  group.add(body, strands);
  group.userData.material = material;
  group.userData.baseColor = material.color.clone();
  return group;
}

/**
 * Fixed pool of pre-built latkes. Successive throws pick a different variant and apply a
 * random scale and spin so every toss looks a little different without building new
 * geometry during the round.
 */
export class LatkePool {
  constructor(scene, count = LATKE.variantCount) {
    this.free = [];
    this.all = [];
    this.lastVariant = -1;
    for (let i = 0; i < count; i++) {
      const latke = createLatke(1000 + i * 7919 + Math.floor(Math.random() * 1000));
      latke.visible = false;
      latke.userData.variant = i;
      scene.add(latke);
      this.free.push(latke);
      this.all.push(latke);
    }
  }

  acquire() {
    if (this.free.length === 0) return null;
    // Avoid handing out the same shape twice in a row.
    let index = Math.floor(Math.random() * this.free.length);
    if (this.free.length > 1 && this.free[index].userData.variant === this.lastVariant) {
      index = (index + 1) % this.free.length;
    }
    const latke = this.free.splice(index, 1)[0];
    this.lastVariant = latke.userData.variant;

    const widthScale = 0.93 + Math.random() * 0.14;
    latke.scale.set(widthScale, 0.9 + Math.random() * 0.2, widthScale * (0.95 + Math.random() * 0.1));
    latke.userData.material.color.copy(latke.userData.baseColor);
    latke.userData.material.opacity = 1;
    latke.userData.material.transparent = false;
    latke.visible = true;
    return latke;
  }

  release(latke) {
    if (!latke || this.free.includes(latke)) return;
    latke.visible = false;
    this.free.push(latke);
  }

  releaseAll() {
    for (const latke of this.all) this.release(latke);
  }
}
