/* Books and movies extras: automatic covers (Open Library, Wikipedia, iTunes), tags and book quotes. */
'use strict';

// Saved in tags / pace of books and movies; names in library.tags.* and library.paces.*
const READING_TAGS = ['epic', 'moving', 'funny', 'dark', 'inspiring', 'relaxing', 'intriguing'];
const PACES = ['slow', 'medium', 'fast'];

function tagsFieldHTML(item, attr) {
  return `<div class="field"><span>${t('library.tagsLabel')}</span><div class="tag-row">
    ${READING_TAGS.map(tag => `<button type="button" class="chip tag${item.tags.includes(tag) ? ' on' : ''}" data-${attr}tag="${tag}">${t(`library.tags.${tag}`)}</button>`).join('')}
    <span class="tag-sep"></span>
    ${PACES.map(pace => `<button type="button" class="chip tag pace${item.pace === pace ? ' on' : ''}" data-${attr}pace="${pace}" title="${esc(t('library.pace'))}">${t(`library.paces.${pace}`)}</button>`).join('')}
  </div></div>`;
}

// ---------------------------------------------------------
// Books: cover, author, tags and quotes
// ---------------------------------------------------------
function bookExtrasHTML(book) {
  const saveQuote = esc(t('library.saveQuote'));
  return `${tagsFieldHTML(book, 'b')}
    <div class="field"><span>${t('library.bookQuotes')}</span>
      <div class="bquotes">${book.quotes.map(quote => {
    const sendLabel = esc(quote.sent ? t('library.quoteAlreadySent') : t('library.sendQuote'));
    return `<div class="bquote${quote.sent ? ' sent' : ''}">
        <p>“${esc(quote.text)}”</p>
        <button type="button" class="icon-mini" data-bqsend="${esc(quote.id)}" title="${sendLabel}" aria-label="${sendLabel}"${quote.sent ? ' disabled' : ''}>${quote.sent ? '✓' : '→'}</button>
        <button type="button" class="icon-mini" data-bqdel="${esc(quote.id)}" title="${esc(t('common.remove'))}" aria-label="${esc(t('common.remove'))}">${UI_ICON.del}</button>
      </div>`;
  }).join('')}</div>
      <form class="bq-form" data-bqform autocomplete="off"><input type="text" name="q" maxlength="400" placeholder="${esc(t('library.quotePlaceholder'))}" aria-label="${saveQuote}"><button class="btn btn-small btn-add" title="${saveQuote}" aria-label="${saveQuote}">+</button></form>
    </div>`;
}
async function findCovers(title) {
  const data = await netJSON(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=12&fields=title,author_name,cover_i,number_of_pages_median`);
  return data && data.docs ? data.docs.filter(x => x.cover_i).slice(0, 8).map(x => ({
    cover: `https://covers.openlibrary.org/b/id/${x.cover_i}-M.jpg`, title: x.title, author: (x.author_name || [])[0] || '', pages: x.number_of_pages_median || 0,
  })) : [];
}
// Posters: the English Wikipedia has almost all of them; a Spanish title jumps from the Spanish
// page to the English one. Series are also looked up on iTunes.
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=400&pilicense=any';
const wikiPages = data => Object.values((data && data.query && data.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
async function findPosters(title) {
  const query = encodeURIComponent(title);
  const [english, spanish, series] = await Promise.all([
    netJSON(`${WIKIPEDIA_API}&generator=search&gsrlimit=6&gsrsearch=${encodeURIComponent(title + ' film')}`).catch(() => null),
    netJSON(`https://es.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=3&gsrsearch=${encodeURIComponent(title + ' película')}&prop=langlinks&lllang=en`).catch(() => null),
    netJSON(`https://itunes.apple.com/search?term=${query}&media=tvShow&entity=tvSeason&limit=3`).catch(() => null),
  ]);
  const englishTitles = wikiPages(spanish).map(p => p.langlinks && p.langlinks[0] && p.langlinks[0]['*']).filter(Boolean);
  const fromSpanish = englishTitles.length ? await netJSON(`${WIKIPEDIA_API}&titles=${encodeURIComponent(englishTitles.join('|'))}`).catch(() => null) : null;
  const results = [];
  [...wikiPages(fromSpanish), ...wikiPages(english)].forEach(p => { if (p.thumbnail) results.push({ cover: p.thumbnail.source, title: p.title, author: 'Wikipedia' }); });
  ((series && series.results) || []).forEach(x => { if (x.artworkUrl100) results.push({ cover: x.artworkUrl100.replace('100x100bb', '400x400bb'), title: x.collectionName || '', author: 'iTunes' }); });
  const seen = new Set();
  return results.filter(x => !seen.has(x.cover) && seen.add(x.cover)).slice(0, 8);
}
/** Window to pick a cover among the search results. onPick(result | null) — null removes the cover. */
function openCoverPicker(item, finder, onPick) {
  const searching = `<small class="muted">${t('library.searching')}</small>`;
  openModal({
    title: t('library.pickCover'), wide: true,
    body: `<form class="cover-search" data-csform autocomplete="off"><input type="search" name="q" value="${esc(item.title)}" aria-label="${esc(t('library.search'))}"><button class="btn btn-ico solo" aria-label="${esc(t('library.search'))}">${ico('ui-search', '🔍')}</button></form>
      <div class="cover-grid" data-cgrid>${searching}</div>`,
    footer: `${item.cover ? `<button class="btn" data-cclear>${t('library.removeCover')}</button>` : ''}<span class="spacer"></span><button class="btn" data-close>${t('common.closeUpper')}</button>`,
    onMount: modal => {
      const grid = $('[data-cgrid]', modal);
      let results = [];
      const run = async query => {
        grid.innerHTML = searching;
        try { results = await finder(query); } catch (e) { results = []; }
        grid.innerHTML = results.length ? results.map((r, i) => `<button type="button" class="cover-opt" data-cpick="${i}" title="${esc(r.title)}${r.author ? ` · ${esc(r.author)}` : ''}">
          <img src="${esc(r.cover)}" alt="" loading="lazy"><small>${esc(r.title)}</small></button>`).join('')
          : `<small class="muted">${t('library.noCovers')}</small>`;
      };
      run(item.title);
      $('[data-csform]', modal).addEventListener('submit', e => { e.preventDefault(); run(e.target.q.value.trim() || item.title); });
      grid.addEventListener('click', e => { const button = e.target.closest('[data-cpick]'); if (button) { closeModal(); onPick(results[+button.dataset.cpick]); } });
      const clearButton = $('[data-cclear]', modal);
      if (clearButton) clearButton.onclick = () => { closeModal(); onPick(null); };
    },
  });
}
// Quotes go to Reflections in the language guessed from simple hints
const looksSpanish = text => /[áéíóúñ¿¡]/i.test(text) || /\b(el|la|los|las|que|de|y|en|un|una|es|no|por|con)\b/i.test(text);

function libraryBoot() {
  const booksView = $('#view-books');
  booksView.addEventListener('click', e => {
    const book = selectedBookId && bookById(selectedBookId);
    if (!book) return;
    const target = e.target;
    if (target.closest('[data-bcover]')) {
      openCoverPicker(book, findCovers, result => {
        if (!result) book.cover = '';
        else { book.cover = result.cover; if (!book.author && result.author) book.author = result.author; if (!book.pages && result.pages) book.pages = result.pages; }
        sfx('place'); save(); renderBookDetail();
      });
      return;
    }
    const tagButton = target.closest('[data-btag]');
    if (tagButton) { const tag = tagButton.dataset.btag; book.tags = book.tags.includes(tag) ? book.tags.filter(x => x !== tag) : [...book.tags, tag]; sfx('select'); save(); renderBookDetail(); return; }
    const paceButton = target.closest('[data-bpace]');
    if (paceButton) { book.pace = book.pace === paceButton.dataset.bpace ? '' : paceButton.dataset.bpace; sfx('select'); save(); renderBookDetail(); return; }
    const sendButton = target.closest('[data-bqsend]');
    if (sendButton) {
      const quote = book.quotes.find(x => x.id === sendButton.dataset.bqsend);
      if (!quote || quote.sent) return;
      state.reflections[looksSpanish(quote.text) ? 'es' : 'en'].unshift({ id: uid(), text: `${quote.text} — ${book.title}`, fav: false });
      quote.sent = true;
      sfx('coin'); save(); renderBookDetail();
      toast(t('library.quoteSent'), 'info', { icon: ico('sec-reflections', '💭') });
      return;
    }
    const deleteButton = target.closest('[data-bqdel]');
    if (deleteButton) { book.quotes = book.quotes.filter(x => x.id !== deleteButton.dataset.bqdel); sfx('remove'); save(); renderBookDetail(); }
  });
  booksView.addEventListener('submit', e => {
    const form = e.target.closest('[data-bqform]');
    if (!form) return;
    e.preventDefault();
    const book = selectedBookId && bookById(selectedBookId), text = form.q.value.trim();
    if (!book || !text) return;
    book.quotes.push({ id: uid(), text: text.slice(0, 400), sent: false });
    sfx('place'); save(); renderBookDetail();
  });
  // Movies: card with poster, rating, tags and note
  $('#view-movies').addEventListener('click', e => {
    const button = e.target.closest('[data-mopen]');
    if (button) openMovieModal(movieById(button.dataset.mopen));
  });
}

function openMovieModal(movie) {
  if (!movie) return;
  const draw = () => {
    const posterLabel = esc(movie.cover ? t('library.changePoster') : t('library.findPoster'));
    return `<div class="movie-detail">
      <button type="button" class="poster${movie.cover ? ' has' : ''}" data-mcover title="${posterLabel}" aria-label="${posterLabel}">${movie.cover ? `<img src="${esc(movie.cover)}" alt="">` : `<span>${ico('ui-search', '')}</span>`}</button>
      <div class="md-info">
        <h2 class="detail-title">${esc(movie.title)}</h2>
        <div class="stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="star${n <= movie.rating ? ' on' : ''}" data-mrate="${n}" aria-label="${esc(t('books.stars', { count: n }))}">★</button>`).join('')}</div>
        ${movie.done ? `<label class="field"><span>${t('library.watchedOn')}</span><input type="date" data-mseen value="${esc(movie.doneAt || '')}"></label>` : ''}
        ${tagsFieldHTML(movie, 'm')}
        <label class="field"><span>${t('library.note')}</span><textarea rows="3" data-mnote maxlength="2000" placeholder="${esc(t('library.notePlaceholder'))}">${esc(movie.note)}</textarea></label>
      </div>
    </div>`;
  };
  openModal({
    title: movie.done ? t('library.movieWatched') : t('library.movieToWatch'), wide: true,
    body: '<div data-mbox></div>',
    footer: `<span class="spacer"></span><button class="btn btn-primary" data-close>${t('common.done')}</button>`,
    onMount: modal => {
      const box = $('[data-mbox]', modal);
      const refresh = () => { box.innerHTML = draw(); };
      refresh();
      box.addEventListener('click', e => {
        const target = e.target;
        if (target.closest('[data-mcover]')) {
          openCoverPicker(movie, findPosters, result => { movie.cover = result ? result.cover : ''; save(); renderMovieList(); openMovieModal(movie); });
          return;
        }
        const star = target.closest('[data-mrate]');
        if (star) { movie.rating = movie.rating === +star.dataset.mrate ? 0 : +star.dataset.mrate; sfx('select'); save(); refresh(); renderMovieList(); return; }
        const tagButton = target.closest('[data-mtag]');
        if (tagButton) { const tag = tagButton.dataset.mtag; movie.tags = movie.tags.includes(tag) ? movie.tags.filter(x => x !== tag) : [...movie.tags, tag]; sfx('select'); save(); refresh(); return; }
        const paceButton = target.closest('[data-mpace]');
        if (paceButton) { movie.pace = movie.pace === paceButton.dataset.mpace ? '' : paceButton.dataset.mpace; sfx('select'); save(); refresh(); }
      });
      box.addEventListener('change', e => {
        if (e.target.matches('[data-mnote]')) { movie.note = e.target.value.trim().slice(0, 2000); save(); }
        if (e.target.matches('[data-mseen]')) { movie.doneAt = e.target.value; save(); }
      });
    },
  });
}
