/* Birthdays section: people sorted by their next birthday. */
'use strict';

/** Next date of a birthday from today (null when it has no date yet). */
function nextBirthday(birthday) {
  if (!birthday.day || !birthday.month) return null;
  const today = parseISO(todayISO());
  let date = new Date(today.getFullYear(), birthday.month - 1, birthday.day);
  if (date < today) date = new Date(today.getFullYear() + 1, birthday.month - 1, birthday.day);
  return { date, days: Math.round((date - today) / 86400000) };
}
function birthdaysSorted() {
  return state.birthdays
    .map(birthday => ({ birthday, next: nextBirthday(birthday) }))
    .sort((x, y) => (x.next ? x.next.days : 1e9) - (y.next ? y.next.days : 1e9)
      || x.birthday.name.localeCompare(y.birthday.name, currentLocale()));
}
const birthdayDate = birthday => t('birthdays.dayOfMonth', { day: birthday.day, month: monthName(birthday.month - 1) });

function renderBirthdays() {
  const sorted = birthdaysSorted();
  const closest = sorted.find(x => x.next);
  const card = ({ birthday, next }) => {
    const when = next ? (next.days === 0 ? t('birthdays.todayBadge') : formatRelativeDays(next.days)) : t('birthdays.noDate');
    return `<div class="bday${next && next.days === 0 ? ' is-today' : ''}${!next ? ' nodate' : ''}" style="--c:${colorFor(birthday.name)}">
      <div class="bday-ini">${esc(birthday.name.charAt(0).toUpperCase())}</div>
      <div class="bday-text">
        <b>${esc(birthday.name)}</b>
        <small>${next ? birthdayDate(birthday) : t('birthdays.addDate')}</small>
      </div>
      <span class="bday-when">${when}</span>
      <span class="bday-actions">
        <button class="icon-mini" data-bdedit="${esc(birthday.id)}" title="${esc(t('common.edit'))}">${UI_ICON.edit}</button>
        <button class="icon-mini" data-bddel="${esc(birthday.id)}" title="${esc(t('common.delete'))}">${UI_ICON.del}</button>
      </span>
    </div>`;
  };
  $('#view-birthdays').innerHTML = `
    ${pageHead('birthdays', t('birthdays.subtitle'),
      `<button class="btn btn-primary btn-add" data-bdnew title="${esc(t('birthdays.newBirthday'))}" aria-label="${esc(t('birthdays.newBirthday'))}">+</button>`)}
    ${closest ? `<div class="scroll-banner bday-next">
      <div class="sb-label">${t(closest.next.days === 0 ? 'birthdays.todayIsTheirs' : 'birthdays.nextBirthday')}</div>
      <p>${ico('sec-birthdays', '')} <b>${esc(closest.birthday.name)}</b> — ${closest.next.days === 0 ? t('birthdays.today') : formatRelativeDays(closest.next.days)} (${birthdayDate(closest.birthday)})</p>
    </div>` : ''}
    <div class="bday-grid">${sorted.map(card).join('') || `<p class="empty">${t('birthdays.noBirthdays')}</p>`}</div>`;
}

function openBirthdayModal(birthdayId) {
  const existing = birthdayId ? state.birthdays.find(b => b.id === birthdayId) : null;
  openModal({
    title: t(existing ? 'birthdays.editTitle' : 'birthdays.newTitle'),
    body: `<form data-bdform autocomplete="off">
      <label class="field"><span>${t('common.nameLabel')}</span><input type="text" name="name" maxlength="40" value="${esc(existing ? existing.name : '')}" placeholder="${esc(t('birthdays.namePlaceholder'))}"></label>
      <div class="row2">
        <label class="field"><span>${t('birthdays.day')}</span><select name="day"><option value="">—</option>
          ${range(1, 32).map(d => `<option value="${d}"${existing && existing.day === d ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
        <label class="field"><span>${t('birthdays.month')}</span><select name="month"><option value="">—</option>
          ${monthNames().map((name, i) => `<option value="${i + 1}"${existing && existing.month === i + 1 ? ' selected' : ''}>${name}</option>`).join('')}</select></label>
      </div>
    </form>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t('common.save')}</button>`,
    onMount: modal => {
      const form = $('[data-bdform]', modal);
      const accept = () => {
        const name = form.name.value.trim();
        const day = parseInt(form.day.value, 10) || null, month = parseInt(form.month.value, 10) || null;
        if (!name) { sfx('error'); toast(t('birthdays.nameRequired'), 'warn'); return; }
        if ((day && !month) || (!day && month)) { sfx('error'); toast(t('birthdays.dayAndMonth'), 'warn'); return; }
        // 2024 is a leap year, so 29 February is allowed
        if (day && month && day > new Date(2024, month, 0).getDate()) { sfx('error'); toast(t('birthdays.dayDoesNotExist'), 'warn'); return; }
        if (existing) Object.assign(existing, { name, day, month });
        else state.birthdays.push({ id: uid(), name, day, month });
        closeModal(); sfx('place'); commit();
      };
      $('[data-ok]', modal).onclick = accept;
      form.addEventListener('submit', e => { e.preventDefault(); accept(); });
    },
  });
}

function bindBirthdays() {
  $('#view-birthdays').addEventListener('click', e => {
    const target = e.target;
    if (target.closest('[data-bdnew]')) { openBirthdayModal(null); return; }
    const editButton = target.closest('[data-bdedit]');
    if (editButton) { openBirthdayModal(editButton.dataset.bdedit); return; }
    const deleteButton = target.closest('[data-bddel]');
    if (deleteButton) {
      const birthday = state.birthdays.find(x => x.id === deleteButton.dataset.bddel);
      removeWithUndo(state, 'birthdays', birthday, birthday.name);
      return;
    }
    // A card without a date opens the editor, to add it
    if (target.closest('.bday.nodate')) openBirthdayModal(target.closest('.bday').querySelector('[data-bdedit]').dataset.bdedit);
  });
}

registerView('birthdays', { render: renderBirthdays, bind: bindBirthdays, tick: renderBirthdays });
