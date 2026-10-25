// Screen switching with CSS transitions, a back stack, and modal plumbing.

import { $, closeModal, topModal } from '../util/dom.js';

export class UIManager {
  constructor(sfx) {
    this.sfx = sfx;
    this.screens = new Map();
    this.current = null;
    this.stack = [];

    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('[data-back]')) {
        this.sfx.click();
        this.back();
      } else if (t.closest('[data-close]')) {
        this.sfx.click();
        const m = t.closest('.modal');
        m?.dispatchEvent(new Event('modal-dismiss'));
        closeModal(m);
      } else if (t.classList.contains('modal')) {
        // backdrop click
        t.dispatchEvent(new Event('modal-dismiss'));
        closeModal(t);
      } else if (t.closest('button')) {
        this.sfx.click();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const m = topModal();
      if (m) {
        m.dispatchEvent(new Event('modal-dismiss'));
        closeModal(m);
        e.preventDefault();
      } else if (this.current && this.current !== 'game' && this.current !== 'menu' && this.current !== 'loading') {
        this.back();
      }
    });
  }

  register(name, controller = {}) {
    const el = $(`#screen-${name}`);
    if (!el) throw new Error(`Missing screen element #screen-${name}`);
    this.screens.set(name, { el, controller });
    return controller;
  }

  show(name, params, { push = true } = {}) {
    const next = this.screens.get(name);
    if (!next) throw new Error(`Unknown screen ${name}`);
    const prevName = this.current;
    if (prevName === name) {
      next.controller.onShow?.(params);
      return;
    }
    if (prevName) {
      const prev = this.screens.get(prevName);
      prev.el.classList.remove('active');
      prev.el.setAttribute('aria-hidden', 'true');
      prev.controller.onHide?.();
      // transient screens are never returned to with "back"
      if (push && !['loading', 'game', 'results'].includes(prevName)) this.stack.push(prevName);
    }
    this.current = name;
    next.el.classList.add('active');
    next.el.removeAttribute('aria-hidden');
    document.body.dataset.screen = name;
    next.controller.onShow?.(params);
  }

  back() {
    let target = this.stack.pop();
    while (target === this.current) target = this.stack.pop();
    this.show(target || 'menu', undefined, { push: false });
  }

  /** Forget history (e.g. after a game ends) and go to a screen. */
  reset(name, params) {
    this.stack = name === 'menu' ? [] : ['menu'];
    this.show(name, params, { push: false });
  }
}
