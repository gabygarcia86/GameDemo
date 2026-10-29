// DOM side of the game: screens, HUD, callouts, toasts, the customize
// swatches, game over, stats, settings and the confirm dialog. Game.js owns
// the logic; this module only reads state and reports clicks.

import { FREE_SWATCHES, PREMIUM_SWATCHES, NINJA_PARTS, BOARD_PARTS } from './cosmetics.js';
import { ENV_LIST } from './environments.js';
import { formatInt } from './utils.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'customize', 'pause', 'gameover', 'stats', 'settings'];
const PU_INFO = {
  magnet: { label: 'MAGNET', color: '#ff5e7a' },
  shield: { label: 'SHIELD', color: '#3de1ff' },
  frenzy: { label: 'STAR FRENZY', color: '#ffd23f' },
};

export class UI {
  constructor() {
    this.hud = $('hud');
    this.cache = {};
    this.callouts = $('callouts');
    this.toasts = $('toasts');
    this.current = null;
    this.onClick = () => {};
  }

  // Wire a button; every click also plays the UI click sound.
  button(id, fn) {
    $(id).addEventListener('click', (e) => {
      this.onClick();
      fn(e);
    });
  }

  showScreen(name) {
    for (const s of SCREENS) $(s).hidden = s !== name;
    this.current = name;
    if (name) {
      const first = $(name).querySelector('.btn-primary');
      // Focus for keyboard users, without scrolling the page on touch devices.
      if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
    }
  }

  showHud(on) {
    this.hud.hidden = !on;
    if (!on) {
      this.callouts.textContent = '';
      this.toasts.textContent = '';
      $('hud-powerups').textContent = '';
      this.cache = {};
    }
  }

  setTouchMode(touch) {
    document.body.classList.toggle('touch', touch);
    $('star-btn').classList.toggle('desktop', !touch);
    $('flip-btn').classList.toggle('desktop', !touch);
  }

  setLoading(done, message) {
    const el = $('loading');
    if (message) el.querySelector('p').textContent = message;
    if (done) {
      el.classList.add('done');
      setTimeout(() => (el.hidden = true), 450);
    }
  }

  // ---------------------------------------------------------------- HUD

  set(id, value) {
    if (this.cache[id] === value) return;
    this.cache[id] = value;
    $(id).textContent = value;
  }

  updateHud(s) {
    this.set('hud-score', formatInt(s.score));
    this.set('hud-dist', formatInt(s.distance));
    this.set('hud-coins', formatInt(s.coins));
    const comboOn = s.combo > 0;
    if (this.cache.comboOn !== comboOn) {
      this.cache.comboOn = comboOn;
      $('hud-combo').dataset.on = String(comboOn);
    }
    this.set('hud-combo-n', String(s.combo));
    const multText = Number.isInteger(s.mult) ? String(s.mult) : s.mult.toFixed(1);
    if (this.cache['hud-mult'] !== multText && this.cache['hud-mult'] !== undefined) this.bump($('hud-combo'));
    this.set('hud-mult', multText);
    $('hud-combo-bar').style.transform = `scaleX(${s.comboFrac.toFixed(3)})`;

    const starText = s.frenzy ? '∞' : String(s.stars);
    this.set('star-count', starText);
    const btn = $('star-btn');
    btn.classList.toggle('empty', !s.frenzy && s.stars === 0);
    btn.classList.toggle('frenzy', s.frenzy);
    const ring = s.frenzy || s.stars >= s.maxStars ? 1 : s.recharge;
    $('star-ring').style.strokeDashoffset = String(283 * (1 - ring));

    const pu = s.powerups.map((p) => `${p.kind}:${p.frac.toFixed(2)}`).join('|');
    if (this.cache.pu !== pu) {
      this.cache.pu = pu;
      const box = $('hud-powerups');
      box.textContent = '';
      for (const p of s.powerups) {
        const info = PU_INFO[p.kind];
        const el = document.createElement('div');
        el.className = 'pu';
        el.style.setProperty('--c', info.color);
        el.innerHTML = `<span>${info.label}</span>${p.frac >= 0 ? `<span class="pu-bar"><i style="width:${(p.frac * 100).toFixed(0)}%"></i></span>` : ''}`;
        box.append(el);
      }
    }
  }

  bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  // Big text in the middle of the screen ("NEAR MISS! +60").
  callout(text, cls = '') {
    while (this.callouts.children.length >= 3) this.callouts.firstChild.remove();
    const el = document.createElement('div');
    el.className = `callout ${cls}`;
    el.innerHTML = text;
    this.callouts.append(el);
    setTimeout(() => el.remove(), 950);
  }

  toast(text, cls = '') {
    while (this.toasts.children.length >= 3) this.toasts.firstChild.remove();
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    el.innerHTML = text;
    this.toasts.append(el);
    setTimeout(() => el.remove(), 3300);
  }

  // -------------------------------------------------------------- intro

  showIntro(env) {
    $('intro').hidden = false;
    const card = document.querySelector('.intro-card');
    card.classList.remove('out');
    void card.offsetWidth;
    $('intro-name').textContent = env.name;
    $('intro-title').textContent = env.title;
    $('intro-blurb').textContent = env.blurb;
    $('intro-challenge').textContent = env.challenge.text;
    $('countdown').textContent = '';
  }

  countdown(text) {
    const el = $('countdown');
    el.textContent = text;
    el.classList.toggle('go', text === 'GO!');
    el.classList.remove('tick');
    void el.offsetWidth;
    el.classList.add('tick');
  }

  hideIntro(animated = true) {
    const card = document.querySelector('.intro-card');
    if (!animated) {
      $('intro').hidden = true;
      return;
    }
    card.classList.add('out');
    setTimeout(() => ($('intro').hidden = true), 600);
  }

  // --------------------------------------------------------------- menu

  renderMenu(save, missions) {
    $('menu-coins').textContent = formatInt(save.data.coins);
    $('menu-best').textContent = formatInt(save.stats.bestScore);
    $('menu-best-dist').textContent = formatInt(save.stats.bestDistance);
    this.renderMissionList($('mission-list'), missions.list.map((m) => ({
      text: missions.describe(m), reward: m.reward, progress: missions.progressOf(m), target: m.target,
    })));
  }

  // Pause screen: missions with this run's progress, plus the level challenge.
  renderPauseMissions(items) {
    this.renderMissionList($('pause-mission-list'), items);
  }

  // items: [{ text, reward, progress, target, done?, challenge? }]
  renderMissionList(list, items) {
    list.textContent = '';
    for (const it of items) {
      const p = Math.min(it.target, it.progress);
      const done = it.done || p >= it.target;
      const li = document.createElement('li');
      li.classList.toggle('done', done);
      li.classList.toggle('challenge', !!it.challenge);
      const text = document.createElement('span');
      text.textContent = `${done ? '✓ ' : ''}${it.challenge ? 'Challenge: ' : ''}${it.text}`;
      const reward = document.createElement('span');
      reward.className = 'reward';
      reward.textContent = `+${it.reward}`;
      li.append(text, reward);
      if (p > 0) {
        const bar = document.createElement('span');
        bar.className = 'bar';
        bar.innerHTML = `<i style="width:${((p / it.target) * 100).toFixed(0)}%"></i>`;
        li.append(bar);
      }
      list.append(li);
    }
  }

  // ---------------------------------------------------------- customize

  // handlers: { pick(key, color), buy(premium, key), board(type), neon(on) }
  buildCustomize(save, handlers) {
    this.czHandlers = handlers;
    const ninja = $('cz-ninja');
    ninja.textContent = '';
    for (const part of NINJA_PARTS) ninja.append(this.swatchRow(part, save));
    this.buildBoardRows(save);
    for (const b of document.querySelectorAll('[data-board]')) {
      b.onclick = () => {
        this.onClick();
        handlers.board(b.dataset.board);
      };
    }
    $('cz-neon').onclick = () => {
      this.onClick();
      handlers.neon(!save.look.neon);
    };
    const tabs = [['tab-ninja', 'cz-ninja'], ['tab-board', 'cz-board']];
    for (const [tab, panel] of tabs) {
      $(tab).onclick = () => {
        this.onClick();
        for (const [t, p] of tabs) {
          $(t).setAttribute('aria-selected', String(t === tab));
          $(p).hidden = p !== panel;
        }
      };
    }
    this.refreshCustomize(save);
  }

  buildBoardRows(save) {
    const rows = $('cz-board-rows');
    rows.textContent = '';
    for (const part of BOARD_PARTS[save.look.board]) rows.append(this.swatchRow(part, save));
    this.builtBoard = save.look.board;
  }

  swatchRow(part, save) {
    const row = document.createElement('div');
    row.className = 'cz-row';
    const label = document.createElement('span');
    label.className = 'cz-label';
    label.textContent = part.label;
    const opts = document.createElement('div');
    opts.className = 'cz-options';
    opts.setAttribute('role', 'radiogroup');
    opts.setAttribute('aria-label', part.label);
    opts.dataset.key = part.key;
    const add = (color, premium) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.color = color;
      if (color === 'rainbow') b.classList.add('rainbow');
      else b.style.background = color;
      b.setAttribute('aria-label', premium ? premium.name : color);
      b.title = premium ? `${premium.name} (${premium.cost} coins)` : color;
      if (premium) b.dataset.cost = String(premium.cost);
      b.addEventListener('click', () => {
        this.onClick();
        if (premium && !save.data.unlocked.includes(premium.id)) this.czHandlers.buy(premium, part.key);
        else this.czHandlers.pick(part.key, color);
      });
      opts.append(b);
    };
    for (const c of FREE_SWATCHES) add(c, null);
    for (const p of PREMIUM_SWATCHES) add(p.color, p);
    row.append(label, opts);
    return row;
  }

  refreshCustomize(save) {
    if (this.builtBoard !== save.look.board) this.buildBoardRows(save);
    $('cz-coins').textContent = formatInt(save.data.coins);
    for (const opts of document.querySelectorAll('#customize .cz-options[data-key]')) {
      const key = opts.dataset.key;
      for (const b of opts.children) {
        b.setAttribute('aria-pressed', String(save.look[key] === b.dataset.color));
        const locked = !!b.dataset.cost && !save.data.unlocked.includes(PREMIUM_SWATCHES.find((p) => p.color === b.dataset.color)?.id);
        b.classList.toggle('locked', locked);
      }
    }
    for (const b of document.querySelectorAll('[data-board]')) b.setAttribute('aria-pressed', String(b.dataset.board === save.look.board));
    $('cz-neon-row').hidden = save.look.board !== 'hoverboard';
    $('cz-neon').setAttribute('aria-pressed', String(save.look.neon));
    $('cz-neon').textContent = save.look.neon ? 'ON' : 'OFF';
  }

  // ------------------------------------------------------------ results

  renderGameOver(r) {
    $('go-title').textContent = r.title;
    $('go-reason').textContent = r.reason;
    $('go-newbest').hidden = !r.newBest;
    $('go-score').textContent = formatInt(r.score);
    $('go-dist').textContent = `${formatInt(r.distance)} m`;
    $('go-coins').textContent = formatInt(r.coins);
    $('go-karens').textContent = String(r.stats.karens);
    $('go-ninjas').textContent = String(r.stats.ninjas);
    $('go-avoided').textContent = String(r.stats.avoided);
    $('go-combo').textContent = String(r.stats.bestCombo);
    $('go-mult').textContent = `×${r.stats.maxMult}`;
    $('go-tricks').textContent = String(r.stats.tricks);
    const list = $('go-rewards');
    list.textContent = '';
    for (const [label, value] of r.rewards) {
      const li = document.createElement('li');
      const a = document.createElement('span');
      a.textContent = label;
      const b = document.createElement('b');
      b.textContent = `+${formatInt(value)}`;
      li.append(a, b);
      list.append(li);
    }
    $('go-reward-total').textContent = formatInt(r.rewardTotal);
    $('go-best').textContent = formatInt(r.bestScore);
    $('go-best-dist').textContent = formatInt(r.bestDistance);
  }

  renderStats(save) {
    const s = save.stats;
    const mins = Math.floor(s.timePlayed / 60);
    const rows = [
      ['Best score', formatInt(s.bestScore)],
      ['Best distance', `${formatInt(s.bestDistance)} m`],
      ['Most coins in a run', formatInt(s.bestCoins)],
      ['Best combo', formatInt(s.bestCombo)],
      ['Runs', formatInt(s.runs)],
      ['Total distance', `${formatInt(s.totalDistance)} m`],
      ['Coins collected', formatInt(s.totalCoins)],
      ['Coins in wallet', formatInt(save.data.coins)],
      ['Karens popped', formatInt(s.karens)],
      ['Evil ninjas defeated', formatInt(s.ninjas)],
      ['Obstacles avoided', formatInt(s.avoided)],
      ['Jumps', formatInt(s.jumps)],
      ['Slides', formatInt(s.slides)],
      ['Tricks landed', formatInt(s.tricks)],
      ['Ninja stars thrown', formatInt(s.stars)],
      ['Missions completed', formatInt(s.missions)],
      ['Challenges completed', formatInt(s.challenges)],
      ['Time played', `${Math.floor(mins / 60)}h ${mins % 60}m`],
    ];
    const dl = $('stats-list');
    dl.textContent = '';
    for (const [k, v] of rows) {
      const div = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      div.append(dt, dd);
      dl.append(div);
    }
    const body = $('env-stats');
    body.textContent = '';
    for (const env of ENV_LIST) {
      const e = s.perEnv[env.id];
      const tr = document.createElement('tr');
      tr.innerHTML = `<td></td><td>${formatInt(e.runs)}</td><td>${formatInt(e.best)} m</td>`;
      tr.firstChild.textContent = `${env.name} · ${env.title}`;
      body.append(tr);
    }
  }

  // ----------------------------------------------------------- settings

  bindSettings(settings, onChange) {
    const slider = (id, key) => {
      const input = $(id);
      const out = $(`${id}-out`);
      input.value = settings[key];
      out.textContent = settings[key];
      input.addEventListener('input', () => {
        settings[key] = Number(input.value);
        out.textContent = input.value;
        onChange(key);
      });
    };
    slider('set-music', 'music');
    slider('set-sfx', 'sfx');
    const toggle = (id, key) => {
      const b = $(id);
      const paint = () => {
        b.setAttribute('aria-pressed', String(settings[key]));
        b.textContent = settings[key] ? 'ON' : 'OFF';
      };
      paint();
      b.addEventListener('click', () => {
        this.onClick();
        settings[key] = !settings[key];
        paint();
        onChange(key);
      });
    };
    toggle('set-ambience', 'ambience');
    toggle('set-shake', 'shake');
    toggle('set-lines', 'speedLines');
    toggle('set-fps', 'showFps');
    const seg = (id, key) => {
      const box = $(id);
      const paint = () => {
        for (const b of box.children) b.setAttribute('aria-pressed', String(b.dataset.value === settings[key]));
      };
      paint();
      for (const b of box.children) {
        b.addEventListener('click', () => {
          this.onClick();
          settings[key] = b.dataset.value;
          paint();
          onChange(key);
        });
      }
    };
    seg('set-quality', 'quality');
    seg('set-touch', 'touch');
  }

  // ------------------------------------------------------------ confirm

  confirm(text, okLabel = 'OK') {
    return new Promise((resolve) => {
      const box = $('confirm');
      $('confirm-text').textContent = text;
      $('confirm-yes').textContent = okLabel;
      box.hidden = false;
      const done = (v) => {
        box.hidden = true;
        $('confirm-yes').onclick = null;
        $('confirm-no').onclick = null;
        this.onClick();
        resolve(v);
      };
      $('confirm-yes').onclick = () => done(true);
      $('confirm-no').onclick = () => done(false);
      $('confirm-yes').focus({ preventScroll: true });
    });
  }

  get confirmOpen() {
    return !$('confirm').hidden;
  }

  fps(text) {
    const el = $('fps');
    if (text === null) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  error(text) {
    const el = $('error');
    el.hidden = false;
    el.textContent = text;
  }
}
