/* Top bar, menu ribbons, profile card, day and night theme, zoom and the help window. */
'use strict';

// ---------------------------------------------------------
// Day / night theme ('auto': night from 7 p.m. to 6 a.m.)
// ---------------------------------------------------------
function resolvedTheme() {
  const theme = state.settings.theme;
  if (theme !== 'auto') return theme;
  const hour = new Date().getHours();
  return hour >= 19 || hour < 6 ? 'night' : 'day';
}
function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  const button = $('#themeBtn');
  button.innerHTML = theme === 'night' ? ico('ui-night', '🌙') : ico('ui-day', '☀️');
  button.title = t(theme === 'night' ? 'hud.themeNight' : 'hud.themeDay');
}

// ---------------------------------------------------------
// Top bar
// ---------------------------------------------------------
function renderHUD() {
  const L = levelInfo(totalXP());
  $('#hudPhoto').innerHTML = photoHTML();
  $('#playerName').textContent = state.profile.name || t('app.defaultName');
  const playerTitle = t('hud.playerTitle', { realm: titleFor(L.level), level: L.level });
  $('#playerTitle').textContent = playerTitle;
  $('#playerTitle').title = playerTitle; // the realm may be cut with an ellipsis: the full text stays available
  $('#xpFill').style.width = `${(L.cur / L.need * 100).toFixed(1)}%`;
  $('#hudXp').title = t('hud.xpToNext', { current: L.cur, needed: L.need, next: L.level + 1 });
  $('#shopBtn').innerHTML = `${ico('ui-stones', '💎')}<b>${formatNumber(stones())}</b>`;
  const soundButton = $('#soundBtn');
  soundButton.innerHTML = ico('ui-sound', state.settings.sound ? '🔊' : '🔇');
  soundButton.classList.toggle('muted', !state.settings.sound);
  soundButton.title = t(state.settings.sound ? 'hud.soundOnTitle' : 'hud.soundOffTitle');
  if (isProfileOpen) renderProfile();
  appEmit('hudRender'); // features/layout.js fits the bar to the window
}

// ---------------------------------------------------------
// Profile photo: the uploaded photo, or the initial of the name
// ---------------------------------------------------------
function photoHTML() {
  if (state.profile.photo) return `<img class="photo-img" src="${state.profile.photo}" alt="${esc(t('photo.alt'))}">`;
  const initial = (state.profile.name || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="initial-avatar">${esc(initial)}</span>`;
}
async function changePhoto() {
  try {
    if (!(desktopApi && desktopApi.pick_image)) { $('#photoInput').click(); return; } // the browser continues in its "change" event
    const dataUrl = await desktopApi.pick_image();
    if (dataUrl) await setPhotoFromDataUrl(dataUrl);
  } catch (e) {
    console.error(e);
    toast(t('photo.cantOpen'), 'warn');
  }
}
/** stack: true when asked from another window (Settings), so it returns to it. */
function removePhoto({ stack = false } = {}) {
  confirmModal(esc(t('photo.removeConfirm')), () => {
    state.profile.photo = ''; sfx('remove'); commit();
    appEmit('foto');
  }, t('common.yesRemove'), { stack });
}
/** Crops to the center and stores it at 320×320 (sharp but light). */
function setPhotoFromDataUrl(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const SIZE = 320, canvas = document.createElement('canvas');
      canvas.width = canvas.height = SIZE;
      const side = Math.min(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
      state.profile.photo = canvas.toDataURL('image/jpeg', 0.9);
      sfx('place');
      commit();
      toast(t('photo.updated'), 'info', { icon: '📷' });
      appEmit('foto');
      resolve(true);
    };
    img.onerror = () => { toast(t('photo.notImage'), 'warn'); resolve(false); };
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------
// Profile drawer: character, stats and achievements
// ---------------------------------------------------------
let isProfileOpen = false;
function openProfile() {
  isProfileOpen = true;
  renderProfile();
  $('#profileDrawer').hidden = false;
  $('#drawerBackdrop').hidden = false;
  requestAnimationFrame(() => { $('#profileDrawer').classList.add('open'); $('#drawerBackdrop').classList.add('open'); });
  sfx('page');
}
function closeProfile() {
  isProfileOpen = false;
  $('#profileDrawer').classList.remove('open');
  $('#drawerBackdrop').classList.remove('open');
  setTimeout(() => { if (!isProfileOpen) { $('#profileDrawer').hidden = true; $('#drawerBackdrop').hidden = true; } }, 200);
}
function renderProfile() {
  const profile = state.profile;
  const L = levelInfo(totalXP()), realm = realmInfo(L.level), totals = aggregates();
  const perfectDays = Object.values(state.schedule.log).filter(day => day.__clear).length;
  const unlocked = ACHIEVEMENTS.filter(a => state.achievements[a.id]).length;
  const tileColor = key => (key.startsWith('sec-') ? sectionColor(key.slice(4))
    : key === 'hud-streak' ? '#f6b98a' : key === 'cat-study' ? sectionColor('books') : '#f6d38a');
  // One stat tile; the label key is a plural entry chosen by the value
  const tile = (key, emoji, count, labelKey, extra = '') =>
    `<div class="pf-stat" style="--c:${tileColor(key)}"><span class="pf-stat-ico">${ico(key, emoji)}</span><b>${formatNumber(count)}</b><small>${t(`profileCard.${labelKey}`, { count })}${extra}</small></div>`;
  const shields = state.shop.shields ? ` · ${ico('ui-shield', '🛡')}×${state.shop.shields}` : '';
  const photoLabel = t(profile.photo ? 'profileCard.changePhoto' : 'profileCard.uploadPhoto');
  $('#profileDrawer').innerHTML = `
    <div class="drawer-bar"><span>${t('profileCard.title')}</span><button class="modal-x" data-close-profile aria-label="${esc(t('common.close'))}">✕</button></div>
    <div class="drawer-body">
      <section class="pf-top">
        <button class="pf-photo" data-photo-change title="${esc(photoLabel)}" aria-label="${esc(photoLabel)}">${photoHTML()}<span class="pf-cam">${UI_ICON.edit}</span></button>
        ${profile.photo ? `<button class="link-btn" data-photo-remove>${t('profileCard.removePhoto')}</button>` : ''}
        <h2 class="pf-name">${esc(profile.name)} <button class="icon-mini" data-edit-profile title="${esc(t('profileCard.edit'))}" aria-label="${esc(t('profileCard.edit'))}">${UI_ICON.edit}</button></h2>
        ${profile.motto ? `<p class="motto">“${esc(profile.motto)}”</p>` : ''}
        <button class="link-btn pf-switch" data-profiles>${t('profileCard.switchProfile')}</button>
        <div class="pf-level">
          <div class="pf-level-info">
            <b>${t('profileCard.realmStage', { realm: realm.name, stage: realm.stage })}</b>
            <small class="muted">${t('profileCard.level', { level: L.level })}</small>
            <div class="xpbar wide"><div class="xpfill" style="width:${(L.cur / L.need * 100).toFixed(1)}%"></div><span>${L.cur} / ${L.need} XP</span></div>
          </div>
        </div>
      </section>
      <section class="card">
        <h2 class="card-title">${t('profileCard.hobbies')}</h2>
        <div class="chips">
          ${profile.hobbies.map((hobby, i) => `<span class="chip hobby" style="--c:${colorFor(hobby)}">${esc(hobby)}<button class="chip-x" data-del-hobby="${i}" aria-label="${esc(t('common.removeNamed', { name: hobby }))}">×</button></span>`).join('')}
          <button class="chip chip-add" data-add-hobby title="${esc(t('profileCard.addHobby'))}" aria-label="${esc(t('profileCard.addHobby'))}">+</button>
        </div>
      </section>
      <section class="card">
        <h2 class="card-title">${t('profileCard.cultivationPath')}</h2>
        ${realmPathHTML()}
      </section>
      ${gardenHTML()}
      <section class="card">
        <h2 class="card-title">${t('profileCard.stats')}</h2>
        <div class="pf-stats">
          ${tile('hud-streak', '🔥', totals.streak, 'streakDays', shields)}
          ${tile('cat-study', '📖', pagesRead(), 'pagesRead')}
          ${tile('sec-books', '📚', totals.booksDone, 'booksRead')}
          ${tile('sec-movies', '🎬', totals.moviesDone, 'moviesWatched')}
          ${tile('sec-workout', '🏋️', totals.workouts, 'workouts')}
          ${tile('sec-habits', '🌱', totals.habits, 'habitsChecked')}
          ${tile('sec-university', '🎓', totals.uniDone, 'universityDone')}
          ${tile('sec-schedule', '🗓️', totals.completions, 'blocksDone')}
          ${tile('achievement-clear', '🏆', perfectDays, 'perfectDays')}
        </div>
      </section>
      <section class="card">
        <h2 class="card-title">${t('profileCard.achievements')} <small>${unlocked}/${ACHIEVEMENTS.length}</small></h2>
        <div class="badges">
          ${ACHIEVEMENTS.map(a => {
            const isUnlocked = !!state.achievements[a.id];
            return `<button class="badge ${isUnlocked ? 'unlocked' : 'locked'}" data-ach="${a.id}" title="${esc(`${a.name} — ${a.desc}`)}" aria-label="${esc(a.name)}">${isUnlocked ? ico(`achievement-${a.id}`, a.icon) : ico('achievement-locked', '🔒')}</button>`;
          }).join('')}
        </div>
      </section>
    </div>`;
}
function addHobby() {
  promptModal({ title: t('profileCard.newHobby'), label: t('common.nameLabel'), placeholder: t('profileCard.hobbyPlaceholder'), max: 30, okLabel: t('common.addUpper'),
    onOk: hobby => { state.profile.hobbies.push(hobby); sfx('place'); commit(); } });
}
function removeHobby(index) {
  state.profile.hobbies.splice(index, 1);
  sfx('remove');
  commit();
}
/** The cultivation realms drawn as a winding path, with the player's photo on the current one. */
function realmPathHTML() {
  const L = levelInfo(totalXP()), current = realmInfo(L.level).index;
  const count = REALMS.length, ROW = 64, WIDTH = 300;
  const points = REALMS.map((realm, i) => ({ x: i % 2 ? WIDTH * 0.68 : WIDTH * 0.32, y: (count - 1 - i) * ROW + 34 }));
  const path = points.map((p, i) => (i ? `S ${points[i - 1].x} ${p.y + ROW / 2} ${p.x} ${p.y}` : `M ${p.x} ${p.y}`)).join(' ');
  const nextMin = REALMS[current + 1] ? REALMS[current + 1].minLevel : null;
  const currentMin = REALMS[current].minLevel;
  const percent = nextMin ? Math.min(100, ((L.level - currentMin) + L.cur / L.need) / (nextMin - currentMin) * 100) : 100;
  return `<div class="realm-path" style="height:${count * ROW + 10}px">
    <svg viewBox="0 0 ${WIDTH} ${count * ROW + 10}" preserveAspectRatio="none"><path d="${path}" /></svg>
    ${REALMS.map((realm, i) => {
      const p = points[i], status = i < current ? 'past' : i === current ? 'here' : 'future';
      const name = realmName(i);
      return `<div class="rp-node ${status}" style="left:${p.x / WIDTH * 100}%;top:${p.y}px;--rc:${realm.colors[0]}" title="${esc(t('profileCard.realmFrom', { realm: name, level: realm.minLevel }))}">
        ${i === current
          ? `<span class="rp-photo">${photoHTML()}</span><svg class="rp-ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" style="stroke-dasharray:${percent.toFixed(1)} 100" pathLength="100"/></svg>`
          : `<span class="rp-gem">${i < current ? '✓' : ''}</span>`}
        <span class="rp-label ${i % 2 ? 'left' : 'right'}"><b>${esc(name)}</b><small>${t('profileCard.levelShort', { level: realm.minLevel })}</small></span>
      </div>`;
    }).join('')}
  </div>`;
}
/** Toast with an achievement's name, description and unlock date (badges anywhere use data-ach). */
function showAchievement(id) {
  const achievement = ACHIEVEMENTS.find(a => a.id === id);
  if (!achievement) return;
  const unlockedOn = state.achievements[achievement.id];
  const dateLine = unlockedOn ? `<br><span class="muted">${tHtml('achievements.unlockedOn', { date: formatShortDate(parseISO(unlockedOn)) })}</span>` : '';
  toast(`<b>${esc(achievement.name)}</b><br>${esc(achievement.desc)}${dateLine}`, unlockedOn ? 'achieve' : 'info',
    { icon: unlockedOn ? achievement.icon : '🔒', html: true });
}

// ---------------------------------------------------------
// Menu ribbons, collapsible menu, window zoom and the tray
// ---------------------------------------------------------
function renderNav() {
  $('#ribbons').innerHTML = visibleSections().map((s, i) => `
    <button class="ribbon${s.id === currentView ? ' active' : ''}" data-go="${s.id}" style="--rc:${s.color}" title="${esc(i < 10 ? t('hud.sectionKey', { label: s.label, key: (i + 1) % 10 }) : s.label)}"
      aria-current="${s.id === currentView ? 'page' : 'false'}">
      <span class="r-icon">${ico(`sec-${s.id}`, s.icon)}</span><span class="r-label">${s.label}</span>
      ${s.id === 'calendar' && chroniclePending() ? `<i class="r-dot" title="${esc(t('hud.chroniclePending'))}"></i>` : ''}
    </button>`).join('');
}
function applyNav() {
  $('.shell').classList.toggle('nav-collapsed', !!state.settings.navCollapsed);
  $('#navToggle').classList.toggle('on', !state.settings.navCollapsed);
}
/** 'auto' size: bigger on big screens (e.g. 27" at 2560 px). screen.width does not change with the zoom. */
function autoScale() {
  const width = screen.width;
  return width >= 3000 ? 1.4 : width >= 2400 ? 1.25 : width >= 1900 ? 1.1 : 1;
}
async function applyZoom() {
  if (!desktopApi || !desktopApi.set_zoom) return; // in the browser: Ctrl + / Ctrl −
  try {
    await desktopApi.set_zoom(state.settings.uiScale === 'auto' ? autoScale() : state.settings.uiScale);
  } catch (e) { console.warn('Could not apply the zoom', e); }
}
/** Tells Python whether the X hides the app in the tray (so reminders keep arriving). */
function syncTray() {
  if (desktopApi && desktopApi.set_close_to_tray) desktopApi.set_close_to_tray(!!state.settings.closeToTray).catch(() => {});
}

// ---------------------------------------------------------
// Help window
// ---------------------------------------------------------
function openHelpModal() {
  const item = (icon, color, key, params) =>
    `<li><span class="help-ico" style="--c:${color}">${icon}</span><span>${tHtml(`help.${key}`, params)}</span></li>`;
  const realms = REALMS.map((realm, i) => realmName(i)).join(' → ');
  openModal({
    title: t('help.title'),
    wide: true,
    body: `
      <ul class="help-list">
        ${item(ico('sec-home', '📖'), sectionColor('home'), 'bookHtml')}
        ${item(ico('sec-schedule', '🗓️'), sectionColor('schedule'), 'scheduleHtml')}
        ${item(ico('sec-habits', '🌱'), sectionColor('habits'), 'dailyHtml', { easy: CHALLENGE_XP[0], medium: CHALLENGE_XP[1], hard: CHALLENGE_XP[2] })}
        ${item(ico('sec-books', '📚'), sectionColor('books'), 'xpHtml', {
          goalMin: GOAL_SIZES[0].xp, goalMax: GOAL_SIZES[GOAL_SIZES.length - 1].xp, focusMinutes: XP.focusMinutesPerXp,
          task: XP.task, project: XP.project, movie: XP.movie,
        })}
        ${item(ico('hud-streak', '🔥'), '#f6b98a', 'streakHtml')}
        ${item(ico('hud-xp', '✨'), '#a9cbe8', 'realmsHtml', { realms })}
        ${item(ico('ui-night', '🌙'), '#b8b4ec', 'settingsHtml')}
        ${item(ico('ui-backpack', '🎒'), '#cfe3a0', 'backpackHtml')}
        ${item(ico('ui-sanctuary', '⛺'), '#7bcbbb', 'sanctuaryHtml')}
        ${item(ico('ui-info', '💾'), '#e3c49f', 'savedHtml', { where: saveLocationText() })}
      </ul>`,
    footer: `<span class="spacer"></span><button class="btn btn-primary" data-close>${t('common.letsGo')}</button>`,
  });
}
