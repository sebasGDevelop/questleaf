/* Lists section: to-dos, shopping, subscriptions, budgets and simple lists. Money totals are kept per currency. */
'use strict';

let selectedListId = null; // the list open on the right page
let showDoneItems = false;  // whether completed items are expanded
const listById = id => state.lists.find(l => l.id === id);
const LIST_KINDS = ['todo', 'shopping', 'subscriptions', 'budget', 'simple'];
const LIST_DEFAULT_ICON = { todo: 'cat-writing', shopping: 'cat-shopping', subscriptions: 'cat-work', budget: 'cat-code', simple: 'cat-writing' };
const BILLING_CYCLES = ['weekly', 'monthly', 'quarterly', 'yearly'];
const CYCLE_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 }; // weekly is 7 days
const isShoppingList = list => list.kind === 'shopping';
const givesTodoXP = list => list.kind === 'todo' || list.kind === 'simple';
const isMoneyList = list => list.kind === 'subscriptions' || list.kind === 'budget';
const pendingCount = list => list.items.filter(i => !i.done).length;

function pendingLabel(list) {
  const count = pendingCount(list);
  if (list.kind === 'subscriptions') {
    return count ? t('lists.activeCount', { count }) : ''; // the totals are in the summary of the open list
  }
  if (count) return t(isShoppingList(list) || list.kind === 'budget' ? 'lists.toBuy' : 'lists.pending', { count });
  return list.items.length ? '✓' : '';
}

/** Small due-date chip: today, tomorrow, yesterday or the date (red when overdue). */
function dueChip(due) {
  if (!due) return '';
  const days = daysUntil(due);
  const label = Math.abs(days) <= 1 ? formatRelativeDays(days) : formatShortDate(parseISO(due));
  return `<span class="li-due${days < 0 ? ' late' : days === 0 ? ' today' : ''}"${days < 0 ? ` title="${esc(t('lists.overdue'))}"` : ''}>${label}</span>`;
}

// ---------------------------------------------------------
// Money: subscriptions and budgets
// ---------------------------------------------------------
const money = new Map(); // one number format per locale
function formatMoney(amount, currency) {
  const locale = currentLocale();
  if (!money.has(locale)) money.set(locale, new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }));
  return `${money.get(locale).format(amount)}${currency ? ` ${currency}` : ''}`;
}
/** The charge number k (0 = the anchor date) of a subscription; months keep the day, clamped to short months. */
function chargeDate(anchor, cycle, k) {
  if (cycle === 'weekly') return addDays(anchor, 7 * k);
  const months = (CYCLE_MONTHS[cycle] || 1) * k;
  const first = new Date(anchor.getFullYear(), anchor.getMonth() + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(anchor.getDate(), last));
}
/** Next charge on or after `fromISO` (today by default), or null. item.due is the first charge. */
function nextCharge(item, fromISO = todayISO()) {
  if (!item.due || item.done) return null;
  const anchor = parseISO(item.due);
  for (let k = 0; k < 2000; k++) {
    const date = iso(chargeDate(anchor, item.cycle, k));
    if (date >= fromISO) return date;
  }
  return null;
}
/** The charge before `chargeISO` (one cycle earlier, also before the first one): where its paid period began. */
function previousCharge(item, chargeISO) {
  const anchor = parseISO(item.due);
  for (let k = 0; k < 2000; k++) if (iso(chargeDate(anchor, item.cycle, k)) === chargeISO) return iso(chargeDate(anchor, item.cycle, k - 1));
  return null;
}
/** Active subscriptions charged on a date (for the Calendar and the reminders). */
function chargesOn(dateISO) {
  const found = [];
  for (const list of state.lists) {
    if (list.kind !== 'subscriptions') continue;
    for (const item of list.items) if (nextCharge(item, dateISO) === dateISO) found.push({ list, item });
  }
  return found;
}
/** What a subscription costs per month (weekly × 52 / 12, quarterly ÷ 3, yearly ÷ 12). */
function monthlyCost(item) {
  const price = item.price || 0;
  return item.cycle === 'weekly' ? price * 52 / 12 : price / (CYCLE_MONTHS[item.cycle] || 1);
}
const budgetQuantity = item => Math.max(0, parseFloat(item.qty) || 1);
const budgetCost = item => (item.price || 0) * budgetQuantity(item);
/** "45 USD + 30.000 $": a sum per currency (no exchange rates), or '' when nothing has a price. */
function moneyTotals(items, amountOf) {
  const sums = new Map();
  for (const item of items) {
    if (item.price == null) continue;
    sums.set(item.currency, (sums.get(item.currency) || 0) + amountOf(item));
  }
  return [...sums].map(([currency, amount]) => formatMoney(amount, currency)).join(' + ');
}
/** The currency used last in a list, else in any list, else "$". */
function lastCurrency(list) {
  const pick = items => [...items].reverse().find(i => i.currency);
  const found = pick(list.items) || pick(state.lists.flatMap(l => l.items));
  return found ? found.currency : '$';
}
/** Changing a shopping list into a budget: quantities that look like prices move to the price (the user wrote prices there). */
/** "$120.000" → 120000, "1,5" → 1.5 (thousands separators are dropped). */
const parseAmount = raw => parseFloat(String(raw).replace(/[^\d,.]/g, '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
function convertShoppingToBudget(list) {
  let moved = 0;
  for (const item of list.items) {
    const raw = String(item.qty || '').trim(), value = parseAmount(raw);
    const looksLikePrice = /[$€£]/.test(raw) || value >= 100; // a quantity is rarely 100 or more
    if (!raw || !looksLikePrice || item.price != null || !(value >= 0)) continue;
    item.price = value; item.qty = '1'; item.currency = item.currency || (/€/.test(raw) ? '€' : /£/.test(raw) ? '£' : '$');
    moved++;
  }
  if (moved) setTimeout(() => toast(t('lists.movedPrices', { count: moved }), 'info'), 300);
}

/** Checks or unchecks an item (from the list, the backpack or the pins). */
function toggleListItem(list, item, sourceEl) {
  appEmit('listItemToggle', { list, item }); // before toggling: repeating to-dos create or remove the next one
  item.done = !item.done;
  item.doneAt = item.done ? todayISO() : '';
  if (givesTodoXP(list)) {
    state.listStats.done = Math.max(0, state.listStats.done + (item.done ? 1 : -1));
    xpFx(item.done ? XP.todo : -XP.todo, sourceEl, item.text);
  }
  sfx(item.done ? 'coin' : 'remove');
  if (item.done) unpin('li', item.id);
  commit();
}

// ---------------------------------------------------------
// Drawing
// ---------------------------------------------------------
/** "Budget · 2 to buy": the kind (unless the name already says it) and what is pending. */
function cardSubtitle(list) {
  const kindName = t(`lists.kinds.${list.kind}`);
  const sameName = stripAccents(list.name.toLowerCase()) === stripAccents(kindName.toLowerCase());
  return [sameName ? '' : kindName, pendingLabel(list)].filter(Boolean).join(' · ');
}
function renderLists() {
  if (!selectedListId || !listById(selectedListId)) selectedListId = state.lists[0] ? state.lists[0].id : null;
  const list = selectedListId && listById(selectedListId);
  $('#view-lists').innerHTML = `
  <div class="spread spread-lists">
    <div class="page page-left">
      ${pageHead('lists', t('lists.subtitle'), `<button class="btn btn-primary btn-add" data-lnew title="${esc(t('lists.newList'))}" aria-label="${esc(t('lists.newList'))}">+</button>`)}
      <div class="list-cards">
        ${state.lists.map(l => `
          <button class="list-card${l.id === selectedListId ? ' sel' : ''}" data-lopen="${esc(l.id)}" style="--c:${esc(l.color)}">
            <span class="lc-ico">${iconHTML(l.icon)}</span>
            <span class="lc-text"><b>${esc(l.name)}</b><small>${cardSubtitle(l)}</small></span>
          </button>`).join('') || `<p class="empty">${t('lists.createFirst')}</p>`}
      </div>
    </div>
    <div class="page page-right">${list ? listPanelHTML(list) : `<div class="detail-empty"><p>${t('lists.pickOne')}</p></div>`}</div>
  </div>`;
}

/** The line under the title of a money list: totals per month and year, or total / bought / to buy. */
function moneySummaryHTML(list) {
  if (list.kind === 'subscriptions') {
    const active = list.items.filter(i => !i.done);
    const month = moneyTotals(active, monthlyCost), year = moneyTotals(active, item => monthlyCost(item) * 12);
    const next = active.map(item => ({ item, date: nextCharge(item) })).filter(x => x.date).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!month && !next) return '';
    return `<div class="lp-summary">
      ${month ? `<span><small>${t('lists.perMonth')}</small><b>${month}</b></span><span><small>${t('lists.perYear')}</small><b>${year}</b></span>` : ''}
      ${next ? `<span><small>${t('lists.nextCharge').toUpperCase()}</small><b>${esc(next.item.text)} · ${formatRelativeDays(daysUntil(next.date))}</b></span>` : ''}
    </div>`;
  }
  const total = moneyTotals(list.items, budgetCost);
  if (!total) return '';
  const bought = moneyTotals(list.items.filter(i => i.done), budgetCost) || '0';
  const missing = moneyTotals(list.items.filter(i => !i.done), budgetCost) || '0';
  return `<div class="lp-summary">
    <span><small>${t('lists.total')}</small><b>${total}</b></span>
    <span><small>${t('lists.boughtTotal')}</small><b>${bought}</b></span>
    <span><small>${t('lists.missingTotal')}</small><b>${missing}</b></span>
  </div>`;
}

function itemRowHTML(list, item) {
  const kind = list.kind, pinned = isPinned('li', item.id);
  const check = kind === 'subscriptions' ? ''
    : `<button class="qcheck" data-icheck="${esc(item.id)}"${givesTodoXP(list) ? ` title="+${XP.todo} XP"` : ''} aria-label="${esc(t(item.done ? 'lists.uncheckItem' : 'lists.checkItem', { text: item.text }))}">${item.done ? '✓' : ''}</button>`;
  let extra = '';
  if (kind === 'shopping' && item.qty) extra = `<span class="li-qty">${esc(item.qty)}</span>`;
  if (kind === 'todo' && !item.done) extra = dueChip(item.due) + repeatButtonHTML(item);
  if (kind === 'subscriptions') {
    const next = nextCharge(item);
    extra = `${item.price != null ? `<span class="li-qty">${formatMoney(item.price, item.currency)} / ${t(`lists.cycleShort.${item.cycle}`)}</span>` : ''}
      ${item.done ? `<span class="li-due">${t('lists.cancelled')}</span>` : next ? `<span class="li-due${daysUntil(next) <= 2 ? ' today' : ''}" title="${esc(t('lists.nextCharge'))}">${formatRelativeDays(daysUntil(next))}</span>` : ''}`;
  }
  if (kind === 'budget') {
    const quantity = budgetQuantity(item);
    extra = `${item.link ? `<a class="icon-mini li-link" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer" title="${esc(t('lists.openLink'))}" aria-label="${esc(t('lists.openLink'))}">${ico('ui-link', '')}</a>` : ''}
      ${item.price != null ? `<span class="li-qty">${quantity !== 1 ? `${formatNumber(quantity)} × ` : ''}${formatMoney(item.price, item.currency)}</span>` : ''}`;
  }
  return `<li class="li-item${item.done ? ' done' : ''}">
    ${check}
    <span class="li-text" data-iedit="${esc(item.id)}" title="${esc(item.note || t('lists.doubleClickToEdit'))}">${esc(item.text)}</span>
    ${extra}
    <button class="icon-mini li-edit" data-iedit-btn="${esc(item.id)}" title="${esc(t('common.edit'))}" aria-label="${esc(t('common.editNamed', { name: item.text }))}">${UI_ICON.edit}</button>
    ${item.done || kind === 'subscriptions' ? '' : `<button class="icon-mini li-pin${pinned ? ' on' : ''}" data-ipin="${esc(item.id)}" title="${esc(t(pinned ? 'common.unpin' : 'common.pin'))}">${UI_ICON.pin}</button>`}
    <button class="icon-mini li-del" data-idel="${esc(item.id)}" title="${esc(t('common.remove'))}" aria-label="${esc(t('lists.removeItem', { text: item.text }))}">✕</button>
  </li>`;
}

/** The quick-add form of each kind (the rest is edited in the item's window). */
function addFormHTML(list) {
  const currency = esc(lastCurrency(list));
  const priceField = `<input type="number" name="price" min="0" step="any" placeholder="${esc(t('lists.price'))}" aria-label="${esc(t('lists.price'))}" class="lp-price">
    <input type="text" name="currency" maxlength="4" value="${currency}" aria-label="${esc(t('lists.currency'))}" title="${esc(t('lists.currency'))}" class="lp-cur">`;
  const fields = {
    todo: `<input type="date" name="due" title="${esc(t('lists.dueOptional'))}" aria-label="${esc(t('lists.dueDate'))}">`,
    shopping: `<input type="text" name="qty" maxlength="12" placeholder="${esc(t('lists.quantityShort'))}" class="lp-qty" aria-label="${esc(t('lists.quantity'))}">`,
    subscriptions: `${priceField}
      <select name="cycle" aria-label="${esc(t('lists.cycle'))}">${BILLING_CYCLES.map(c => `<option value="${c}"${c === 'monthly' ? ' selected' : ''}>${t(`lists.cycles.${c}`)}</option>`).join('')}</select>
      <input type="date" name="due" value="${todayISO()}" title="${esc(t('lists.nextCharge'))}" aria-label="${esc(t('lists.nextCharge'))}">`,
    budget: `${priceField}<input type="number" name="qty" min="0" step="any" value="1" class="lp-qty" aria-label="${esc(t('lists.quantity'))}" title="${esc(t('lists.quantity'))}">`,
    simple: '',
  }[list.kind];
  const placeholder = { todo: 'lists.addTodoPlaceholder', shopping: 'lists.addShoppingPlaceholder', subscriptions: 'lists.addSubscriptionPlaceholder', budget: 'lists.addBudgetPlaceholder', simple: 'lists.addSimplePlaceholder' }[list.kind];
  return `<form class="lp-add${isMoneyList(list) ? ' wide' : ''}" data-iadd autocomplete="off">
    <input type="text" name="text" maxlength="400" placeholder="${esc(t(placeholder))}">
    ${fields}
    <button class="btn btn-primary" type="submit" aria-label="${esc(t('common.add'))}">+</button>
  </form>`;
}

function listPanelHTML(list) {
  const kind = list.kind;
  const open = list.items.filter(i => !i.done), done = list.items.filter(i => i.done);
  if (kind === 'todo') open.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')); // most urgent first
  if (kind === 'subscriptions') open.sort((a, b) => (nextCharge(a) || '9999').localeCompare(nextCharge(b) || '9999'));
  const doneLabel = { shopping: 'lists.bought', budget: 'lists.bought', subscriptions: 'lists.cancelledList' }[kind] || 'lists.completed';
  const row = item => itemRowHTML(list, item);
  return `<div class="list-panel" style="--c:${esc(list.color)}">
    <div class="lp-head">
      <span class="lc-ico big">${iconHTML(list.icon)}</span>
      <h2 class="detail-title">${esc(list.name)}<small class="lp-kind">${t(`lists.kinds.${kind}`)}</small></h2>
      <button class="icon-mini" data-ledit title="${esc(t('lists.editList'))}">${UI_ICON.edit}</button>
      <button class="icon-mini" data-ldel title="${esc(t('lists.deleteList'))}">${UI_ICON.del}</button>
    </div>
    ${isMoneyList(list) ? moneySummaryHTML(list) : ''}
    ${addFormHTML(list)}
    <ul class="li-list" data-paged="list-${esc(list.id)}" data-paged-reserve="${done.length ? 150 : 110}">${open.map(row).join('') || `<li class="empty">${t(list.items.length ? 'lists.allDone' : 'lists.nothingYet')}</li>`}</ul>
    ${done.length ? `
      <div class="lp-done-head">
        <button type="button" class="link-btn" data-ldone>${showDoneItems ? '▾' : '▸'} ${t(doneLabel)} (${done.length})</button>
        ${kind === 'subscriptions' ? '' : `<button type="button" class="btn btn-small" data-lclear title="${esc(t('lists.clearHint'))}">${t('lists.clear')}</button>`}
      </div>
      ${showDoneItems ? `<ul class="li-list">${done.map(row).join('')}</ul>` : ''}` : ''}
  </div>`;
}

// ---------------------------------------------------------
// Windows: a list, and an item of a subscriptions or budget list
// ---------------------------------------------------------
/** Create or edit a list: name, kind, icon and color. */
function openListModal(existing) {
  const draft = existing ? { ...existing } : { name: '', kind: 'todo', icon: LIST_DEFAULT_ICON.todo, color: '#cfe3a0' };
  openModal({
    title: t(existing ? 'lists.editTitle' : 'lists.newTitle'),
    wide: true,
    body: `<form data-lform autocomplete="off">
      <label class="field"><span>${t('lists.name')}</span><input type="text" name="name" maxlength="40" value="${esc(draft.name)}" placeholder="${esc(t('lists.namePlaceholder'))}"></label>
      <div class="field"><span>${t('lists.kind')}</span><div class="kind-grid">${segHTML('lkind', LIST_KINDS.map(k => [k, t(`lists.kinds.${k}`).toUpperCase()]))}</div>
        <small class="set-hint" data-lkind-hint></small></div>
      <div class="field"><span>${t('common.iconLabel')}</span><div class="icon-grid">${categoryPickerHTML(draft.icon)}</div></div>
      <div class="field"><span>${t('common.colorLabel')}</span>${swatchesHTML()}</div>
    </form>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t(existing ? 'common.save' : 'common.create')}</button>`,
    onMount: modal => {
      const form = $('[data-lform]', modal), hint = $('[data-lkind-hint]', modal);
      const sync = () => {
        $$('[data-icon]', modal).forEach(b => b.classList.toggle('on', b.dataset.icon === draft.icon));
        $$('[data-color]', modal).forEach(b => b.classList.toggle('on', b.dataset.color === draft.color));
        hint.textContent = t(`lists.kindHints.${draft.kind}`);
      };
      bindSeg(modal, 'lkind', () => draft.kind, kind => {
        // When the kind changes on a new list, suggest its natural icon
        if (!existing && Object.values(LIST_DEFAULT_ICON).includes(draft.icon)) draft.icon = LIST_DEFAULT_ICON[kind];
        draft.kind = kind; sync();
      });
      $$('[data-icon]', modal).forEach(b => { b.onclick = () => { draft.icon = b.dataset.icon; sync(); }; });
      $$('[data-color]', modal).forEach(b => { b.onclick = () => { draft.color = b.dataset.color; sync(); }; });
      sync();
      const accept = () => {
        const name = form.name.value.trim().slice(0, 40);
        if (!name) { sfx('error'); toast(t('lists.nameRequired'), 'warn'); form.name.focus(); return; }
        if (existing) {
          if (existing.kind === 'shopping' && draft.kind === 'budget') convertShoppingToBudget(existing);
          if (draft.kind === 'subscriptions') existing.items.forEach(i => { i.cycle = i.cycle || 'monthly'; });
          Object.assign(existing, { name, kind: draft.kind, icon: draft.icon, color: draft.color });
        } else {
          const list = { id: uid(), name, kind: draft.kind, icon: draft.icon, color: draft.color, items: [] };
          state.lists.push(list);
          selectedListId = list.id;
        }
        closeModal(); sfx('place'); commit();
      };
      $('[data-ok]', modal).onclick = accept;
      form.addEventListener('submit', e => { e.preventDefault(); accept(); });
      setTimeout(() => form.name.focus(), 50);
    },
  });
}

/** Every field of an item of a subscriptions or budget list. */
function openMoneyItemModal(list, item) {
  const isSubscription = list.kind === 'subscriptions';
  openModal({
    title: t('lists.editItemTitle'),
    wide: true,
    body: `<form data-mform autocomplete="off">
      <label class="field"><span>${t('lists.itemText')}</span><input type="text" name="text" maxlength="120" value="${esc(item.text)}"></label>
      <div class="row3">
        <label class="field"><span>${t('lists.price')}</span><input type="number" name="price" min="0" step="any" value="${item.price ?? ''}"></label>
        <label class="field"><span>${t('lists.currency')}</span><input type="text" name="currency" maxlength="4" value="${esc(item.currency || lastCurrency(list))}"></label>
        ${isSubscription
          ? `<label class="field"><span>${t('lists.cycle')}</span><select name="cycle">${BILLING_CYCLES.map(c => `<option value="${c}"${(item.cycle || 'monthly') === c ? ' selected' : ''}>${t(`lists.cycles.${c}`)}</option>`).join('')}</select></label>`
          : `<label class="field"><span>${t('lists.quantity')}</span><input type="number" name="qty" min="0" step="any" value="${esc(String(budgetQuantity(item)))}"></label>`}
      </div>
      ${isSubscription
        ? `<label class="field"><span>${t('lists.firstCharge')}</span><input type="date" name="due" value="${esc(item.due)}"><small class="set-hint">${t('lists.firstChargeHint')}</small></label>
           <label class="check"><input type="checkbox" name="cancelled"${item.done ? ' checked' : ''}> ${t('lists.cancelledCheck')}</label>`
        : `<label class="field"><span>${t('lists.link')}</span><input type="url" name="link" maxlength="300" value="${esc(item.link)}" placeholder="https://…"></label>`}
      <label class="field"><span>${t('common.noteOptional')}</span><input type="text" name="note" maxlength="300" value="${esc(item.note)}"></label>
    </form>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t('common.save')}</button>`,
    onMount: modal => {
      const form = $('[data-mform]', modal);
      const accept = () => {
        const text = form.text.value.trim().slice(0, 120);
        if (!text) { sfx('error'); toast(t('lists.nameRequired'), 'warn'); return; }
        const link = form.link ? form.link.value.trim() : item.link;
        if (link && !/^https?:\/\//i.test(link)) { sfx('error'); toast(t('lists.linkInvalid'), 'warn'); form.link.focus(); return; }
        Object.assign(item, {
          text, price: form.price.value === '' ? null : Math.max(0, +form.price.value), currency: form.currency.value.trim().slice(0, 4),
          note: form.note.value.trim().slice(0, 300), link: link || '',
        });
        if (isSubscription) {
          item.cycle = form.cycle.value;
          item.due = isDateKey(form.due.value) ? form.due.value : item.due;
          item.done = form.cancelled.checked;
          item.doneAt = item.done ? (item.doneAt || todayISO()) : '';
        } else item.qty = String(Math.max(0, +form.qty.value || 1));
        closeModal(); sfx('place'); save(); renderLists();
      };
      $('[data-ok]', modal).onclick = accept;
      form.addEventListener('submit', e => { e.preventDefault(); accept(); });
    },
  });
}

function bindLists() {
  const view = $('#view-lists');
  const currentList = () => selectedListId && listById(selectedListId);
  const itemOf = (list, id) => list && list.items.find(i => i.id === id);
  const editItem = (list, item) => {
    if (isMoneyList(list)) { openMoneyItemModal(list, item); return; }
    promptModal({ title: t('lists.editItemTitle'), label: t('lists.itemText'), value: item.text, max: 120,
      onOk: text => { item.text = text; save(); renderLists(); } });
  };

  view.addEventListener('click', e => {
    const target = e.target;
    const openButton = target.closest('[data-lopen]');
    if (openButton) { selectedListId = openButton.dataset.lopen; showDoneItems = false; sfx('select'); renderLists(); return; }
    if (target.closest('[data-lnew]')) { openListModal(null); return; }
    const list = currentList();
    if (!list) return;
    if (target.closest('[data-ledit]')) { openListModal(list); return; }
    if (target.closest('[data-ldel]')) {
      selectedListId = null;
      removeWithUndo(state, 'lists', list, list.name, () => { if (!selectedListId) selectedListId = list.id; commit(); });
      return;
    }
    const checkButton = target.closest('[data-icheck]');
    if (checkButton) { const item = itemOf(list, checkButton.dataset.icheck); if (item) toggleListItem(list, item, checkButton); return; }
    const editButton = target.closest('[data-iedit-btn]');
    if (editButton) { const item = itemOf(list, editButton.dataset.ieditBtn); if (item) editItem(list, item); return; }
    const pinButton = target.closest('[data-ipin]');
    if (pinButton) { togglePin('li', list.id, pinButton.dataset.ipin); renderLists(); return; }
    const deleteButton = target.closest('[data-idel]');
    if (deleteButton) { const item = itemOf(list, deleteButton.dataset.idel); if (item) removeWithUndo(list, 'items', item, shortLabel(item.text), () => { save(); renderLists(); }); return; }
    if (target.closest('[data-ldone]')) { showDoneItems = !showDoneItems; renderLists(); return; }
    if (target.closest('[data-lclear]')) { // all the checked ones at once, with one UNDO
      const before = list.items, cleared = before.filter(i => i.done).length;
      list.items = before.filter(i => !i.done); showDoneItems = false; sfx('remove'); save(); renderLists();
      toast(t('lists.cleared', { count: cleared }), 'info', { icon: UI_ICON.del, duration: 6000,
        action: { label: t('common.undo'), fn: () => { list.items = before; sfx('place'); save(); renderLists(); } } });
    }
  });

  // Double-click an item to edit it
  view.addEventListener('dblclick', e => {
    const textEl = e.target.closest('[data-iedit]');
    const list = currentList(), item = textEl && itemOf(list, textEl.dataset.iedit);
    if (item) editItem(list, item);
  });

  // Add items (shopping lists accept several, separated by commas)
  view.addEventListener('submit', e => {
    const form = e.target.closest('[data-iadd]');
    if (!form) return;
    e.preventDefault();
    const list = currentList();
    const raw = form.text.value.trim();
    if (!list || !raw) return;
    const texts = (isShoppingList(list) ? raw.split(',') : [raw]).map(x => x.trim().slice(0, 120)).filter(Boolean);
    const field = name => (form[name] ? form[name].value.trim() : '');
    const price = field('price') === '' ? null : Math.max(0, +field('price'));
    const qty = (list.kind === 'budget' ? String(Math.max(0, +field('qty') || 1)) : field('qty')).slice(0, 12);
    const due = isDateKey(field('due')) ? field('due') : '';
    texts.forEach(text => list.items.push({
      id: uid(), text, done: false, qty: texts.length === 1 ? qty : '', due, doneAt: '',
      price, currency: field('currency').slice(0, 4), cycle: list.kind === 'subscriptions' ? field('cycle') || 'monthly' : '', link: '', note: '',
    }));
    sfx('place');
    save();
    renderLists();
    const input = $('#view-lists [data-iadd] input[name="text"]');
    if (input) input.focus();
  });
}

registerView('lists', {
  render: renderLists, bind: bindLists,
  reset: () => { selectedListId = null; showDoneItems = false; },
});
