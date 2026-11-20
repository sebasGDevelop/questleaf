/* University section: deliverables by due date and one card per subject. */
'use strict';

const DELIVERABLE_KINDS = ['task', 'exam', 'quiz', 'project', 'presentation'];
const DELIVERABLE_ICONS = { task: 'cat-writing', exam: 'today-deadlines', quiz: 'cat-math', project: 'cat-code', presentation: 'cat-social' };
const deliverableXP = event => (event.kind === 'project' ? XP.project : XP.task);
let universitySubject = ''; // the subject that filters the list ('' = all)

/** Deadlines from today on, not delivered yet, the closest first. */
const upcomingEvents = () => state.university.events.filter(e => !e.done && e.date && daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
const pendingDeliverables = () => state.university.events.filter(e => !e.done);
const subjects = () => state.schedule.activities.filter(a => a.type === 'subject');

/** Study hours of a subject this week: focus sessions plus completed schedule blocks. */
function studyHoursThisWeek(subjectId) {
  const monday = mondayOf(new Date());
  let minutes = 0;
  for (let i = 0; i < 7; i++) {
    const day = iso(addDays(monday, i));
    for (const session of state.focusLog[day] || []) if (session.act === subjectId) minutes += session.min;
    const log = state.schedule.log[day] || {};
    for (const key in log) if (!key.startsWith('__') && log[key].act === subjectId) minutes += (log[key].h || 0) * 60;
  }
  return Math.round(minutes / 6) / 10;
}

function deliverableRowHTML(event) {
  const days = event.date ? daysUntil(event.date) : null, subject = event.act && activityById(event.act);
  const label = t(event.done ? 'university.undeliver' : 'university.deliver', { name: event.name });
  const when = event.date ? `${formatRelativeDays(days)} · ${formatShortDate(parseISO(event.date))}` : t('university.noDate');
  return `<div class="deliv${event.done ? ' done' : ''}${!event.done && days !== null && days < 0 ? ' late' : ''}${!event.done && days !== null && days >= 0 && days <= 3 ? ' soon' : ''}" style="--c:${subject ? esc(subject.color) : 'var(--peri)'}">
    <button class="qcheck" data-edone="${esc(event.id)}" title="+${deliverableXP(event)} XP" aria-label="${esc(label)}">${event.done ? '✓' : ''}</button>
    <span class="deliv-ico" title="${esc(t(`university.kinds.${event.kind}`))}">${ico(DELIVERABLE_ICONS[event.kind], '📌')}</span>
    <span class="deliv-text">
      <b>${esc(event.name)}</b>
      <small><span class="deliv-kind">${t(`university.kinds.${event.kind}`)}</span>${subject ? ` · ${esc(subject.name)}` : ''} · ${esc(when)}</small>
      ${event.done ? '' : bossRowHTML(event)}
    </span>
    <button class="icon-mini" data-eedit="${esc(event.id)}" title="${esc(t('common.edit'))}" aria-label="${esc(t('common.editNamed', { name: event.name }))}">${UI_ICON.edit}</button>
    <button class="icon-mini" data-edel="${esc(event.id)}" title="${esc(t('common.delete'))}" aria-label="${esc(t('common.delete'))}">${UI_ICON.del}</button>
  </div>`;
}

function subjectCardHTML(subject) {
  const pending = pendingDeliverables().filter(e => e.act === subject.id);
  const next = pending.filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date))[0];
  const hours = studyHoursThisWeek(subject.id), active = universitySubject === subject.id;
  return `<button class="subject-card${active ? ' on' : ''}" data-subject="${esc(subject.id)}" style="--c:${esc(subject.color)}" aria-pressed="${active}">
    <span class="sc-head"><span class="item-icon">${iconHTML(subject.icon)}</span><b>${esc(subject.name)}</b></span>
    ${next ? `<small>${esc(t('university.nextOne', { name: next.name, when: formatRelativeDays(daysUntil(next.date)) }))}</small>` : ''}
    ${pending.length || hours ? `<span class="sc-stats">
      ${pending.length ? `<span title="${esc(t('university.pendingCount', { count: pending.length }))}">${ico('today-deadlines', '')}${pending.length}</span>` : ''}
      ${hours ? `<span title="${esc(t('university.studyHours', { hours: formatNumber(hours) }))}">${ico('sec-schedule', '')}${formatNumber(hours)} h</span>` : ''}
    </span>` : ''}
  </button>`;
}

function renderUniversity() {
  const all = state.university.events.filter(e => !universitySubject || e.act === universitySubject);
  const byDate = (a, b) => a.date.localeCompare(b.date);
  const pending = all.filter(e => !e.done);
  const groups = [
    ['late', pending.filter(e => e.date && daysUntil(e.date) < 0).sort(byDate)],
    ['thisWeek', pending.filter(e => e.date && daysUntil(e.date) >= 0 && daysUntil(e.date) <= 7).sort(byDate)],
    ['later', pending.filter(e => e.date && daysUntil(e.date) > 7).sort(byDate)],
    ['noDate', pending.filter(e => !e.date)],
  ].filter(([, list]) => list.length);
  const delivered = all.filter(e => e.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const filterName = universitySubject && activityById(universitySubject);
  $('#view-university').innerHTML = `
    ${pageHead('university', t('university.subtitle', { taskXp: XP.task, projectXp: XP.project }),
      `<button class="btn btn-primary btn-add" data-eadd title="${esc(t('university.newDeadline'))}" aria-label="${esc(t('university.newDeadline'))}">+</button>`,
      pendingDeliverables().length)}
    <div class="uni-layout">
      <section class="deliv-col">
        ${filterName ? `<div class="banner deliv-filter">${t('university.filteredBy', { name: esc(filterName.name) })}<button class="btn btn-small" data-subject="">${t('university.showAll')}</button></div>` : ''}
        <div class="delivs" data-paged="university" data-paged-reserve="${delivered.length ? 170 : 110}">${groups.map(([key, list]) => `<h2 class="deliv-group${key === 'late' ? ' late' : ''}">${t(`university.groups.${key}`)} <small>${list.length}</small></h2>
          ${list.map(deliverableRowHTML).join('')}`).join('') || `<p class="empty">${t('university.noDeadlines')}</p>`}</div>
        ${delivered.length ? foldHTML('university.delivered', t('university.groups.delivered'), String(delivered.length),
          () => `<div class="delivs">${delivered.map(deliverableRowHTML).join('')}</div>`, 'deliv-done') : ''}
      </section>
      <aside class="subject-col" data-paged="subjects" data-pager="inside">
        <h2 class="deliv-group" data-page-keep>${t('university.subjects')}</h2>
        ${subjects().map(subjectCardHTML).join('') || `<p class="empty small">${t('university.noSubjects')}</p>`}
      </aside>
    </div>`;
}

/** Checks or unchecks "delivered": the XP of a task (or a project). */
function toggleDelivered(event, sourceEl) {
  event.done = !event.done;
  event.doneAt = event.done ? todayISO() : '';
  sfx(event.done ? 'coin' : 'remove');
  xpFx(event.done ? deliverableXP(event) : -deliverableXP(event), sourceEl, event.name);
  commit();
}

function bindUniversity() {
  const view = $('#view-university');
  bindFolds(view, renderUniversity);
  view.addEventListener('click', e => {
    const target = e.target;
    const doneButton = target.closest('[data-edone]');
    if (doneButton) { const event = state.university.events.find(x => x.id === doneButton.dataset.edone); if (event) toggleDelivered(event, doneButton); return; }
    const subjectButton = target.closest('[data-subject]');
    if (subjectButton) { universitySubject = universitySubject === subjectButton.dataset.subject ? '' : subjectButton.dataset.subject; sfx('select'); renderUniversity(); return; }
    if (target.closest('[data-eadd]')) { openDeadlineModal(null, universitySubject); return; }
    const eventDelete = target.closest('[data-edel]');
    if (eventDelete) {
      const event = state.university.events.find(x => x.id === eventDelete.dataset.edel);
      if (event) removeWithUndo(state.university, 'events', event, event.name);
    }
  });
}

registerView('university', { render: renderUniversity, bind: bindUniversity, tick: renderUniversity, reset: () => { universitySubject = ''; } });
