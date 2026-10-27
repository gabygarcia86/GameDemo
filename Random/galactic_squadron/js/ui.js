/**
 * User interface: responsive layout, DOM menus (title, settings, help, pause,
 * game over), touch controls, and the canvas-drawn HUD and banners.
 * DOM is only touched on state changes — never every frame.
 */
import { CONFIG, WORLD, DEFAULT_SETTINGS } from './config.js';
import { storage } from './storage.js';
import { getSprites, drawPowerIcon, POWERUP_COLORS } from './sprites.js';
import { POWERUP_INFO } from './powerups.js';

const { W, H } = WORLD;

const NUM_FONT = (px) => `800 ${px}px ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace`;
const UI_FONT = (px, w = 800) => `${w} ${px}px "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif`;

const pad = (n, len = 7) => String(Math.floor(n)).padStart(len, '0');

export class UI {
  constructor(settings, audio) {
    this.settings = settings;
    this.audio = audio;
    this.game = null;
    this.$ = (sel) => document.querySelector(sel);

    this.app = this.$('#app');
    this.viewport = this.$('#viewport');
    this.frame = this.$('#frame');
    this.canvas = this.$('#game');
    this.hudButtons = this.$('#hud-buttons');
    this.touchControls = this.$('#touch-controls');
    this.movePad = this.$('#move-pad');
    this.fireButton = this.$('#btn-fire');
    this.shieldButton = this.$('#btn-shield');
    this.screens = {
      title: this.$('#screen-title'),
      settings: this.$('#screen-settings'),
      help: this.$('#screen-help'),
      pause: this.$('#screen-pause'),
      over: this.$('#screen-over'),
    };
    this.current = null;
    this.returnTo = null;
    this.frameWidth = W;
    this.touchMode = false;
    this.lastShieldPct = -1;
    this.hudGradient = null;
  }

  bind(game) {
    this.game = game;

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this.audio.unlock();
      this.audio.play('click');
      this.handleAction(btn.dataset.action, btn);
    });

    document.querySelectorAll('[data-setting]').forEach((el) => {
      const evt = el.type === 'range' ? 'input' : 'change';
      el.addEventListener(evt, () => this.onSettingInput(el));
    });

    let resizeQueued = false;
    const onResize = () => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => {
        resizeQueued = false;
        this.layout();
      });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.setTouchMode(coarse || 'ontouchstart' in window);

    this.buildHelpIcons();
    this.syncSettingsForm();
    this.updateHighScore(game.highScore);
    this.layout();
    this.show('title');
  }

  handleAction(action, btn) {
    const game = this.game;
    switch (action) {
      case 'start':
      case 'restart':
      case 'resume':
      case 'title':
        game.requestAction(action);
        break;
      case 'pause':
        game.requestAction('pause');
        break;
      case 'mute':
        game.toggleMute();
        break;
      case 'settings':
        this.openSub('settings');
        break;
      case 'help':
        this.openSub('help');
        break;
      case 'back':
        this.back();
        break;
      case 'reset-hiscore':
        if (btn.dataset.armed === '1') {
          game.resetHighScore();
          btn.dataset.armed = '';
          btn.textContent = 'HIGH SCORE CLEARED';
        } else {
          btn.dataset.armed = '1';
          btn.textContent = 'TAP AGAIN TO CONFIRM';
        }
        break;
    }
  }

  /* ---------------------------------------------------------------- screens */

  show(name) {
    for (const key in this.screens) this.screens[key].hidden = key !== name;
    this.current = name;
    const screen = name && this.screens[name];
    if (screen) {
      const first = screen.querySelector('.btn.primary') || screen.querySelector('button');
      if (first && !this.touchMode) first.focus({ preventScroll: true });
      const panel = screen.querySelector('.panel');
      if (panel) panel.scrollTop = 0;
    } else if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    this.updateChrome();
  }

  hideAll() {
    this.show(null);
  }

  openSub(name) {
    this.returnTo = this.current;
    const reset = this.$('[data-action="reset-hiscore"]');
    if (reset) {
      reset.dataset.armed = '';
      reset.textContent = 'RESET HIGH SCORE';
    }
    this.show(name);
  }

  /** Leaves Settings/Help. Returns true if a sub-screen was closed. */
  back() {
    if (this.current !== 'settings' && this.current !== 'help') return false;
    this.show(this.returnTo || 'title');
    this.returnTo = null;
    return true;
  }

  showTitle() {
    this.updateHighScore(this.game.highScore);
    this.show('title');
  }

  showPause() {
    this.show('pause');
  }

  showGameOver(data) {
    this.$('#over-score').textContent = data.score.toLocaleString();
    this.$('#over-best').textContent = data.best.toLocaleString();
    this.$('#over-stage').textContent = String(data.stage);
    this.$('#over-kills').textContent = String(data.kills);
    this.$('#over-new').hidden = !data.newBest;
    this.show('over');
  }

  updateHighScore(value) {
    this.$('#title-hiscore').textContent = value.toLocaleString();
  }

  /** Shows/hides in-game buttons and touch controls to match the game state. */
  updateChrome() {
    const playing = this.game ? this.game.isActivePlay() : false;
    const paused = this.current === 'pause' || (this.game && this.game.state === 'PAUSED');
    this.hudButtons.hidden = !(playing || paused) || this.current === 'settings' || this.current === 'help';
    this.touchControls.classList.toggle('live', this.touchMode && playing);
  }

  updateMute() {
    const muted = this.settings.muted;
    document.querySelectorAll('[data-action="mute"]').forEach((b) => {
      b.setAttribute('aria-pressed', String(muted));
      b.classList.toggle('is-muted', muted);
      const label = b.querySelector('.label');
      if (label) label.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
      b.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    });
  }

  setTouchMode(on) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    document.body.classList.toggle('touch', on);
    this.layout();
    this.updateChrome();
  }

  /** Throttled DOM update for the shield button cooldown ring. */
  updateShieldButton(ratio) {
    const pct = Math.round(ratio * 20) * 5;
    if (pct === this.lastShieldPct) return;
    this.lastShieldPct = pct;
    this.shieldButton.style.setProperty('--cool', pct + '%');
    this.shieldButton.classList.toggle('ready', pct === 0);
  }

  /* --------------------------------------------------------------- settings */

  syncSettingsForm() {
    document.querySelectorAll('[data-setting]').forEach((el) => {
      const v = this.settings[el.dataset.setting];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = String(v);
    });
    this.updateMute();
  }

  onSettingInput(el) {
    const key = el.dataset.setting;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'range') v = Number(el.value);
    else if (key === 'startLives') v = Number(el.value);
    else v = el.value;
    this.settings[key] = v;
    this.saveSettings();
    this.syncSettingsForm();
    this.game.applySettings();
  }

  saveSettings() {
    const out = {};
    for (const k in DEFAULT_SETTINGS) out[k] = this.settings[k];
    storage.set('settings', out);
  }

  buildHelpIcons() {
    const sprites = getSprites();
    document.querySelectorAll('canvas[data-icon]').forEach((c) => {
      const name = c.dataset.icon;
      const size = 44;
      c.width = size * 2;
      c.height = size * 2;
      const g = c.getContext('2d');
      g.scale(2, 2);
      if (POWERUP_COLORS[name]) {
        const s = sprites.powerups[name];
        g.drawImage(s.canvas, (size - s.w) / 2, (size - s.h) / 2, s.w, s.h);
        return;
      }
      const s = sprites[name];
      if (!s) return;
      const k = Math.min(1, (size - 4) / Math.max(s.w, s.h));
      g.translate(size / 2, size / 2);
      if (name !== 'player' && name !== 'falcon') g.rotate(Math.PI); // enemies face down
      g.drawImage(s.canvas, (-s.w * k) / 2, (-s.h * k) / 2, s.w * k, s.h * k);
    });
  }

  /* ----------------------------------------------------------------- layout */

  /**
   * Fits the 9:16 playfield into the window. On touch devices, space is
   * reserved for the controls (a bar below in portrait, side columns in
   * landscape) so thumbs never cover the action.
   */
  layout() {
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    if (!vw || !vh) return;
    let mode = 'none';
    let availW = vw;
    let availH = vh;
    let barH = 0;
    let sideW = 0;

    if (this.touchMode) {
      if (vw / vh > 0.85) {
        mode = 'side';
        sideW = Math.min(220, Math.max(120, vw * 0.17));
        availW = vw - sideW * 2;
      } else {
        mode = 'bottom';
        barH = Math.min(150, Math.max(104, vh * 0.15));
        availH = vh - barH;
      }
    }

    const scale = Math.min(availW / W, availH / H);
    const fw = Math.floor(W * scale);
    const fh = Math.floor(H * scale);
    const left = Math.round((vw - fw) / 2);
    const top = mode === 'bottom' ? Math.round((vh - fh - barH) / 2) : Math.round((vh - fh) / 2);

    Object.assign(this.frame.style, { width: fw + 'px', height: fh + 'px', left: left + 'px', top: top + 'px' });
    this.frame.style.setProperty('--s', String(fw / W));
    this.frameWidth = fw;

    const tc = this.touchControls;
    tc.dataset.mode = mode;
    if (mode === 'bottom') {
      Object.assign(tc.style, { left: '0px', width: vw + 'px', top: top + fh + 'px', height: barH + 'px' });
    } else if (mode === 'side') {
      Object.assign(tc.style, { left: '0px', width: vw + 'px', top: '0px', height: vh + 'px' });
      tc.style.setProperty('--side', Math.max(sideW, left) + 'px');
    }

    const dpr = Math.min(window.devicePixelRatio || 1, this.settings.reducedEffects ? 1.5 : 2);
    const cw = Math.round(fw * dpr);
    const ch = Math.round(fh * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    if (this.game) this.game.setView(cw / W);
  }

  /* -------------------------------------------------------------------- HUD */

  drawHUD(ctx, game) {
    if (!this.hudGradient) {
      this.hudGradient = ctx.createLinearGradient(0, 0, 0, 100);
      this.hudGradient.addColorStop(0, 'rgba(2,4,12,0.8)');
      this.hudGradient.addColorStop(1, 'rgba(2,4,12,0)');
    }
    ctx.fillStyle = this.hudGradient;
    ctx.fillRect(0, 0, W, 100);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = UI_FONT(12, 700);
    ctx.fillStyle = '#8fa3d9';
    ctx.fillText('SCORE', 18, 24);
    ctx.font = NUM_FONT(26);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(pad(game.score), 18, 50);

    ctx.textAlign = 'center';
    ctx.font = UI_FONT(12, 700);
    ctx.fillStyle = '#8fa3d9';
    ctx.fillText('HIGH SCORE', W / 2 - 10, 24);
    ctx.font = NUM_FONT(20);
    ctx.fillStyle = '#7fe9ff';
    ctx.fillText(pad(Math.max(game.highScore, game.score)), W / 2 - 10, 48);

    ctx.textAlign = 'left';
    ctx.font = UI_FONT(14, 800);
    ctx.fillStyle = '#c9a7ff';
    ctx.fillText('STAGE ' + game.stage, 18, 76);

    if (game.multiplier > 1 || game.streak >= 3) {
      const k = game.streakTimer / CONFIG.scoring.streakWindow;
      ctx.textAlign = 'center';
      ctx.font = NUM_FONT(game.multiplier > 1 ? 18 : 14);
      ctx.fillStyle = game.multiplier >= 3 ? '#ffb02e' : '#ffd23f';
      ctx.fillText((game.multiplier > 1 ? 'x' + game.multiplier + '  ' : '') + 'STREAK ' + game.streak, W / 2 - 10, 74);
      ctx.fillStyle = 'rgba(255,210,63,0.25)';
      ctx.fillRect(W / 2 - 70, 80, 120, 3);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(W / 2 - 70, 80, 120 * Math.max(0, k), 3);
    }

    this.drawShieldStatus(ctx, game.player);
    if (game.boss && game.boss.state !== 'dead') this.drawBossBar(ctx, game.boss);
    this.drawLives(ctx, game);
    this.drawPowerups(ctx, game);
  }

  drawShieldStatus(ctx, player) {
    const cd = player.shieldCooldown;
    const max = CONFIG.player.shieldAbility.cooldown;
    // On touch devices the SHIELD button shows the cooldown, and the HUD buttons may be large.
    if (this.touchMode) {
      this.updateShieldButton(cd / max);
      return;
    }
    const x = W - 18;
    const y = 76;
    ctx.save();
    ctx.translate(x - 104, y - 5);
    drawPowerIcon(ctx, 'shield', 7, cd > 0 ? '#5d6b8c' : POWERUP_COLORS.shield);
    ctx.restore();
    ctx.textAlign = 'right';
    ctx.font = UI_FONT(12, 800);
    if (cd > 0) {
      ctx.fillStyle = '#5d6b8c';
      ctx.fillText('SHIELD', x - 30, y);
      ctx.fillStyle = 'rgba(79,195,255,0.2)';
      ctx.fillRect(x - 26, y - 8, 26, 5);
      ctx.fillStyle = '#4fc3ff';
      ctx.fillRect(x - 26, y - 8, 26 * (1 - cd / max), 5);
    } else {
      ctx.fillStyle = POWERUP_COLORS.shield;
      ctx.fillText('SHIELD READY', x, y);
    }
  }

  drawBossBar(ctx, boss) {
    const x = 70;
    const y = 96;
    const w = W - 140;
    const k = boss.hp / boss.maxHp;
    const shown = boss.state === 'intro' ? Math.min(1, boss.t / CONFIG.boss.introTime) : k;
    ctx.textAlign = 'center';
    ctx.font = UI_FONT(12, 800);
    ctx.fillStyle = '#ffb3bd';
    ctx.fillText(boss.name, W / 2, y - 4);
    ctx.fillStyle = 'rgba(10,12,24,0.85)';
    ctx.fillRect(x - 2, y, w + 4, 10);
    const color = k > 2 / 3 ? '#ff5468' : k > 1 / 3 ? '#ff8a2a' : '#ff2e2e';
    ctx.fillStyle = boss.invuln > 0 ? '#ffffff' : color;
    ctx.fillRect(x, y + 2, w * shown, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(x + w / 3 - 1, y, 2, 10);
    ctx.fillRect(x + (2 * w) / 3 - 1, y, 2, 10);
    ctx.strokeStyle = 'rgba(255,120,140,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2, y, w + 4, 10);
  }

  drawLives(ctx, game) {
    const s = getSprites().player;
    const n = Math.max(0, game.lives);
    const shown = Math.min(n, 5);
    for (let i = 0; i < shown; i++) {
      ctx.drawImage(s.canvas, 14 + i * 26, H - 40, s.w * 0.4, s.h * 0.4);
    }
    if (n > 5) {
      ctx.textAlign = 'left';
      ctx.font = NUM_FONT(14);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('x' + n, 14 + 5 * 26 + 4, H - 20);
    }
  }

  drawPowerups(ctx, game) {
    const items = [];
    const P = CONFIG.powerups.duration;
    if (game.powerups.timers.rapid > 0) items.push(['rapid', game.powerups.timers.rapid, P.rapid]);
    if (game.powerups.timers.spread > 0) items.push(['spread', game.powerups.timers.spread, P.spread]);
    if (game.player.shieldTime > 0) items.push(['shield', game.player.shieldTime, game.player.shieldMax]);
    if (game.falcon && game.falcon.remaining > 0) items.push(['falcon', game.falcon.remaining, CONFIG.falcon.duration]);
    let x = W - 12;
    const y = H - 38;
    for (const [type, left, max] of items) {
      const color = type === 'falcon' ? '#ff9a3c' : POWERUP_COLORS[type];
      const w = 92;
      x -= w;
      if (left > 2 || Math.floor(left * 6) % 2 === 0) {
        ctx.fillStyle = 'rgba(6,10,26,0.75)';
        ctx.fillRect(x, y, w - 6, 28);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 7, 27);
        if (type === 'falcon') {
          const fs = getSprites().falcon;
          ctx.drawImage(fs.canvas, x + 6, y + 2, fs.w * 0.25, fs.h * 0.25);
        } else {
          ctx.save();
          ctx.translate(x + 14, y + 13);
          drawPowerIcon(ctx, type, 7, color);
          ctx.restore();
        }
        ctx.textAlign = 'left';
        ctx.font = UI_FONT(11, 800);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(type === 'falcon' ? 'FALCON' : POWERUP_INFO[type].short, x + 26, y + 15);
        ctx.fillStyle = color;
        ctx.fillRect(x + 26, y + 20, (w - 38) * Math.max(0, left / max), 3);
      }
      x -= 4;
    }
  }

  /** Centered banner (READY, WARNING, STAGE CLEAR...). */
  drawBanner(ctx, banner) {
    const t = banner.t;
    const a = Math.min(1, t / 0.25, Math.max(0, (banner.dur - t) / 0.35));
    if (a <= 0) return;
    const y = banner.y || 430;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (banner.warning) {
      const flash = Math.sin(t * 10) > -0.3;
      ctx.fillStyle = 'rgba(80,0,10,0.55)';
      ctx.fillRect(0, y - 52, W, 104);
      ctx.fillStyle = '#ff2e4a';
      const off = (t * 60) % 40;
      for (let x = -40 + off; x < W + 40; x += 40) {
        for (const yy of [y - 52, y + 44]) {
          ctx.beginPath();
          ctx.moveTo(x, yy);
          ctx.lineTo(x + 20, yy);
          ctx.lineTo(x + 12, yy + 8);
          ctx.lineTo(x - 8, yy + 8);
          ctx.closePath();
          ctx.fill();
        }
      }
      if (flash) {
        ctx.font = UI_FONT(46, 900);
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(30,0,4,0.9)';
        ctx.strokeText('WARNING', W / 2, y - 8);
        ctx.fillStyle = '#ff4a5e';
        ctx.fillText('WARNING', W / 2, y - 8);
      }
      ctx.font = UI_FONT(15, 800);
      ctx.fillStyle = '#ffd0d6';
      ctx.fillText(banner.sub, W / 2, y + 28);
      ctx.restore();
      return;
    }

    ctx.font = UI_FONT(banner.size || 42, 900);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(2,4,14,0.9)';
    ctx.strokeText(banner.title, W / 2, y);
    ctx.fillStyle = banner.color || '#ffffff';
    ctx.fillText(banner.title, W / 2, y);
    if (banner.sub) {
      ctx.font = UI_FONT(17, 800);
      ctx.lineWidth = 4;
      ctx.strokeText(banner.sub, W / 2, y + 40);
      ctx.fillStyle = '#9fe8ff';
      ctx.fillText(banner.sub, W / 2, y + 40);
    }
    if (banner.lines) {
      ctx.font = UI_FONT(16, 700);
      banner.lines.forEach((line, i) => {
        const ly = y + 80 + i * 28;
        const show = t > 0.4 + i * 0.35;
        if (!show) return;
        ctx.lineWidth = 4;
        ctx.strokeText(line.text, W / 2, ly);
        ctx.fillStyle = line.color || '#ffffff';
        ctx.fillText(line.text, W / 2, ly);
      });
    }
    ctx.restore();
  }
}
