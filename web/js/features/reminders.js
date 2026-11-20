/* Reminders: Windows notifications for blocks, birthdays, to-dos, deadlines, charges and summaries. */
'use strict';

/** Windows notification (desktop app only). The "·" separators become a plain " – ". */
function notifyWin(title, message) {
  if (desktopApi && desktopApi.notify) desktopApi.notify(plainSeparators(title), plainSeparators(message)).catch(() => {});
}
function remindOnce(key, title, message) {
  const today = todayISO();
  if (state.reminders.day !== today) state.reminders = { day: today, sent: [], log: [], seen: 0 };
  if (state.reminders.sent.includes(key)) return;
  state.reminders.sent.push(key);
  // Today's notices stay in the backpack (a notification disappears; the list does not)
  state.reminders.log.push({ key, title: String(title).slice(0, 80), message: String(message || '').slice(0, 160), time: `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}` });
  save();
  appEmit('reminder'); // features/backpack.js counts the unseen ones on its button
  if (desktopApi && desktopApi.notify) notifyWin(title, message);
  else toast(`<b>${esc(title)}</b><br>${esc(message)}`, 'info', { icon: '🔔', html: true, duration: 6000 });
}

function checkReminders() {
  if (!state || !state.settings.reminders) return;
  const now = new Date(), today = iso(now), weekday = weekdayIndex(now), hour = now.getHours();
  const minutes = hour * 60 + now.getMinutes(), lead = state.settings.remindMin;
  for (const block of state.schedule.blocks) {
    if (block.day !== weekday || isBlockDone(block.id, today)) continue;
    const start = block.start * 60;
    if (minutes >= start - lead && minutes <= start + 1) {
      const activity = activityById(block.activityId);
      if (activity) remindOnce(`b:${block.id}`, lead ? t('reminders.blockSoon', { min: lead, name: activity.name }) : t('reminders.blockNow', { name: activity.name }), formatBlockRange(block));
    }
  }
  const birthdaysOn = d => state.birthdays.filter(x => x.day === d.getDate() && x.month === d.getMonth() + 1);
  if (hour >= 8) birthdaysOn(now).forEach(x => remindOnce(`bd:${x.id}`, t('reminders.birthdayToday', { name: x.name }), t('reminders.birthdayTodayBody')));
  if (hour >= 18) birthdaysOn(addDays(now, 1)).forEach(x => remindOnce(`bd1:${x.id}`, t('reminders.birthdayTomorrow', { name: x.name }), t('reminders.birthdayTomorrowBody')));
  if (hour >= 8) state.lists.forEach(list => list.kind === 'todo' && list.items.forEach(item => {
    if (!item.done && item.due === today) remindOnce(`td:${item.id}`, t('reminders.todoToday'), item.text);
  }));
  // Subscription charges: two days before (time to cancel) and the morning of the day
  const chargePrice = item => (item.price != null ? formatMoney(item.price, item.currency) : '');
  if (hour >= 8) chargesOn(today).forEach(({ item }) => remindOnce(`ch0:${item.id}`, t('reminders.chargeToday', { name: item.text }), chargePrice(item)));
  if (hour >= 8) chargesOn(iso(addDays(now, 2))).forEach(({ item }) => remindOnce(`ch2:${item.id}`, t('reminders.chargeSoon', { name: item.text }), chargePrice(item)));
  state.university.events.forEach(event => {
    if (event.done || !event.date) return; // delivered, or no date
    const days = daysUntil(event.date);
    if (days === 0 && hour >= 8) remindOnce(`ev0:${event.id}`, t('reminders.deadlineToday', { name: event.name }), t('reminders.deadlineTodayBody'));
    if (days === 1 && hour >= 18) remindOnce(`ev1:${event.id}`, t('reminders.deadlineTomorrow', { name: event.name }), t('reminders.deadlineTomorrowBody'));
  });
  // Workflow: paid apps with no finished job. On Sunday evening, in 30 days; two days before a charge, in the paid period
  if (weekday === 6 && hour >= 18) {
    const idle = idlePaidTools(daysAgoISO(WORKFLOW_WINDOW_DAYS));
    if (idle.length) remindOnce('wf-week', t('reminders.toolsIdle'), t('reminders.toolsIdleBody', { names: idle.map(x => x.name).join(', ') }));
  }
  if (hour >= 8) idleBeforeCharge().forEach(({ tool, charge }) => {
    remindOnce(`wfch:${tool.id}`, t('reminders.toolIdleCharge', { name: tool.name }), t('reminders.toolIdleChargeBody', { when: formatRelativeDays(daysUntil(charge)) }));
  });
  // A copy of the game once a month: the app keeps backups, but a copy elsewhere is safer
  const lastExport = state.settings.lastExport;
  if (hour >= 10 && (!lastExport || daysUntil(lastExport) <= -30) && totalXP() > 0) remindOnce('export', t('reminders.export'), t('reminders.exportBody'));
  if (weekday === 6 && hour >= 19 && !state.chronicles[iso(mondayOf(now))]) {
    remindOnce('chron', t('reminders.chronicle'), t('reminders.chronicleBody'));
  }
  // Morning summary
  if (state.settings.morning && hour >= 7 && hour < 12) {
    const missions = state.schedule.blocks.filter(b => b.day === weekday).length;
    const todos = state.lists.reduce((n, l) => n + (l.kind === 'todo' ? l.items.filter(i => !i.done && i.due && i.due <= today).length : 0), 0);
    const birthdays = state.birthdays.filter(x => x.day === now.getDate() && x.month === now.getMonth() + 1).map(x => x.name);
    const boss = state.university.events.filter(e => e.hp && !e.won && !e.done && e.date && daysUntil(e.date) >= 0 && daysUntil(e.date) <= 3)[0];
    const parts = [
      missions ? t('reminders.morning.missions', { count: missions }) : t('reminders.morning.freeDay'),
      todos ? t('reminders.morning.todos', { count: todos }) : '',
      birthdays.length ? t('reminders.morning.birthdays', { names: birthdays.join(', ') }) : '',
      boss ? t('reminders.morning.boss', { name: boss.name }) : '',
    ].filter(Boolean);
    remindOnce('morning', state.profile.name ? t('reminders.morning.title', { name: state.profile.name }) : t('reminders.morning.titleNoName'), parts.join(' · '));
  }
  // Habits still missing at night
  if (state.settings.habitNudge && hour >= 20 && hour < 23 && state.habits.list.length) {
    const done = state.habits.log[today] || [];
    const missing = habitsDueOn(new Date()).filter(x => !done.includes(x.id));
    if (missing.length) {
      const names = missing.slice(0, 4).map(x => x.name).join(', ') + (missing.length > 4 ? '…' : '');
      remindOnce('habits', t('reminders.habits'), t('reminders.habitsBody', { count: missing.length, names }));
    }
  }
}

function remindersBoot() {
  setTimeout(checkReminders, 4000);
  setInterval(checkReminders, 30000);
}
