/* Brings saves in earlier formats up to the current one before normalize() checks them. Data is only renamed or
   moved: nothing is dropped and the XP never changes. */
'use strict';

// ---------------------------------------------------------
// Version 1 → 2
// ---------------------------------------------------------
const migrateColor = color => {
  const index = LEGACY_COLORS.indexOf(String(color || '').toLowerCase());
  return index >= 0 ? PASTELS[index] : color;
};
function migrateV1(old, seed) {
  const playerName = old.settings && old.settings.playerName;
  return {
    ...seed,
    profile: { ...seed.profile, name: playerName && playerName !== 'Jugador' ? playerName : seed.profile.name },
    settings: { ...seed.settings, ...(old.settings || {}) },
    schedule: {
      activities: (old.activities || []).map(a => ({ ...a, color: migrateColor(a.color) })),
      blocks: old.blocks || [],
      log: old.log || {},
    },
    achievements: old.achievements || {},
    seenHelp: false,
  };
}

// ---------------------------------------------------------
// Version 2 → 3: Spanish keys and saved values → English
// ---------------------------------------------------------
const V2_STATE_KEYS = {
  horario: 'schedule', rutina: 'workout', uni: 'university', reflexiones: 'reflections', vehemencia: 'vehemence',
  retos: 'challenges', refugio: 'sanctuary', sideQuests: 'dailyQuests',
};
const V2_SETTINGS_KEYS = { horarioSide: 'scheduleSide' };
// Saved values: Spanish value → English value (anything not listed stays as it is)
const V2_SECTION_IDS = {
  inicio: 'home', horario: 'schedule', calendario: 'calendar', listas: 'lists', notas: 'notes', habitos: 'habits',
  rutina: 'workout', universidad: 'university', libros: 'books', peliculas: 'movies', cumpleanos: 'birthdays',
  reflexiones: 'reflections', vehemencia: 'vehemence',
};
// Icon keys stored in activities, habits, lists and shop rewards
const V2_CATEGORY_ICONS = {
  'cat-estudio': 'cat-study', 'cat-matematicas': 'cat-math', 'cat-ciencia': 'cat-science', 'cat-codigo': 'cat-code',
  'cat-idiomas': 'cat-languages', 'cat-escritura': 'cat-writing', 'cat-arte': 'cat-art', 'cat-musica': 'cat-music',
  'cat-fuerza': 'cat-strength', 'cat-meditacion': 'cat-meditation', 'cat-salud': 'cat-health', 'cat-comida': 'cat-food',
  'cat-bebida': 'cat-drink', 'cat-agua': 'cat-water', 'cat-descanso': 'cat-rest', 'cat-juegos': 'cat-games',
  'cat-hogar': 'cat-home', 'cat-trabajo': 'cat-work', 'cat-compras': 'cat-shopping',
};
const V2_PET_ACCESSORIES = { flor: 'flower', bufanda: 'scarf', gafas: 'glasses', gorro: 'hat', corona: 'crown' };
const V2_VALUES = {
  activityType: { materia: 'subject' },
  bookType: { Libro: 'book', 'Novela ligera': 'lightNovel' },
  workoutPlan: { mancuernas: 'dumbbells' },
  listKind: { pendientes: 'todo', compras: 'shopping' },
  repeat: { dia: 'daily', semana: 'weekly', mes: 'monthly' },
  pace: { lento: 'slow', medio: 'medium', rapido: 'fast' },
  tag: { 'Épico': 'epic', Emotivo: 'moving', Divertido: 'funny', Oscuro: 'dark', Inspirador: 'inspiring', Relajante: 'relaxing', Intrigante: 'intriguing' },
  goalSize: { corta: 'short', media: 'medium', larga: 'long', epica: 'epic' },
  challengeKind: {
    habitos: 'habits', habito: 'habit', rutina: 'workout', horario: 'schedule', perfectos: 'perfectDays',
    bitacora: 'journal', enfoque: 'focus', lectura: 'reading', pendientes: 'todos',
  },
  settings: {
    soundStyle: { fantasia: 'fantasy' },
    leather: { cafe: 'brown', vino: 'wine', bosque: 'forest', noche: 'night', ebano: 'ebony' },
    accent: { terracota: 'terracotta', oro: 'gold', esmeralda: 'emerald', zafiro: 'sapphire', amatista: 'amethyst' },
    bg: { hojas: 'leaves', liso: 'plain', imagen: 'image' },
    moodPalette: { vivos: 'vivid', tierra: 'earth' },
    music: { aveces: 'sometimes', seguido: 'often' },
    musicSource: { mezcla: 'mix', mia: 'mine' },
  },
};
const mapValue = (map, value) => (typeof value === 'string' && Object.prototype.hasOwnProperty.call(map, value) ? map[value] : value);
/** Maps the plain objects of a list (anything else is left for normalize() to drop). */
const mapObjects = (list, fn) => (Array.isArray(list) ? list.map(x => (isPlainObject(x) ? fn(x) : x)) : list);
/** Maps the values of an object keyed by date or id. */
const mapEntries = (object, fn) => (isPlainObject(object) ? Object.fromEntries(Object.entries(object).map(([key, value]) => [key, fn(value, key)])) : object);

function migrateValuesV2(s) {
  const V = V2_VALUES;
  if (isPlainObject(s.settings)) {
    s.settings = { ...s.settings };
    for (const [key, map] of Object.entries(V.settings)) s.settings[key] = mapValue(map, s.settings[key]);
    s.settings.lastView = mapValue(V2_SECTION_IDS, s.settings.lastView);
    if (Array.isArray(s.settings.hiddenSecs)) s.settings.hiddenSecs = s.settings.hiddenSecs.map(id => mapValue(V2_SECTION_IDS, id));
  }
  if (isPlainObject(s.schedule)) {
    s.schedule = {
      ...s.schedule,
      activities: mapObjects(s.schedule.activities, a => ({ ...a, type: mapValue(V.activityType, a.type) })),
      log: mapEntries(s.schedule.log, day => mapEntries(day, entry => (isPlainObject(entry) ? { ...entry, t: mapValue(V.activityType, entry.t) } : entry))),
    };
  }
  if (isPlainObject(s.workout)) s.workout = { ...s.workout, plan: mapValue(V.workoutPlan, s.workout.plan) };
  const media = item => ({ ...item, pace: mapValue(V.pace, item.pace), tags: Array.isArray(item.tags) ? item.tags.map(tag => mapValue(V.tag, tag)) : item.tags });
  s.books = mapObjects(s.books, book => ({ ...media(book), type: mapValue(V.bookType, book.type) }));
  s.movies = mapObjects(s.movies, media);
  s.lists = mapObjects(s.lists, list => ({ ...list, kind: mapValue(V.listKind, list.kind), items: mapObjects(list.items, item => ({ ...item, rep: mapValue(V.repeat, item.rep) })) }));
  if (isPlainObject(s.profile)) s.profile = { ...s.profile, projects: mapObjects(s.profile.projects, goal => ({ ...goal, size: mapValue(V.goalSize, goal.size) })) };
  s.challenges = mapEntries(s.challenges, week => (isPlainObject(week) ? { ...week, list: mapObjects(week.list, c => ({ ...c, kind: mapValue(V.challengeKind, c.kind) })) } : week));
  // Icons of activities, habits, lists and rewards; the spirit beast's accessories
  const icon = item => ({ ...item, icon: mapValue(V2_CATEGORY_ICONS, item.icon) });
  if (isPlainObject(s.schedule)) s.schedule = { ...s.schedule, activities: mapObjects(s.schedule.activities, icon) };
  if (isPlainObject(s.habits)) s.habits = { ...s.habits, list: mapObjects(s.habits.list, icon) };
  s.lists = mapObjects(s.lists, icon);
  if (isPlainObject(s.shop)) s.shop = { ...s.shop, rewards: mapObjects(s.shop.rewards, icon) };
  if (isPlainObject(s.pet)) {
    s.pet = { ...s.pet };
    if (Array.isArray(s.pet.owned)) s.pet.owned = s.pet.owned.map(id => mapValue(V2_PET_ACCESSORIES, id));
    if (isPlainObject(s.pet.acc)) s.pet.acc = mapEntries(s.pet.acc, id => mapValue(V2_PET_ACCESSORIES, id));
  }
  // Streak milestones already celebrated: "racha3" → "streak3"
  if (isPlainObject(s.celebrated)) s.celebrated = Object.fromEntries(Object.entries(s.celebrated).map(([key, value]) => [key.replace(/^racha(\d+)$/, 'streak$1'), value]));
  return s;
}

/** A copy of `object` with its keys renamed (if both names exist, the new one wins). */
function renameKeys(object, names) {
  const result = { ...object };
  for (const [from, to] of Object.entries(names)) {
    if (!(from in result)) continue;
    if (!(to in result)) result[to] = result[from];
    delete result[from];
  }
  return result;
}

function migrateV2(old) {
  const s = renameKeys(old, V2_STATE_KEYS);
  if (isPlainObject(s.settings)) s.settings = renameKeys(s.settings, V2_SETTINGS_KEYS);
  migrateValuesV2(s);
  s.version = 3;
  return s;
}
