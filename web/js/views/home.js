/* Home (the cover): your path, today's things and the folds (challenges, goals, quote of the day). */
'use strict';

/** One reflection per day, the same all day long. */
function quoteOfTheDay() {
  const all = [...state.reflections.es, ...state.reflections.en];
  return all.length ? all[hashString(todayISO()) % all.length] : null;
}

/** Zone 1: the realms as a short track, with the progress towards the next one. */
function homePathHTML() {
  const L = levelInfo(totalXP()), realm = realmInfo(L.level), current = realm.index, next = REALMS[current + 1];
  const currentMin = REALMS[current].minLevel;
  const percent = next ? Math.min(100, ((L.level - currentMin) + L.cur / L.need) / (next.minLevel - currentMin) * 100) : 100;
  const track = REALMS.map((r, i) => {
    const status = i < current ? 'past' : i === current ? 'here' : 'future';
    const node = `<i class="hp-node ${status}" style="--rc:${r.colors[0]}" title="${esc(t('profileCard.realmFrom', { realm: realmName(i), level: r.minLevel }))}"></i>`;
    if (!i) return node;
    const fill = i <= current ? 100 : i === current + 1 ? percent : 0;
    return `<i class="hp-seg"><i style="width:${fill.toFixed(1)}%"></i></i>${node}`;
  }).join('');
  return `<span class="home-path">
    <span class="hp-head"><b>${t('home.yourPath')}</b><span>${esc(t('home.stage', { stage: realm.stage }))}</span></span>
    <span class="hp-track">${track}</span>
    <small class="hp-next">${esc(next ? t('home.toNextRealm', { percent: Math.floor(percent), realm: realmName(current + 1), level: next.minLevel }) : t('home.lastRealm'))}</small>
  </span>`;
}

/** Zone 2: the quest happening now (with its check) and the next one. */
function nowNextHTML() {
  const { list } = todayMissions(), now = new Date(), hour = now.getHours(), todayKey = iso(now);
  const live = list.find(block => hour >= block.start && hour < block.start + block.duration);
  const next = list.find(block => block.start > hour);
  if (!live && !next) return '';
  const row = (labelKey, block, withCheck) => {
    const activity = activityById(block.activityId), done = isBlockDone(block.id, todayKey);
    return `<div class="nn-row${done ? ' done' : ''}" style="--c:${esc(activity.color)}">
      <small class="nn-label">${t(labelKey)}</small>
      <span class="q-icon">${iconHTML(activity.icon)}</span>
      <b>${esc(activity.name)}</b><span class="nn-time">${formatBlockRange(block)}</span>
      ${withCheck ? `<button class="qcheck" data-nn-check="${esc(block.id)}" aria-label="${esc(t(done ? 'schedule.uncheckNamed' : 'schedule.completeNamed', { name: activity.name }))}">${done ? '✓' : ''}</button>` : ''}
    </div>`;
  };
  return `<div class="now-next">${live ? row('home.now', live, true) : ''}${next ? row('home.next', next, false) : ''}</div>`;
}

function renderHome() {
  const profile = state.profile;
  const now = new Date(), todayKey = iso(now), weekday = weekdayIndex(now);
  const missions = todayMissions();
  const habitsDue = habitsDueOn(now), habitsChecked = state.habits.log[todayKey] || [];
  const habitsToday = habitsDue.length ? `${habitsDue.filter(h => habitsChecked.includes(h.id)).length}/${habitsDue.length}` : t('home.dayOff');
  const workoutDay = state.workout.days[weekday], workoutDone = !!state.workout.log[todayKey];
  const nextBirthdayEntry = birthdaysSorted().find(x => x.next);
  const nextEvent = upcomingEvents()[0];
  const quote = quoteOfTheDay();
  const journal = state.journal[todayKey];
  const journalLine = chroniclePending() ? t('home.chroniclePending')
    : journal ? (journal.mood ? MOODS[journal.mood].name : t('home.journalWritten')) : t('home.howIsYourDay');
  const miniCard = (section, color, icon, title, detail) =>
    `<button class="mini" data-go="${section}" style="--rc:${color}"><span class="mini-ico">${icon}</span><span class="mini-text"><b>${title}</b><small>${detail}</small></span></button>`;
  const goalsActive = profile.projects.filter(goal => !goal.done).length;

  $('#view-home').innerHTML = `
  <div class="spread">
    <div class="page page-left">
      <div class="welcome-wrap">
      <button class="welcome-pet" data-pet title="${esc(t('home.petTitle', { name: state.pet.name }))}" aria-label="${esc(t('home.petAria'))}">${petHTML(88)}</button>
      <button class="welcome" data-open-profile title="${esc(t('home.pathTitle'))}">
        <span class="welcome-row">
          <span class="welcome-photo">${photoHTML()}</span>
          <span class="welcome-text">
            <span class="welcome-hi">${esc(profile.name ? t('home.greeting', { name: profile.name }) : t('home.greetingNoName'))}</span>
            ${profile.motto ? `<span class="motto">“${esc(profile.motto)}”</span>` : ''}
          </span>
        </span>
        ${homePathHTML()}
      </button>
      </div>

      <section class="card home-today">
        <h2 class="card-title">${t('home.todayTitle', { weekday: dayName(weekday).toUpperCase(), date: formatShortDate(now).toUpperCase() })}</h2>
        ${nowNextHTML()}
        <div class="today-grid">
          ${miniCard('schedule', '#a9cbe8', ico('sec-schedule', '🗓️'), t('home.quests'), missions.list.length ? `${missions.done}/${missions.list.length}` : t('home.dayOff'))}
          ${isSectionVisible('habits') ? miniCard('habits', '#a8d8a0', ico('sec-habits', '🌱'), t('sections.habits'), habitsToday) : ''}
          ${isSectionVisible('workout') ? miniCard('workout', '#f6b98a', ico('sec-workout', '🏋️'), t('sections.workout'), workoutDone ? '✓' : esc(workoutDay.focus || t('home.rest'))) : ''}
          ${isSectionVisible('birthdays') ? miniCard('birthdays', '#efb3d0', ico('sec-birthdays', '🎂'), t('sections.birthdays'),
            nextBirthdayEntry ? `${esc(nextBirthdayEntry.birthday.name)} · ${formatRelativeDays(nextBirthdayEntry.next.days)}` : t('home.noDates')) : ''}
          ${miniCard('calendar', '#9fd9c9', journal && journal.mood ? moodIco(journal.mood) : ico('sec-calendar', '📅'), t('home.journal'), journalLine)}
          ${isSectionVisible('university') ? miniCard('university', '#b8b4ec', nextEvent && nextEvent.hp && !nextEvent.won ? ico(bossTypeOf(nextEvent).icon, '⚔') : ico('today-deadlines', '📅'), t('home.deadlines'),
            nextEvent ? `${esc(nextEvent.name)} · ${formatRelativeDays(daysUntil(nextEvent.date))}` : `${pendingDeliverables().length || '—'}`) : ''}
        </div>
      </section>
    </div>

    <div class="page page-right">
      ${focusCardHTML()}
      <ul class="challenges home-quest">${dailyQuestHTML()}</ul>
      ${challengesCardHTML()}
      ${foldHTML('home.goals', t('home.goals'), goalsActive ? t('home.goalsActive', { count: goalsActive }) : '', () => `
        <ul class="projects goals">
          ${profile.projects.map(goalHTML).join('') || `<li class="empty">${t('home.noGoals')}</li>`}
        </ul>
        <div class="fold-actions"><button class="btn btn-small" data-add-project>${t('home.addGoal')}</button></div>`)}
      ${isSectionVisible('quotes') ? foldHTML('home.quote', t('home.quoteOfTheDay'), '',
        () => `<p class="fold-quote">${quote ? `“${esc(quote.text)}”` : t('home.addReflections')}</p>`) : ''}
    </div>
  </div>`;
}

// ---------------------------------------------------------
// Goals with milestones (and optionally measured by hours, pages or habit checks)
// ---------------------------------------------------------
const goalUnit = kind => t(`home.goalUnits.${kind}`);
/** Current value of a measured goal: hours of an activity, pages of a book or times a habit was checked. */
function goalMetric(link) {
  if (link.kind === 'act') {
    let hours = 0;
    for (const day in state.schedule.log) for (const key in state.schedule.log[day]) {
      const entry = state.schedule.log[day][key];
      if (!key.startsWith('__') && entry.act === link.id) hours += entry.h || 0;
    }
    return hours;
  }
  if (link.kind === 'book') {
    const book = state.books.find(b => b.id === link.id);
    return book ? (book.done ? (book.pages || link.target) : book.progress || 0) : 0;
  }
  let count = 0;
  for (const day in state.habits.log) if (state.habits.log[day].includes(link.id)) count++;
  return count;
}
function goalProgress(goal) {
  if (goal.link) {
    const value = goalMetric(goal.link);
    return { pct: Math.min(100, value / goal.link.target * 100), label: `${formatNumber(value)}/${formatNumber(goal.link.target)} ${goalUnit(goal.link.kind)}` };
  }
  if (goal.milestones.length) {
    const done = goal.milestones.filter(m => m.done).length;
    return { pct: done / goal.milestones.length * 100, label: t('home.milestonesProgress', { done, count: goal.milestones.length }) };
  }
  return null;
}
/** Measured goals complete themselves when the target is reached (only once). */
function checkGoals() {
  for (const goal of state.profile.projects) {
    if (!goal.link || goal.done || goal.auto || goalMetric(goal.link) < goal.link.target) continue;
    goal.done = true; goal.auto = true;
    setTimeout(() => {
      sfx('achieve'); confetti(40);
      toast(tHtml('home.goalDoneHtml', { name: goal.name, xp: goalParts(goal).fin }), 'achieve', { icon: '🏁', html: true, duration: 4500 });
    }, 300);
  }
}
function toggleMilestone(goal, milestone, sourceEl) {
  let finished = false;
  xpChange(() => {
    milestone.done = !milestone.done;
    if (milestone.done && !goal.done && goal.milestones.every(m => m.done) && !goal.link) { goal.done = true; finished = true; }
  }, sourceEl, milestone.name);
  sfx(milestone.done ? 'coin' : 'remove');
  if (milestone.done) unpin('ms', milestone.id);
  if (finished) {
    setTimeout(() => {
      sfx('achieve'); confetti(40);
      toast(tHtml('home.goalDoneTotalHtml', { name: goal.name, xp: goalParts(goal).total }), 'achieve', { icon: '🏁', html: true });
    }, 300);
  }
  commit();
}
function goalHTML(goal) {
  const progress = goalProgress(goal), parts = goalParts(goal), size = goalSize(goal);
  const sizeName = goalSizeName(size.key);
  const sizeTitle = t('home.goalSizeTitle', { size: sizeName, sizeLower: sizeName.toLowerCase(), duration: goalSizeDuration(size.key), xp: parts.total });
  return `<li class="project goal${goal.done ? ' done' : ''}">
    <div class="goal-head">
      <button class="qcheck" data-proj-toggle="${esc(goal.id)}" title="${esc(t('home.goalXpTitle', { xp: parts.fin }))}" aria-label="${esc(t(goal.done ? 'home.reopenNamed' : 'home.achieveNamed', { name: goal.name }))}">${goal.done ? '✓' : ''}</button>
      <span class="p-text"><b>${esc(goal.name)}</b>${goal.note ? `<small>${esc(goal.note)}</small>` : ''}</span>
      <span class="goal-size s-${size.key}" title="${esc(sizeTitle)}">${sizeName} · ${parts.total} XP</span>
      <button class="icon-mini" data-proj-edit="${esc(goal.id)}" title="${esc(t('common.edit'))}">${UI_ICON.edit}</button>
      <button class="icon-mini" data-proj-del="${esc(goal.id)}" title="${esc(t('common.delete'))}">${UI_ICON.del}</button>
    </div>
    ${progress ? `<div class="pbar" style="--c:var(--sage)"><div style="width:${progress.pct.toFixed(1)}%"></div><span>${progress.label}</span></div>` : ''}
    ${goal.milestones.length ? `<ul class="milestones">${goal.milestones.map(m => {
      const pinned = isPinned('ms', m.id);
      return `<li class="${m.done ? 'done' : ''}"><button class="ms-check" data-ms="${esc(goal.id)}:${esc(m.id)}" title="+${parts.per} XP" aria-label="${esc(m.name)}">${m.done ? '✓' : ''}</button><span>${esc(m.name)}</span>${m.done ? '' : `<button class="icon-mini ms-pin${pinned ? ' on' : ''}" data-mspin="${esc(goal.id)}:${esc(m.id)}" title="${esc(t(pinned ? 'common.unpin' : 'common.pin'))}">${UI_ICON.pin}</button>`}</li>`;
    }).join('')}</ul>` : ''}
  </li>`;
}

function openGoalModal(goal) {
  const milestones = goal ? goal.milestones.map(m => ({ ...m })) : [];
  let link = goal && goal.link ? { ...goal.link } : null;
  const measureOptions = kind => (kind === 'act' ? state.schedule.activities.map(a => [a.id, a.name])
    : kind === 'book' ? state.books.filter(b => !b.done).map(b => [b.id, b.title])
      : state.habits.list.map(h => [h.id, h.name]));
  openModal({
    title: t(goal ? 'home.editGoal' : 'home.newGoalTitle'),
    body: `<form data-pform autocomplete="off">
      <label class="field"><span>${t('home.goalLabel')}</span><input type="text" name="name" maxlength="60" value="${esc(goal ? goal.name : '')}" placeholder="${esc(t('home.goalPlaceholder'))}"></label>
      <label class="field"><span>${t('common.noteOptional')}</span><input type="text" name="note" maxlength="300" value="${esc(goal ? goal.note : '')}" placeholder="${esc(t('home.whyPlaceholder'))}"></label>
      <label class="field"><span>${t('home.howLong')}</span><select name="size">${GOAL_SIZES.map(size =>
        `<option value="${size.key}"${(goal ? goalSize(goal).key : 'medium') === size.key ? ' selected' : ''}>${goalSizeName(size.key)} · ${goalSizeDuration(size.key)} · ${size.xp} XP</option>`).join('')}</select></label>
      <div class="field"><span>${t('home.milestones')}</span><div class="ms-edit" data-ms-list></div>
        <button type="button" class="btn btn-small" data-ms-add>${t('home.addMilestone')}</button></div>
      <div class="field"><span>${t('home.measureWith')}</span>
        <div class="row3">
          <select name="kind"><option value="">${t('home.measureNothing')}</option><option value="act">${t('home.measureActivity')}</option><option value="book">${t('home.measureBook')}</option><option value="habit">${t('home.measureHabit')}</option></select>
          <select name="ref"></select>
          <input type="number" name="target" min="1" placeholder="${esc(t('home.target'))}">
        </div></div>
    </form>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t('common.save')}</button>`,
    onMount: modal => {
      const form = $('[data-pform]', modal), list = $('[data-ms-list]', modal);
      const drawMilestones = () => {
        list.innerHTML = milestones.map((m, i) => `<div class="ms-row"><input type="text" maxlength="80" value="${esc(m.name)}" data-ms-i="${i}" placeholder="${esc(t('home.milestonePlaceholder'))}"><button type="button" class="icon-mini" data-ms-del="${i}" title="${esc(t('common.remove'))}">✕</button></div>`).join('');
      };
      const syncLink = () => {
        const kind = form.kind.value;
        form.ref.hidden = form.target.hidden = !kind;
        if (!kind) return;
        form.ref.innerHTML = measureOptions(kind).map(([id, name]) => `<option value="${esc(id)}"${link && link.id === id ? ' selected' : ''}>${esc(name)}</option>`).join('');
        if (link && link.kind === kind) form.target.value = link.target;
      };
      if (link) form.kind.value = link.kind;
      drawMilestones(); syncLink();
      form.kind.onchange = syncLink;
      list.addEventListener('input', e => { const i = e.target.dataset.msI; if (i != null) milestones[+i].name = e.target.value; });
      list.addEventListener('click', e => { const del = e.target.closest('[data-ms-del]'); if (del) { milestones.splice(+del.dataset.msDel, 1); drawMilestones(); } });
      $('[data-ms-add]', modal).onclick = () => { milestones.push({ id: uid(), name: '', done: false }); drawMilestones(); $$('[data-ms-i]', modal).pop().focus(); };
      const accept = () => {
        const name = form.name.value.trim();
        if (!name) { sfx('error'); toast(t('home.goalNameRequired'), 'warn'); return; }
        const kind = form.kind.value, target = parseInt(form.target.value, 10);
        if (kind && (!form.ref.value || !(target > 0))) { sfx('error'); toast(t('home.pickMeasure'), 'warn'); return; }
        link = kind ? { kind, id: form.ref.value, target } : null;
        const cleanMilestones = milestones.map(m => ({ ...m, name: m.name.trim().slice(0, 80) })).filter(m => m.name);
        const size = form.size.value;
        if (goal) Object.assign(goal, { name, note: form.note.value.trim(), milestones: cleanMilestones, link, size });
        else state.profile.projects.push({ id: uid(), name, note: form.note.value.trim(), done: false, auto: false, milestones: cleanMilestones, link, size });
        closeModal(); sfx('place'); commit();
      };
      $('[data-ok]', modal).onclick = accept;
      form.addEventListener('submit', e => { e.preventDefault(); accept(); });
    },
  });
}

function bindHome() {
  bindFolds($('#view-home'), renderHome);
  $('#view-home').addEventListener('click', e => {
    const target = e.target;
    const nowCheck = target.closest('[data-nn-check]');
    if (nowCheck) { toggleBlockDone(nowCheck.dataset.nnCheck, todayISO(), nowCheck); return; }
    if (target.closest('[data-pet]')) { petPoke(target.closest('[data-pet]').firstElementChild); openPetModal(); return; }
    if (target.closest('[data-open-profile]')) { openProfile(); return; }
    if (target.closest('[data-add-project]')) { openGoalModal(null); return; }
    const goalById = id => state.profile.projects.find(x => x.id === id);
    const toggleButton = target.closest('[data-proj-toggle]');
    if (toggleButton) {
      const goal = goalById(toggleButton.dataset.projToggle);
      xpChange(() => { goal.done = !goal.done; }, toggleButton, goal.name);
      sfx(goal.done ? 'achieve' : 'remove');
      if (goal.done) confetti(30);
      commit();
      return;
    }
    const milestoneButton = target.closest('[data-ms]');
    if (milestoneButton) {
      const [goalId, milestoneId] = milestoneButton.dataset.ms.split(':');
      const goal = goalById(goalId), milestone = goal && goal.milestones.find(x => x.id === milestoneId);
      if (milestone) toggleMilestone(goal, milestone, milestoneButton);
      return;
    }
    const pinButton = target.closest('[data-mspin]');
    if (pinButton) { const [goalId, milestoneId] = pinButton.dataset.mspin.split(':'); togglePin('ms', goalId, milestoneId); renderHome(); return; }
    const editButton = target.closest('[data-proj-edit]');
    if (editButton) { openGoalModal(goalById(editButton.dataset.projEdit)); return; }
    const deleteButton = target.closest('[data-proj-del]');
    if (deleteButton) {
      const goal = goalById(deleteButton.dataset.projDel);
      removeWithUndo(state.profile, 'projects', goal, goal.name);
    }
  });
}

// Every minute Home is drawn again (the time, now / next), except while the keyboard is inside it
const homeTick = () => { if (!$('#view-home').contains(document.activeElement)) renderHome(); };
registerView('home', { render: renderHome, bind: bindHome, tick: homeTick });
