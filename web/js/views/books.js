/* Books section: the shelves (books and light novels) and the selected book's card. */
'use strict';

// Book types as stored in the save, with their dictionary key
const BOOK_TYPES = ['book', 'lightNovel']; // saved in book.type; names in books.types.*
// Shelves: light novels first, then books
const SHELVES = ['lightNovel', 'book'];
const BOOK_FILTERS = ['all', 'toRead', 'read'];
let bookFilter = 'all', bookQuery = '', selectedBookId = null;
const bookById = id => state.books.find(b => b.id === id);
const isBookVisible = book => !(bookFilter === 'read' && !book.done) && !(bookFilter === 'toRead' && book.done) && matchesSearch(book.title, bookQuery);
const ratingClass = rating => (rating >= 5 ? ' r5' : rating === 4 ? ' r4' : '');

function renderBooks() {
  const total = state.books.length, done = state.books.filter(b => b.done).length, pages = pagesRead();
  $('#view-books').innerHTML = `
  <div class="spread spread-books">
    <div class="page page-left">
      ${pageHead('books', t('books.subtitle', { done, total }),
        `<button class="btn btn-primary btn-add" data-bnew title="${esc(t('books.newBook'))}" aria-label="${esc(t('books.newBook'))}">+</button>`,
        [`${done}/${total}`, t('books.pagesCount', { count: pages, pages: formatNumber(pages) })])}
      <div class="filters">
        <div class="seg">${BOOK_FILTERS.map(key => `<button class="btn btn-small${bookFilter === key ? ' on' : ''}" data-bfilter="${key}">${t(`books.filters.${key}`)}</button>`).join('')}</div>
        <input type="search" class="search" data-bsearch placeholder="${esc(t('books.searchPlaceholder'))}" aria-label="${esc(t('books.searchPlaceholder'))}" value="${esc(bookQuery)}">
      </div>
      <div id="shelves"></div>
    </div>
    <div class="page page-right" id="bookDetail"></div>
  </div>`;
  renderShelves();
  renderBookDetail();
}

function bookSpineTitle(book) {
  if (book.done) return t('books.spineRead', { title: book.title });
  if (book.progress) return t(book.pages ? 'books.spineProgressOf' : 'books.spineProgress', { title: book.title, page: book.progress, pages: book.pages });
  return book.title;
}

function renderShelves() {
  $('#shelves').innerHTML = SHELVES.map(type => {
    const all = state.books.filter(b => b.type === type);
    const visible = all.filter(isBookVisible).sort((a, b) => a.title.localeCompare(b.title, currentLocale()));
    return `<h3 class="shelf-title">${t(`books.shelves.${type}`)} <small title="${esc(t('books.readCount'))}">${all.filter(b => b.done).length}/${all.length}</small></h3>
      ${visible.length ? `<div class="shelf" data-paged="shelf-${type}" data-paged-group="shelves">${visible.map(book => `
        <button class="spine${book.done ? ' done' : ''}${!book.done && book.progress ? ' reading' : ''}${ratingClass(book.rating)}${book.id === selectedBookId ? ' sel' : ''}" data-book="${esc(book.id)}"
          style="--c:${colorFor(book.title)};--h:${92 + hashString(book.title) % 34}px" title="${esc(bookSpineTitle(book))}">
          <span>${esc(book.title)}</span></button>`).join('')}</div>`
        : `<p class="empty">${t('common.nothingWithFilter')}</p>`}`;
  }).join('');
}

function renderBookDetail() {
  const box = $('#bookDetail');
  const book = selectedBookId && bookById(selectedBookId);
  if (!book) {
    box.innerHTML = `<div class="detail-empty">
      <div class="big-book" style="--c:#e3c49f"><span>?</span></div>
      <p>${t('books.pickBook')}</p>
    </div>`;
    return;
  }
  const percent = book.pages ? Math.min(100, Math.round((book.progress || 0) / book.pages * 100)) : 0;
  box.innerHTML = `<div class="book-detail">
    <button type="button" class="big-book${book.cover ? ' has-cover' : ''}${ratingClass(book.rating)}" style="--c:${colorFor(book.title)}" data-bcover title="${esc(t(book.cover ? 'books.changeCover' : 'books.findCover'))}">
      ${book.cover ? `<img src="${esc(book.cover)}" alt="">` : `<span>${esc(book.title)}</span>`}${book.done ? `<i class="stamp">${t('books.readStamp')}</i>` : ''}<i class="cover-hint">${ico('ui-search', '')}</i></button>
    <h2 class="detail-title">${esc(book.title)}</h2>
    ${book.author ? `<p class="book-author">${esc(book.author)}</p>` : ''}
    <div class="row2">
      <label class="field"><span>${t('common.typeLabel')}</span><select data-bfield="type">
        ${BOOK_TYPES.map(type => `<option value="${type}"${book.type === type ? ' selected' : ''}>${t(`books.types.${type}`)}</option>`).join('')}</select></label>
      <label class="field"><span>${t('books.pages')}</span><input type="number" min="0" data-bfield="pages" value="${book.pages ?? ''}" placeholder="—"></label>
    </div>
    ${book.done ? '' : `<div class="field"><span>${t('books.currentPage')}</span><div class="page-progress">
      <input type="number" min="0"${book.pages ? ` max="${book.pages}"` : ''} data-bfield="progress" value="${book.progress || ''}" placeholder="0" aria-label="${esc(t('books.currentPage'))}">
      ${book.pages ? `<div class="pbar" style="--c:var(--sage)"><div style="width:${percent}%"></div><span>${percent}%</span></div>` : ''}
    </div></div>`}
    <div class="field"><span>${t('books.rating')}</span><div class="stars">
      ${[1, 2, 3, 4, 5].map(n => `<button class="star${n <= book.rating ? ' on' : ''}" data-brate="${n}" aria-label="${esc(t('books.stars', { count: n }))}">★</button>`).join('')}</div></div>
    <button class="btn ${book.done ? '' : 'btn-success'} full" data-btoggle>${t(book.done ? 'books.markPending' : 'books.markRead')}</button>
    ${bookExtrasHTML(book)}
    <label class="field" style="margin-top:16px"><span>${t('common.notesLabel')}</span>
      <textarea rows="6" data-bfield="note" maxlength="3000" placeholder="${esc(t('books.notesPlaceholder'))}">${esc(book.note)}</textarea></label>
    <div class="detail-actions">
      <button class="btn btn-small" data-bedit>${UI_ICON.edit} ${t('common.renameUpper')}</button>
      <button class="btn btn-small btn-danger" data-bdel>${UI_ICON.del} ${t('common.deleteUpper')}</button>
    </div>
  </div>`;
}

function openNewBookModal() {
  let type = 'book';
  openModal({
    title: t('books.newBookTitle'),
    body: `<form data-nbform autocomplete="off">
      <label class="field"><span>${t('common.titleLabel')}</span><input type="text" name="title" maxlength="120" placeholder="${esc(t('books.titlePlaceholder'))}"></label>
      <div class="row2">
        <div class="field"><span>${t('common.typeLabel')}</span>${segHTML('btype', BOOK_TYPES.map(type => [type, t(`books.types.${type}`).toUpperCase()]))}</div>
        <label class="field"><span>${t('books.pages')}</span><input type="number" name="pages" min="0" placeholder="${esc(t('common.optional'))}"></label>
      </div>
    </form>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t('common.addUpper')}</button>`,
    onMount: modal => {
      const form = $('[data-nbform]', modal);
      bindSeg(modal, 'btype', () => type, value => { type = value; });
      const accept = () => {
        const title = form.title.value.trim();
        if (!title) { sfx('error'); toast(t('books.titleRequired'), 'warn'); return; }
        const pages = parseInt(form.pages.value, 10);
        const book = { id: uid(), title, type, done: false, pages: pages > 0 ? pages : null, progress: 0, note: '', rating: 0 };
        state.books.push(book);
        selectedBookId = book.id;
        bookFilter = 'all'; bookQuery = '';
        closeModal(); sfx('place'); commit();
      };
      $('[data-ok]', modal).onclick = accept;
      form.addEventListener('submit', e => { e.preventDefault(); accept(); });
    },
  });
}

function bindBooks() {
  const view = $('#view-books');
  view.addEventListener('click', e => {
    const target = e.target;
    const filterButton = target.closest('[data-bfilter]');
    if (filterButton) {
      bookFilter = filterButton.dataset.bfilter;
      $$('[data-bfilter]', view).forEach(x => x.classList.toggle('on', x === filterButton));
      renderShelves();
      return;
    }
    const spine = target.closest('[data-book]');
    if (spine) {
      selectedBookId = spine.dataset.book;
      sfx('page');
      renderShelves();
      renderBookDetail();
      if (window.innerWidth < 1100) $('#bookDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (target.closest('[data-bnew]')) { openNewBookModal(); return; }
    const book = selectedBookId && bookById(selectedBookId);
    if (!book) return;
    const toggleButton = target.closest('[data-btoggle]');
    if (toggleButton) {
      xpChange(() => { book.done = !book.done; book.doneAt = book.done ? todayISO() : ''; }, toggleButton, book.title);
      sfx(book.done ? 'coin' : 'remove');
      commit();
      return;
    }
    const star = target.closest('[data-brate]');
    if (star) {
      const rating = +star.dataset.brate;
      book.rating = book.rating === rating ? 0 : rating;
      sfx('select'); save(); renderBookDetail();
      return;
    }
    if (target.closest('[data-bedit]')) {
      promptModal({ title: t('books.renameTitle'), label: t('common.titleLabel'), value: book.title, max: 120, onOk: title => { book.title = title; commit(); } });
      return;
    }
    if (target.closest('[data-bdel]')) {
      selectedBookId = null;
      removeWithUndo(state, 'books', book, book.title);
    }
  });
  view.addEventListener('input', e => {
    if (e.target.matches('[data-bsearch]')) { bookQuery = e.target.value; renderShelves(); }
  });
  view.addEventListener('change', e => {
    const field = e.target.dataset.bfield;
    const book = selectedBookId && bookById(selectedBookId);
    if (!field || !book) return;
    if (field === 'pages' || field === 'progress') {
      const value = Math.max(0, parseInt(e.target.value, 10) || 0);
      xpChange(() => {
        if (field === 'pages') book.pages = value || null;
        else book.progress = book.pages ? Math.min(value, book.pages) : value;
        // Reaching the last page finishes the book
        if (field === 'progress' && book.pages && book.progress >= book.pages && !book.done) { book.done = true; book.doneAt = todayISO(); sfx('coin'); }
      }, e.target, book.title);
      commit();
      return;
    }
    if (field === 'type') { book.type = BOOK_TYPES.includes(e.target.value) ? e.target.value : 'book'; renderShelves(); }
    else book.note = e.target.value.slice(0, 3000);
    save();
  });
}

registerView('books', {
  render: renderBooks, bind: bindBooks,
  reset: () => { bookFilter = 'all'; bookQuery = ''; selectedBookId = null; },
});
