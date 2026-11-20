/* Layout: the top bar and the tabs fit any zoom, and every "·" is drawn as a pixel dash. */
'use strict';

// ---------------------------------------------------------
// Top bar and section tabs fit
// ---------------------------------------------------------
const HUD_LEVELS = ['hud-1', 'hud-2', 'hud-3', 'hud-4', 'hud-5', 'hud-6'];
/** The section tabs never go past the bottom edge of the book: they shrink, then (last resort) scroll. */
function fitTabs(hudHeight) {
  const nav = $('#ribbons'), rootStyle = document.documentElement.style, count = nav.children.length;
  nav.classList.remove('tight', 'tighter', 'overflow');
  rootStyle.removeProperty('--tab-h');
  if (innerWidth <= 980 || !count) return; // narrow screens already wrap the tabs in rows
  const room = innerHeight - hudHeight - 62; // the height of the book on screen (same as .ribbons max-height)
  if (36 + count * 50 + (count - 1) * 5 <= room) return; // they fit at their normal size
  const height = Math.floor((room - 8 - (count - 1) * 3) / count);
  nav.classList.add('tight');
  nav.classList.toggle('tighter', height < 34); // small icons, no padding
  nav.classList.toggle('overflow', height < 26); // even that does not fit: show the scroll bar
  rootStyle.setProperty('--tab-h', `${Math.max(26, Math.min(50, height))}px`);
}
function fitHUD() {
  const hud = $('.hud');
  hud.classList.remove(...HUD_LEVELS);
  for (const level of HUD_LEVELS) {
    if (hud.scrollWidth <= hud.clientWidth) break;
    hud.classList.add(level);
  }
  const height = getComputedStyle(hud).position === 'sticky' ? hud.offsetHeight : 0;
  document.documentElement.style.setProperty('--hud-h', `${height}px`);
  fitTabs(height);
}
let fitTimer = 0;
function scheduleFit() { clearTimeout(fitTimer); fitTimer = setTimeout(fitHUD, 30); }
appOn('hudRender', scheduleFit);

// ---------------------------------------------------------
// Separators
// ---------------------------------------------------------
const SEPARATOR_SKIP = new Set(['TEXTAREA', 'INPUT', 'SCRIPT', 'STYLE', 'SELECT', 'TITLE']);
/** For text the page cannot draw on (Windows notifications, titles, options): an evenly spaced dash between the parts. */
const plainSeparators = text => String(text).replace(/\s*·\s*/g, ' – ');
function decorateSeparatorText(node) {
  const parent = node.parentNode;
  if (!parent || !node.nodeValue.includes('·') || SEPARATOR_SKIP.has(parent.nodeName) || parent.namespaceURI !== 'http://www.w3.org/1999/xhtml') return;
  if (parent.isContentEditable || (parent.closest && parent.closest('[contenteditable], .no-sep'))) return;
  if (parent.nodeName === 'OPTION') { node.nodeValue = plainSeparators(node.nodeValue); return; } // no "·" is left, so the observer stops there
  const wrap = document.createElement('span');
  wrap.className = 'sepw';
  node.nodeValue.split(/\s*·\s*/).forEach((part, i) => {
    if (i) {
      const arrow = document.createElement('i');
      arrow.className = 'sep';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.style.setProperty('--i', i);
      wrap.append(arrow);
    }
    if (part) wrap.append(part);
  });
  parent.replaceChild(wrap, node);
}
function plainSeparatorAttributes(element) {
  for (const name of ['title', 'aria-label', 'placeholder']) {
    const value = element.getAttribute && element.getAttribute(name);
    if (!value || !value.includes('·')) continue;
    const plain = plainSeparators(value);
    if (plain !== value) element.setAttribute(name, plain); // only on a change: the observer sees every write
  }
}
function decorateSeparators(root) {
  if (root.nodeType === 3) { decorateSeparatorText(root); return; }
  if (root.nodeType !== 1) return;
  plainSeparatorAttributes(root);
  root.querySelectorAll('[title*="·"], [aria-label*="·"], [placeholder*="·"]').forEach(plainSeparatorAttributes);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.nodeValue.includes('·') ? 1 : 3) });
  const found = [];
  while (walker.nextNode()) found.push(walker.currentNode);
  found.forEach(decorateSeparatorText);
}
function watchSeparators() {
  decorateSeparators(document.body);
  new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === 'childList') m.addedNodes.forEach(decorateSeparators);
      else if (m.type === 'characterData') decorateSeparatorText(m.target);
      else plainSeparatorAttributes(m.target);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'] });
}

function layoutBoot() {
  watchSeparators();
  window.addEventListener('resize', scheduleFit); // zooming changes the window width
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFit);
  document.addEventListener('keydown', e => { // Ctrl+0: a safe way out if the size got too big
    if (!desktopApi || !(e.ctrlKey || e.metaKey) || (e.key !== '0' && e.code !== 'Numpad0')) return;
    e.preventDefault();
    state.settings.uiScale = 'auto';
    applyZoom();
    save();
    sfx('select');
    toast(t('layout.autoSize'), 'info', { icon: ico('ui-settings', '⚙️') });
  });
}
