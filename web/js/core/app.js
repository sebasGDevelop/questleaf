/* App core: the sections, navigation, commit() after every change and the start-up sequence (boot). */
'use strict';

// ---------------------------------------------------------
// Views: registerView(id, { render, bind, tick?, reset?, onEscape? })
// ---------------------------------------------------------
const VIEWS = {};
let currentView = 'home';
function registerView(id, view) { VIEWS[id] = view; }

/** Shows a section (falls back to Home) and remembers it as the last one seen. */
function navigateTo(id) {
  if (!VIEWS[id]) id = 'home';
  if (id !== currentView) sfx('page');
  currentView = id;
  state.settings.lastView = id;
  $$('.view').forEach(view => { view.hidden = view.id !== `view-${id}`; });
  renderNav();
  VIEWS[id].render();
  window.scrollTo(0, 0);
  save();
}
function renderAll() {
  renderHUD();
  renderNav();
  if (VIEWS[currentView]) VIEWS[currentView].render();
  appEmit('render'); // features redraw their own parts (pins, open backpack…)
}
/** Every view can clear its temporary state (filters, selection…), e.g. after an import. */
function resetViewState() { Object.values(VIEWS).forEach(view => view.reset && view.reset()); }

/**
 * After any change to the progress: the app event `commit` lets features check their own
 * progress first (bosses, skills), then weekly challenges, goals and achievements are checked,
 * the game is saved, everything is redrawn and a level-up is celebrated.
 */
function commit() {
  appEmit('commit');
  checkChallenges();
  checkGoals();
  checkAchievements();
  save();
  renderAll();
  const level = levelInfo(totalXP()).level;
  if (level > lastLevel) levelUpFx(level);
  lastLevel = level;
}

// ---------------------------------------------------------
// Global events
// ---------------------------------------------------------
function bindGlobalEvents() {
  $('#navToggle').onclick = () => {
    state.settings.navCollapsed = !state.settings.navCollapsed;
    applyNav(); save(); sfx('select');
  };
  $('#profileBtn').onclick = () => (isProfileOpen ? closeProfile() : openProfile());
  $('#drawerBackdrop').onclick = closeProfile;
  $('#profileDrawer').addEventListener('click', e => {
    const target = e.target;
    if (target.closest('[data-close-profile]')) closeProfile();
    else if (target.closest('[data-photo-change]')) changePhoto();
    else if (target.closest('[data-photo-remove]')) removePhoto();
    else if (target.closest('[data-edit-profile]')) { closeProfile(); openSettingsModal('profile'); }
    else if (target.closest('[data-profiles]')) { closeProfile(); openProfilesModal(); }
    else if (target.closest('[data-add-hobby]')) addHobby();
    else if (target.closest('[data-del-hobby]')) removeHobby(+target.closest('[data-del-hobby]').dataset.delHobby);
  });
  $('#photoInput').onchange = e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoFromDataUrl(reader.result);
    reader.readAsDataURL(file);
  };
  $('#themeBtn').onclick = () => {
    state.settings.theme = resolvedTheme() === 'night' ? 'day' : 'night';
    applyTheme(); save(); sfx('select');
  };
  window.addEventListener('resize', () => { if (FX.raf) fxResize(); });
  $('#helpBtn').onclick = openHelpModal;
  $('#settingsBtn').onclick = () => openSettingsModal();
  $('#soundBtn').onclick = () => {
    state.settings.sound = !state.settings.sound;
    save(); renderHUD();
    sfx('select');
    toast(t(state.settings.sound ? 'hud.soundOn' : 'hud.soundOff'), 'info', { icon: state.settings.sound ? '🔊' : '🔇' });
  };
  // Any element with data-go="<section>" navigates (outside windows)
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-go]');
    if (link && !e.target.closest('.modal')) navigateTo(link.dataset.go);
  });
  // Achievement badges, in any section
  document.addEventListener('click', e => {
    const badge = e.target.closest('[data-ach]');
    if (badge) showAchievement(badge.dataset.ach);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (isModalOpen()) closeModal();
    else if (isProfileOpen) closeProfile();
    else if (VIEWS[currentView] && VIEWS[currentView].onEscape) VIEWS[currentView].onEscape();
  });
}

/** Icons for the fixed buttons written in index.html. */
function drawStaticIcons() {
  $('#view-schedule .pt-icon').innerHTML = ico('sec-schedule', '🗓️');
  $('#navToggle').innerHTML = ico('ui-menu', '☰');
  $('#sideToggle').innerHTML = ico('sec-lists', '📋');
  $('#helpBtn').innerHTML = ico('ui-help', '❓');
  $('#settingsBtn').innerHTML = ico('ui-settings', '⚙️');
  $('#trashIco').innerHTML = ico('ui-cauldron', '🗑️');
}

// ---------------------------------------------------------
// Start-up
// ---------------------------------------------------------
async function boot() {
  if (IS_DESKTOP) {
    desktopApi = await waitForDesktopApi(15000);
    if (!desktopApi) console.warn('Desktop bridge not available; using localStorage');
  }
  await languageGate();   // first run: choose the language (settings/language.js)
  translateStatic();      // texts written in index.html
  await profileGate();    // who is playing? (only with more than one profile)
  state = await load();
  ensureXpReform();       // keeps the player's XP across rule changes
  checkChallenges(true);
  lastLevel = levelInfo(totalXP()).level;
  checkAchievements(true);
  Object.values(VIEWS).forEach(view => view.bind && view.bind());
  bindGlobalEvents();
  drawStaticIcons();
  applyTheme();
  applyAnim();
  applyNav();
  applyZoom();
  syncTray();
  currentView = VIEWS[state.settings.lastView] ? state.settings.lastView : 'home';
  $$('.view').forEach(view => { view.hidden = view.id !== `view-${currentView}`; });
  // Feature modules, in order (each one binds its own events and timers)
  shopBoot();        // spirit stone shop and streak shields
  focusBoot();       // focus card on Home
  remindersBoot();   // Windows reminders, morning summary and habits nudge
  skyBoot();         // sky window and streak flame
  lookBoot();        // book binding and idle mode
  musicBoot();       // occasional music
  backpackBoot();    // backpack (M), pins and keyboard shortcuts
  challengesBoot();  // weekly challenges
  sanctuaryBoot();   // sanctuary: background and widgets (R)
  petBoot();         // spirit beast
  worldBoot();       // festivals and weather
  questsBoot();      // exam bosses, daily quest and skills
  workshopBoot();    // metronome, stickers and poem mode
  memoriesBoot();    // gratitude jar, time capsules and the year in review
  libraryBoot();     // covers, tags and quotes for books and movies
  desktopBoot();     // floating pomodoro and breaks
  searchBoot();      // Ctrl+K search
  recurringBoot();   // repeating to-dos
  layoutBoot();      // top bar fit, separators and Ctrl+0
  newsBoot();        // what's new, once after an update
  settingsBoot();    // reopens Settings after a language change
  renderAll();
  save(); // stores the migration or the starting content
  if (!state.setupDone) openWizard(); // new profile: setup wizard
  else if (!state.seenHelp) {
    openHelpModal();
    state.seenHelp = true;
    save();
  }
  profileTouch();
  // Every minute: current time, quests, streak… (skipped while dragging a schedule block)
  setInterval(() => {
    if (scheduleDrag) return;
    if (state.settings.theme === 'auto' && document.documentElement.dataset.theme !== resolvedTheme()) applyTheme();
    applyShieldsOnNewDay();
    renderHUD();
    const view = VIEWS[currentView];
    if (view && view.tick) view.tick();
  }, 60000);
}
