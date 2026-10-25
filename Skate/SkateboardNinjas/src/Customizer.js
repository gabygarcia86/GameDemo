// Customize screen: pick colours for the ninja's gi, headband, belt, shoes and
// hands, pick a skateboard or a hoverboard, and colour its wheels (or hover
// pulse), sides, top and bottom (one colour or a two-colour fade, plus an
// optional sticker). The look is saved, pushed to the art in art/ninja.js,
// and previewed live on a small canvas.

import { NinjaAnimator, drawBoard, setLook } from './art/ninja.js';

export const DEFAULT_LOOK = {
  gi: '#2f3a7a',
  band: '#ff2e55',
  belt: '#ff2e55',
  shoe: '#14162b',
  hand: '#e4e7f5',
  boardType: 'skate',
  wheel: '#ffe066',
  pulse: '#3de1ff',
  side: '#ffb703',
  top: '#25252f',
  bottomMode: 'gradient',
  bottom1: '#00c2d1',
  bottom2: '#ff2e7e',
  sticker: 'shuriken',
};

const PALETTE = [
  '#2f3a7a', '#14162b', '#25252f', '#e4e7f5', '#ff2e55', '#ff2e7e', '#ff8c1a',
  '#ffb703', '#ffe066', '#2bb673', '#00c2d1', '#3de1ff', '#3d7bff', '#7b2ff7', '#8b5a2b',
];

export const STICKERS = [
  'none', 'shuriken',
  '💩', '😎', '🔥', '💀', '⭐', '🌈', '🍕', '🦄', '👽', '🐉', '🍩', '⚡',
  '🤘', '👾', '🐱', '🌮', '🎃', '👻', '🥷', '💎', '🚀', '🍉', '😂', '🤖',
];

const COLOR_KEYS = ['gi', 'band', 'belt', 'shoe', 'hand', 'wheel', 'pulse', 'side', 'top', 'bottom1', 'bottom2'];
const HEX = /^#[0-9a-f]{6}$/i;
const VIEW_W = 300;
const VIEW_H = 220;
const LABEL_FONT = '900 11px "Arial Black", "Segoe UI Black", sans-serif';
const STAR_SVG = '<svg viewBox="-10 -10 20 20" aria-hidden="true"><path d="M8 0 2.8 1.1 0 8-1.1 2.8-8 0-2.8-1.1 0-8 1.1-2.8Z" transform="rotate(22.5)" fill="#ffe066" stroke="#0c0d1f" stroke-width="1.2" stroke-linejoin="round"/></svg>';
// Just enough of a Player for the animator's grounded pose.
const PREVIEW_PLAYER = { state: 'grounded', angle: 0, invuln: 0, landSquash: 0, popTimer: 0, throwTimer: 0 };

const $ = (id) => document.getElementById(id);

function loadLook(storage) {
  const look = { ...DEFAULT_LOOK };
  const saved = storage.get('look', null);
  if (saved && typeof saved === 'object') {
    for (const k of COLOR_KEYS) if (HEX.test(saved[k])) look[k] = saved[k].toLowerCase();
    if (saved.boardType === 'skate' || saved.boardType === 'hover') look.boardType = saved.boardType;
    if (saved.bottomMode === 'solid' || saved.bottomMode === 'gradient') look.bottomMode = saved.bottomMode;
    if (STICKERS.includes(saved.sticker)) look.sticker = saved.sticker;
  }
  return look;
}

export class Customizer {
  constructor(storage) {
    this.storage = storage;
    this.look = loadLook(storage);
    setLook(this.look);

    this.canvas = $('custom-preview');
    this.ctx = this.canvas.getContext('2d');
    this.animator = new NinjaAnimator();
    this.rows = {};
    this.raf = 0;
    this.lastNow = 0;
    this.tick = this.tick.bind(this);
    this.build();
    this.sync();
  }

  build() {
    for (const row of document.querySelectorAll('#customize-screen .cz-row[data-key]')) {
      const key = row.dataset.key;
      const label = document.createElement('span');
      label.className = 'cz-label';
      label.textContent = row.dataset.label;
      const group = document.createElement('div');
      group.className = 'cz-options';
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', `${row.dataset.label} color`);

      const swatches = PALETTE.map((color) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-label', color);
        b.style.setProperty('--c', color);
        b.addEventListener('click', () => this.set(key, color));
        group.append(b);
        return b;
      });

      // Any colour at all via the native picker.
      const custom = document.createElement('label');
      custom.className = 'swatch swatch-custom';
      custom.title = 'Pick any color';
      const input = document.createElement('input');
      input.type = 'color';
      input.setAttribute('aria-label', `Custom ${row.dataset.label.toLowerCase()} color`);
      input.addEventListener('input', () => this.set(key, input.value));
      custom.append(input);
      group.append(custom);

      row.append(label, group);
      this.rows[key] = { label, swatches, custom, input, row };
    }

    const stickers = $('cz-stickers');
    this.stickerButtons = STICKERS.map((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sticker';
      b.setAttribute('role', 'radio');
      if (s === 'none') {
        b.classList.add('sticker-none');
        b.textContent = 'NONE';
        b.setAttribute('aria-label', 'No sticker');
      } else if (s === 'shuriken') {
        b.innerHTML = STAR_SVG;
        b.setAttribute('aria-label', 'Ninja star');
      } else {
        b.textContent = s;
      }
      b.addEventListener('click', () => this.set('sticker', s));
      stickers.append(b);
      return b;
    });

    this.modeButtons = [...document.querySelectorAll('#customize-screen [data-mode]')];
    for (const b of this.modeButtons) b.addEventListener('click', () => this.set('bottomMode', b.dataset.mode));
    this.typeButtons = [...document.querySelectorAll('#customize-screen [data-board]')];
    for (const b of this.typeButtons) b.addEventListener('click', () => this.set('boardType', b.dataset.board));

    this.tabs = [...document.querySelectorAll('#customize-screen [role="tab"]')];
    for (const tab of this.tabs) tab.addEventListener('click', () => this.showTab(tab));

    $('custom-reset-btn').addEventListener('click', () => {
      this.look = { ...DEFAULT_LOOK };
      this.apply();
    });
  }

  showTab(active) {
    for (const tab of this.tabs) {
      const on = tab === active;
      tab.setAttribute('aria-selected', String(on));
      tab.classList.toggle('on', on);
      $(tab.getAttribute('aria-controls')).hidden = !on;
    }
  }

  set(key, value) {
    this.look[key] = value;
    this.apply();
  }

  apply() {
    setLook(this.look);
    this.storage.set('look', this.look);
    this.sync();
  }

  // Reflect the current look in the controls.
  sync() {
    const L = this.look;
    for (const key of COLOR_KEYS) {
      const r = this.rows[key];
      if (!r) continue;
      let matched = false;
      r.swatches.forEach((b, i) => {
        const on = PALETTE[i] === L[key];
        matched ||= on;
        b.setAttribute('aria-checked', String(on));
      });
      r.custom.classList.toggle('checked', !matched);
      r.custom.style.setProperty('--c', L[key]);
      r.input.value = L[key];
    }
    const gradient = L.bottomMode === 'gradient';
    for (const b of this.modeButtons) {
      const on = b.dataset.mode === L.bottomMode;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('on', on);
    }
    for (const b of this.typeButtons) {
      const on = b.dataset.board === L.boardType;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('on', on);
    }
    this.rows.wheel.row.hidden = L.boardType !== 'skate';
    this.rows.pulse.row.hidden = L.boardType !== 'hover';
    this.rows.bottom1.label.textContent = gradient ? 'Color 1' : 'Color';
    this.rows.bottom2.row.hidden = !gradient;
    this.stickerButtons.forEach((b, i) => b.setAttribute('aria-checked', String(STICKERS[i] === L.sticker)));
  }

  open() {
    this.showTab(this.tabs[0]);
    this.lastNow = 0;
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  close() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  tick(now) {
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    this.render(now / 1000, dt);
    this.raf = requestAnimationFrame(this.tick);
  }

  // Ninja on the left, the deck's top and bottom on the right.
  render(t, dt) {
    const cv = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(cv.clientWidth * dpr);
    const h = Math.round((w * VIEW_H) / VIEW_W);
    if (w === 0) return;
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const k = w / VIEW_W;
    ctx.setTransform(k, 0, 0, k, 0, 0);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(80, 202, 66, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(80, 200);
    ctx.scale(1.75, 1.75);
    this.animator.update(dt, PREVIEW_PLAYER, null, t);
    this.animator.draw(ctx, PREVIEW_PLAYER, 0, 0, t, 0.6);
    ctx.restore();

    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#c9bfe6';
    ctx.fillText('TOP', 228, 40);
    ctx.fillText('BOTTOM', 228, 128);

    for (const [y, turns] of [[70, 0.75], [158, 0.25]]) {
      ctx.save();
      ctx.translate(228, y);
      ctx.scale(1.9, 1.9);
      drawBoard(ctx, turns, 0, t);
      ctx.restore();
    }
  }
}
