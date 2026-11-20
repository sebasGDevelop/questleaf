/* Workout section: one card per weekday with its exercises, and an optional dumbbell plan. */
'use strict';

function renderWorkout() {
  const dates = weekDatesFor(0), todayKey = todayISO();
  const total = Object.keys(state.workout.log).length;
  const thisWeek = dates.filter(d => state.workout.log[iso(d)]).length;
  const cards = state.workout.days.map((day, i) => {
    const dateKey = iso(dates[i]);
    const done = !!state.workout.log[dateKey];
    const hasWeights = day.exercises.some(x => x.kg);
    const rows = day.exercises.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.sets)}</td><td>${esc(x.reps)}</td>${hasWeights ? `<td>${esc(x.kg)}</td>` : ''}</tr>`).join('');
    const footer = dateKey <= todayKey
      ? `<button class="btn btn-small full rdone${done ? ' on' : ''}" data-rdone="${dateKey}" title="${esc(t(done ? 'workout.doneTitle' : 'common.complete'))}" aria-label="${esc(t(done ? 'schedule.uncheckNamed' : 'schedule.completeNamed', { name: dayName(i) }))}">✓</button>`
      : `<span class="muted small rlock" title="${esc(t('workout.availableOn', { date: formatShortDate(dates[i]) }))}">${ico('ui-lock', '')} ${formatShortDate(dates[i])}</span>`;
    return `<article class="day-card${dateKey === todayKey ? ' today' : ''}${done ? ' ok' : ''}" style="--rc:${esc(day.color)}">
      <header class="dc-head">
        <div><b>${dayName(i)}${dateKey === todayKey ? ` · ${t('common.today')}` : ''}</b><small>${esc(day.focus || t('workout.noFocus'))}</small></div>
        <button class="icon-mini" data-redit="${i}" title="${esc(t('common.editNamed', { name: dayName(i) }))}">${UI_ICON.edit}</button>
      </header>
      ${day.exercises.length
        ? `<table class="ex-table"><thead><tr><th>${t('workout.exercise')}</th><th>${t('workout.sets')}</th><th>${t('workout.reps')}</th>${hasWeights ? `<th>${t('workout.weight')}</th>` : ''}</tr></thead><tbody>${rows}</tbody></table>`
        : `<p class="empty">${t('workout.restDay')}</p>`}
      <footer class="dc-foot">${footer}</footer>
    </article>`;
  }).join('');

  const planButton = `<button class="btn btn-small plan-btn${state.workout.plan ? '' : ' btn-primary'}" data-rplan>${ico('cat-strength', '🏋️')}${t(state.workout.plan ? 'workout.planButton' : 'workout.seePlan')}</button>`;
  $('#view-workout').innerHTML = `
    ${pageHead('workout', t('workout.subtitle', { week: thisWeek, count: total }), planButton, `${thisWeek}/7`)}
    <div class="workout-grid" data-paged="workout" data-paged-reserve="170">${cards}</div>
    ${foldHTML('workout.notes', t('workout.notesTitle'), '', () => `
      <div class="notes">${esc(state.workout.notes) || `<span class="muted">${t('workout.noNotes')}</span>`}</div>
      <div class="fold-actions"><button class="btn btn-small" data-rnotes aria-label="${esc(t('workout.editNotes'))}">${UI_ICON.edit} ${t('common.edit')}</button></div>`, 'notes-card')}`;
}

// ---------------------------------------------------------
// Beginner dumbbell plan (adjustable set up to 19.5 kg per dumbbell).
// Monday, Tuesday and Thursday with dumbbells; Wednesday (the busiest day) and the weekend stay as they are.
// Friday has no legs (Thursday is legs) and no dumbbells (that session is away from home).
// Exercise: [key, sets, reps, weight, 'side' | 'leg'?]. Names and per-side texts come from workout.plan.*
// ---------------------------------------------------------
const DUMBBELL_PLAN = [
  { day: 0, focus: 'pull', color: '#f6d38a', exercises: [
    ['warmup', '1', '5 min'], ['pullups', '3', '5–8'], ['oneArmRow', '3', '10–12', '8 kg', 'side'],
    ['facePull', '3', '15'], ['curl', '3', '10–12', '5 kg'], ['hammerCurl', '2', '10–12', '5 kg'],
  ] },
  { day: 1, focus: 'push', color: '#a9cbe8', exercises: [
    ['warmup', '1', '5 min'], ['floorPress', '3', '10–12', '8 kg'], ['shoulderPress', '3', '10–12', '5 kg'],
    ['pushups', '3', '8–12'], ['lateralRaise', '2', '12–15', '3 kg'], ['tricepsExtension', '2', '10–12', '5 kg'],
  ] },
  { day: 3, focus: 'legs', color: '#a8d8a0', exercises: [
    ['warmup', '1', '5 min'], ['gobletSquat', '3', '10–12', '10 kg'], ['romanianDeadlift', '3', '10–12', '8 kg'],
    ['bulgarianSplitSquat', '2', '8–10', '4 kg', 'leg'], ['gluteBridge', '3', '12–15', '10 kg'], ['calfRaise', '3', '12–15', '8 kg'],
  ] },
  { day: 4, focus: 'mixed', color: '#b8b4ec', exercises: [
    ['warmup', '1', '5 min'], ['pullups', '3', '4–6'], ['bandRow', '3', '15'], ['pushups', '3', '8–12'],
    ['facePull', '3', '15'], ['crunches', '3', '20'], ['russianTwist', '3', '16'],
  ] },
];
/** A plan exercise in the active language: { name, sets, reps, kg }. */
function planExercise([key, sets, reps, kg = '', per]) {
  const repsText = per ? t(per === 'side' ? 'workout.plan.perSide' : 'workout.plan.perLeg', { reps }) : reps;
  return { name: t(`workout.plan.exercises.${key}`), sets, reps: repsText, kg };
}
/** Time of that day's workout according to the schedule (an activity named like a gym session). */
function workoutHourOf(weekday) {
  const block = state.schedule.blocks.find(b => b.day === weekday
    && /gimnasio|gym|entren|ejercicio|workout|exercise|training/i.test((activityById(b.activityId) || {}).name || ''));
  return block ? formatHour(block.start) : '';
}

function openWorkoutPlanModal() {
  const usingPlan = state.workout.plan === 'dumbbells';
  openModal({
    title: t('workout.plan.title'),
    wide: true,
    body: `<div class="plan-grid">${range(0, 5).map(i => {
      const planDay = DUMBBELL_PLAN.find(x => x.day === i), currentDay = state.workout.days[i];
      const rows = planDay ? planDay.exercises.map(planExercise) : currentDay.exercises;
      const focus = planDay ? t(`workout.plan.focus.${planDay.focus}`) : currentDay.focus || t('home.rest');
      return `<article class="plan-day" style="--rc:${planDay ? planDay.color : esc(currentDay.color)}">
        <h3>${dayName(i).toUpperCase()}${workoutHourOf(i) ? ` · ${workoutHourOf(i)}` : ''}</h3><small>${esc(focus)}${planDay ? '' : ` · ${t('workout.plan.staysSame')}`}</small>
        <ul>${rows.map(x => `<li><span>${esc(x.name)}</span><b>${esc(x.sets)} × ${esc(x.reps)}${x.kg ? ` · <i>${esc(x.kg)}</i>` : ''}</b></li>`).join('')}</ul>
      </article>`;
    }).join('')}</div>
      <p class="muted plan-same">${t('workout.plan.weekendSame')}</p>
      <ul class="plan-tips">
        ${['tipWeightHtml', 'tipFirstWeeksHtml', 'tipEffortHtml', 'tipProgressHtml', 'tipRestHtml'].map(key => `<li>${t(`workout.plan.${key}`)}</li>`).join('')}
      </ul>`,
    footer: usingPlan
      ? `<button class="btn" data-rback>${t('workout.plan.previousRoutine')}</button><span class="spacer"></span><button class="btn btn-primary" data-close>${t('common.closeUpper')}</button>`
      : `<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ruse>${t('workout.plan.usePlan')}</button>`,
    onMount: modal => {
      const useButton = $('[data-ruse]', modal), backButton = $('[data-rback]', modal);
      if (useButton) useButton.onclick = applyWorkoutPlan;
      if (backButton) backButton.onclick = () => confirmModal(esc(t('workout.plan.restoreConfirm')), () => { closeModal(); restoreWorkout(); }, t('workout.plan.yesGoBack'), { stack: true });
    },
  });
}
function applyWorkoutPlan() {
  const workout = state.workout;
  workout.prev = workout.days.map(d => ({ ...d, exercises: d.exercises.map(x => ({ ...x })) }));
  DUMBBELL_PLAN.forEach(planDay => {
    workout.days[planDay.day] = { focus: t(`workout.plan.focus.${planDay.focus}`), color: planDay.color, exercises: planDay.exercises.map(planExercise) };
  });
  workout.plan = 'dumbbells';
  closeModal(); sfx('achieve'); commit();
  toast(t('workout.plan.readyHtml'), 'info', { icon: ico('cat-strength', '🏋️'), html: true });
}
function restoreWorkout() {
  const workout = state.workout;
  if (!workout.prev) return;
  workout.days = workout.prev; workout.prev = null; workout.plan = '';
  sfx('remove'); commit();
  toast(t('workout.plan.restored'), 'info', { icon: ico('cat-strength', '🏋️') });
}

function toggleWorkoutDone(dateISO) {
  if (dateISO > todayISO()) return;
  if (state.workout.log[dateISO]) { delete state.workout.log[dateISO]; sfx('remove'); } else { state.workout.log[dateISO] = true; sfx('coin'); }
  commit();
}

function openWorkoutDayModal(weekday) {
  const day = state.workout.days[weekday];
  const rows = day.exercises.map(x => ({ ...x }));
  let color = day.color;
  openModal({
    title: t('workout.dayTitle', { day: dayName(weekday).toUpperCase() }),
    wide: true,
    body: `<form data-rform autocomplete="off">
      <label class="field"><span>${t('workout.dayFocus')}</span><input type="text" name="focus" maxlength="40" value="${esc(day.focus)}" placeholder="${esc(t('workout.focusPlaceholder'))}"></label>
      <div class="field"><span>${t('common.colorLabel')}</span>${swatchesHTML()}</div>
      <div class="field"><span>${t('workout.exercises')}</span>
        <div class="ex-edit-head"><span>${t('workout.exercise')}</span><span>${t('workout.sets')}</span><span>${t('workout.reps')}</span><span>${t('workout.weight')}</span><span></span></div>
        <div data-rows></div>
        <button type="button" class="btn btn-small" data-add-row>${t('workout.addExercise')}</button>
      </div>
    </form>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t('common.save')}</button>`,
    onMount: modal => {
      const form = $('[data-rform]', modal);
      const box = $('[data-rows]', modal);
      const drawRows = () => {
        box.innerHTML = rows.map((row, j) => `<div class="ex-row">
          <input type="text" data-j="${j}" data-k="name" maxlength="60" value="${esc(row.name)}" placeholder="${esc(t('workout.exercise'))}">
          <input type="text" data-j="${j}" data-k="sets" maxlength="10" value="${esc(row.sets)}" placeholder="3">
          <input type="text" data-j="${j}" data-k="reps" maxlength="20" value="${esc(row.reps)}" placeholder="12">
          <input type="text" data-j="${j}" data-k="kg" maxlength="12" value="${esc(row.kg || '')}" placeholder="—">
          <button type="button" class="icon-mini" data-del-row="${j}" title="${esc(t('common.remove'))}">${UI_ICON.del}</button></div>`).join('')
          || `<p class="empty small">${t('workout.noExercises')}</p>`;
      };
      const syncColor = () => $$('[data-color]', modal).forEach(b => b.classList.toggle('on', b.dataset.color === color));
      $$('[data-color]', modal).forEach(b => { b.onclick = () => { color = b.dataset.color; syncColor(); }; });
      box.addEventListener('input', e => { const input = e.target; if (input.dataset.j) rows[+input.dataset.j][input.dataset.k] = input.value; });
      box.addEventListener('click', e => { const del = e.target.closest('[data-del-row]'); if (del) { rows.splice(+del.dataset.delRow, 1); drawRows(); } });
      $('[data-add-row]', modal).onclick = () => { rows.push({ name: '', sets: '', reps: '' }); drawRows(); $$('input[data-k=name]', box).pop().focus(); };
      drawRows(); syncColor();
      const accept = () => {
        day.focus = form.focus.value.trim();
        day.color = color;
        day.exercises = rows.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), sets: r.sets.trim(), reps: r.reps.trim(), kg: (r.kg || '').trim() }));
        closeModal(); sfx('place'); commit();
      };
      $('[data-ok]', modal).onclick = accept;
      form.addEventListener('submit', e => { e.preventDefault(); accept(); });
    },
  });
}

function openWorkoutNotesModal() {
  openModal({
    title: t('workout.notesTitle'),
    wide: true,
    body: `<label class="field"><span>${t('common.notesLabel')}</span><textarea data-notes rows="18" maxlength="8000">${esc(state.workout.notes)}</textarea></label>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t('common.save')}</button>`,
    onMount: modal => {
      $('[data-ok]', modal).onclick = () => { state.workout.notes = $('[data-notes]', modal).value; closeModal(); sfx('place'); commit(); };
    },
  });
}

function bindWorkout() {
  bindFolds($('#view-workout'), renderWorkout);
  $('#view-workout').addEventListener('click', e => {
    const target = e.target;
    const doneButton = target.closest('[data-rdone]');
    if (doneButton) { toggleWorkoutDone(doneButton.dataset.rdone); return; }
    const editButton = target.closest('[data-redit]');
    if (editButton) { openWorkoutDayModal(+editButton.dataset.redit); return; }
    if (target.closest('[data-rnotes]')) openWorkoutNotesModal();
    if (target.closest('[data-rplan]')) openWorkoutPlanModal();
  });
}

registerView('workout', { render: renderWorkout, bind: bindWorkout, tick: renderWorkout });
