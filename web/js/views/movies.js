/* Movies and series section: the watch list with filters and search. */
'use strict';

const MOVIE_FILTERS = ['toWatch', 'watched', 'all'];
let movieFilter = 'toWatch', movieQuery = '';
const movieById = id => state.movies.find(m => m.id === id);

function renderMovies() {
  const total = state.movies.length, done = state.movies.filter(m => m.done).length;
  const filterCount = { toWatch: total - done, watched: done, all: null };
  $('#view-movies').innerHTML = `
    ${pageHead('movies', t('movies.subtitle', { done, total, xp: XP.movie }),
      `<button class="btn btn-primary btn-add" data-mnew title="${esc(t('movies.newMovie'))}" aria-label="${esc(t('movies.newMovie'))}">+</button>`, `${done}/${total}`)}
    <div class="filters">
      <div class="seg">${MOVIE_FILTERS.map(key => `<button class="btn btn-small${movieFilter === key ? ' on' : ''}" data-mfilter="${key}">${t(`movies.filters.${key}`)}${filterCount[key] != null ? ` (${filterCount[key]})` : ''}</button>`).join('')}</div>
      <input type="search" class="search" data-msearch placeholder="${esc(t('common.searchPlaceholder'))}" aria-label="${esc(t('common.searchPlaceholder'))}" value="${esc(movieQuery)}">
    </div>
    <div class="tickets" id="movieList" data-paged="movies"></div>`;
  renderMovieList();
}

function renderMovieList() {
  const visible = state.movies
    .filter(m => !(movieFilter === 'watched' && !m.done) && !(movieFilter === 'toWatch' && m.done) && matchesSearch(m.title, movieQuery))
    .sort((a, b) => a.title.localeCompare(b.title, currentLocale()));
  $('#movieList').innerHTML = visible.map(movie => `
    <div class="ticket${movie.done ? ' done' : ''}" style="--c:${colorFor(movie.title)}">
      <button class="qcheck" data-mtoggle="${esc(movie.id)}" aria-label="${esc(t(movie.done ? 'movies.markUnwatched' : 'movies.markWatched', { title: movie.title }))}">${movie.done ? '✓' : ''}</button>
      ${movie.cover ? `<img class="t-poster" src="${esc(movie.cover)}" alt="" loading="lazy">` : ''}
      <button type="button" class="t-title" data-mopen="${esc(movie.id)}" title="${esc(t('movies.openCard'))}">${esc(movie.title)}${movie.rating ? ` <small class="t-stars">${'★'.repeat(movie.rating)}</small>` : ''}</button>
      ${movie.done ? `<span class="t-stamp">${t('movies.watchedStamp')}</span>` : ''}
      <span class="t-actions">
        <button class="icon-mini" data-medit="${esc(movie.id)}" title="${esc(t('common.rename'))}">${UI_ICON.edit}</button>
        <button class="icon-mini" data-mdel="${esc(movie.id)}" title="${esc(t('common.delete'))}">${UI_ICON.del}</button>
      </span>
    </div>`).join('') || `<p class="empty">${t('common.nothingWithFilter')}</p>`;
}

function bindMovies() {
  const view = $('#view-movies');
  view.addEventListener('click', e => {
    const target = e.target;
    const filterButton = target.closest('[data-mfilter]');
    if (filterButton) {
      movieFilter = filterButton.dataset.mfilter;
      $$('[data-mfilter]', view).forEach(x => x.classList.toggle('on', x === filterButton));
      renderMovieList();
      return;
    }
    if (target.closest('[data-mnew]')) {
      promptModal({ title: t('movies.newMovieTitle'), label: t('common.titleLabel'), placeholder: t('movies.titlePlaceholder'), max: 120, okLabel: t('common.addUpper'),
        onOk: title => {
          state.movies.push({ id: uid(), title, done: false, cover: '', rating: 0, tags: [], pace: '', note: '', doneAt: '' });
          movieFilter = 'toWatch'; movieQuery = '';
          sfx('place'); commit();
        } });
      return;
    }
    const toggleButton = target.closest('[data-mtoggle]');
    if (toggleButton) {
      const movie = movieById(toggleButton.dataset.mtoggle);
      movie.done = !movie.done;
      movie.doneAt = movie.done ? todayISO() : '';
      sfx(movie.done ? 'coin' : 'remove');
      xpFx(movie.done ? XP.movie : -XP.movie, toggleButton, movie.title);
      commit();
      return;
    }
    const editButton = target.closest('[data-medit]');
    if (editButton) {
      const movie = movieById(editButton.dataset.medit);
      promptModal({ title: t('common.renameUpper'), label: t('common.titleLabel'), value: movie.title, max: 120, onOk: title => { movie.title = title; commit(); } });
      return;
    }
    const deleteButton = target.closest('[data-mdel]');
    if (deleteButton) {
      const movie = movieById(deleteButton.dataset.mdel);
      removeWithUndo(state, 'movies', movie, movie.title);
    }
  });
  view.addEventListener('input', e => {
    if (e.target.matches('[data-msearch]')) { movieQuery = e.target.value; renderMovieList(); }
  });
}

registerView('movies', {
  render: renderMovies, bind: bindMovies,
  reset: () => { movieFilter = 'toWatch'; movieQuery = ''; },
});
