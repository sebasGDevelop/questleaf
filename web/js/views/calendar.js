/* Calendar section: the month, each day's journal, the weekly chronicle and the year in pixels. */
'use strict';

// Moods 1–5. The color can be changed by the mood palette (Settings → Appearance).
const defineMood = (level, icon, emoji, color) => ({ level, icon, emoji, color, get name() { return t(`moods.${level}`); } });
const MOODS = [null,
  defineMood(1, 'mood-1', '😞', '#f7a8a8'), defineMood(2, 'mood-2', '😴', '#d9b3e6'), defineMood(3, 'mood-3', '😐', '#a9cbe8'),
  defineMood(4, 'mood-4', '🙂', '#a8d8a0'), defineMood(5, 'mood-5', '😄', '#f6d38a')];
const moodIco = level => ico(MOODS[level].icon, MOODS[level].emoji);

let calendarMonth = null;     // first day of the month on screen
let calendarDay = null;       // selected day (YYYY-MM-DD)
let calendarWeek = null;      // Monday of the week whose chronicle is open
let calendarMode = 'month';   // 'month', 'year' (year in pixels) or 'memories'
let calendarYear = new Date().getFullYear();
let isEditingJournal = false; // journal: editing, or showing the written text

const mondayOf = date => addDays(date, -weekdayIndex(date));

/** Everything that happened (or will happen) on a day. */
function dayInfo(dateISO) {
  const date = parseISO(dateISO), weekday = weekdayIndex(date);
  const log = state.schedule.log[dateISO] || {};
  const done = Object.keys(log).filter(k => !k.startsWith('__')).map(k => log[k]);
  const day = date.getDate(), month = date.getMonth() + 1;
  return {
    date, wd: weekday, done,
    planned: state.schedule.blocks.filter(b => b.day === weekday).length,
    habits: (state.habits.log[dateISO] || []).map(id => state.habits.list.find(h => h.id === id)).filter(Boolean),
    workout: !!state.workout.log[dateISO],
    focus: state.focusLog[dateISO] || [],
    bdays: state.birthdays.filter(b => b.day === day && b.month === month),
    events: state.university.events.filter(e => e.date === dateISO && !e.done),
    j: state.journal[dateISO],
    todos: state.lists.flatMap(l => (l.kind === 'todo' ? l.items.filter(i => !i.done && i.due === dateISO) : [])),
    charges: chargesOn(dateISO), // subscriptions billed that day (views/lists.js)
    frozen: state.frozenDays.includes(dateISO),
  };
}

function weekStats(mondayISO) {
  const monday = parseISO(mondayISO);
  const days = range(0, 7).map(i => iso(addDays(monday, i)));
  const stats = { hours: 0, missions: 0, habits: 0, workouts: 0, focusMin: 0, moods: [], perAct: {}, perDay: [] };
  days.forEach(dateISO => {
    const info = dayInfo(dateISO);
    stats.missions += info.done.length;
    stats.perDay.push(info.done.length);
    info.done.forEach(c => { stats.hours += c.h || 0; stats.perAct[c.act] = (stats.perAct[c.act] || 0) + (c.h || 0); });
    stats.habits += info.habits.length;
    if (info.workout) stats.workouts++;
    stats.focusMin += info.focus.reduce((n, f) => n + f.min, 0);
    if (info.j && info.j.mood) stats.moods.push(info.j.mood);
  });
  stats.mood = stats.moods.length ? Math.round(stats.moods.reduce((a, b) => a + b, 0) / stats.moods.length) : 0;
  const max = Math.max(...stats.perDay);
  stats.best = max ? stats.perDay.indexOf(max) : -1;
  stats.top = Object.entries(stats.perAct).sort((a, b) => b[1] - a[1]).slice(0, 3);
  stats.planned = state.schedule.blocks.length;
  return stats;
}

const weekHadActivity = mondayISO => range(0, 7).some(i => dayHasActivity(iso(addDays(parseISO(mondayISO), i))));

/** Pending chronicle: this week's on Sunday, or last week's on Monday and Tuesday. */
function chroniclePending() {
  const now = new Date(), weekday = weekdayIndex(now);
  const thisMonday = iso(mondayOf(now));
  if (weekday === 6 && !state.chronicles[thisMonday]) return thisMonday;
  const lastMonday = iso(addDays(mondayOf(now), -7));
  if (weekday <= 1 && !state.chronicles[lastMonday] && weekHadActivity(lastMonday)) return lastMonday;
  return null;
}

const calendarModeSeg = () => `<div class="seg cal-mode">${[['month', 'calendar.modeMonth'], ['year', 'calendar.modeYear'], ['memories', 'calendar.modeMemories']].map(([mode, key]) =>
  `<button class="btn btn-small${calendarMode === mode ? ' on' : ''}" data-cmode="${mode}">${t(key)}</button>`).join('')}</div>`;

function renderCalendar() {
  if (calendarMode === 'year') { renderYearPixels(); return; }
  if (calendarMode === 'memories') { renderMemories(); return; }
  const today = new Date(), todayKey = todayISO();
  if (!calendarMonth) calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  if (!calendarDay && !calendarWeek) calendarDay = todayKey;
  const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
  const start = mondayOf(calendarMonth);
  const end = addDays(mondayOf(new Date(year, month + 1, 0)), 6);
  const weeks = [];
  for (let d = start; d <= end; d = addDays(d, 7)) weeks.push(d);
  const pending = chroniclePending();

  const dayCell = date => {
    const key = iso(date), info = dayInfo(key);
    const outside = date.getMonth() !== month, future = key > todayKey;
    const mood = info.j && info.j.mood;
    const percent = !future && info.planned ? Math.min(100, Math.round(info.done.length / info.planned * 100)) : 0;
    const cls = ['cal-day', outside && 'out', key === todayKey && 'today', key === calendarDay && !calendarWeek && 'sel', mood && 'has-mood'].filter(Boolean).join(' ');
    const tips = [
      info.bdays.map(b => b.name).join(', '),
      info.events.map(e => e.name).join(', '),
      info.todos.map(i => i.text).join(', '),
      info.charges.map(c => c.item.text).join(', '),
      !future && info.planned ? t('calendar.questsTip', { done: info.done.length, planned: info.planned }) : '',
      mood ? t('calendar.moodTip', { mood: MOODS[mood].name }) : '',
    ].filter(Boolean).join(' · ');
    return `<button class="${cls}" data-cday="${key}" style="${mood ? `--mood:${MOODS[mood].color}` : ''}" title="${esc(tips)}">
      <span class="cd-num">${date.getDate()}</span>
      ${mood ? `<span class="cd-mood">${moodIco(mood)}</span>` : ''}
      <span class="cd-marks">${info.bdays.length ? ico('sec-birthdays', '🎂') : ''}${info.events.length ? ico('today-deadlines', '📌') : ''}${info.todos.length ? ico('sec-lists', '📝') : ''}${info.charges.length ? ico('cat-work', '💰') : ''}${info.frozen ? ico('ui-shield', '🛡') : ''}</span>
      ${percent ? `<span class="cd-bar"><i style="width:${percent}%"></i></span>` : ''}
    </button>`;
  };
  const chronicleButton = monday => {
    const key = iso(monday), written = !!state.chronicles[key], future = key > todayKey;
    const cls = ['cal-chron', written && 'done', key === pending && 'pending', calendarWeek === key && 'sel'].filter(Boolean).join(' ');
    const title = t(written ? 'calendar.chronicleWritten' : future ? 'calendar.weekAhead' : 'calendar.writeChronicle');
    return `<button class="${cls}" data-cweek="${key}"${future ? ' disabled' : ''} title="${esc(title)}">${ico('cat-writing', '📜')}</button>`;
  };

  $('#view-calendar').innerHTML = `
  <div class="spread spread-cal">
    <div class="page page-left">
      ${pageHead('calendar', t('calendar.subtitle'),
        `<button class="btn btn-small" data-cprev aria-label="${esc(t('calendar.previousMonth'))}">◀</button>
         <span class="cal-title">${monthName(month).toUpperCase()} ${year}</span>
         <button class="btn btn-small" data-cnext aria-label="${esc(t('calendar.nextMonth'))}">▶</button>
         <button class="btn btn-small" data-ctoday${year === today.getFullYear() && month === today.getMonth() ? ' disabled' : ''}>${t('common.today')}</button>
         ${calendarModeSeg()}`)}
      <div class="cal-grid">
        ${dayNames('short').map(name => `<div class="cal-dow">${name}</div>`).join('')}<div class="cal-dow" title="${esc(t('calendar.weeklyChronicle'))}">${ico('cat-writing', '📜')}</div>
        ${weeks.map(w => range(0, 7).map(i => dayCell(addDays(w, i))).join('') + chronicleButton(w)).join('')}
      </div>
    </div>
    <div class="page page-right" id="calPanel">${calendarWeek ? chroniclePanel(calendarWeek) : dayPanel(calendarDay)}</div>
  </div>`;
}

/** The day's quests grouped by moment of the day, with the hour on the left (checkable up to today). */
const DAY_MOMENTS = [['morning', 0], ['afternoon', 12], ['evening', 18]];
function dayQuestsHTML(dateISO, info) {
  const future = dateISO > todayISO(), log = state.schedule.log[dateISO] || {};
  const rows = state.schedule.blocks.filter(b => b.day === info.wd && activityById(b.activityId))
    .map(b => ({ id: b.id, activity: activityById(b.activityId), start: b.start, hours: b.duration, done: !!log[b.id] }));
  for (const key in log) { // a quest done on a block that was deleted later still shows (it cannot be unchecked)
    if (key.startsWith('__') || rows.some(r => r.id === key) || !activityById(log[key].act)) continue;
    rows.push({ id: key, activity: activityById(log[key].act), start: +log[key].s || 0, hours: log[key].h || 0, done: true, gone: true });
  }
  if (!rows.length) return '';
  rows.sort((a, b) => a.start - b.start);
  const done = rows.filter(r => r.done).length;
  const rowHTML = r => {
    const name = r.activity.name, label = t(r.done ? 'schedule.uncheckNamed' : 'schedule.completeNamed', { name });
    const check = future ? '' : r.gone ? '<span class="qcheck" aria-hidden="true">✓</span>'
      : `<button class="qcheck" data-ccheck="${esc(r.id)}" title="${esc(t(r.done ? 'common.uncheck' : 'common.complete'))}" aria-label="${esc(label)}">${r.done ? '✓' : ''}</button>`;
    return `<div class="quest dq-row${r.done ? ' done' : ''}" style="--c:${esc(r.activity.color)}">
      <span class="dq-time">${formatHour(r.start)}</span>${check}
      <span class="q-icon">${iconHTML(r.activity.icon)}</span>
      <span class="q-text"><b>${esc(name)}</b><small>${t('calendar.durationHours', { count: r.hours })}</small></span>
    </div>`;
  };
  const groups = DAY_MOMENTS.map(([moment, from], i) => {
    const to = DAY_MOMENTS[i + 1] ? DAY_MOMENTS[i + 1][1] : 24, list = rows.filter(r => r.start >= from && r.start < to);
    return list.length ? `<h3 class="dq-moment">${t(`calendar.moments.${moment}`)}</h3>${list.map(rowHTML).join('')}` : '';
  }).join('');
  // Siblings, not one block: the day panel cuts them into pages (views/shared.js)
  return `<div class="ds-row"><span class="ds-ico" style="--c:${sectionColor('schedule')}">${ico('sec-schedule', '🗓️')}</span>
      <div class="dq-head"><b>${future ? t('calendar.questsPlanned', { count: rows.length }) : t('calendar.questsDoneOf', { done, count: rows.length })}</b>
      ${future ? '' : `<div class="pbar"><div style="width:${(done / rows.length * 100).toFixed(1)}%"></div></div>`}</div></div>
    ${groups}`;
}

function dayPanel(dateISO) {
  const info = dayInfo(dateISO), future = dateISO > todayISO();
  const journal = info.j || { mood: 0, text: '' };
  const focusMinutes = info.focus.reduce((n, f) => n + f.min, 0);
  const row = (color, icon, content) => `<div class="ds-row"><span class="ds-ico" style="--c:${color}">${icon}</span>${content}</div>`;
  const rows = [
    dayQuestsHTML(dateISO, info),
    info.habits.length ? row(sectionColor('habits'), ico('sec-habits', '🌱'), `<div><b>${t('calendar.habitsCount', { count: info.habits.length })}</b><div class="chips">${info.habits.map(h => `<span class="chip" style="--c:${esc(h.color)}">${iconHTML(h.icon)} ${esc(h.name)}</span>`).join('')}</div></div>`) : '',
    info.workout ? row(sectionColor('workout'), ico('sec-workout', '🏋️'), `<b>${t('calendar.workoutDone')}</b>`) : '',
    focusMinutes ? row('#d9b3e6', ico('cat-meditation', '🧘'), `<b>${t('calendar.focusMinutes', { count: focusMinutes })}</b>`) : '',
    info.bdays.length ? row(sectionColor('birthdays'), ico('sec-birthdays', '🎂'), `<div><b>${t('calendar.birthdaysCount', { count: info.bdays.length })}</b><div class="chips">${info.bdays.map(b =>
      `<button class="chip" data-go="birthdays">${esc(b.name)}</button>`).join('')}</div></div>`) : '',
    info.events.length ? row(sectionColor('university'), ico('today-deadlines', '📌'), `<div><b>${t('calendar.deliverablesCount', { count: info.events.length })}</b><div class="chips">${info.events.map(e => {
      const subject = e.act && activityById(e.act);
      return `<button class="chip" data-go="university" style="--c:${subject ? esc(subject.color) : sectionColor('university')}">${ico(DELIVERABLE_ICONS[e.kind], '📌')} ${esc(e.name)}<small>${t(`university.kinds.${e.kind}`)}</small></button>`;
    }).join('')}</div></div>`) : '',
    info.todos.length ? row(sectionColor('lists'), ico('sec-lists', '📝'), `<div><b>${t('lists.pending', { count: info.todos.length })}</b><div class="chips">${info.todos.map(i => `<span class="chip">${esc(i.text)}</span>`).join('')}</div></div>`) : '',
    info.charges.length ? row('#f6d38a', ico('cat-work', '💰'), `<div><b>${t('calendar.charges', { count: info.charges.length })}</b><div class="chips">${info.charges.map(c =>
      `<button class="chip" data-go-list="${esc(c.list.id)}" title="${esc(c.list.name)}">${esc(c.item.text)}${c.item.price != null ? ` · ${formatMoney(c.item.price, c.item.currency)}` : ''}</button>`).join('')}</div></div>`) : '',
    info.frozen ? row('#a9cbe8', ico('ui-shield', '🛡'), `<b>${t('calendar.shieldDay')}</b>`) : '',
  ].filter(Boolean).join('');
  return `<div class="day-panel">
    <h2 class="detail-title">${t('calendar.dayTitle', { weekday: dayName(info.wd), day: info.date.getDate(), month: monthName(info.date.getMonth()) })}</h2>
    ${future ? '' : `
    <div class="mood-pick" role="group" aria-label="${esc(t('calendar.howWasYourDay'))}">
      ${[5, 4, 3, 2, 1].map(n => `<button class="mood-btn${journal.mood === n ? ' on' : ''}" data-mood="${n}" title="${esc(MOODS[n].name)}" aria-label="${esc(MOODS[n].name)}" style="--mood:${MOODS[n].color}">${moodIco(n)}</button>`).join('')}
    </div>
    ${journal.text && !isEditingJournal
      ? `<div class="ink-text" data-jedit title="${esc(t('calendar.clickToEdit'))}"><p>${esc(journal.text)}</p></div>`
      : `<textarea class="journal-text" data-jtext rows="2" maxlength="2000" placeholder="${esc(t('calendar.journalPlaceholder'))}">${esc(journal.text)}</textarea>`}
    ${gratitudeDayHTML(dateISO)}
    ${memoriesHTML(dateISO)}`}
    <div class="day-summary" data-paged="day">${rows || `<p class="empty">${t(future ? 'calendar.nothingScheduled' : 'calendar.noActivity')}</p>`}</div>
  </div>`;
}

function chroniclePanel(mondayISO) {
  const monday = parseISO(mondayISO), sunday = addDays(monday, 6);
  const stats = weekStats(mondayISO), chronicle = state.chronicles[mondayISO] || { good: '', improve: '', focus: '' };
  const tile = (key, emoji, value, label) => `<div class="pf-stat"><span class="pf-stat-ico">${ico(key, emoji)}</span><b>${value}</b><small>${label}</small></div>`;
  const topActivities = stats.top.map(([id, hours]) => {
    const activity = state.schedule.activities.find(a => a.id === id);
    return activity ? `<span class="chip" style="--c:${esc(activity.color)}">${iconHTML(activity.icon)} ${esc(activity.name)} · ${hours}h</span>` : '';
  }).join('');
  const moodTile = stats.mood
    ? tile(MOODS[stats.mood].icon, MOODS[stats.mood].emoji, MOODS[stats.mood].name, t('calendar.statMood'))
    : tile('mood-3', '😐', '—', t('calendar.statMood'));
  const isWritten = !!state.chronicles[mondayISO];
  return `<div class="chron-panel">
    <h2 class="detail-title">${t('calendar.chronicleTitle', { from: formatShortDate(monday), to: formatShortDate(sunday) })}</h2>
    <div class="pf-stats">
      ${tile('sec-schedule', '🗓️', `${stats.hours}h`, t('calendar.statQuests', { count: stats.missions }))}
      ${tile('sec-habits', '🌱', stats.habits, t('calendar.statHabits', { count: stats.habits }))}
      ${tile('sec-workout', '🏋️', stats.workouts, t('calendar.statWorkouts', { count: stats.workouts }))}
      ${tile('cat-meditation', '🧘', stats.focusMin, t('calendar.statFocus'))}
      ${moodTile}
      ${tile('achievement-clear', '🏆', stats.best >= 0 ? dayName(stats.best) : '—', t('calendar.statBestDay'))}
    </div>
    ${topActivities ? `<div class="chips chron-top">${topActivities}</div>` : ''}
    ${workflowWeekHTML(mondayISO)}
    <form data-chron="${mondayISO}" autocomplete="off">
      <label class="field"><span>${t('calendar.wentWell')}</span><textarea name="good" rows="2" maxlength="1000">${esc(chronicle.good)}</textarea></label>
      <label class="field"><span>${t('calendar.toImprove')}</span><textarea name="improve" rows="2" maxlength="1000">${esc(chronicle.improve)}</textarea></label>
      <label class="field"><span>${t('calendar.nextFocus')}</span><textarea name="focus" rows="2" maxlength="1000">${esc(chronicle.focus)}</textarea></label>
      <button class="btn btn-primary full" type="submit" title="${isWritten ? '' : `+${XP.chronicle} XP`}">${ico('cat-writing', '📜')} ${t(isWritten ? 'calendar.update' : 'calendar.saveChronicle')}</button>
    </form>
  </div>`;
}

/** Year in pixels: every day of the year painted with the color of its mood. */
function renderYearPixels() {
  const year = calendarYear, todayKey = todayISO();
  const counts = [0, 0, 0, 0, 0, 0];
  let written = 0;
  const rows = monthNames('short').map((monthLabel, month) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return `<div class="yp-row"><span class="yp-month">${monthLabel}</span>${range(1, 32).map(day => {
      if (day > daysInMonth) return '<span class="yp-px none"></span>';
      const key = `${year}-${pad(month + 1)}-${pad(day)}`, journal = state.journal[key];
      if (journal) { written++; counts[journal.mood]++; }
      const mood = journal && journal.mood;
      const cls = ['yp-px', mood ? 'mood' : journal ? 'note' : '', key > todayKey ? 'future' : '', key === todayKey ? 'today' : ''].filter(Boolean).join(' ');
      const title = `${formatShortDate(new Date(year, month, day))}${mood ? ` · ${MOODS[mood].name}` : journal ? ` · ${t('calendar.journalEntry')}` : ''}`;
      return `<button class="${cls}" data-ypix="${key}" style="${mood ? `--mood:${MOODS[mood].color}` : ''}" title="${esc(title)}"></button>`;
    }).join('')}</div>`;
  }).join('');
  const total = counts.slice(1).reduce((a, b) => a + b, 0) || 1;
  $('#view-calendar').innerHTML = `
  <div class="spread spread-cal">
    <div class="page page-left">
      ${pageHead('calendar', t('calendar.yearSubtitle'),
        `<button class="btn btn-small" data-yprev aria-label="${esc(t('calendar.previousYear'))}">◀</button>
         <span class="cal-title">${year}</span>
         <button class="btn btn-small" data-ynext aria-label="${esc(t('calendar.nextYear'))}">▶</button>
         ${calendarModeSeg()}`)}
      <div class="year-pixels">
        <div class="yp-row yp-head"><span class="yp-month"></span>${range(1, 32).map(d => `<span class="yp-num">${d % 5 === 0 || d === 1 ? d : ''}</span>`).join('')}</div>
        ${rows}
      </div>
    </div>
    <div class="page page-right">
      <div class="yp-stats">
        <h2 class="detail-title">${t('calendar.daysWritten', { count: written })}</h2>
        ${[5, 4, 3, 2, 1].map(n => `<div class="yp-stat">
          <span class="yp-ico">${moodIco(n)}</span>
          <span class="yp-bar"><i style="width:${(counts[n] / total * 100).toFixed(1)}%;background:${MOODS[n].color}"></i></span>
          <b>${counts[n]}</b></div>`).join('')}
      </div>
    </div>
  </div>`;
}

/** Saves or clears a journal entry (daily things give no XP; they feed the streak and the challenges). */
function setJournal(dateISO, patch) {
  const entry = { mood: 0, text: '', ...(state.journal[dateISO] || {}), ...patch };
  if (!entry.mood && !entry.text) delete state.journal[dateISO];
  else state.journal[dateISO] = entry;
  commit();
}

function bindCalendar() {
  const view = $('#view-calendar');
  view.addEventListener('click', e => {
    const target = e.target;
    if (target.closest('[data-cprev]') || target.closest('[data-cnext]')) {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + (target.closest('[data-cprev]') ? -1 : 1), 1);
      sfx('page'); renderCalendar(); return;
    }
    if (target.closest('[data-jedit]')) {
      isEditingJournal = true; renderCalendar();
      const textarea = $('[data-jtext]', view);
      if (textarea) { textarea.focus(); textarea.selectionStart = textarea.value.length; }
      return;
    }
    const modeButton = target.closest('[data-cmode]');
    if (modeButton) { calendarMode = modeButton.dataset.cmode; sfx('page'); renderCalendar(); return; }
    if (target.closest('[data-yprev]') || target.closest('[data-ynext]')) { calendarYear += target.closest('[data-yprev]') ? -1 : 1; sfx('page'); renderCalendar(); return; }
    const pixel = target.closest('[data-ypix]');
    if (pixel) {
      calendarDay = pixel.dataset.ypix; calendarWeek = null; calendarMode = 'month';
      const date = parseISO(calendarDay);
      calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      sfx('page'); renderCalendar(); return;
    }
    if (target.closest('[data-ctoday]')) { calendarMonth = null; calendarDay = todayISO(); calendarWeek = null; sfx('page'); renderCalendar(); return; }
    const questCheck = target.closest('[data-ccheck]');
    if (questCheck) { toggleBlockDone(questCheck.dataset.ccheck, calendarDay, questCheck); return; }
    const listChip = target.closest('[data-go-list]');
    if (listChip) { selectedListId = listChip.dataset.goList; navigateTo('lists'); return; }
    const dayButton = target.closest('[data-cday]');
    if (dayButton) { calendarDay = dayButton.dataset.cday; calendarWeek = null; isEditingJournal = false; sfx('select'); renderCalendar(); return; }
    const weekButton = target.closest('[data-cweek]');
    if (weekButton) { calendarWeek = weekButton.dataset.cweek; sfx('page'); renderCalendar(); return; }
    const moodButton = target.closest('[data-mood]');
    if (moodButton) {
      const level = +moodButton.dataset.mood, current = state.journal[calendarDay];
      sfx('select');
      setJournal(calendarDay, { mood: current && current.mood === level ? 0 : level });
    }
  });
  view.addEventListener('change', e => {
    if (!e.target.matches('[data-jtext]')) return;
    isEditingJournal = false;
    setJournal(calendarDay, { text: e.target.value.trim().slice(0, 2000) });
  });
  view.addEventListener('submit', e => {
    const form = e.target.closest('[data-chron]');
    if (!form) return;
    e.preventDefault();
    const mondayKey = form.dataset.chron, isNew = !state.chronicles[mondayKey];
    const chronicle = { good: form.good.value.trim(), improve: form.improve.value.trim(), focus: form.focus.value.trim() };
    if (!chronicle.good && !chronicle.improve && !chronicle.focus) { sfx('error'); toast(t('calendar.writeOneAnswer'), 'warn'); return; }
    state.chronicles[mondayKey] = chronicle;
    if (isNew) { sfx('achieve'); confetti(24); xpFx(XP.chronicle, form.querySelector('[type=submit]'), t('calendar.chronicleXpLabel')); } else sfx('place');
    commit();
  });
}

registerView('calendar', {
  render: renderCalendar, bind: bindCalendar,
  tick: () => { if (!$('#view-calendar :is(textarea, input):focus')) renderCalendar(); },
  reset: () => { calendarMonth = null; calendarDay = null; calendarWeek = null; calendarMode = 'month'; isEditingJournal = false; },
});
