/* Repeating to-dos: checking one creates the next (every day, week or month). */
'use strict';

// Saved values of item.rep → dictionary key.
const REPEAT_KEYS = { '': 'none', daily: 'daily', weekly: 'weekly', monthly: 'monthly' }; // saved value → dictionary key
const REPEAT_ORDER = ['', 'daily', 'weekly', 'monthly'];

function nextDueDate(item) {
  const today = todayISO();
  const base = item.due && item.due >= today ? parseISO(item.due) : new Date();
  if (item.rep === 'daily') return iso(addDays(base, 1));
  if (item.rep === 'weekly') return iso(addDays(base, 7));
  return iso(new Date(base.getFullYear(), base.getMonth() + 1, base.getDate()));
}

// Runs before the item is toggled
appOn('listItemToggle', ({ list, item }) => {
  if (list.kind !== 'todo' || !item.rep) return;
  if (!item.done) {
    const next = { id: uid(), text: item.text, done: false, qty: item.qty, due: nextDueDate(item), doneAt: '', rep: item.rep, next: '' };
    list.items.push(next);
    item.next = next.id;
    setTimeout(() => toast(t('recurring.next', { text: item.text, date: formatShortDate(parseISO(next.due)) }), 'info'), 500);
  } else if (item.next) { // unchecked: the next one that was created goes away
    list.items = list.items.filter(x => x.id !== item.next || x.done);
    item.next = '';
  }
});

function repeatButtonHTML(item) {
  const key = REPEAT_KEYS[item.rep || ''] || 'none';
  const short = item.rep ? t(`recurring.short.${key}`) : '';
  const tip = esc(t('recurring.buttonTip', { label: t(`recurring.options.${key}`) }));
  return `<button class="icon-mini li-rep${item.rep ? ' on' : ''}" data-irep="${esc(item.id)}" title="${tip}" aria-label="${tip}">↻${short ? `<small>${short}</small>` : ''}</button>`;
}

function recurringBoot() {
  $('#view-lists').addEventListener('click', e => {
    const button = e.target.closest('[data-irep]');
    if (!button) return;
    const list = selectedListId && listById(selectedListId), item = list && list.items.find(x => x.id === button.dataset.irep);
    if (!item) return;
    item.rep = REPEAT_ORDER[(REPEAT_ORDER.indexOf(item.rep || '') + 1) % REPEAT_ORDER.length];
    if (item.rep && !item.due) item.due = todayISO();
    sfx('select'); save(); renderLists();
  });
}
