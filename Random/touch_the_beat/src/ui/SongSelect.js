// Song library / song select screen, with preview playback and the import
// and recompile dialogs.

import { LANES } from '../config.js';
import { DIFFICULTIES, DEFAULT_COMPILE_SETTINGS, normalizeCompileSettings } from '../charts/DifficultyGenerator.js';
import { compareText, formatDuration } from '../library/songMeta.js';
import { bestScore } from '../util/Settings.js';
import { $, $$, closeModal, downloadJson, el, messageBox, openModal, toast } from '../util/dom.js';

export class SongSelect {
  constructor(app) {
    this.app = app;
    this.library = app.library;
    this.settings = app.settings;
    this.list = $('#song-list');
    this.search = $('#song-search');
    this.selectedId = this.settings.get('lastSongId');
    this.difficulty = this.settings.get('lastDifficulty');
    this.preview = { el: null, url: null, song: null, source: null, startedAt: 0, offset: 0 };

    this.search.addEventListener('input', () => this.renderList());
    this.list.addEventListener('click', (e) => {
      const li = e.target.closest('[data-id]');
      if (li) this.select(li.dataset.id);
    });
    this.list.addEventListener('dblclick', (e) => {
      if (e.target.closest('[data-id]')) this.play();
    });
    $$('#difficulty-tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        this.difficulty = b.dataset.diff;
        this.settings.set('lastDifficulty', this.difficulty);
        this.renderDetail();
        this.renderList();
      }),
    );
    $('#btn-start').addEventListener('click', () => this.play());
    $('#btn-preview').addEventListener('click', () => this.togglePreview());
    $('#btn-compile').addEventListener('click', () => this.openCompile());
    $('#btn-export').addEventListener('click', () => this.exportCharts());
    $('#btn-delete').addEventListener('click', () => this.deleteSong());
    $('#btn-import').addEventListener('click', () => this.openImport());
    $('#btn-choose-files').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (files.length) {
        closeModal('modal-import');
        this.app.importFiles(files);
      }
    });
    this.bindCompileDialog();
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  get song() {
    return this.library.find(this.selectedId) || this.library.songs[0] || null;
  }

  onShow(params) {
    if (params?.select) this.selectedId = params.select;
    if (!this.library.find(this.selectedId)) this.selectedId = this.library.songs[0]?.id;
    this.renderList();
    this.renderDetail();
    const note = $('#library-note');
    const n = this.library.imported.length;
    note.textContent = this.library.manifestError
      ? 'Built-in song list could not be loaded (open the game through a web server, see README). The demo track is still available.'
      : `${this.library.songs.length} songs${n ? ` · ${n} imported on this device` : ''}. Songs are analysed automatically; charts are heuristic.`;
    requestAnimationFrame(() => this.list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  }

  onHide() {
    this.stopPreview();
  }

  onKey(e) {
    if (this.app.ui.current !== 'songs' || document.querySelector('.modal.open')) return;
    if (e.target instanceof HTMLInputElement) return;
    const songs = this.filtered();
    const idx = songs.findIndex((s) => s.id === this.selectedId);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = songs[Math.max(0, Math.min(songs.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) this.select(next.id);
      this.list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.play();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const i = DIFFICULTIES.indexOf(this.difficulty);
      this.difficulty = DIFFICULTIES[Math.max(0, Math.min(2, i + (e.key === 'ArrowRight' ? 1 : -1)))];
      this.settings.set('lastDifficulty', this.difficulty);
      this.renderDetail();
    }
  }

  filtered() {
    const q = this.search.value.trim().toLowerCase();
    const songs = this.library.songs;
    return q ? songs.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(q)) : songs;
  }

  select(id) {
    if (id === this.selectedId) return;
    this.stopPreview();
    this.selectedId = id;
    this.settings.set('lastSongId', id);
    for (const li of this.list.querySelectorAll('[data-id]')) li.setAttribute('aria-selected', String(li.dataset.id === id));
    this.renderDetail();
  }

  renderList() {
    // songs arrive sorted by artist; each artist gets a group with a sticky header and one accent colour
    const groups = [];
    for (const s of this.filtered()) {
      const last = groups[groups.length - 1];
      if (last && compareText(s.artist, last.artist) === 0) last.songs.push(s);
      else groups.push({ artist: s.artist, songs: [s] });
    }
    const items = groups.map(({ artist, songs }, i) => {
      const accent = LANES[i % 4].color;
      return el(
        'li',
        { class: 'artist-group', role: 'group', 'aria-label': artist, style: { '--accent': accent } },
        el('div', { class: 'artist-header', 'aria-hidden': 'true', text: artist }),
        songs.map((s) => this.songItem(s, accent)),
      );
    });
    if (!items.length) items.push(el('li', { class: 'library-note', text: 'No songs match your search.' }));
    this.list.replaceChildren(...items);
  }

  songItem(s, accent) {
    const best = bestScore(s.id, this.difficulty);
    const playable = this.library.canPlay(s) !== '';
    return el(
      'div',
      {
        class: 'song-item',
        role: 'option',
        'data-id': s.id,
        'aria-selected': String(s.id === this.selectedId),
        style: { '--accent': accent },
      },
      el(
        'div',
        { class: 'info' },
        el(
          'div',
          { class: 't' },
          s.title,
          s.source === 'imported' ? el('span', { class: 'tag local', text: 'local' }) : null,
          s.recompiled ? el('span', { class: 'tag', text: 'custom' }) : null,
          !playable ? el('span', { class: 'tag warn', text: 'unsupported' }) : null,
        ),
      ),
      el(
        'div',
        { class: 'meta' },
        best ? el('div', { class: 'best', text: best.grade }) : null,
        el('div', { text: `${formatDuration(s.duration)} · ${Math.round(s.bpm || 0)} bpm` }),
      ),
    );
  }

  renderDetail() {
    const s = this.song;
    if (!s) return;
    $('#detail-title').textContent = s.title;
    $('#detail-artist').textContent = s.artist;
    $('#detail-duration').textContent = formatDuration(s.duration);
    const c = s.confidence || { overall: 0 };

    for (const b of $$('#difficulty-tabs button')) {
      const d = b.dataset.diff;
      b.setAttribute('aria-checked', String(d === this.difficulty));
      const info = s.difficulties?.[d];
      b.querySelector('small').textContent = info ? `${info.notes} notes` : '';
    }
    const best = bestScore(s.id, this.difficulty);
    $('#detail-best').textContent = best
      ? `Best: ${best.score.toLocaleString('en-US')} · ${best.grade} · ${best.accuracy.toFixed(1)}%${best.fullCombo ? ' · FULL COMBO' : ''}`
      : 'Not played yet on this difficulty.';

    const warnings = [...(s.warnings || [])];
    const support = this.library.canPlay(s);
    if (support === '') warnings.unshift(`This browser reports it cannot play ${s.mime || 'this format'}. Try another browser or convert the file.`);
    if (c.overall < 0.45) warnings.push('Low analysis confidence: try Recompile with a tempo hint (½× / 2×) or another sensitivity.');
    $('#detail-warnings').textContent = warnings.join(' ');

    $('#btn-delete').hidden = s.source !== 'imported';
    $('#btn-compile').textContent = s.recompiled ? 'Recompile… (custom)' : 'Recompile…';
    this.updatePreviewButton();
  }

  play() {
    const s = this.song;
    if (!s) return;
    this.stopPreview();
    this.app.playSong(s, this.difficulty);
  }

  // ------------------------------------------------------------ preview

  async togglePreview() {
    if (this.preview.song) {
      this.stopPreview();
      return;
    }
    const s = this.song;
    if (!s) return;
    try {
      await this.app.audio.unlock();
      if (s.source === 'procedural') {
        const btn = $('#btn-preview');
        btn.textContent = '…';
        const buffer = await this.library.getAudioBuffer(s);
        if (this.song?.id !== s.id) return;
        const ctx = this.app.audio.ctx;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(this.app.audio.music);
        const offset = buffer.duration * 0.3;
        src.start(ctx.currentTime + 0.05, offset);
        src.onended = () => this.preview.source === src && this.stopPreview();
        this.preview = { el: null, url: null, song: s, source: src, startedAt: ctx.currentTime + 0.05, offset };
      } else {
        const audio = new Audio();
        let url = s.audio;
        if (s.source === 'imported') {
          const data = await this.library.getAudioData(s);
          url = URL.createObjectURL(new Blob([data], { type: s.mime || 'audio/mpeg' }));
        }
        audio.src = url;
        audio.preload = 'auto';
        audio.volume = Math.min(1, this.settings.get('masterVolume') * this.settings.get('musicVolume'));
        await new Promise((resolve, reject) => {
          audio.addEventListener('loadedmetadata', resolve, { once: true });
          audio.addEventListener('error', () => reject(new Error('This browser could not load the audio for preview.')), { once: true });
          audio.load();
        });
        if (this.song?.id !== s.id) {
          if (url.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        audio.currentTime = Math.max(0, (audio.duration || s.duration) * 0.35);
        audio.addEventListener('ended', () => this.stopPreview());
        await audio.play();
        this.preview = { el: audio, url: url.startsWith('blob:') ? url : null, song: s, source: null };
      }
      this.updatePreviewButton();
    } catch (err) {
      this.stopPreview();
      toast(err.message || 'Preview failed', { kind: 'error' });
    }
  }

  stopPreview() {
    const p = this.preview;
    if (p.el) {
      p.el.pause();
      p.el.removeAttribute('src');
      p.el.load();
    }
    if (p.source) {
      try {
        p.source.onended = null;
        p.source.stop();
      } catch {
        /* already stopped */
      }
    }
    if (p.url) URL.revokeObjectURL(p.url);
    this.preview = { el: null, url: null, song: null, source: null };
    this.updatePreviewButton();
  }

  updatePreviewButton() {
    $('#btn-preview').textContent = this.preview.song ? '■ Stop' : '▶ Preview';
  }

  /** Song time of the running preview, or -1. */
  previewTime() {
    const p = this.preview;
    if (!p.song) return -1;
    if (p.el) return p.el.currentTime;
    if (p.source) return this.app.audio.ctx.currentTime - p.startedAt + p.offset;
    return -1;
  }

  /** Data for the menu background visuals. */
  visuals() {
    const s = this.preview.song;
    const t = this.previewTime();
    if (!s || t < 0) return null;
    const wave = s.waveform || [];
    const energy = wave.length ? wave[Math.min(wave.length - 1, Math.floor((t / s.duration) * wave.length))] : 0.5;
    return { bpm: s.bpm || 100, time: t, energy };
  }

  // ------------------------------------------------------------ actions

  async exportCharts() {
    const s = this.song;
    if (!s) return;
    try {
      const bundle = await this.library.exportBundle(s);
      downloadJson(`${s.id}.ttb.json`, bundle);
      toast('Chart bundle downloaded. Import it together with the audio file on another device.');
    } catch (err) {
      toast(`Export failed: ${err.message}`, { kind: 'error' });
    }
  }

  async deleteSong() {
    const s = this.song;
    if (!s || s.source !== 'imported') return;
    const ok = await messageBox({
      title: 'Delete song?',
      body: `Remove "${s.title}" and its charts from this device? The original file on your device is not affected.`,
      primary: 'Delete',
      secondary: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    await this.library.deleteImported(s);
    this.selectedId = this.library.songs[0]?.id;
    this.onShow();
    toast('Song deleted from this device.');
  }

  openImport() {
    const rows = this.app.importer.supportReport();
    const table = $('#support-table');
    table.replaceChildren(
      ...rows.map((r) => {
        const cls = r.support === 'probably' ? 'yes' : r.support === 'maybe' ? 'maybe' : 'no';
        const label = r.support === 'probably' ? 'supported' : r.support === 'maybe' ? 'probably' : 'not supported';
        return el('tr', {}, el('td', { text: `.${r.ext}` }), el('td', { text: r.mime }), el('td', { class: cls, text: label }));
      }),
    );
    openModal('modal-import');
  }

  showImportResults(result) {
    const box = $('#import-results');
    box.replaceChildren(
      ...result.imported.map((r) => el('p', { class: 'ok', text: `✓ ${r.title} — ${r.bpm.toFixed(0)} bpm, confidence ${Math.round(r.confidence.overall * 100)}%` })),
      ...result.failed.map((f) => el('p', { class: 'err', text: `✗ ${f.name}: ${f.error}` })),
    );
    this.openImport();
  }

  // ------------------------------------------------------------ compile dialog

  bindCompileDialog() {
    const form = $('#compile-form');
    const fmt = {
      density: (v) => `${Number(v).toFixed(2)}×`,
      sensitivity: (v) => `${Number(v).toFixed(2)}×`,
      offsetMs: (v) => `${v > 0 ? '+' : ''}${v} ms`,
    };
    form.addEventListener('input', (e) => {
      const name = e.target.name;
      const out = form.querySelector(`output[data-for="${name}"]`);
      if (out && fmt[name]) out.textContent = fmt[name](e.target.value);
    });
    form.querySelectorAll('[data-bpm]').forEach((b) =>
      b.addEventListener('click', () => {
        const input = form.elements.bpmHint;
        const current = Number(input.value) || this.song?.bpm || 120;
        if (b.dataset.bpm === 'auto') input.value = '';
        else input.value = (b.dataset.bpm === 'half' ? current / 2 : current * 2).toFixed(1);
      }),
    );
    $('#btn-seed-shuffle').addEventListener('click', () => {
      form.elements.seed.value = String(Math.floor(Math.random() * 9999));
    });
    $('#btn-compile-run').addEventListener('click', () => {
      const s = this.song;
      if (!s) return;
      const settings = normalizeCompileSettings({
        density: form.elements.density.value,
        sensitivity: form.elements.sensitivity.value,
        bpmHint: form.elements.bpmHint.value,
        beatsPerBar: form.elements.beatsPerBar.value,
        offsetMs: form.elements.offsetMs.value,
        seed: form.elements.seed.value,
        holds: form.elements.holds.checked,
        chords: form.elements.chords.checked,
      });
      closeModal('modal-compile');
      this.app.recompile(s, settings);
    });
    $('#btn-compile-reset').addEventListener('click', async () => {
      const s = this.song;
      if (!s) return;
      closeModal('modal-compile');
      if (s.source === 'imported') {
        this.app.recompile(s, DEFAULT_COMPILE_SETTINGS);
      } else {
        await this.library.resetOverride(s);
        toast('Restored the shipped charts.');
        this.onShow();
      }
    });
    this.compileFmt = fmt;
  }

  openCompile() {
    const s = this.song;
    if (!s) return;
    const form = $('#compile-form');
    const cfg = normalizeCompileSettings(s.compileSettings || {});
    form.elements.density.value = cfg.density;
    form.elements.sensitivity.value = cfg.sensitivity;
    form.elements.bpmHint.value = cfg.bpmHint || '';
    form.elements.bpmHint.placeholder = s.bpm ? `auto (${s.bpm.toFixed(1)})` : 'auto';
    form.elements.beatsPerBar.value = String(cfg.beatsPerBar);
    form.elements.offsetMs.value = cfg.offsetMs;
    form.elements.seed.value = cfg.seed;
    form.elements.holds.checked = cfg.holds;
    form.elements.chords.checked = cfg.chords;
    for (const name of Object.keys(this.compileFmt)) {
      form.querySelector(`output[data-for="${name}"]`).textContent = this.compileFmt[name](form.elements[name].value);
    }
    $('#compile-song').textContent = `${s.title} — ${s.artist}. Charts are rebuilt in your browser and saved on this device.`;
    $('#btn-compile-reset').hidden = s.source !== 'imported' && !s.recompiled;
    openModal('modal-compile');
  }
}
