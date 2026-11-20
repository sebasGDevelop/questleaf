/* Focus: the pomodoro on Home and the garden of finished sessions. */
'use strict';

let focus = null; // { actId, name, min, end, left, paused, timer, el, pill, stage, notifyP }
const FOCUS_MINUTES = [15, 25, 50, 90];

const focusMsLeft = () => (focus ? (focus.paused ? focus.left : focus.end - Date.now()) : 0);
function formatFocusLeft() {
  const seconds = Math.max(0, Math.ceil(focusMsLeft() / 1000));
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/** The focus card on Home: the controls, or the running session. */
function focusCardHTML() {
  if (focus) {
    return `<section class="card focus-card running">
      <h2 class="card-title">${t('focus.title')}</h2>
      <div class="fc-running">
        <img src="assets/icons/plant-${focus.stage}.png" alt="">
        <div><b data-fc-time>${formatFocusLeft()}</b><small>${esc(focus.name)}${focus.paused ? ` · ${t('focus.paused')}` : ''}</small></div>
        <button class="btn btn-small" data-fopen>${t('focus.show')}</button>
        ${desktopApi && desktopApi.mini_open ? `<button class="btn btn-small" data-fmini2 title="${esc(t('focus.floatingTip'))}" aria-label="${esc(t('focus.floatingTip'))}">${ico('ui-float', '')}</button>` : ''}
      </div>
    </section>`;
  }
  const s = state.settings;
  const less = esc(t('focus.lessMinutes')), more = esc(t('focus.moreMinutes'));
  return `<section class="card focus-card">
    <h2 class="card-title">${t('focus.title')}</h2>
    ${typeof breakRowHTML === 'function' ? breakRowHTML() : ''}
    <div class="fc-body">
      <img class="fc-seed" src="assets/icons/plant-1.png" alt="">
      <div class="fc-controls">
        <div class="fc-mins">${FOCUS_MINUTES.map(m => `<button class="btn btn-small${s.focusMin === m ? ' on' : ''}" data-fcmin="${m}">${m}</button>`).join('')}
          <span class="min-step"><button type="button" class="btn btn-small" data-fcstep="-5" title="${less}" aria-label="${less}">−</button><input type="number" class="min-input" data-fccustom min="1" max="240" value="${s.focusMin}" aria-label="${esc(t('focus.minutes'))}"><button type="button" class="btn btn-small" data-fcstep="5" title="${more}" aria-label="${more}">+</button></span><span class="fc-unit">${t('focus.minUnit')}</span></div>
        <select data-fcact aria-label="${esc(t('focus.whatOn'))}">
          <option value="">${t('focus.free')}</option>
          ${state.schedule.activities.map(a => `<option value="${esc(a.id)}"${s.focusAct === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}
        </select>
        <button class="btn btn-primary fc-play" data-fcstart title="${esc(t('focus.startTip', { min: XP.focusMinutesPerXp }))}" aria-label="${esc(t('focus.start'))}">▶</button>
      </div>
    </div>
  </section>`;
}

function startFocus(actId, min) {
  if (focus) { showFocus(); return; }
  appEmit('focusStarting'); // features/desktop.js closes the break offer and any running break
  const activity = activityById(actId);
  const name = activity ? activity.name : t('focus.freeName');
  const overlay = el('div', 'focus-overlay', `
    ${state.settings.anim ? '<div class="magic-circle"></div><div class="magic-circle inner"></div>' : ''}
    <div class="focus-box">
      <img class="focus-plant" data-fplant src="assets/icons/plant-1.png" alt="">
      <div class="focus-name">${activity ? `${iconHTML(activity.icon)} ` : ''}${esc(name)}</div>
      <div class="focus-time" data-ftime></div>
      <div class="pbar big" style="--c:var(--sage)"><div data-fbar></div></div>
      <div class="btn-row">
        <button class="btn" data-fmini title="${esc(t('focus.minimizeTip'))}">${t('focus.minimize')}</button>
        <button class="btn" data-fpause>${t('focus.pause')}</button>
        <button class="btn btn-danger" data-fstop>${t('focus.stop')}</button>
      </div>
    </div>`);
  const pill = el('button', 'focus-pill', '<img data-fpill-plant src="assets/icons/plant-1.png" alt=""><b data-fpill-time></b>');
  pill.hidden = true;
  pill.title = t('focus.backToFocus');
  pill.setAttribute('aria-label', t('focus.backToFocus'));
  document.body.append(overlay, pill);
  focus = { actId: activity ? activity.id : '', name, min, end: Date.now() + min * 60000, left: 0, paused: false, el: overlay, pill, stage: 1, notifyP: null,
    day: todayISO(), saved: 0, entry: null };
  scheduleFocusNotify();
  overlay.addEventListener('click', e => {
    if (e.target.closest('[data-fmini]')) { overlay.hidden = true; pill.hidden = false; sfx('select'); return; }
    const pauseButton = e.target.closest('[data-fpause]');
    if (pauseButton) {
      focus.paused = !focus.paused;
      if (focus.paused) { focus.left = focus.end - Date.now(); cancelFocusNotify(focus); } else { focus.end = Date.now() + focus.left; scheduleFocusNotify(); }
      pauseButton.textContent = focus.paused ? t('focus.resume') : t('focus.pause');
      overlay.classList.toggle('paused', focus.paused);
      sfx('select');
      return;
    }
    // Stopping early is confirmed with a second click on the same button
    const stopButton = e.target.closest('[data-fstop]');
    if (stopButton) {
      if (stopButton.classList.contains('confirm')) { endFocus(false); return; }
      stopButton.classList.add('confirm');
      stopButton.textContent = t('focus.stopConfirm');
      setTimeout(() => { if (stopButton.isConnected) { stopButton.classList.remove('confirm'); stopButton.textContent = t('focus.stop'); } }, 3000);
    }
  });
  pill.addEventListener('click', showFocus);
  focus.timer = setInterval(focusTick, 250);
  focusTick();
  sfx('page');
  if (state.settings.music !== 'off' && !MUSIC.playing) setTimeout(playSong, 1500); // one piece to get going
  if (currentView === 'home') renderHome();
  appEmit('focusStart', focus);
}
function showFocus() {
  if (!focus) return;
  focus.el.hidden = false;
  focus.pill.hidden = true;
}

// Python schedules the Windows notification: it arrives on time even with the app minimized
function scheduleFocusNotify() {
  const session = focus;
  cancelFocusNotify(session);
  if (!desktopApi || !desktopApi.schedule_notify) return;
  session.notifyP = desktopApi.schedule_notify(Math.max(1, focusMsLeft() / 1000), t('focus.notifyTitle'),
    plainSeparators(t('focus.notifyBody', { name: session.name, min: session.min, xp: focusXP(session.min) }))).catch(() => null);
}
function cancelFocusNotify(session) {
  if (!session || !session.notifyP) return;
  const pending = session.notifyP;
  session.notifyP = null;
  pending.then(id => { if (id) desktopApi.cancel_notify(id).catch(() => {}); });
}

// Every 5 minutes the session is saved in focusLog (part: true until it ends): the minutes count and a boss
// loses life as you go, even if the session is stopped later. A partial session plants no tree.
const FOCUS_SAVE_STEP = 5;
function saveFocusProgress(session) {
  const done = Math.floor((session.min * 60000 - focusMsLeft()) / 60000);
  const minutes = Math.floor(done / FOCUS_SAVE_STEP) * FOCUS_SAVE_STEP;
  if (minutes <= session.saved || minutes >= session.min) return;
  const step = minutes - session.saved;
  if (!session.entry) {
    session.entry = { act: session.actId, min: minutes, part: true };
    (state.focusLog[session.day] || (state.focusLog[session.day] = [])).push(session.entry);
  } else session.entry.min = minutes;
  session.saved = minutes;
  appEmit('focusProgress', { session, minutes: step }); // features/quests.js: the boss takes the hit
  commit();
}

function focusTick() {
  if (!focus) return;
  const left = focusMsLeft();
  if (left <= 0) { endFocus(true); return; }
  if (!focus.paused) saveFocusProgress(focus);
  const text = formatFocusLeft();
  $('[data-ftime]', focus.el).textContent = text;
  $('[data-fpill-time]', focus.pill).textContent = text;
  const card = $('[data-fc-time]');
  if (card) card.textContent = text;
  const pct = 100 - left / (focus.min * 600);
  $('[data-fbar]', focus.el).style.width = `${pct}%`;
  const stage = Math.min(4, 1 + Math.floor(pct / 25));
  if (stage !== focus.stage) {
    focus.stage = stage;
    const img = $('[data-fplant]', focus.el);
    img.src = `assets/icons/plant-${stage}.png`;
    img.classList.remove('grow'); void img.offsetWidth; img.classList.add('grow');
    $('[data-fpill-plant]', focus.pill).src = img.src;
  }
  appEmit('focusTick');
}

function endFocus(finished) {
  const session = focus;
  if (!session) return;
  clearInterval(session.timer);
  focus = null;
  session.pill.remove();
  appEmit('focusEnd', { session, finished });
  if (!finished) {
    cancelFocusNotify(session);
    session.el.remove();
    sfx('remove');
    if (session.saved) commit(); // the 5-minute steps already done stay
    else if (currentView === 'home') renderHome();
    return;
  }
  // The tree finishes growing and glows for a moment before closing
  session.el.hidden = false;
  const img = $('[data-fplant]', session.el);
  img.src = 'assets/icons/plant-5.png';
  img.classList.remove('grow'); void img.offsetWidth; img.classList.add('grow', 'done');
  $('[data-ftime]', session.el).textContent = t('focus.finished');
  $('.btn-row', session.el).remove();
  setTimeout(() => session.el.remove(), 2200);
  const today = todayISO();
  if (session.entry) { session.entry.min = session.min; delete session.entry.part; } // the saved steps become the whole session
  else (state.focusLog[today] || (state.focusLog[today] = [])).push({ act: session.actId, min: session.min });
  sfx('achieve'); confetti(30);
  const params = { name: session.name, min: session.min, xp: focusXP(session.min) };
  toast(tHtml('focus.completedHtml', params), 'achieve', { icon: ico('cat-meditation', '🧘'), html: true });
  if (!session.notifyP) notifyWin(t('focus.notifyTitle'), t('focus.notifyBody', params));
  commit();
}

/** Focus minutes: any value from 1 to 240 (the buttons are shortcuts). */
function setFocusMin(value) {
  const minutes = Math.max(1, Math.min(240, Math.round(+value) || 25));
  state.settings.focusMin = minutes;
  save();
  $$('[data-fcmin], [data-rmin]').forEach(b => b.classList.toggle('on', +(b.dataset.fcmin || b.dataset.rmin) === minutes));
  $$('[data-fccustom], [data-rcustom]').forEach(input => { if (document.activeElement !== input) input.value = minutes; });
  $$('[data-rstart]').forEach(b => { b.title = t('focus.startMinutes', { count: minutes }); });
  if (typeof miniPush === 'function') miniPush(true);
}

// Garden: every finished session is a tree (long ones, a spirit tree)
function gardenHTML() {
  const trees = [];
  Object.keys(state.focusLog).sort().forEach(d => state.focusLog[d].forEach(s => { if (!s.part) trees.push({ d, ...s }); })); // only finished sessions plant a tree
  if (!trees.length) return '';
  const last = trees.slice(-40);
  return `<section class="card">
    <h2 class="card-title">${t('focus.garden')} <small>${t('focus.sessions', { count: trees.length })}</small></h2>
    <div class="garden">${last.map(session => {
      const activity = state.schedule.activities.find(x => x.id === session.act);
      return `<img src="assets/icons/plant-${session.min >= 50 ? 5 : 4}.png" alt="" title="${formatShortDate(parseISO(session.d))} · ${activity ? esc(activity.name) + ' · ' : ''}${session.min} min">`;
    }).join('')}</div>
  </section>`;
}

// Controls of the Home card
function focusBoot() {
  const home = $('#view-home');
  home.addEventListener('click', e => {
    const target = e.target;
    const minutesButton = target.closest('[data-fcmin]');
    if (minutesButton) { setFocusMin(+minutesButton.dataset.fcmin); sfx('select'); return; }
    const stepButton = target.closest('[data-fcstep]');
    if (stepButton) { setFocusMin(state.settings.focusMin + +stepButton.dataset.fcstep); sfx('select'); return; }
    if (target.closest('[data-fcstart]')) { startFocus(state.settings.focusAct, state.settings.focusMin); return; }
    if (target.closest('[data-fopen]')) showFocus();
  });
  home.addEventListener('change', e => {
    if (e.target.matches('[data-fcact]')) { state.settings.focusAct = e.target.value; save(); }
    if (e.target.matches('[data-fccustom]')) setFocusMin(e.target.value);
  });
  home.addEventListener('keydown', e => {
    if (e.target.matches('[data-fccustom]') && e.key === 'Enter') { e.preventDefault(); setFocusMin(e.target.value); startFocus(state.settings.focusAct, state.settings.focusMin); }
  });
}
