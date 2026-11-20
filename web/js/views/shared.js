/* Pieces shared by the sections: page header, accent-insensitive search, folds and the book pages (paged lists). */
'use strict';

/** Header of a section page: icon, title (with optional counters) and action buttons. */
function pageHead(sectionId, subtitle, actions = '', count = '') {
  const sec = SECTIONS.find(x => x.id === sectionId);
  const counters = [].concat(count).filter(c => c !== '' && c != null).map(c => `<span class="pt-count">${c}</span>`).join('');
  return `<div class="page-head">
    <div>
      <h1 class="page-title"${subtitle ? ` title="${esc(subtitle)}"` : ''}><span class="pt-icon" style="--rc:${sec.color}">${ico(`sec-${sec.id}`, sec.icon)}</span>${esc(sec.label.toUpperCase())}${counters}</h1>
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>`;
}

// ---------------------------------------------------------
// Folds: a card that closes down to its title plate. Whether each one is open is
// remembered in settings.folds (id → true/false); ids look like "home.goals".
// ---------------------------------------------------------
// Folds start closed (the player opens what they need); only these start open
const FOLDS_OPEN_BY_DEFAULT = new Set(['schedule.inventory']);
const isFoldOpen = id => (id in state.settings.folds ? state.settings.folds[id] : FOLDS_OPEN_BY_DEFAULT.has(id));
/** `summary` (optional) stays visible next to the title when the fold is closed. `body` may be a function:
 *  then it is only drawn while the fold is open (what is closed costs nothing). */
function foldHTML(id, title, summary, body, className = '') {
  const open = isFoldOpen(id);
  const content = typeof body === 'function' ? (open ? body() : '') : body;
  return `<details class="card fold${className ? ` ${className}` : ''}" data-fold="${esc(id)}"${open ? ' open' : ''}${typeof body === 'function' ? ' data-lazy' : ''}>
    <summary class="card-title"><span class="fold-title">${title}</span>${summary ? `<small class="fold-sum">${summary}</small>` : ''}</summary>
    ${content}
  </details>`;
}
/** Remembers the folds inside `root`; opening a lazy one draws the view again (`redraw`). */
function bindFolds(root, redraw) {
  root.addEventListener('toggle', e => {
    const fold = e.target;
    if (!fold.matches || !fold.matches('details[data-fold]')) return;
    if (isFoldOpen(fold.dataset.fold) === fold.open) return; // drawing the page also fires "toggle"
    state.settings.folds[fold.dataset.fold] = fold.open;
    sfx('select');
    save();
    if (fold.open && fold.hasAttribute('data-lazy') && redraw) {
      redraw();
      const again = root.querySelector(`[data-fold="${fold.dataset.fold}"] > summary`);
      if (again) again.focus(); // the keyboard stays on the fold that was opened
    }
  }, true); // "toggle" does not bubble
}

// ---------------------------------------------------------
// Book pages: no scrolling through long lists. A list marked data-paged="<key>" is cut where the visible page
// ends; a pager shows ◀ page n of m ▶ (always at the same height) and a red "+N" on ▶ while some of the next
// pages were never seen. Options on the list: data-paged-group (lists that share the height, e.g. two shelves),
// data-paged-row (lists side by side whose pagers line up), data-paged-reserve (px kept free below it, default
// 110), data-pager="inside" (the pager goes inside, as its last child).
// Children with data-page-keep (a column title) always stay. It runs again when the book changes or the
// window is resized; the page of each list is remembered while the app is open.
// ---------------------------------------------------------
const PAGE_OF = {};
const PAGE_MIN_HEIGHT = 120;
const pagedItems = list => [...list.children].filter(x => !x.matches('.pager, .empty, [data-page-keep]'));
function oldPager(list) {
  if (list.dataset.pager === 'inside') return list.querySelector(':scope > .pager');
  const next = list.nextElementSibling;
  return next && next.matches('.pager') && next.dataset.for === list.dataset.paged ? next : null;
}
function paginateList(list, available) {
  const key = list.dataset.paged, items = pagedItems(list), previous = oldPager(list);
  if (previous) previous.remove();
  items.forEach(x => { x.hidden = false; });
  const pages = [];
  let start = 0, rowTop = null, row = [];
  for (const item of items) {
    const box = item.getBoundingClientRect();
    if (!box.height) continue;
    // Row-major: a grid row is never split. When a taller item of a row does not fit, the whole row moves to
    // the next page (unless it is alone there: a block taller than the page keeps its row with it)
    const sameRow = rowTop !== null && Math.abs(box.top - rowTop) < 2;
    if (!sameRow) { row = []; rowTop = box.top; }
    const tooLong = pages.length > 0 && box.bottom - start > available, current = pages[pages.length - 1];
    if (!pages.length || (tooLong && !sameRow)) { pages.push([]); start = box.top; }
    else if (tooLong && current.length > row.length) { current.splice(current.length - row.length); pages.push([...row]); start = rowTop; }
    row.push(item);
    pages[pages.length - 1].push(item);
  }
  // A heading never ends a page: it goes to the next one, with what it heads
  for (let i = 0; i < pages.length - 1; i++) {
    while (pages[i].length > 1 && pages[i][pages[i].length - 1].matches('h2, h3')) pages[i + 1].unshift(pages[i].pop());
  }
  if (pages.length < 2) return;
  const page = Math.min(PAGE_OF[key] || 0, pages.length - 1);
  PAGE_OF[key] = page;
  const room = showPage(list, pages, page, available);
  const later = pages.slice(page + 1).reduce((n, p) => n + p.length, 0);
  const unseen = unseenAfter(key, pages, page);
  const pager = el('nav', 'pager', `
    <button type="button" class="btn btn-small" data-page="-1"${page ? '' : ' disabled'} aria-label="${esc(t('common.previousPage'))}"><span class="pager-arrow">◀</span></button>
    <span>${t('common.pageOf', { page: page + 1, count: pages.length })}</span>
    <button type="button" class="btn btn-small pager-next" data-page="1"${later ? '' : ' disabled'} aria-label="${esc(t('common.nextPage'))}"><span class="pager-arrow">▶</span>${unseen ? `<i class="pager-dot" title="${esc(t('common.moreOnNext', { count: unseen }))}">+${unseen}</i>` : ''}</button>`);
  pager.dataset.for = key;
  pager.setAttribute('aria-label', t('common.pages'));
  pager.style.setProperty('--pager-pad', `${room}px`);
  if (list.dataset.pager === 'inside') list.append(pager); else list.after(pager);
}
/** Shows only `page` and returns the room left under it by the tallest page (never more than the visible page):
 *  kept above the pager, so the ◀ ▶ buttons stay under the mouse while the pages turn, whatever their length. */
function showPage(list, pages, page, available) {
  const top = list.getBoundingClientRect().top;
  const bottomOf = items => Math.max(...items.map(x => x.getBoundingClientRect().bottom)) - top;
  pages.flat().forEach(x => { x.hidden = true; });
  let tallest = 0;
  pages.forEach((items, i) => {
    if (i === page) return;
    items.forEach(x => { x.hidden = false; });
    tallest = Math.max(tallest, bottomOf(items));
    items.forEach(x => { x.hidden = true; });
  });
  pages[page].forEach(x => { x.hidden = false; });
  return Math.max(0, Math.min(tallest, available) - bottomOf(pages[page]));
}
/** The red "+N" is a notice, not a counter: it counts what was never shown on screen and is gone once
 *  every page was seen (remembered in settings.pagesSeen as how far the list was read). */
function unseenAfter(key, pages, page) {
  const total = pages.reduce((n, p) => n + p.length, 0), shown = pages.slice(0, page + 1).reduce((n, p) => n + p.length, 0);
  const seen = state.settings.pagesSeen[key] || 0;
  if (shown > seen) {
    delete state.settings.pagesSeen[key]; // the most recent stays last: normalize() keeps the newest ones
    state.settings.pagesSeen[key] = shown;
    save();
  }
  return Math.max(0, total - Math.max(seen, shown));
}
function paginateAll() {
  const lists = $$('.book [data-paged]').filter(list => list.offsetParent !== null);
  const groups = {};
  lists.forEach(list => { const g = list.dataset.pagedGroup; if (g) (groups[g] = groups[g] || []).push(list); });
  // What stays visible under the sticky top bar once the reader scrolls a list up to it
  const screen = innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-h')) || 0);
  const narrow = innerWidth <= 980; // the tabs wrap in rows and the columns stack (as in features/layout.js)
  for (const list of lists) {
    const reserve = +list.dataset.pagedReserve || 110, group = groups[list.dataset.pagedGroup];
    const top = (group ? group[0] : list).getBoundingClientRect().top + scrollY;
    let room = innerHeight - top - reserve;
    // When the reader has to scroll down to a list anyway (it starts under the bottom edge, or low in a narrow
    // window), each page is a whole screen instead of a sliver that holds a card or two
    if (room < PAGE_MIN_HEIGHT || (narrow && room < (screen - reserve) / 2)) room = screen - reserve;
    paginateList(list, Math.max(PAGE_MIN_HEIGHT, group ? room / group.length - 90 : room));
  }
  // Lists side by side (data-paged-row) put their pagers on one line; stacked in a narrow window, each keeps its own
  const rows = {};
  lists.forEach(list => { const r = list.dataset.pagedRow; if (r) (rows[r] = rows[r] || []).push(list); });
  const buttonTop = pager => pager.querySelector('.btn').getBoundingClientRect().top;
  Object.values(rows).forEach(row => {
    const tops = row.map(list => list.getBoundingClientRect().top), pagers = row.map(oldPager).filter(Boolean);
    if (pagers.length < 2 || Math.max(...tops) - Math.min(...tops) > 1) return;
    const lowest = Math.max(...pagers.map(buttonTop));
    pagers.forEach(p => p.style.setProperty('--pager-pad', `${parseFloat(p.style.getPropertyValue('--pager-pad')) + lowest - buttonTop(p)}px`));
  });
}
let pagingFrame = 0;
const schedulePaging = () => { cancelAnimationFrame(pagingFrame); pagingFrame = requestAnimationFrame(paginateAll); };
new MutationObserver(records => {
  const onlyPagers = records.every(r => [...r.addedNodes, ...r.removedNodes].every(n => n.nodeType === 1 && n.matches('.pager')));
  if (!onlyPagers) schedulePaging();
}).observe($('.book'), { childList: true, subtree: true });
addEventListener('resize', schedulePaging);
document.addEventListener('click', e => {
  const button = e.target.closest('.pager [data-page]');
  if (!button) return;
  const key = button.closest('.pager').dataset.for;
  PAGE_OF[key] = Math.max(0, (PAGE_OF[key] || 0) + +button.dataset.page);
  sfx('page');
  paginateAll();
  const again = $(`.pager[data-for="${key}"] [data-page="${button.dataset.page}"]`);
  if (again && !again.disabled) again.focus(); else { const other = $(`.pager[data-for="${key}"] [data-page]:not([disabled])`); if (other) other.focus(); }
});

/** Case- and accent-insensitive "contains" (an empty query matches everything). */
const matchesSearch = (text, query) => !query || stripAccents(String(text).toLowerCase()).includes(stripAccents(query.toLowerCase()));
