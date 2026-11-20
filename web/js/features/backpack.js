/* Backpack (key M): today's things in one place, plus pins and keyboard shortcuts. */
'use strict';

let isBagOpen = false;
const MAX_PINS = 12;
const shortcutSections = () => visibleSections().slice(0, 10).map(s => s.id); // keys 1–9 and 0

// ---------------------------------------------------------
// Pins. Kinds (saved): 'nt' note, 'li' list item, otherwise a goal milestone
// ---------------------------------------------------------
const isPinned = (kind, itemId) => state.pins.some(p => p.k === kind && p.b === itemId);
function unpin(kind, itemId) { state.pins = state.pins.filter(p => !(p.k === kind && p.b === itemId)); }
function togglePin(kind, parentId, itemId) {
  if (isPinned(kind, itemId)) { unpin(kind, itemId); sfx('remove'); }
  else {
    if (state.pins.length >= MAX_PINS) { sfx('error'); toast(t('backpack.pinsFull', { max: MAX_PINS }), 'warn'); return; }
    state.pins.push({ k: kind, a: parentId, b: itemId }); sfx('place');
  }
  save();
  renderPins();
}
// What is still pinned (finished or deleted things drop off on their own)
function resolvePins() {
  const rows = [];
  state.pins = state.pins.filter(pin => {
    if (pin.k === 'nt') {
      const note = state.notes.find(x => x.id === pin.b);
      if (!note) return false;
      rows.push({ pin, text: noteTitle(note), sub: t('backpack.note'), color: note.color, go: 'notes', note: note.id, due: '' });
      return true;
    }
    if (pin.k === 'li') {
      const list = state.lists.find(l => l.id === pin.a), item = list && list.items.find(i => i.id === pin.b);
      if (!item || item.done) return false;
      rows.push({ pin, text: item.text, sub: list.name, color: list.color, go: 'lists', due: list.kind === 'todo' ? item.due : '' });
      return true;
    }
    const goal = state.profile.projects.find(x => x.id === pin.a), milestone = goal && goal.milestones.find(x => x.id === pin.b);
    if (!milestone || milestone.done) return false;
    rows.push({ pin, text: milestone.name, sub: goal.name, color: sectionColor('home'), go: 'home', due: '' });
    return true;
  });
  return rows;
}
const pinRowHTML = row => `<li style="--c:${esc(row.color)}">
  ${row.note ? `<span class="pin-note">${ico('sec-notes', '📒')}</span>`
    : `<button class="qcheck" data-pin-check="${row.pin.k}|${esc(row.pin.a)}|${esc(row.pin.b)}" aria-label="${esc(t('backpack.completeNamed', { name: row.text }))}"></button>`}
  <span class="pin-text" data-pin-go="${row.go}"${row.note ? ` data-pin-note="${esc(row.note)}"` : ''} title="${esc(t('backpack.open'))}"><b>${esc(row.text)}</b><small>${esc(row.sub)}</small></span>
  ${row.due ? dueChip(row.due) : ''}
  <button class="icon-mini" data-pin-off="${row.pin.k}|${esc(row.pin.b)}" title="${esc(t('common.unpin'))}" aria-label="${esc(t('common.unpin'))}">✕</button>
</li>`;
function checkPinned(key, sourceEl) {
  const [kind, parentId, itemId] = key.split('|');
  if (kind === 'li') {
    const list = state.lists.find(l => l.id === parentId), item = list && list.items.find(i => i.id === itemId);
    if (item) toggleListItem(list, item, sourceEl);
  } else {
    const goal = state.profile.projects.find(x => x.id === parentId), milestone = goal && goal.milestones.find(x => x.id === itemId);
    if (milestone) toggleMilestone(goal, milestone, sourceEl);
  }
}
function renderPins() {
  const board = $('#pinBoard');
  if (!board) return;
  const rows = resolvePins();
  board.hidden = !rows.length;
  if (!rows.length) return;
  board.classList.toggle('closed', !state.pinsOpen);
  board.innerHTML = `
    <button class="pb-head" data-pins-toggle title="${esc(state.pinsOpen ? t('backpack.collapse') : t('backpack.expand'))}">${UI_ICON.pin}<span>${t('backpack.pinned')}</span><b>${rows.length}</b><i>${state.pinsOpen ? '▾' : '▴'}</i></button>
    ${state.pinsOpen ? `<ul class="pb-list">${rows.map(pinRowHTML).join('')}</ul>` : ''}`;
}
function onPinClick(e) {
  const target = e.target;
  if (target.closest('[data-pins-toggle]')) { state.pinsOpen = !state.pinsOpen; save(); renderPins(); return true; }
  const checkButton = target.closest('[data-pin-check]');
  if (checkButton) { checkPinned(checkButton.dataset.pinCheck, checkButton); return true; }
  const offButton = target.closest('[data-pin-off]');
  if (offButton) { const [kind, itemId] = offButton.dataset.pinOff.split('|'); unpin(kind, itemId); sfx('remove'); save(); renderPins(); if (isBagOpen) renderBag(); return true; }
  const goButton = target.closest('[data-pin-go]');
  if (goButton) {
    if (goButton.dataset.pinNote) openNote(goButton.dataset.pinNote);
    closeBag(); navigateTo(goButton.dataset.pinGo);
    if (goButton.dataset.pinNote) renderNotes();
    return true;
  }
  return false;
}

// ---------------------------------------------------------
// Backpack
// ---------------------------------------------------------
// ---------------------------------------------------------
// ATTENTION: what is overdue, due today or in the next two days, and today's new notices.
// The badge on the backpack button counts these rows, so it always says what it is about.
// ---------------------------------------------------------
let bagUnseenFrom = 0; // today's notices from this index on are new (set when the backpack opens)
const todaysNotices = () => (state.reminders.day === todayISO() ? state.reminders.log : []);
function attentionRows(newKeys) {
  const rows = [];
  state.lists.filter(l => l.kind === 'todo').forEach(list => list.items.forEach(item => {
    if (item.done || !item.due || daysUntil(item.due) > 0) return;
    rows.push({ keys: [`td:${item.id}`], days: daysUntil(item.due), icon: ico('sec-lists', '📝'), text: item.text, sub: list.name, list: list.id });
  }));
  state.university.events.forEach(e => {
    if (e.done || !e.date || daysUntil(e.date) > 2) return;
    rows.push({ keys: [`ev0:${e.id}`, `ev1:${e.id}`], days: daysUntil(e.date), icon: ico(DELIVERABLE_ICONS[e.kind], '📌'), text: e.name, sub: t(`university.kinds.${e.kind}`), go: 'university' });
  });
  for (let d = 0; d <= 2; d++) {
    chargesOn(iso(addDays(new Date(), d))).forEach(({ list, item }) => rows.push({ keys: [`ch0:${item.id}`, `ch2:${item.id}`], days: d, icon: ico('cat-work', '💰'),
      text: item.text, sub: item.price != null ? formatMoney(item.price, item.currency) : list.name, list: list.id }));
  }
  birthdaysSorted().filter(x => x.next && x.next.days <= 1).forEach(({ birthday, next }) => rows.push({
    keys: [`bd:${birthday.id}`, `bd1:${birthday.id}`], days: next.days, icon: ico('sec-birthdays', '🎂'), text: birthday.name, sub: t('sections.birthdays'), go: 'birthdays' }));
  const matched = new Set(rows.flatMap(r => r.keys));
  // Notices that are not one of the rows above (a quest about to start, the chronicle, a Workflow tool…)
  todaysNotices().forEach((n, i) => {
    if (n.key && matched.has(n.key)) return;
    rows.push({ keys: [n.key || `n${i}`], notice: true, days: null, icon: ico('ui-letter', '✉️'), text: n.title, sub: n.message, time: n.time });
  });
  rows.forEach(r => { r.isNew = r.keys.some(k => newKeys.has(k)); r.urgent = r.days !== null && r.days <= 0; });
  // New first, then the most urgent; old notices last (and only the last three of them)
  const old = rows.filter(r => r.notice && !r.isNew).slice(-3);
  return rows.filter(r => !(r.notice && !r.isNew) || old.includes(r))
    .sort((a, b) => (b.isNew - a.isNew) || ((a.days ?? 99) - (b.days ?? 99)));
}
const newNoticeKeys = from => new Set(todaysNotices().slice(from).map((n, i) => n.key || `n${from + i}`));
/** What the backpack badge counts: new things and what is overdue or due today. */
const bagAlertCount = () => attentionRows(newNoticeKeys(state.reminders.day === todayISO() ? state.reminders.seen : 0)).filter(r => r.isNew || r.urgent).length;

function attentionHTML() {
  const rows = attentionRows(newNoticeKeys(bagUnseenFrom));
  const chip = r => {
    if (r.isNew && (r.notice || r.days === null)) return `<span class="att-chip red">${t('backpack.urgency.new')}</span>`;
    const label = r.days < 0 ? t('backpack.urgency.late') : r.days === 0 ? t('backpack.urgency.today') : r.days === 1 ? t('backpack.urgency.tomorrow') : t('backpack.urgency.inDays', { count: r.days });
    return `${r.isNew ? `<span class="att-chip red">${t('backpack.urgency.new')}</span>` : ''}<span class="att-chip${r.days <= 0 ? ' red' : ''}">${label}</span>`;
  };
  const row = r => `<li class="att-row${r.isNew || r.urgent ? ' hot' : ''}"${r.list ? ` data-bag-list="${esc(r.list)}"` : r.go ? ` data-bag-go="${r.go}"` : ''}>
      <span class="bl-ico">${r.icon}</span><span class="bl-text"><b>${esc(r.text)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
      ${r.time ? `<small class="att-time">${esc(r.time)}</small>` : ''}${chip(r)}</li>`;
  const count = rows.filter(r => r.isNew || r.urgent).length;
  return `<section class="bag-panel bag-attention${count ? ' hot' : ''}" style="--c:var(--alert)">
    <h3 class="bag-title"><span class="bag-ico">${UI_ICON.warn}</span><span>${t('backpack.panels.attention')}</span>${count ? `<i class="hud-badge att-count">${count}</i>` : ''}</h3>
    <div class="bag-body">${rows.length ? `<ul class="att-list">${rows.map(row).join('')}</ul>` : `<p class="empty">${t('backpack.allClear')}</p>`}</div>
  </section>`;
}

const bagPanelHTML = (title, iconKey, color, body, extra = '') =>
  `<section class="bag-panel" style="--c:${color}">
    <h3 class="bag-title"><span class="bag-ico">${ico(iconKey, '')}</span><span>${title}</span>${extra}</h3>
    <div class="bag-body">${body}</div>
  </section>`;

function bagHTML() {
  const today = todayISO(), now = new Date();
  // Today's quests
  const missions = todayMissions();
  const todayHTML = missions.list.length ? `<ul class="bag-list">${missions.list.map(block => {
    const activity = activityById(block.activityId), done = isBlockDone(block.id, today);
    return `<li class="${done ? 'done' : ''}"><button class="qcheck" data-bag-block="${esc(block.id)}" aria-label="${esc(t('backpack.completeNamed', { name: activity.name }))}">${done ? '✓' : ''}</button>
      <span class="bl-ico">${iconHTML(activity.icon)}</span><span class="bl-text">${esc(activity.name)}</span><small>${block.start}–${block.start + block.duration}h</small></li>`;
  }).join('')}</ul>` : `<p class="empty">${t('backpack.freeDay')}</p>`;
  // Habits
  const habitLog = state.habits.log[today] || [];
  const bagHabits = state.habits.list.filter(habit => isHabitDue(habit, now) || habitLog.includes(habit.id)); // due today, or done anyway
  const habitsHTML = bagHabits.length ? `<ul class="bag-list">${bagHabits.map(habit => {
    const done = habitLog.includes(habit.id);
    return `<li class="${done ? 'done' : ''}"><button class="qcheck" data-bag-habit="${esc(habit.id)}" aria-label="${esc(habit.name)}">${done ? '✓' : ''}</button>
      <span class="bl-ico">${iconHTML(habit.icon)}</span><span class="bl-text">${esc(habit.name)}</span></li>`;
  }).join('')}</ul>` : `<p class="empty">${t(state.habits.list.length ? 'home.dayOff' : 'backpack.noHabits')}</p>`;
  // Most urgent to-dos (a future date shows up on its day)
  const todos = state.lists.filter(l => l.kind === 'todo')
    .flatMap(l => l.items.filter(i => !i.done && (!i.due || i.due <= today)).map(i => ({ list: l, item: i })))
    .sort((x, y) => (x.item.due || '9999').localeCompare(y.item.due || '9999')).slice(0, 6);
  const pin = esc(t('common.pin'));
  const todosHTML = todos.length ? `<ul class="bag-list">${todos.map(({ list, item }) => `<li>
      <button class="qcheck" data-bag-li="${esc(list.id)}|${esc(item.id)}" aria-label="${esc(t('backpack.completeNamed', { name: item.text }))}"></button>
      <span class="bl-text">${esc(item.text)}</span>${dueChip(item.due)}
      <button class="icon-mini bl-pin${isPinned('li', item.id) ? ' on' : ''}" data-bag-pin="${esc(list.id)}|${esc(item.id)}" title="${pin}" aria-label="${pin}">${UI_ICON.pin}</button></li>`).join('')}</ul>`
    : `<p class="empty">${t('backpack.nothingPending')}</p>`;
  // Shopping
  const shopping = state.lists.filter(l => l.kind === 'shopping').flatMap(l => l.items.filter(i => !i.done).map(i => ({ list: l, item: i }))).slice(0, 8);
  const shoppingHTML = shopping.length ? `<ul class="bag-list">${shopping.map(({ list, item }) => `<li>
      <button class="qcheck" data-bag-li="${esc(list.id)}|${esc(item.id)}" aria-label="${esc(t('backpack.bought', { name: item.text }))}"></button>
      <span class="bl-text">${esc(item.text)}</span>${item.qty ? `<span class="li-qty">${esc(item.qty)}</span>` : ''}</li>`).join('')}</ul>`
    : `<p class="empty">${t('backpack.nothingToBuy')}</p>`;
  // Focus
  const focusHTML = focus
    ? `<div class="bag-focus-run"><img src="assets/icons/plant-${focus.stage}.png" alt=""><b>${formatFocusLeft()}</b><button class="btn btn-small" data-bag-fopen>${t('focus.show')}</button></div>`
    : `<div class="bag-focus">${FOCUS_MINUTES.map(m => `<button class="btn${m === state.settings.focusMin ? ' btn-primary' : ''}" data-bag-focus="${m}">${m}</button>`).join('')}<span class="muted">${t('focus.minUnit')}</span></div>`;
  // Coming up
  const nextBirthday = birthdaysSorted().find(x => x.next), nextEvent = upcomingEvents()[0], chronicleDue = chroniclePending(), journal = state.journal[today];
  const journalState = journal ? (journal.mood ? MOODS[journal.mood].name : t('backpack.journalWritten')) : t('backpack.journalHowAreYou');
  const comingUp = [
    nextBirthday ? `<li><span class="bl-ico">${ico('sec-birthdays', '🎂')}</span><span class="bl-text">${esc(nextBirthday.birthday.name)}</span><small>${formatRelativeDays(nextBirthday.next.days)}</small></li>` : '',
    nextEvent ? `<li><span class="bl-ico">${ico('today-deadlines', '📌')}</span><span class="bl-text">${esc(nextEvent.name)}</span><small>${formatRelativeDays(daysUntil(nextEvent.date))}</small></li>` : '',
    chronicleDue ? `<li class="go" data-bag-go="calendar"><span class="bl-ico">${ico('cat-writing', '📜')}</span><span class="bl-text">${t('backpack.chronicle')}</span><small>${t('backpack.chroniclePending')}</small></li>` : '',
    `<li class="go" data-bag-go="calendar"><span class="bl-ico">${journal && journal.mood ? moodIco(journal.mood) : ico('sec-calendar', '📅')}</span><span class="bl-text">${t('backpack.journal')}</span><small>${esc(journalState)}</small></li>`,
  ].join('');
  // Pins
  const pins = resolvePins();
  const pinsHTML = pins.length ? `<ul class="bag-list pins">${pins.map(pinRowHTML).join('')}</ul>` : `<p class="empty">${t('backpack.pinHint')} ${UI_ICON.pin}</p>`;
  // Go to
  const goHTML = `<div class="bag-go">${visibleSections().map((s, i) => `<button class="bag-sec" data-bag-go="${s.id}" style="--c:${s.color}" title="${esc(s.label)}" aria-label="${esc(s.label)}">
      ${ico(`sec-${s.id}`, s.icon)}${i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : ''}</button>`).join('')}</div>`;

  const panel = key => t(`backpack.panels.${key}`);
  return `<div class="bag-box" role="dialog" aria-label="${esc(t('backpack.name'))}">
    <header class="bag-head"><span class="bag-head-ico">${UI_ICON.bag}</span><h2>${t('backpack.title')}</h2>
      <span class="bag-date">${dayName(weekdayIndex(now))} ${formatShortDate(now)}</span>
      <span class="bag-hint">${tHtml('backpack.hintHtml')}</span>
      <button class="modal-x" data-bag-close aria-label="${esc(t('common.close'))}">✕</button></header>
    <div class="bag-grid">
      ${attentionHTML()}
      ${bagPanelHTML(panel('today'), 'sec-schedule', sectionColor('schedule'), todayHTML, `<small>${missions.done}/${missions.list.length}</small>`)}
      ${bagPanelHTML(panel('habits'), 'sec-habits', sectionColor('habits'), habitsHTML, `<small>${bagHabits.filter(h => habitLog.includes(h.id)).length}/${bagHabits.length}</small>`)}
      ${bagPanelHTML(panel('todos'), 'sec-lists', sectionColor('lists'), todosHTML)}
      ${bagPanelHTML(panel('shopping'), 'cat-shopping', '#f6d38a', shoppingHTML)}
      ${bagPanelHTML(panel('focus'), 'cat-meditation', '#d9b3e6', focusHTML)}
      ${bagPanelHTML(panel('comingUp'), 'sec-calendar', sectionColor('calendar'), `<ul class="bag-list">${comingUp}</ul>`)}
      ${bagPanelHTML(panel('pinned'), 'ui-pin', '#f7a8a8', pinsHTML)}
      ${bagPanelHTML(panel('goTo'), 'sec-home', sectionColor('home'), goHTML)}
    </div>
    <form class="bag-note" data-bag-note autocomplete="off" style="--c:${sectionColor('notes')}">
      <span class="bag-ico">${ico('sec-notes', '📒')}</span>
      <input type="text" name="text" maxlength="2000" placeholder="${esc(t('backpack.quickNotePlaceholder'))}" aria-label="${esc(t('backpack.quickNote'))}">
      <button class="btn btn-primary" type="submit">${t('common.save')}</button>
    </form>
  </div>`;
}

function renderBag() { const bag = $('#bag'); if (bag && isBagOpen) bag.innerHTML = bagHTML(); }
/** The badge on the backpack button: the rows of ATTENTION that are new, overdue or due today. */
function updateBagBadge() {
  const count = bagAlertCount();
  const button = $('#bagBtn');
  let badge = $('.hud-badge', button);
  if (!count) { if (badge) badge.remove(); button.title = t('hud.backpack'); return; }
  if (!badge) { badge = el('i', 'hud-badge'); button.append(badge); }
  badge.textContent = count > 9 ? '9+' : String(count);
  button.title = t('backpack.unseenNotices', { count });
}
appOn('reminder', () => { updateBagBadge(); if (isBagOpen) renderBag(); });
appOn('commit', () => setTimeout(updateBagBadge, 0)); // after the change is applied

function openBag() {
  if (isBagOpen) return;
  isBagOpen = true;
  bagUnseenFrom = state.reminders.day === todayISO() ? state.reminders.seen : 0; // these stay marked NEW while it is open
  if (state.reminders.day === todayISO() && state.reminders.seen !== state.reminders.log.length) {
    state.reminders.seen = state.reminders.log.length; save(); updateBagBadge(); // opening the backpack shows them
  }
  const bag = $('#bag');
  bag.hidden = false;
  renderBag();
  bag.classList.add('open', 'opening');
  setTimeout(() => bag.classList.remove('opening'), 250);
  sfx('page');
}
function closeBag() {
  if (!isBagOpen) return;
  isBagOpen = false;
  const bag = $('#bag');
  bag.classList.remove('open');
  bag.hidden = true;
}
const toggleBag = () => (isBagOpen ? closeBag() : openBag());

function onBagSubmit(e) {
  const form = e.target.closest('[data-bag-note]');
  if (!form) return;
  e.preventDefault();
  const text = form.text.value.trim();
  if (!text) return;
  createNote(text);
  form.text.value = '';
  sfx('place');
  save();
  toast(t('backpack.noteSaved'), 'info', { icon: ico('sec-notes', '📒') });
  if (currentView === 'notes') renderNotes();
}
function onBagClick(e) {
  const target = e.target;
  if (target.id === 'bag' || target.closest('[data-bag-close]')) { closeBag(); return; }
  if (onPinClick(e)) return;
  const today = todayISO();
  const blockButton = target.closest('[data-bag-block]');
  if (blockButton) { toggleBlockDone(blockButton.dataset.bagBlock, today, blockButton); return; }
  const habitButton = target.closest('[data-bag-habit]');
  if (habitButton) { toggleHabit(habitButton.dataset.bagHabit, today, habitButton); return; }
  const itemButton = target.closest('[data-bag-li]');
  if (itemButton) {
    const [listId, itemId] = itemButton.dataset.bagLi.split('|');
    const list = state.lists.find(l => l.id === listId), item = list && list.items.find(i => i.id === itemId);
    if (item) toggleListItem(list, item, itemButton);
    return;
  }
  const pinButton = target.closest('[data-bag-pin]');
  if (pinButton) { const [listId, itemId] = pinButton.dataset.bagPin.split('|'); togglePin('li', listId, itemId); renderBag(); return; }
  const minutesButton = target.closest('[data-bag-focus]');
  if (minutesButton) { state.settings.focusMin = +minutesButton.dataset.bagFocus; closeBag(); startFocus(state.settings.focusAct, state.settings.focusMin); return; }
  if (target.closest('[data-bag-fopen]')) { closeBag(); showFocus(); return; }
  const listRow = target.closest('[data-bag-list]');
  if (listRow) { selectedListId = listRow.dataset.bagList; closeBag(); navigateTo('lists'); return; }
  const goButton = target.closest('[data-bag-go]');
  if (goButton) { closeBag(); navigateTo(goButton.dataset.bagGo); }
}

// ---------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------
function addInCurrentView() {
  const view = currentView;
  if (view === 'lists') { const input = $('#view-lists [data-iadd] input[name="text"]'); if (input) { input.focus(); return; } }
  if (view === 'calendar') {
    const journalText = $('#view-calendar [data-jtext]');
    if (journalText) { journalText.focus(); return; }
    const editButton = $('#view-calendar [data-jedit]');
    if (editButton) { editButton.click(); return; }
  }
  if (view === 'schedule') { $('#newActivityBtn').click(); return; }
  if (view === 'home') { $('#view-home [data-add-project]').click(); return; }
  const addButton = $$(`#view-${view} button`).find(b => /^\+/.test(b.textContent.trim()) && b.offsetParent);
  if (addButton) addButton.click(); else toast(t('backpack.nothingToAdd'), 'info');
}

function openShortcuts() {
  const row = (keys, what) => `<li><span class="sc-keys">${keys.map(x => `<kbd>${x}</kbd>`).join('')}</span><span>${what}</span></li>`;
  const sc = key => t(`shortcuts.${key}`);
  openModal({
    title: sc('title'),
    body: `<ul class="shortcuts">
      ${row(['M'], sc('backpack'))}
      ${shortcutSections().map((id, i) => row([String((i + 1) % 10)], esc(t('shortcuts.goTo', { section: SECTIONS.find(s => s.id === id).label })))).join('')}
      ${row(['F'], sc('focus'))}
      ${row(['R'], sc('sanctuary'))}
      ${row(['Ctrl', 'K'], sc('search'))}
      ${row(['N'], sc('addNew'))}
      ${desktopApi ? row(['Ctrl', '0'], sc('autoSize')) : ''}
      ${row(['Alt', 'V'], sc('bullets'))}
      ${row(['?'], sc('help'))}
      ${row(['Esc'], sc('close'))}
    </ul>`,
  });
}

function onShortcutKey(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  const isTyping = ['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable;
  const hasModal = !!$('#modalRoot .overlay');
  const isFocusShown = focus && !focus.el.hidden;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape' && isBagOpen) { closeBag(); return; }
  if (isTyping || hasModal || isFocusShown || isSanctuaryOpen) return;
  const key = e.key.toLowerCase();
  if (/^[0-9]$/.test(key)) {
    const id = shortcutSections()[(+key + 9) % 10];
    if (id) { e.preventDefault(); closeBag(); navigateTo(id); }
  } else if (key === 'm') { e.preventDefault(); toggleBag(); }
  else if (key === 'f') { e.preventDefault(); closeBag(); if (focus) showFocus(); else startFocus(state.settings.focusAct, state.settings.focusMin); }
  else if (key === 'n') { e.preventDefault(); closeBag(); addInCurrentView(); }
  else if (e.key === '?') { e.preventDefault(); closeBag(); openShortcuts(); }
}

// ---------------------------------------------------------
// Wiring: the pins and an open backpack are redrawn with everything else
// ---------------------------------------------------------
appOn('render', () => {
  renderPins();
  if (isBagOpen) renderBag();
});
function backpackBoot() {
  const bag = el('div', 'bag');
  bag.id = 'bag';
  bag.hidden = true;
  bag.addEventListener('click', onBagClick);
  bag.addEventListener('submit', onBagSubmit);
  const pins = el('aside', 'pin-board');
  pins.id = 'pinBoard';
  pins.hidden = true;
  pins.addEventListener('click', onPinClick);
  document.body.append(bag, pins);
  const bagButton = $('#bagBtn');
  bagButton.innerHTML = UI_ICON.bag;
  bagButton.addEventListener('click', toggleBag);
  updateBagBadge();
  document.addEventListener('keydown', onShortcutKey);
  renderPins();
}
