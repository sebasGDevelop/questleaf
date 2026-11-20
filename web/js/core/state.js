/* The state (the single source of truth), the seeds of a new save and normalize(), which every loaded or imported
   save goes through: a field missing there is lost on the next load. */
'use strict';

let state = null; // loaded in boot()

const isDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value));

// ---------------------------------------------------------
// Seeds
// ---------------------------------------------------------
/**
 * The owner's first-run content lives in js/data-notion.js, a local file that is never published.
 * Without it (any public copy) every profile starts empty, with the setup wizard.
 */
const personalSeed = () => (typeof NOTION_SEED !== 'undefined' ? NOTION_SEED : null);
const EMPTY_SEED = {
  profile: { name: '', motto: '', hobbies: [], projects: [] },
  habits: [], rutina: [], rutinaNotes: '', uniTasks: [], uniEvents: [], books: [], movies: [], birthdays: [],
  reflexiones: { es: [], en: [] }, vehemencia: { es: [], en: [] },
};
/** The main profile starts from the personal content when there is one; other profiles start empty (settings/profiles.js). */
function seedState() { return activeProfile.blank || !personalSeed() ? blankSeed() : defaultSeed(); }

function defaultSeed() {
  const S = personalSeed() || EMPTY_SEED;
  const quoteItems = list => list.map(text => ({ id: uid(), text, fav: false }));
  return {
    version: 3,
    profile: {
      name: S.profile.name,
      motto: S.profile.motto,
      hobbies: [...S.profile.hobbies],
      projects: S.profile.projects.map(p => ({ id: uid(), milestones: [], link: null, ...p })),
      photo: '',
    },
    settings: {
      startHour: 5, endHour: 23, sound: true, lastView: 'home', navCollapsed: false, scheduleSide: false, uiScale: 'auto',
      theme: 'day', soundStyle: 'fantasy', volume: 70, anim: true, reminders: true, remindMin: 5,
      leather: 'brown', accent: 'terracotta', bg: 'leaves', bgImage: '', moodPalette: 'pastel', cursor: true, seasons: true,
      music: 'sometimes', musicVol: 50, musicSource: 'mix', focusMin: 25, focusAct: '', closeToTray: true,
      folds: {}, pagesSeen: {}, quotesTab: 'reflections', lastExport: '',
    },
    schedule: { activities: defaultActivities(), blocks: [], log: {} },
    habits: { list: S.habits.map(([name, icon, color]) => ({ id: uid(), name, icon: toCategory(icon), color, days: [...ALL_WEEKDAYS] })), log: {} },
    workout: {
      days: S.rutina.map(d => ({ focus: d.focus, color: d.color, exercises: d.exercises.map(([name, sets, reps]) => ({ name, sets, reps })) })),
      notes: S.rutinaNotes,
      log: {},
    },
    university: { // the seed's tasks become deliverables in normalizeUniversity
      tasks: S.uniTasks.map(([name, status]) => ({ id: uid(), name, status })),
      events: S.uniEvents.map(([name, date]) => ({ id: uid(), name, date, kind: 'exam' })),
    },
    books: S.books.map(([title, kind, done, pages]) => ({
      id: uid(), title, type: kind === 'N' ? 'lightNovel' : 'book', done: !!done, pages: pages || null, progress: 0, note: '', rating: 0,
    })),
    movies: S.movies.map(([title, done]) => ({ id: uid(), title, done: !!done })),
    birthdays: S.birthdays.map(([name, day, month]) => ({ id: uid(), name, day, month })),
    journal: {}, chronicles: {}, focusLog: {}, frozenDays: [],
    lists: [
      { id: uid(), name: t('seed.lists.todo'), kind: 'todo', icon: 'cat-writing', color: '#cfe3a0', items: [] },
      { id: uid(), name: t('seed.lists.shopping'), kind: 'shopping', icon: 'cat-shopping', color: '#f6d38a', items: [] },
    ],
    listStats: { done: 0 }, pins: [], pinsOpen: true, notes: [],
    workflow: { tools: [], jobs: [], usage: {}, projects: [] },
    shop: {
      rewards: DEFAULT_REWARDS.map(r => ({ id: uid(), name: t(`seed.rewards.${r.key}`), cost: r.cost, icon: r.icon })),
      spent: 0, shields: 0, history: [],
    },
    reminders: { day: '', sent: [], log: [], seen: 0 }, celebrated: {}, challenges: {}, xpReform: null,
    sanctuary: normalizeSanctuary(null), pet: normalizePet(null),
    dailyQuests: {}, skillSeen: {}, practice: {}, stickers: [], gratitude: [], capsules: [],
    reflections: { es: quoteItems(S.reflexiones.es), en: quoteItems(S.reflexiones.en) },
    vehemence: { es: quoteItems(S.vehemencia.es), en: quoteItems(S.vehemencia.en) },
    achievements: {},
    seenHelp: false,
  };
}

// ---------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------
/** Keeps the valid objects of a list (mapped by fn); returns `fallback` when it is not a list. */
function normalizeList(list, fallback, fn) {
  return Array.isArray(list) ? list.filter(isPlainObject).map(fn).filter(Boolean) : fallback;
}
const normalizeQuote = q => (q.text ? { id: clipText(q.id, 40) || uid(), text: clipText(q.text, 3000), fav: !!q.fav } : null);
const normalizeQuotes = (value, fallback) => ({
  es: normalizeList(value && value.es, fallback.es, normalizeQuote),
  en: normalizeList(value && value.en, fallback.en, normalizeQuote),
});
/** Objects keyed by date (YYYY-MM-DD → value): drops odd keys and empty values. */
function normalizeDated(byDate, fn, allowArray = false) {
  const result = {};
  if (!isPlainObject(byDate)) return result;
  for (const key in byDate) {
    if (!isDateKey(key)) continue;
    const value = byDate[key];
    if (!(isPlainObject(value) || (allowArray && Array.isArray(value)))) continue;
    const normalized = fn(value);
    if (normalized && !(Array.isArray(normalized) && !normalized.length)) result[key] = normalized;
  }
  return result;
}
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const isImageDataUrl = (value, maxLength) => typeof value === 'string' && value.startsWith('data:image/') && value.length < maxLength;

// ---------------------------------------------------------
// Normalization by area
// ---------------------------------------------------------
// Section ids that live inside another section (Reflections and Vehemence are tabs of Quotes)
const MERGED_SECTIONS = { reflections: 'quotes', vehemence: 'quotes' };
function normalizeSettings(raw, seed) {
  const s = { ...seed.settings, ...(isPlainObject(raw) ? raw : {}) };
  s.startHour = clampNumber(parseInt(s.startHour, 10) || 0, 0, 12);
  s.endHour = Math.max(s.startHour + 4, Math.min(24, parseInt(s.endHour, 10) || 24));
  s.sound = s.sound !== false;
  if (MERGED_SECTIONS[s.lastView]) s.lastView = MERGED_SECTIONS[s.lastView];
  s.lastView = SECTIONS.some(x => x.id === s.lastView) ? s.lastView : 'home';
  delete s.playerName;
  s.navCollapsed = !!s.navCollapsed;
  s.scheduleSide = !!s.scheduleSide;
  s.uiScale = UI_SCALES.includes(+s.uiScale) ? +s.uiScale : 'auto';
  s.theme = oneOf(s.theme, ['day', 'night', 'auto'], 'day');
  s.soundStyle = s.soundStyle === '8bit' ? '8bit' : 'fantasy';
  s.volume = clampNumber(Number.isFinite(+s.volume) ? +s.volume : 70, 0, 100);
  s.anim = s.anim !== false;
  s.reminders = s.reminders !== false;
  s.closeToTray = s.closeToTray !== false;
  s.morning = s.morning !== false;       // morning summary
  s.habitNudge = s.habitNudge !== false; // pending-habits reminder at night
  s.remindMin = [0, 5, 10, 15].includes(+s.remindMin) ? +s.remindMin : 5;
  s.leather = oneOf(s.leather, ['brown', 'wine', 'forest', 'night', 'ebony'], 'brown');
  s.accent = oneOf(s.accent, ['terracotta', 'gold', 'emerald', 'sapphire', 'amethyst'], 'terracotta');
  s.bg = oneOf(s.bg, ['leaves', 'plain', 'image'], 'leaves');
  s.bgImage = isImageDataUrl(s.bgImage, 4e6) ? s.bgImage : '';
  s.moodPalette = oneOf(s.moodPalette, ['pastel', 'vivid', 'earth'], 'pastel');
  s.cursor = s.cursor !== false;
  s.seasons = s.seasons !== false;
  s.festivals = s.festivals !== false;
  const weather = isPlainObject(s.weather) ? s.weather : {};
  s.weather = Number.isFinite(+weather.lat) && Number.isFinite(+weather.lon) && weather.lat !== null
    ? { city: clipText(weather.city, 60), lat: +weather.lat, lon: +weather.lon } : { city: '', lat: null, lon: null };
  s.music = oneOf(s.music, ['off', 'sometimes', 'often'], 'sometimes');
  s.musicVol = clampNumber(Number.isFinite(+s.musicVol) ? +s.musicVol : 50, 0, 100);
  s.focusMin = clampNumber(Math.round(+s.focusMin) || 25, 1, 240); // focus length chosen by the player
  s.musicSource = oneOf(s.musicSource, ['mix', 'mine', 'app'], 'mix');
  s.focusAct = typeof s.focusAct === 'string' ? s.focusAct.slice(0, 40) : '';
  s.folds = isPlainObject(s.folds) // which folds are open (views/shared.js), e.g. { 'home.goals': true }
    ? Object.fromEntries(Object.entries(s.folds).filter(([id, open]) => /^[a-z]+\.[a-zA-Z]+$/.test(id) && typeof open === 'boolean').slice(0, 40)) : {};
  s.pagesSeen = isPlainObject(s.pagesSeen) // how far each paged list was read (views/shared.js), e.g. { quotes: 27 }
    ? Object.fromEntries(Object.entries(s.pagesSeen).filter(([key, count]) => key.length <= 60 && Number.isInteger(count) && count > 0).slice(-150)) : {};
  const hidden = Array.isArray(s.hiddenSecs) ? s.hiddenSecs : [];
  // Quotes stays hidden only if both of its tabs were hidden as sections
  const quotesHidden = hidden.includes('quotes') || (hidden.includes('reflections') && hidden.includes('vehemence'));
  s.hiddenSecs = [...hidden.filter(id => !MERGED_SECTIONS[id] && id !== 'quotes'), ...(quotesHidden ? ['quotes'] : [])]
    .filter(id => id !== 'home' && SECTIONS.some(x => x.id === id)); // sections hidden from the menu (Home is always shown)
  s.quotesTab = oneOf(s.quotesTab, ['reflections', 'vehemence'], 'reflections');
  s.lastExport = isDateKey(s.lastExport) ? s.lastExport : ''; // last copy exported by the player (a monthly reminder asks for one)
  return s;
}

function normalizeProfile(raw, seed) {
  const p = isPlainObject(raw) ? raw : {};
  const normalizeGoal = goal => (goal.name ? {
    id: clipText(goal.id, 40) || uid(), name: clipText(goal.name, 60), note: clipText(goal.note, 300), done: !!goal.done, auto: !!goal.auto,
    size: GOAL_SIZES.some(z => z.key === goal.size) ? goal.size : 'medium',
    milestones: normalizeList(goal.milestones, [], m => (m.name ? { id: clipText(m.id, 40) || uid(), name: clipText(m.name, 80), done: !!m.done } : null)),
    link: isPlainObject(goal.link) && ['act', 'book', 'habit'].includes(goal.link.kind) && goal.link.id && +goal.link.target > 0
      ? { kind: goal.link.kind, id: clipText(goal.link.id, 40), target: Math.round(+goal.link.target) } : null,
  } : null);
  return {
    name: clipText(p.name || seed.profile.name, 24),
    motto: clipText(p.motto ?? seed.profile.motto, 140),
    hobbies: Array.isArray(p.hobbies) ? p.hobbies.map(h => clipText(h, 30)).filter(Boolean) : seed.profile.hobbies,
    projects: normalizeList(p.projects, seed.profile.projects, normalizeGoal),
    photo: isImageDataUrl(p.photo, 3e6) ? p.photo : '',
    birthday: isDateKey(p.birthday) ? p.birthday : '',
  };
}

/** Weekdays a habit is due on (Monday = 0). Missing or empty means every day. */
function normalizeWeekdays(days) {
  const list = Array.isArray(days) ? [...new Set(days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
  return list.length ? list.sort((a, b) => a - b) : [...ALL_WEEKDAYS];
}
function normalizeHabits(raw, seed) {
  const h = isPlainObject(raw) ? raw : {};
  const habits = {
    list: normalizeList(h.list, seed.habits.list, habit => (habit.name ? {
      id: clipText(habit.id, 40) || uid(), name: clipText(habit.name, 30), icon: toCategory(habit.icon),
      color: isValidColor(habit.color) ? habit.color : colorFor(habit.name), days: normalizeWeekdays(habit.days),
    } : null)),
    log: isPlainObject(h.log) ? h.log : {},
  };
  for (const day in habits.log) if (!Array.isArray(habits.log[day])) delete habits.log[day];
  return habits;
}

function normalizeWorkout(raw, seed) {
  const r = isPlainObject(raw) ? raw : {};
  const normalizeDays = (list, fallback) => (Array.isArray(list) && list.length === 7
    ? list.map((day, i) => ({
      focus: clipText(isPlainObject(day) ? day.focus : '', 40),
      color: isPlainObject(day) && isValidColor(day.color) ? day.color : seed.workout.days[i].color,
      exercises: normalizeList(isPlainObject(day) ? day.exercises : null, [], e => (e.name
        ? { name: clipText(e.name, 60), sets: clipText(e.sets, 10), reps: clipText(e.reps, 20), kg: clipText(e.kg, 12) } : null)),
    }))
    : fallback);
  return {
    days: normalizeDays(r.days, seed.workout.days),
    notes: clipText(r.notes ?? seed.workout.notes, 8000),
    log: isPlainObject(r.log) ? r.log : {},
    plan: r.plan === 'dumbbells' ? r.plan : '',
    prev: normalizeDays(r.prev, null), // the routine from before the plan was applied
  };
}

/** University: deliverables. Board tasks of an earlier save (tareas / proyectos / listo) become deliverables
 *  without a date; the ones in "listo" are delivered, so they keep their XP (task or project). */
function normalizeUniversity(raw, seed) {
  const u = isPlainObject(raw) ? raw : {};
  const fromTasks = normalizeList(u.tasks, [], task => (task.name ? {
    id: clipText(task.id, 40) || uid(), name: task.name, date: '', act: '',
    kind: (typeof task.big === 'boolean' ? task.big : task.status === 'proyectos') ? 'project' : 'task',
    done: task.status === 'listo', doneAt: task.status === 'listo' ? todayISO() : '',
  } : null));
  const events = Array.isArray(u.events) ? u.events : seed.university.events;
  return {
    events: normalizeList([...events, ...fromTasks], [], e => (e.name && (isDateKey(e.date) || !e.date) ? {
      id: clipText(e.id, 40) || uid(), name: clipText(e.name, 80), date: isDateKey(e.date) ? e.date : '',
      kind: oneOf(e.kind, ['task', 'exam', 'quiz', 'project', 'presentation'], +e.hp > 0 ? 'exam' : 'task'),
      hp: isValidBossHp(+e.hp) && isDateKey(e.date) ? +e.hp : 0, act: clipText(e.act, 40),
      from: isDateKey(e.from) ? e.from : todayISO(), won: isDateKey(e.won) ? e.won : '',
      // A deadline without "done" whose date passed counts as delivered, so it does not show as overdue
      done: 'done' in e ? !!e.done : isDateKey(e.date) && e.date < todayISO(),
      doneAt: isDateKey(e.doneAt) ? e.doneAt : (!('done' in e) && isDateKey(e.date) && e.date < todayISO() ? e.date : ''),
    } : null)),
  };
}

const PACE_KEYS = ['slow', 'medium', 'fast'];
const normalizeTags = tags => (Array.isArray(tags) ? tags.map(x => clipText(x, 20)).slice(0, 8) : []);

function normalizeBook(b) {
  return b.title ? {
    id: clipText(b.id, 40) || uid(), title: clipText(b.title, 120),
    type: b.type === 'lightNovel' ? 'lightNovel' : 'book',
    done: !!b.done, pages: Number.isFinite(+b.pages) && +b.pages > 0 ? Math.round(+b.pages) : null,
    progress: Math.max(0, parseInt(b.progress, 10) || 0),
    note: clipText(b.note, 3000), rating: clampNumber(parseInt(b.rating, 10) || 0, 0, 5),
    cover: /^https:\/\/covers\.openlibrary\.org\//.test(b.cover) ? clipText(b.cover, 200) : '',
    author: clipText(b.author, 80),
    tags: normalizeTags(b.tags), pace: oneOf(b.pace, PACE_KEYS, ''),
    quotes: normalizeList(b.quotes, [], q => (isPlainObject(q) && q.text ? { id: clipText(q.id, 40) || uid(), text: clipText(q.text, 400), sent: !!q.sent } : null)),
    doneAt: isDateKey(b.doneAt) ? b.doneAt : '',
  } : null;
}
function normalizeMovie(m) {
  return m.title ? {
    id: clipText(m.id, 40) || uid(), title: clipText(m.title, 120), done: !!m.done,
    cover: /^https:\/\/([a-z0-9.-]+\.mzstatic\.com|upload\.wikimedia\.org|thumb\.wikimedia\.org)\//.test(m.cover) ? clipText(m.cover, 400) : '',
    rating: clampNumber(parseInt(m.rating, 10) || 0, 0, 5),
    tags: normalizeTags(m.tags), pace: oneOf(m.pace, PACE_KEYS, ''),
    note: clipText(m.note, 2000), doneAt: isDateKey(m.doneAt) ? m.doneAt : '',
  } : null;
}
function normalizeBirthday(b) {
  if (!b.name) return null;
  const day = parseInt(b.day, 10), month = parseInt(b.month, 10);
  const valid = day >= 1 && day <= 31 && month >= 1 && month <= 12;
  return { id: clipText(b.id, 40) || uid(), name: clipText(b.name, 40), day: valid ? day : null, month: valid ? month : null };
}

function normalizeListEntry(list) {
  if (!list.name) return null;
  const kind = oneOf(list.kind, ['todo', 'shopping', 'subscriptions', 'budget', 'simple'], 'todo');
  return {
    id: clipText(list.id, 40) || uid(), name: clipText(list.name, 40), kind,
    icon: toCategory(list.icon, kind === 'shopping' ? 'cat-shopping' : 'cat-writing'),
    color: isValidColor(list.color) ? list.color : '#cfe3a0',
    items: normalizeList(list.items, [], item => (item.text ? {
      id: clipText(item.id, 40) || uid(), text: clipText(item.text, 120), done: !!item.done, qty: clipText(item.qty, 12),
      due: isDateKey(item.due) ? item.due : '', doneAt: clipText(item.doneAt, 10),
      rep: oneOf(item.rep, ['daily', 'weekly', 'monthly'], ''), next: clipText(item.next, 40),
      // Subscriptions and budgets: price per currency, billing cycle, link and note
      price: Number.isFinite(+item.price) && item.price !== null && item.price !== '' && +item.price >= 0 ? Math.round(+item.price * 100) / 100 : null,
      currency: clipText(item.currency, 4),
      cycle: oneOf(item.cycle, ['weekly', 'monthly', 'quarterly', 'yearly'], kind === 'subscriptions' ? 'monthly' : ''),
      link: /^https?:\/\//i.test(item.link) ? clipText(item.link, 300) : '',
      note: clipText(item.note, 300),
    } : null)),
  };
}

function normalizeNote(n) {
  return isPlainObject(n) && (n.title || n.body) ? {
    id: clipText(n.id, 40) || uid(), title: clipText(n.title, 80), body: clipText(n.body, 20000),
    color: isValidColor(n.color) ? n.color : '#fff3b0', created: clipText(n.created, 16), updated: clipText(n.updated || n.created, 16),
    stickers: Array.isArray(n.stickers) ? n.stickers.map(x => clipText(x, 40)).slice(0, 6) : [], poem: !!n.poem,
  } : null;
}

function normalizeShop(raw, fallback) {
  if (!isPlainObject(raw)) return fallback;
  return {
    rewards: normalizeList(raw.rewards, fallback.rewards, r => (r.name ? {
      id: clipText(r.id, 40) || uid(), name: clipText(r.name, 60),
      cost: clampNumber(parseInt(r.cost, 10) || 1, 1, 99999), icon: toCategory(r.icon, 'cat-games'),
    } : null)),
    spent: Math.max(0, parseInt(raw.spent, 10) || 0),
    shields: clampNumber(parseInt(raw.shields, 10) || 0, 0, SHIELD_MAX),
    history: Array.isArray(raw.history) ? raw.history.filter(isPlainObject).map(h => ({
      name: clipText(h.name, 60), cost: Math.max(0, parseInt(h.cost, 10) || 0), date: clipText(h.date, 10),
    })).slice(-200) : [],
  };
}

// Festival ids in Spanish ("fest:navidad:2026") → English, so a festival is not greeted twice
const SPANISH_FESTIVAL_IDS = { cumple: 'birthday', brujas: 'halloween', navidad: 'christmas', anionuevo: 'newYear', amistad: 'friendship' };
function normalizeCelebrated(celebrated) {
  if (!isPlainObject(celebrated)) return {};
  return Object.fromEntries(Object.entries(celebrated).map(([key, value]) =>
    [key.replace(/^fest:([a-z]+):/, (match, id) => `fest:${SPANISH_FESTIVAL_IDS[id] || id}:`), value]));
}
/** Spirit beast: name, accessories owned and worn, and the last growth stage celebrated. */
function normalizePet(raw) {
  const p = isPlainObject(raw) ? raw : {};
  const known = ['flower', 'scarf', 'glasses', 'hat', 'crown'];
  const worn = isPlainObject(p.acc) ? p.acc : {};
  const owned = Array.isArray(p.owned) ? p.owned.filter(k => known.includes(k)) : [];
  const slot = (key, allowed) => (allowed.includes(worn[key]) && owned.includes(worn[key]) ? worn[key] : '');
  return {
    name: clipText(p.name, 16) || 'Jade', owned,
    acc: { head: slot('head', ['flower', 'hat', 'crown']), face: slot('face', ['glasses']), neck: slot('neck', ['scarf']) },
    seen: Number.isInteger(p.seen) ? clampNumber(p.seen, 0, 3) : null,
  };
}

/** Sanctuary: widgets with their position (% of the window), and the rain, fire and metronome settings. */
function normalizeSanctuary(raw) {
  const r = isPlainObject(raw) ? raw : {};
  const number = (value, min, max, fallback) => (Number.isFinite(+value) && value !== null && value !== '' ? clampNumber(+value, min, max) : fallback);
  const types = ['note', 'focus', 'clock', 'sound', 'todo', 'quote', 'music', 'pet', 'metro', 'sticker'];
  const metronome = isPlainObject(r.metro) ? r.metro : null;
  return {
    widgets: Array.isArray(r.widgets)
      ? r.widgets.filter(w => isPlainObject(w) && types.includes(w.type) && (!['note', 'sticker'].includes(w.type) || w.ref)).slice(0, 30)
        .map(w => ({
          id: clipText(w.id, 40) || uid(), type: w.type, x: number(w.x, -20, 98, 10), y: number(w.y, 0, 96, 10),
          ...(w.type === 'note' ? { ref: clipText(w.ref, 40), w: number(w.w, 160, 1200, 250), h: number(w.h, 120, 1000, 230) } : {}),
          ...(w.type === 'sticker' ? { ref: clipText(w.ref, 40) } : {}),
        }))
      : [],
    hide: !!r.hide, rain: number(r.rain, 0, 100, 0), fire: number(r.fire, 0, 100, 0),
    metro: {
      bpm: number(metronome ? metronome.bpm : null, 40, 208, 80),
      beats: [2, 3, 4, 6].includes(metronome && +metronome.beats) ? +metronome.beats : 4,
      habit: metronome ? clipText(metronome.habit, 40) : '',
    },
  };
}

/** Workflow (views/workflow.js): apps with their usage guide, jobs (own ones or a University deliverable),
 *  project threads. `roles`, `activityIds` and `usage` are kept as they are: nothing shows or writes them. */
function normalizeWorkflow(raw) {
  const w = isPlainObject(raw) ? raw : {};
  const ids = list => (Array.isArray(list) ? list.map(x => clipText(x, 40)).filter(Boolean).slice(0, 20) : []);
  const projects = normalizeList(w.projects, [], project => (project.name ? {
    id: clipText(project.id, 40) || uid(), name: clipText(project.name, 30),
    color: isValidColor(project.color) ? project.color : colorFor(project.name),
  } : null)).slice(0, 30);
  const projectIds = new Set(projects.map(x => x.id));
  return {
    tools: normalizeList(w.tools, [], tool => {
      if (!tool.name) return null;
      const roles = Array.isArray(tool.roles) ? tool.roles.map(x => clipText(x, 20)).filter(Boolean).slice(0, 6) : [];
      return {
        id: clipText(tool.id, 40) || uid(), name: clipText(tool.name, 40), icon: toCategory(tool.icon, 'cat-code'),
        color: isValidColor(tool.color) ? tool.color : colorFor(tool.name),
        roles, subscriptionId: clipText(tool.subscriptionId, 40), activityIds: ids(tool.activityIds),
        // How the app is used, one point each; a save without a guide starts from its roles
        guide: (Array.isArray(tool.guide) ? tool.guide : roles).map(x => clipText(x, 60)).filter(Boolean).slice(0, 12),
        created: isDateKey(tool.created) ? tool.created : '',
      };
    }).slice(0, 40),
    jobs: normalizeList(w.jobs, [], job => {
      const eventId = clipText(job.eventId, 40);
      if (!job.name && !eventId) return null;
      return {
        id: clipText(job.id, 40) || uid(), name: clipText(job.name, 80), toolId: clipText(job.toolId, 40),
        // A deliverable job takes its name, date and "done" from the deliverable (no data written twice)
        done: !eventId && !!job.done, doneAt: !eventId && isDateKey(job.doneAt) ? job.doneAt : '',
        projectId: projectIds.has(job.projectId) ? job.projectId : '', eventId,
      };
    }),
    usage: normalizeDated(w.usage, day => {
      const uses = Object.fromEntries(Object.entries(day).filter(([, n]) => Number.isInteger(n) && n > 0).map(([id, n]) => [clipText(id, 40), Math.min(n, 999)]));
      return Object.keys(uses).length ? uses : null;
    }),
    projects,
  };
}

/** Weekly challenges, stored by the Monday of each week: { 'YYYY-MM-DD': { list: [...], rerolls } } */
function normalizeChallenges(raw) {
  const result = {};
  if (!isPlainObject(raw)) return result;
  for (const [monday, week] of Object.entries(raw)) {
    if (!isDateKey(monday) || !isPlainObject(week) || !Array.isArray(week.list)) continue;
    result[monday] = {
      rerolls: Math.max(0, parseInt(week.rerolls, 10) || 0),
      list: week.list.filter(c => isPlainObject(c) && c.kind && c.target > 0).slice(0, 3).map(c => ({
        id: clipText(c.id, 40) || uid(), kind: clipText(c.kind, 20), diff: clampNumber(parseInt(c.diff, 10) || 0, 0, 2),
        target: Math.round(+c.target), xp: Math.max(0, Math.round(+c.xp) || 0), done: !!c.done,
        ...(c.ref ? { ref: clipText(c.ref, 40) } : {}),
        ...(isDateKey(c.from) ? { from: c.from } : {}),
        ...(Number.isFinite(+c.base) && c.base != null ? { base: +c.base } : {}),
      })),
    };
  }
  return result;
}

// ---------------------------------------------------------
// normalize(): validates, clips and fills every field of a save
// ---------------------------------------------------------
function normalize(raw) {
  const seed = seedState();
  if (!isPlainObject(raw)) return seed;
  let s = (!raw.version || raw.version < 2) ? migrateV1(raw, seed) : raw; // core/migrations.js
  if (s.version < 3) s = migrateV2(s);
  return {
    version: 3,
    profile: normalizeProfile(s.profile, seed),
    settings: normalizeSettings(s.settings, seed),
    schedule: normalizeSchedule(isPlainObject(s.schedule) ? s.schedule : null, seed.schedule),
    habits: normalizeHabits(s.habits, seed),
    workout: normalizeWorkout(s.workout, seed),
    university: normalizeUniversity(s.university, seed),
    books: normalizeList(s.books, seed.books, normalizeBook),
    movies: normalizeList(s.movies, seed.movies, normalizeMovie),
    birthdays: normalizeList(s.birthdays, seed.birthdays, normalizeBirthday),
    reflections: normalizeQuotes(s.reflections, seed.reflections),
    vehemence: normalizeQuotes(s.vehemence, seed.vehemence),
    achievements: isPlainObject(s.achievements) ? s.achievements : {},
    celebrated: normalizeCelebrated(s.celebrated),
    lists: normalizeList(s.lists, seed.lists, normalizeListEntry),
    listStats: { done: Math.max(0, parseInt(isPlainObject(s.listStats) ? s.listStats.done : 0, 10) || 0) },
    gratitude: normalizeList(s.gratitude, [], g => (isPlainObject(g) && g.text && isDateKey(g.d)
      ? { id: clipText(g.id, 40) || uid(), d: g.d, text: clipText(g.text, 140), c: Math.max(0, parseInt(g.c, 10) || 0) % 8 } : null)),
    capsules: normalizeList(s.capsules, [], c => (isPlainObject(c) && c.text && isDateKey(c.open) ? {
      id: clipText(c.id, 40) || uid(), text: clipText(c.text, 4000), created: isDateKey(c.created) ? c.created : todayISO(),
      open: c.open, opened: !!c.opened, notified: !!c.notified,
    } : null)),
    dailyQuests: normalizeDated(s.dailyQuests, q => (isPlainObject(q) && Number.isInteger(q.i) ? { i: q.i, done: !!q.done, rr: !!q.rr } : null)),
    skillSeen: isPlainObject(s.skillSeen)
      ? Object.fromEntries(Object.entries(s.skillSeen).filter(([, v]) => Number.isInteger(v)).map(([k, v]) => [clipText(k, 40), v])) : {},
    practice: isPlainObject(s.practice)
      ? Object.fromEntries(Object.entries(s.practice).filter(([, v]) => +v > 0).map(([k, v]) => [clipText(k, 40), Math.round(+v)])) : {},
    pins: Array.isArray(s.pins)
      ? s.pins.filter(x => isPlainObject(x) && ['li', 'ms', 'nt'].includes(x.k) && x.a && x.b)
        .map(x => ({ k: x.k, a: clipText(x.a, 40), b: clipText(x.b, 40) })).slice(0, 12)
      : [],
    pinsOpen: s.pinsOpen !== false,
    notes: normalizeList(s.notes, [], normalizeNote),
    workflow: normalizeWorkflow(s.workflow),
    stickers: normalizeList(s.stickers, [], k => (isPlainObject(k) && /^[.0-9a-f]{256}$/.test(k.px)
      ? { id: clipText(k.id, 40) || uid(), name: clipText(k.name, 24) || 'Sticker', px: k.px } : null)),
    journal: normalizeDated(s.journal, entry => {
      const mood = clampNumber(parseInt(entry.mood, 10) || 0, 0, 5), text = clipText(entry.text, 2000);
      return mood || text ? { mood, text } : null;
    }),
    chronicles: normalizeDated(s.chronicles, c => (c.good || c.improve || c.focus
      ? { good: clipText(c.good, 1000), improve: clipText(c.improve, 1000), focus: clipText(c.focus, 1000) } : null)),
    focusLog: normalizeDated(s.focusLog, sessions => (Array.isArray(sessions)
      ? sessions.filter(isPlainObject).map(x => ({ act: clipText(x.act, 40), min: clampNumber(parseInt(x.min, 10) || 1, 1, 240), ...(x.part ? { part: true } : {}) })) : null), true),
    frozenDays: Array.isArray(s.frozenDays) ? s.frozenDays.filter(isDateKey) : [],
    shop: normalizeShop(s.shop, seed.shop),
    reminders: isPlainObject(s.reminders) && Array.isArray(s.reminders.sent) ? {
      day: clipText(s.reminders.day, 10), sent: s.reminders.sent.map(x => clipText(x, 80)).slice(-200),
      log: normalizeList(s.reminders.log, [], n => (n.title ? { key: clipText(n.key, 80), title: clipText(n.title, 80), message: clipText(n.message, 160), time: clipText(n.time, 5) } : null)).slice(-50),
      seen: Math.max(0, parseInt(s.reminders.seen, 10) || 0),
    } : { day: '', sent: [], log: [], seen: 0 },
    seenHelp: !!s.seenHelp,
    setupDone: s.setupDone !== false, // new profile: the setup wizard is still pending
    seenNews: clipText(s.seenNews, 20),
    challenges: normalizeChallenges(s.challenges),
    sanctuary: normalizeSanctuary(s.sanctuary),
    pet: normalizePet(s.pet),
    xpReform: isPlainObject(s.xpReform) && Number.isFinite(+s.xpReform.adjust)
      ? { date: clipText(s.xpReform.date, 10), base: Math.max(0, +s.xpReform.base || 0), adjust: Math.round(+s.xpReform.adjust) } : null,
  };
}
