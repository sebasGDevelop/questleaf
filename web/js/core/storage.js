/* Where the save lives (a file through the desktop bridge, or the browser), the active profile, export, import and
   reset. */
'use strict';

const IS_DESKTOP = !!(window.chrome && window.chrome.webview); // WebView2 = desktop app
let desktopApi = null;                 // window.pywebview.api once the bridge is ready (null in the browser)
let saveChain = Promise.resolve();     // desktop saves run one after another, never in parallel
/** The profile being played (filled by profileGate in settings/profiles.js). */
let activeProfile = { id: MAIN_PROFILE, blank: false, list: [], newName: '' };
const saveStorageKey = () => (activeProfile.id === MAIN_PROFILE ? STORAGE_KEY : `${STORAGE_KEY}.${activeProfile.id}`);

function waitForDesktopApi(timeoutMs) {
  return new Promise(resolve => {
    const ready = () => window.pywebview && window.pywebview.api && window.pywebview.api.load;
    if (ready()) return resolve(window.pywebview.api);
    const timer = setTimeout(() => resolve(ready() ? window.pywebview.api : null), timeoutMs);
    window.addEventListener('pywebviewready', () => { clearTimeout(timer); resolve(window.pywebview.api); }, { once: true });
  });
}

/** Reads the save (or the seed) and always returns a normalized state. */
async function load() {
  try {
    const raw = desktopApi
      ? await desktopApi.load()
      : localStorage.getItem(saveStorageKey());
    return normalize(raw ? JSON.parse(raw) : seedState());
  } catch (e) {
    console.warn('Could not read the saved game', e);
    return normalize(seedState());
  }
}

function save() {
  const json = JSON.stringify(state);
  if (desktopApi) {
    saveChain = saveChain
      .then(() => desktopApi.save(json))
      .catch(e => { console.error(e); toast(t('data.saveFailed'), 'warn'); });
    return;
  }
  try { localStorage.setItem(saveStorageKey(), json); } catch (e) { toast(t('data.saveFailed'), 'warn'); }
}
/** "on your PC" / "in this browser" */
const saveLocationText = () => t(desktopApi ? 'data.savedOnPc' : 'data.savedInBrowser');

// ---------------------------------------------------------
// Replacing the whole game (import and reset)
// ---------------------------------------------------------
function replaceState(newState) {
  state = newState;
  state.seenHelp = true;
  ensureXpReform();       // as on start: otherwise the level would change after reopening the app
  checkChallenges(true);
  lastLevel = levelInfo(totalXP()).level;
  checkAchievements(true);
  resetViewState();
  applyNav(); applyZoom(); applyTheme(); applyAnim(); applyLook();
}

/** Back to the seed: the starting content on the main profile, empty with the setup wizard on the others. */
function resetGame() {
  closeAllModals();
  replaceState(normalize(seedState()));
  navigateTo('home');
  commit();
  if (!state.setupDone) openWizard();
  else toast(t('data.newGame'), 'info', { icon: '🎮' });
}

/** Replaces the game with the content of a save file (Settings → Save data asks for confirmation first). */
function importText(text) {
  try {
    const data = JSON.parse(text);
    const valid = isPlainObject(data) && (data.version >= 2 || (Array.isArray(data.activities) && Array.isArray(data.blocks)));
    if (!valid) throw new Error('Invalid save format');
    replaceState(normalize(data));
    closeModal();
    navigateTo(state.settings.lastView);
    commit();
    toast(t('data.imported'), 'info', { icon: '📂' });
  } catch (e) {
    sfx('error');
    toast(t('data.invalidFile'), 'warn');
  }
}

async function exportData() {
  state.settings.lastExport = todayISO(); // the copy carries the date too
  save();
  const json = JSON.stringify(state, null, 2);
  const filename = `questleaf-${todayISO()}.json`;
  if (desktopApi) {
    try {
      if (await desktopApi.export_file(json, filename)) toast(t('data.exported'), 'info', { icon: '💾' });
    } catch (e) {
      console.error(e);
      toast(t('data.exportFailed'), 'warn');
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = el('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t('data.exported'), 'info', { icon: '💾' });
}

// ---------------------------------------------------------
// Reloading the app (after switching profile or language)
// ---------------------------------------------------------
const SESSION_KEYS = { profilePicked: 'lia-picked', reopenSettings: 'lia-reopen-settings' };

/** Flushes pending saves and closes the floating focus window. Call it BEFORE switching profile. */
async function prepareReload() {
  save();
  await saveChain.catch(() => {});
  if (desktopApi && desktopApi.mini_close) await desktopApi.mini_close().catch(() => {});
}
/** Reloads without asking for the profile again; optionally reopens Settings on a tab. */
function reloadApp({ reopenSettings = '' } = {}) {
  try {
    sessionStorage.setItem(SESSION_KEYS.profilePicked, '1');
    if (reopenSettings) sessionStorage.setItem(SESSION_KEYS.reopenSettings, reopenSettings);
  } catch (e) { /* private mode: the profile picker may show again */ }
  sfx('page');
  document.body.classList.add('prof-leaving');
  setTimeout(() => location.reload(), 260);
}
