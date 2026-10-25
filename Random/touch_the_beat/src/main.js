// Touch the Beat — application bootstrap and screen flow.

import { AudioEngine } from './audio/AudioEngine.js';
import { Sfx } from './audio/Sfx.js';
import { Game } from './game/Game.js';
import { GameLoop } from './game/GameLoop.js';
import { InputManager } from './game/InputManager.js';
import { BrowserSongImporter } from './library/BrowserSongImporter.js';
import { openStore } from './library/IndexedDBStore.js';
import { SongLibrary } from './library/SongLibrary.js';
import { NeonRenderer } from './rendering/NeonRenderer.js';
import { CalibrationScreen } from './ui/CalibrationScreen.js';
import { LoadingScreen } from './ui/LoadingScreen.js';
import { MainMenu } from './ui/MainMenu.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { ResultsScreen } from './ui/ResultsScreen.js';
import { SettingsScreen } from './ui/SettingsScreen.js';
import { SongSelect } from './ui/SongSelect.js';
import { UIManager } from './ui/UIManager.js';
import { $, messageBox, toast } from './util/dom.js';
import { Settings, recordScore } from './util/Settings.js';

const QUALITY_STEPS = ['high', 'medium', 'low'];

class App {
  async init() {
    this.settings = new Settings();
    this.audio = new AudioEngine(this.settings);
    this.sfx = new Sfx(this.audio, this.settings);
    this.store = await openStore();
    this.library = new SongLibrary(this.store, this.audio);
    this.importer = new BrowserSongImporter(this.library, this.audio);

    this.renderer = new NeonRenderer($('#stage'));
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.autoQuality = coarse ? 'medium' : 'high';
    this.slowChecks = 0;
    this.applyDisplaySettings();

    this.input = new InputManager($('#screen-game'), this.renderer);
    this.game = new Game({
      audio: this.audio,
      sfx: this.sfx,
      renderer: this.renderer,
      input: this.input,
      settings: this.settings,
      onEnd: (summary) => this.onGameEnd(summary),
      onPauseChange: (paused) => this.pauseMenu.setVisible(paused),
    });

    this.ui = new UIManager(this.sfx);
    this.loading = new LoadingScreen();
    this.ui.register('menu', new MainMenu(this));
    this.songSelect = this.ui.register('songs', new SongSelect(this));
    this.ui.register('loading', this.loading);
    this.ui.register('game', {});
    this.results = this.ui.register('results', new ResultsScreen(this));
    this.ui.register('settings', new SettingsScreen(this));
    this.ui.register('calibrate', new CalibrationScreen(this));
    this.pauseMenu = new PauseMenu(this);

    this.settings.onChange((key) => {
      if (['quality', 'reducedMotion', 'highway', 'showFps'].includes(key)) this.applyDisplaySettings();
    });

    // audio may only start after a user gesture on mobile
    const unlock = () => this.audio.unlock().catch(() => {});
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });

    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this.renderer.resize(), 80);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    document.fonts?.ready?.then(() => this.renderer.resize());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.game.active) this.game.pause();
        this.songSelect.stopPreview();
      }
    });

    await this.library.init();
    this.loop = new GameLoop((dt, now) => this.frame(dt, now));
    this.loop.start();
    this.ui.show('menu');
    document.body.classList.add('ready');
    if (!AudioEngine.supported) {
      messageBox({ title: 'Audio not supported', body: 'This browser does not support the Web Audio API, so the game cannot keep accurate time. Please use a current version of Chrome, Safari, Firefox or Edge.' });
    }
  }

  // ------------------------------------------------------------- display

  get effectiveQuality() {
    const q = this.settings.get('quality');
    return q === 'auto' ? this.autoQuality : q;
  }

  applyDisplaySettings() {
    const reduced = this.settings.get('reducedMotion');
    document.body.classList.toggle('reduced-motion', reduced);
    this.renderer.configure({
      quality: this.effectiveQuality,
      reducedMotion: reduced,
      highway: this.settings.get('highway'),
      showFps: this.settings.get('showFps'),
    });
  }

  /** Step quality down when the frame rate stays low during gameplay. */
  checkPerformance(now) {
    if (this.settings.get('quality') !== 'auto' || !this.game.active || this.game.state === 'paused') return;
    if (now - (this.lastPerfCheck || 0) < 2000) return;
    this.lastPerfCheck = now;
    if (this.loop.fps < 47) this.slowChecks++;
    else this.slowChecks = 0;
    const idx = QUALITY_STEPS.indexOf(this.autoQuality);
    if (this.slowChecks >= 2 && idx < QUALITY_STEPS.length - 1) {
      this.autoQuality = QUALITY_STEPS[idx + 1];
      this.slowChecks = 0;
      this.applyDisplaySettings();
    }
  }

  frame(dt, now) {
    this.renderer.fps = this.loop.fps;
    if (this.game.active) {
      this.game.update(dt);
      const spectrum = this.audio.playing ? this.audio.spectrum() : null;
      this.renderer.renderGame(this.game, dt, spectrum);
      this.checkPerformance(now);
    } else {
      this.renderer.renderMenu(dt, this.menuVisuals(now));
    }
  }

  menuVisuals(now) {
    const p = this.songSelect.visuals();
    if (p) {
      const beatPos = (p.time * p.bpm) / 60;
      const frac = beatPos - Math.floor(beatPos);
      return { beatPos, energy: p.energy, pulse: Math.exp(-frac * 6) * (0.4 + p.energy * 0.6) };
    }
    const beatPos = (now / 1000) * 1.6;
    const frac = beatPos - Math.floor(beatPos);
    return { beatPos, energy: 0.3, pulse: Math.exp(-frac * 5) * 0.35 };
  }

  // ------------------------------------------------------------- flow

  quickPlayTarget() {
    const song = this.library.find(this.settings.get('lastSongId')) || this.library.songs[0];
    return { song, difficulty: this.settings.get('lastDifficulty') };
  }

  quickPlay() {
    const { song, difficulty } = this.quickPlayTarget();
    if (song) this.playSong(song, difficulty);
  }

  async playSong(song, difficulty) {
    this.audio.unlock().catch(() => {});
    const token = (this.loadToken = Symbol('load'));
    const cancelled = () => this.loadToken !== token;
    this.loading.set(song.title, 'Loading chart…', {
      hint: song.source === 'procedural' ? 'Synthesising the demo track in your browser.' : '',
      onCancel: () => {
        this.loadToken = null;
        this.ui.reset('songs');
      },
    });
    this.ui.show('loading');
    try {
      const chart = await this.library.getChart(song, difficulty);
      if (cancelled()) return;
      this.loading.progress(0.25, song.source === 'procedural' ? 'Synthesising audio…' : 'Loading audio…');
      const buffer = await this.library.getAudioBuffer(song);
      if (cancelled()) return;
      this.loading.progress(1, 'Ready');
      this.currentSong = song;
      this.currentDifficulty = difficulty;
      this.settings.set('lastSongId', song.id);
      this.settings.set('lastDifficulty', difficulty);
      this.game.load(song, chart, buffer);
      this.pauseMenu.setVisible(false);
      this.ui.show('game');
      this.game.start();
    } catch (err) {
      if (cancelled()) return;
      console.error(err);
      this.ui.reset('songs');
      messageBox({ title: 'Could not start the song', body: [err.message || String(err), 'See the README troubleshooting section for format and decoding issues.'] });
    }
  }

  replay() {
    if (this.currentSong) this.playSong(this.currentSong, this.currentDifficulty);
  }

  quitGame() {
    this.game.quit();
    this.pauseMenu.setVisible(false);
    this.ui.reset('songs');
  }

  onGameEnd(summary) {
    const newBest = recordScore(this.currentSong.id, this.currentDifficulty, summary);
    this.pauseMenu.setVisible(false);
    this.ui.show('results', { summary, song: this.currentSong, difficulty: this.currentDifficulty, newBest });
  }

  async recompile(song, settings) {
    this.songSelect.stopPreview();
    this.loading.set(`Recompiling ${song.title}`, 'Starting…', { hint: 'Analysis runs locally; nothing is uploaded.' });
    this.ui.show('loading');
    try {
      const { meta } = await this.library.recompile(song, settings, (f, stage) => this.loading.progress(f, stage));
      this.ui.reset('songs', { select: song.id });
      toast(`Recompiled: ${meta.bpm.toFixed(1)} BPM, confidence ${Math.round(meta.confidence.overall * 100)}%.`);
    } catch (err) {
      console.error(err);
      this.ui.reset('songs', { select: song.id });
      messageBox({ title: 'Recompile failed', body: err.message || String(err) });
    }
  }

  async importFiles(files) {
    this.songSelect.stopPreview();
    let cancel = false;
    this.loading.set('Importing songs', 'Starting…', {
      hint: 'Songs are analysed in your browser and saved on this device only.',
      onCancel: () => (cancel = true),
    });
    this.ui.show('loading');
    const result = await this.importer.importFiles(files, {
      onProgress: ({ index, total, name, fraction, stage }) => {
        this.loading.title.textContent = `Importing ${index + 1}/${total}: ${name}`;
        this.loading.progress((index + fraction) / total, stage);
      },
      isCancelled: () => cancel,
    });
    this.ui.reset('songs', { select: result.imported[0]?.id });
    this.songSelect.showImportResults(result);
    if (result.imported.length) toast(`Imported ${result.imported.length} song(s).`);
  }
}

const app = new App();
app.init().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<p class="noscript">Touch the Beat failed to start: ${String(err.message || err).replace(/[<>&]/g, '')}</p>`);
});
window.__ttb = app; // handy for debugging in the console
