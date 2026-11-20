/* Settings: one window with tabs; every change is applied and saved at once. */
'use strict';

const SETTINGS_TABS = [
  { id: 'profile', icon: ['ui-personal', '🙂'] },
  { id: 'appearance', icon: ['cat-art', '🎨'] },
  { id: 'sound', icon: ['ui-sound', '🔊'] },
  { id: 'schedule', icon: ['sec-schedule', '⏳'] },
  { id: 'notifications', icon: ['ui-letter', '✉'] },
  { id: 'data', icon: ['ui-folder', '📂'] },
];
const settingsUi = { tab: 'profile', modal: null, savedTimer: 0, nameTimer: 0 };
const SETTINGS_PANES = {};

// ---------------------------------------------------------
// Building blocks
// ---------------------------------------------------------
const settingsSection = (title, inner, cls = '') =>
  `<section class="set-sec${cls ? ` ${cls}` : ''}"><h3 class="set-sec-title">${title}</h3>${inner}</section>`;
/** A checkbox; its hint is a tooltip unless it warns of a consequence (visible = true). */
const settingsCheck = (name, checked, label, hint = '', visible = false) =>
  `<label class="check"${hint && !visible ? ` title="${esc(hint)}"` : ''}><input type="checkbox" name="${name}"${checked ? ' checked' : ''}><span>${label}${hint && visible ? `<small class="set-hint">${hint}</small>` : ''}</span></label>`;
const settingsHint = text => `<small class="set-hint">${text}</small>`;
/** Round color buttons for leather and accent. group is the dictionary group under look.* */
const swatchGroup = (name, ariaLabel, list, group, current) =>
  `<div class="look-swatches" data-sw="${name}" role="radiogroup" aria-label="${esc(ariaLabel)}">${list.map(([key, color]) => {
    const label = t(`look.${group}.${key}`);
    return `<button type="button" class="${key === current ? 'on' : ''}" data-v="${key}" role="radio" aria-checked="${key === current}" title="${esc(label)}" style="--c:${color}"><span></span><small>${label}</small></button>`;
  }).join('')}</div>`;
const hourOptions24 = (from, to, current) =>
  range(from, to).map(h => `<option value="${h}"${h === current ? ' selected' : ''}>${formatHour(h)}</option>`).join('');

/** Every change saves itself; the footer confirms it for a moment. */
function markSaved(message = t('settings.saved')) {
  save();
  const status = settingsUi.modal && $('[data-set-status]', settingsUi.modal);
  if (!status) return;
  status.textContent = `✓ ${message}`;
  status.classList.add('on');
  clearTimeout(settingsUi.savedTimer);
  settingsUi.savedTimer = setTimeout(() => { status.classList.remove('on'); status.textContent = t('settings.autosave'); }, 1600);
}

// ---------------------------------------------------------
// Tab: Profile
// ---------------------------------------------------------
SETTINGS_PANES.profile = {
  html() {
    const profile = state.profile;
    const photoLabel = t(profile.photo ? 'settings.profile.changePhoto' : 'settings.profile.uploadPhoto');
    return settingsSection(t('settings.profile.section'), `
      <div class="set-profile">
        <div class="set-photo-col">
          <button type="button" class="pf-photo set-photo" data-photo title="${esc(photoLabel)}" aria-label="${esc(photoLabel)}">${photoHTML()}<span class="pf-cam">${UI_ICON.edit}</span></button>
          ${profile.photo
            ? `<button type="button" class="link-btn" data-photo-remove>${t('settings.profile.removePhoto')}</button>`
            : ''}
        </div>
        <div>
          <label class="field"><span>${t('settings.profile.name')}</span><input type="text" name="name" maxlength="24" value="${esc(profile.name)}"></label>
          <label class="field"><span>${t('settings.profile.motto')}</span><input type="text" name="motto" maxlength="140" value="${esc(profile.motto)}" placeholder="${esc(t('settings.profile.mottoPlaceholder'))}"></label>
          <label class="field"><span>${t('settings.profile.birthday')}</span><input type="date" name="birthday" value="${esc(profile.birthday)}" title="${esc(t('settings.profile.birthdayHint'))}"></label>
        </div>
      </div>
      <p class="set-note">${UI_ICON.info}<span>${t('settings.profile.statsNoteBefore')}
        <button type="button" class="link-btn" data-open-profile>${t('settings.profile.statsNoteLink')}</button>.</span></p>`)
      + settingsSection(t('settings.profile.profilesSection'), `<div data-prof-cards title="${esc(t('settings.profile.profilesHint'))}">${settingsHint(t('settings.profile.loadingProfiles'))}</div>`);
  },
  bind(form, pane) {
    const profile = state.profile;
    form.name.addEventListener('input', () => {
      const value = form.name.value.trim();
      if (!value) return; // an empty name is never saved: leaving the field restores the previous one
      profile.name = value.slice(0, 24);
      renderHUD();
      clearTimeout(settingsUi.nameTimer);
      settingsUi.nameTimer = setTimeout(() => { markSaved(); profileTouch(); }, 500);
    });
    form.name.addEventListener('change', () => {
      clearTimeout(settingsUi.nameTimer);
      if (!form.name.value.trim()) { form.name.value = profile.name; sfx('error'); toast(t('settings.profile.nameEmpty'), 'warn'); return; }
      markSaved(); profileTouch(); renderAll();
    });
    form.motto.addEventListener('change', () => { profile.motto = form.motto.value.trim().slice(0, 140); markSaved(); renderAll(); });
    form.birthday.addEventListener('change', () => { profile.birthday = form.birthday.value; markSaved(); FX.night = null; applyWeather(); });
    $('[data-photo]', pane).onclick = () => changePhoto(); // the 'foto' event redraws this tab when it arrives
    const removeButton = $('[data-photo-remove]', pane);
    if (removeButton) removeButton.onclick = () => removePhoto({ stack: true });
    $('[data-open-profile]', pane).onclick = () => { closeAllModals(); openProfile(); };
    const cardsBox = $('[data-prof-cards]', pane);
    profilesGet().then(info => {
      if (!cardsBox.isConnected) return;
      activeProfile.list = info.list;
      cardsBox.innerHTML = profilesCardsHTML(info.list);
      bindProfilesCards(cardsBox, info.list, refreshSettingsTab, { stack: true });
    }).catch(() => { cardsBox.innerHTML = settingsHint(t('settings.profile.profilesError')); });
  },
};
appOn('foto', () => { if (settingsUi.modal && settingsUi.modal.isConnected && settingsUi.tab === 'profile') refreshSettingsTab(); });

// ---------------------------------------------------------
// Tab: Appearance (and language)
// ---------------------------------------------------------
SETTINGS_PANES.appearance = {
  html() {
    const s = state.settings;
    const moodOptions = Object.entries(MOOD_PALETTES).map(([key, colors]) =>
      [key, `${t(`look.moodPalettes.${key}`)} <span class="mood-dots">${colors.map(c => `<i style="--c:${c}"></i>`).join('')}</span>`]);
    const cityHint = s.weather.city ? t('settings.appearance.cityCurrent', { city: s.weather.city }) : t('settings.appearance.cityNone');
    return settingsSection(t('settings.appearance.language'), `${segHTML('language', LANGUAGES.map(l => [l.code, `<span lang="${l.code}">${esc(l.name)}</span>`]))}
        ${settingsHint(t('settings.appearance.languageHint'))}`)
      + settingsSection(t('settings.appearance.theme'), `${segHTML('theme', [
          ['day', `${ico('ui-day', '☀️')}${t('settings.appearance.themeDay')}`],
          ['night', `${ico('ui-night', '🌙')}${t('settings.appearance.themeNight')}`],
          ['auto', `<span title="${esc(t('settings.appearance.themeHint'))}">${t('settings.appearance.themeAuto')}</span>`]])}`)
      + settingsSection(t('settings.appearance.binding'), `<div class="field"><span>${t('settings.appearance.leather')}</span>${swatchGroup('leather', t('settings.appearance.leather'), LEATHERS, 'leathers', s.leather)}</div>
        <div class="field"><span>${t('settings.appearance.accent')}</span>${swatchGroup('accent', t('settings.appearance.accent'), ACCENTS, 'accents', s.accent)}</div>`)
      + settingsSection(t('settings.appearance.background'), `${segHTML('bg', [
          ['leaves', t('settings.appearance.backgroundLeaves')], ['plain', t('settings.appearance.backgroundPlain')], ['image', t('settings.appearance.backgroundImage')]])}
        <div class="btn-group">
          <button type="button" class="btn btn-ico" data-bgpick>${ico('ui-landscape', '🖼')}${t('settings.appearance.pickImage')}</button>
          <button type="button" class="btn btn-ico" data-bgclear${s.bgImage ? '' : ' disabled'}>${UI_ICON.del}${t('settings.appearance.removeImage')}</button>
        </div>`)
      + settingsSection(t('settings.appearance.sky'), `<div class="set-checks">
          ${settingsCheck('seasons', s.seasons, t('settings.appearance.seasons'), t('settings.appearance.seasonsHint'))}
          ${settingsCheck('festivals', s.festivals, t('settings.appearance.festivals'), t('settings.appearance.festivalsHint'))}</div>
        <div class="field"><span>${t('settings.appearance.weather')}</span>
          <div class="btn-row city-row">
            <input type="text" name="city" maxlength="60" placeholder="${esc(t('settings.appearance.cityPlaceholder'))}" value="${esc(s.weather.city)}" aria-label="${esc(t('settings.appearance.cityAria'))}">
            <button type="button" class="btn btn-ico" data-citysearch>${ico('ui-search', '🔍')}${t('settings.appearance.search')}</button>
          </div>
          <div class="city-results" data-cityres></div>
          <small class="set-hint" data-cityhint>${esc(cityHint)}</small></div>`)
      + settingsSection(t('settings.appearance.details'), `<div class="row2">
          ${desktopApi ? `<label class="field"><span>${t('settings.appearance.interfaceSize')}</span>
            <select name="scale" title="${esc(t('settings.appearance.interfaceSizeHintDesktop'))}">
              <option value="auto"${s.uiScale === 'auto' ? ' selected' : ''}>${t('settings.appearance.interfaceSizeAuto')}</option>
              ${UI_SCALES.map(v => `<option value="${v}"${s.uiScale === v ? ' selected' : ''}>${Math.round(v * 100)} %</option>`).join('')}
            </select></label>`
            : `<div class="field"><span>${t('settings.appearance.interfaceSize')}</span>${settingsHint(t('settings.appearance.interfaceSizeHintBrowser'))}</div>`}
          <div class="field"><span>${t('settings.appearance.moodColors')}</span>${segHTML('moodPalette', moodOptions)}</div>
        </div>
        <div class="set-checks">
          ${settingsCheck('anim', s.anim, t('settings.appearance.animations'), t('settings.appearance.animationsHint'))}
          ${settingsCheck('cursor', s.cursor, t('settings.appearance.cursor'))}</div>`);
  },
  bind(form, pane) {
    const s = state.settings;
    const applyAppearance = () => { applyLook(); applyAnim(); markSaved(); };
    bindSeg(pane, 'language', currentLanguage, code => changeLanguage(code));
    bindSeg(pane, 'theme', () => s.theme, value => {
      s.theme = value; applyTheme(); markSaved();
    });
    $$('[data-sw]', pane).forEach(group => group.addEventListener('click', e => {
      const button = e.target.closest('[data-v]');
      if (!button) return;
      s[group.dataset.sw] = button.dataset.v;
      $$('[data-v]', group).forEach(x => { x.classList.toggle('on', x === button); x.setAttribute('aria-checked', x === button); });
      sfx('select'); applyAppearance();
    }));
    const clearButton = $('[data-bgclear]', pane);
    const syncBackground = bindSeg(pane, 'bg', () => s.bg, async value => {
      if (value === 'image' && !s.bgImage) {
        const url = await pickBackgroundAny();
        if (!url) { syncBackground(); return; } // cancelled: the previous background stays
        s.bgImage = url; clearButton.disabled = false;
      }
      s.bg = value; syncBackground(); applyAppearance();
    });
    $('[data-bgpick]', pane).onclick = async () => {
      const url = await pickBackgroundAny();
      if (!url) return;
      s.bgImage = url; s.bg = 'image'; clearButton.disabled = false; syncBackground(); applyAppearance();
      toast(t('settings.appearance.backgroundUpdated'), 'info', { icon: ico('ui-landscape', '🖼') });
    };
    clearButton.onclick = () => {
      s.bgImage = '';
      if (s.bg === 'image') s.bg = 'leaves';
      clearButton.disabled = true; syncBackground(); applyAppearance();
    };
    form.seasons.onchange = () => { s.seasons = form.seasons.checked; FX.night = null; applyAppearance(); };
    form.festivals.onchange = () => { s.festivals = form.festivals.checked; FX.night = null; applyAppearance(); applyWeather(); };
    form.anim.onchange = () => { s.anim = form.anim.checked; applyAppearance(); };
    form.cursor.onchange = () => { s.cursor = form.cursor.checked; applyAppearance(); };
    bindSeg(pane, 'moodPalette', () => s.moodPalette, value => { s.moodPalette = value; applyAppearance(); });
    if (form.scale) form.scale.onchange = () => { s.uiScale = form.scale.value === 'auto' ? 'auto' : +form.scale.value; applyZoom(); markSaved(); };
    bindCitySearch(form, pane);
  },
};

/** Weather: search the city and pick one of the results. An empty search removes it. */
function bindCitySearch(form, pane) {
  const s = state.settings, results = $('[data-cityres]', pane), hint = $('[data-cityhint]', pane);
  const search = async () => {
    const query = form.city.value.trim();
    if (!query) {
      s.weather = { city: '', lat: null, lon: null };
      markSaved(t('settings.appearance.weatherRemoved'));
      updateWeather(true);
      results.innerHTML = '';
      hint.textContent = t('settings.appearance.cityNone');
      return;
    }
    results.innerHTML = settingsHint(t('settings.appearance.searching'));
    let cities = [];
    try { cities = await searchCity(query); } catch (e) { cities = []; }
    results.innerHTML = cities.length
      ? cities.map((c, i) => `<button type="button" class="chip" data-city="${i}">${esc(c.name)}${c.admin ? `, ${esc(c.admin)}` : ''} · ${esc(c.country)}</button>`).join('')
      : settingsHint(t('settings.appearance.cityNotFound'));
    results.onclick = e => {
      const button = e.target.closest('[data-city]');
      if (!button) return;
      const city = cities[+button.dataset.city];
      s.weather = { city: city.name, lat: city.lat, lon: city.lon };
      form.city.value = city.name;
      results.innerHTML = '';
      hint.textContent = t('settings.appearance.cityCurrent', { city: city.name });
      markSaved(); updateWeather(true); sfx('place');
    };
  };
  $('[data-citysearch]', pane).onclick = search;
  form.city.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
}

// ---------------------------------------------------------
// Tab: Sound and music
// ---------------------------------------------------------
SETTINGS_PANES.sound = {
  html() {
    const s = state.settings;
    const ownMusic = !!(desktopApi && desktopApi.music_setup);
    return settingsSection(t('settings.sound.effects'), `<div class="set-checks">${settingsCheck('sound', s.sound, t('settings.sound.soundOn'), t('settings.sound.soundOnHint'))}</div>
        <div class="row2">
          <div class="field"><span>${t('settings.sound.style')}</span>${segHTML('soundStyle', [['fantasy', t('settings.sound.styleFantasy')], ['8bit', t('settings.sound.style8bit')]])}</div>
          <label class="field"><span>${t('settings.sound.volume')} · <b data-vol>${s.volume}</b> %</span>
            <input type="range" name="volume" min="0" max="100" step="5" value="${s.volume}"></label>
        </div>`)
      + settingsSection(t('settings.sound.music'), `<small class="set-hint set-warn" data-sound-off${s.sound ? ' hidden' : ''}>${t('settings.sound.soundOffWarning')}</small>
        <div class="field"><span>${t('settings.sound.whenPlays')}</span>${segHTML('music', [
          ['off', t('settings.sound.musicOff')], ['sometimes', t('settings.sound.musicSometimes')], ['often', t('settings.sound.musicOften')]])}</div>
        <div class="row2">
          <label class="field"><span>${t('settings.sound.musicVolume')} · <b data-mvol>${s.musicVol}</b> %</span>
            <input type="range" name="musicVol" min="0" max="100" step="5" value="${s.musicVol}"></label>
          <div class="field"><span>${t('settings.sound.tryIt')}</span><button type="button" class="btn btn-ico" data-preview-song>${ico('cat-music', '♪')}${t('settings.sound.playSample')}</button></div>
        </div>`)
      + settingsSection(t('settings.sound.myMusic'), ownMusic
        ? `<div class="field"><span>${t('settings.sound.whichMusic')}</span>${segHTML('musicSource', [
            ['mix', t('settings.sound.sourceMix')], ['mine', t('settings.sound.sourceMine')], ['app', t('settings.sound.sourceApp')]])}</div>
        <div class="my-music" data-mlist></div>
        <div class="btn-group">
          <button type="button" class="btn btn-ico" data-madd>${ico('cat-music', '♪')}${t('settings.sound.addTracks')}</button>
          <button type="button" class="btn btn-ico" data-mopen>${ico('ui-folder', '📂')}${t('settings.sound.openFolder')}</button>
        </div>
        ${settingsHint(t('settings.sound.formatsHint'))}`
        : settingsHint(t('settings.sound.desktopOnly')));
  },
  bind(form, pane) {
    const s = state.settings;
    form.sound.onchange = () => {
      s.sound = form.sound.checked; renderHUD(); markSaved();
      $('[data-sound-off]', pane).hidden = s.sound;
      if (s.sound) sfx('select');
    };
    bindSeg(pane, 'soundStyle', () => s.soundStyle, value => { s.soundStyle = value; markSaved(); sfx('coin'); });
    form.volume.oninput = () => { $('[data-vol]', pane).textContent = form.volume.value; };
    form.volume.onchange = () => { s.volume = +form.volume.value; markSaved(); sfx('coin'); if (MUSIC.el) MUSIC.el.volume = musicTarget(); };
    bindSeg(pane, 'music', () => s.music, value => { s.music = value; markSaved(); if (value === 'off') stopMusic(); scheduleMusic(true); });
    form.musicVol.oninput = () => { $('[data-mvol]', pane).textContent = form.musicVol.value; };
    form.musicVol.onchange = () => { s.musicVol = +form.musicVol.value; markSaved(); if (MUSIC.el) MUSIC.el.volume = musicTarget(); };
    $('[data-preview-song]', pane).onclick = () => {
      if (!s.sound) { sfx('error'); toast(t('settings.sound.enableSoundFirst'), 'warn'); return; }
      if (MUSIC.playing) stopMusic();
      const previous = s.music;
      if (previous === 'off') s.music = 'sometimes';
      playSong(true);
      s.music = previous;
    };
    const trackList = $('[data-mlist]', pane);
    if (!trackList) return;
    bindSeg(pane, 'musicSource', () => s.musicSource, value => { s.musicSource = value; markSaved(); });
    const drawTracks = () => {
      if (!trackList.isConnected) return;
      trackList.innerHTML = MUSIC.tracks.length
        ? MUSIC.tracks.map(file => {
          const name = trackName(file);
          return `<div class="mm-row"><button type="button" class="icon-mini" data-mplay="${esc(file)}" title="${esc(t('settings.sound.playTrack', { name }))}" aria-label="${esc(t('settings.sound.playTrack', { name }))}">▶</button><span>${esc(name)}</span></div>`;
        }).join('')
        : settingsHint(t('settings.sound.noTracks'));
    };
    refreshTracks().then(drawTracks);
    trackList.addEventListener('click', e => {
      const button = e.target.closest('[data-mplay]');
      if (!button) return;
      if (!s.sound) { sfx('error'); toast(t('settings.sound.enableSoundFirst'), 'warn'); return; }
      playTrack(button.dataset.mplay);
    });
    $('[data-madd]', pane).onclick = () => desktopApi.music_add().then(list => { MUSIC.tracks = list || []; drawTracks(); }).catch(() => {});
    $('[data-mopen]', pane).onclick = () => desktopApi.music_open();
  },
};

// ---------------------------------------------------------
// Tab: Schedule and menu
// ---------------------------------------------------------
SETTINGS_PANES.schedule = {
  html() {
    const s = state.settings;
    return settingsSection(t('settings.schedule.section'), `<div class="row2">
          <label class="field"><span>${t('settings.schedule.startsAt')}</span><select name="start">${hourOptions24(0, 13, s.startHour)}</select></label>
          <label class="field"><span>${t('settings.schedule.endsAt')}</span><select name="end">${hourOptions24(14, 25, s.endHour)}</select></label>
        </div>
        <p class="set-error" data-hour-error role="alert" hidden></p>
        ${settingsHint(t('settings.schedule.hoursHint'))}`)
      + settingsSection(t('settings.schedule.menuSections'), `<div class="sec-chips">${SECTIONS.filter(x => x.id !== 'home').map(x => `<label class="sec-chip" style="--c:${x.color}" title="${esc(t('settings.schedule.toggleSection', { name: x.label }))}">
          <input type="checkbox" name="sec" value="${x.id}"${s.hiddenSecs.includes(x.id) ? '' : ' checked'}>${ico(`sec-${x.id}`, x.icon)}<span>${x.label}</span></label>`).join('')}</div>`);
  },
  bind(form, pane) {
    const s = state.settings, errorBox = $('[data-hour-error]', pane);
    const applyHours = () => {
      const start = +form.start.value, end = +form.end.value;
      let message = '';
      if (end - start < 4) message = t('settings.schedule.minHours');
      else {
        const outside = state.schedule.blocks.filter(b => b.start < start || b.start + b.duration > end).length;
        if (outside) message = t('settings.schedule.blocksOutside', { count: outside });
      }
      errorBox.hidden = !message;
      errorBox.textContent = message;
      if (message) { sfx('error'); form.start.value = s.startHour; form.end.value = s.endHour; return; }
      s.startHour = start; s.endHour = end;
      markSaved(); renderAll();
    };
    form.start.onchange = applyHours;
    form.end.onchange = applyHours;
    $$('[name=sec]', form).forEach(checkbox => checkbox.addEventListener('change', () => {
      s.hiddenSecs = $$('[name=sec]', form).filter(x => !x.checked).map(x => x.value);
      sfx('select'); markSaved(); renderAll();
    }));
  },
};

// ---------------------------------------------------------
// Tab: Reminders
// ---------------------------------------------------------
SETTINGS_PANES.notifications = {
  html() {
    const s = state.settings, desktop = !!desktopApi;
    const leadOptions = [0, 5, 10, 15].map(n => [String(n), n ? t('settings.notifications.minutes', { count: n }) : t('settings.notifications.atStart')]);
    return settingsSection(t('settings.notifications.section'), `<div class="set-checks">
          ${settingsCheck('reminders', s.reminders, t(desktop ? 'settings.notifications.remindersWindows' : 'settings.notifications.reminders'), t('settings.notifications.remindersHint'))}</div>
        <div class="set-sub" data-remind-sub>
          <div class="field"><span>${t('settings.notifications.leadTime')}</span>${segHTML('remindMin', leadOptions)}</div>
          <div class="set-checks">
            ${settingsCheck('morning', s.morning, t('settings.notifications.morning'), t('settings.notifications.morningHint'))}
            ${settingsCheck('habitNudge', s.habitNudge, t('settings.notifications.habitNudge'), t('settings.notifications.habitNudgeHint'))}</div>
        </div>`)
      + (desktop ? settingsSection(t('settings.notifications.windows'), `<div class="set-checks">
          ${settingsCheck('closeToTray', s.closeToTray, t('settings.notifications.closeToTray'), t('settings.notifications.closeToTrayHint'), true)}
          ${desktopApi.autostart_set ? settingsCheck('autostart', false, t('settings.notifications.autostart'), t('settings.notifications.autostartHint')) : ''}</div>`) : '');
  },
  bind(form, pane) {
    const s = state.settings, dependent = $('[data-remind-sub]', pane);
    const syncDependent = () => {
      dependent.classList.toggle('off', !s.reminders);
      $$('input, button', dependent).forEach(x => { x.disabled = !s.reminders; });
    };
    form.reminders.onchange = () => { s.reminders = form.reminders.checked; syncDependent(); markSaved(); };
    bindSeg(pane, 'remindMin', () => s.remindMin, value => { s.remindMin = +value; markSaved(); });
    form.morning.onchange = () => { s.morning = form.morning.checked; markSaved(); };
    form.habitNudge.onchange = () => { s.habitNudge = form.habitNudge.checked; markSaved(); };
    syncDependent();
    if (form.closeToTray) form.closeToTray.onchange = () => { s.closeToTray = form.closeToTray.checked; syncTray(); markSaved(); };
    const autostart = form.autostart;
    if (!autostart) return;
    autostart.disabled = true;
    desktopApi.autostart_get().then(value => { autostart.checked = !!value; autostart.disabled = value === null; }).catch(() => {});
    autostart.onchange = () => desktopApi.autostart_set(autostart.checked).then(value => {
      autostart.checked = !!value;
      markSaved(t(value ? 'settings.notifications.autostartOn' : 'settings.notifications.autostartOff'));
    }).catch(() => { autostart.checked = !autostart.checked; toast(t('settings.notifications.autostartFailed'), 'warn'); });
  },
};

// ---------------------------------------------------------
// Tab: Save data
// ---------------------------------------------------------
/** Importing replaces the whole game, so it asks first (on top of Settings). */
function confirmImport(text) {
  try { JSON.parse(text); } catch (e) { sfx('error'); toast(t('data.invalidFile'), 'warn'); return; }
  const note = t(desktopApi ? 'settings.data.importBackupNote' : 'settings.data.importLostNote');
  confirmModal(`${t('settings.data.importConfirmHtml')} ${esc(note)}`, () => importText(text), t('common.yesImport'), { stack: true });
}
SETTINGS_PANES.data = {
  html() {
    const resetHint = t(activeProfile.blank ? 'settings.data.resetHintBlank' : 'settings.data.resetHintSeed');
    return settingsSection(t('settings.data.whereSection'), `<p class="set-text">${esc(t('settings.data.savedWhere', { where: saveLocationText() }))}</p>
        ${desktopApi ? `<small class="set-hint" data-backup-info>${t('settings.data.checkingBackups')}</small>` : settingsHint(t('settings.data.browserNoBackups'))}`)
      + settingsSection(t('settings.data.copiesSection'), `<div class="btn-group">
          <button type="button" class="btn btn-ico" data-export>${ico('ui-folder', '💾')}${t('settings.data.export')}</button>
          <button type="button" class="btn btn-ico" data-import>${ico('ui-letter', '📂')}${t('settings.data.import')}</button>
          ${desktopApi ? `<button type="button" class="btn btn-ico" data-backups>${ico('ui-shield', '🛡')}${t('settings.data.viewBackups')}</button>` : ''}
        </div>
        <small class="set-hint set-last-export" title="${esc(t('settings.data.copiesHint'))}">${state.settings.lastExport
          ? esc(t('settings.data.lastExport', { when: formatRelativeDays(daysUntil(state.settings.lastExport)) }))
          : esc(t('settings.data.neverExported'))}</small>
        <input type="file" accept="application/json,.json" hidden data-file>`)
      + settingsSection(t('settings.data.dangerSection'), `<div class="set-danger">
          <div><b>${t('settings.data.resetTitle')}</b>${settingsHint(`${resetHint} ${t('settings.data.exportFirst')}`)}</div>
          <button type="button" class="btn btn-danger" data-reset>${t('settings.data.reset')}</button>
        </div>`, 'set-sec-danger');
  },
  bind(form, pane) {
    $('[data-export]', pane).onclick = exportData;
    const fileInput = $('[data-file]', pane);
    $('[data-import]', pane).onclick = async () => {
      if (!desktopApi) { fileInput.click(); return; }
      try {
        const text = await desktopApi.import_file();
        if (text) confirmImport(text);
      } catch (e) { toast(t('data.cantOpenFile'), 'warn'); }
    };
    fileInput.onchange = () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => confirmImport(reader.result);
      reader.readAsText(file);
    };
    const backupsButton = $('[data-backups]', pane);
    if (backupsButton) backupsButton.onclick = () => desktopApi.open_backups();
    const backupInfo = $('[data-backup-info]', pane);
    if (backupInfo && desktopApi.backup_info) {
      desktopApi.backup_info().then(info => {
        backupInfo.textContent = info.count
          ? t('settings.data.backupsInfo', { count: info.count, last: formatDate(parseISO(info.last), { day: 'numeric', month: 'short' }) })
          : t('settings.data.backupsNone');
      }).catch(() => { backupInfo.textContent = ''; });
    }
    $('[data-reset]', pane).onclick = () => confirmModal(
      t(activeProfile.blank ? 'settings.data.resetConfirmBlankHtml' : 'settings.data.resetConfirmSeedHtml'),
      resetGame, t('common.yesReset'), { stack: true });
  },
};

// ---------------------------------------------------------
// The window
// ---------------------------------------------------------
function showSettingsTab(id, withSound) {
  const modal = settingsUi.modal;
  if (!modal || !modal.isConnected || !SETTINGS_PANES[id]) return;
  settingsUi.tab = id;
  $$('[data-set-tab]', modal).forEach(button => {
    const selected = button.dataset.setTab === id;
    button.classList.toggle('on', selected);
    button.setAttribute('aria-selected', selected);
    button.tabIndex = selected ? 0 : -1;
  });
  const pane = $('.set-pane', modal);
  pane.setAttribute('aria-labelledby', `set-tab-${id}`);
  pane.innerHTML = `<header class="set-head"><h2>${t(`settings.tabs.${id}.label`)}</h2></header>
    <form class="set-form" autocomplete="off" data-set-form>${SETTINGS_PANES[id].html()}</form>`;
  pane.scrollTop = 0;
  const form = $('[data-set-form]', pane);
  form.addEventListener('submit', e => e.preventDefault());
  SETTINGS_PANES[id].bind(form, pane);
  if (withSound) sfx('select');
}
const refreshSettingsTab = () => showSettingsTab(settingsUi.tab, false);

/** tab: 'profile', 'appearance', 'sound', 'schedule', 'notifications' or 'data' (default: the last one seen). */
function openSettingsModal(tab) {
  if (typeof tab === 'string' && SETTINGS_PANES[tab]) settingsUi.tab = tab;
  openModal({
    title: t('settings.title'), wide: true, cls: 'modal-settings', autofocus: false,
    body: `<div class="set-layout">
        <div class="set-nav" role="tablist" aria-label="${esc(t('settings.navAria'))}" aria-orientation="vertical">
          ${SETTINGS_TABS.map(tabInfo => `<button type="button" class="set-tab" role="tab" id="set-tab-${tabInfo.id}" data-set-tab="${tabInfo.id}" title="${esc(t(`settings.tabs.${tabInfo.id}.description`))}" aria-controls="set-pane" aria-selected="false" tabindex="-1">
            <span class="set-tab-ico">${ico(...tabInfo.icon)}</span><span class="set-tab-label">${t(`settings.tabs.${tabInfo.id}.label`)}</span></button>`).join('')}
        </div>
        <div class="set-pane" id="set-pane" role="tabpanel"></div>
      </div>`,
    footer: `<small class="set-status" data-set-status aria-live="polite">${t('settings.autosave')}</small>
      <span class="spacer"></span><button class="btn btn-primary" data-close>${t('common.done')}</button>`,
    onMount: modal => {
      settingsUi.modal = modal;
      const nav = $('.set-nav', modal);
      nav.addEventListener('click', e => {
        const button = e.target.closest('[data-set-tab]');
        if (button && button.dataset.setTab !== settingsUi.tab) showSettingsTab(button.dataset.setTab, true);
      });
      // Arrows, Home and End move between tabs (standard tablist behavior)
      nav.addEventListener('keydown', e => {
        const index = SETTINGS_TABS.findIndex(x => x.id === settingsUi.tab), count = SETTINGS_TABS.length;
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        const next = step ? (index + step + count) % count : e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 : null;
        if (next === null) return;
        e.preventDefault();
        showSettingsTab(SETTINGS_TABS[next].id, true);
        $(`#set-tab-${SETTINGS_TABS[next].id}`, modal).focus();
      });
      showSettingsTab(settingsUi.tab, false);
      setTimeout(() => { const selected = $('.set-tab.on', modal); if (selected) selected.focus(); }, 30);
    },
  });
}

/** Last step of boot: after a language change the app reloads and Settings opens again where it was. */
function settingsBoot() {
  let tab = '';
  try {
    tab = sessionStorage.getItem(SESSION_KEYS.reopenSettings) || '';
    sessionStorage.removeItem(SESSION_KEYS.reopenSettings);
  } catch (e) { /* private mode */ }
  if (tab) openSettingsModal(tab);
}
