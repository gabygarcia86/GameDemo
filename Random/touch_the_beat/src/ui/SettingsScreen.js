// Settings form bound to the Settings store.

import { clearScores } from '../util/Settings.js';
import { $, messageBox, toast } from '../util/dom.js';

const FORMAT = {
  masterVolume: (v) => `${Math.round(v * 100)}%`,
  musicVolume: (v) => `${Math.round(v * 100)}%`,
  sfxVolume: (v) => `${Math.round(v * 100)}%`,
  noteSpeed: (v) => Number(v).toFixed(1),
  audioOffsetMs: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ms`,
  visualOffsetMs: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ms`,
};

export class SettingsScreen {
  constructor(app) {
    this.app = app;
    this.settings = app.settings;
    this.form = $('#settings-form');
    this.form.addEventListener('input', (e) => this.onInput(e.target));
    this.form.addEventListener('change', (e) => this.onInput(e.target));
    $('#btn-calibrate').addEventListener('click', () => app.ui.show('calibrate'));
    $('#btn-reset-scores').addEventListener('click', async () => {
      if (await messageBox({ title: 'Reset best scores?', body: 'All best scores on this device will be erased.', primary: 'Reset', secondary: 'Cancel', danger: true })) {
        clearScores();
        toast('Best scores reset.');
      }
    });
    $('#btn-clear-imports').addEventListener('click', async () => {
      const n = app.library.imported.length;
      if (!n) return toast('No imported songs on this device.');
      if (await messageBox({ title: 'Delete imported songs?', body: `Remove ${n} imported song(s) and their charts from this browser?`, primary: 'Delete', secondary: 'Cancel', danger: true })) {
        await app.library.clearImported();
        toast('Imported songs deleted.');
      }
    });
    $('#btn-reset-settings').addEventListener('click', () => {
      this.settings.reset();
      this.onShow();
      toast('Default settings restored.');
    });
  }

  onShow() {
    for (const input of this.form.elements) {
      const name = input.name;
      if (!name || !(name in this.settings.values)) continue;
      const v = this.settings.get(name);
      if (input.type === 'checkbox') input.checked = Boolean(v);
      else input.value = String(v);
      this.updateOutput(name, v);
    }
  }

  onInput(input) {
    const name = input.name;
    if (!name || !(name in this.settings.values)) return;
    let v;
    if (input.type === 'checkbox') v = input.checked;
    else if (input.type === 'range' || input.type === 'number') v = Number(input.value);
    else v = input.value;
    this.settings.set(name, v);
    this.updateOutput(name, v);
  }

  updateOutput(name, v) {
    const out = this.form.querySelector(`output[data-for="${name}"]`);
    if (out && FORMAT[name]) out.textContent = FORMAT[name](v);
  }
}
