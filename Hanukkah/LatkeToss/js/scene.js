import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Camera framing. The camera sits behind the player's plate, looking slightly down the
// table so the pot opening, the latke, and the space between them all stay in view.
const CAMERA_POSITION = new THREE.Vector3(0, 4.7, 7.6);
const CAMERA_TARGET = new THREE.Vector3(0, 0, -1.0);
const BASE_VERTICAL_FOV = 50;
const MAX_VERTICAL_FOV = 76;
// Half-width (world units) that must remain visible at the pot's typical depth, so a
// side-to-side pot never leaves the screen on narrow portrait displays.
const REQUIRED_HALF_WIDTH = 3.7;
const REQUIRED_WIDTH_DEPTH = 10.4;

export const IS_COARSE_POINTER = typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(pointer: coarse)').matches;

// Throws if WebGL is unavailable so main.js can show a friendly message.
export function createRenderer(container) {
  const probe = document.createElement('canvas');
  const hasWebGL = !!(window.WebGLRenderingContext
    && (probe.getContext('webgl2') || probe.getContext('webgl')));
  if (!hasWebGL) {
    throw new Error('WebGL is not available in this browser.');
  }

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

function canvasTexture(canvas, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeatX !== 1 || repeatY !== 1) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
  }
  return texture;
}

function drawStarOfDavid(ctx, x, y, radius) {
  for (let t = 0; t < 2; t++) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = -Math.PI / 2 + t * Math.PI + (i * Math.PI * 2) / 3;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function createTableclothTexture() {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = '#17307c';
  ctx.fillRect(0, 0, size, size);

  // Fine woven-cloth noise.
  for (let i = 0; i < 9000; i++) {
    const shade = Math.random() < 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${Math.random() * 0.06})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 1 + Math.random() * 3);
  }

  // Silver pinstripes and stars.
  ctx.strokeStyle = 'rgba(220,230,255,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, size - 20, size - 20);

  ctx.strokeStyle = 'rgba(235,240,255,0.3)';
  ctx.lineWidth = 3;
  drawStarOfDavid(ctx, size / 2, size / 2, 46);
  ctx.strokeStyle = 'rgba(242,193,78,0.25)';
  ctx.lineWidth = 2;
  for (const [x, y] of [[0, 0], [size, 0], [0, size], [size, size]]) {
    drawStarOfDavid(ctx, x, y, 30);
  }
  return canvasTexture(canvas, 4, 4);
}

function createWallTexture() {
  const width = 2048;
  const height = 820;
  const { canvas, ctx } = makeCanvas(width, height);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#0a1540');
  gradient.addColorStop(1, '#14286b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Subtle diamond wallpaper.
  ctx.strokeStyle = 'rgba(120,150,255,0.07)';
  ctx.lineWidth = 2;
  for (let x = -height; x < width + height; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
    ctx.stroke();
  }

  // A night window with stars and falling snow.
  const win = { x: 1180, y: 150, w: 560, h: 420 };
  const sky = ctx.createLinearGradient(0, win.y, 0, win.y + win.h);
  sky.addColorStop(0, '#02061c');
  sky.addColorStop(1, '#0d2160');
  ctx.fillStyle = sky;
  ctx.fillRect(win.x, win.y, win.w, win.h);
  for (let i = 0; i < 140; i++) {
    const r = Math.random() * 2.2 + 0.4;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.65})`;
    ctx.beginPath();
    ctx.arc(win.x + Math.random() * win.w, win.y + Math.random() * win.h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#f4f1d8';
  ctx.beginPath();
  ctx.arc(win.x + win.w * 0.75, win.y + 95, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#03081f';
  ctx.beginPath();
  ctx.arc(win.x + win.w * 0.75 + 18, win.y + 84, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d9e1f2';
  ctx.lineWidth = 18;
  ctx.strokeRect(win.x, win.y, win.w, win.h);
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(win.x + win.w / 2, win.y);
  ctx.lineTo(win.x + win.w / 2, win.y + win.h);
  ctx.moveTo(win.x, win.y + win.h / 2);
  ctx.lineTo(win.x + win.w, win.y + win.h / 2);
  ctx.stroke();

  // "Happy Hanukkah" bunting across the top of the wall.
  const letters = 'HAPPY HANUKKAH';
  const flagWidth = 92;
  const startX = 140;
  ctx.strokeStyle = 'rgba(242,193,78,0.85)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(startX - 40, 70);
  ctx.quadraticCurveTo(startX + (letters.length * flagWidth) / 2, 150, startX + letters.length * flagWidth + 40, 70);
  ctx.stroke();
  ctx.font = 'bold 50px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < letters.length; i++) {
    if (letters[i] === ' ') continue;
    const t = (i + 0.5) / letters.length;
    const x = startX + i * flagWidth + flagWidth / 2;
    const sag = 70 + 4 * t * (1 - t) * 80;
    ctx.fillStyle = i % 2 === 0 ? '#e9eef9' : '#2f62e6';
    ctx.beginPath();
    ctx.moveTo(x - flagWidth / 2 + 4, sag);
    ctx.lineTo(x + flagWidth / 2 - 4, sag);
    ctx.lineTo(x, sag + 120);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = i % 2 === 0 ? '#16307f' : '#ffffff';
    ctx.fillText(letters[i], x, sag + 42);
  }

  // Warm string lights along the top edge.
  for (let x = 30; x < width; x += 70) {
    const glow = ctx.createRadialGradient(x, 26, 0, x, 26, 22);
    glow.addColorStop(0, 'rgba(255,230,150,0.95)');
    glow.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 22, 4, 44, 44);
  }
  return canvasTexture(canvas);
}

function createBackgroundTexture() {
  const { canvas, ctx } = makeCanvas(16, 256);
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#040a24');
  gradient.addColorStop(0.6, '#0b1a4a');
  gradient.addColorStop(1, '#0a1640');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 16, 256);
  return canvasTexture(canvas);
}

// Builds a dreidel with the four traditional letters painted on its sides.
function createDreidel(bodyColor, letterColor) {
  const group = new THREE.Group();
  const letters = ['נ', 'ג', 'ה', 'ש']; // Nun, Gimel, Hei, Shin
  const sideMaterials = letters.map((letter) => {
    const { canvas, ctx } = makeCanvas(128, 128);
    ctx.fillStyle = bodyColor;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 116, 116);
    ctx.fillStyle = letterColor;
    ctx.font = 'bold 84px "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 70);
    return new THREE.MeshStandardMaterial({ map: canvasTexture(canvas), roughness: 0.35, metalness: 0.25 });
  });
  const capMaterial = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.35, metalness: 0.25 });
  const goldMaterial = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.3, metalness: 0.85 });

  // BoxGeometry material order: +x, -x, +y, -y, +z, -z.
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [
    sideMaterials[0], sideMaterials[1], capMaterial, capMaterial, sideMaterials[2], sideMaterials[3],
  ]);
  body.position.y = 0.5;
  body.castShadow = true;
  group.add(body);

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.354, 0.25, 4), goldMaterial);
  tip.rotation.set(Math.PI, Math.PI / 4, 0);
  tip.position.y = 0.125;
  tip.castShadow = true;
  group.add(tip);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10), goldMaterial);
  handle.position.y = 0.9;
  handle.castShadow = true;
  group.add(handle);
  return group;
}

function createMenorah() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8b84a, roughness: 0.28, metalness: 0.9 });
  const candleBlue = new THREE.MeshStandardMaterial({ color: 0x5b8cff, roughness: 0.6 });
  const candleWhite = new THREE.MeshStandardMaterial({ color: 0xf2f5ff, roughness: 0.6 });
  const flameOuterMaterial = new THREE.MeshBasicMaterial({
    color: 0xff9a2e, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flameInnerMaterial = new THREE.MeshBasicMaterial({ color: 0xfff1b8 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 0.18, 32), gold);
  base.position.y = 0.09;
  group.add(base);
  const stemHeight = 1.7;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, stemHeight, 14), gold);
  stem.position.y = 0.18 + stemHeight / 2;
  group.add(stem);

  const armTop = 1.95;
  const armRadii = [0.36, 0.72, 1.08, 1.44];
  for (const radius of armRadii) {
    // A half torus spanning angle 0..PI arcs upward; flipping it over gives the U-shaped arm.
    const arm = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.04, 8, 32, Math.PI), gold);
    arm.rotation.z = Math.PI;
    arm.position.y = armTop;
    group.add(arm);
  }

  const flames = [];
  const candleXs = [-1.44, -1.08, -0.72, -0.36, 0, 0.36, 0.72, 1.08, 1.44];
  const flameGeometry = new THREE.ConeGeometry(0.09, 0.32, 10);
  flameGeometry.translate(0, 0.16, 0);
  const flameCoreGeometry = new THREE.SphereGeometry(0.05, 8, 6);
  const cupGeometry = new THREE.CylinderGeometry(0.09, 0.06, 0.1, 14);
  for (const x of candleXs) {
    const isShamash = x === 0;
    const cupY = isShamash ? armTop + 0.35 : armTop;
    const cup = new THREE.Mesh(cupGeometry, gold);
    cup.position.set(x, cupY + 0.05, 0);
    group.add(cup);
    if (isShamash) {
      const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 10), gold);
      riser.position.set(0, armTop + 0.17, 0);
      group.add(riser);
    }
    const candleHeight = 0.42;
    const candle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, candleHeight, 10),
      isShamash ? candleWhite : candleBlue,
    );
    candle.position.set(x, cupY + 0.1 + candleHeight / 2, 0);
    group.add(candle);

    const flame = new THREE.Group();
    flame.position.set(x, cupY + 0.12 + candleHeight, 0);
    flame.add(new THREE.Mesh(flameGeometry, flameOuterMaterial));
    const core = new THREE.Mesh(flameCoreGeometry, flameInnerMaterial);
    core.position.y = 0.05;
    flame.add(core);
    flame.userData.phase = Math.random() * 10;
    group.add(flame);
    flames.push(flame);
  }

  group.traverse((child) => {
    if (child.isMesh && child.material !== flameOuterMaterial && child.material !== flameInnerMaterial) {
      child.castShadow = true;
    }
  });
  return { group, flames };
}

function createGelt(material) {
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 24), material);
  coin.castShadow = true;
  coin.receiveShadow = true;
  return coin;
}

// Twinkling background sparkles drawn as a single Points object.
function createSparkles(count) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = 1.5 + Math.random() * 10;
    positions[i * 3 + 2] = -10.6 + Math.random() * 6;
    phases[i] = Math.random() * Math.PI * 2;
    sizes[i] = 0.5 + Math.random() * 1.2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float aPhase;
      attribute float aSize;
      varying float vAlpha;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float twinkle = 0.5 + 0.5 * sin(uTime * (1.2 + fract(aPhase) * 1.8) + aPhase * 7.0);
        vAlpha = 0.25 + 0.75 * twinkle * twinkle;
        gl_PointSize = aSize * (34.0 + 24.0 * twinkle) * uPixelRatio / -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        // Four-pointed star: bright core plus thin cross-shaped rays.
        float core = smoothstep(0.22, 0.0, length(p));
        float rays = smoothstep(0.06, 0.0, abs(p.x)) * smoothstep(0.5, 0.0, abs(p.y))
                   + smoothstep(0.06, 0.0, abs(p.y)) * smoothstep(0.5, 0.0, abs(p.x));
        float a = clamp(core + rays * 0.7, 0.0, 1.0) * vAlpha;
        gl_FragColor = vec4(mix(vec3(1.0, 0.86, 0.5), vec3(1.0), core), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

export class GameScene {
  constructor(renderer, container) {
    this.renderer = renderer;
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = createBackgroundTexture();
    this.scene.fog = new THREE.Fog(0x0b1a4a, 16, 34);
    // Procedural studio environment so metals (gold, cast iron) have something to reflect.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(environment, 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    environment.dispose();
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(BASE_VERTICAL_FOV, 1, 0.1, 80);
    this.camera.position.copy(CAMERA_POSITION);
    this.camera.lookAt(CAMERA_TARGET);

    this._buildLights();
    this._buildRoom();
    this._buildDecorations();

    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this.resize());
      this._resizeObserver.observe(container);
    }
    window.addEventListener('resize', () => this.resize());
    this._watchPixelRatio();
  }

  _buildLights() {
    const hemisphere = new THREE.HemisphereLight(0x9db8ff, 0x3a2a1a, 0.6);
    this.scene.add(hemisphere);
    this.scene.add(new THREE.AmbientLight(0x2a3b80, 0.35));

    // Warm key light from the upper right; the only shadow-casting light.
    const key = new THREE.DirectionalLight(0xfff0d6, 2.4);
    key.position.set(4.5, 9, 5);
    key.target.position.set(0, 0, -2);
    key.castShadow = true;
    const shadowSize = IS_COARSE_POINTER ? 1024 : 2048;
    key.shadow.mapSize.set(shadowSize, shadowSize);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    this.scene.add(key);
    this.scene.add(key.target);
    this.keyLight = key;

    // Cool blue rim light from behind to separate objects from the background.
    const rim = new THREE.DirectionalLight(0x6f8dff, 1.1);
    rim.position.set(-5, 5, -9);
    this.scene.add(rim);
  }

  _buildRoom() {
    const cloth = new THREE.MeshStandardMaterial({ map: createTableclothTexture(), roughness: 0.92 });
    const clothSide = new THREE.MeshStandardMaterial({ color: 0x15307d, roughness: 0.95 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 15.5), [
      clothSide, clothSide, cloth, clothSide, clothSide, clothSide,
    ]);
    table.position.set(0, -0.2, -2.75);
    table.receiveShadow = true;
    this.scene.add(table);
    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    cloth.map.anisotropy = anisotropy;

    // Tablecloth drape hanging off the front edge.
    const drape = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.2), clothSide);
    drape.position.set(0, -1.3, 5.001);
    this.scene.add(drape);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x1a1430, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -4;
    this.scene.add(floor);

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 12.8),
      new THREE.MeshStandardMaterial({ map: createWallTexture(), roughness: 0.9 }),
    );
    wall.position.set(0, 3.5, -10.5);
    this.scene.add(wall);

    // Serving plate the fresh latke rests on.
    const plateMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f6ff, roughness: 0.25, metalness: 0.05 });
    const plateRimMaterial = new THREE.MeshStandardMaterial({ color: 0x2f62e6, roughness: 0.3 });
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.48, 0.06, 40), plateMaterial);
    plate.position.set(0, 0.03, 3.2);
    plate.receiveShadow = true;
    this.scene.add(plate);
    const plateRim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.025, 8, 48), plateRimMaterial);
    plateRim.rotation.x = Math.PI / 2;
    plateRim.position.set(0, 0.065, 3.2);
    this.scene.add(plateRim);
  }

  _buildDecorations() {
    const menorah = createMenorah();
    menorah.group.position.set(-4.6, 0, -7.6);
    this.scene.add(menorah.group);
    this.flames = menorah.flames;

    this.flameLight = new THREE.PointLight(0xffb45a, 6, 9, 1.6);
    this.flameLight.position.set(-4.6, 2.7, -7.1);
    this.scene.add(this.flameLight);

    this.dreidels = [];
    const dreidelSpecs = [
      { color: '#2f62e6', letter: '#ffffff', position: [4.4, 0, -6.4], spin: 2.6 },
      { color: '#e9eef9', letter: '#16307f', position: [5.6, 0, -1.6], spin: -1.8 },
      { color: '#f2c14e', letter: '#16307f', position: [-5.4, 0, 0.6], spin: 2.1 },
    ];
    for (const spec of dreidelSpecs) {
      const dreidel = createDreidel(spec.color, spec.letter);
      dreidel.position.set(...spec.position);
      dreidel.userData.spin = spec.spin;
      dreidel.userData.phase = Math.random() * 6;
      this.scene.add(dreidel);
      this.dreidels.push(dreidel);
    }

    const geltMaterial = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.25, metalness: 0.95 });
    const geltSpots = [[3.2, 1.2, 0.3], [3.55, 1.0, 1.4], [3.0, 1.7, 2.2], [-3.4, 1.9, 0.9], [-3.8, 2.6, 2.4]];
    for (const [x, z, angle] of geltSpots) {
      const coin = createGelt(geltMaterial);
      coin.position.set(x, 0.02, z);
      coin.rotation.set(0.05, angle, 0.04);
      this.scene.add(coin);
    }

    this.sparkles = createSparkles(IS_COARSE_POINTER ? 90 : 160);
    this.scene.add(this.sparkles);
  }

  _watchPixelRatio() {
    if (!window.matchMedia) return;
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onChange = () => {
      this.resize();
      this._watchPixelRatio();
    };
    if (query.addEventListener) query.addEventListener('change', onChange, { once: true });
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    // Cap the pixel ratio so high-DPI phones don't render 3x-4x the pixels.
    const maxRatio = IS_COARSE_POINTER ? 1.75 : 2;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, maxRatio);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.sparkles.material.uniforms.uPixelRatio.value = pixelRatio;

    const aspect = width / height;
    this.camera.aspect = aspect;
    // Widen the vertical FOV on narrow screens so the required horizontal span stays visible.
    const requiredTanHalfHorizontal = REQUIRED_HALF_WIDTH / REQUIRED_WIDTH_DEPTH;
    const fittedFov = THREE.MathUtils.radToDeg(2 * Math.atan(requiredTanHalfHorizontal / aspect));
    this.camera.fov = THREE.MathUtils.clamp(fittedFov, BASE_VERTICAL_FOV, MAX_VERTICAL_FOV);
    // The wider portrait FOV pushes the latke up the screen; aim the camera a little higher
    // so the latke sits lower again, leaving a tall area above it to drag through.
    const portraitLift = THREE.MathUtils.clamp((1 - aspect) * 2.2, 0, 1.3);
    this.camera.position.set(CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z);
    this.camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y + portraitLift, CAMERA_TARGET.z);
    this.camera.updateProjectionMatrix();
    this.viewportWidth = width;
    this.viewportHeight = height;
    if (this.onResize) this.onResize(width, height, pixelRatio);
  }

  // Decorative animation only; runs even while the game is paused.
  update(dt, elapsed) {
    for (const flame of this.flames) {
      const phase = flame.userData.phase;
      const flicker = 0.85 + 0.12 * Math.sin(elapsed * 13 + phase) + 0.06 * Math.sin(elapsed * 23 + phase * 2);
      flame.scale.set(1, flicker, 1);
      flame.rotation.z = 0.08 * Math.sin(elapsed * 7 + phase);
    }
    this.flameLight.intensity = 5.5 + 0.8 * Math.sin(elapsed * 11) + 0.4 * Math.sin(elapsed * 27);

    for (const dreidel of this.dreidels) {
      dreidel.rotation.y += dreidel.userData.spin * dt;
      const wobble = 0.06 + 0.03 * Math.sin(elapsed * 0.7 + dreidel.userData.phase);
      dreidel.rotation.x = wobble * Math.sin(elapsed * 3 + dreidel.userData.phase);
      dreidel.rotation.z = wobble * Math.cos(elapsed * 3 + dreidel.userData.phase);
    }
    this.sparkles.material.uniforms.uTime.value = elapsed;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
