import * as THREE from 'three';
import { DIFFICULTIES, POT, PARTICLES } from './config.js';

const MAX_RIPPLES = 4;
const BUBBLE_COUNT = 14;

function createIronBumpTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  // Pitted cast-iron grain.
  for (let i = 0; i < 1400; i++) {
    const shade = Math.floor(90 + Math.random() * 80);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 1.8 + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 2);
  return texture;
}

function createSoftShadowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.85)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Cross-section of the pot (radius, height), traced from the bottom center outward, up
// the outside, over the rim, and down the inside. Lathe normals face "right" of the
// direction of travel, so this ordering gives outward normals outside and inward ones
// inside the cavity.
function potProfile() {
  const r = POT.outerRadius;
  const top = POT.rimHeight;
  const inner = POT.openingRadius;
  return [
    [0.001, 0], [0.82, 0], [0.9, 0.02], [0.96, 0.07], [0.99, 0.16],
    [r, 0.3], [r, 0.7], [r * 0.995, top - 0.12], [r * 0.985, top - 0.05],
    [0.965, top - 0.01], [0.93, top], [0.895, top - 0.01], [inner + 0.005, top - 0.05],
    [inner, top - 0.12], [inner - 0.01, 0.3], [inner - 0.04, 0.17], [inner - 0.1, 0.12], [0.001, 0.12],
  ].map(([x, y]) => new THREE.Vector2(x, y));
}

const oilVertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec4 uRipples[${MAX_RIPPLES}];
  varying vec2 vLocal;
  varying vec3 vWorldPosition;

  float oilHeight(vec2 p) {
    float h = 0.006 * sin(p.x * 9.0 + uTime * 2.1)
            + 0.005 * sin(p.y * 11.0 - uTime * 1.7)
            + 0.004 * sin((p.x + p.y) * 15.0 + uTime * 3.3);
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 ripple = uRipples[i];
      float age = uTime - ripple.z;
      if (age > 0.0 && age < 1.3) {
        float d = distance(p, ripple.xy);
        float front = age * 1.05;
        float band = exp(-pow((d - front) * 11.0, 2.0));
        h += ripple.w * 0.045 * band * (1.0 - age / 1.3) * cos((d - front) * 34.0);
      }
    }
    return h;
  }

  void main() {
    vec3 p = position;
    vLocal = p.xz;
    // Keep the edge pinned to the pot wall.
    float edgeMask = 1.0 - smoothstep(0.65, 0.85, length(p.xz));
    p.y += oilHeight(p.xz) * edgeMask;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const oilFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec4 uRipples[${MAX_RIPPLES}];
  uniform vec3 uLightDirection;
  varying vec2 vLocal;
  varying vec3 vWorldPosition;

  float oilHeight(vec2 p) {
    float h = 0.006 * sin(p.x * 9.0 + uTime * 2.1)
            + 0.005 * sin(p.y * 11.0 - uTime * 1.7)
            + 0.004 * sin((p.x + p.y) * 15.0 + uTime * 3.3);
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 ripple = uRipples[i];
      float age = uTime - ripple.z;
      if (age > 0.0 && age < 1.3) {
        float d = distance(p, ripple.xy);
        float front = age * 1.05;
        float band = exp(-pow((d - front) * 11.0, 2.0));
        h += ripple.w * 0.045 * band * (1.0 - age / 1.3) * cos((d - front) * 34.0);
      }
    }
    return h;
  }

  void main() {
    // Normal from finite differences of the same height field used for displacement.
    float e = 0.012;
    float hx = oilHeight(vLocal + vec2(e, 0.0)) - oilHeight(vLocal - vec2(e, 0.0));
    float hz = oilHeight(vLocal + vec2(0.0, e)) - oilHeight(vLocal - vec2(0.0, e));
    vec3 normal = normalize(vec3(-hx * 3.0, 2.0 * e, -hz * 3.0));

    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float r = length(vLocal) / 0.86;
    vec3 deep = vec3(0.42, 0.2, 0.02);
    vec3 golden = vec3(1.0, 0.66, 0.16);
    vec3 color = mix(golden, deep, smoothstep(0.15, 1.0, r));
    // Darken toward the wall where the pot shades the oil.
    color *= 1.0 - 0.45 * smoothstep(0.75, 1.0, r);

    vec3 halfVector = normalize(uLightDirection + viewDir);
    float specular = pow(max(dot(normal, halfVector), 0.0), 60.0);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    float shimmer = 0.5 + 0.5 * sin(vLocal.x * 30.0 + vLocal.y * 24.0 + uTime * 4.0);
    color += vec3(1.0, 0.92, 0.7) * specular * 1.4;
    color += vec3(0.9, 0.6, 0.25) * fresnel * 0.35;
    color += vec3(0.35, 0.2, 0.02) * shimmer * 0.08;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Pot {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'pot';
    this.difficulty = DIFFICULTIES.easy;
    this.effectsTime = 0;
    this.previousPosition = new THREE.Vector3();

    this._buildBody();
    this._buildOil();
    this._buildBubbles();
    this._buildRipples();
    this._buildDepthCues();
    scene.add(this.group);

    this.setTime(0);
  }

  _buildBody() {
    const bump = createIronBumpTexture();
    const iron = new THREE.MeshStandardMaterial({
      color: 0x2a2b33,
      metalness: 0.55,
      roughness: 0.58,
      bumpMap: bump,
      bumpScale: 0.6,
    });
    const body = new THREE.Mesh(new THREE.LatheGeometry(potProfile(), 56), iron);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Thick rolled rim with a slightly brighter, worn-metal finish.
    const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4c58, metalness: 0.75, roughness: 0.32 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.93, 0.05, 12, 64), rimMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = POT.rimHeight - 0.01;
    rim.castShadow = true;
    this.group.add(rim);

    // Decorative gold band so the pot reads clearly against the dark table.
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(POT.outerRadius + 0.005, 0.022, 8, 64),
      new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 0.9, roughness: 0.3 }),
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.5;
    this.group.add(band);

    // Two loop handles. The half torus is rotated so it lies flat and bulges outward.
    const handleGeometry = new THREE.TorusGeometry(0.17, 0.045, 10, 20, Math.PI);
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.rotation.y = side === 1 ? 0 : Math.PI;
      const handle = new THREE.Mesh(handleGeometry, iron);
      handle.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
      handle.position.set(POT.outerRadius - 0.02, POT.rimHeight - 0.22, 0);
      handle.castShadow = true;
      pivot.add(handle);
      this.group.add(pivot);
    }
  }

  _buildOil() {
    // A ring geometry (with inner rings) gives the vertex shader enough vertices to ripple.
    const geometry = new THREE.RingGeometry(0, POT.openingRadius - 0.005, 56, 14);
    geometry.rotateX(-Math.PI / 2); // lie flat in the pot's XZ plane, facing +Y
    const ripples = [];
    for (let i = 0; i < MAX_RIPPLES; i++) ripples.push(new THREE.Vector4(0, 0, -100, 0));
    this.oilUniforms = {
      uTime: { value: 0 },
      uRipples: { value: ripples },
      uLightDirection: { value: new THREE.Vector3(0.45, 0.85, 0.4).normalize() },
    };
    this.oil = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms: this.oilUniforms,
      vertexShader: oilVertexShader,
      fragmentShader: oilFragmentShader,
    }));
    this.oil.position.y = POT.oilHeight;
    this.group.add(this.oil);
    this._nextRipple = 0;

    // Warm glow above the oil to suggest heat.
    this.oilGlow = new THREE.PointLight(0xffa640, 1.6, 2.6, 2);
    this.oilGlow.position.set(0, POT.oilHeight + 0.35, 0);
    this.group.add(this.oilGlow);
  }

  _buildBubbles() {
    const geometry = new THREE.SphereGeometry(1, 10, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffd27a,
      emissive: 0x7a4200,
      emissiveIntensity: 0.6,
      roughness: 0.15,
      metalness: 0,
      transparent: true,
      opacity: 0.85,
    });
    this.bubbles = [];
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.bubbles.push({ mesh, age: 0, life: 1, size: 0.03, delay: Math.random() * 2 });
    }
  }

  _buildRipples() {
    const geometry = new THREE.RingGeometry(0.9, 1, 48);
    geometry.rotateX(-Math.PI / 2);
    this.rippleRings = [];
    for (let i = 0; i < 3; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xfff0b0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.position.y = POT.oilHeight + 0.02;
      this.group.add(mesh);
      this.rippleRings.push({ mesh, age: 0, active: false });
    }
    this._nextRing = 0;

    // Brief additive flash at the impact point.
    this.flash = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xffe9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.flash.position.y = POT.oilHeight + 0.03;
    this.flash.visible = false;
    this.group.add(this.flash);
    this.flashAge = 1;
  }

  // Hard mode floats the pot, so a ground shadow and glowing halo show its height and depth.
  _buildDepthCues() {
    this.groundShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: createSoftShadowTexture(), transparent: true, depthWrite: false, opacity: 0.6 }),
    );
    this.groundShadow.position.y = 0.012;
    this.groundShadow.renderOrder = 1;
    this.scene.add(this.groundShadow);

    this.groundMarker = new THREE.Mesh(
      new THREE.RingGeometry(1.22, 1.34, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x8fb0ff, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.groundMarker.position.y = 0.015;
    this.scene.add(this.groundMarker);

    this.hoverHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 1.15, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x6f8dff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    this.hoverHalo.position.y = -0.03;
    this.group.add(this.hoverHalo);

    // Faint column of light from the table up to the floating pot: shows both its height
    // and exactly where it sits in depth.
    const gradient = document.createElement('canvas');
    gradient.width = 4;
    gradient.height = 64;
    const ctx = gradient.getContext('2d');
    const fill = ctx.createLinearGradient(0, 0, 0, 64);
    fill.addColorStop(0, '#000000');
    fill.addColorStop(1, '#ffffff');
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 4, 64);
    this.heightBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.2, 1, 40, 1, true).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({
        color: 0x6f8dff, transparent: true, opacity: 0, alphaMap: new THREE.CanvasTexture(gradient),
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    this.heightBeam.visible = false;
    this.scene.add(this.heightBeam);
  }

  setDifficulty(key) {
    this.difficulty = DIFFICULTIES[key] || DIFFICULTIES.easy;
  }

  /**
   * World-space position of the pot base at a given round time. Each axis follows its own
   * sine wave, so motion is smooth, deterministic, and independent of frame rate.
   */
  positionAt(time, out) {
    const d = this.difficulty;
    out.set(
      d.center.x + d.amplitude.x * Math.sin(d.speed.x * time + d.phase.x),
      d.center.y + d.amplitude.y * Math.sin(d.speed.y * time + d.phase.y),
      d.center.z + d.amplitude.z * Math.sin(d.speed.z * time + d.phase.z),
    );
    out.y = Math.max(0, out.y);
    return out;
  }

  // Places the pot group (and its depth cues) for the given round time.
  setTime(time) {
    this.positionAt(time, this.group.position);
    const position = this.group.position;
    const height = position.y;
    this.groundShadow.position.x = position.x;
    this.groundShadow.position.z = position.z;
    const spread = 1 + height * 0.35;
    this.groundShadow.scale.set(spread, 1, spread);
    this.groundShadow.material.opacity = 0.6 / (1 + height * 0.9);
    this.groundMarker.position.x = position.x;
    this.groundMarker.position.z = position.z;
    const floating = THREE.MathUtils.smoothstep(height, 0.03, 0.25);
    this.groundMarker.material.opacity = 0.45 * floating;
    this.hoverHalo.material.opacity = 0.35 * floating;
    this.groundMarker.visible = floating > 0.01;
    this.hoverHalo.visible = floating > 0.01;
    this.heightBeam.visible = floating > 0.01;
    this.heightBeam.position.set(position.x, 0, position.z);
    this.heightBeam.scale.y = Math.max(0.01, height);
    this.heightBeam.material.opacity = 0.5 * floating;
  }

  // Converts a world-space point to pot-local coordinates (pot base at the origin).
  worldToLocal(world, out) {
    return out.copy(world).sub(this.group.position);
  }

  /** Ripple, ring, flash and a burst of bubbles at a pot-local (x, z) impact point. */
  splash(localX, localZ) {
    const ripple = this.oilUniforms.uRipples.value[this._nextRipple];
    ripple.set(localX, localZ, this.effectsTime, 1);
    this._nextRipple = (this._nextRipple + 1) % MAX_RIPPLES;

    const ring = this.rippleRings[this._nextRing];
    this._nextRing = (this._nextRing + 1) % this.rippleRings.length;
    ring.active = true;
    ring.age = 0;
    ring.mesh.visible = true;
    ring.mesh.position.x = localX;
    ring.mesh.position.z = localZ;

    this.flashAge = 0;
    this.flash.visible = true;
    this.flash.position.x = localX;
    this.flash.position.z = localZ;

    // Kick a few bubbles to start right away around the impact.
    let kicked = 0;
    for (const bubble of this.bubbles) {
      if (kicked >= 5) break;
      if (bubble.age < bubble.life * 0.5 && bubble.delay <= 0) continue;
      this._respawnBubble(bubble, localX, localZ, 0.25);
      bubble.delay = kicked * 0.06;
      kicked++;
    }
  }

  _respawnBubble(bubble, nearX = null, nearZ = null, spread = 0.7) {
    let x;
    let z;
    if (nearX === null) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * 0.68;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
    } else {
      x = nearX + (Math.random() - 0.5) * spread;
      z = nearZ + (Math.random() - 0.5) * spread;
      const radius = Math.hypot(x, z);
      if (radius > 0.68) {
        x *= 0.68 / radius;
        z *= 0.68 / radius;
      }
    }
    bubble.mesh.position.set(x, POT.oilHeight, z);
    bubble.age = 0;
    bubble.life = 0.6 + Math.random() * 0.9;
    bubble.size = 0.018 + Math.random() * 0.03;
  }

  // Advances cosmetic effects. Pass 0 while paused to freeze them.
  update(dt) {
    this.effectsTime += dt;
    this.oilUniforms.uTime.value = this.effectsTime;

    for (const bubble of this.bubbles) {
      if (bubble.delay > 0) {
        bubble.delay -= dt;
        bubble.mesh.visible = false;
        if (bubble.delay <= 0) this._respawnBubble(bubble);
        continue;
      }
      bubble.age += dt;
      const t = bubble.age / bubble.life;
      if (t >= 1) {
        bubble.mesh.visible = false;
        bubble.delay = 0.1 + Math.random() * 1.4;
        continue;
      }
      // Bubbles swell, rise slightly out of the oil, then pop.
      const scale = bubble.size * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.85 + 0.15);
      bubble.mesh.visible = true;
      bubble.mesh.scale.setScalar(Math.max(0.001, scale));
      bubble.mesh.position.y = POT.oilHeight + scale * 0.35;
    }

    for (const ring of this.rippleRings) {
      if (!ring.active) continue;
      ring.age += dt;
      const t = ring.age / PARTICLES.rippleSeconds;
      if (t >= 1) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }
      // Grow until the ring would touch the pot wall, then fade.
      const centerOffset = Math.hypot(ring.mesh.position.x, ring.mesh.position.z);
      const maxRadius = Math.max(0.15, POT.openingRadius - 0.04 - centerOffset);
      const radius = 0.08 + (maxRadius - 0.08) * (1 - Math.pow(1 - t, 2.2));
      ring.mesh.scale.set(radius, 1, radius);
      ring.mesh.material.opacity = 0.9 * (1 - t);
    }

    if (this.flashAge < 1) {
      this.flashAge += dt / 0.22;
      const t = Math.min(1, this.flashAge);
      this.flash.material.opacity = 0.9 * (1 - t);
      this.flash.scale.setScalar(0.5 + t * 1.2);
      if (t >= 1) this.flash.visible = false;
    }

    this.oilGlow.intensity = 1.5 + 0.25 * Math.sin(this.effectsTime * 5.3);
  }

  reset() {
    for (const ripple of this.oilUniforms.uRipples.value) ripple.set(0, 0, -100, 0);
    for (const ring of this.rippleRings) {
      ring.active = false;
      ring.mesh.visible = false;
    }
    this.flashAge = 1;
    this.flash.visible = false;
    this.setTime(0);
  }
}
