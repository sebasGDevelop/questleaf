/* Windows (modals): a normal one replaces the others; a stacked one (a confirmation) opens on top. */
'use strict';

/**
 * Opens a window. cls adds classes to the .modal; autofocus: false skips focusing the first field.
 * onMount(modalElement) runs once the window is in the page.
 */
function openModal({ title, body, footer = '', onMount, wide, cls = '', stack = false, autofocus = true }) {
  if (!stack) closeAllModals();
  const overlay = el('div', 'overlay');
  overlay.previousFocus = document.activeElement;
  overlay.innerHTML = `
      <div class="modal${wide ? ' wide' : ''}${cls ? ` ${cls}` : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-bar"><span>${esc(title)}</span><button class="modal-x" data-close aria-label="${esc(t('common.close'))}">✕</button></div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;
  $('#modalRoot').append(overlay);
  // Close by clicking outside, but not when a text selection started inside and ended outside
  let pressedOnOverlay = false;
  overlay.addEventListener('mousedown', e => { pressedOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => {
    if ((e.target === overlay && pressedOnOverlay) || e.target.closest('[data-close]')) closeModal();
  });
  const modal = $('.modal', overlay);
  if (onMount) onMount(modal);
  if (autofocus) {
    setTimeout(() => {
      const field = $('input[type=text], input[type=number], textarea, select', modal);
      if (field) field.focus();
    }, 30);
  }
}
/** Closes only the top window and returns the focus to where it was. */
function closeModal() {
  const overlays = $$('#modalRoot > .overlay'), top = overlays[overlays.length - 1];
  if (!top) return;
  top.remove();
  if (top.previousFocus && top.previousFocus.isConnected) top.previousFocus.focus();
}
function closeAllModals() { $('#modalRoot').innerHTML = ''; }
const isModalOpen = () => !!$('#modalRoot .overlay');

/** "Are you sure?" window. opts.stack: opens on top of the current window and CANCEL returns to it. */
function confirmModal(html, onYes, yesLabel = t('common.yesDelete'), opts = {}) {
  openModal({
    title: t('common.areYouSure'),
    stack: !!opts.stack,
    body: `<p class="confirm-text">${html}</p>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-danger" data-yes>${esc(yesLabel)}</button>`,
    onMount: modal => { $('[data-yes]', modal).onclick = () => { closeModal(); onYes(); }; },
  });
}

/**
 * Deletes at once and offers UNDO for a few seconds: faster than a confirmation and just as safe.
 * Removes `item` from owner[key]; `after` saves and redraws (commit by default). Undo puts it back in place.
 */
function removeWithUndo(owner, key, item, label, after = commit) {
  const index = owner[key].indexOf(item);
  if (index < 0) return;
  owner[key] = owner[key].filter(x => x !== item);
  sfx('remove');
  after();
  toast(t('common.removedNamed', { name: label }), 'info', {
    icon: UI_ICON.del, duration: 6000,
    action: { label: t('common.undo'), fn: () => {
      const current = owner[key];
      if (current.includes(item)) return;
      current.splice(Math.min(index, current.length), 0, item);
      sfx('place');
      after();
    } },
  });
}
const shortLabel = text => (text.length > 40 ? `${text.slice(0, 40)}…` : text);

/** Window with one text field (or text area); onOk receives the trimmed text. */
function promptModal({ title, label, value = '', placeholder = '', multiline = false, max = 200, okLabel = t('common.save'), onOk }) {
  openModal({
    title,
    body: `<form data-prompt autocomplete="off"><label class="field"><span>${esc(label)}</span>
      ${multiline
        ? `<textarea name="v" rows="6" maxlength="${max}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
        : `<input type="text" name="v" maxlength="${max}" placeholder="${esc(placeholder)}" value="${esc(value)}">`}
      </label></form>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${esc(okLabel)}</button>`,
    onMount: modal => {
      const form = $('[data-prompt]', modal);
      const accept = () => {
        const text = form.v.value.trim();
        if (!text) { sfx('error'); toast(t('common.writeSomething'), 'warn'); return; }
        closeModal();
        onOk(text);
      };
      $('[data-ok]', modal).onclick = accept;
      form.addEventListener('submit', e => { e.preventDefault(); accept(); });
    },
  });
}

// ---------------------------------------------------------
// Small form controls
// ---------------------------------------------------------
/** Segmented buttons: options = [[value, labelHtml], …]. Connect them with bindSeg. */
function segHTML(name, options) {
  return `<div class="seg" data-seg="${name}">${options.map(([value, label]) => `<button type="button" class="btn" data-v="${value}">${label}</button>`).join('')}</div>`;
}
/** Marks the current option and calls set(value) on click. Returns sync() to refresh the marks. */
function bindSeg(root, name, get, set) {
  const buttons = $$(`[data-seg="${name}"] button`, root);
  const sync = () => buttons.forEach(b => b.classList.toggle('on', b.dataset.v === String(get())));
  buttons.forEach(b => b.addEventListener('click', () => { set(b.dataset.v); sync(); }));
  sync();
  return sync;
}
/** Color squares to pick a color (data-color). */
const swatchesHTML = (colors = PASTELS) =>
  `<div class="swatches">${colors.map(c => `<button type="button" data-color="${c}" style="background:${c}" aria-label="${esc(t('common.colorNamed', { color: c }))}"></button>`).join('')}</div>`;
