// Tiny DOM helpers shared by the UI modules.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) node.style.setProperty(prop, val);
        else node.style[prop] = val;
      }
    }
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c.nodeType ? c : document.createTextNode(String(c)));
  return node;
}

let toastTimer = 0;
export function toast(message, { kind = 'info', duration = 3600 } = {}) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = message;
  t.dataset.kind = kind;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

const openModals = [];

export function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return null;
  m.hidden = false;
  requestAnimationFrame(() => m.classList.add('open'));
  openModals.push(m);
  const focusable = m.querySelector('[autofocus], button, input, select');
  focusable?.focus({ preventScroll: true });
  return m;
}

export function closeModal(id) {
  const m = typeof id === 'string' ? document.getElementById(id) : id;
  if (!m || m.hidden) return;
  m.classList.remove('open');
  const idx = openModals.indexOf(m);
  if (idx >= 0) openModals.splice(idx, 1);
  setTimeout(() => {
    if (!m.classList.contains('open')) m.hidden = true;
  }, 220);
}

export function topModal() {
  return openModals[openModals.length - 1] || null;
}

/** Generic message / confirm dialog. Resolves true for the primary action. */
export function messageBox({ title, body, primary = 'OK', secondary = null, danger = false }) {
  const m = $('#modal-message');
  $('#message-title', m).textContent = title;
  const bodyEl = $('#message-body', m);
  bodyEl.replaceChildren(...(Array.isArray(body) ? body : [body]).map((p) => (typeof p === 'string' ? el('p', { text: p }) : p)));
  const ok = $('#message-ok', m);
  const cancel = $('#message-cancel', m);
  ok.textContent = primary;
  ok.classList.toggle('btn-danger', danger);
  cancel.hidden = !secondary;
  if (secondary) cancel.textContent = secondary;
  openModal('modal-message');
  return new Promise((resolve) => {
    const done = (v) => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      m.removeEventListener('modal-dismiss', onCancel);
      closeModal(m);
      resolve(v);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    m.addEventListener('modal-dismiss', onCancel);
  });
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
