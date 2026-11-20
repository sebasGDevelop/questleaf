/* Habits section: the weekly table, streaks and the skill tree. A habit is only due on its weekdays. */
'use strict';

let habitWeekOffset = 0;
const habitById = id => state.habits.list.find(h => h.id === id);
const isHabitDue = (habit, date) => habit.days.includes(weekdayIndex(date));
const habitsDueOn = date => state.habits.list.filter(habit => isHabitDue(habit, date));

function habitStreak(habitId) {
  const habit = habitById(habitId);
  const checkedOn = date => (state.habits.log[iso(date)] || []).includes(habitId);
  let day = new Date(), count = 0;
  if (!checkedOn(day)) day = addDays(day, -1); // today does not break the streak yet
  for (let guard = 0; guard < 4000; guard++, day = addDays(day, -1)) {
    if (checkedOn(day)) count++;
    else if (!habit || isHabitDue(habit, day)) break; // a day off neither adds nor breaks
  }
  return count;
}
/** "MON WED FRI" under the name when a habit is not daily. */
const habitDaysLabel = habit => (habit.days.length === 7 ? '' : habit.days.map(i => dayName(i, 'short')).join(' '));

function renderHabits() {
  const dates = weekDatesFor(habitWeekOffset), todayKey = todayISO();
  const habits = state.habits.list;
  let weekChecks = 0, possible = 0; // the bar only counts the days each habit is due
  const rows = habits.map(habit => {
    const cells = dates.map(date => {
      const dateKey = iso(date), due = isHabitDue(habit, date);
      const checked = (state.habits.log[dateKey] || []).includes(habit.id);
      if (due && dateKey <= todayKey) { possible++; if (checked) weekChecks++; }
      const cls = [dateKey === todayKey && 'today', !due && 'off'].filter(Boolean).join(' ');
      return `<td class="${cls}">
        <button class="hcheck${checked ? ' on' : ''}" style="--c:${esc(habit.color)}" data-habit="${esc(habit.id)}" data-date="${dateKey}"
          ${dateKey > todayKey ? 'disabled' : ''}${due ? '' : ` title="${esc(t('habits.offDayTip'))}"`} aria-label="${esc(`${habit.name} ${formatShortDate(date)}`)}">${checked ? '✓' : ''}</button></td>`;
    }).join('');
    const streak = habitStreak(habit.id), daysLabel = habitDaysLabel(habit);
    return `<tr>
      <th scope="row"><button class="h-name" data-habit-edit="${esc(habit.id)}" style="--c:${esc(habit.color)}" title="${esc(t('habits.editHabit'))}">
        <span class="h-ico">${iconHTML(habit.icon)}</span><span class="h-label"><span>${esc(habit.name)}</span>${daysLabel ? `<small class="h-days">${daysLabel}</small>` : ''}</span></button></th>
      ${cells}
      <td class="h-streak">${streak ? `${ico('hud-streak', '')} ${streak}` : '—'}</td>
    </tr>`;
  }).join('');
  const percent = possible ? Math.min(100, Math.round(weekChecks / possible * 100)) : 0;

  $('#view-habits').innerHTML = `
    ${pageHead('habits', t('habits.subtitle'),
      `<button class="btn btn-small" data-hweek="-1" aria-label="${esc(t('schedule.previousWeek'))}">◀</button>
       <span class="cal-title habit-week" title="${esc(`${formatShortDate(dates[0])} – ${formatShortDate(dates[6])} ${dates[6].getFullYear()}`)}">${t('schedule.weekNumber', { number: isoWeek(dates[0]) })}${habitWeekOffset === 0 ? ` · ${t('schedule.currentWeek')}` : ''}</span>
       <button class="btn btn-small" data-hweek="1" aria-label="${esc(t('schedule.nextWeek'))}">▶</button>
       <button class="btn btn-small" data-hweek="0"${habitWeekOffset === 0 ? ' disabled' : ''}>${t('common.today')}</button>
       <button class="btn btn-primary btn-add" data-habit-new title="${esc(t('habits.newHabit'))}" aria-label="${esc(t('habits.newHabit'))}">+</button>`)}
    <div class="card table-card">
      ${habits.length ? `<table class="habit-table">
        <thead><tr><th>${t('habits.habitColumn')}</th>${dates.map((d, i) => `<th class="${iso(d) === todayKey ? 'today' : ''}">${dayName(i, 'short')}<small>${d.getDate()}</small></th>`).join('')}<th>${t('habits.streakColumn')}</th></tr></thead>
        <tbody data-paged="habits" data-paged-reserve="190">${rows}</tbody></table>` : `<p class="empty">${t('habits.noHabits')}</p>`}
      <div class="week-progress-row"><span class="week-progress">${weekChecks}/${possible}</span>
        <div class="pbar big"><div style="width:${percent}%"></div><span>${percent}%</span></div></div>
    </div>
    ${skillsHTML()}`;
}

function toggleHabit(habitId, dateISO) {
  if (dateISO > todayISO()) return;
  const day = state.habits.log[dateISO] || (state.habits.log[dateISO] = []);
  const index = day.indexOf(habitId);
  if (index >= 0) { day.splice(index, 1); sfx('remove'); } else { day.push(habitId); sfx('coin'); }
  if (!day.length) delete state.habits.log[dateISO];
  commit();
}

function openHabitModal(habitId) {
  const existing = habitId ? habitById(habitId) : null;
  const draft = existing ? { ...existing } : { name: '', icon: 'cat-writing', color: pickOf(PASTELS), days: [...ALL_WEEKDAYS] };
  openModal({
    title: t(existing ? 'habits.editTitle' : 'habits.newTitle'),
    body: `<form data-hform autocomplete="off">
      <label class="field"><span>${t('common.nameLabel')}</span><input type="text" name="name" maxlength="30" value="${esc(draft.name)}" placeholder="${esc(t('habits.namePlaceholder'))}"></label>
      <div class="field"><span>${t('common.iconLabel')}</span><div class="icon-grid">${categoryPickerHTML(draft.icon)}</div></div>
      <div class="field"><span>${t('common.colorLabel')}</span>${swatchesHTML()}</div>
      <div class="field"><span>${t('habits.daysLabel')}</span>
        <div class="days-pick">${dayNames('short').map((name, i) => `<label><input type="checkbox" name="day" value="${i}"${draft.days.includes(i) ? ' checked' : ''}><span>${name}</span></label>`).join('')}</div>
        <small class="set-hint">${t('habits.daysHint')}</small></div>
    </form>`,
    footer: `${existing ? `<button class="btn btn-danger" data-delete>${UI_ICON.del} ${t('common.deleteUpper')}</button>` : ''}<span class="spacer"></span>
      <button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t(existing ? 'common.save' : 'common.create')}</button>`,
    onMount: modal => {
      const form = $('[data-hform]', modal);
      const sync = () => {
        $$('[data-icon]', modal).forEach(b => b.classList.toggle('on', b.dataset.icon === draft.icon));
        $$('[data-color]', modal).forEach(b => b.classList.toggle('on', b.dataset.color === draft.color));
      };
      $$('[data-icon]', modal).forEach(b => { b.onclick = () => { draft.icon = b.dataset.icon; sync(); }; });
      $$('[data-color]', modal).forEach(b => { b.onclick = () => { draft.color = b.dataset.color; sync(); }; });
      sync();
      const accept = () => {
        const name = form.name.value.trim();
        if (!name) { sfx('error'); toast(t('habits.nameRequired'), 'warn'); return; }
        const days = $$('[name=day]:checked', modal).map(box => +box.value);
        if (!days.length) { sfx('error'); toast(t('habits.pickDays'), 'warn'); return; }
        if (existing) Object.assign(existing, { name, icon: draft.icon, color: draft.color, days });
        else state.habits.list.push({ id: uid(), name, icon: draft.icon, color: draft.color, days });
        closeModal(); sfx('place'); commit();
      };
      $('[data-ok]', modal).onclick = accept;
      form.addEventListener('submit', e => { e.preventDefault(); accept(); });
      if (existing) {
        $('[data-delete]', modal).onclick = () => { closeModal(); removeWithUndo(state.habits, 'list', existing, existing.name); }; // its history stays
      }
    },
  });
}

function bindHabits() {
  bindFolds($('#view-habits'), renderHabits);
  $('#view-habits').addEventListener('click', e => {
    const target = e.target;
    const checkButton = target.closest('[data-habit]');
    if (checkButton) { toggleHabit(checkButton.dataset.habit, checkButton.dataset.date); return; }
    const editButton = target.closest('[data-habit-edit]');
    if (editButton) { openHabitModal(editButton.dataset.habitEdit); return; }
    if (target.closest('[data-habit-new]')) { openHabitModal(null); return; }
    const weekButton = target.closest('[data-hweek]');
    if (weekButton) { const step = +weekButton.dataset.hweek; habitWeekOffset = step === 0 ? 0 : habitWeekOffset + step; renderHabits(); }
  });
}

registerView('habits', { render: renderHabits, bind: bindHabits, reset: () => { habitWeekOffset = 0; } });
