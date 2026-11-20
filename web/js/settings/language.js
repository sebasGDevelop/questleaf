/* Interface language: chosen on the first start and shared by every profile (kept outside the saves). */
'use strict';

const CONFIG_STORAGE_KEY = 'questleaf.config';

async function readAppConfig() {
  if (desktopApi && desktopApi.config_get) {
    try { return (await desktopApi.config_get()) || {}; } catch (e) { return {}; }
  }
  try { return JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY)) || {}; } catch (e) { return {}; }
}

async function writeAppConfig(key, value) {
  if (desktopApi && desktopApi.config_set) return desktopApi.config_set(key, value);
  const config = await readAppConfig();
  config[key] = value;
  try { localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config)); } catch (e) { return false; }
  return true;
}

/** First step of boot: applies the saved language or asks for one the first time the app runs. */
async function languageGate() {
  const config = await readAppConfig();
  if (isSupportedLanguage(config.language)) { setLanguage(config.language); return; }
  const chosen = await showLanguagePicker(detectLanguage());
  setLanguage(chosen);
  await writeAppConfig('language', chosen).catch(() => false);
}

/**
 * Full-screen picker. Every language is shown in its own words (endonyms), never as a flag,
 * and the title appears in all languages so anyone can find theirs.
 */
function showLanguagePicker(suggested) {
  return new Promise(resolve => {
    const textIn = (code, key) => lookupKey(i18n.dictionaries[code], key) || '';
    const ordered = [...LANGUAGES].sort((a, b) => (a.code === suggested ? -1 : b.code === suggested ? 1 : 0));
    const screen = el('div', 'gate-screen lang-screen');
    screen.setAttribute('role', 'dialog');
    screen.setAttribute('aria-modal', 'true');
    screen.setAttribute('aria-labelledby', 'langPickTitle');
    screen.innerHTML = `<div class="gate-box">
        <img class="gate-logo" src="icon.png" alt="">
        <h1 id="langPickTitle">${esc(textIn(suggested, 'language.pickTitle'))}</h1>
        <p class="gate-sub">${ordered.filter(l => l.code !== suggested).map(l => esc(textIn(l.code, 'language.pickTitle'))).join(' · ')}</p>
        <div class="lang-cards">
          ${ordered.map(l => `<button type="button" class="lang-card${l.code === suggested ? ' suggested' : ''}" data-lang="${l.code}" lang="${l.code}">
            <span class="lang-code" aria-hidden="true">${l.code.toUpperCase()}</span>
            <b>${esc(l.name)}</b>
            <small>${esc(textIn(l.code, 'language.tagline'))}</small>
          </button>`).join('')}
        </div>
        <p class="gate-hint">${ordered.map(l => `<span lang="${l.code}">${esc(textIn(l.code, 'language.changeLater'))}</span>`).join('<br>')}</p>
      </div>`;
    const cards = $$('.lang-card', screen);
    screen.addEventListener('click', e => {
      const card = e.target.closest('[data-lang]');
      if (!card) return;
      screen.classList.add('out');
      setTimeout(() => screen.remove(), 260);
      resolve(card.dataset.lang);
    });
    // Arrow keys move between the cards; Enter or Space chooses (native button behavior)
    screen.addEventListener('keydown', e => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const index = cards.indexOf(document.activeElement);
      cards[(index + step + cards.length) % cards.length].focus();
    });
    document.body.append(screen);
    cards[0].focus();
  });
}

/** From Settings: stores the new language and reloads the app, reopening Settings where the player was. */
async function changeLanguage(code) {
  if (!isSupportedLanguage(code) || code === currentLanguage()) return false;
  if (focus) { sfx('error'); toast(t('language.finishFocus'), 'warn'); return false; }
  await writeAppConfig('language', code).catch(() => false);
  await prepareReload();
  reloadApp({ reopenSettings: 'appearance' });
  return true;
}
