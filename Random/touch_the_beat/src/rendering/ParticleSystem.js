// Pooled particles and expanding rings stored in typed arrays (struct of
// arrays), so bursts never allocate. Dead particles are swap-removed.

export class ParticleSystem {
  constructor(max = 600, maxRings = 32) {
    this.resize(max);
    this.rMax = maxRings;
    this.rx = new Float32Array(maxRings);
    this.ry = new Float32Array(maxRings);
    this.rr = new Float32Array(maxRings);
    this.rGrow = new Float32Array(maxRings);
    this.rLife = new Float32Array(maxRings);
    this.rAge = new Float32Array(maxRings);
    this.rWidth = new Float32Array(maxRings);
    this.rColor = new Uint8Array(maxRings);
    this.rCount = 0;
  }

  resize(max) {
    this.max = max;
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.size = new Float32Array(max);
    this.color = new Uint8Array(max);
    this.count = 0;
    this.seed = 1;
  }

  rand() {
    // cheap LCG — visual randomness only
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  clear() {
    this.count = 0;
    this.rCount = 0;
  }

  emit(x, y, color, n, speed, { spread = Math.PI * 2, angle = -Math.PI / 2, life = 0.6, size = 3, sizeVar = 2 } = {}) {
    for (let k = 0; k < n; k++) {
      let i = this.count;
      if (i >= this.max) {
        // pool exhausted: recycle the oldest-ish slot
        i = Math.floor(this.rand() * this.max);
      } else {
        this.count++;
      }
      const a = angle + (this.rand() - 0.5) * spread;
      const s = speed * (0.35 + this.rand() * 0.9);
      this.x[i] = x;
      this.y[i] = y;
      this.vx[i] = Math.cos(a) * s;
      this.vy[i] = Math.sin(a) * s;
      this.life[i] = life * (0.6 + this.rand() * 0.6);
      this.age[i] = 0;
      this.size[i] = size + this.rand() * sizeVar;
      this.color[i] = color;
    }
  }

  ring(x, y, color, radius, grow, life, width = 3) {
    let i = this.rCount;
    if (i >= this.rMax) i = 0;
    else this.rCount++;
    this.rx[i] = x;
    this.ry[i] = y;
    this.rr[i] = radius;
    this.rGrow[i] = grow;
    this.rLife[i] = life;
    this.rAge[i] = 0;
    this.rWidth[i] = width;
    this.rColor[i] = color;
  }

  update(dt, gravity = 900) {
    const drag = Math.exp(-dt * 2.2);
    for (let i = 0; i < this.count; ) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        const j = --this.count;
        this.x[i] = this.x[j];
        this.y[i] = this.y[j];
        this.vx[i] = this.vx[j];
        this.vy[i] = this.vy[j];
        this.life[i] = this.life[j];
        this.age[i] = this.age[j];
        this.size[i] = this.size[j];
        this.color[i] = this.color[j];
        continue;
      }
      this.vx[i] *= drag;
      this.vy[i] = this.vy[i] * drag + gravity * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      i++;
    }
    for (let i = 0; i < this.rCount; ) {
      this.rAge[i] += dt;
      if (this.rAge[i] >= this.rLife[i]) {
        const j = --this.rCount;
        this.rx[i] = this.rx[j];
        this.ry[i] = this.ry[j];
        this.rr[i] = this.rr[j];
        this.rGrow[i] = this.rGrow[j];
        this.rLife[i] = this.rLife[j];
        this.rAge[i] = this.rAge[j];
        this.rWidth[i] = this.rWidth[j];
        this.rColor[i] = this.rColor[j];
        continue;
      }
      this.rr[i] += this.rGrow[i] * dt;
      i++;
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {string[]} colors css colours by index
   * @param {HTMLCanvasElement[]|null} sprites glow dot per colour (null = plain squares)
   */
  render(ctx, colors, sprites, additive) {
    const prevOp = ctx.globalCompositeOperation;
    if (additive) ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.rCount; i++) {
      const k = 1 - this.rAge[i] / this.rLife[i];
      ctx.globalAlpha = k * k;
      ctx.strokeStyle = colors[this.rColor[i]];
      ctx.lineWidth = this.rWidth[i] * (0.4 + k);
      ctx.beginPath();
      ctx.arc(this.rx[i], this.ry[i], this.rr[i], 0, Math.PI * 2);
      ctx.stroke();
    }
    if (sprites) {
      for (let i = 0; i < this.count; i++) {
        const k = 1 - this.age[i] / this.life[i];
        const s = this.size[i] * (0.5 + k) * 3;
        ctx.globalAlpha = k;
        ctx.drawImage(sprites[this.color[i]], this.x[i] - s / 2, this.y[i] - s / 2, s, s);
      }
    } else {
      // low quality: batch by colour, plain squares
      for (let c = 0; c < colors.length; c++) {
        ctx.fillStyle = colors[c];
        ctx.globalAlpha = 0.85;
        for (let i = 0; i < this.count; i++) {
          if (this.color[i] !== c) continue;
          const s = this.size[i] * (1 - this.age[i] / this.life[i]) + 1;
          ctx.fillRect(this.x[i] - s / 2, this.y[i] - s / 2, s, s);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prevOp;
  }
}
