/* Profiles: one save per person, the profile picker and the setup wizard of a new profile. */
'use strict';

// ---------------------------------------------------------
// Profile registry: Python stores it in the desktop app, localStorage in the browser
// ---------------------------------------------------------
const PROFILES_STORAGE_KEY = 'questleaf.profiles';
const profileStorageKey = id => (id === MAIN_PROFILE ? STORAGE_KEY : `${STORAGE_KEY}.${id}`);

function readLocalProfiles() {
  try {
    const registry = JSON.parse(localStorage.getItem(PROFILES_STORAGE_KEY));
    if (registry && Array.isArray(registry.list) && registry.list.length) {
      // 'principal' is the same main profile under its Spanish id
      registry.list.forEach(p => { if (p.id === 'principal') p.id = MAIN_PROFILE; });
      if (registry.active === 'principal') registry.active = MAIN_PROFILE;
      return registry;
    }
  } catch (e) { /* corrupted registry: rebuilt below */ }
  return { active: MAIN_PROFILE, list: [{ id: MAIN_PROFILE, name: '' }] };
}
function writeLocalProfiles(registry) {
  try { localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(registry)); } catch (e) { /* storage full */ }
}

async function profilesGet() {
  if (desktopApi && desktopApi.profiles_get) return desktopApi.profiles_get();
  const registry = readLocalProfiles();
  return {
    active: registry.list.some(p => p.id === registry.active) ? registry.active : MAIN_PROFILE,
    list: registry.list.map(p => {
      const info = { id: p.id, name: p.name || '', photo: '', exists: false };
      try {
        const raw = localStorage.getItem(profileStorageKey(p.id));
        info.exists = !!raw;
        const data = raw && JSON.parse(raw);
        if (data && data.profile) { info.name = data.profile.name || info.name; info.photo = data.profile.photo || ''; }
      } catch (e) { /* unreadable save */ }
      return info;
    }),
  };
}
async function profileSwitch(id) {
  if (desktopApi && desktopApi.profile_switch) return desktopApi.profile_switch(id);
  const registry = readLocalProfiles();
  if (!registry.list.some(p => p.id === id)) return false;
  registry.active = id;
  writeLocalProfiles(registry);
  return true;
}
async function profileCreate(name) {
  if (desktopApi && desktopApi.profile_create) return desktopApi.profile_create(name);
  const registry = readLocalProfiles(), id = Math.random().toString(36).slice(2, 8);
  registry.list.push({ id, name: name.slice(0, 24) });
  registry.active = id;
  writeLocalProfiles(registry);
  return id;
}
async function profileDelete(id) {
  if (desktopApi && desktopApi.profile_delete) return desktopApi.profile_delete(id);
  const registry = readLocalProfiles();
  if (id === MAIN_PROFILE || id === registry.active) return false;
  registry.list = registry.list.filter(p => p.id !== id);
  writeLocalProfiles(registry);
  try { localStorage.removeItem(profileStorageKey(id)); } catch (e) { /* nothing to remove */ }
  return true;
}
/** Stores the active profile's name in the registry and shows it in the window title. */
function profileTouch() {
  const name = state.profile.name;
  const me = activeProfile.list.find(p => p.id === activeProfile.id);
  if (me) me.name = name;
  if (desktopApi && desktopApi.profile_touch) desktopApi.profile_touch(name).catch(() => {});
  else {
    const registry = readLocalProfiles(), entry = registry.list.find(p => p.id === activeProfile.id);
    if (entry) { entry.name = name; writeLocalProfiles(registry); }
  }
  document.title = activeProfile.list.length > 1 && name ? `${APP_NAME} – ${name}` : APP_NAME;
}

const seedProfileName = () => (typeof NOTION_SEED !== 'undefined' ? NOTION_SEED.profile.name : '');
const profileName = p => p.name || (p.id === MAIN_PROFILE && seedProfileName()) || t('profiles.unnamed');
const profileAvatar = p => (p.photo
  ? `<img src="${esc(p.photo)}" alt="">`
  : `<span class="initial-avatar">${esc((profileName(p).trim().charAt(0) || '?').toUpperCase())}</span>`);

// ---------------------------------------------------------
// Empty save: the general app content without anything personal
// ---------------------------------------------------------
function blankSeed() {
  const seed = defaultSeed();
  const dayColors = ['#f7a8a8', '#f6b98a', '#f6d38a', '#cfe3a0', '#a9cbe8', '#b8b4ec', '#efb3d0'];
  Object.assign(seed, {
    profile: { name: activeProfile.newName || '', motto: '', hobbies: [], projects: [], photo: '' },
    schedule: { activities: [], blocks: [], log: {} },
    habits: { list: [], log: {} },
    workout: { days: dayColors.map(color => ({ focus: '', color, exercises: [] })), notes: '', log: {} },
    university: { events: [] },
    workflow: { tools: [], jobs: [], usage: {}, projects: [] },
    books: [], movies: [], birthdays: [],
    reflections: { es: [], en: [] }, vehemence: { es: [], en: [] },
    seenHelp: false, setupDone: false,
  });
  return seed;
}

// ---------------------------------------------------------
// On start: who is playing? (only when there is more than one profile)
// ---------------------------------------------------------
async function profileGate() {
  let info;
  try { info = await profilesGet(); } catch (e) { info = null; }
  if (!info || !Array.isArray(info.list) || !info.list.length) {
    info = { active: MAIN_PROFILE, list: [{ id: MAIN_PROFILE, name: '', photo: '', exists: true }] };
  }
  activeProfile.list = info.list;
  activeProfile.id = info.active;
  let alreadyPicked = false;
  try { alreadyPicked = sessionStorage.getItem(SESSION_KEYS.profilePicked) === '1'; } catch (e) { /* private mode */ }
  // When the PC starts, the app opens hidden in the tray: keep the last profile
  const hidden = desktopApi && desktopApi.is_hidden ? await desktopApi.is_hidden().catch(() => false) : false;
  if (info.list.length > 1 && !alreadyPicked && !hidden) {
    const id = await showProfilePicker(info);
    if (id !== activeProfile.id) await profileSwitch(id);
    activeProfile.id = id;
  }
  try { sessionStorage.setItem(SESSION_KEYS.profilePicked, '1'); } catch (e) { /* private mode */ }
  const me = activeProfile.list.find(p => p.id === activeProfile.id);
  activeProfile.blank = activeProfile.id !== MAIN_PROFILE;
  activeProfile.newName = me && !me.exists ? me.name : '';
}

function showProfilePicker(info) {
  return new Promise(resolve => {
    const screen = el('div', 'gate-screen');
    const draw = () => {
      screen.innerHTML = `<div class="gate-box">
        <img class="gate-logo" src="icon.png" alt="">
        <h1>${t('profiles.whoPlays')}</h1>
        <div class="prof-cards">
          ${info.list.map(p => `<button class="prof-card${p.id === info.active ? ' last' : ''}" data-pid="${esc(p.id)}">
            <span class="prof-av">${profileAvatar(p)}</span><b>${esc(profileName(p))}</b></button>`).join('')}
          <button class="prof-card prof-new" data-pnew><span class="prof-av"><span class="prof-plus">+</span></span><b>${t('profiles.newProfile')}</b></button>
        </div>
      </div>`;
      const last = $('.prof-card.last', screen);
      if (last) last.focus();
    };
    const finish = id => {
      screen.classList.add('out');
      setTimeout(() => screen.remove(), 260);
      resolve(id);
    };
    screen.addEventListener('click', e => {
      const card = e.target.closest('[data-pid]');
      if (card) { finish(card.dataset.pid); return; }
      const newCard = e.target.closest('[data-pnew]');
      if (newCard) showNewProfileForm(newCard, async name => {
        const id = await profileCreate(name);
        info.list.push({ id, name, photo: '', exists: false });
        activeProfile.list = info.list;
        finish(id);
      }, draw);
    });
    document.body.append(screen);
    draw();
  });
}

/** Turns the “+” card into a small form to type the new profile's name. */
function showNewProfileForm(card, onCreate, onCancel) {
  const form = el('form', 'prof-card prof-new on', `<span class="prof-av"><span class="prof-plus">+</span></span>
    <input type="text" maxlength="24" placeholder="${esc(t('profiles.namePlaceholder'))}" aria-label="${esc(t('profiles.nameAria'))}">
    <button type="submit" class="btn btn-small btn-primary">${t('profiles.create')}</button>`);
  card.replaceWith(form);
  const input = $('input', form);
  input.focus();
  input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) {
      input.focus();
      form.classList.add('shake');
      setTimeout(() => form.classList.remove('shake'), 300);
      return;
    }
    $('button', form).disabled = true;
    onCreate(name);
  });
}

// ---------------------------------------------------------
// Inside the app: switch, create or remove profiles
// ---------------------------------------------------------
/** Profile cards, used by the Profiles window and by Settings → Profile. */
function profilesCardsHTML(list) {
  const card = p => {
    const isMe = p.id === activeProfile.id;
    const name = isMe ? state.profile.name : profileName(p);
    const avatar = isMe && state.profile.photo ? `<img src="${state.profile.photo}" alt="">` : profileAvatar(isMe ? { ...p, name } : p);
    return `<div class="prof-slot">
        <button type="button" class="prof-card${isMe ? ' me' : ''}" data-pid="${esc(p.id)}"${isMe ? ' disabled' : ''}
          title="${esc(isMe ? t('profiles.current') : t('profiles.switchTo', { name }))}">
          <span class="prof-av">${avatar}</span>
          <b>${esc(name)}</b>${isMe ? `<small>${t('profiles.now')}</small>` : ''}</button>
        ${!isMe && p.id !== MAIN_PROFILE ? `<button type="button" class="icon-mini prof-del" data-pdel="${esc(p.id)}"
          title="${esc(t('profiles.remove'))}" aria-label="${esc(t('profiles.removeAria', { name }))}">✕</button>` : ''}
      </div>`;
  };
  return `<div class="prof-cards in-modal">
      ${list.map(card).join('')}
      <div class="prof-slot"><button type="button" class="prof-card prof-new" data-pnew><span class="prof-av"><span class="prof-plus">+</span></span><b>${t('profiles.newProfile')}</b></button></div>
    </div>`;
}
/** refresh redraws the cards. stack: the confirmation opens on top (to return to Settings). */
function bindProfilesCards(root, list, refresh, { stack = false } = {}) {
  root.addEventListener('click', e => {
    const card = e.target.closest('[data-pid]');
    if (card && !card.disabled) { enterProfile(card.dataset.pid); return; }
    const removeButton = e.target.closest('[data-pdel]');
    if (removeButton) {
      const profile = list.find(x => x.id === removeButton.dataset.pdel), name = profileName(profile);
      const note = desktopApi ? ` ${esc(t('profiles.removeBackupNote'))}` : '';
      confirmModal(tHtml('profiles.removeConfirmHtml', { name }) + note, async () => {
        if (await profileDelete(profile.id)) {
          sfx('remove');
          toast(t('profiles.removed', { name }), 'info', { icon: ico('ui-delete', '🗑') });
        }
        refresh();
      }, t('common.yesRemove'), { stack });
      return;
    }
    const newCard = e.target.closest('[data-pnew]');
    if (newCard) showNewProfileForm(newCard, name => enterProfile(null, name), refresh);
  });
}
async function openProfilesModal() {
  let info;
  try { info = await profilesGet(); } catch (e) { toast(t('profiles.readError'), 'warn'); return; }
  activeProfile.list = info.list;
  openModal({
    title: t('profiles.title'),
    body: `${profilesCardsHTML(info.list)}
      <p class="muted prof-hint">${t('profiles.hint')}</p>`,
    onMount: modal => bindProfilesCards(modal, info.list, openProfilesModal, { stack: true }),
  });
}
/** Saves the current game and opens another profile (or creates a new one). */
async function enterProfile(id, newName) {
  if (focus) { sfx('error'); toast(t('profiles.finishFocus'), 'warn'); return; }
  closeModal();
  await prepareReload(); // must happen before switching: it saves into the active profile
  try {
    if (newName) await profileCreate(newName);
    else await profileSwitch(id);
  } catch (e) { toast(t('profiles.switchError'), 'warn'); return; }
  reloadApp();
}

// ---------------------------------------------------------
// Wizard for a new profile
// ---------------------------------------------------------
// Suggested choices: the key names the text in the dictionary (wizard.activities / wizard.habits)
const WIZARD_ACTIVITIES = [
  { key: 'study', icon: 'cat-study', type: 'subject' }, { key: 'work', icon: 'cat-work' },
  { key: 'exercise', icon: 'cat-strength' }, { key: 'reading', icon: 'cat-study' },
  { key: 'music', icon: 'cat-music' }, { key: 'languages', icon: 'cat-languages', type: 'subject' },
  { key: 'programming', icon: 'cat-code', type: 'subject' }, { key: 'art', icon: 'cat-art' },
  { key: 'running', icon: 'cat-cardio' }, { key: 'meditation', icon: 'cat-meditation' },
  { key: 'games', icon: 'cat-games' }, { key: 'home', icon: 'cat-home' },
];
const WIZARD_HABITS = [
  { key: 'water', icon: 'cat-water' }, { key: 'read', icon: 'cat-study' }, { key: 'meditate', icon: 'cat-meditation' },
  { key: 'exercise', icon: 'cat-strength' }, { key: 'sleepEarly', icon: 'cat-rest' }, { key: 'eatWell', icon: 'cat-food' },
  { key: 'write', icon: 'cat-writing' }, { key: 'stretch', icon: 'cat-cardio' },
  { key: 'practiceLanguage', icon: 'cat-languages' }, { key: 'tidyUp', icon: 'cat-home' },
];
const activityName = item => t(`wizard.activities.${item.key}`);
const habitName = item => t(`wizard.habits.${item.key}`);

// Icon guessed from what the player types (Spanish and English keywords)
const CATEGORY_GUESSES = [
  [/sin redes|redes sociales|celular|pantalla|tiktok|instagram|social media|phone|screen/i, 'cat-meditation'],
  [/mate|math|c[aá]lc|[aá]lgebra|f[ií]sica|physic|estad[ií]st|statist/i, 'cat-math'],
  [/qu[ií]m|chem|biol|cienc|scien|laborat/i, 'cat-science'],
  [/progra|c[oó]dig|code|coding|redes|network|web|softw/i, 'cat-code'],
  [/ingl|engl|idiom|languag|franc|french|japon|japan|alem|german|portug|corean|korean|chin/i, 'cat-languages'],
  [/escrib|writ|diario|journal|caligra|callig|poes|poem|poet/i, 'cat-writing'],
  [/arte|\bart\b|dibuj|draw|pint|paint|dise[nñ]|design|foto|photo/i, 'cat-art'],
  [/m[uú]sic|piano|guitar|cant|sing|bater|drum|viol/i, 'cat-music'],
  [/gym|gimnas|pesas|weights|fuerza|strength|ejerc|exercis|workout/i, 'cat-strength'],
  [/corr|run|cardio|bici|bike|cycl|camin|walk|nad|swim|f[uú]tbol|soccer|football|deport|sport|bal[oó]n|tenis|tennis/i, 'cat-cardio'],
  [/medit|yoga|respir|breath|orar|rezar|pray/i, 'cat-meditation'],
  [/salud|health|m[eé]dic|terap|therap|vitamin|dient|teeth|dental/i, 'cat-health'],
  [/com(er|ida)|eat|food|almuer|lunch|cena|dinner|desayun|breakfast|cocin|cook/i, 'cat-food'],
  [/caf[eé]|coffee|\bt[eé]\b|\btea\b/i, 'cat-drink'],
  [/agua|water/i, 'cat-water'],
  [/dorm|sleep|siesta|nap|descans|rest/i, 'cat-rest'],
  [/jueg|game|video|pel[ií]cul|movie|film|serie/i, 'cat-games'],
  [/amig|friend|famil|social|salir|novi|date/i, 'cat-social'],
  [/casa|house|home|hogar|limpi|clean|orden|tidy|lavar|wash|laundry/i, 'cat-home'],
  [/trabaj|work|job|oficina|office|turno|shift|negocio|business|venta|sales/i, 'cat-work'],
  [/compr|shop|mercado|market|grocer/i, 'cat-shopping'],
  [/estudi|stud|clase|class|univ|colegio|school|tarea|homework|repas|review|leer|read|lectur|libro|book/i, 'cat-study'],
];
const guessCategory = name => (CATEGORY_GUESSES.find(([pattern]) => pattern.test(name)) || [0, 'cat-study'])[1];

const wizard = { open: false, step: 0, el: null, activities: [], habits: [], hiddenSections: [] };
const WIZARD_STEPS = 6;

function openWizard() {
  closeAllModals();
  Object.assign(wizard, { open: true, step: 0, activities: [], habits: [], hiddenSections: [...state.settings.hiddenSecs] });
  wizard.el = el('div', 'overlay wiz-overlay');
  document.body.append(wizard.el);
  wizard.el.addEventListener('click', onWizardClick);
  wizard.el.addEventListener('input', onWizardInput);
  wizard.el.addEventListener('submit', onWizardSubmit);
  window.addEventListener('keydown', onWizardKeydown, true);
  renderWizard();
}
// While the wizard is open the app shortcuts (Tab, R, numbers…) stay off
function onWizardKeydown(e) {
  if (!wizard.open) return;
  e.stopPropagation();
  if (e.key === 'Enter' && !e.target.closest('form.wz-add') && e.target.tagName !== 'BUTTON') { e.preventDefault(); wizardNext(); }
}

const wizardChip = (selected, icon, name, attrs) =>
  `<button type="button" class="wz-chip${selected ? ' on' : ''}" ${attrs}>${ico(icon, '•')}<span>${esc(name)}</span></button>`;
const hourOptions = (from, to, current) =>
  range(from, to).map(h => `<option value="${h}"${h === current ? ' selected' : ''}>${formatHour(h)}</option>`).join('');

function wizardStepHtml() {
  const s = state, settings = s.settings;
  switch (wizard.step) {
    case 0: return `<div class="wz-hero">
        <button type="button" class="wz-photo" data-wphoto title="${esc(t('wizard.uploadPhoto'))}">${photoHTML()}<span class="pf-cam">${UI_ICON.edit}</span></button>
        <h2>${t('wizard.welcome')}</h2>
        <p class="muted">${t('wizard.welcomeSub')}</p>
      </div>
      <label class="field"><span>${t('wizard.askName')}</span><input type="text" data-wname maxlength="24" value="${esc(s.profile.name)}" placeholder="${esc(t('wizard.namePlaceholder'))}"></label>
      <label class="field"><span>${t('wizard.motto')} <small class="muted">${t('common.optional')}</small></span><input type="text" data-wmotto maxlength="140" value="${esc(s.profile.motto)}"></label>`;
    case 1: {
      const swatches = (name, list, group, current) => `<div class="look-swatches" data-wsw="${name}">${list.map(([key, color]) => {
        const label = t(`look.${group}.${key}`);
        return `<button type="button" class="${key === current ? 'on' : ''}" data-v="${key}" title="${esc(label)}" style="--c:${color}"><span></span><small>${label}</small></button>`;
      }).join('')}</div>`;
      return `<h2 class="wz-title">${t('wizard.chooseBook')}</h2>
        <div class="wz-theme">
          <button type="button" class="wz-chip big${settings.theme !== 'night' ? ' on' : ''}" data-wtheme="day">${ico('ui-day', '☀')}<span>${t('wizard.day')}</span></button>
          <button type="button" class="wz-chip big${settings.theme === 'night' ? ' on' : ''}" data-wtheme="night">${ico('ui-night', '🌙')}<span>${t('wizard.night')}</span></button>
        </div>
        <div class="field"><span>${t('wizard.leather')}</span>${swatches('leather', LEATHERS, 'leathers', settings.leather)}</div>
        <div class="field"><span>${t('wizard.accent')}</span>${swatches('accent', ACCENTS, 'accents', settings.accent)}</div>`;
    }
    case 2: {
      const custom = wizard.activities.filter(a => !a.key);
      return `<h2 class="wz-title">${t('wizard.daysTitle')}</h2>
        <p class="muted wz-sub">${t('wizard.daysSub')}</p>
        <div class="wz-chips">
          ${WIZARD_ACTIVITIES.map(item => wizardChip(wizard.activities.some(a => a.key === item.key), item.icon, activityName(item), `data-wact="${item.key}"`)).join('')}
          ${custom.map(a => wizardChip(true, a.icon, a.name, `data-wcustom-act="${esc(a.name)}"`)).join('')}
        </div>
        <form class="wz-add"><input type="text" maxlength="24" placeholder="${esc(t('wizard.otherActivity'))}" data-wnew="activity"><button type="submit" class="btn btn-small">+</button></form>
        <div class="wz-hours">
          <span>${t('wizard.dayFrom')}</span>
          <select data-whour="startHour">${hourOptions(0, 13, settings.startHour)}</select>
          <span>${t('wizard.dayTo')}</span>
          <select data-whour="endHour">${hourOptions(14, 25, settings.endHour)}</select>
        </div>`;
    }
    case 3: {
      const custom = wizard.habits.filter(h => !h.key);
      return `<h2 class="wz-title">${t('wizard.habitsTitle')}</h2>
        <p class="muted wz-sub">${t('wizard.habitsSub')}</p>
        <div class="wz-chips">
          ${WIZARD_HABITS.map(item => wizardChip(wizard.habits.some(h => h.key === item.key), item.icon, habitName(item), `data-whab="${item.key}"`)).join('')}
          ${custom.map(h => wizardChip(true, h.icon, h.name, `data-wcustom-hab="${esc(h.name)}"`)).join('')}
        </div>
        <form class="wz-add"><input type="text" maxlength="30" placeholder="${esc(t('wizard.otherHabit'))}" data-wnew="habit"><button type="submit" class="btn btn-small">+</button></form>`;
    }
    case 4: return `<h2 class="wz-title">${t('wizard.sectionsTitle')}</h2>
        <p class="muted wz-sub">${t('wizard.sectionsSub')}</p>
        <div class="wz-chips secs">
          ${SECTIONS.filter(x => x.id !== 'home').map(x => wizardChip(!wizard.hiddenSections.includes(x.id), `sec-${x.id}`, x.label, `data-wsec="${x.id}" style="--c:${x.color}"`)).join('')}
        </div>`;
    case 5: return `<div class="wz-hero">
        <img class="wz-egg" src="assets/pet/pet-0.png" alt="">
        <h2>${t('wizard.petTitle')}</h2>
        <p class="muted">${t('wizard.petSub')}</p>
      </div>
      <label class="field"><span>${t('wizard.petName')}</span><input type="text" data-wpet maxlength="16" value="${esc(s.pet.name === 'Jade' ? '' : s.pet.name)}" placeholder="Jade"></label>`;
    default: return '';
  }
}
function renderWizard() {
  const last = wizard.step === WIZARD_STEPS - 1;
  wizard.el.innerHTML = `<div class="modal wide wiz" role="dialog" aria-modal="true" aria-label="${esc(t('wizard.dialogAria'))}">
      <div class="wz-dots">${range(0, WIZARD_STEPS).map(i => `<i class="${i === wizard.step ? 'on' : i < wizard.step ? 'done' : ''}"></i>`).join('')}</div>
      <div class="modal-body wz-body">${wizardStepHtml()}</div>
      <div class="modal-foot">
        ${wizard.step ? `<button type="button" class="btn" data-wback>${t('common.back')}</button>` : ''}
        <span class="spacer"></span>
        ${wizard.step >= 2 && !last ? `<button type="button" class="link-btn" data-wnext>${t('common.skip')}</button>` : ''}
        <button type="button" class="btn btn-primary" data-wnext>${last ? t('common.letsGo') : t('common.next')}</button>
      </div>
    </div>`;
  const firstField = $('[data-wname], [data-wpet]', wizard.el);
  if (firstField) setTimeout(() => firstField.focus(), 40);
}
/** Redraws the current step in place after a choice: the window does not pop in again and its content does not
 *  fade in again (it blinked and shook on every chip), the scroll stays and the focus returns to the same chip.
 *  Turning to another step goes through renderWizard, with its entrance. */
function refreshWizardStep() {
  const body = $('.wz-body', wizard.el), focused = document.activeElement;
  const again = focused && body.contains(focused) ? wizardFocusSelector(focused) : '';
  body.classList.add('still');
  body.innerHTML = wizardStepHtml();
  const target = again && $(again, body);
  if (target) target.focus({ preventScroll: true });
}
/** A selector for the same control after a redraw: its data-w… attribute (a swatch also needs its group). */
function wizardFocusSelector(node) {
  const attr = [...node.attributes].find(a => a.name.startsWith('data-w') || a.name === 'data-v');
  if (!attr) return '';
  const group = node.closest('[data-wsw]');
  return `${group ? `[data-wsw="${group.dataset.wsw}"] ` : ''}[${attr.name}="${CSS.escape(attr.value)}"]`;
}
function wizardNext() {
  if (wizard.step === 0) {
    const nameInput = $('[data-wname]', wizard.el), name = nameInput.value.trim();
    if (!name) { sfx('error'); toast(t('wizard.nameRequired'), 'warn'); nameInput.focus(); return; }
    state.profile.name = name.slice(0, 24);
    state.profile.motto = $('[data-wmotto]', wizard.el).value.trim().slice(0, 140);
    renderHUD();
  }
  if (wizard.step === WIZARD_STEPS - 1) { finishWizard(); return; }
  wizard.step++;
  sfx('page');
  renderWizard();
}
/** Removes the item that matches; otherwise adds entry (custom items pass null: they can only be removed). */
function toggleWizardItem(list, match, entry) {
  const index = list.findIndex(match);
  if (index >= 0) { list.splice(index, 1); sfx('remove'); } else if (entry) { list.push(entry); sfx('select'); }
}
function onWizardClick(e) {
  const target = e.target;
  if (target.closest('[data-wnext]')) { wizardNext(); return; }
  if (target.closest('[data-wback]')) { wizard.step--; sfx('page'); renderWizard(); return; }
  if (target.closest('[data-wphoto]')) { changePhoto(); return; }
  const themeButton = target.closest('[data-wtheme]');
  if (themeButton) { state.settings.theme = themeButton.dataset.wtheme; applyTheme(); sfx('select'); refreshWizardStep(); return; }
  const swatch = target.closest('[data-wsw] [data-v]');
  if (swatch) { state.settings[swatch.closest('[data-wsw]').dataset.wsw] = swatch.dataset.v; applyLook(); sfx('select'); refreshWizardStep(); return; }
  const activity = target.closest('[data-wact]');
  if (activity) {
    const item = WIZARD_ACTIVITIES.find(x => x.key === activity.dataset.wact);
    toggleWizardItem(wizard.activities, a => a.key === item.key, { key: item.key, icon: item.icon, type: item.type || 'personal' });
    refreshWizardStep(); return;
  }
  const habit = target.closest('[data-whab]');
  if (habit) {
    const item = WIZARD_HABITS.find(x => x.key === habit.dataset.whab);
    toggleWizardItem(wizard.habits, h => h.key === item.key, { key: item.key, icon: item.icon });
    refreshWizardStep(); return;
  }
  const customActivity = target.closest('[data-wcustom-act]');
  if (customActivity) { toggleWizardItem(wizard.activities, a => !a.key && a.name === customActivity.dataset.wcustomAct, null); refreshWizardStep(); return; }
  const customHabit = target.closest('[data-wcustom-hab]');
  if (customHabit) { toggleWizardItem(wizard.habits, h => !h.key && h.name === customHabit.dataset.wcustomHab, null); refreshWizardStep(); return; }
  const sectionChip = target.closest('[data-wsec]');
  if (sectionChip) {
    const id = sectionChip.dataset.wsec, index = wizard.hiddenSections.indexOf(id);
    if (index >= 0) wizard.hiddenSections.splice(index, 1); else wizard.hiddenSections.push(id);
    sfx('select'); refreshWizardStep();
  }
}
function onWizardInput(e) {
  const hourSelect = e.target.closest('[data-whour]');
  if (!hourSelect) return;
  const settings = state.settings;
  settings[hourSelect.dataset.whour] = +hourSelect.value;
  if (settings.endHour - settings.startHour < 4) settings.endHour = Math.min(24, settings.startHour + 4);
}
function onWizardSubmit(e) {
  e.preventDefault();
  const input = $('[data-wnew]', e.target);
  const name = input && input.value.trim();
  if (!name) return;
  const isActivity = input.dataset.wnew === 'activity';
  const list = isActivity ? wizard.activities : wizard.habits;
  const nameOf = item => (item.key ? (isActivity ? activityName(item) : habitName(item)) : item.name);
  if (!list.some(item => nameOf(item).toLowerCase() === name.toLowerCase())) {
    list.push({ name, icon: guessCategory(name), type: 'personal' });
  }
  sfx('place');
  refreshWizardStep();
  const nextInput = $('[data-wnew]', wizard.el);
  if (nextInput) nextInput.focus();
}
function finishWizard() {
  const s = state;
  const petName = $('[data-wpet]', wizard.el).value.trim();
  s.pet.name = (petName || 'Jade').slice(0, 16);
  // Suggested choices are saved with their name in the active language: from now on they are the player's data
  s.schedule.activities = wizard.activities.map(a => {
    const name = (a.key ? activityName(a) : a.name).slice(0, 24);
    return { id: uid(), name, type: a.type === 'subject' ? 'subject' : 'personal', icon: a.icon, color: colorFor(name), dur: 1 };
  });
  s.habits.list = wizard.habits.map(h => {
    const name = (h.key ? habitName(h) : h.name).slice(0, 30);
    return { id: uid(), name, icon: h.icon, color: colorFor(name), days: [...ALL_WEEKDAYS] };
  });
  s.settings.hiddenSecs = wizard.hiddenSections.filter(id => SECTIONS.some(x => x.id === id && id !== 'home'));
  s.setupDone = true;
  wizard.open = false;
  window.removeEventListener('keydown', onWizardKeydown, true);
  wizard.el.classList.add('out');
  setTimeout(() => { if (wizard.el) { wizard.el.remove(); wizard.el = null; } }, 220);
  sfx('achieve');
  navigateTo('home');
  commit();
  profileTouch();
  setTimeout(() => {
    toast(tHtml('wizard.welcomeToastHtml', { name: s.profile.name }), 'achieve', { icon: ico('hud-xp', '✨'), html: true });
    if (!s.seenHelp) { openHelpModal(); s.seenHelp = true; save(); }
  }, 500);
}
// The photo is picked with the usual file dialog; when it arrives, the wizard shows it
appOn('foto', () => {
  if (!wizard.open || wizard.step !== 0) return;
  const photoButton = $('[data-wphoto]', wizard.el);
  if (photoButton) photoButton.innerHTML = `${photoHTML()}<span class="pf-cam">${UI_ICON.edit}</span>`;
});
