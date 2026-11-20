/* Desktop app windows: the floating pomodoro, breaks between sessions and the floating note or metronome. */
'use strict';

// ---------------------------------------------------------
// Floating pomodoro
// ---------------------------------------------------------
const hasMini = () => !!(desktopApi && desktopApi.mini_open);
let lastMiniPush = 0;
/** Sends the current state to the floating window (at most every 450 ms unless forced). */
// ---------------------------------------------------------
// Floating note and metronome
// ---------------------------------------------------------
const canFloat = () => !!(desktopApi && desktopApi.float_open);
let metronomeFloating = false; // the floating window plays the metronome while it is open
function openFloat(kind, ref = '') {
  if (!canFloat()) return;
  if (kind === 'metro') { metronomeStop(); metronomeFloating = true; if (isSanctuaryOpen) refreshSanctuaryWidgets(['metro']); }
  sfx('select');
  desktopApi.float_open(kind, ref).catch(() => {});
}
function floatData(kind, ref) {
  if (kind === 'note') {
    const note = state.notes.find(n => n.id === ref);
    return note ? { kind, title: noteTitle(note), body: note.body, color: note.color, lang: currentLanguage() } : { kind, missing: true, lang: currentLanguage() };
  }
  if (kind === 'metro') {
    const settings = metronomeSettings();
    return { kind, bpm: settings.bpm, beats: settings.beats, volume: state.settings.volume / 100, lang: currentLanguage() };
  }
  return null;
}
function floatApply(kind, ref, data) {
  if (kind === 'note') {
    const note = state.notes.find(n => n.id === ref);
    if (!note || typeof data.body !== 'string') return false;
    note.body = data.body.slice(0, 20000);
    note.updated = nowStamp();
    save();
    const editor = $('#view-notes .ne-body');
    if (currentView === 'notes' && selectedNoteId === ref && editor && document.activeElement !== editor) renderNotes();
    else if (currentView === 'notes') refreshNoteCards();
    return true;
  }
  if (kind === 'metro') {
    const settings = metronomeSettings();
    if (+data.bpm >= 40 && +data.bpm <= 208) settings.bpm = Math.round(+data.bpm);
    if ([2, 3, 4, 6].includes(+data.beats)) settings.beats = +data.beats;
    const habit = settings.habit && state.habits.list.find(h => h.id === settings.habit), minutes = Math.round(+data.practiced || 0);
    if (habit && minutes >= 1) { // practice minutes, as when the metronome stops in the app
      state.practice[habit.id] = (state.practice[habit.id] || 0) + minutes;
      toast(t('workshop.metronome.practiceLogged', { min: minutes, habit: habit.name }), 'info', { icon: iconHTML(habit.icon) });
      commit();
    } else save();
    if (isSanctuaryOpen) refreshSanctuaryWidgets(['metro']);
    return true;
  }
  return false;
}
function floatClosed(kind) {
  if (kind === 'metro') { metronomeFloating = false; if (isSanctuaryOpen) refreshSanctuaryWidgets(['metro']); }
}

function miniPush(force) {
  if (!desktopApi || !desktopApi.mini_push) return;
  const now = Date.now();
  if (!force && now - lastMiniPush < 450) return;
  lastMiniPush = now;
  const payload = focus ? {
    running: true, paused: !!focus.paused, left: formatFocusLeft(), name: focus.name, isFree: !focus.actId, stage: focus.stage,
    pct: Math.max(0, Math.min(100, Math.round(100 - focusMsLeft() / (focus.min * 600)))),
  } : {
    running: false, defMin: state.settings.focusMin,
    brk: BREAK.end ? { left: formatMs(breakMsLeft()), min: BREAK.min } : null, offer: BREAK.offer ? BREAK.offerMin : 0,
  };
  payload.lang = currentLanguage(); // mini.html loads the same dictionaries
  desktopApi.mini_push(payload).catch(() => {});
}
/** Commands from the floating window (Python calls it with evaluate_js). */
function miniCmd(cmd) {
  if (cmd.startsWith('break:')) startBreak(+cmd.slice(6) || breakMinutes());
  else if (cmd === 'breakstop') endBreak(false);
  else if (cmd === 'pause' && focus) { const pauseButton = $('[data-fpause]', focus.el); if (pauseButton) pauseButton.click(); }
  else if (cmd === 'stop' && focus) endFocus(false);
  else if (cmd.startsWith('start:') && !focus) {
    setFocusMin(+cmd.slice(6) || state.settings.focusMin);
    startFocus(state.settings.focusAct, state.settings.focusMin);
    if (focus) { focus.el.hidden = true; focus.pill.hidden = false; }
  }
  miniPush(true);
}
function openMini() {
  if (!hasMini()) return;
  desktopApi.mini_open().catch(() => {});
  miniPush(true);
  if (focus && !focus.el.hidden) { focus.el.hidden = true; focus.pill.hidden = false; }
  sfx('select');
}

// A new session closes the break offer and any running break
appOn('focusStarting', () => { closeBreakOffer(); endBreak(false, true); });
// Floating-window button on the focus screen
appOn('focusStart', session => {
  miniPush(true);
  if (!hasMini()) return;
  const row = $('.btn-row', session.el);
  if (row) row.insertAdjacentHTML('afterbegin', `<button class="btn" data-fpop title="${esc(t('focus.floatingTip'))}">${ico('ui-float', '')} ${t('desktop.floating')}</button>`);
  session.el.addEventListener('click', e => { if (e.target.closest('[data-fpop]')) openMini(); });
});
appOn('focusTick', () => miniPush(false));
appOn('focusEnd', ({ finished }) => {
  if (finished) setTimeout(offerBreak, 2400); // after the tree finishes growing
  miniPush(true);
});

// ---------------------------------------------------------
// Pomodoro breaks
// ---------------------------------------------------------
const BREAK = { end: 0, min: 0, timer: 0, pill: null, offer: null, offerMin: 0, offerTimer: 0, notifyP: null };
const breakMinutes = () => { const sessions = (state.focusLog[todayISO()] || []).filter(s => !s.part).length; return sessions && sessions % 4 === 0 ? 15 : 5; };
const breakMsLeft = () => Math.max(0, BREAK.end - Date.now());
const formatMs = ms => { const seconds = Math.ceil(ms / 1000); return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`; };
function closeBreakOffer() {
  clearTimeout(BREAK.offerTimer);
  if (BREAK.offer) { BREAK.offer.remove(); BREAK.offer = null; }
  miniPush(true);
}
function offerBreak() {
  closeBreakOffer();
  const minutes = breakMinutes();
  const notNow = esc(t('desktop.notNow'));
  const offer = el('div', 'break-offer', `<span class="bo-ico">${ico('cat-drink', '☕')}</span>
    <span class="bo-text"><b>${t('desktop.breakOffer', { min: minutes })}</b><small>${t(minutes === 15 ? 'desktop.breakLongHint' : 'desktop.breakShortHint')}</small></span>
    <button class="btn btn-small btn-primary" data-bstart="${minutes}">▶ ${minutes}</button>
    <button class="icon-mini" data-bno title="${notNow}" aria-label="${notNow}">✕</button>`);
  document.body.append(offer);
  BREAK.offer = offer; BREAK.offerMin = minutes;
  offer.addEventListener('click', e => {
    const startButton = e.target.closest('[data-bstart]');
    if (startButton) startBreak(+startButton.dataset.bstart);
    else if (e.target.closest('[data-bno]')) { sfx('remove'); closeBreakOffer(); }
  });
  BREAK.offerTimer = setTimeout(closeBreakOffer, 90000);
  miniPush(true);
}
function startBreak(minutes) {
  if (focus) return;
  closeBreakOffer();
  endBreak(false, true);
  BREAK.min = minutes; BREAK.end = Date.now() + minutes * 60000;
  const pill = el('button', 'focus-pill break-pill', `${ico('cat-drink', '☕')}<b data-bpill></b>`);
  pill.title = t('desktop.breakPillTip');
  pill.setAttribute('aria-label', t('desktop.breakPillTip'));
  pill.addEventListener('click', () => { sfx('remove'); endBreak(false); });
  document.body.append(pill);
  BREAK.pill = pill;
  BREAK.timer = setInterval(breakTick, 500);
  breakTick();
  if (desktopApi && desktopApi.schedule_notify) {
    BREAK.notifyP = desktopApi.schedule_notify(minutes * 60, t('desktop.breakNotifyTitle'), t('desktop.breakNotifyBody')).catch(() => null);
  }
  sfx('page');
  if (currentView === 'home') renderHome();
}
function breakTick() {
  const left = breakMsLeft();
  if (!BREAK.end) return;
  if (left <= 0) { endBreak(true); return; }
  const text = formatMs(left);
  const pillTime = BREAK.pill && $('[data-bpill]', BREAK.pill); if (pillTime) pillTime.textContent = text;
  const cardTime = $('[data-brk]'); if (cardTime) cardTime.textContent = text;
  miniPush(false);
}
function endBreak(done, silent) {
  if (!BREAK.end) return;
  clearInterval(BREAK.timer);
  BREAK.end = 0;
  if (BREAK.pill) { BREAK.pill.remove(); BREAK.pill = null; }
  if (!done && BREAK.notifyP) { const pending = BREAK.notifyP; pending.then(id => { if (id) desktopApi.cancel_notify(id).catch(() => {}); }); }
  BREAK.notifyP = null;
  if (done && !silent) {
    sfx('achieve');
    toast(t('desktop.breakDoneHtml'), 'info', { icon: ico('cat-drink', '☕'), html: true });
  }
  miniPush(true);
  if (currentView === 'home') renderHome();
}
/** The focus card on Home shows the running break on top (features/focus.js calls it). */
function breakRowHTML() {
  if (!BREAK.end || focus) return '';
  const endLabel = esc(t('desktop.endBreak'));
  return `<div class="fc-break">${ico('cat-drink', '☕')}<span>${t('desktop.breakLabel')}</span><b data-brk>${formatMs(breakMsLeft())}</b>
    <button class="icon-mini" data-bstop title="${endLabel}" aria-label="${endLabel}">✕</button></div>`;
}

function desktopBoot() {
  $('#view-home').addEventListener('click', e => {
    if (e.target.closest('[data-fmini2]')) openMini();
    if (e.target.closest('[data-bstop]')) { sfx('remove'); endBreak(false); }
  });
}
