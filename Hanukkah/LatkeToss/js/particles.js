import * as THREE from 'three';
import { PARTICLES } from './config.js';

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uPixelScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vAlpha = aAlpha;
    vColor = aColor;
    // Size is in world units; scale by distance so droplets shrink with perspective.
    gl_PointSize = aAlpha > 0.0 ? aSize * uPixelScale / -mvPosition.z : 0.0;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const dropletFragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (d > 0.5) discard;
    // Soft-edged droplet with a small specular highlight toward the upper left.
    float edge = smoothstep(0.5, 0.32, d);
    float highlight = smoothstep(0.16, 0.0, length(p - vec2(-0.14, -0.14)));
    vec3 color = vColor + highlight * 0.6;
    gl_FragColor = vec4(color, edge * vAlpha);
    #include <colorspace_fragment>
  }
`;

const sparkleFragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float core = smoothstep(0.2, 0.0, length(p));
    float rays = smoothstep(0.07, 0.0, abs(p.x)) * smoothstep(0.5, 0.0, abs(p.y))
               + smoothstep(0.07, 0.0, abs(p.y)) * smoothstep(0.5, 0.0, abs(p.x));
    float a = clamp(core + rays * 0.8, 0.0, 1.0) * vAlpha;
    gl_FragColor = vec4(vColor, a);
    #include <colorspace_fragment>
  }
`;

/**
 * Fixed-size pool of point particles drawn with one Points object. Emitting reuses the
 * oldest slot when the pool is full, so effects never allocate during gameplay.
 */
export class ParticlePool {
  constructor(scene, capacity, { additive = false, fragmentShader = dropletFragmentShader, gravity = 9.8 } = {}) {
    this.capacity = capacity;
    this.gravity = gravity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.velocities = new Float32Array(capacity * 3);
    this.ages = new Float32Array(capacity);
    this.lives = new Float32Array(capacity);
    this.baseSizes = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.next = 0;
    this.activeCount = 0;

    const geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttribute = new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttribute = new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute = new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setAttribute('aAlpha', this.alphaAttribute);
    geometry.setAttribute('aSize', this.sizeAttribute);
    geometry.setAttribute('aColor', this.colorAttribute);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uPixelScale: { value: 600 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  // Keeps world-unit sizes consistent across resolutions and FOV changes.
  setViewport(heightPixels, verticalFovDegrees) {
    const fov = THREE.MathUtils.degToRad(verticalFovDegrees);
    this.material.uniforms.uPixelScale.value = heightPixels / (2 * Math.tan(fov / 2));
  }

  emit(x, y, z, vx, vy, vz, size, life, color, drag = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    if (this.alphas[i] <= 0) this.activeCount++;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.velocities[i * 3] = vx;
    this.velocities[i * 3 + 1] = vy;
    this.velocities[i * 3 + 2] = vz;
    this.colors[i * 3] = color.r;
    this.colors[i * 3 + 1] = color.g;
    this.colors[i * 3 + 2] = color.b;
    this.baseSizes[i] = size;
    this.sizes[i] = size;
    this.ages[i] = 0;
    this.lives[i] = life;
    this.alphas[i] = 1;
    this.drag[i] = drag;
  }

  update(dt) {
    if (this.activeCount === 0) return;
    let active = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.alphas[i] <= 0) continue;
      this.ages[i] += dt;
      const t = this.ages[i] / this.lives[i];
      if (t >= 1) {
        this.alphas[i] = 0;
        continue;
      }
      active++;
      const drag = 1 - this.drag[i] * dt;
      this.velocities[i * 3] *= drag;
      this.velocities[i * 3 + 2] *= drag;
      this.velocities[i * 3 + 1] -= this.gravity * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      // Fade out over the second half of the life, shrinking slightly.
      this.alphas[i] = Math.max(0.0001, t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55);
      this.sizes[i] = this.baseSizes[i] * (1 - t * 0.45);
    }
    this.activeCount = active;
    this.positionAttribute.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
  }

  clear() {
    this.alphas.fill(0);
    this.activeCount = 0;
    this.alphaAttribute.needsUpdate = true;
  }
}

const SPLASH_COLORS = [0xffc93c, 0xffa21f, 0xe07b12, 0x9c5a14, 0xffe08a].map((hex) => new THREE.Color(hex));
const SPARKLE_COLORS = [0xffffff, 0xfff1b8, 0xf2c14e, 0xbcd0ff].map((hex) => new THREE.Color(hex));

/** Oil droplets plus sparkles: the hit effect, built from two pooled particle systems. */
export class SplashEffects {
  constructor(scene) {
    this.droplets = new ParticlePool(scene, PARTICLES.dropletPoolSize, { gravity: 9.8 });
    this.sparkles = new ParticlePool(scene, PARTICLES.sparklePoolSize, {
      additive: true, fragmentShader: sparkleFragmentShader, gravity: 1.2,
    });
  }

  setViewport(heightPixels, fov) {
    this.droplets.setViewport(heightPixels, fov);
    this.sparkles.setViewport(heightPixels, fov);
  }

  /** Emits an oil splash at a world-space impact point on the oil surface. */
  splash(position) {
    const count = PARTICLES.splashDroplets;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const horizontal = 0.6 + Math.random() * 1.9;
      const upward = 3 + Math.random() * 2.8;
      const life = PARTICLES.dropletLifeMin + Math.random() * (PARTICLES.dropletLifeMax - PARTICLES.dropletLifeMin);
      this.droplets.emit(
        position.x + Math.cos(angle) * 0.08, position.y + 0.02, position.z + Math.sin(angle) * 0.08,
        Math.cos(angle) * horizontal, upward, Math.sin(angle) * horizontal,
        0.07 + Math.random() * 0.08, life,
        SPLASH_COLORS[Math.floor(Math.random() * SPLASH_COLORS.length)], 0.6,
      );
    }
    // Secondary droplets: a few slower, smaller drops that pop up nearly straight.
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const horizontal = Math.random() * 0.5;
      this.droplets.emit(
        position.x, position.y + 0.02, position.z,
        Math.cos(angle) * horizontal, 1.2 + Math.random() * 1.2, Math.sin(angle) * horizontal,
        0.05 + Math.random() * 0.04, 0.35 + Math.random() * 0.3,
        SPLASH_COLORS[0], 0.2,
      );
    }
    for (let i = 0; i < PARTICLES.splashSparkles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const horizontal = 0.4 + Math.random() * 1.2;
      this.sparkles.emit(
        position.x, position.y + 0.1, position.z,
        Math.cos(angle) * horizontal, 1 + Math.random() * 2.2, Math.sin(angle) * horizontal,
        0.16 + Math.random() * 0.16, 0.4 + Math.random() * 0.35,
        SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)], 2.5,
      );
    }
  }

  /** Small dusty puff of crumbs when a latke slaps the table. */
  thud(position) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.droplets.emit(
        position.x, position.y + 0.03, position.z,
        Math.cos(angle) * 0.8, 0.8 + Math.random() * 0.8, Math.sin(angle) * 0.8,
        0.03 + Math.random() * 0.02, 0.3 + Math.random() * 0.2,
        SPLASH_COLORS[3], 1.5,
      );
    }
  }

  update(dt) {
    this.droplets.update(dt);
    this.sparkles.update(dt);
  }

  clear() {
    this.droplets.clear();
    this.sparkles.clear();
  }
}
