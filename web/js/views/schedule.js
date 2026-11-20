/* Schedule section: the activity inventory, the week's blocks (dragged or painted), today's quests and the stats. */
'use strict';

const DEFAULT_ACTIVITY_ICON = { subject: 'cat-study', personal: 'cat-rest' };
// Sample activities (used by the starting content and by "Load sample"). Names come from schedule.sample.<key>.
const SAMPLE_ACTIVITIES = [
  { key: 'networks', type: 'subject', icon: 'cat-code', color: '#a9cbe8', dur: 2, slots: [[0, 8], [2, 8]] },
  { key: 'programming', type: 'subject', icon: 'cat-code', color: '#a8d8a0', dur: 2, slots: [[1, 10], [3, 10]] },
  { key: 'calculus', type: 'subject', icon: 'cat-math', color: '#b8b4ec', dur: 2, slots: [[0, 14], [4, 8]] },
  { key: 'english', type: 'subject', icon: 'cat-languages', color: '#f6d38a', dur: 1, slots: [[1, 7], [3, 7]] },
  { key: 'exercise', type: 'personal', icon: 'cat-strength', color: '#f6b98a', dur: 1, slots: [[0, 18], [1, 18], [2, 18], [3, 18], [4, 18]] },
  { key: 'piano', type: 'personal', icon: 'cat-music', color: '#d9b3e6', dur: 1, slots: [[1, 20], [3, 20], [5, 10]] },
  { key: 'calligraphy', type: 'personal', icon: 'cat-writing', color: '#efb3d0', dur: 1, slots: [[5, 16]] },
  { key: 'reading', type: 'personal', icon: 'cat-study', color: '#9fd9c9', dur: 1, slots: [[6, 10], [2, 21]] },
  { key: 'lunch', type: 'personal', icon: 'cat-food', color: '#f3e7a1', dur: 1, slots: [[0, 12], [1, 12], [2, 12], [3, 12], [4, 12]] },
];
const sampleActivity = sample => ({ id: uid(), name: t(`schedule.sample.${sample.key}`), type: sample.type, icon: sample.icon, color: sample.color, dur: sample.dur });

function defaultActivities() { return SAMPLE_ACTIVITIES.map(sampleActivity); }

/** Validates the schedule part of a save: activities, the blocks that point to them, and the log. */
function normalizeSchedule(raw, fallback) {
  if (!raw) return fallback;
  const activities = (Array.isArray(raw.activities) ? raw.activities : fallback.activities)
    .filter(a => isPlainObject(a) && a.id && a.name)
    .map(a => ({
      id: String(a.id),
      name: String(a.name).slice(0, 24),
      type: a.type === 'personal' ? 'personal' : 'subject',
      icon: toCategory(a.icon, a.type === 'personal' ? DEFAULT_ACTIVITY_ICON.personal : DEFAULT_ACTIVITY_ICON.subject),
      color: isValidColor(a.color) ? migrateColor(a.color) : '#a9cbe8',
      dur: [1, 2, 3].includes(a.dur) ? a.dur : 1,
    }));
  const ids = new Set(activities.map(a => a.id));
  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : [])
    .filter(b => isPlainObject(b) && ids.has(b.activityId) && b.day >= 0 && b.day <= 6 && Number.isInteger(b.start))
    .map(b => ({
      id: String(b.id || uid()), activityId: b.activityId, day: b.day, start: b.start,
      duration: [1, 2, 3].includes(b.duration) ? b.duration : 1, note: String(b.note || '').slice(0, 60),
    }));
  return { activities, blocks, log: isPlainObject(raw.log) ? raw.log : {} };
}

// ---------------------------------------------------------
// View state
// ---------------------------------------------------------
let scheduleWeekOffset = 0;
let inventoryTab = 'subject';
let paintActivityId = null;  // activity being "painted" on empty cells
let scheduleDrag = null;     // { kind: 'new' | 'move', activityId | blockId, duration, grab, label }
let dropGhost = null;

const scheduleData = () => state.schedule;
const activityById = id => scheduleData().activities.find(a => a.id === id);
const blockById = id => scheduleData().blocks.find(b => b.id === id);
const isBlockDone = (blockId, dateISO) => !!(scheduleData().log[dateISO] && scheduleData().log[dateISO][blockId]);
const formatBlockRange = block => `${formatHour(block.start)}–${formatHour(block.start + block.duration)}`;
const scheduleWeekDates = () => weekDatesFor(scheduleWeekOffset);
const typeLabel = type => t(type === 'subject' ? 'schedule.subject' : 'schedule.personal');

function isSlotFree(day, start, duration, ignoreBlockId) {
  const { startHour, endHour } = state.settings;
  if (start < startHour || start + duration > endHour) return false;
  return !scheduleData().blocks.some(b => b.id !== ignoreBlockId && b.day === day &&
    b.start < start + duration && start < b.start + b.duration);
}

/** Today's quests (the cover page uses them too). */
function todayMissions() {
  const now = new Date();
  const weekday = weekdayIndex(now), todayKey = iso(now);
  const list = scheduleData().blocks.filter(b => b.day === weekday && activityById(b.activityId)).sort((x, y) => x.start - y.start);
  return { list, done: list.filter(b => isBlockDone(b.id, todayKey)).length, cleared: !!(scheduleData().log[todayKey] && scheduleData().log[todayKey].__clear) };
}

/** Marks (or unmarks) the "perfect day" when every quest of the day is done. */
function updateDayClear(dateISO) {
  const weekday = weekdayIndex(parseISO(dateISO));
  const blocksOfDay = scheduleData().blocks.filter(b => b.day === weekday);
  const entry = scheduleData().log[dateISO] || {};
  const allDone = blocksOfDay.length > 0 && blocksOfDay.every(b => entry[b.id]);
  if (allDone && !entry.__clear) { scheduleData().log[dateISO] = entry; entry.__clear = { xp: 0 }; return 'gained'; }
  if (!allDone && entry.__clear) { delete entry.__clear; return 'lost'; }
  return null;
}

// ---------------------------------------------------------
// Actions
// ---------------------------------------------------------
function placeActivity(activityId, day, start) {
  const activity = activityById(activityId);
  if (!activity) return false;
  let duration = activity.dur || 1;
  if (!isSlotFree(day, start, duration)) {
    // When the whole block does not fit, place the longest one that does
    const fitting = [2, 1].find(d => d < duration && isSlotFree(day, start, d));
    if (!fitting) { sfx('error'); toast(t('schedule.slotTaken'), 'warn'); return false; }
    duration = fitting;
    toast(t('schedule.onlyFit', { count: fitting }), 'info', { icon: '📏' });
  }
  scheduleData().blocks.push({ id: uid(), activityId, day, start, duration, note: '' });
  sfx('place');
  commit();
  return true;
}

function moveBlock(id, day, start) {
  const block = blockById(id);
  if (!block) return;
  if (!isSlotFree(day, start, block.duration, id)) { sfx('error'); toast(t('schedule.doesNotFit'), 'warn'); return; }
  if (block.day === day && block.start === start) return;
  block.day = day; block.start = start;
  sfx('place');
  commit();
}

function deleteBlock(id) {
  const index = scheduleData().blocks.findIndex(b => b.id === id);
  if (index < 0) return;
  const [block] = scheduleData().blocks.splice(index, 1);
  sfx('remove');
  commit();
  toast(t('schedule.blockDeleted'), 'info', {
    icon: '🗑️', duration: 4500,
    action: { label: t('common.undo'), fn: () => {
      if (activityById(block.activityId) && isSlotFree(block.day, block.start, block.duration)) { scheduleData().blocks.push(block); sfx('place'); commit(); }
      else toast(t('schedule.restoreFailed'), 'warn');
    } },
  });
}

function toggleBlockDone(blockId, dateISO, sourceEl) {
  const block = blockById(blockId);
  const activity = block && activityById(block.activityId);
  if (!activity) return;
  if (dateISO > todayISO()) { sfx('error'); toast(t('schedule.futureQuest'), 'warn', { icon: '⏳' }); return; }
  const day = scheduleData().log[dateISO] || (scheduleData().log[dateISO] = {});
  if (day[blockId]) {
    delete day[blockId];
    updateDayClear(dateISO);
    sfx('remove');
  } else {
    day[blockId] = { xp: 0, act: activity.id, t: activity.type, h: block.duration, s: block.start };
    sfx('coin');
    if (updateDayClear(dateISO) === 'gained') {
      setTimeout(() => {
        sfx('achieve'); confetti(30);
        toast(tHtml('schedule.perfectDayHtml', { weekday: dayNameInSentence(weekdayIndex(parseISO(dateISO))) }),
          'achieve', { icon: '🏆', html: true, duration: 4000 });
      }, 350);
    }
  }
  if (!Object.keys(day).length) delete scheduleData().log[dateISO];
  commit();
}

function togglePaint(activityId) {
  paintActivityId = paintActivityId === activityId ? null : activityId;
  if (paintActivityId) sfx('select');
  renderInventory();
  renderPaintBanner();
}

function loadSampleSchedule() {
  let placed = 0;
  for (const sample of SAMPLE_ACTIVITIES) {
    const name = t(`schedule.sample.${sample.key}`);
    let activity = scheduleData().activities.find(a => a.name === name);
    if (!activity) { activity = sampleActivity(sample); scheduleData().activities.push(activity); }
    for (const [day, start] of sample.slots) {
      if (isSlotFree(day, start, activity.dur)) {
        scheduleData().blocks.push({ id: uid(), activityId: activity.id, day, start, duration: activity.dur, note: '' });
        placed++;
      }
    }
  }
  sfx('place');
  commit();
  toast(t('schedule.sampleLoaded', { count: placed }), 'info', { icon: '🗺️' });
}

// ---------------------------------------------------------
// Drawing
// ---------------------------------------------------------
/** The side panel is hidden by default, to give the grid more room. It shows one tab at a time. */
let scheduleSideTab = 'quests'; // 'quests' or 'stats' (remembered while the app is open)
function applySchedulePanel() {
  const show = !!state.settings.scheduleSide;
  $('#view-schedule .schedule-layout').classList.toggle('side-hidden', !show);
  $('#sideToggle').classList.toggle('on', show);
  $$('#view-schedule [data-side-tab]').forEach(tab => {
    const active = tab.dataset.sideTab === scheduleSideTab;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  $$('#view-schedule [data-side-pane]').forEach(pane => { pane.hidden = pane.dataset.sidePane !== scheduleSideTab; });
}
function showScheduleSideTab(tab, focus = false) {
  scheduleSideTab = tab;
  applySchedulePanel();
  sfx('select');
  if (focus) $(`#view-schedule [data-side-tab="${tab}"]`).focus();
}

function renderSchedule() {
  applySchedulePanel();
  renderInventory();
  renderWeekLabel();
  renderScheduleGrid();
  renderPaintBanner();
  renderEmptyHint();
  renderTodayQuests();
  renderWeekStats();
}

/** Folded, the inventory is a strip of icons (every activity) and the grid takes the width. */
function renderInventory() {
  const folded = !isFoldOpen('schedule.inventory');
  $('#view-schedule .schedule-layout').classList.toggle('inv-folded', folded);
  const foldButton = $('#inventoryFold'), foldLabel = t(folded ? 'schedule.unfoldInventory' : 'schedule.foldInventory');
  foldButton.textContent = folded ? '▶' : '◀';
  foldButton.title = foldLabel;
  foldButton.setAttribute('aria-label', foldLabel);
  foldButton.setAttribute('aria-expanded', String(!folded));
  $$('#view-schedule .inventory .tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === inventoryTab);
    tab.innerHTML = tab.dataset.tab === 'subject'
      ? `${ico('sec-university', '📚')} ${t('schedule.tabSubjects')}`
      : `${ico('ui-personal', '🎒')} ${t('schedule.tabPersonal')}`;
  });
  const list = $('#activityList');
  const activities = folded
    ? ['subject', 'personal'].flatMap(type => scheduleData().activities.filter(a => a.type === type))
    : scheduleData().activities.filter(a => a.type === inventoryTab);
  if (!activities.length) { list.innerHTML = `<li class="empty">${t('schedule.emptyInventory')}</li>`; return; }
  list.innerHTML = '';
  for (const activity of activities) {
    const hours = scheduleData().blocks.filter(b => b.activityId === activity.id).reduce((sum, b) => sum + b.duration, 0);
    const item = el('li', 'item' + (paintActivityId === activity.id ? ' selected' : ''));
    item.draggable = true;
    item.dataset.id = activity.id;
    item.style.setProperty('--c', activity.color);
    item.title = folded ? `${activity.name}\n${t('schedule.itemHint')}` : t('schedule.itemHint');
    item.innerHTML = `
      <span class="item-icon">${iconHTML(activity.icon)}</span>
      <span class="item-text">
        <span class="item-name">${esc(activity.name)}</span>
        <span class="item-meta" title="${esc(t('schedule.hoursThisWeek', { count: hours }))}">${activity.dur}h</span>
      </span>
      <button class="item-edit" data-edit="${esc(activity.id)}" title="${esc(t('common.edit'))}" aria-label="${esc(t('common.editNamed', { name: activity.name }))}">${UI_ICON.edit}</button>`;
    list.append(item);
  }
}

function renderWeekLabel() {
  const dates = scheduleWeekDates();
  const first = dates[0], last = dates[6];
  $('#weekLabel').innerHTML = `
    <span class="wk">${t('schedule.weekNumber', { number: isoWeek(first) })}${scheduleWeekOffset === 0 ? ` · ${t('schedule.currentWeek')}` : ''}</span>
    <span class="wk-range">${formatShortDate(first)} – ${formatShortDate(last)} ${last.getFullYear()}</span>`;
  $('#todayBtn').disabled = scheduleWeekOffset === 0;
}

function renderScheduleGrid() {
  const grid = $('#grid');
  grid.innerHTML = '';
  const { startHour, endHour } = state.settings;
  grid.style.gridTemplateRows = `auto repeat(${endHour - startHour}, var(--row-h))`;
  const dates = scheduleWeekDates();
  const todayKey = todayISO();
  const now = new Date();

  const corner = el('div', 'corner', ico('sec-schedule', ''));
  corner.style.gridRow = 1; corner.style.gridColumn = 1;
  grid.append(corner);

  dates.forEach((date, i) => {
    const head = el('div', 'day-head' + (iso(date) === todayKey ? ' today' : ''), `<span>${dayName(i, 'short')}</span><small>${formatShortDate(date)}</small>`);
    head.style.gridRow = 1; head.style.gridColumn = i + 2;
    grid.append(head);
  });

  for (let hour = startHour; hour < endHour; hour++) {
    const row = hour - startHour + 2;
    const label = el('div', 'hour-label', formatHour(hour));
    label.style.gridRow = row; label.style.gridColumn = 1;
    grid.append(label);
    for (let day = 0; day < 7; day++) {
      const cell = el('div', 'cell' + (iso(dates[day]) === todayKey ? ' today-col' : ''));
      cell.dataset.day = day; cell.dataset.hour = hour;
      cell.style.gridRow = row; cell.style.gridColumn = day + 2;
      grid.append(cell);
    }
  }

  for (const block of scheduleData().blocks) {
    if (block.start < startHour || block.start + block.duration > endHour) continue;
    const activity = activityById(block.activityId);
    if (!activity) continue;
    const dateKey = iso(dates[block.day]);
    const done = isBlockDone(block.id, dateKey);
    const canCheck = dateKey <= todayKey;
    const isLive = dateKey === todayKey && now.getHours() >= block.start && now.getHours() < block.start + block.duration;
    const cls = ['block', `type-${activity.type}`, `dur-${block.duration}`];
    if (done) cls.push('done');
    else if (dateKey < todayKey) cls.push('missed');
    if (isLive && !done) cls.push('live');

    const blockEl = el('div', cls.join(' '));
    blockEl.draggable = true;
    blockEl.dataset.id = block.id;
    blockEl.dataset.date = dateKey;
    blockEl.style.gridRow = `${block.start - startHour + 2} / span ${block.duration}`;
    blockEl.style.gridColumn = block.day + 2;
    blockEl.style.setProperty('--c', activity.color);
    blockEl.title = `${activity.name} · ${formatBlockRange(block)}${block.note ? ' · ' + block.note : ''}\n${t('schedule.blockHint')}`;
    const check = canCheck
      ? `<button class="block-check" title="${esc(t(done ? 'common.uncheck' : 'schedule.markDone'))}" aria-label="${esc(t(done ? 'schedule.uncheckNamed' : 'schedule.completeNamed', { name: activity.name }))}">${done ? '✓' : ''}</button>`
      : '';
    blockEl.innerHTML = `
      <div class="block-name">${esc(activity.name)}</div>
      <div class="block-meta">
        <span class="block-icon">${iconHTML(activity.icon)}</span>
        <span class="block-time"><span class="t-long">${formatBlockRange(block)}</span><span class="t-short">${block.start}–${block.start + block.duration}h</span></span>
        ${check}
      </div>
      ${block.note ? `<div class="block-note">${esc(block.note)}</div>` : ''}
`;
    grid.append(blockEl);
  }

  if (scheduleWeekOffset === 0) {
    const hour = now.getHours();
    if (hour >= startHour && hour < endHour) {
      const line = el('div', 'now-line');
      line.style.gridRow = hour - startHour + 2;
      line.style.gridColumn = weekdayIndex(now) + 2;
      line.style.marginTop = `calc(var(--row-h) * ${(now.getMinutes() / 60).toFixed(3)})`;
      line.title = t('schedule.now');
      grid.append(line);
    }
  }

  dropGhost = el('div', 'ghost');
  grid.append(dropGhost);
}

function renderPaintBanner() {
  const banner = $('#paintBanner');
  const activity = paintActivityId && activityById(paintActivityId);
  const grid = $('#grid');
  grid.classList.toggle('painting', !!activity);
  if (!activity || currentView !== 'schedule') { if (!activity) paintActivityId = null; banner.classList.add('hidden'); return; }
  grid.style.setProperty('--paint', activity.color);
  banner.classList.remove('hidden');
  banner.title = t('schedule.paintHint', { name: activity.name, hours: activity.dur });
  banner.style.setProperty('--c', activity.color);
  banner.innerHTML = `${ico('ui-wand', '🖌️')}<span class="paint-ico">${iconHTML(activity.icon)}</span>
    <button class="paint-x" data-stop-paint title="${esc(t('schedule.stopPaint'))}" aria-label="${esc(t('schedule.stopPaintAria'))}">✕</button>`;
}

function renderEmptyHint() {
  const hint = $('#emptyHint');
  if (scheduleData().blocks.length) { hint.classList.add('hidden'); return; }
  hint.classList.remove('hidden');
  hint.innerHTML = `${ico('sec-schedule', '')} ${t('schedule.emptyHint')}
    <button class="btn btn-small btn-primary" data-sample>${t('schedule.loadSample')}</button>`;
}

function renderTodayQuests() {
  const now = new Date();
  const weekday = weekdayIndex(now), todayKey = iso(now);
  const { list, done: doneCount, cleared } = todayMissions();
  const percent = list.length ? doneCount / list.length * 100 : 0;
  $('#questHead').innerHTML = `
    <div class="quest-day">${dayName(weekday).toUpperCase()} ${formatShortDate(now).toUpperCase()}</div>
    <div class="pbar big"><div style="width:${percent}%"></div><span>${doneCount}/${list.length}</span></div>
    ${cleared ? `<div class="cleared">${ico('achievement-clear', '')} ${t('schedule.perfectDayBadge')}</div>` : ''}`;
  const questList = $('#questList');
  if (!list.length) { questList.innerHTML = `<li class="empty">${t('schedule.noQuests')}</li>`; return; }
  questList.innerHTML = list.map(block => {
    const activity = activityById(block.activityId);
    const done = isBlockDone(block.id, todayKey);
    const isLive = !done && now.getHours() >= block.start && now.getHours() < block.start + block.duration;
    return `<li class="quest${done ? ' done' : ''}${isLive ? ' live' : ''}" data-id="${esc(block.id)}" style="--c:${esc(activity.color)}">
      <button class="qcheck" data-check="${esc(block.id)}" title="${esc(t(done ? 'common.uncheck' : 'common.complete'))}" aria-label="${esc(t(done ? 'schedule.uncheckNamed' : 'schedule.completeNamed', { name: activity.name }))}">${done ? '✓' : ''}</button>
      <span class="q-icon">${iconHTML(activity.icon)}</span>
      <span class="q-text"><b>${esc(activity.name)}</b><small>${formatBlockRange(block)}${isLive ? ` · <em>${t('schedule.nowBadge')}</em>` : ''}</small></span>
    </li>`;
  }).join('');
}

function renderWeekStats() {
  const { startHour, endHour } = state.settings;
  const dates = scheduleWeekDates().map(iso);
  const planned = {}, done = {};
  let subjectHours = 0, personalHours = 0;
  for (const block of scheduleData().blocks) {
    const activity = activityById(block.activityId);
    if (!activity) continue;
    planned[activity.id] = (planned[activity.id] || 0) + block.duration;
    if (activity.type === 'subject') subjectHours += block.duration; else personalHours += block.duration;
  }
  for (const dateKey of dates) {
    const entries = scheduleData().log[dateKey];
    if (!entries) continue;
    for (const key in entries) {
      if (key.startsWith('__')) continue;
      done[entries[key].act] = (done[entries[key].act] || 0) + (entries[key].h || 0);
    }
  }
  const freeHours = Math.max(0, 7 * (endHour - startHour) - subjectHours - personalHours);
  const totalPlanned = subjectHours + personalHours;
  const totalDone = Object.keys(done).filter(id => activityById(id)).reduce((sum, id) => sum + done[id], 0);
  const rows = scheduleData().activities
    .filter(a => planned[a.id] || done[a.id])
    .sort((x, y) => (planned[y.id] || 0) - (planned[x.id] || 0))
    .map(activity => {
      const plannedHours = planned[activity.id] || 0, doneHours = done[activity.id] || 0;
      const percent = plannedHours ? Math.min(100, doneHours / plannedHours * 100) : 100;
      return `<div class="stat-row">
        <div class="stat-head"><span>${iconHTML(activity.icon)} ${esc(activity.name)}</span><span>${doneHours}/${plannedHours}h</span></div>
        <div class="pbar" style="--c:${esc(activity.color)}"><div style="width:${percent}%"></div></div>
      </div>`;
    }).join('');
  $('#stats').innerHTML = `
    <div class="chips">
      <span class="chip" title="${esc(t('schedule.subjectHoursTitle'))}">${ico('sec-university', '')} ${subjectHours}h</span>
      <span class="chip" title="${esc(t('schedule.personalHoursTitle'))}">${ico('ui-personal', '')} ${personalHours}h</span>
      <span class="chip" title="${esc(t('schedule.freeHoursTitle'))}">${ico('ui-night', '')} ${t('schedule.freeHours', { count: freeHours })}</span>
    </div>
    <div class="week-progress">${t('schedule.weekProgress', { done: totalDone, planned: totalPlanned })}</div>
    <div class="pbar" style="margin-bottom:14px"><div style="width:${totalPlanned ? Math.min(100, totalDone / totalPlanned * 100) : 0}%"></div></div>
    ${rows || `<p class="empty">${t('schedule.noBlocksWeek')}</p>`}`;
}

// ---------------------------------------------------------
// Windows: block and activity
// ---------------------------------------------------------
const durationOptions = () => [1, 2, 3].map(n => [n, t('schedule.hours', { count: n })]);

function openBlockModal({ blockId, day = 0, hour }) {
  if (!scheduleData().activities.length) {
    toast(t('schedule.createItemFirst'), 'warn');
    openActivityModal();
    return;
  }
  const existing = blockId ? blockById(blockId) : null;
  const { startHour, endHour } = state.settings;
  const fallbackActivity = (paintActivityId && activityById(paintActivityId))
    || scheduleData().activities.find(a => a.type === inventoryTab) || scheduleData().activities[0];
  const draft = existing ? { ...existing } : { activityId: fallbackActivity.id, day, start: hour ?? startHour, duration: fallbackActivity.dur || 1, note: '' };
  let duration = draft.duration;
  const dates = scheduleWeekDates();
  const todayKey = todayISO();

  const activityGroups = ['subject', 'personal'].map(type => {
    const activities = scheduleData().activities.filter(a => a.type === type);
    if (!activities.length) return '';
    return `<optgroup label="${esc(t(type === 'subject' ? 'schedule.tabSubjects' : 'schedule.tabPersonal'))}">${activities.map(a =>
      `<option value="${esc(a.id)}"${a.id === draft.activityId ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</optgroup>`;
  }).join('');
  const dayOptions = dayNames().map((name, i) => `<option value="${i}"${i === draft.day ? ' selected' : ''}>${name} (${formatShortDate(dates[i])})</option>`).join('');
  const hourOptions = range(startHour, endHour).map(h => `<option value="${h}"${h === draft.start ? ' selected' : ''}>${formatHour(h)}</option>`).join('');

  let completeHtml = '';
  if (existing) {
    const blockDate = dates[existing.day];
    if (iso(blockDate) <= todayKey) {
      const done = isBlockDone(existing.id, iso(blockDate));
      const label = t(done ? 'common.uncheck' : 'common.complete');
      completeHtml = `<button type="button" class="btn ${done ? '' : 'btn-success'} full" data-complete title="${esc(`${label} (${formatShortDate(blockDate)})`)}" aria-label="${esc(label)}">
        ${done ? '↩' : '✓'}</button>`;
    } else {
      completeHtml = `<p class="muted small">${ico('ui-lock', '')} ${t('schedule.lockedUntil', { weekday: dayNameInSentence(existing.day), date: formatShortDate(blockDate) })}</p>`;
    }
  }

  openModal({
    title: t(existing ? 'schedule.editBlock' : 'schedule.newBlock'),
    body: `
      <form id="blockForm" autocomplete="off">
        <label class="field"><span>${t('schedule.activity')}</span><select name="activity">${activityGroups}</select></label>
        <div class="row2">
          <label class="field"><span>${t('schedule.day')}</span><select name="day">${dayOptions}</select></label>
          <label class="field"><span>${t('schedule.start')}</span><select name="start">${hourOptions}</select></label>
        </div>
        <div class="field"><span>${t('schedule.duration')}</span>${segHTML('dur', durationOptions())}</div>
        <label class="field"><span>${t('common.noteOptional')}</span>
          <input type="text" name="note" maxlength="60" placeholder="${esc(t('schedule.notePlaceholder'))}" value="${esc(draft.note || '')}"></label>
        <div class="field"><span>${t(existing ? 'schedule.copyAlso' : 'schedule.repeatAlso')}</span>
          <div class="days-pick">${dayNames('short').map((name, i) => `<label><input type="checkbox" name="copy" value="${i}"><span>${name}</span></label>`).join('')}</div>
        </div>
        ${completeHtml}
      </form>`,
    footer: `${existing ? `<button class="btn btn-danger" data-delete>${UI_ICON.del} ${t('common.deleteUpper')}</button>` : ''}
      <span class="spacer"></span>
      <button class="btn" data-close>${t('common.cancel')}</button>
      <button class="btn btn-primary" data-save>${t(existing ? 'common.save' : 'schedule.place')}</button>`,
    onMount: modal => {
      const form = $('#blockForm', modal);
      const syncCopyDays = () => {
        $$('input[name=copy]', form).forEach(checkbox => {
          const sameDay = +checkbox.value === +form.day.value;
          checkbox.disabled = sameDay;
          if (sameDay) checkbox.checked = false;
        });
      };
      const syncDuration = bindSeg(modal, 'dur', () => duration, value => { duration = +value; });
      form.activity.addEventListener('change', () => {
        if (!existing) { duration = activityById(form.activity.value).dur || 1; syncDuration(); }
      });
      form.day.addEventListener('change', syncCopyDays);
      syncCopyDays();

      const saveBlock = () => {
        const activityId = form.activity.value, chosenDay = +form.day.value, start = +form.start.value;
        const note = form.note.value.trim().slice(0, 60);
        if (!isSlotFree(chosenDay, start, duration, existing && existing.id)) {
          sfx('error');
          toast(t(start + duration > endHour ? 'schedule.outOfRange' : 'schedule.clash'), 'warn');
          return;
        }
        if (existing) Object.assign(existing, { activityId, day: chosenDay, start, duration, note });
        else scheduleData().blocks.push({ id: uid(), activityId, day: chosenDay, start, duration, note });
        let copied = 0, skipped = 0;
        $$('input[name=copy]:checked', form).forEach(checkbox => {
          const copyDay = +checkbox.value;
          if (copyDay === chosenDay) return;
          if (isSlotFree(copyDay, start, duration)) { scheduleData().blocks.push({ id: uid(), activityId, day: copyDay, start, duration, note }); copied++; }
          else skipped++;
        });
        sfx('place');
        closeModal();
        commit();
        if (copied) toast(t('schedule.copiedTo', { count: copied }), 'info', { icon: '📋' });
        if (skipped) toast(t('schedule.copiesSkipped', { count: skipped }), 'warn');
      };
      $('[data-save]', modal).onclick = saveBlock;
      form.addEventListener('submit', e => { e.preventDefault(); saveBlock(); });

      if (existing) {
        $('[data-delete]', modal).onclick = () => { closeModal(); deleteBlock(existing.id); };
        const completeButton = $('[data-complete]', modal);
        if (completeButton) completeButton.onclick = () => { closeModal(); toggleBlockDone(existing.id, iso(dates[existing.day]), null); };
      }
    },
  });
}

function openActivityModal(activityId) {
  const existing = activityId ? activityById(activityId) : null;
  const initialType = existing ? existing.type : inventoryTab;
  const draft = existing ? { ...existing } : {
    name: '', type: initialType, icon: DEFAULT_ACTIVITY_ICON[initialType],
    color: pickOf(PASTELS), dur: initialType === 'subject' ? 2 : 1,
  };

  openModal({
    title: t(existing ? 'schedule.editItem' : 'schedule.newItemTitle'),
    body: `
      <form id="actForm" autocomplete="off">
        <div class="act-preview" data-preview></div>
        <label class="field"><span>${t('common.nameLabel')}</span>
          <input type="text" name="name" maxlength="24" placeholder="${esc(t('schedule.itemNamePlaceholder'))}" value="${esc(draft.name)}"></label>
        <div class="field"><span>${t('common.typeLabel')}</span>${segHTML('type', [['subject', `${ico('sec-university', '📚')} ${t('schedule.subject')}`], ['personal', `${ico('ui-personal', '🎒')} ${t('schedule.personal')}`]])}</div>
        <div class="field"><span>${t('common.iconLabel')}</span>
          <div class="icon-grid">${categoryPickerHTML(draft.icon)}</div></div>
        <div class="field"><span>${t('common.colorLabel')}</span>${swatchesHTML()}</div>
        <div class="field"><span>${t('schedule.defaultDuration')}</span>${segHTML('dur', durationOptions())}</div>
      </form>`,
    footer: `${existing ? `<button class="btn btn-danger" data-delete>${UI_ICON.del} ${t('common.deleteUpper')}</button>` : ''}
      <span class="spacer"></span>
      <button class="btn" data-close>${t('common.cancel')}</button>
      <button class="btn btn-primary" data-save>${t(existing ? 'common.save' : 'common.create')}</button>`,
    onMount: modal => {
      const form = $('#actForm', modal);
      const preview = () => {
        $('[data-preview]', modal).innerHTML = `
          <div class="item" style="--c:${esc(draft.color)}">
            <span class="item-icon">${iconHTML(draft.icon)}</span>
            <span class="item-text">
              <span class="item-name">${esc(form.name.value.trim() || t('common.unnamed'))}</span>
              <span class="item-meta">${typeLabel(draft.type)} · ${draft.dur}h</span>
            </span>
          </div>`;
        $$('[data-icon]', modal).forEach(b => b.classList.toggle('on', b.dataset.icon === draft.icon));
        $$('[data-color]', modal).forEach(b => b.classList.toggle('on', b.dataset.color === draft.color));
      };
      bindSeg(modal, 'type', () => draft.type, value => { draft.type = value; preview(); });
      bindSeg(modal, 'dur', () => draft.dur, value => { draft.dur = +value; preview(); });
      $$('[data-icon]', modal).forEach(b => { b.onclick = () => { draft.icon = b.dataset.icon; preview(); }; });
      $$('[data-color]', modal).forEach(b => { b.onclick = () => { draft.color = b.dataset.color; preview(); }; });
      form.name.addEventListener('input', preview);
      preview();

      const saveActivity = () => {
        const name = form.name.value.trim().slice(0, 24);
        if (!name) { sfx('error'); toast(t('schedule.itemNameRequired'), 'warn'); form.name.focus(); return; }
        if (existing) Object.assign(existing, { name, type: draft.type, icon: draft.icon, color: draft.color, dur: draft.dur });
        else {
          const activity = { id: uid(), name, type: draft.type, icon: draft.icon, color: draft.color, dur: draft.dur };
          scheduleData().activities.push(activity);
          paintActivityId = activity.id; // ready to be placed
        }
        inventoryTab = draft.type;
        sfx('place');
        closeModal();
        commit();
        toast(existing ? t('schedule.itemUpdated') : t('schedule.itemJoined', { name }), 'info', { icon: iconHTML(draft.icon) });
      };
      $('[data-save]', modal).onclick = saveActivity;
      form.addEventListener('submit', e => { e.preventDefault(); saveActivity(); });

      if (existing) {
        $('[data-delete]', modal).onclick = () => {
          const blockCount = scheduleData().blocks.filter(b => b.activityId === existing.id).length;
          const message = blockCount
            ? tHtml('schedule.deleteItemWithBlocksHtml', { name: existing.name, count: blockCount })
            : tHtml('schedule.deleteItemHtml', { name: existing.name });
          confirmModal(message, () => {
            closeModal(); // the activity window: what it edits is gone
            scheduleData().activities = scheduleData().activities.filter(a => a.id !== existing.id);
            scheduleData().blocks = scheduleData().blocks.filter(b => b.activityId !== existing.id);
            if (paintActivityId === existing.id) paintActivityId = null;
            sfx('remove');
            commit();
          }, undefined, { stack: true });
        };
      }
    },
  });
}

// ---------------------------------------------------------
// Drag and drop
// ---------------------------------------------------------
const cellAtPoint = (x, y) => document.elementsFromPoint(x, y).find(n => n.classList && n.classList.contains('cell')) || null;
function showDropGhost(day, start, duration, fits, label) {
  if (!dropGhost) return;
  const { startHour, endHour } = state.settings;
  const from = Math.max(startHour, start), to = Math.min(endHour, start + duration);
  if (to <= from) { hideDropGhost(); return; }
  dropGhost.style.gridRow = `${from - startHour + 2} / span ${to - from}`;
  dropGhost.style.gridColumn = day + 2;
  dropGhost.textContent = fits ? label : t('schedule.noRoom');
  dropGhost.classList.add('show');
  dropGhost.classList.toggle('bad', !fits);
}
function hideDropGhost() { if (dropGhost) dropGhost.classList.remove('show', 'bad'); }
function endScheduleDrag() {
  scheduleDrag = null;
  hideDropGhost();
  $('#trash').classList.remove('show', 'hot');
  $$('.drag-src').forEach(x => x.classList.remove('drag-src'));
}
/** Whether the dragged block fits there (a new one may shrink to the longest duration that fits). */
function resolveDrop(day, start) {
  if (scheduleDrag.kind === 'move') return { ok: isSlotFree(day, start, scheduleDrag.duration, scheduleDrag.blockId), duration: scheduleDrag.duration };
  if (isSlotFree(day, start, scheduleDrag.duration)) return { ok: true, duration: scheduleDrag.duration };
  const fitting = [2, 1].find(d => d < scheduleDrag.duration && isSlotFree(day, start, d));
  if (fitting) return { ok: true, duration: fitting };
  return { ok: false, duration: scheduleDrag.duration };
}

function bindSchedule() {
  const grid = $('#grid');

  $('#prevWeek').onclick = () => { scheduleWeekOffset--; renderSchedule(); };
  $('#nextWeek').onclick = () => { scheduleWeekOffset++; renderSchedule(); };
  $('#todayBtn').onclick = () => { scheduleWeekOffset = 0; renderSchedule(); };
  $('#sideToggle').onclick = () => {
    state.settings.scheduleSide = !state.settings.scheduleSide;
    applySchedulePanel(); save(); sfx('select');
  };
  const sideTabs = $('#view-schedule .side-tabs');
  sideTabs.addEventListener('click', e => { const tab = e.target.closest('[data-side-tab]'); if (tab) showScheduleSideTab(tab.dataset.sideTab); });
  sideTabs.addEventListener('keydown', e => { // arrows move between the two tabs
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    showScheduleSideTab(scheduleSideTab === 'quests' ? 'stats' : 'quests', true);
  });
  $('#inventoryFold').onclick = () => {
    state.settings.folds['schedule.inventory'] = !isFoldOpen('schedule.inventory');
    save(); sfx('select'); renderInventory();
  };

  $$('#view-schedule .inventory .tab').forEach(tab => { tab.onclick = () => { inventoryTab = tab.dataset.tab; renderInventory(); }; });
  $('#newActivityBtn').onclick = () => openActivityModal();
  const list = $('#activityList');
  list.addEventListener('click', e => {
    const editButton = e.target.closest('[data-edit]');
    if (editButton) { openActivityModal(editButton.dataset.edit); return; }
    const item = e.target.closest('.item');
    if (item) togglePaint(item.dataset.id);
  });
  list.addEventListener('dragstart', e => {
    const item = e.target.closest('.item');
    if (!item) return;
    const activity = activityById(item.dataset.id);
    scheduleDrag = { kind: 'new', activityId: activity.id, duration: activity.dur || 1, grab: 0, label: activity.name };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', activity.name);
  });

  $('#paintBanner').addEventListener('click', e => { if (e.target.closest('[data-stop-paint]')) togglePaint(paintActivityId); });
  $('#emptyHint').addEventListener('click', e => { if (e.target.closest('[data-sample]')) loadSampleSchedule(); });

  grid.addEventListener('click', e => {
    const checkButton = e.target.closest('.block-check');
    if (checkButton) {
      const blockEl = checkButton.closest('.block');
      toggleBlockDone(blockEl.dataset.id, blockEl.dataset.date, checkButton);
      return;
    }
    const blockEl = e.target.closest('.block');
    if (blockEl) { openBlockModal({ blockId: blockEl.dataset.id }); return; }
    const cell = e.target.closest('.cell');
    if (cell) {
      const day = +cell.dataset.day, hour = +cell.dataset.hour;
      if (paintActivityId) placeActivity(paintActivityId, day, hour);
      else openBlockModal({ day, hour });
    }
  });

  grid.addEventListener('dragstart', e => {
    const blockEl = e.target.closest('.block');
    if (!blockEl) return;
    const block = blockById(blockEl.dataset.id);
    const activity = activityById(block.activityId);
    const rect = blockEl.getBoundingClientRect();
    // Which hour of the block was grabbed, so it lands where the pointer is
    const grab = clampNumber(Math.floor((e.clientY - rect.top) / (rect.height / block.duration)), 0, block.duration - 1);
    scheduleDrag = { kind: 'move', blockId: block.id, duration: block.duration, grab, label: activity.name };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', block.id);
    requestAnimationFrame(() => { blockEl.classList.add('drag-src'); $('#trash').classList.add('show'); });
  });
  grid.addEventListener('dragover', e => {
    if (!scheduleDrag) return;
    e.preventDefault();
    const cell = cellAtPoint(e.clientX, e.clientY);
    if (!cell) { hideDropGhost(); return; }
    const day = +cell.dataset.day;
    const start = +cell.dataset.hour - scheduleDrag.grab;
    const fit = resolveDrop(day, start);
    showDropGhost(day, start, fit.duration, fit.ok, scheduleDrag.label);
    e.dataTransfer.dropEffect = fit.ok ? (scheduleDrag.kind === 'move' ? 'move' : 'copy') : 'none';
  });
  grid.addEventListener('dragleave', e => { if (!grid.contains(e.relatedTarget)) hideDropGhost(); });
  grid.addEventListener('drop', e => {
    if (!scheduleDrag) return;
    e.preventDefault();
    const cell = cellAtPoint(e.clientX, e.clientY);
    const dragged = scheduleDrag;
    endScheduleDrag();
    if (!cell) return;
    const day = +cell.dataset.day;
    const start = +cell.dataset.hour - dragged.grab;
    if (dragged.kind === 'move') moveBlock(dragged.blockId, day, start);
    else placeActivity(dragged.activityId, day, start);
  });
  document.addEventListener('dragend', endScheduleDrag);

  const trash = $('#trash');
  trash.addEventListener('dragover', e => {
    if (!scheduleDrag || scheduleDrag.kind !== 'move') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    trash.classList.add('hot');
  });
  trash.addEventListener('dragleave', () => trash.classList.remove('hot'));
  trash.addEventListener('drop', e => {
    e.preventDefault();
    if (!scheduleDrag || scheduleDrag.kind !== 'move') return;
    const id = scheduleDrag.blockId;
    endScheduleDrag();
    deleteBlock(id);
  });

  $('#questList').addEventListener('click', e => {
    const checkButton = e.target.closest('[data-check]');
    if (checkButton) { toggleBlockDone(checkButton.dataset.check, todayISO(), checkButton); return; }
    const quest = e.target.closest('.quest');
    if (quest) { scheduleWeekOffset = 0; renderSchedule(); openBlockModal({ blockId: quest.dataset.id }); }
  });
}

registerView('schedule', {
  render: renderSchedule,
  bind: bindSchedule,
  tick: () => { renderScheduleGrid(); renderPaintBanner(); renderTodayQuests(); },
  onEscape: () => { if (paintActivityId) togglePaint(paintActivityId); },
  reset: () => { scheduleWeekOffset = 0; paintActivityId = null; inventoryTab = 'subject'; },
});
