// Procedural jack-o'-lantern + smash effect, built from Three.js primitives only (no model files).
// Local space: +y is "up" on the tracked image, +z points out of the image toward the viewer.
// The body has radius 0.5 (diameter 1), so scaling the root by s gives a pumpkin s image-widths wide.

import * as THREE from './vendor/three/three.module.js';

const LOBES = 10;
const FLATTEN = 0.82;

// Radial scale around the vertical axis: ridge crest at +z (theta = pi/2), grooves between ridges.
function ridgeProfile(theta) {
  const c = Math.cos(LOBES * (theta - Math.PI / 2));
  return 0.86 + 0.14 * Math.pow((1 + c) / 2, 0.7);
}

function buildBodyGeometry() {
  const W = 64;
  const H = 40;
  const g = new THREE.SphereGeometry(0.5, W, H);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const dark = new THREE.Color('#b53f08');
  const light = new THREE.Color('#ff8e26');
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const rxz = Math.hypot(x, z);
    const p = ridgeProfile(Math.atan2(z, x));
    const dimple = 0.06 * Math.exp(-Math.pow(rxz / 0.13, 2));
    pos.setXYZ(i, x * p, y * FLATTEN - Math.sign(y) * dimple, z * p);
    c.lerpColors(dark, light, (p - 0.86) / 0.14);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();

  // Hide the sphere's UV seam and pole creases: average duplicated normals.
  const n = g.attributes.normal;
  const row = W + 1;
  const v = new THREE.Vector3();
  for (let iy = 0; iy <= H; iy++) {
    const a = iy * row;
    const b = iy * row + W;
    v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
  for (let ix = 0; ix <= W; ix++) {
    n.setXYZ(ix, 0, 1, 0);
    n.setXYZ(H * row + ix, 0, -1, 0);
  }
  n.needsUpdate = true;
  return g;
}

// Face painted into textures. Sphere UV: u = 0.25 is the +z side, v = 0.5 the equator.
function buildFaceTextures() {
  const W = 1024;
  const H = 512;
  const cx = 0.25 * W;
  const cy = 0.5 * H + 6;

  const shapes = (ctx) => {
    const tri = (pts) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fill();
    };
    tri([[cx - 100, cy - 26], [cx - 34, cy - 30], [cx - 66, cy - 92]]);       // left eye
    tri([[cx + 34, cy - 30], [cx + 100, cy - 26], [cx + 66, cy - 92]]);       // right eye
    tri([[cx - 16, cy + 6], [cx + 16, cy + 6], [cx, cy - 22]]);               // nose
    // jagged grin
    ctx.beginPath();
    const left = cx - 112;
    const right = cx + 112;
    const topY = cy + 36;
    ctx.moveTo(left, topY - 8);
    const teeth = 7;
    for (let i = 0; i <= teeth; i++) {
      const x = left + ((right - left) * i) / teeth;
      const y = topY + (i % 2 === 0 ? 0 : 20) - Math.sin((i / teeth) * Math.PI) * 6;
      ctx.lineTo(x, y);
    }
    for (let i = teeth; i >= 0; i--) {
      const x = left + ((right - left) * i) / teeth;
      const y = topY + 52 + (i % 2 === 0 ? 0 : -18) + Math.sin((i / teeth) * Math.PI) * 22;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };

  const mk = (draw) => {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    draw(cv.getContext('2d'));
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };

  const map = mk((ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2a1100';
    shapes(ctx);
  });
  const emissive = mk((ctx) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffb02e';
    shapes(ctx);
  });
  return { map, emissive };
}

function buildShadowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createPumpkin(config) {
  const root = new THREE.Group();
  root.name = 'pumpkin-root';

  // --- body ---
  const faceTex = buildFaceTextures();
  const body = new THREE.Mesh(
    buildBodyGeometry(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: faceTex.map,
      emissiveMap: faceTex.emissive,
      emissive: new THREE.Color('#ff9a1a'),
      emissiveIntensity: 1.2,
      roughness: 0.55,
      metalness: 0,
    })
  );
  body.name = 'pumpkin-body';
  root.add(body);

  // --- stem ---
  const stemGeo = new THREE.CylinderGeometry(0.045, 0.075, 0.2, 10, 4);
  const sp = stemGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i) + 0.1;           // 0 at base .. 0.2 at tip
    sp.setX(i, sp.getX(i) + y * y * 1.1);  // curl sideways
  }
  stemGeo.computeVertexNormals();
  const stem = new THREE.Mesh(stemGeo, new THREE.MeshStandardMaterial({ color: '#5f7d22', roughness: 0.85 }));
  stem.position.set(-0.01, 0.5 * FLATTEN - 0.07 + 0.1, 0);
  stem.name = 'pumpkin-stem';
  body.add(stem);

  // --- contact shadow on the image ---
  const shadowTex = buildShadowTexture();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadow.position.set(0.02, -0.04, -0.495);
  shadow.name = 'pumpkin-shadow';
  root.add(shadow);

  // --- hit proxy (invisible, ray-tested) ---
  const hitProxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.5 * config.hitProxyScale, 14, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitProxy.name = 'pumpkin-hit-proxy';
  root.add(hitProxy);

  // --- fragments for the smash ---
  const fragGeo = new THREE.IcosahedronGeometry(0.075, 0);
  const pulpGeo = new THREE.IcosahedronGeometry(0.045, 0);
  const fragMat = new THREE.MeshStandardMaterial({ color: '#ff7f1f', roughness: 0.6, flatShading: true });
  const pulpMat = new THREE.MeshStandardMaterial({ color: '#ffcc55', emissive: '#aa5a00', emissiveIntensity: 0.6, roughness: 0.7, flatShading: true });
  const fragments = [];
  const FRAGS = 14;
  const PULP = 8;
  for (let i = 0; i < FRAGS + PULP; i++) {
    const m = new THREE.Mesh(i < FRAGS ? fragGeo : pulpGeo, i < FRAGS ? fragMat : pulpMat);
    m.visible = false;
    root.add(m);
    fragments.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), base: 1 });
  }

  // --- animation state ---
  const SQUASH_T = 0.12;
  const BURST_T = 0.62;
  let phase = 'idle'; // idle | squash | burst
  let t = 0;
  let onDone = null;
  let idleClock = 0;

  function reset() {
    phase = 'idle';
    t = 0;
    onDone = null;
    body.visible = true;
    shadow.visible = true;
    body.scale.set(1, 1, 1);
    body.position.set(0, 0, 0);
    for (const f of fragments) f.mesh.visible = false;
  }

  function startSmash(done) {
    if (phase !== 'idle') return false; // never overlap smash animations
    phase = 'squash';
    t = 0;
    onDone = done || null;
    return true;
  }

  function explode() {
    body.visible = false;
    shadow.visible = false;
    for (const f of fragments) {
      const m = f.mesh;
      m.visible = true;
      m.position.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.25, 0.05);
      m.scale.setScalar(1);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      // Burst outward, biased toward the viewer so pieces do not fly through the image.
      f.vel.set(Math.random() - 0.5, Math.random() - 0.35, 0.2 + Math.random() * 0.8).normalize().multiplyScalar(0.8 + Math.random() * 0.9);
      f.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    }
  }

  function update(dt) {
    idleClock += dt;
    if (phase === 'idle') {
      const k = 1 + Math.sin(idleClock * 3) * 0.015; // subtle breathing
      body.scale.set(k, 1 / k, k);
      return;
    }
    t += dt;
    if (phase === 'squash') {
      const k = Math.min(1, t / SQUASH_T);
      const e = k * k;
      body.scale.set(1 + 0.3 * e, 1 - 0.62 * e, 1 + 0.3 * e);
      if (k >= 1) {
        phase = 'burst';
        t = 0;
        explode();
      }
    } else if (phase === 'burst') {
      const k = Math.min(1, t / BURST_T);
      for (const f of fragments) {
        f.vel.y -= 2.6 * dt; // gravity along the image's down direction
        f.mesh.position.addScaledVector(f.vel, dt);
        f.mesh.rotation.x += f.spin.x * dt;
        f.mesh.rotation.y += f.spin.y * dt;
        f.mesh.scale.setScalar(Math.max(0.001, 1 - k * k));
      }
      if (k >= 1) {
        phase = 'idle';
        for (const f of fragments) f.mesh.visible = false;
        const cb = onDone;
        onDone = null;
        if (cb) cb();
      }
    }
  }

  function dispose() {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        for (const key of ['map', 'emissiveMap']) if (o.material[key]) o.material[key].dispose();
        o.material.dispose();
      }
    });
    root.removeFromParent();
  }

  reset();
  return { root, body, hitProxy, reset, startSmash, update, dispose, get busy() { return phase !== 'idle'; } };
}
