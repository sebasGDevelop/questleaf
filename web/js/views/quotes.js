/* Quotes section: Reflections and Vehemence, each one split by the language of the quote. */
'use strict';

// Languages a quote can be written in (the buckets of the save), named by their endonym
const QUOTE_LANGUAGES = ['es', 'en'];
const quoteLanguageName = code => LANGUAGES.find(l => l.code === code).name.toUpperCase();
// The two collections (keys of state): icon, color and dictionary keys
const QUOTE_KINDS = {
  reflections: { icon: 'sec-reflections', emoji: '💭', color: '#d9b3e6', tab: 'quotes.tabReflections', name: 'quotes.kindReflection', hint: 'quotes.kindReflectionHint', subtitle: 'quotes.reflectionsSubtitle' },
  vehemence: { icon: 'sec-vehemence', emoji: '🔥', color: '#f7a8a8', tab: 'quotes.tabVehemence', name: 'quotes.kindVehemence', hint: 'quotes.kindVehemenceHint', subtitle: 'quotes.vehemenceSubtitle' },
};
const quoteCount = collection => QUOTE_LANGUAGES.reduce((n, code) => n + state[collection][code].length, 0);

/** Finds a quote of a collection ('reflections' | 'vehemence') in any language. */
function findQuote(collection, quoteId) {
  for (const language of QUOTE_LANGUAGES) {
    const quote = state[collection][language].find(x => x.id === quoteId);
    if (quote) return { quote, language };
  }
  return null;
}

/** Shows the Quotes section on one of its tabs (search results, links). */
function showQuotes(collection) {
  if (QUOTE_KINDS[collection]) state.settings.quotesTab = collection;
  navigateTo('quotes');
  renderQuotes();
}

function openQuoteModal(collection, quoteId, defaultLanguage) {
  const found = quoteId ? findQuote(collection, quoteId) : null;
  let language = found ? found.language : (defaultLanguage || 'es'), kind = collection;
  openModal({
    title: t(found ? 'quotes.editTitle' : 'quotes.newTitle'),
    wide: true,
    body: `<form data-qform autocomplete="off">
      <div class="field"><span>${t('quotes.kindLabel')}</span>
        ${segHTML('qkind', Object.entries(QUOTE_KINDS).map(([key, k]) => [key, `${ico(k.icon, k.emoji)} ${t(k.name)}`]))}
        <small class="set-hint" data-qkind-hint></small></div>
      <div class="field"><span>${t('quotes.language')}</span>${segHTML('qlang', QUOTE_LANGUAGES.map(code => [code, quoteLanguageName(code)]))}</div>
      <label class="field"><span>${t('quotes.quote')}</span><textarea name="text" rows="6" maxlength="3000" placeholder="${esc(t('quotes.placeholder'))}">${esc(found ? found.quote.text : '')}</textarea></label>
    </form>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t('common.save')}</button>`,
    onMount: modal => {
      const form = $('[data-qform]', modal), hint = $('[data-qkind-hint]', modal);
      const syncKind = () => {
        hint.textContent = t(QUOTE_KINDS[kind].hint);
        $('[data-seg="qkind"]', modal).style.setProperty('--rc', QUOTE_KINDS[kind].color);
        form.text.rows = kind === 'vehemence' ? 9 : 5; // vehemence texts are longer
      };
      bindSeg(modal, 'qkind', () => kind, value => { kind = value; syncKind(); });
      bindSeg(modal, 'qlang', () => language, value => { language = value; });
      syncKind();
      $('[data-ok]', modal).onclick = () => {
        const text = form.text.value.trim();
        if (!text) { sfx('error'); toast(t('quotes.textRequired'), 'warn'); return; }
        if (found) {
          found.quote.text = text;
          if (found.language !== language || kind !== collection) { // moved to the other language or kind
            state[collection][found.language] = state[collection][found.language].filter(x => x !== found.quote);
            state[kind][language].push(found.quote);
          }
        } else {
          state[kind][language].push({ id: uid(), text, fav: false });
        }
        if (kind === 'reflections') reflectionLanguage = language;
        state.settings.quotesTab = kind; // show where it went
        closeModal(); sfx('place'); commit();
      };
    },
  });
}

function deleteQuote(collection, quoteId) {
  const found = findQuote(collection, quoteId);
  if (!found) return;
  removeWithUndo(state[collection], found.language, found.quote, shortLabel(found.quote.text));
}

// ---------------------------------------------------------
// The section: header, the two tabs and the open one
// ---------------------------------------------------------
function renderQuotes() {
  const active = state.settings.quotesTab;
  const tab = ([key, k]) => `<button class="tab${key === active ? ' active' : ''}" role="tab" data-quotes-tab="${key}" aria-selected="${key === active}"
    tabindex="${key === active ? 0 : -1}" style="--rc:${k.color}">${ico(k.icon, k.emoji)}<span>${t(k.tab)}</span><small>${quoteCount(key)}</small></button>`;
  $('#view-quotes').innerHTML = `
    ${pageHead('quotes', t('quotes.subtitle'),
      `<button class="btn btn-primary btn-add" data-qnew title="${esc(t('quotes.newQuote'))}" aria-label="${esc(t('quotes.newQuote'))}">+</button>`,
      quoteCount('reflections') + quoteCount('vehemence'))}
    <div class="quote-tabs" role="tablist" aria-label="${esc(t('quotes.tabsAria'))}">${Object.entries(QUOTE_KINDS).map(tab).join('')}</div>
    <p class="quote-tab-hint">${t(QUOTE_KINDS[active].subtitle)}</p>
    <div id="quotesPane" role="tabpanel"></div>`;
  if (active === 'vehemence') renderVehemencePane(); else renderReflectionsPane();
}

// ---------------------------------------------------------
// Reflections tab
// ---------------------------------------------------------
let reflectionLanguage = 'es', reflectionQuery = '', reflectionFavoritesOnly = false, randomReflectionId = null;

function renderReflectionsPane() {
  const reflections = state.reflections;
  const random = randomReflectionId && findQuote('reflections', randomReflectionId);
  const shown = random ? random.quote : quoteOfTheDay();
  $('#quotesPane').innerHTML = `
    <div class="scroll-banner">
      <div class="sb-label">${t(random ? 'quotes.randomQuote' : 'home.quoteOfTheDay')}</div>
      <p>${shown ? esc(shown.text) : t('quotes.noQuotesYet')}</p>
      <button class="btn btn-small" data-qrandom title="${esc(t('quotes.anotherRandom'))}" aria-label="${esc(t('quotes.anotherRandom'))}">${ico('ui-dice', '')}</button>
    </div>
    <div class="filters">
      <div class="seg">${QUOTE_LANGUAGES.map(code => `<button class="btn btn-small${reflectionLanguage === code ? ' on' : ''}" data-qlang="${code}" title="${esc(t('quotes.quoteCount', { count: reflections[code].length }))}">${quoteLanguageName(code)}</button>`).join('')}</div>
      <input type="search" class="search" data-qsearch placeholder="${esc(t('quotes.searchPlaceholder'))}" aria-label="${esc(t('quotes.searchPlaceholder'))}" value="${esc(reflectionQuery)}">
      <button class="btn btn-small${reflectionFavoritesOnly ? ' on' : ''}" data-qfavonly title="${esc(t('quotes.favoritesOnly'))}" aria-label="${esc(t('quotes.favoritesOnly'))}" aria-pressed="${reflectionFavoritesOnly}">★</button>
    </div>
    <ol class="quotes" id="quoteList" data-paged="quotes-${reflectionLanguage}"></ol>`;
  renderQuoteList();
}

function renderQuoteList() {
  const items = state.reflections[reflectionLanguage]
    .map((quote, i) => ({ quote, number: i + 1 }))
    .filter(({ quote }) => (!reflectionFavoritesOnly || quote.fav) && matchesSearch(quote.text, reflectionQuery));
  $('#quoteList').innerHTML = items.map(({ quote, number }) => `
    <li class="quote${quote.fav ? ' fav' : ''}">
      <span class="q-num">${number}</span>
      <p>${esc(quote.text)}</p>
      <span class="q-actions">
        <button class="icon-mini${quote.fav ? ' on' : ''}" data-qfav="${esc(quote.id)}" title="${esc(t(quote.fav ? 'quotes.unfavorite' : 'quotes.favorite'))}" aria-pressed="${quote.fav}">★</button>
        <button class="icon-mini" data-qedit="${esc(quote.id)}" title="${esc(t('common.edit'))}">${UI_ICON.edit}</button>
        <button class="icon-mini" data-qdel="${esc(quote.id)}" title="${esc(t('common.delete'))}">${UI_ICON.del}</button>
      </span>
    </li>`).join('') || `<li class="empty">${t('quotes.noMatches')}</li>`;
}

// ---------------------------------------------------------
// Vehemence tab
// ---------------------------------------------------------
function renderVehemencePane() {
  const vehemence = state.vehemence;
  const column = code => `
    <div class="veh-col" data-paged="veh-${code}" data-paged-row="vehemence" data-pager="inside">
      <h2 class="veh-title" data-page-keep>${quoteLanguageName(code)}</h2>
      ${vehemence[code].map(quote => `
        <blockquote class="veh-card">
          <p>${esc(quote.text)}</p>
          <span class="q-actions">
            <button class="icon-mini" data-vedit="${esc(quote.id)}" title="${esc(t('common.edit'))}">${UI_ICON.edit}</button>
            <button class="icon-mini" data-vdel="${esc(quote.id)}" title="${esc(t('common.delete'))}">${UI_ICON.del}</button>
          </span>
        </blockquote>`).join('') || `<p class="empty">${t('quotes.noQuotesYet')}</p>`}
    </div>`;
  $('#quotesPane').innerHTML = `<div class="veh-cols">${QUOTE_LANGUAGES.map(column).join('')}</div>`;
}

function bindQuotes() {
  const view = $('#view-quotes');
  view.addEventListener('click', e => {
    const target = e.target;
    const tabButton = target.closest('[data-quotes-tab]');
    if (tabButton) { state.settings.quotesTab = tabButton.dataset.quotesTab; save(); sfx('select'); renderQuotes(); return; }
    if (target.closest('[data-qnew]')) {
      const active = state.settings.quotesTab;
      openQuoteModal(active, null, active === 'reflections' ? reflectionLanguage : 'es');
      return;
    }
    if (target.closest('[data-qrandom]')) {
      const all = [...state.reflections.es, ...state.reflections.en];
      if (all.length) { randomReflectionId = pickOf(all).id; sfx('select'); renderReflectionsPane(); }
      return;
    }
    const languageButton = target.closest('[data-qlang]');
    if (languageButton) { reflectionLanguage = languageButton.dataset.qlang; renderReflectionsPane(); return; }
    if (target.closest('[data-qfavonly]')) { reflectionFavoritesOnly = !reflectionFavoritesOnly; renderReflectionsPane(); return; }
    const favoriteButton = target.closest('[data-qfav]');
    if (favoriteButton) {
      const found = findQuote('reflections', favoriteButton.dataset.qfav);
      found.quote.fav = !found.quote.fav;
      sfx('select'); save(); renderQuoteList();
      return;
    }
    const editButton = target.closest('[data-qedit], [data-vedit]');
    if (editButton) { openQuoteModal(editButton.dataset.qedit ? 'reflections' : 'vehemence', editButton.dataset.qedit || editButton.dataset.vedit); return; }
    const deleteButton = target.closest('[data-qdel], [data-vdel]');
    if (deleteButton) deleteQuote(deleteButton.dataset.qdel ? 'reflections' : 'vehemence', deleteButton.dataset.qdel || deleteButton.dataset.vdel);
  });
  view.addEventListener('keydown', e => { // arrows move between the two tabs
    if (!e.target.closest('[data-quotes-tab]') || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    state.settings.quotesTab = state.settings.quotesTab === 'reflections' ? 'vehemence' : 'reflections';
    save(); sfx('select'); renderQuotes();
    $(`[data-quotes-tab="${state.settings.quotesTab}"]`, view).focus();
  });
  view.addEventListener('input', e => {
    if (e.target.matches('[data-qsearch]')) { reflectionQuery = e.target.value; renderQuoteList(); }
  });
}

registerView('quotes', {
  render: renderQuotes, bind: bindQuotes,
  reset: () => { reflectionLanguage = 'es'; reflectionQuery = ''; reflectionFavoritesOnly = false; randomReflectionId = null; },
});
