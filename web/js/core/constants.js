/* Constants: storage keys, palettes, game rules (XP, stones, shields) and the book sections. */
'use strict';

const APP_NAME = 'Questleaf';
const STORAGE_KEY = 'questleaf.save';
const MAIN_PROFILE = 'main'; // the usual profile
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]; // Monday = 0 (weekdayIndex)

// Pastel palette (12 colors) and the palette of version-1 saves, to convert their colors
const PASTELS = ['#f7a8a8', '#f6b98a', '#f6d38a', '#f3e7a1', '#cfe3a0', '#a8d8a0',
                 '#9fd9c9', '#a9cbe8', '#b8b4ec', '#d9b3e6', '#efb3d0', '#d8cbb8'];
const LEGACY_COLORS = ['#ff5c8a', '#ff7a4d', '#ffb547', '#ffe066', '#b8f35d', '#5cf28a',
                       '#3ee8d9', '#4da3ff', '#9b7bff', '#ff7ae0', '#c9b8ff', '#d6dcf5'];

// ---------------------------------------------------------
// Game rules. XP rewards EFFORT: daily things (schedule, habits, workout,
// journal) give no XP; they feed the streak and the weekly challenges, which do.
// ---------------------------------------------------------
const XP = {
  movie: 10,
  todo: 5,                 // completed to-do
  chronicle: 40,           // weekly chronicle
  task: 30,                // university task…
  project: 120,            // …or project
  bookFinished: 25,        // bonus when a book is finished (plus its pages, see pagesXP)
  bookAssumedPages: 150,   // pages assumed for a finished book with no page count
  focusMinutesPerXp: 3,    // 1 XP every 3 minutes of focus
};
const CHALLENGE_XP = [40, 80, 150]; // weekly challenges: easy, medium, hard
// Goals by how long they take. Half the XP is split among the milestones, the other half arrives with the goal.
const GOAL_SIZES = [
  { key: 'short', xp: 60 }, { key: 'medium', xp: 200 }, { key: 'long', xp: 500 }, { key: 'epic', xp: 1000 },
];
// Earlier XP rules: a save that was scored with them keeps the XP it earned (see progress.js)
const LEGACY_XP_RULES = {
  habit: 10, workout: 50, book: 100, movie: 20, task: 40, project: 150,
  journal: 5, chronicle: 60, milestone: 20, focus: 15, todo: 5,
};
// Sample shop rewards for a new save. The name comes from the dictionary (seed.rewards.<key>).
const DEFAULT_REWARDS = [
  { key: 'gaming', cost: 40, icon: 'cat-games' },
  { key: 'takeout', cost: 90, icon: 'cat-food' },
  { key: 'afternoonOff', cost: 150, icon: 'cat-rest' },
];
const STONE_RATE = 5;               // 1 spirit stone every 5 XP
const SHIELD_COST = 60, SHIELD_MAX = 2;

// Interface sizes (window zoom); 'auto' picks one from the screen width
const UI_SCALES = [0.9, 1, 1.1, 1.25, 1.4, 1.6];

// ---------------------------------------------------------
// Book sections (menu ribbons). The label is read from the active language on every access.
// ---------------------------------------------------------
const defineSection = (id, icon, color) => ({ id, icon, color, get label() { return t(`sections.${id}`); } });
const SECTIONS = [
  defineSection('home', '🏠', '#f6d38a'),
  defineSection('schedule', '🗓️', '#a9cbe8'),
  defineSection('calendar', '📅', '#9fd9c9'),
  defineSection('lists', '📝', '#cfe3a0'),
  defineSection('notes', '📒', '#ffd9a8'),
  defineSection('habits', '🌱', '#a8d8a0'),
  defineSection('workout', '🏋️', '#f6b98a'),
  defineSection('university', '🎓', '#b8b4ec'),
  defineSection('books', '📚', '#e3c49f'),
  defineSection('movies', '🎬', '#f3e7a1'),
  defineSection('birthdays', '🎂', '#efb3d0'),
  defineSection('quotes', '💭', '#d9b3e6'), // Reflections and Vehemence, as two tabs
  defineSection('workflow', '🔀', '#a8d8c0'), // apps and subscriptions: do they pay off? Last, so the 1-0 keys stay the same
];
const isSectionVisible = id => !(state && state.settings.hiddenSecs.includes(id));
const visibleSections = () => SECTIONS.filter(s => isSectionVisible(s.id));
/** Every section has a fixed color, used by ribbons, cards, checkboxes and the backpack. */
const sectionColor = id => (SECTIONS.find(s => s.id === id) || { color: '#e3c49f' }).color;
