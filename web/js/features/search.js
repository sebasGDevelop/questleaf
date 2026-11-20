/* Search (Ctrl+K) across everything you have. */
'use strict';

const SEARCH = { el: null, all: [], items: [], selected: 0 };
const kindName = key => t(`search.kinds.${key}`);

function searchIndex() {
  const results = [];
  const add = (kind, icon, title, sub, go, isSection = false) => results.push({ kind, icon, title, sub, go, isSection });
  const goToDay = day => {
    calendarMode = 'month'; calendarDay = day; calendarWeek = null;
    const date = parseISO(day);
    calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    navigateTo('calendar');
  };
  // Quick actions first: they also show with an empty search, next to the sections
  const action = (key, icon, emoji, go) => add(kindName('action'), ico(icon, emoji), t(`search.actions.${key}`), '', go, true);
  action('newNote', 'sec-notes', '📒', () => { navigateTo('notes'); selectedNoteId = createNote().id; save(); renderNotes(); const title = $('#view-notes .ne-title'); if (title) title.focus(); });
  action('newTodo', 'sec-lists', '📝', () => {
    const list = state.lists.find(l => l.kind === 'todo');
    if (list) selectedListId = list.id;
    navigateTo('lists');
    const input = $('#view-lists [data-iadd] input[name="text"]'); if (input) input.focus();
  });
  action('startFocus', 'cat-meditation', '🧘', () => startFocus(state.settings.focusAct, state.settings.focusMin));
  action('newQuote', 'sec-quotes', '💭', () => openQuoteModal(state.settings.quotesTab, null));
  action('newGoal', 'achievement-clear', '🏁', () => { navigateTo('home'); openGoalModal(null); });
  action('backpack', 'ui-backpack', '🎒', () => openBag());
  action('sanctuary', 'ui-sanctuary', '⛺', () => openSanctuary());
  action('theme', 'ui-night', '🌙', () => $('#themeBtn').click());
  action('settings', 'ui-settings', '⚙️', () => openSettingsModal('profile'));
  // Workflow jobs (a deliverable's job takes its name; one whose deliverable was deleted is not shown)
  state.workflow.jobs.filter(job => isJobShown(job) && toolById(job.toolId)).forEach(job => add(kindName('job'), ico('sec-workflow', '🔀'), jobName(job), toolById(job.toolId).name, () => navigateTo('workflow')));
  visibleSections().forEach(s => add(kindName('section'), ico(`sec-${s.id}`, s.icon), s.label, '', () => navigateTo(s.id), true));
  state.notes.forEach(n => add(kindName('note'), ico('sec-notes', '📒'), noteTitle(n), n.body.slice(0, 90), () => { navigateTo('notes'); openNote(n.id); renderNotes(); }));
  state.books.forEach(b => add(kindName('book'), ico('sec-books', '📚'), b.title, [b.author, b.done ? t('search.read') : ''].filter(Boolean).join(' · '), () => { selectedBookId = b.id; navigateTo('books'); }));
  state.movies.forEach(m => add(kindName('movie'), ico('sec-movies', '🎬'), m.title, m.done ? t('search.watched') : t('search.toWatch'), () => { navigateTo('movies'); openMovieModal(m); }));
  ['es', 'en'].forEach(lang => state.reflections[lang].forEach(q => add(kindName('reflection'), ico('sec-reflections', '💭'), q.text.slice(0, 90), '', () => showQuotes('reflections'))));
  ['es', 'en'].forEach(lang => state.vehemence[lang].forEach(q => add(kindName('vehemence'), ico('sec-vehemence', '🔥'), q.text.slice(0, 90), '', () => showQuotes('vehemence'))));
  state.lists.forEach(list => list.items.forEach(item => add(list.name, ico('sec-lists', '📝'), item.text, item.done ? t('search.done') : '', () => { selectedListId = list.id; navigateTo('lists'); })));
  state.habits.list.forEach(h => add(kindName('habit'), iconHTML(h.icon), h.name, '', () => navigateTo('habits')));
  state.schedule.activities.forEach(a => add(kindName('schedule'), iconHTML(a.icon), a.name, a.type === 'subject' ? t('search.subject') : t('search.personal'), () => navigateTo('schedule')));
  state.university.events.forEach(e => add(kindName('deadline'), ico(e.hp ? bossTypeOf(e).icon : 'today-deadlines', '📅'), e.name,
    [t(`university.kinds.${e.kind}`), e.date ? formatShortDate(parseISO(e.date)) : '', e.done ? t('search.done') : ''].filter(Boolean).join(' · '), () => navigateTo('university')));
  state.birthdays.forEach(b => add(kindName('birthday'), ico('sec-birthdays', '🎂'), b.name, b.day ? t('birthdays.dayOfMonth', { day: b.day, month: monthName(b.month - 1) }) : '', () => navigateTo('birthdays')));
  state.profile.projects.forEach(g => add(kindName('goal'), ico('achievement-clear', '🏁'), g.name, g.note, () => navigateTo('home')));
  Object.entries(state.journal).forEach(([day, entry]) => { if (entry.text) add(kindName('journal'), ico('sec-calendar', '📅'), entry.text.slice(0, 90), formatShortDate(parseISO(day)), () => goToDay(day)); });
  state.gratitude.forEach(g => add(kindName('gratitude'), ico('sec-calendar', '📅'), g.text, formatShortDate(parseISO(g.d)), () => { calendarMode = 'memories'; navigateTo('calendar'); }));
  return results;
}
function openSearch() {
  if (SEARCH.el) { $('input', SEARCH.el).focus(); return; }
  if (typeof closeBag === 'function') closeBag();
  const box = el('div', 'srch', `<div class="srch-box">
      <div class="srch-in">${ico('ui-search', '🔍')}<input type="search" placeholder="${esc(t('search.placeholder'))}" aria-label="${esc(t('search.label'))}"><kbd>Esc</kbd></div>
      <ul class="srch-res" role="listbox"></ul>
    </div>`);
  document.body.append(box);
  SEARCH.el = box; SEARCH.all = searchIndex(); SEARCH.selected = 0;
  const input = $('input', box);
  const draw = () => {
    const query = input.value.trim();
    SEARCH.items = query ? SEARCH.all.filter(x => matchesSearch(`${x.title} ${x.sub || ''} ${x.kind}`, query)).slice(0, 40) : SEARCH.all.filter(x => x.isSection);
    SEARCH.selected = Math.min(SEARCH.selected, Math.max(0, SEARCH.items.length - 1));
    $('.srch-res', box).innerHTML = SEARCH.items.length ? SEARCH.items.map((x, i) => `<li class="${i === SEARCH.selected ? 'on' : ''}" data-si="${i}" role="option" aria-selected="${i === SEARCH.selected}">
        <span class="srch-ico">${x.icon}</span><span class="srch-t"><b>${esc(x.title)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span><em>${esc(x.kind)}</em></li>`).join('')
      : `<li class="srch-none">${t('search.empty')}</li>`;
    const selected = $('.srch-res li.on', box); if (selected) selected.scrollIntoView({ block: 'nearest' });
  };
  const pick = i => { const result = SEARCH.items[i]; closeSearch(); if (result) { sfx('page'); result.go(); } };
  input.addEventListener('input', () => { SEARCH.selected = 0; draw(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); SEARCH.selected = Math.min(SEARCH.items.length - 1, SEARCH.selected + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); SEARCH.selected = Math.max(0, SEARCH.selected - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(SEARCH.selected); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
  });
  box.addEventListener('click', e => {
    const row = e.target.closest('[data-si]');
    if (row) pick(+row.dataset.si);
    else if (!e.target.closest('.srch-box')) closeSearch();
  });
  draw();
  input.focus();
  sfx('select');
}
function closeSearch() { if (SEARCH.el) { SEARCH.el.remove(); SEARCH.el = null; } }

function searchBoot() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (SEARCH.el) closeSearch(); else openSearch(); }
  });
}
